-- grant_admin.sql
--
-- Links an existing Supabase Auth user to public.admins, making them an administrator.
--
-- This is the ONLY way an admin account comes into existence. There is no sign-up page
-- and no invite flow: public.admins has a single SELECT policy and no INSERT policy for
-- any role, so nothing reachable from the browser can create an admin. Membership is
-- granted here, deliberately, by someone with database access.
--
-- WHY IT IS SPLIT IN TWO
-- Creating the auth user and granting admin rights are separate acts on purpose.
--   1. You create the user in the Supabase Dashboard (Authentication -> Users -> Add
--      user). Set the email and password there, with "Auto Confirm User" ticked.
--   2. You run this script to link that user into public.admins.
-- A password never passes through this repository, no service-role key is needed, and
-- an auth account existing does not by itself grant anything — step 2 is the grant.
--
-- HOW TO RUN
--   Replace the two values in the `params` CTE below, then either paste the whole file
--   into the Supabase SQL Editor, or run:
--
--     supabase db query --linked --file supabase/maintenance/grant_admin.sql
--
-- IDEMPOTENT
--   Re-running is safe. `on conflict (auth_id) do nothing` means a second run against
--   the same user changes nothing and reports 0 rows. To correct a name or email on an
--   existing admin, update that row directly rather than editing this script.

with params as (
  select
    -- The email of the auth user created in step 1. Matched case-insensitively.
    'admin@example.com'::text as auth_email,
    -- Display name shown in the admin panel and in enrollment status history.
    'Site Administrator'::text as admin_name
),
target as (
  -- auth.users is not readable through PostgREST at all; this file is expected to run
  -- as a privileged database session (SQL Editor or `db query --linked`).
  select u.id as auth_id, u.email, p.admin_name
  from params p
  join auth.users u on lower(u.email) = lower(p.auth_email)
),
inserted as (
  insert into public.admins (auth_id, name, email)
  select t.auth_id, t.admin_name, t.email
  from target t
  -- auth_id is unique (001). A second run, or a user already granted admin, is a no-op.
  on conflict (auth_id) do nothing
  returning id, auth_id, name, email, created_at
)
-- Reports what happened. `outcome` distinguishes the three cases that matter, so a run
-- that quietly did nothing cannot be mistaken for a successful grant.
select
  case
    when not exists (select 1 from target)
      then 'NO SUCH AUTH USER — create it in the Dashboard first, or check the email'
    when exists (select 1 from inserted)
      then 'GRANTED'
    else 'ALREADY AN ADMIN — no change'
  end as outcome,
  (select auth_email from params) as requested_email,
  (select count(*) from public.admins) as total_admins;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- List administrators (never returns a password — auth.users holds only a hash, and
-- this script never reads it):
--
--   select a.id, a.name, a.email, a.created_at
--   from public.admins a
--   order by a.created_at;
--
-- Confirm the link resolves the way public.is_admin() will evaluate it:
--
--   select a.email, u.id is not null as auth_user_exists, u.email_confirmed_at
--   from public.admins a
--   left join auth.users u on u.id = a.auth_id;
--
-- email_confirmed_at must not be null, or sign-in fails depending on project settings.
-- The Dashboard's "Auto Confirm User" sets it.
--
-- TO REVOKE
--   delete from public.admins where lower(email) = lower('admin@example.com');
--
--   This removes admin rights while leaving the auth account intact: they can still
--   sign in, but is_admin() returns false, every admin RLS policy stops matching, and
--   the three Phase 4 RPCs raise 42501. Deleting the auth user instead cascades to this
--   row anyway (001, `on delete cascade`), but leaves enrollment history attribution
--   pointing at null — prefer revoking here and keeping the account.
-- =============================================================================
