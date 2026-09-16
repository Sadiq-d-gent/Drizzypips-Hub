-- 017_session_reminders.sql
--
-- Phase 7: "remind me about the next mentorship session", with the delivery decided by the
-- server and never by a page that happens to be open.
--
-- HOW A REMINDER ACTUALLY GETS SENT, AND WHY NOT pg_cron
--
-- The spec is explicit: do not implement a browser-based timer that only works while a page
-- is open. The plan proposed pg_cron plus pg_net. Measured against the linked database
-- before writing this file, both are *available* and neither is *installed*, and installing
-- pg_cron on Supabase is a dashboard action rather than something a migration can do.
--
-- Building on them would mean shipping a feature that does nothing until someone clicks a
-- checkbox in a web console, and does nothing silently. So the dependency is inverted:
--
--   dispatch_session_reminders()  moves due reminders into email_outbox. Pure SQL. No
--                                 extension of any kind.
--   the send-email Edge Function  calls that function over RPC with the service role, then
--                                 drains the outbox it just filled.
--   whatever invokes the Edge     a Supabase dashboard schedule, or any external cron.
--   Function on a timer
--
-- That path works on this database today. pg_cron and pg_net remain worth enabling, because
-- they remove the external trigger, so the scheduling block at the bottom of this file sets
-- both jobs up if and only if the extensions are present. It is an optimisation, and the
-- file states plainly which parts are inert until they are installed rather than leaving
-- that to be discovered.
--
-- WHY dispatch READS website_settings INSTEAD OF TRUSTING A STORED DATE
--
-- Same reasoning 010 gives for re-reading the course inside create_enrollment. The session
-- date lives in exactly one place, website_settings.countdown_session_at, and the admin owns
-- it. A subscriber row records who asked, not when the session is.
--
-- WHAT HAPPENS WHEN THE ADMIN MOVES THE SESSION
--
-- Pending subscriptions follow it. A visitor clicked "remind me about the next session", and
-- the next session is whatever the admin currently says it is, so a rescheduled date should
-- reach the same list rather than stranding it against a date that will never arrive. The
-- trigger below re-points every un-notified row, and the partial unique index makes that
-- collision-free by construction: one pending row per address, so there is never a second
-- row already sitting on the new date.
--
-- Rows that were already notified are left alone, so a new date produces a genuinely new
-- reminder rather than being swallowed as a duplicate. The dedupe_key carries the session
-- timestamp for exactly that reason.
--
-- WHY THERE IS NO check (not countdown_reminders_enabled or countdown_enabled)
--
-- It is tempting, since the Remind Me control lives on the countdown and reminders are
-- meaningless without it. It is not added, because it would make "turn the countdown off" a
-- save that fails unless the admin remembers to turn reminders off first, and a settings
-- form that rejects a reasonable single action is worse than a settings row in a slightly
-- odd state. The invariant is enforced where it has teeth instead: subscribe_session_reminder()
-- refuses and dispatch_session_reminders() sends nothing unless both flags are on. Permissive
-- about what can be stored, strict about what can happen. 012's own constraint stays as it is.
--
-- RATE LIMITING, AND THE PART IT CANNOT DO
--
-- Two shapes, and one honest gap.
--
--   Per address: the partial unique index. One pending subscription per address means a
--     repeat click is an 'already_subscribed' status and sends nothing at all. That closes
--     "use the form to mail-bomb one person" by construction rather than by counting.
--
--   Globally: 200 confirmations an hour, raising RM001. This is the blunt one, and it is
--     deliberately generous: a real announcement could plausibly draw a hundred signups in an
--     hour, and refusing genuine visitors to frustrate a script is the wrong trade for a site
--     this size.
--
--   The gap: an attacker with a list of addresses can still burn that hourly allowance on
--     other people's inboxes. Nothing inside PostgreSQL can see an IP address, so no function
--     in this file can tell that traffic apart from a launch. The real control is per-IP
--     limiting at the gateway. RL001 in 002 carries the same caveat and this one is no
--     different: it makes casual abuse pointless, it does not make determined abuse
--     impossible.
--
-- WHO CAN READ THE LIST
--
-- Nobody but the definer functions and an admin. The spec says reminder subscriptions must
-- not be publicly readable, and a subscriber list is a list of email addresses belonging to
-- people who did nothing but express interest. RLS on, privileges revoked from anon and
-- authenticated outright, one admin SELECT policy, following 002:185-188 and matching 014
-- and 015.

