-- 005_create_enrollment_history.sql
--
-- Phase 3: audit trail for enrollment status changes.
--
-- Enrollment rows carry a payment decision, so "who approved this, and when" needs to
-- survive the next edit. `enrollments.status` only ever holds the current value; this
-- table holds every transition, written by a trigger so it cannot be bypassed by a
-- caller that forgets to log.

create table if not exists public.enrollment_status_history (
  id uuid primary key default gen_random_uuid(),

  -- Cascade here, unlike enrollments.course_id. History is meaningless without the
  -- record it describes, and an enrollment can only be deleted by an admin acting
  -- deliberately.
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,

  -- Null on the creation row: there is no status to move from.
  from_status public.enrollment_status,
  to_status public.enrollment_status not null,

  -- public.admins.id of the actor, or null when the change was not made by a
  -- signed-in admin (enrollment creation by an anonymous student, or a direct SQL fix).
  changed_by uuid references public.admins(id) on delete set null,
  -- Recorded even when changed_by resolves to null, so a manual console change is
  -- still attributable to *something*.
  changed_by_role text,
  note text,

  created_at timestamptz not null default now()
);

-- The only access pattern: one enrollment's timeline, newest first.
create index if not exists enrollment_status_history_enrollment_idx
  on public.enrollment_status_history (enrollment_id, created_at desc);

comment on table public.enrollment_status_history is
  'Append-only audit trail of enrollment status transitions. Written exclusively by '
  'the enrollments_log_status_change trigger; no role may insert directly.';

create or replace function public.log_enrollment_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
begin
  -- Only transitions are interesting. An admin editing a note must not produce a
  -- history row claiming the status changed.
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  -- auth.uid() is null for the anonymous student path; the lookup then yields null
  -- and the row is attributed by role instead.
  select a.id into v_admin_id
  from public.admins a
  where a.auth_id = auth.uid();

  insert into public.enrollment_status_history (
    enrollment_id,
    from_status,
    to_status,
    changed_by,
    changed_by_role,
    note
  )
  values (
    new.id,
    case when tg_op = 'UPDATE' then old.status else null end,
    new.status,
    v_admin_id,
    -- NOT current_user: this function is SECURITY DEFINER, so current_user is the
    -- function owner and would label every row 'postgres'. PostgREST issues
    -- `set local role anon|authenticated` per request, and that GUC is unaffected by
    -- the definer switch, so it still reports the caller. 'none' is what the GUC reads
    -- when no role has been set at all (a direct SQL Editor session), in which case
    -- session_user is the honest answer.
    coalesce(
      nullif(nullif(current_setting('role', true), ''), 'none'),
      session_user
    ),
    case when tg_op = 'UPDATE' then new.admin_note else null end
  );

  return new;
end;
$$;

drop trigger if exists enrollments_log_status_change on public.enrollments;

create trigger enrollments_log_status_change
after insert or update of status on public.enrollments
for each row
execute function public.log_enrollment_status_change();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.enrollment_status_history enable row level security;

-- Students have no business reading review history, and there is no student login to
-- scope it by in any case. get_enrollment_by_token() exposes the current status only.
revoke all on public.enrollment_status_history from anon;

drop policy if exists "Admins can read enrollment history" on public.enrollment_status_history;
create policy "Admins can read enrollment history"
on public.enrollment_status_history
for select
to authenticated
using (public.is_admin());

-- No INSERT, UPDATE or DELETE policy for any role, including admins. The trigger runs
-- as SECURITY DEFINER and so bypasses RLS; every other write path is closed, which is
-- what makes this table append-only in practice.
