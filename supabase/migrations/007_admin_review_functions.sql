-- 007_admin_review_functions.sql
--
-- Phase 4: the three server-side operations the admin panel needs and that plain
-- table access cannot provide safely.
--
-- WHAT THIS DOES NOT DO
--   No table, column, enum, index, policy or table-level grant is created, dropped or
--   altered. Admin reads still go through the existing "Admins can read enrollments"
--   and "Admins can read all courses" policies from 001/002. The receipts bucket and
--   its storage policies from 004 are untouched. Nothing here widens any role's access.
--
-- WHY EACH FUNCTION EXISTS
--
--   public.review_enrollment(...)
--     002 gives admins a blanket UPDATE policy guarded only by is_admin(). That is
--     enough to *authorise* a review but not to *constrain* one: the enum permits any
--     status to move to any other, and a client issuing its own PATCH could name a
--     different admin in reviewed_by or backdate reviewed_at. Both are decided here
--     instead, from auth.uid() and now(), so the frontend never supplies them.
--     The legal transitions are exactly pending_review -> approved and
--     pending_review -> rejected. Nothing else is a review.
--
--   public.admin_enrollment_stats()
--     The dashboard needs five counts. PostgREST cannot GROUP BY, so the alternative
--     is five round trips that can also disagree with each other. One grouped scan is
--     both cheaper and internally consistent.
--
--   public.get_enrollment_history(uuid)
--     enrollment_status_history stores the actor as an admins.id, but the only policy
--     on public.admins is self-only ("Admins can read their own profile", 001). An
--     admin reading a row changed by a *different* admin therefore cannot resolve the
--     name. This function joins it server-side, which is a much narrower change than
--     widening that policy to expose every admin's row to every other admin.
--
-- All three are SECURITY DEFINER with a pinned search_path, and each re-checks
-- authorisation itself. SECURITY DEFINER runs as the table owner and so bypasses RLS,
-- which is precisely why the is_admin() guard is the first statement in every body
-- rather than something inherited from a policy.
--
-- `search_path = public, extensions` matches the Phase 3 RPCs. These three do not use
-- pgcrypto, but the path is pinned to the same value so every SECURITY DEFINER
-- function in the project resolves names identically.