-- ---------------------------------------------------------------------------
-- Admin control over the reminder, on the row that already owns the countdown
-- ---------------------------------------------------------------------------

alter table public.website_settings
  add column if not exists countdown_reminders_enabled boolean not null default false,
  add column if not exists countdown_reminder_lead_hours integer not null default 24;

do $$
begin
  alter table public.website_settings
    add constraint website_settings_reminder_lead_sane
    check (countdown_reminder_lead_hours between 1 and 720);
exception when duplicate_object then null;
end $$;

comment on column public.website_settings.countdown_reminders_enabled is
  'Whether the countdown offers a "remind me" signup. Defaults false, so enabling the '
  'feature is a deliberate act and an existing site is unchanged by this migration, the '
  'same argument 012 makes for countdown_enabled.';

comment on column public.website_settings.countdown_reminder_lead_hours is
  'How long before the session the reminder email goes out. Bounded to 1..720 hours (30 '
  'days) so a typo cannot schedule a reminder years out or, worse, immediately.';

-- ---------------------------------------------------------------------------
-- public.session_reminders
-- ---------------------------------------------------------------------------

create table if not exists public.session_reminders (
  id uuid primary key default gen_random_uuid(),

  -- Same regex as 002, 014 and 015, character for character. A different one here would be
  -- a second definition of "valid address" that could drift from the first.
  email text not null
    check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),

  -- What the session date was when this row was last pointed at one. Not the source of
  -- truth: dispatch reads website_settings. Stored so the dedupe_key can distinguish "we
  -- already told them about this session" from "the date moved and they should hear again".
  session_at timestamptz not null,

  notified_at timestamptz,
  created_at timestamptz not null default now()
);

-- One pending subscription per address, whatever the date. This is the per-address rate
-- limit and the reschedule trigger's collision guard in a single index: a re-point cannot
-- fail on a duplicate because a duplicate cannot exist. Partial on un-notified rows, so a
-- returning subscriber can be reminded about a later session.
create unique index if not exists session_reminders_pending_email_idx
  on public.session_reminders (lower(email))
  where notified_at is null;

-- Dispatch's only query: everything still owed.
create index if not exists session_reminders_pending_idx
  on public.session_reminders (created_at)
  where notified_at is null;

comment on table public.session_reminders is
  'Addresses that asked to be reminded about the next mentorship session. Not publicly '
  'readable: RLS is on and privileges are revoked from anon and authenticated. The only '
  'write path is subscribe_session_reminder(); the only send path is '
  'dispatch_session_reminders(), which reads the session date from website_settings rather '
  'than from these rows.';

comment on column public.session_reminders.session_at is
  'The session this row is currently pointed at. Updated in place when an admin reschedules, '
  'so a pending subscriber follows the session rather than being stranded on a date that '
  'will never arrive. Never the authority for when to send.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.session_reminders enable row level security;

-- Belt and braces, following 002:185-188, 014 and 015. RLS denies by default; the
-- privileges are revoked as well, so a policy added later by mistake is still unreachable
-- without a matching grant.
revoke all on public.session_reminders from anon;
revoke all on public.session_reminders from authenticated;

-- SELECT only, so the admin policy below has something to act on: a policy filters rows
-- among the privileges a role already holds, it does not confer them.
grant select on public.session_reminders to authenticated;

drop policy if exists "Admins can read session reminders" on public.session_reminders;
create policy "Admins can read session reminders"
on public.session_reminders
for select
to authenticated
using (public.is_admin());

-- No policy of any kind for anon. An anonymous visitor subscribes through the definer
-- function below and can never read the list they joined.

-- ---------------------------------------------------------------------------
-- Reschedule: pending subscriptions follow the session date
-- ---------------------------------------------------------------------------

create or replace function public.reschedule_session_reminders()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- `is distinct from` rather than <>, so a change to or from null is caught rather than
  -- evaluating to null and silently skipping.
  --
  -- The null-check on the new value is what keeps an admin from being blocked: clearing the
  -- session date must not try to write null into a not-null column and fail their save. The
  -- rows simply stay where they are, and dispatch sends nothing because the countdown has no
  -- date. When a new date is set, this fires and they follow it.
  if new.countdown_session_at is not null
     and new.countdown_session_at is distinct from old.countdown_session_at then
    update public.session_reminders r
    set session_at = new.countdown_session_at
    where r.notified_at is null;
  end if;

  return new;
end;
$$;

