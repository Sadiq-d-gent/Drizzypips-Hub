-- 016_enrollment_email_notifications.sql
--
-- Phase 7: the database refuses an unverified enrollment, and every status change queues
-- the email that tells the student about it.
--
-- Three changes, in one file because they are one behaviour:
--
--   1. create_enrollment() refuses an address that has not verified, raising EV002.
--   2. create_enrollment() queues the "we have your submission" acknowledgement.
--   3. review_enrollment() queues the approved or rejected decision email, and gains a
--      student-facing rejection reason that is distinct from the internal admin note.
--
-- WHY BOTH FUNCTIONS ARE REPRODUCED IN FULL BELOW
--
-- `create or replace function` cannot patch a PL/pgSQL body: there is no way to say "the
-- same function, plus this guard". The whole body must be restated, which means this file
-- silently reverts any change made to either function since it was written. 010 established
-- the countermeasure and this file follows it exactly: measure the live function first,
-- record the fingerprint here, and make the VERIFICATION block at the bottom assert that
-- what was replaced is what this file expected to replace.
--
-- Both fingerprints were measured against the linked remote database immediately before
-- this migration was written, with:
--
--   select p.proname, length(p.prosrc), md5(p.prosrc), p.prosecdef, p.proconfig,
--          array_to_string(p.proacl, ' | ')
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('create_enrollment', 'review_enrollment');
--
-- PRE-APPLICATION STATE (measured, not assumed):
--
--   create_enrollment
--     signature   create_enrollment(text,text,text,text,text,text,text,integer,text)
--     length      6868
--     md5         cb78393b9ce7302d9ddca37c33e8d6ea
--     prosecdef   true
--     provolatile v
--     proconfig   {"search_path=public, extensions"}
--     proacl      postgres=X | anon=X | authenticated=X | service_role=X
--     contains    RL001, PA001, enrollment_enabled, next_enrollment_order_id,
--                 access_token_hash
--     lacks       EV002, has_verified_email, enqueue_email
--
--   review_enrollment
--     signature   review_enrollment(uuid, text, text)
--     length      2678
--     md5         146972d815b33a3e2b7a4582f58bd19c
--     prosecdef   true
--     provolatile v
--     proconfig   {"search_path=public, extensions"}
--     proacl      postgres=X | authenticated=X | service_role=X   (no anon, correctly)
--     contains    ST001, ST002, insufficient_privilege
--     lacks       EV002, enqueue_email, p_rejection_reason
--
-- The create_enrollment body below is 010's, byte for byte, with two insertions marked
-- "ADDED IN 016" and one restructuring of the final INSERT explained at its site. The
-- review_enrollment body is 007's with one added parameter, one added statement block, and
-- nothing removed. 010's own "ADDED IN 010" comments are preserved, so the archaeology
-- stays readable from the function body alone.
--
-- WHERE THE EV002 GUARD GOES, AND WHY NOT AFTER THE PAUSE CHECK
--
-- Immediately after the email format check, which is earlier than the plan sketched. The
-- ordering matters for three reasons:
--
--   - It is before the rate-limit count, so an unverified caller cannot use this function
--     to probe how many enrollments an address has recently made.
--   - It is before next_enrollment_order_id() in the INSERT. 010 makes this argument for
--     the pause check and it applies identically here: that sequence is non-transactional
--     and 002 notes the number discloses cumulative enrollment volume, so a refused
--     attempt must never reach it.
--   - It is after the format check, because has_verified_email() on a malformed string is
--     a meaningless question, and "not a valid email" is the more useful error.
--
-- It stays after the pause check, so a paused site refuses everyone identically rather than
-- revealing anything about verification state.
--
-- This is the sentence in the Phase 7 spec that matters most: the enrollment submission
-- itself must verify the email verification state server-side. The React step is a
-- courtesy. A caller who sets verified = true in component state, or who POSTs this RPC
-- directly with a fabricated address, lands here and is refused.
--
-- WHY THE RETURN-QUERY CTE BECOMES AN INSERT ... RETURNING INTO
--
-- 010 wraps the INSERT in a CTE because `return query insert ... returning` is not valid
-- PL/pgSQL. The acknowledgement email needs the order id, and a CTE inside `return query`
-- cannot assign to a variable. Re-reading the row afterwards would work but means a second
-- lookup for data the INSERT already produced.
--
-- So the INSERT captures into variables, then the enqueue reads them, then `return query
-- select` returns them. The columns inserted, their order, and their values are unchanged.
--
-- WHY THE ENQUEUE IS NOT WRAPPED IN AN EXCEPTION HANDLER
--
-- A failure inside enqueue_email() aborts the enrollment. That coupling is deliberate for
-- review_enrollment, where an approval whose email silently vanished is exactly the failure
-- the outbox exists to prevent. For create_enrollment the same coupling is defensible
-- because the insert cannot realistically fail: the table has RLS bypassed by SECURITY
-- DEFINER, the address already passed the same regex the column checks, and dedupe_key is
-- unique on a freshly generated order id. Catching here would add a path that silently
-- swallows a real bug in exchange for guarding against a failure the schema already
-- excludes.
--
-- WHY A NEW rejection_reason COLUMN RATHER THAN REUSING admin_note
--
-- The spec asks for a rejection email carrying the rejection note. `admin_note` is the
-- obvious candidate and is the wrong one. It is promised to be private in four places: the
-- comment on get_enrollment_by_token() at 002:472-475, which "deliberately omits
-- admin_note"; the doc comment on ReviewActions.tsx; that component's helper text, which
-- tells the admin "Internal only, the student never sees this"; and its placeholder, which
-- invites a candid "Why are you approving or rejecting this?".
--
-- An administrator has been told the box is private and may have written accordingly.
-- Emailing its contents would retroactively publish notes written under a promise of
-- privacy, and the spec's own instruction is to preserve existing admin behaviour. So the
-- internal note stays internal, and a separate, explicitly student-facing field carries the
-- explanation. The admin writes the student's reason knowing it is for the student.
--
-- The parameter is optional, so a rejection without one still works and simply sends the
-- email without a reason paragraph.
--
-- WHY THE OLD THREE-ARGUMENT review_enrollment IS DROPPED
--
-- Adding a defaulted fourth parameter creates a *new* function rather than replacing the
-- old one: PostgreSQL keys functions by argument types. Leaving both would make
-- `review_enrollment(uuid, text, text)` ambiguous, and PostgreSQL refuses such a call
-- outright rather than picking one. The old signature is therefore dropped explicitly. The
-- frontend's existing three-argument call continues to work against the new function via
-- the default.

