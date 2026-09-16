-- 014_email_outbox.sql
--
-- Phase 7: one queue every outbound email passes through.
--
-- Nothing in this project has ever sent an email. Phase 7 introduces four reasons to:
-- a verification code before an enrollment is accepted, a "we have your submission"
-- acknowledgement, an approved/rejected decision, and a session reminder. The naive
-- shape for all four is "the browser calls a send endpoint after the write succeeds",
-- and the spec rules it out in as many words: the email must not depend solely on the
-- frontend, and the database operation stays authoritative.
--
-- So the write and the intent-to-send happen in the same transaction, against this table,
-- and delivery is a separate concern draining it afterwards. If the browser closes between
-- the two, the row is still queued. If the transaction rolls back, no email was promised.
--
-- Why a table rather than calling the provider from inside the RPC
-- ---------------------------------------------------------------
-- A transaction that makes an outbound HTTP call holds a database connection open for the
-- duration of somebody else's network, and cannot roll the call back when the surrounding
-- statement fails. review_enrollment() would then have two failure modes it cannot
-- reconcile: status changed but no email, and email sent but status reverted. Queueing a
-- row has neither: the insert is subject to the same commit as the status change.
--
-- dedupe_key is the whole answer to duplicate emails
-- -------------------------------------------------
-- The spec asks that a retrying admin or a double-submitting UI not produce two emails.
-- Rather than a "have we sent this already?" query that races itself, every enqueue site
-- names the email it is enqueueing, e.g. 'enrollment:<uuid>:approved', and inserts with
-- `on conflict (dedupe_key) do nothing`. A second attempt is a no-op decided by a unique
-- index, which is the one mechanism here that cannot race.
--
-- It is nullable, because not every email is unique-by-nature: a verification code
-- requested twice legitimately sends twice (that is what "resend" means), and the cooldown
-- in 015, not this index, is what bounds it. Postgres unique indexes treat nulls as
-- distinct, so a null dedupe_key opts a row out of deduplication without a second table.
--
-- Who can see this table
-- ----------------------
-- Payloads carry student names, email addresses and verification-code context. 002 states
-- the pattern for data like that, and this table follows it exactly: RLS enabled, no policy
-- for anon at all, and privileges revoked outright so a policy added later by mistake still
-- cannot be reached without a matching grant. The only writers are the SECURITY DEFINER
-- functions in 015, 016 and 017. The only reader is the service-role Edge Function, which
-- bypasses RLS by virtue of its key, plus one admin SELECT policy so the settings page can
-- show a delivery log.
--
-- `authenticated` is revoked too, and that is not an oversight. An administrator is an
-- authenticated user, and their read goes through the is_admin() policy below; a signed-in
-- non-admin has no business here. Same shape as 002's treatment of enrollments.
--
-- Status is an enum for 002's reason
-- ----------------------------------
-- The set is closed, and the generated TypeScript turns a Postgres enum into a string
-- literal union, so the admin log cannot render a status the database cannot produce.
--
-- Retry state lives on the row
-- ----------------------------
-- `attempts`, `last_error` and `send_after` are what make the dispatcher restartable. A
-- failed send increments attempts and pushes send_after forward; the dispatcher only ever
-- claims rows that are queued and due. Nothing here schedules anything by itself: 017 adds
-- the pg_cron job, and until it does, rows queue harmlessly.

-- ---------------------------------------------------------------------------
-- Status enum
-- ---------------------------------------------------------------------------

-- `create type` has no `if not exists`. Catching duplicate_object rather than testing
-- pg_type first, so two concurrent runs cannot both pass the test and then both create it.
-- Same guard 013 uses.
do $$
begin
  create type public.email_status as enum ('queued', 'sending', 'sent', 'failed');
exception
  when duplicate_object then null;
end
$$;

