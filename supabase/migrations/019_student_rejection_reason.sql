-- 019_student_rejection_reason.sql
--
-- Phase 7 follow-up: the student can read the rejection reason on the page the rejection
-- email links to.
--
-- WHY THIS MIGRATION EXISTS
--
-- 016 added `enrollments.rejection_reason`, made review_enrollment() record it, and put it
-- in the rejection email's payload. It did not change get_enrollment_by_token(), which is
-- still 002's, so the confirmation page shows a rejected student the status and nothing
-- else. That left the product saying two different things about the same enrollment: the
-- email explains why, and the page the email links to does not.
--
-- The column is already student-facing by construction. 016's own comment on it says so,
-- and says why it is separate from admin_note, which an administrator is told is private
-- and which this function goes on omitting. Nothing about the boundary changes here; the
-- field that was always meant for the student simply reaches them in both places.
--
-- WHY THE FUNCTION IS DROPPED AND RECREATED RATHER THAN REPLACED
--
-- `create or replace function` cannot change a return type. The signature is unchanged
-- (`text`), so there is no ambiguity to resolve the way 016 had with review_enrollment's
-- fourth parameter, but RETURNS TABLE gains a column and PostgreSQL refuses that in place
-- with "cannot change return type of existing function". A drop is the only route.
--
-- Dropping also drops the ACL, so the revoke and grant from 002 are restated verbatim at
-- the bottom. That is not boilerplate: a recreated function reverts to PostgreSQL's
-- default PUBLIC execute grant, which is exactly what 002:477-478 went out of its way to
-- avoid, and forgetting the restate would silently widen the surface rather than break
-- anything visibly.
--
-- WHY THE WHOLE FILE IS ONE TRANSACTION
--
-- Unlike 016's drop, this one is of a function `anon` calls. Between the drop and the
-- create there is a moment where a student following their confirmation link would get a
-- 404 from PostgREST on a function that is supposed to exist. The window is
-- sub-millisecond and the migration is applied deliberately, so this is cheap insurance
-- rather than a real hazard, but it costs two lines. No other migration in this repository
-- opens a transaction because none of them had a public function briefly absent.
--
-- WHY THE NEW COLUMN IS APPENDED RATHER THAN PLACED NEXT TO `status`
--
-- Beside the status is where it reads best, and appending is where it is safest. PostgREST
-- returns a JSON object keyed by column name, so no consumer of this function is
-- positional and the choice is stylistic for them; it is not stylistic for anything that
-- might call this over a plain connection with `select * from`. Appending is the option
-- that cannot break either.
--
-- PRE-APPLICATION STATE (measured against the linked remote, not assumed):
--
--   select p.proname, pg_get_function_identity_arguments(p.oid), length(p.prosrc),
--          md5(p.prosrc), p.prosecdef, p.provolatile, p.proconfig,
--          array_to_string(p.proacl, ' | ')
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'get_enrollment_by_token';
--
--   get_enrollment_by_token
--     signature   get_enrollment_by_token(p_access_token text)
--     length      881
--     md5         fdb04b101381569087c8c59f76923205
--     prosecdef   true
--     provolatile v
--     proconfig   {"search_path=public, extensions"}
--     proacl      postgres=X/postgres | anon=X/postgres | authenticated=X/postgres
--                 | service_role=X/postgres
--     contains    access_token_hash, digest
--     lacks       rejection_reason, admin_note
--
-- i.e. the live function is 002's, untouched by 005-018. The body below is that body, byte
-- for byte, with one added column in the RETURNS TABLE and one added expression in the
-- SELECT. Nothing is removed, and in particular the four columns 002 omits deliberately
-- (admin_note, reviewed_by, receipt_path, access_token_hash) stay omitted.

begin;

-- ---------------------------------------------------------------------------
-- public.get_enrollment_by_token  (full-body replacement; see the header)
-- ---------------------------------------------------------------------------

drop function if exists public.get_enrollment_by_token(text);