-- ---------------------------------------------------------------------------
-- Student-facing rejection reason
-- ---------------------------------------------------------------------------

alter table public.enrollments
  add column if not exists rejection_reason text
    check (rejection_reason is null or char_length(rejection_reason) <= 1000);

comment on column public.enrollments.rejection_reason is
  'Explanation shown to the student when an enrollment is rejected, and included in the '
  'rejection email. Deliberately separate from admin_note, which is internal and which '
  'get_enrollment_by_token() omits: the admin is told that box is private, so it is not '
  'repurposed as student-facing copy here.';

-- ---------------------------------------------------------------------------
-- public.create_enrollment  (full-body replacement; see the header)
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
  -- ADDED IN 016. Carry the inserted row out of the INSERT so the acknowledgement email
  -- can name the order without a second lookup. See the header.
  v_order_id text;
  v_status public.enrollment_status;
  v_created_at timestamptz;
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

  -- ADDED IN 016. The server-side verification gate.
  --
  -- This is the enforcement point for Phase 7's email verification. The wizard's verify
  -- step is a courtesy; a client that sets verified = true in React state, or that calls
  -- this RPC directly, is refused here.
  --
  -- Placed after the format check (has_verified_email on a malformed string is a
  -- meaningless question) and before the rate-limit count and the INSERT, so an
  -- unverified caller can neither probe how often an address has enrolled nor burn a
  -- volume-disclosing order id. See the header for the full ordering argument.
  --
  -- has_verified_email() is SECURITY DEFINER and is revoked from anon and authenticated:
  -- it is reachable here because this function runs as its owner, and it is deliberately
  -- not reachable as a question the browser can ask.
  if not public.has_verified_email(v_email) then
    -- Class 'E' is in the I-Z range PostgreSQL reserves for user-defined conditions.
    -- EV001 is 015's rate limit; EV002 is specifically "this address is not verified",
    -- so the frontend can return the student to the verify step rather than showing a
    -- dead end.
    raise exception 'Email address has not been verified'
      using errcode = 'EV002';
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

  -- CHANGED IN 016. 010 wrapped this in a CTE inside `return query`, because
  -- `return query insert ... returning` is not valid PL/pgSQL. The acknowledgement email
  -- needs the order id, and a CTE cannot assign to a variable, so the row is captured into
  -- variables here and returned by the `return query select` at the end. The columns, their
  -- order and their values are unchanged from 010.
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
  into v_order_id, v_status, v_created_at;

  -- ADDED IN 016. The acknowledgement, queued in this transaction.
  --
  -- If this statement or the insert above fails, no email was promised; if both succeed,
  -- the email is owed and survives the browser closing. That is the whole point of the
  -- outbox, and it is why this is not an HTTP call from the client after the RPC returns.
  --
  -- The dedupe_key names the email rather than the attempt. A fresh order id makes a
  -- collision impossible today, since a resubmission creates a different enrollment; it is
  -- set anyway so a future re-enqueue for the same enrollment is idempotent for free.
  --
  -- No access token in the payload. The confirmation URL is a bearer credential, and 002
  -- keeps it out of the database deliberately; putting it in an email payload would park it
  -- in a table with a longer life than the request.
  perform public.enqueue_email(
    'enrollment_pending',
    v_email,
    jsonb_build_object(
      'order_id', v_order_id,
      'student_name', v_name,
      'course_title', v_course.title,
      'price_amount', v_course.price,
      'price_currency', v_course.currency,
      'submitted_at', v_created_at
    ),
    'enrollment:' || v_order_id || ':pending'
  );

  return query select v_order_id, v_token, v_status, v_created_at;
