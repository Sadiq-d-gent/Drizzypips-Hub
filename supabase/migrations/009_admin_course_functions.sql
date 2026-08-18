-- 009_admin_course_functions.sql
--
-- Phase 5a: one read-only function the course admin screens need.
--
--   public.admin_course_stats()
--     How many enrollments each course has, and how many of those are still pending.
--
-- WHY THIS EXISTS RATHER THAN A CLIENT-SIDE COUNT
-- The course list has to show an enrollment count per course, because deleting a
-- course that has any enrollment is impossible by design — enrollments.course_id is
-- `on delete restrict` (002), on the grounds that an enrollment is a payment record
-- and must outlive the catalogue entry it points at. An admin who cannot see the
-- count only discovers this by confirming a destructive action and watching it fail.
--
-- PostgREST cannot GROUP BY, so the alternatives were one count request per course
-- (N+1, and the counts can disagree with each other) or shipping every enrollment row
-- to the browser to tally there (unbounded transfer of student PII for a number).
-- One grouped scan is cheaper, internally consistent, and returns no PII at all.
--
-- The join runs from courses outward, so every course gets a row including the ones
-- with no enrollments at all. The caller can look up any course id and get a number
-- rather than having to treat "absent" as zero.

create or replace function public.admin_course_stats()
returns table (
  course_id uuid,
  total bigint,
  pending bigint
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
-- course_id is both an OUT parameter here and a column on public.enrollments. Every
-- reference below is qualified, and this pragma makes the resolution explicit rather
-- than leaving it to the default — same reasoning as get_enrollment_history in 007.
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Admin privileges are required to read course statistics'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    c.id,
    count(e.id)::bigint,
    count(e.id) filter (where e.status = 'pending_review')::bigint
  from public.courses c
  left join public.enrollments e on e.course_id = c.id
  group by c.id;
end;
$$;

comment on function public.admin_course_stats() is
  'Enrollment count and pending count per course, one row per course including zeros. '
  'Admin only. Returns no student data — course ids and counts only.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Same shape as 007: EXECUTE defaults to PUBLIC on a new function, so revoke it and
-- name the permitted role explicitly. anon is revoked separately from PUBLIC even
-- though it inherits that revoke, so the intent is greppable rather than implied.

revoke all on function public.admin_course_stats() from public;
revoke all on function public.admin_course_stats() from anon;
grant execute on function public.admin_course_stats() to authenticated;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
--
-- SECURITY DEFINER with a pinned search_path (expect prosecdef = t and proconfig
-- containing search_path=public, extensions):
--
--   select p.proname, p.prosecdef, p.proconfig
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'admin_course_stats';
--
-- Execute is granted to authenticated only (expect no anon row, no PUBLIC row):
--
--   select p.proname, p.proacl
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'admin_course_stats';
--
-- The admin guard holds. With the anon key the call must fail with 42501; as an
-- authenticated non-admin it must also fail with 42501; as an admin it must return
-- exactly one row per row in public.courses.
