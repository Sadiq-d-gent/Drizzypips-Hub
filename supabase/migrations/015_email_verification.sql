-- 015_email_verification.sql
--
-- Phase 7: prove the student owns the email address before an enrollment is accepted.
--
-- Today anyone can submit an enrollment naming any address. The consequences are small but
-- real: a typo means the confirmation and the approval email go nowhere and the admin
-- fields the chase by hand, and a deliberate wrong address puts a stranger's inbox on a
-- payment record. Phase 7 adds a 6-digit code the student must enter before the wizard
-- will take their receipt, and 016 makes the database refuse a submission without it.
--
-- Nothing here trusts the browser, and that is the point
-- -----------------------------------------------------
-- The spec is explicit: do not trust a client-side `verified = true` flag, do not let
-- frontend state bypass verification, and make the enrollment submission itself check the
-- verification state server-side. So the React step in the wizard is a courtesy that tells
-- the student what is expected; the enforcement is has_verified_email() called from inside
-- create_enrollment() in 016. A caller who POSTs the RPC directly with a made-up email gets
-- EV002, exactly as if they had used the form.
--
-- The code is stored only as a digest
-- ----------------------------------
-- `code_hash bytea`, SHA-256 via extensions.digest, the same treatment 002 gives the
-- enrollment access token: "the token itself is never stored, so the database cannot
-- reconstruct a URL that grants access". Here it means a database dump, a log line or a
-- careless admin SELECT cannot yield a live code. The plaintext exists in exactly two
-- places: the local variable that renders the email, and the student's inbox. It passes
-- through email_outbox.payload on the way, which is the one unavoidable window: there is no
-- way to get a code into an email while keeping the database authoritative without it
-- existing somewhere the sender can read. The send-email Edge Function therefore redacts
-- payload on the same update that marks the row sent, so the window closes at delivery
-- rather than lasting as long as the row does.
--
-- A digest rather than bcrypt, deliberately. A 6-digit code has about 20 bits of entropy, so
-- a slow hash would buy nothing against anyone holding the table: they would simply try a
-- million digests. What actually bounds guessing is the 5-attempt cap and the 10-minute
-- expiry below, both enforced in the database. The hash is there so the stored value is not
-- itself the credential, not as a work factor.
--
-- Six digits rather than a long random string
-- ------------------------------------------
-- It is typed by hand, on a phone, from another app. 20 bits is weak in isolation and
-- adequate when an attacker gets five guesses inside ten minutes against an address they
-- must already know: about a 1-in-32,000 chance of landing it. The rate limit below makes
-- repeated fresh codes cost more than they yield.
--
-- The code is generated with gen_random_bytes, not random()
-- --------------------------------------------------------
-- random() is a seeded PRNG whose output is predictable from prior draws. 002 uses
-- gen_random_bytes for the access token for that reason and this follows it. Reducing a
-- 4-byte draw modulo a million is very slightly biased toward low values; the bias is under
-- one part in 4,000 and is irrelevant against a 5-guess cap, which is why this does not
-- carry the rejection-sampling loop a cryptographic key would need.
--
-- What "verified" means, and for how long
-- --------------------------------------
-- Successfully entering the code sets `verified_until = now() + 2 hours` and stamps
-- `consumed_at`. Two hours because the wizard's remaining steps are "make a bank transfer"
-- and "photograph the receipt", which realistically happen across a lunch break and not in
-- ninety seconds; and it is short enough that a shared or public machine does not leave a
-- usable verification behind for the next person. The window is a property of the address,
-- not of the browser session: nothing in the frontend can extend it.
--
-- Re-verification is not required per enrollment, only per window. A student enrolling in a
-- second course twenty minutes later is not asked again, which is what anyone would expect
-- and costs nothing, since the address is the thing being proven.
--
-- Rate limiting is per address and has two shapes
-- ----------------------------------------------
-- A 60-second cooldown between requests, so a "resend" button cannot be held down, and a
-- cap of 5 requests per hour per address, so this cannot be used to mail-bomb someone by
-- typing their address repeatedly. Both raise EV001, in the I-Z class PostgreSQL reserves
-- for user-defined conditions, following RL001 and PA001.
--
-- WHY verify_email_code RETURNS A STATUS INSTEAD OF RAISING
--
-- The rest of this schema signals failure with a custom SQLSTATE, and this function
-- deliberately does not, for a reason that is easy to get wrong: a RAISE aborts the
-- transaction, so any write made earlier in the same call is rolled back with it. An
-- attempt counter incremented and then raised over is an attempt counter that never
-- increments, and the 5-attempt cap would read as enforcement while being decorative. The
-- first draft of this file had exactly that bug.
--
-- So every outcome that must persist something returns instead: `status` is one of
-- 'verified', 'incorrect', 'expired', 'no_code', 'too_many_attempts'. Only malformed input
-- raises, because there is nothing to persist on that path.
--
-- This does not weaken anything. The security property is not "the RPC returns an error",
-- it is "has_verified_email() stays false until a correct code is entered", and that is a
-- function of what this code writes, not of how it reports. A frontend that ignored the
-- status field would show a confusing screen and then be refused by EV002 at submission,
-- which is the defence in depth the spec asks for rather than a hole.
--
-- Enumeration is not a concern here and the code does not pretend otherwise
-- -----------------------------------------------------------------------
-- request_email_verification() behaves identically for an address that has enrolled before
-- and one that has not, because it never looks at the enrollments table. There is nothing
-- to leak: this is not a login, and no account exists to discover. For the same reason
-- 'incorrect' is distinguished from 'no_code' rather than blurred, since the caller already
-- knows the address, having just typed it.
--
-- Who can see this table
-- ---------------------
-- Nobody but the definer functions and an admin. Rows carry an email address and the
-- verification state attached to it, and the spec says plainly that verification records
-- must not be publicly readable. RLS on, privileges revoked from anon and authenticated,
-- exactly as 002 treats enrollments and 014 treats the outbox. The admin SELECT policy is
-- there so a support question ("it says my code expired") is answerable; the digest is
-- useless to whoever reads it.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists public.email_verifications (
  id uuid primary key default gen_random_uuid(),

  -- Stored lowercased by every writer below, and compared lowercased by every reader, so
  -- "Student@Example.com" and "student@example.com" are one address rather than two
  -- independent verification states. 002's regex, verbatim.
  email text not null
    check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),

  -- SHA-256 of the 6-digit code. Never the code itself. See the header.
  code_hash bytea not null,

  expires_at timestamptz not null,

  attempts integer not null default 0
    check (attempts >= 0),

  -- Set the moment a code is accepted, expires, or is abandoned in favour of a newer one.
  -- A consumed row is not reusable: verify_email_code() only ever considers rows where this
  -- is null.
  consumed_at timestamptz,

  -- How long the successful verification is good for. Null unless the code was correct,
  -- which is what distinguishes "consumed because it worked" from "consumed because it was
  -- retired". has_verified_email() requires both.
  verified_until timestamptz,

  created_at timestamptz not null default now()
);