comment on type public.email_status is
  'Lifecycle of one queued email. queued: due for dispatch. sending: claimed by a '
  'dispatcher run. sent: the provider accepted it. failed: retries exhausted.';

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),

  -- Which email this is. Text rather than an enum: the Edge Function owns the template
  -- list, a new template is a function deploy rather than a schema change, and an unknown
  -- template fails one row rather than rejecting the insert that was trying to notify
  -- someone. Constrained only to be non-empty and short enough to be a file name.
  template text not null
    check (char_length(template) between 1 and 64),

  -- 002's email regex, verbatim. Repeated rather than factored into a domain because 002
  -- and 015 both inline it too, and a shared domain would be a fourth place to look when
  -- reading any one of them.
  to_email text not null
    check (to_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),

  -- Everything the template needs to render, resolved at enqueue time. Snapshotted for
  -- create_enrollment's reason: an email about an enrollment should say what was true when
  -- it was triggered, not what the row says by the time a dispatcher gets to it.
  payload jsonb not null default '{}'::jsonb,

  status public.email_status not null default 'queued',

  attempts integer not null default 0
    check (attempts >= 0),
  last_error text,

  -- Null opts out of deduplication. See the header.
  dedupe_key text unique
    check (dedupe_key is null or char_length(dedupe_key) between 1 and 200),

  -- When this row becomes eligible for dispatch. Now, for everything except a retry
  -- backoff and 017's reminders, which are enqueued ahead of the session.
  send_after timestamptz not null default now(),

  sent_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The dispatcher's only query: oldest due, queued rows first. Partial on status so the
-- index stays the size of the backlog rather than the size of the history, which is what
-- an outbox's index should be: sent rows accumulate forever and are never claimed again.
create index if not exists email_outbox_dispatch_idx
  on public.email_outbox (send_after, created_at)
  where status = 'queued';

-- The admin delivery log reads newest first across all statuses.
create index if not exists email_outbox_created_at_idx
  on public.email_outbox (created_at desc);

drop trigger if exists email_outbox_set_updated_at on public.email_outbox;

create trigger email_outbox_set_updated_at
before update on public.email_outbox
for each row
execute function public.set_updated_at();

comment on table public.email_outbox is
  'Every outbound email, queued inside the transaction that decided to send it. Not '
  'publicly readable: RLS is on, privileges are revoked from anon and authenticated, and '
  'the only non-admin access is through SECURITY DEFINER functions and the service-role '
  'dispatcher. dedupe_key makes a repeated enqueue a no-op.';

comment on column public.email_outbox.dedupe_key is
  'Names the email rather than the attempt, e.g. enrollment:<uuid>:approved. Enqueue with '
  '`on conflict (dedupe_key) do nothing` so a retrying admin or a double-submitting UI '
  'cannot produce two emails. Null means this email is legitimately repeatable.';

comment on column public.email_outbox.send_after is
  'Dispatch eligibility. Defaults to now(); pushed forward by retry backoff, and set ahead '
  'of time by scheduled sends.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.email_outbox enable row level security;

-- Belt and braces, following 002:185-188. RLS denies by default, but privileges are
-- revoked as well so a policy added later by mistake still cannot be reached without a
-- matching grant. service_role is untouched: it bypasses RLS and is how the dispatcher
-- reads and updates these rows.
revoke all on public.email_outbox from anon;
revoke all on public.email_outbox from authenticated;

-- Grants the admin SELECT policy something to act on. Without a privilege grant the policy
-- below would never be consulted, since privileges are checked before policies. SELECT
-- only: nothing in the panel writes to this table, and an admin who could UPDATE a row to
-- 'sent' could suppress an email a student is owed.
grant select on public.email_outbox to authenticated;

drop policy if exists "Admins can read the email outbox" on public.email_outbox;
create policy "Admins can read the email outbox"
on public.email_outbox
for select
to authenticated
using (public.is_admin());

-- No INSERT, UPDATE or DELETE policy for any role. Every writer is either SECURITY
-- DEFINER (owned by postgres, so RLS does not apply) or service_role (which bypasses it).
-- An admin deliberately cannot delete delivery history from the panel.