-- Revoked from each role by name, not just from public. Supabase grants EXECUTE on new
-- functions in this schema to anon and authenticated through ALTER DEFAULT PRIVILEGES, and
-- a `revoke ... from public` does not touch a grant held explicitly by a role. Verifying
-- 017 caught exactly that: this function was left executable by anon.
--
-- PostgreSQL refuses a direct call to a `returns trigger` function, so it was not reachable
-- in practice. It is revoked anyway, because "not exploitable today" is a worse reason to
-- leave a SECURITY DEFINER grant in place than "nobody needs it" is to remove it.
revoke all on function public.reschedule_session_reminders() from public;
revoke all on function public.reschedule_session_reminders() from anon;
revoke all on function public.reschedule_session_reminders() from authenticated;

comment on function public.reschedule_session_reminders() is
  'Points every un-notified reminder at the new session date when an admin reschedules. '
  'Cannot collide, because session_reminders_pending_email_idx allows only one pending row '
  'per address. Skips a null new date so clearing the countdown never blocks a settings save.';

drop trigger if exists website_settings_reschedule_reminders on public.website_settings;
create trigger website_settings_reschedule_reminders
  after update on public.website_settings
  for each row
  execute function public.reschedule_session_reminders();

-- ---------------------------------------------------------------------------
-- public.subscribe_session_reminder(text)
-- ---------------------------------------------------------------------------
--
-- The only way a row enters this table. Granted to anon, because an anonymous visitor is
-- exactly who uses it.
--
-- Returns a status rather than raising for the outcomes a caller should see as ordinary,
-- following 015's verify_email_code() for the same reason: a raise aborts the transaction,
-- and 'already_subscribed' is a normal answer rather than an error. Raising is reserved for
-- malformed input, a switched-off feature and the rate limit.
--
--   status              meaning
--   subscribed          added to the list, confirmation queued
--   already_subscribed  a pending subscription for this address already exists, nothing sent
create or replace function public.subscribe_session_reminder(p_email text)
returns table (status text, session_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_settings public.website_settings%rowtype;
  v_recent integer;
  v_id uuid;
begin
  if v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Email address is not valid'
      using errcode = 'check_violation';
  end if;

  select * into v_settings from public.website_settings s where s.id;

  -- Both flags, and a date. This is where the invariant lives, rather than in a table
  -- constraint that would trap the admin mid-edit. See the header.
  if not found
     or not coalesce(v_settings.countdown_enabled, false)
     or not coalesce(v_settings.countdown_reminders_enabled, false)
     or v_settings.countdown_session_at is null then
    -- Class 'R' is in the I-Z range PostgreSQL reserves for user-defined conditions, and
    -- 'RM' does not collide with 002's RL001. Same reasoning as PA001 and EV001.
    raise exception 'Session reminders are not currently available'
      using errcode = 'RM002';
  end if;

  -- The session already started. Nothing to remind anyone about, and adding a row now would
  -- only be re-pointed at whatever comes next without the subscriber having asked for it.
  if v_settings.countdown_session_at <= now() then
    raise exception 'Session reminders are not currently available'
      using errcode = 'RM002';
  end if;

  -- The blunt global cap. Counted before the insert, so a refusal writes nothing and the
  -- rollback a raise causes has nothing to undo. See the header for what this does and does
  -- not defend against.
  select count(*) into v_recent
  from public.session_reminders r
  where r.created_at > now() - interval '1 hour';

  if v_recent >= 200 then
    raise exception 'Too many reminder signups right now. Please try again shortly.'
      using errcode = 'RM001';
  end if;

  insert into public.session_reminders (email, session_at)
  values (v_email, v_settings.countdown_session_at)
  on conflict do nothing
  returning session_reminders.id into v_id;

  -- Nothing inserted means the partial unique index caught a pending row for this address.
  -- No second confirmation, which is the per-address rate limit doing its job.
  if v_id is null then
    return query select 'already_subscribed'::text, v_settings.countdown_session_at;
    return;
  end if;

  -- Keyed on the row, so it is one confirmation per subscription, and re-running this
  -- function can never produce a second one.
  perform public.enqueue_email(
    'reminder_confirmed',
    v_email,
    jsonb_build_object(
      'session_at', v_settings.countdown_session_at,
      'countdown_title', v_settings.countdown_title,
      'lead_hours', v_settings.countdown_reminder_lead_hours
    ),
    'reminder:' || v_id::text || ':confirmed'
  );

  return query select 'subscribed'::text, v_settings.countdown_session_at;
end;
$$;

comment on function public.subscribe_session_reminder(text) is
  'Adds one address to the next session''s reminder list and queues a confirmation. Reads '
  'the session date from website_settings rather than trusting a posted one. Returns '
  '"subscribed" or "already_subscribed"; raises RM002 when reminders are off or the session '
  'has passed, and RM001 on the global hourly cap.';

-- ---------------------------------------------------------------------------
-- public.dispatch_session_reminders()
-- ---------------------------------------------------------------------------
--
-- Moves everything due into the outbox and returns how many. Pure SQL: no pg_cron, no
-- pg_net, nothing that has to be enabled first. Whatever runs on a timer, a dashboard
-- schedule, an external cron or the pg_cron job at the bottom of this file, calls this and
-- then drains the outbox.
--
-- Not granted to anon or authenticated. An anonymous caller triggering the send is not a
-- catastrophe, since the due-window check bounds what it can do, but it is also not
-- something a visitor has any reason to be able to do.
create or replace function public.dispatch_session_reminders()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_settings public.website_settings%rowtype;
  v_due_from timestamptz;
  v_count integer := 0;
  v_row record;
begin
  select * into v_settings from public.website_settings s where s.id;

  if not found
     or not coalesce(v_settings.countdown_enabled, false)
     or not coalesce(v_settings.countdown_reminders_enabled, false)
     or v_settings.countdown_session_at is null then
    return 0;
  end if;

  v_due_from := v_settings.countdown_session_at
                - make_interval(hours => coalesce(v_settings.countdown_reminder_lead_hours, 24));

  -- Before the window: too early, say nothing. After the session: too late, and a reminder
  -- for something that already happened is worse than none. Pending rows survive both cases
  -- and are re-pointed by the trigger when the admin sets the next date, which is the
  -- behaviour someone who asked to be reminded about "the next session" would expect.
  if now() < v_due_from or now() >= v_settings.countdown_session_at then
    return 0;
  end if;

  -- skip locked so two overlapping dispatch runs, a cron job and a manual Edge Function
  -- invocation landing together, split the work instead of one blocking on the other.
  for v_row in
    select r.id, r.email
    from public.session_reminders r
    where r.notified_at is null
    order by r.created_at
    for update skip locked
  loop
    -- The session timestamp is in the key, so a rescheduled session is a different email
    -- rather than a duplicate that on-conflict-do-nothing would swallow.
    perform public.enqueue_email(
      'session_reminder',
      v_row.email,
      jsonb_build_object(
        'session_at', v_settings.countdown_session_at,
        'countdown_title', v_settings.countdown_title
      ),
      'reminder:' || v_row.id::text || ':session:'
        || extract(epoch from v_settings.countdown_session_at)::bigint::text
    );

    update public.session_reminders r
    set notified_at = now()
    where r.id = v_row.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.dispatch_session_reminders() is
  'Queues the reminder email for every un-notified subscriber once the session is inside the '
  'admin-configured lead window. Returns the number queued. Needs no extensions, so the '
  'send-email Edge Function can call it over RPC before draining the outbox.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.subscribe_session_reminder(text) from public;
grant execute on function public.subscribe_session_reminder(text) to anon, authenticated;

revoke all on function public.dispatch_session_reminders() from public;
revoke all on function public.dispatch_session_reminders() from anon;
revoke all on function public.dispatch_session_reminders() from authenticated;
grant execute on function public.dispatch_session_reminders() to service_role;

-- ---------------------------------------------------------------------------
-- Optional: pg_cron scheduling
-- ---------------------------------------------------------------------------
--
-- Everything in this section is inert unless pg_cron and pg_net are installed, which on
-- Supabase is a dashboard action (Database, Extensions) and cannot be done from a migration.
-- Nothing above depends on it. If they are never enabled, the Edge Function invoked on a
-- schedule does the same work.
--
-- The outbox drain needs two values that must not be written into a committed migration: the
-- Edge Function URL and the shared secret that stops it being an open relay. They are read
-- from Supabase Vault, which is installed on this database. Create them once:
--
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-email',
--                              'edge_send_email_url');
--   select vault.create_secret('<the same value as EMAIL_DISPATCH_SECRET>',
--                              'edge_send_email_secret');
--
-- If either secret is absent the drain is a no-op and says so, rather than posting nowhere.

