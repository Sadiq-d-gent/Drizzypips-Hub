-- ---------------------------------------------------------------------------
-- 010_enrollment_availability.sql
-- ---------------------------------------------------------------------------
--
-- Makes admin_settings.enrollment_enabled do something.
--
-- 003 created that column and described it, in its own comment, as the "kill switch for
-- the enrollment form, so enrollments can be paused without a deploy". Nothing has ever
-- read it. Setting it to false today changes nothing at all: the wizard still renders and
-- create_enrollment still accepts submissions. This migration connects both ends.
--
--   1. public.get_enrollment_availability() — new. A narrow anon-callable reader so the
--      enrollment page can refuse before step 1, without admin_settings ever becoming
--      anon-readable.
--
--   2. public.create_enrollment(...) — re-declared, identical to 002 except for one guard
--      added as its first statement. The page check is a courtesy; this is enforcement.
--
-- WHY create_enrollment IS REPRODUCED IN FULL BELOW
--
-- `create or replace function` cannot patch a PL/pgSQL body — it takes the whole thing or
-- nothing. And 002 is deliberately left alone, for the reason 006 already put on the
-- record: it has already been applied, so editing it would change the recorded history
-- without changing any live database. So the body below is 002's, copied, plus the guard.
--
-- Fingerprint of the live function measured immediately before this file was applied —
-- the exact state this replacement was written against:
--
--   signature   create_enrollment(text,text,text,text,text,text,text,integer,text)
--   length      5646
--   md5         4061b07b0fc67d05234f98504e0c2c82
--   prosecdef   true
--   proconfig   {"search_path=public, extensions"}
--   proacl      postgres=X | anon=X | authenticated=X | service_role=X
--   contains    RL001, next_enrollment_order_id, access_token_hash
--   lacks       enrollment_enabled, PA001
--
-- Nothing else about the function changes. Same signature, same argument names and
-- defaults, same return type — `create or replace` cannot alter any of those — same
-- security definer, same pinned search_path, same rate limit, same token handling. Grants
-- survive a replace because the function is never dropped; they are re-issued at the end
-- anyway so this file does not depend on 002 having run first.

