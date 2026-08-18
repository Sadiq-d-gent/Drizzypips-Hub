-- 002_create_enrollments.sql
--
-- Phase 3: course enrollment records.
--
-- SECURITY MODEL
-- There is no student authentication in this application. Every visitor talks to
-- PostgREST as the `anon` role, so `anon` gets NO policies on public.enrollments at
-- all (RLS denies by default) and its table privileges are revoked outright. All
-- student interaction goes through two SECURITY DEFINER functions:
--
--   public.create_enrollment(...)        -- writes one row, returns order_id + token
--   public.get_enrollment_by_token(text) -- reads back a safe column subset
--
-- Those functions are the entire student-facing surface. A student is authorised by
-- the 256-bit access token issued once at creation time; only its SHA-256 digest is
-- stored, so the database cannot reconstruct a URL that grants access. The order_id
-- is a human-quotable identifier and never authorises anything.
--
-- Admin reads and writes go through normal RLS using public.is_admin(), which keeps
-- the future admin panel working with plain Supabase queries.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'enrollment_status') then
    create type public.enrollment_status as enum (
      'pending_review',
      'approved',
      'rejected',
      'cancelled'
    );
  end if;
end;
$$;

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),

  -- Human-quotable reference shown to the student and used in WhatsApp messages.
  -- Unique, but deliberately NOT a credential: see access_token_hash below.
  order_id text not null unique,

  -- `on delete restrict`: an enrollment is a payment record. Deleting a course must
  -- not silently destroy the evidence that somebody paid for it.
  course_id uuid not null references public.courses(id) on delete restrict,

  -- Snapshots of what the student actually agreed to buy. Course rows are editable,
  -- so the price and title at purchase time have to be frozen here.
  course_title_snapshot text not null,
  course_slug_snapshot text not null,
  price_amount numeric(12, 2) not null check (price_amount >= 0),
  price_currency text not null,

  student_name text not null
    check (char_length(btrim(student_name)) between 2 and 120),
  student_email text not null
    check (student_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  student_phone text not null
    check (char_length(btrim(student_phone)) between 7 and 32),
  student_note text
    check (student_note is null or char_length(student_note) <= 1000),

  -- Receipt metadata only. The object itself lives in the private `receipts`
  -- bucket (004) and is not readable by anon; the confirmation page renders these
  -- columns rather than the image.
  receipt_path text,
  receipt_filename text,
  receipt_size_bytes integer
    check (receipt_size_bytes is null or (receipt_size_bytes > 0 and receipt_size_bytes <= 5242880)),
  receipt_mime_type text,
  receipt_uploaded_at timestamptz,

  status public.enrollment_status not null default 'pending_review',

  -- SHA-256 of the raw access token. The raw value is returned exactly once by
  -- create_enrollment() and never persisted.
  access_token_hash bytea not null unique,

  admin_note text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.admins(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Receipt columns move as a set: either no receipt, or a complete descriptor.
  constraint enrollments_receipt_complete check (
    (receipt_path is null
      and receipt_filename is null
      and receipt_size_bytes is null
      and receipt_mime_type is null
      and receipt_uploaded_at is null)
    or
    (receipt_path is not null
      and receipt_filename is not null
      and receipt_size_bytes is not null
      and receipt_mime_type is not null
      and receipt_uploaded_at is not null)
  )
);

-- RETENTION POLICY (business decision, 2026 — revisit as needed)
-- Personal data on rejected/cancelled enrollments is to be kept for 24 months from
-- `updated_at`, then removed. This is recorded as policy only: Phase 3 deliberately
-- ships NO automatic deletion. Enrollment records may fall under accounting, tax or
-- consumer-protection retention rules, so confirm the final schedule with the
-- business's accountant/legal adviser before any automated purge is introduced.
comment on table public.enrollments is
  'Course enrollment + manual payment records. Student access is via SECURITY DEFINER '
  'RPCs only (anon has no policies here). Retention policy: rejected/cancelled rows '
  'purge 24 months after updated_at — policy only, no automated deletion in Phase 3.';

comment on column public.enrollments.order_id is
  'Human-quotable reference (DP-YYMMDD-NNNNN). Identifier only — never an authoriser.';

comment on column public.enrollments.access_token_hash is
  'SHA-256 digest of the single-issue access token. Raw token is never stored.';

-- ORDER ID
-- Format: DP-YYMMDD-NNNNN, e.g. DP-260810-00042.
--
-- The counter is a single global sequence rather than a per-day reset. A sequence is
-- gap-tolerant and lock-free, which is what makes it safe under concurrent inserts;
-- a per-day counter would need its own row lock for no user-visible benefit. The
-- consequence is that the numeric part discloses cumulative enrollment volume, which
-- was accepted for this project because the order ID authorises nothing.
create sequence if not exists public.enrollment_order_seq as bigint start with 1;

create or replace function public.next_enrollment_order_id()
returns text
language sql
volatile
set search_path = public
as $$
  select 'DP-'
    || to_char(now() at time zone 'utc', 'YYMMDD')
    || '-'
    || lpad(nextval('public.enrollment_order_seq')::text, 5, '0');
$$;

comment on function public.next_enrollment_order_id() is
  'Allocates the next DP-YYMMDD-NNNNN order reference. Date part is UTC so the '
  'prefix does not shift with the caller''s timezone.';

-- Admin panel: newest-first queue, and the same filtered by status tab.
create index if not exists enrollments_created_at_idx
  on public.enrollments (created_at desc);

create index if not exists enrollments_status_created_at_idx
  on public.enrollments (status, created_at desc);

-- Per-course revenue/enrollment views.
create index if not exists enrollments_course_id_created_at_idx
  on public.enrollments (course_id, created_at desc);

-- Admin search by student. Email is stored as entered but matched case-insensitively.
create index if not exists enrollments_student_email_idx
  on public.enrollments (lower(student_email));

-- Reconciling storage objects against enrollment rows (see maintenance script).
create index if not exists enrollments_receipt_path_idx
  on public.enrollments (receipt_path)
  where receipt_path is not null;

-- Backs the token lookup in get_enrollment_by_token(). The unique constraint on
-- access_token_hash already provides an index; this one is intentionally omitted to
-- avoid a redundant duplicate. Listed here so the omission reads as deliberate.

drop trigger if exists enrollments_set_updated_at on public.enrollments;

create trigger enrollments_set_updated_at
before update on public.enrollments
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.enrollments enable row level security;

-- Deny-by-default for students. There is intentionally no `anon` policy on this
-- table: enrollment rows contain name, email, phone and payment state, and there is
-- no student login to scope them by. Privileges are revoked as well so a future
-- policy added by mistake still cannot be reached without a matching grant.
revoke all on public.enrollments from anon;
revoke all on sequence public.enrollment_order_seq from anon;

drop policy if exists "Admins can read enrollments" on public.enrollments;
create policy "Admins can read enrollments"
on public.enrollments
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can update enrollments" on public.enrollments;
create policy "Admins can update enrollments"
on public.enrollments
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete enrollments" on public.enrollments;
create policy "Admins can delete enrollments"
on public.enrollments
for delete
to authenticated
using (public.is_admin());

-- No INSERT policy at all, for any role. Enrollments are only ever created through
-- public.create_enrollment(), which owns the price snapshot and the token.

-- ---------------------------------------------------------------------------
-- Student-facing RPCs
-- ---------------------------------------------------------------------------
--
-- `search_path = public, extensions` — pgcrypto lives in `extensions` on Supabase,
-- so digest()/gen_random_bytes() do not resolve with `public` alone. The path is
-- pinned (never left to the caller) because these run as the definer.

-- Receipt object keys are produced by the client, so the shape is validated here
-- before it is trusted: "<draft uuid>/<object uuid>.<ext>". This does not by itself
-- prove ownership — anon cannot LIST the bucket, so keys are not enumerable — but it
-- stops arbitrary strings (or paths pointing outside the convention) being recorded.
create or replace function public.is_valid_receipt_path(candidate text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select candidate ~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    || '\.(jpg|jpeg|png|webp|pdf)$');
$$;

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

comment on function public.create_enrollment is
  'Creates one enrollment for a published course and returns its order id plus the '
  'single-issue access token. Price and title are snapshotted from the courses table, '
  'never from the caller.';

create or replace function public.get_enrollment_by_token(p_access_token text)
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
  updated_at timestamptz
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
    e.updated_at
  from public.enrollments e
  where e.access_token_hash = digest(p_access_token, 'sha256');
end;
$$;

comment on function public.get_enrollment_by_token is
  'Returns the student-safe view of one enrollment, addressed by its access token. '
  'Deliberately omits admin_note, reviewed_by, receipt_path and access_token_hash. '
  'Unknown tokens return zero rows — there is no distinguishable "not found" error.';

-- Execute rights are granted explicitly rather than relying on the default PUBLIC
-- grant, so the student surface is a short, readable list.
revoke all on function public.create_enrollment(
  text, text, text, text, text, text, text, integer, text
) from public;
revoke all on function public.get_enrollment_by_token(text) from public;
revoke all on function public.next_enrollment_order_id() from public;

grant execute on function public.create_enrollment(
  text, text, text, text, text, text, text, integer, text
) to anon, authenticated;
grant execute on function public.get_enrollment_by_token(text) to anon, authenticated;