-- The drain is created unconditionally, so the cron job below has something to call the
-- moment pg_net is enabled, and written with dynamic SQL for the one statement that needs
-- it: `net.http_post` cannot be referenced statically in a body that must be creatable on a
-- database where the net schema does not yet exist.
create or replace function public.dispatch_email_outbox()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secret text;
  v_queued integer;
begin
  if to_regnamespace('net') is null then
    raise notice 'pg_net is not installed; dispatch_email_outbox() is a no-op.';
    return 0;
  end if;

  select count(*) into v_queued
  from public.email_outbox o
  where o.status = 'queued' and o.send_after <= now();

  if v_queued = 0 then
    return 0;
  end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'edge_send_email_url';

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'edge_send_email_secret';

  if v_url is null or v_secret is null then
    raise notice
      'edge_send_email_url or edge_send_email_secret is missing from Vault; not posting.';
    return 0;
  end if;

  -- This function only rings the doorbell. It does not read payloads, does not mark rows
  -- sent, and does not decide what an email says: the Edge Function claims rows itself, so
  -- there is exactly one place that talks to the mail provider.
  execute format(
    'select net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb)',
    v_url,
    jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', v_secret)::text,
    jsonb_build_object('trigger', 'pg_cron', 'queued', v_queued)::text
  );

  return v_queued;