-- The three hot reads, one index each.
--
-- Latest outstanding code for an address, which is what verify_email_code() opens with:
create index if not exists email_verifications_pending_idx
  on public.email_verifications (email, created_at desc)
  where consumed_at is null;

-- Whether an address currently holds a live verification, which is has_verified_email()'s
-- entire question. Partial on consumed rows because an unconsumed row can never satisfy it.
create index if not exists email_verifications_verified_idx
  on public.email_verifications (email, verified_until desc)
  where consumed_at is not null;

-- The rate-limit window counts every request for an address regardless of outcome, so this
-- one is not partial.
create index if not exists email_verifications_email_created_idx
  on public.email_verifications (email, created_at desc);

comment on table public.email_verifications is
  'Email ownership proofs for the enrollment flow. Codes are stored only as SHA-256 '
  'digests, expire after 10 minutes, cap at 5 attempts, and cannot be reused once '
  'consumed. Not publicly readable: RLS is on and privileges are revoked from anon and '
  'authenticated. The enforcement point is has_verified_email(), called from '
  'create_enrollment().';

comment on column public.email_verifications.code_hash is
  'SHA-256 of the 6-digit code. The plaintext is never stored, so this table cannot yield '
  'a working code. Same treatment 002 gives enrollments.access_token_hash.';

comment on column public.email_verifications.verified_until is
  'How long this successful verification lets the address enroll. Null unless the code was '
  'entered correctly. Set on consumption, and not extendable from the frontend.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.email_verifications enable row level security;