-- ---------------------------------------------------------------------------
-- public.get_enrollment_availability()
-- ---------------------------------------------------------------------------
--
-- Why a function instead of an anon SELECT policy on admin_settings: that table also
-- holds notification_email, and 003 revokes the whole table from anon on purpose. A
-- function returning two named columns cannot be widened by a `select=*`, so the public
-- surface is exactly these two values and stays that way.
--
-- Fails open. No settings row means "enrollments are on", matching
-- admin_settings.enrollment_enabled's own column default and the behaviour before this
-- feature existed: deleting the settings row must not take enrollments down with it. The
-- one-row VALUES literal is what guarantees a row comes back even from an empty table.
-- create_enrollment's guard below uses the identical coalesce, so the page and the
-- database cannot end up disagreeing about what "no row" means.
--
-- paused_message is null whenever enrollments are enabled. The message is only meaningful
-- while paused, and an admin drafting one ahead of time ("closed for the holidays from
-- the 20th") should not have it readable by the public before it applies.
create or replace function public.get_enrollment_availability()
returns table (
  enrollment_enabled boolean,
  paused_message text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    coalesce(s.enrollment_enabled, true) as enrollment_enabled,
    case
      when coalesce(s.enrollment_enabled, true) then null
      else s.enrollment_paused_message
    end as paused_message
  from (values (true)) as fallback(id)
  left join public.admin_settings s on s.id = fallback.id;
$$;

comment on function public.get_enrollment_availability() is
  'Whether the enrollment form is open, plus the administrator-authored message shown '
  'when it is not. Deliberately narrower than admin_settings, which stays revoked from '
  'anon: notification_email is not reachable through this function. Fails open when no '
  'settings row exists.';

-- ---------------------------------------------------------------------------
-- public.create_enrollment(...) — 002's body plus the pause guard
-- ---------------------------------------------------------------------------
create or replace function public.create_enrollment(
  p_course_slug text,
  p_student_name text,
  p_student_email text,
  p_student_phone text,
  p_student_note text default null,
  p_receipt_path text default null,
  p_receipt_filename text default null,
  p_receipt_size_bytes integer default null,
  p_receipt_mime_type text default null
)
returns table (
  order_id text,
  access_token text,
  status public.enrollment_status,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
-- The RETURNS TABLE column names (order_id, status, created_at) are also column names
-- on public.enrollments. Every reference below is table-qualified, and this pragma
-- makes the intent explicit rather than relying on PL/pgSQL's default, which raises
-- an error on any reference that turns out to be ambiguous.
#variable_conflict use_column
declare
  v_course public.courses%rowtype;
  v_token text;
  v_name text := btrim(coalesce(p_student_name, ''));
  v_email text := btrim(coalesce(p_student_email, ''));
  v_phone text := btrim(coalesce(p_student_phone, ''));
  v_note text := nullif(btrim(coalesce(p_student_note, '')), '');
  v_recent_count integer;
begin
  -- ADDED IN 010. The kill switch, checked before anything else.
  --
  -- Ahead of the course lookup so a paused site does not double as an oracle for which
  -- slugs exist, and inside this function rather than in a BEFORE INSERT trigger for a
  -- concrete reason: the INSERT below calls next_enrollment_order_id(), which advances a
  -- sequence. Sequence advances are not transactional, and 002 notes that the number in
  -- an order id discloses cumulative enrollment volume — so a trigger would burn a
  -- public, volume-disclosing id on every single refused attempt.
  --
  -- Fails open on a missing settings row, matching that column's own default and the
  -- coalesce in get_enrollment_availability().
  --
  -- The message is deliberately generic. The administrator's own wording reaches students
  -- through get_enrollment_availability(); raw error text is never rendered to anyone.
  -- This path exists for the race where a site is paused between page load and submit.
  if not coalesce(
    (select s.enrollment_enabled from public.admin_settings s where s.id),
    true
  ) then
    -- Class 'P' is in the I-Z range PostgreSQL reserves for user-defined conditions, and
    -- 'PA' does not collide with PL/pgSQL's own 'P0' codes. Same reasoning as RL001.
    raise exception 'Enrollments are currently paused'
      using errcode = 'PA001';
  end if;

  -- The course is re-read from the database rather than trusted from the client, so
  -- the price and title stored on the enrollment are always the real ones. A posted
  -- price is simply not part of this signature.
  select * into v_course
  from public.courses
  where courses.slug = p_course_slug
    and courses.published = true;

  if not found then
    -- Same message for "no such course" and "not published": an unpublished course is
    -- already invisible to anonymous visitors, and distinguishing the two here would
    -- turn this function into a draft-course oracle.
    raise exception 'Course is not available for enrollment'
      using errcode = 'no_data_found';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Student name must be between 2 and 120 characters'
      using errcode = 'check_violation';
  end if;

  if v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Student email is not valid'
      using errcode = 'check_violation';
  end if;

  if char_length(v_phone) < 7 or char_length(v_phone) > 32 then
    raise exception 'Student phone must be between 7 and 32 characters'
      using errcode = 'check_violation';
  end if;

  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'Student note must be 1000 characters or fewer'
      using errcode = 'check_violation';
  end if;

  -- Receipt descriptor is all-or-nothing, mirroring enrollments_receipt_complete.
  if p_receipt_path is not null then
    if not public.is_valid_receipt_path(p_receipt_path) then
      raise exception 'Receipt path is not valid'
        using errcode = 'check_violation';
    end if;

    if p_receipt_filename is null or p_receipt_size_bytes is null or p_receipt_mime_type is null then
      raise exception 'Receipt details are incomplete'
        using errcode = 'check_violation';
    end if;

    if p_receipt_size_bytes <= 0 or p_receipt_size_bytes > 5242880 then
      raise exception 'Receipt must be larger than 0 bytes and at most 5 MB'
        using errcode = 'check_violation';
    end if;

    if p_receipt_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
      raise exception 'Receipt file type is not allowed'
        using errcode = 'check_violation';
    end if;
  elsif p_receipt_filename is not null
     or p_receipt_size_bytes is not null
     or p_receipt_mime_type is not null then
    raise exception 'Receipt details supplied without a receipt file'
      using errcode = 'check_violation';
  end if;

  -- Cheap abuse guard. This is not a substitute for gateway-level rate limiting; it
  -- exists so a single address cannot trivially fill the review queue.
  select count(*) into v_recent_count
  from public.enrollments
  where lower(enrollments.student_email) = lower(v_email)
    and enrollments.created_at > now() - interval '1 hour';

  if v_recent_count >= 5 then
    -- Custom SQLSTATE so the frontend can show a "slow down" message specifically,
    -- rather than pattern-matching on error text. Class 'R' is in the I-Z range
    -- PostgreSQL reserves for user-defined conditions, so this cannot collide with a
    -- standard code the way a 'DP…' or 'P0001' would.
    raise exception 'Too many enrollment attempts for this email address. Please try again later.'
      using errcode = 'RL001';
  end if;

  -- 256 bits of CSPRNG output, hex encoded. Returned once, below, and thereafter
  -- recoverable only from whoever holds the confirmation URL.
  v_token := encode(gen_random_bytes(32), 'hex');

  -- The INSERT is wrapped in a CTE because RETURN QUERY takes a SELECT; a bare
  -- `return query insert ... returning` is not valid PL/pgSQL.
  return query
  with inserted as (
    insert into public.enrollments (
      order_id,
      course_id,
      course_title_snapshot,
      course_slug_snapshot,
      price_amount,
      price_currency,
      student_name,
      student_email,
      student_phone,
      student_note,
      receipt_path,
      receipt_filename,
      receipt_size_bytes,
      receipt_mime_type,
      receipt_uploaded_at,
      access_token_hash
    )
    values (
      public.next_enrollment_order_id(),
      v_course.id,
      v_course.title,
      v_course.slug,
      v_course.price,
      v_course.currency,
      v_name,
      v_email,
      v_phone,
      v_note,
      p_receipt_path,
      p_receipt_filename,
      p_receipt_size_bytes,
      p_receipt_mime_type,
      case when p_receipt_path is null then null else now() end,
      digest(v_token, 'sha256')
    )
    returning
      enrollments.order_id,
      enrollments.status,
      enrollments.created_at
  )
  select
    inserted.order_id,
    v_token,
    inserted.status,
    inserted.created_at
  from inserted;
end;
$$;

-- Records the supersession in the database itself, so an operator reading \df+ output
-- learns that 002 is no longer the current definition without having to diff prosrc.
comment on function public.create_enrollment(
  text, text, text, text, text, text, text, integer, text
) is
  'Creates one enrollment for a published course and returns its order id plus the '
  'single-issue access token. Price and title are snapshotted from the courses table, '
  'never from the caller. Refuses with SQLSTATE PA001 while '
  'admin_settings.enrollment_enabled is false. Defined by 010, which supersedes the '
  'body in 002; 002 is left as applied and is not the current definition.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
--
-- create_enrollment's grants survive `create or replace` — the function is not dropped,
-- so its ACL is untouched — but they are re-issued so this file is self-describing and
-- safe to apply to a database where 002 has not run.
revoke all on function public.get_enrollment_availability() from public;
revoke all on function public.create_enrollment(
  text, text, text, text, text, text, text, integer, text
) from public;

grant execute on function public.get_enrollment_availability() to anon, authenticated;
grant execute on function public.create_enrollment(
  text, text, text, text, text, text, text, integer, text
) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- VERIFICATION (read-only; run after applying)
-- ---------------------------------------------------------------------------
--
-- Expected:
--   get_enrollment_availability  prosecdef t, provolatile s, proconfig pinned,
--                                acl grants X to anon and authenticated
--   create_enrollment            prosecdef t, provolatile v, proconfig pinned,
--                                acl still grants X to anon and authenticated,
--                                md5 CHANGED from 4061b07b0fc67d05234f98504e0c2c82,
--                                still contains RL001 / next_enrollment_order_id /
--                                access_token_hash, now contains PA001
--
-- select
--   p.proname,
--   p.prosecdef,
--   p.provolatile,
--   p.proconfig,
--   md5(p.prosrc)                                     as src_md5,
--   array_to_string(p.proacl, ' | ')                  as acl,
--   position('PA001' in p.prosrc)                     as pos_pa001,
--   position('RL001' in p.prosrc)                     as pos_rl001,
--   position('next_enrollment_order_id' in p.prosrc)  as pos_order_id,
--   position('access_token_hash' in p.prosrc)         as pos_token_hash
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in ('create_enrollment', 'get_enrollment_availability')
-- order by p.proname;
--
-- And that admin_settings itself is still closed to anon (expect zero privileges):
--
-- select grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public' and table_name = 'admin_settings' and grantee = 'anon';