end;
$$;

revoke all on function public.dispatch_email_outbox() from public;
revoke all on function public.dispatch_email_outbox() from anon;
revoke all on function public.dispatch_email_outbox() from authenticated;
grant execute on function public.dispatch_email_outbox() to service_role;

comment on function public.dispatch_email_outbox() is
  'Pokes the send-email Edge Function when the outbox has queued work, using pg_net and '
  'credentials from Vault. A no-op with a notice when pg_net is not installed or the secrets '
  'are absent. Never reads payloads or marks rows sent; the Edge Function owns delivery.';

do $$
begin
  if to_regnamespace('cron') is null then
    raise notice
      'pg_cron is not installed. Reminder scheduling is skipped; dispatch_session_reminders() '
      'still works when called from the send-email Edge Function.';
    return;
  end if;

  -- Reminders only need SQL, so this job is useful even without pg_net.
  perform cron.schedule(
    'dispatch-session-reminders',
    '*/5 * * * *',
    $job$ select public.dispatch_session_reminders(); $job$
  );

  if to_regnamespace('net') is null then
    raise notice
      'pg_net is not installed. Reminders will be queued into email_outbox on schedule but '
      'not delivered from the database; invoke the send-email Edge Function to drain them.';
    return;
  end if;

  perform cron.schedule(
    'drain-email-outbox',
    '* * * * *',
    $job$ select public.dispatch_email_outbox(); $job$
  );
end $$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- VERIFICATION (run manually; not executed as part of the migration)
-- ---------------------------------------------------------------------------
--
-- Expected: rls_enabled true, exactly one policy (admin SELECT), anon holds zero table
-- privileges, subscribe grants execute to anon and authenticated, both dispatch functions
-- grant execute to service_role only.
--
-- select jsonb_pretty(jsonb_build_object(
--   'rls_enabled', (select relrowsecurity from pg_class c
--                   join pg_namespace n on n.oid = c.relnamespace
--                   where n.nspname = 'public' and c.relname = 'session_reminders'),
--   'policies', (select jsonb_agg(jsonb_build_object('name', policyname, 'cmd', cmd,
--                                                    'roles', roles, 'qual', qual))
--                from pg_policies
--                where schemaname = 'public' and tablename = 'session_reminders'),
--   'grants_anon_auth', (
--     select coalesce(jsonb_agg(jsonb_build_object('grantee', grantee,
--                                                  'privilege', privilege_type)), '[]'::jsonb)
--     from information_schema.role_table_grants
--     where table_schema = 'public' and table_name = 'session_reminders'
--       and grantee in ('anon', 'authenticated')),
--   'function_acl', (
--     select jsonb_object_agg(p.proname, array_to_string(p.proacl, ' | '))
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public'
--       and p.proname in ('subscribe_session_reminder', 'dispatch_session_reminders',
--                         'dispatch_email_outbox', 'reschedule_session_reminders'))
-- ));
--
-- -- End to end, against a probe address, with the countdown temporarily enabled:
-- --   select * from public.subscribe_session_reminder('probe-017@example.com');
-- --                                        -- expect subscribed
-- --   select * from public.subscribe_session_reminder('probe-017@example.com');
-- --                                        -- expect already_subscribed, no second email
-- --   select public.dispatch_session_reminders();
-- --   delete from public.session_reminders where email = 'probe-017@example.com';
-- --   delete from public.email_outbox where to_email = 'probe-017@example.com';