-- ---------------------------------------------------------------------------
-- Enqueue helper
-- ---------------------------------------------------------------------------
--
-- Every enqueue site in 015, 016 and 017 goes through this, so "queued email" has one
-- definition and one place to change. SECURITY DEFINER because its callers are themselves
-- definer functions invoked by anon, and the table is revoked from anon.
--
-- Not granted to anon or authenticated. The only callers are other functions in this
-- schema; a student calling it directly would be an open relay pointed at our provider.
-- 015's has_verified_email() is revoked for the same reason.
--
-- Returns the row id, or null when a dedupe_key already claimed it. A null return is the
-- signal "this email was already queued", which callers may ignore; none of them branch
-- on it today.
create or replace function public.enqueue_email(
  p_template text,
  p_to_email text,
  p_payload jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_send_after timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  insert into public.email_outbox (template, to_email, payload, dedupe_key, send_after)
  values (
    p_template,
    lower(btrim(p_to_email)),
    coalesce(p_payload, '{}'::jsonb),
    p_dedupe_key,
    coalesce(p_send_after, now())
  )
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.enqueue_email(text, text, jsonb, text, timestamptz) is
  'Queues one email inside the caller''s transaction. Returns null when dedupe_key already '
  'named this email, which makes a repeated enqueue a no-op. Deliberately not granted to '
  'anon or authenticated: it is an internal seam, not a send endpoint.';

revoke all on function public.enqueue_email(text, text, jsonb, text, timestamptz) from public;
revoke all on function public.enqueue_email(text, text, jsonb, text, timestamptz) from anon;
revoke all on function public.enqueue_email(text, text, jsonb, text, timestamptz) from authenticated;

-- ---------------------------------------------------------------------------
-- VERIFICATION (run manually; not executed as part of the migration)
-- ---------------------------------------------------------------------------
--
-- Expected: rls_enabled true, exactly one policy (admin SELECT), anon holds zero
-- privileges, authenticated holds SELECT only, enqueue_email is prosecdef with a pinned
-- search_path and grants execute to nobody but its owner.
--
-- select jsonb_pretty(jsonb_build_object(
--   'rls_enabled', (
--     select relrowsecurity from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--     where n.nspname = 'public' and c.relname = 'email_outbox'
--   ),
--   'policies', (
--     select jsonb_agg(jsonb_build_object('name', policyname, 'cmd', cmd,
--                                         'roles', roles, 'qual', qual)
--                      order by policyname)
--     from pg_policies
--     where schemaname = 'public' and tablename = 'email_outbox'
--   ),
--   'grants', (
--     select jsonb_agg(jsonb_build_object('grantee', grantee, 'privilege', privilege_type)
--                      order by grantee, privilege_type)
--     from information_schema.role_table_grants
--     where table_schema = 'public' and table_name = 'email_outbox'
--       and grantee in ('anon', 'authenticated')
--   ),
--   'indexes', (
--     select jsonb_agg(indexname order by indexname)
--     from pg_indexes where schemaname = 'public' and tablename = 'email_outbox'
--   ),
--   'enqueue_fn', (
--     select jsonb_build_object('secdef', p.prosecdef, 'config', p.proconfig,
--                               'acl', array_to_string(p.proacl, ' | '))
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.proname = 'enqueue_email'
--   )
-- )) as post_state;
--
-- -- dedupe_key makes the second enqueue a no-op. Expect one uuid then one null:
-- --   select public.enqueue_email('probe', 'probe@example.com', '{}'::jsonb, 'probe:1');
-- --   select public.enqueue_email('probe', 'probe@example.com', '{}'::jsonb, 'probe:1');
-- --   delete from public.email_outbox where dedupe_key = 'probe:1';
--
-- -- A null dedupe_key opts out, so both of these insert. Expect two uuids:
-- --   select public.enqueue_email('probe', 'probe@example.com');
-- --   select public.enqueue_email('probe', 'probe@example.com');
-- --   delete from public.email_outbox where template = 'probe';