-- Belt and braces, following 002:185-188 and 014. RLS denies by default; privileges are
-- revoked as well so a policy added later by mistake is still unreachable without a grant.
revoke all on public.email_verifications from anon;
revoke all on public.email_verifications from authenticated;

-- SELECT only, so the admin policy below has something to act on: privileges are checked
-- before policies, so without a grant the policy would never be consulted. Nothing in the
-- panel writes here, and an admin who could UPDATE could hand themselves a verified address.
grant select on public.email_verifications to authenticated;

drop policy if exists "Admins can read email verifications" on public.email_verifications;
create policy "Admins can read email verifications"
on public.email_verifications
for select
to authenticated
using (public.is_admin());

-- No policy of any kind for anon. The three functions below are SECURITY DEFINER and are
-- the only way a visitor's action ever touches this table.

-- ---------------------------------------------------------------------------
-- public.request_email_verification(text)
-- ---------------------------------------------------------------------------
--
-- Issues a code and queues the email. Returns when the code expires, so the UI can show a
-- countdown without inventing the number, and never returns the code itself: the spec's
-- "do not put verification codes in URLs where avoidable" generalises to "do not hand the
-- code back to the caller". A response body containing the code would make the whole
-- exercise decorative, since anyone who can call the RPC could read it.
--
-- Raising is safe in this function, unlike in verify_email_code below, because both limits
-- are checked before anything is written.
create or replace function public.request_email_verification(p_email text)
returns table (
  expires_at timestamptz,
  resend_after timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_bytes bytea;
  v_code text;
  v_expires timestamptz := now() + interval '10 minutes';
  v_last_request timestamptz;
  v_recent_count integer;
begin
  if v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Email address is not valid'
      using errcode = 'check_violation';
  end if;

  -- Cooldown first, because it is the cheaper read and the one a held-down resend button
  -- trips. Both limits use email_verifications_email_created_idx.
  select max(v.created_at) into v_last_request
  from public.email_verifications v
  where v.email = v_email;

  if v_last_request is not null and v_last_request > now() - interval '60 seconds' then
    -- Class 'E' is in the I-Z range PostgreSQL reserves for user-defined conditions, so
    -- EV001 cannot collide with a standard code. Same reasoning as RL001 and PA001.
    raise exception 'A code was just sent. Please wait a moment before requesting another.'
      using errcode = 'EV001';
  end if;

  select count(*) into v_recent_count
  from public.email_verifications v
  where v.email = v_email
    and v.created_at > now() - interval '1 hour';

  if v_recent_count >= 5 then
    -- Deliberately the same SQLSTATE as the cooldown. The two differ only in how long the
    -- caller must wait, and telling a would-be mail-bomber which limit they hit tells them
    -- how to pace the next attempt.
    raise exception 'Too many verification codes requested for this address. Please try again later.'
      using errcode = 'EV001';
  end if;

  -- One CSPRNG draw reduced to six digits, zero-padded so a code beginning 0 is still six
  -- characters and still matches what the student was shown. See the header on the modulo
  -- bias and on why this is not random().
  v_bytes := gen_random_bytes(4);
  v_code := lpad(
    ((  (get_byte(v_bytes, 0)::bigint << 24)
      | (get_byte(v_bytes, 1)::bigint << 16)
      | (get_byte(v_bytes, 2)::bigint << 8)
      |  get_byte(v_bytes, 3)::bigint
    ) % 1000000)::text,
    6, '0'
  );

  -- Any outstanding code for this address is retired as a side effect of issuing a new one.
  -- Without this, five requests would leave five live codes and the attempt cap would be
  -- five times weaker than it reads. Stamped rather than deleted so the rate-limit window
  -- above still counts the request. verified_until stays null, so retiring a row can never
  -- be mistaken for a successful verification.
  update public.email_verifications v
  set consumed_at = now()
  where v.email = v_email
    and v.consumed_at is null;

  insert into public.email_verifications (email, code_hash, expires_at)
  values (v_email, digest(v_code, 'sha256'), v_expires);

  -- Queued in this transaction, so a failure anywhere above means no email was promised.
  -- dedupe_key is null on purpose: a resend is a legitimately repeatable email, and the
  -- cooldown above, not the unique index, is what bounds it. See 014's header.
  perform public.enqueue_email(
    'verification_code',
    v_email,
    jsonb_build_object('code', v_code, 'expires_at', v_expires)
  );

  return query select v_expires, now() + interval '60 seconds';
end;
$$;

comment on function public.request_email_verification(text) is
  'Issues a 6-digit verification code for an email address and queues the email. Returns '
  'only the expiry and the resend time, never the code. Raises EV001 on the 60-second '
  'cooldown or the 5-per-hour cap. Retires any outstanding code for the address.';

-- ---------------------------------------------------------------------------
-- public.verify_email_code(text, text)
-- ---------------------------------------------------------------------------
--
-- Checks a submitted code and, on success, opens the two-hour window.
--
-- Returns a status rather than raising. The reasoning is in the header and is load-bearing:
-- a RAISE would roll back the attempt counter this function depends on.
--
--   status              meaning                                   verified_until
--   ------------------  ----------------------------------------  --------------
--   verified            correct; the address may now enroll        set
--   incorrect           wrong code; attempts_remaining decremented null
--   expired             the code aged out; request another         null
--   no_code             nothing outstanding for this address       null
--   too_many_attempts   five wrong guesses; request another        null
create or replace function public.verify_email_code(
  p_email text,
  p_code text
)
returns table (
  status text,
  verified_until timestamptz,
  attempts_remaining integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_code text := btrim(coalesce(p_code, ''));
  v_row public.email_verifications%rowtype;
  v_verified_until timestamptz;
begin
  -- The only raising path. Nothing has been written, so there is nothing to lose, and a
  -- blank submission is a frontend bug rather than a user outcome worth modelling.
  if v_email = '' or v_code = '' then
    raise exception 'Email address and code are both required'
      using errcode = 'check_violation';
  end if;

  -- The newest outstanding code for this address. There is at most one, because
  -- request_email_verification() retires the previous one, but ordering makes that a
  -- property of this query rather than an assumption about the other function.
  --
  -- `for update` because the attempt counter is a read-modify-write and two simultaneous
  -- guesses must not both see the same count. Without it, an attacker issuing parallel
  -- requests would get more than five tries.
  select * into v_row
  from public.email_verifications v
  where v.email = v_email
    and v.consumed_at is null
  order by v.created_at desc
  limit 1
  for update;

  if not found then
    return query select 'no_code'::text, null::timestamptz, 0;
    return;
  end if;

  if v_row.expires_at <= now() then
    -- Retired, so a stale code cannot sit in the way of the next request and so the
    -- attempt cap is not spent on a code that could never work.
    update public.email_verifications v
    set consumed_at = now()
    where v.id = v_row.id;

    return query select 'expired'::text, null::timestamptz, 0;
    return;
  end if;

  if v_row.attempts >= 5 then
    update public.email_verifications v
    set consumed_at = now()
    where v.id = v_row.id;

    return query select 'too_many_attempts'::text, null::timestamptz, 0;
    return;
  end if;

  if v_row.code_hash is distinct from digest(v_code, 'sha256') then
    update public.email_verifications v
    set attempts = v.attempts + 1
    where v.id = v_row.id;

    return query select 'incorrect'::text, null::timestamptz, 5 - (v_row.attempts + 1);
    return;
  end if;

  v_verified_until := now() + interval '2 hours';

  -- Consumed and verified in one statement. `consumed_at is not null` is what makes the row
  -- unusable for a second verification; `verified_until` is what distinguishes this from a
  -- retired row. has_verified_email() requires both.
  update public.email_verifications v
  set consumed_at = now(),
      verified_until = v_verified_until,
      attempts = v.attempts + 1
  where v.id = v_row.id;

  return query select 'verified'::text, v_verified_until, 5 - (v_row.attempts + 1);
end;
$$;

comment on function public.verify_email_code(text, text) is
  'Checks a 6-digit code against the stored digest and, on success, marks the address '
  'verified for two hours. Returns a status ("verified", "incorrect", "expired", '
  '"no_code", "too_many_attempts") rather than raising, because a RAISE would roll back '
  'the attempt counter the 5-attempt cap depends on. A consumed row is never reusable.';

-- ---------------------------------------------------------------------------
-- public.has_verified_email(text)
-- ---------------------------------------------------------------------------
--
-- The enforcement point. 016 calls this from inside create_enrollment().
--
-- Not granted to anon or authenticated, and that is the substantive decision in this file.
-- If a visitor could call it, the answer would be a free oracle for "has this address
-- verified recently", and worse, the frontend would be tempted to use it as the gate. The
-- gate is create_enrollment() refusing, not the browser asking politely.
--
-- Stable rather than volatile: it only reads, so the planner may cache it within a
-- statement, which is correct here since 016 calls it once.
create or replace function public.has_verified_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.email_verifications v
    where v.email = lower(btrim(coalesce(p_email, '')))
      and v.consumed_at is not null
      and v.verified_until is not null
      and v.verified_until > now()
  );
$$;

comment on function public.has_verified_email(text) is
  'Whether an address holds a live verification. Deliberately not granted to anon or '
  'authenticated: it is the server-side guard create_enrollment() consults, not a question '
  'the browser gets to ask. Revoking it also keeps it from becoming a verification oracle.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
--
-- Execute rights are granted explicitly rather than relying on the default PUBLIC grant,
-- so the student-facing surface is a short readable list, following 002:477-488.

revoke all on function public.request_email_verification(text) from public;
revoke all on function public.verify_email_code(text, text) from public;
revoke all on function public.has_verified_email(text) from public;
revoke all on function public.has_verified_email(text) from anon;
revoke all on function public.has_verified_email(text) from authenticated;

grant execute on function public.request_email_verification(text) to anon, authenticated;
grant execute on function public.verify_email_code(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- VERIFICATION (run manually; not executed as part of the migration)
-- ---------------------------------------------------------------------------
--
-- Expected: rls_enabled true, one admin SELECT policy, anon holds zero table privileges,
-- request/verify grant execute to anon, has_verified_email grants execute to nobody but
-- its owner and service_role.
--
-- select jsonb_pretty(jsonb_build_object(
--   'rls_enabled', (
--     select relrowsecurity from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--     where n.nspname = 'public' and c.relname = 'email_verifications'
--   ),
--   'policies', (
--     select jsonb_agg(jsonb_build_object('name', policyname, 'cmd', cmd, 'roles', roles)
--                      order by policyname)
--     from pg_policies
--     where schemaname = 'public' and tablename = 'email_verifications'
--   ),
--   'grants_anon_auth', (
--     select coalesce(jsonb_agg(jsonb_build_object('grantee', grantee,
--                                                  'privilege', privilege_type)
--                      order by grantee, privilege_type), '[]'::jsonb)
--     from information_schema.role_table_grants
--     where table_schema = 'public' and table_name = 'email_verifications'
--       and grantee in ('anon', 'authenticated')
--   ),
--   'functions', (
--     select jsonb_agg(jsonb_build_object('name', p.proname, 'secdef', p.prosecdef,
--                                         'volatile', p.provolatile, 'config', p.proconfig,
--                                         'acl', array_to_string(p.proacl, ' | '))
--                      order by p.proname)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public'
--       and p.proname in ('request_email_verification', 'verify_email_code',
--                         'has_verified_email')
--   )
-- )) as post_state;
--
-- -- End to end against a probe address. The code is only obtainable from the outbox row,
-- -- which is itself the proof that it is not returned to the caller:
-- --
-- --   select * from public.request_email_verification('probe-015@example.com');
-- --   select payload ->> 'code' from public.email_outbox
-- --    where to_email = 'probe-015@example.com' order by created_at desc limit 1;
-- --   select * from public.verify_email_code('probe-015@example.com', '000000');
-- --                                       -- expect incorrect, attempts_remaining 4
-- --   select * from public.verify_email_code('probe-015@example.com', '<that code>');
-- --                                       -- expect verified
-- --   select public.has_verified_email('probe-015@example.com');          -- expect true
-- --   select * from public.verify_email_code('probe-015@example.com', '<that code>');
-- --                                       -- expect no_code: consumed, not reusable
-- --
-- --   delete from public.email_verifications where email = 'probe-015@example.com';
-- --   delete from public.email_outbox where to_email = 'probe-015@example.com';
--
-- -- The cooldown fires on an immediate second request. Expect EV001 on the second call:
-- --   select * from public.request_email_verification('probe-015b@example.com');
-- --   select * from public.request_email_verification('probe-015b@example.com');
-- --   delete from public.email_verifications where email = 'probe-015b@example.com';
-- --   delete from public.email_outbox where to_email = 'probe-015b@example.com';