-- ---------------------------------------------------------------------------
-- review_enrollment
-- ---------------------------------------------------------------------------
--
-- Custom SQLSTATEs, following the 'RL001' precedent in 002: class letters I-Z are
-- reserved by PostgreSQL for user-defined conditions, so these cannot collide with a
-- standard code the way a 'P0001' would.
--
--   ST001  the requested status is not a review outcome
--   ST002  the enrollment is not pending_review (already reviewed, or cancelled)
--   42501  caller is not an admin            (insufficient_privilege)
--   P0002  no such enrollment                (no_data_found)
--
-- p_status is text rather than public.enrollment_status so that an unrecognised value
-- fails the explicit check below with ST001, instead of failing as an invalid input
-- cast before the function body is ever entered.
create or replace function public.review_enrollment(
  p_enrollment_id uuid,
  p_status text,
  p_admin_note text default null
)
returns table (
  id uuid,
  order_id text,
  status public.enrollment_status,
  admin_note text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
-- Same reasoning as create_enrollment in 002: the RETURNS TABLE names are also column
-- names on public.enrollments. Every reference below is qualified with `e.`, and this
-- pragma makes the resolution explicit rather than relying on the default.
#variable_conflict use_column
declare
  v_admin_id uuid;
  v_current public.enrollment_status;
  v_note text := nullif(btrim(coalesce(p_admin_note, '')), '');
begin
  -- Authorisation, and the reviewer's identity, in one lookup. is_admin() answers the
  -- same question but discards the id, which is needed for reviewed_by.
  select a.id into v_admin_id
  from public.admins a
  where a.auth_id = auth.uid();

  if v_admin_id is null then
    raise exception 'Admin privileges are required to review an enrollment'
      using errcode = 'insufficient_privilege';
  end if;

  if p_status is null or p_status not in ('approved', 'rejected') then
    raise exception 'A review can only set approved or rejected'
      using errcode = 'ST001';
  end if;

  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'Admin note must be 1000 characters or fewer'
      using errcode = 'check_violation';
  end if;

  -- `for update` closes the window where two admins both read pending_review and both
  -- write. The second one blocks here, then sees the first one's status and fails
  -- ST002 rather than silently overwriting the earlier decision.
  select e.status into v_current
  from public.enrollments e
  where e.id = p_enrollment_id
  for update;

  if not found then
    raise exception 'Enrollment not found'
      using errcode = 'no_data_found';
  end if;

  if v_current <> 'pending_review' then
    raise exception 'This enrollment is no longer awaiting review'
      using errcode = 'ST002';
  end if;

  return query
  update public.enrollments e
  set
    -- Set in the same statement as the status, deliberately: the
    -- enrollments_log_status_change trigger in 005 copies new.admin_note into the
    -- history row's note, so a note written separately would not be recorded against
    -- the transition it explains.
    --
    -- coalesce, not a bare assignment: approving without typing a note must not erase
    -- a note that is already there.
    admin_note = coalesce(v_note, e.admin_note),
    status = p_status::public.enrollment_status,
    reviewed_by = v_admin_id,
    reviewed_at = now()
  where e.id = p_enrollment_id
  returning
    e.id,
    e.order_id,
    e.status,
    e.admin_note,
    e.reviewed_at,
    e.reviewed_by,
    e.updated_at;
  -- updated_at is not set here: enrollments_set_updated_at (002) is a BEFORE UPDATE
  -- trigger that already maintains it.
end;
$$;

comment on function public.review_enrollment(uuid, text, text) is
  'Approves or rejects one pending enrollment. Enforces pending_review -> approved|rejected, '
  'and sets reviewed_by/reviewed_at from auth.uid() and now() so neither can be supplied '
  'by the caller. History is written by the existing trigger.';

-- ---------------------------------------------------------------------------
-- admin_enrollment_stats
-- ---------------------------------------------------------------------------

create or replace function public.admin_enrollment_stats()
returns table (
  pending_review bigint,
  approved bigint,
  rejected bigint,
  cancelled bigint,
  total bigint
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin privileges are required to read enrollment statistics'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    count(*) filter (where e.status = 'pending_review'),
    count(*) filter (where e.status = 'approved'),
    count(*) filter (where e.status = 'rejected'),
    count(*) filter (where e.status = 'cancelled'),
    count(*)
  from public.enrollments e;
end;
$$;

comment on function public.admin_enrollment_stats() is
  'Counts of enrollments by status plus the total, in one scan. Admin only.';

-- ---------------------------------------------------------------------------
-- get_enrollment_history
-- ---------------------------------------------------------------------------

create or replace function public.get_enrollment_history(p_enrollment_id uuid)
returns table (
  id uuid,
  from_status public.enrollment_status,
  to_status public.enrollment_status,
  changed_by_name text,
  changed_by_role text,
  note text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
-- id, from_status, to_status, changed_by_role, note and created_at are all column
-- names on enrollment_status_history as well as OUT parameters here.
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Admin privileges are required to read enrollment history'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    h.id,
    h.from_status,
    h.to_status,
    -- left join: changed_by is null for the creation row (an anonymous student), and
    -- for any change made directly in SQL. changed_by_role still identifies those.
    a.name,
    h.changed_by_role,
    h.note,
    h.created_at
  from public.enrollment_status_history h
  left join public.admins a on a.id = h.changed_by
  where h.enrollment_id = p_enrollment_id
  order by h.created_at desc;
end;
$$;

comment on function public.get_enrollment_history(uuid) is
  'One enrollment''s status timeline, newest first, with the actor''s display name '
  'resolved. Exists because the admins SELECT policy is self-only. Admin only. Read '
  'only — history rows are written exclusively by the 005 trigger.';

-- ---------------------------------------------------------------------------
-- Execute rights
-- ---------------------------------------------------------------------------
--
-- Same shape as the Phase 3 RPCs in 002: strip the default PUBLIC grant, then name the
-- roles explicitly. anon is revoked separately from PUBLIC; it inherits the PUBLIC
-- revoke already, so this is belt-and-braces that also makes the intent greppable.
-- These are the admin surface, so anon appears in no grant below.

revoke all on function public.review_enrollment(uuid, text, text) from public;
revoke all on function public.admin_enrollment_stats() from public;
revoke all on function public.get_enrollment_history(uuid) from public;

revoke all on function public.review_enrollment(uuid, text, text) from anon;
revoke all on function public.admin_enrollment_stats() from anon;
revoke all on function public.get_enrollment_history(uuid) from anon;

grant execute on function public.review_enrollment(uuid, text, text) to authenticated;
grant execute on function public.admin_enrollment_stats() to authenticated;
grant execute on function public.get_enrollment_history(uuid) to authenticated;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- All three present, SECURITY DEFINER, with a pinned search_path (expect 3 rows,
-- prosecdef = true, proconfig = {"search_path=public, extensions"}):
--
--   select p.proname, p.prosecdef, p.proconfig
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('review_enrollment', 'admin_enrollment_stats',
--                       'get_enrollment_history');
--
-- Execute is granted to authenticated only (expect no anon row, no PUBLIC row):
--
--   select p.proname, p.proacl
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('review_enrollment', 'admin_enrollment_stats',
--                       'get_enrollment_history');
--
-- Transition rule holds. As a non-admin (anon key), every call must fail; as an admin,
-- a second approve on the same row must fail with ST002.
-- =============================================================================