create function public.get_enrollment_by_token(p_access_token text)
returns table (
  order_id text,
  course_title text,
  course_slug text,
  price_amount numeric,
  price_currency text,
  student_name text,
  student_email text,
  student_phone text,
  student_note text,
  receipt_filename text,
  receipt_size_bytes integer,
  receipt_mime_type text,
  receipt_uploaded_at timestamptz,
  status public.enrollment_status,
  created_at timestamptz,
  updated_at timestamptz,
  -- ADDED IN 019. Null unless an administrator rejected this enrollment and wrote an
  -- explanation; 016 makes the reason optional, so a rejection with no note is normal and
  -- the page renders the status alone, exactly as it does today.
  rejection_reason text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
-- Same reasoning as create_enrollment: several RETURNS TABLE columns share names with
-- public.enrollments columns. All references below are qualified with `e.`.
#variable_conflict use_column
begin
  -- Length check before hashing: it costs nothing and keeps obviously malformed
  -- input from reaching the digest.
  if p_access_token is null or char_length(p_access_token) <> 64 then
    return;
  end if;

  return query
  select
    e.order_id,
    e.course_title_snapshot,
    e.course_slug_snapshot,
    e.price_amount,
    e.price_currency,
    e.student_name,
    e.student_email,
    e.student_phone,
    e.student_note,
    e.receipt_filename,
    e.receipt_size_bytes,
    e.receipt_mime_type,
    e.receipt_uploaded_at,
    e.status,
    e.created_at,
    e.updated_at,
    -- ADDED IN 019. Gated on the status rather than returned unconditionally, so a reason
    -- written against an enrollment that was later re-approved cannot surface as an
    -- explanation for an approval. 016 keeps the stored column on a status change by
    -- design, for the admin's own audit trail, which is precisely why the student-facing
    -- read has to ask about the status rather than trust the column's presence.
    case when e.status = 'rejected'::public.enrollment_status
         then e.rejection_reason
         else null
    end
  from public.enrollments e
  where e.access_token_hash = digest(p_access_token, 'sha256');
end;
$$;

comment on function public.get_enrollment_by_token is
  'Returns the student-safe view of one enrollment, addressed by its access token. '
  'Deliberately omits admin_note, reviewed_by, receipt_path and access_token_hash. '
  'Unknown tokens return zero rows — there is no distinguishable "not found" error. '
  'Since 019 it also returns rejection_reason, and only while the status is rejected.';

-- ---------------------------------------------------------------------------
-- Grants, restated because the drop removed them
-- ---------------------------------------------------------------------------
--
-- Verbatim from 002:482 and 002:488. A recreated function is created with PostgreSQL's
-- default execute grant to PUBLIC, so the revoke is load-bearing rather than decorative.

revoke all on function public.get_enrollment_by_token(text) from public;
grant execute on function public.get_enrollment_by_token(text) to anon, authenticated;

commit;

-- ---------------------------------------------------------------------------
-- PostgREST schema cache
-- ---------------------------------------------------------------------------
--
-- Needed here for the same reason 016 needed it: PostgREST caches function signatures, and
-- this one's return type changed. A stale cache would keep returning sixteen columns and
-- the new field would appear to be missing from a function that plainly has it.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- VERIFICATION (run manually; not executed as part of the migration)
-- ---------------------------------------------------------------------------
--
-- POST-APPLICATION STATE (measured after applying this file, not predicted):
--
--   count        1                                    (no overload left behind)
--   signature    get_enrollment_by_token(p_access_token text)   UNCHANGED
--   md5          beedfbbfb6545b355ccb5187345a0f3b     CHANGED from fdb04b10...
--   prosecdef    true                                 UNCHANGED
--   provolatile  v                                    UNCHANGED
--   proconfig    search_path=public, extensions       UNCHANGED
--   proacl       postgres=X/postgres | anon=X/postgres | authenticated=X/postgres
--                | service_role=X/postgres            UNCHANGED, i.e. the restated
--                                                     revoke/grant reproduced 002's
--                                                     ACL exactly and PUBLIC did not
--                                                     survive the recreate
--   returns      TABLE(... updated_at timestamptz, rejection_reason text)
--                                                     17 columns, the new one last
--   contains     rejection_reason true, access_token_hash true
--   lacks        admin_note, reviewed_by, receipt_path   still all three
--
-- select jsonb_pretty(jsonb_build_object(
--   'count', count(*),
--   'signature', min(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'),
--   'md5', min(md5(p.prosrc)),
--   'prosecdef', bool_and(p.prosecdef),
--   'proconfig', min(array_to_string(p.proconfig, ',')),
--   'proacl', min(array_to_string(p.proacl, ' | ')),
--   'returns', min(pg_get_function_result(p.oid)),
--   'contains', jsonb_build_object(
--     'rejection_reason', bool_and(p.prosrc like '%rejection_reason%'),
--     'admin_note', bool_or(p.prosrc like '%admin_note%'),
--     'reviewed_by', bool_or(p.prosrc like '%reviewed_by%'),
--     'receipt_path', bool_or(p.prosrc like '%receipt_path%'))))
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname = 'get_enrollment_by_token';
--
-- -- End to end. Run inside `begin; ... rollback;` against a zz-probe course, so no
-- -- catalogue data and no real enrollment is involved and nothing is left behind.
-- -- Insert the probe row directly rather than through create_enrollment(): 016's EV002
-- -- gate correctly refuses an unverified address, and 019 did not touch that path.
-- --
-- -- MEASURED (all seven steps, against the applied function):
-- --
-- --   default (pending_review)          pending_review   null
-- --   rejected + reason                 rejected         "Receipt was unreadable. ..."
-- --   rejected, no reason               rejected         null
-- --   approved, stale reason stored     approved         null   <- does not leak
-- --   cancelled, stale reason stored    cancelled        null   <- does not leak
-- --   bogus 64-char token               no rows
-- --   short token                       no rows
-- --
-- -- The two "stale reason stored" rows are the ones worth keeping: the column still held
-- -- a rejection note and the function returned null for it, which is the whole reason the
-- -- case expression gates on the status rather than returning the column outright.