end;
$$;

comment on function public.create_enrollment(
  text, text, text, text, text, text, text, integer, text
) is
  'Creates one enrollment from anonymous input, returning the access token exactly once. '
  'Refuses when enrollments are paused (PA001), when the email address has not been '
  'verified (EV002), and when an address has enrolled five times in the past hour (RL001). '
  'Queues the acknowledgement email in the same transaction.';

-- ---------------------------------------------------------------------------
-- public.review_enrollment  (full-body replacement; see the header)
-- ---------------------------------------------------------------------------

-- The old three-argument signature must go, or `review_enrollment(uuid, text, text)`
-- becomes ambiguous between it and the new four-argument form's default. See the header.
drop function if exists public.review_enrollment(uuid, text, text);

create or replace function public.review_enrollment(
  p_enrollment_id uuid,
  p_status text,
  p_admin_note text default null,
  p_rejection_reason text default null
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
  -- ADDED IN 016. The student-facing explanation, kept separate from v_note above.
  v_reason text := nullif(btrim(coalesce(p_rejection_reason, '')), '');
  v_email text;
  v_name text;
  v_course_title text;
  v_order_id text;
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

  -- ADDED IN 016. Same bound as the admin note and the same bound as the column check.
  if v_reason is not null and char_length(v_reason) > 1000 then
    raise exception 'Rejection reason must be 1000 characters or fewer'
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
    -- ADDED IN 016. Same coalesce reasoning. Only meaningful on a rejection, and left
    -- untouched by an approval rather than cleared, so the record of a reversed decision
    -- stays intact.
    rejection_reason = coalesce(v_reason, e.rejection_reason),
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

  -- ADDED IN 016. The decision email, queued in this transaction.
  --
  -- `return query` appends to the result set and does not exit the function, so this runs
  -- and commits with the UPDATE above. That coupling is the point: an approval whose email
  -- silently vanished is exactly the failure the outbox exists to prevent.
  --
  -- A second read of the row rather than threading the columns through the UPDATE's
  -- RETURNING list, because that list is the function's return shape and is part of the
  -- admin API. Adding student_email and course_title_snapshot to it to feed an email would
  -- widen what every caller receives. This is a primary-key lookup on a row already locked
  -- and in cache.
  select e.student_email, e.student_name, e.course_title_snapshot, e.order_id
  into v_email, v_name, v_course_title, v_order_id
  from public.enrollments e
  where e.id = p_enrollment_id;

  -- The dedupe_key carries the decision, so a re-review after a deliberate database-level
  -- status reset queues a genuinely different email rather than being swallowed as a
  -- duplicate. ST002 above makes a repeat through this function impossible anyway; this is
  -- for the manual path 005's history is designed to record.
  --
  -- rejection_reason is included only on a rejection, and admin_note is never included.
  -- The admin is told that box is private. See the header.
  perform public.enqueue_email(
    case when p_status = 'approved' then 'enrollment_approved' else 'enrollment_rejected' end,
    v_email,
    jsonb_build_object(
      'order_id', v_order_id,
      'student_name', v_name,
      'course_title', v_course_title,
      'reviewed_at', now()
    ) || case
           when p_status = 'rejected' and v_reason is not null
             then jsonb_build_object('rejection_reason', v_reason)
           else '{}'::jsonb
         end,
    'enrollment:' || v_order_id || ':' || p_status
  );
end;
$$;

comment on function public.review_enrollment(uuid, text, text, text) is
  'Approves or rejects one pending enrollment as the calling admin, and queues the '
  'decision email in the same transaction. p_admin_note stays internal and is never '
  'emailed; p_rejection_reason is the student-facing explanation and is included in the '
  'rejection email. Raises ST001 for any status other than approved/rejected and ST002 '
  'when the enrollment is no longer pending.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
--
-- Re-stated in full so this file does not depend on 002 and 007 having run first, matching
-- 010's reasoning. create_enrollment keeps its anon grant: an anonymous visitor is exactly
-- who calls it. review_enrollment is granted to authenticated only, and its first statement
-- is an admin lookup, so a signed-in non-admin reaches the function and is refused by it.

revoke all on function public.create_enrollment(
  text, text, text, text, text, text, text, integer, text
) from public;
grant execute on function public.create_enrollment(
  text, text, text, text, text, text, text, integer, text
) to anon, authenticated;

revoke all on function public.review_enrollment(uuid, text, text, text) from public;
revoke all on function public.review_enrollment(uuid, text, text, text) from anon;
grant execute on function public.review_enrollment(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Schema cache
-- ---------------------------------------------------------------------------
--
-- No earlier migration needs this, because none of them changed a function's argument
-- list: 010 replaced create_enrollment with the same signature, which PostgREST resolves
-- identically before and after. review_enrollment gains a fourth parameter here, and
-- PostgREST matches an RPC by the set of argument names in the posted body, so it must
-- learn the new signature before it will accept a call naming p_rejection_reason.
--
-- Supabase installs an event trigger that issues this automatically on DDL. It is stated
-- explicitly anyway: this file is applied with `db query`, the cost is nothing, and a
-- stale cache would present as a confusing 404 on a function that plainly exists.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- VERIFICATION (run manually; not executed as part of the migration)
-- ---------------------------------------------------------------------------
--
-- Expected, comparing against the PRE-APPLICATION STATE recorded in the header:
--
--   create_enrollment    md5 CHANGED from cb78393b9ce7302d9ddca37c33e8d6ea
--                        contains EV002, has_verified_email, enqueue_email
--                        still contains RL001, PA001, enrollment_enabled,
--                                       next_enrollment_order_id, access_token_hash
--                        prosecdef still true, proconfig still {search_path=public, extensions}
--                        proacl still includes anon=X
--
--   review_enrollment    md5 CHANGED from 146972d815b33a3e2b7a4582f58bd19c
--                        signature now (uuid, text, text, text)
--                        exactly ONE review_enrollment function exists
--                        contains enqueue_email, rejection_reason
--                        still contains ST001, ST002, insufficient_privilege
--                        proacl still has NO anon
--
-- select jsonb_pretty(jsonb_agg(f order by f ->> 'name')) from (
--   select jsonb_build_object(
--     'name', p.proname,
--     'signature', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
--     'md5', md5(p.prosrc),
--     'prosecdef', p.prosecdef,
--     'proconfig', p.proconfig,
--     'proacl', array_to_string(p.proacl, ' | '),
--     'contains', jsonb_build_object(
--       'EV002', p.prosrc like '%EV002%',
--       'PA001', p.prosrc like '%PA001%',
--       'RL001', p.prosrc like '%RL001%',
--       'ST001', p.prosrc like '%ST001%',
--       'ST002', p.prosrc like '%ST002%',
--       'has_verified_email', p.prosrc like '%has_verified_email%',
--       'enqueue_email', p.prosrc like '%enqueue_email%',
--       'rejection_reason', p.prosrc like '%rejection_reason%',
--       'next_enrollment_order_id', p.prosrc like '%next_enrollment_order_id%',
--       'access_token_hash', p.prosrc like '%access_token_hash%',
--       'admin_note_in_payload', p.prosrc like '%''admin_note'',%')
--   ) as f
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('create_enrollment', 'review_enrollment')
-- ) s;
--
-- -- Exactly one review_enrollment, i.e. the three-argument form is gone:
-- --   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- --    where n.nspname = 'public' and p.proname = 'review_enrollment';   -- expect 1
--
-- -- An unverified address is refused. Expect EV002, and expect zero new enrollments:
-- --   select * from public.create_enrollment(
-- --     '<a published slug>', 'Probe Student', 'probe-016@example.com', '08012345678');
