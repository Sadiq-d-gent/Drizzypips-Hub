-- scripts/probes/phase7-queue-e2e.sql
--
-- Phase 7: does the existing system queue the right email for each event?
--
-- Runs the four enqueue paths end to end against the real functions on the real
-- database, then ROLLS BACK. Nothing is written: no probe rows to clean up, no
-- order-id sequence burned, no production row altered. The result set survives
-- the rollback, which is what makes this readable.
--
--   psql-equivalent:  supabase db query --linked < scripts/probes/phase7-queue-e2e.sql
--
-- Every step is wrapped in its own exception block, so one failure reports itself
-- rather than aborting the run and hiding the other three.
--
-- The verification code is never printed. A verification_code row carries a live
-- code in its payload until the send redacts it (015's design), and a terminal
-- scrollback is exactly the kind of durable copy 015 exists to avoid. This script
-- reports whether the key is present, never its value.

begin;

create temp table probe_result (
  seq      integer generated always as identity,
  step     text,
  ok       boolean,
  detail   text
) on commit drop;

do $probe$
declare
  c_approve  constant text := 'probe+approve@example.com';
  c_reject   constant text := 'probe+reject@example.com';
  c_remind   constant text := 'probe+reminder@example.com';
  v_admin    uuid;
  v_slug     text;
  v_code     text;
  v_order    text;
  v_enrol    uuid;
  v_n        integer;
begin
  -- ---------------------------------------------------------------------
  -- 0. Identity. is_admin() reads auth.uid(), which reads the jwt claims
  --    GUC, so borrowing the real admin's id is how a review is authorised
  --    here exactly as it would be through PostgREST.
  -- ---------------------------------------------------------------------
  select auth_id into v_admin from public.admins order by created_at limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);

  select slug into v_slug from public.courses where published order by created_at limit 1;

  insert into probe_result(step, ok, detail) values (
    'setup', v_admin is not null and v_slug is not null,
    format('admin bound: %s · is_admin(): %s · program: %s',
           v_admin is not null, public.is_admin(), coalesce(v_slug, 'none')));

  -- ---------------------------------------------------------------------
  -- 1. Verification queues a verification_code
  -- ---------------------------------------------------------------------
  begin
    perform public.request_email_verification(c_approve);

    select payload ->> 'code' into v_code
      from public.email_outbox
     where to_email = c_approve and template = 'verification_code'
     order by created_at desc limit 1;

    insert into probe_result(step, ok, detail)
    select 'verification queues verification_code',
           count(*) = 1 and v_code is not null,
           format('%s row(s) · code present in payload: %s · dedupe_key: %s',
                  count(*), v_code is not null,
                  coalesce(max(dedupe_key), 'null (deliberate, 015)'))
      from public.email_outbox
     where to_email = c_approve and template = 'verification_code';
  exception when others then
    insert into probe_result(step, ok, detail)
    values ('verification queues verification_code', false, sqlstate || ': ' || sqlerrm);
  end;

  -- ---------------------------------------------------------------------
  -- 2. Enrollment queues enrollment_pending, approval queues approved
  -- ---------------------------------------------------------------------
  begin
    perform public.verify_email_code(c_approve, v_code);

    select order_id into v_order
      from public.create_enrollment(v_slug, 'Probe Approve', c_approve, '+2348000000001');

    select id into v_enrol from public.enrollments where order_id = v_order;

    insert into probe_result(step, ok, detail)
    select 'enrollment queues enrollment_pending', count(*) = 1,
           format('order %s · %s row(s) · dedupe_key: %s', v_order, count(*), max(dedupe_key))
      from public.email_outbox
     where to_email = c_approve and template = 'enrollment_pending';

    perform public.review_enrollment(v_enrol, 'approved', 'probe run, rolled back');

    insert into probe_result(step, ok, detail)
    select 'approval queues enrollment_approved', count(*) = 1,
           format('%s row(s) · dedupe_key: %s · course_title: %s',
                  count(*), max(dedupe_key), max(payload ->> 'course_title'))
      from public.email_outbox
     where to_email = c_approve and template = 'enrollment_approved';

    -- The wrong template must NOT also be queued.
    select count(*) into v_n from public.email_outbox
     where to_email = c_approve and template = 'enrollment_rejected';

    insert into probe_result(step, ok, detail)
    values ('approval queues no rejection email', v_n = 0, format('%s enrollment_rejected row(s)', v_n));
  exception when others then
    insert into probe_result(step, ok, detail)
    values ('approval path', false, sqlstate || ': ' || sqlerrm);
  end;

  -- ---------------------------------------------------------------------
  -- 3. Rejection queues enrollment_rejected, carrying the reason
  -- ---------------------------------------------------------------------
  begin
    perform public.request_email_verification(c_reject);

    select payload ->> 'code' into v_code
      from public.email_outbox
     where to_email = c_reject and template = 'verification_code'
     order by created_at desc limit 1;

    perform public.verify_email_code(c_reject, v_code);

    select order_id into v_order
      from public.create_enrollment(v_slug, 'Probe Reject', c_reject, '+2348000000002');

    select id into v_enrol from public.enrollments where order_id = v_order;

    perform public.review_enrollment(v_enrol, 'rejected', 'probe run, rolled back', 'Receipt was unreadable');

    insert into probe_result(step, ok, detail)
    select 'rejection queues enrollment_rejected', count(*) = 1,
           format('%s row(s) · dedupe_key: %s · rejection_reason carried: %s',
                  count(*), max(dedupe_key), max(payload ->> 'rejection_reason'))
      from public.email_outbox
     where to_email = c_reject and template = 'enrollment_rejected';

    select count(*) into v_n from public.email_outbox
     where to_email = c_reject and template = 'enrollment_approved';

    insert into probe_result(step, ok, detail)
    values ('rejection queues no approval email', v_n = 0, format('%s enrollment_approved row(s)', v_n));
  exception when others then
    insert into probe_result(step, ok, detail)
    values ('rejection path', false, sqlstate || ': ' || sqlerrm);
  end;

  -- ---------------------------------------------------------------------
  -- 4. Reminder subscription queues reminder_confirmed
  --
  --    The live countdown has already passed, so reminders are off by 017's
  --    own guard. Moving it forward inside a transaction that rolls back is
  --    how the path is exercised without touching the real setting.
  -- ---------------------------------------------------------------------
  begin
    update public.website_settings
       set countdown_enabled = true,
           countdown_reminders_enabled = true,
           countdown_session_at = now() + interval '48 hours';

    perform public.subscribe_session_reminder(c_remind);

    insert into probe_result(step, ok, detail)
    select 'reminder confirmation queues reminder_confirmed', count(*) = 1,
           format('%s row(s) · dedupe_key: %s', count(*), max(dedupe_key))
      from public.email_outbox
     where to_email = c_remind and template = 'reminder_confirmed';

    select count(*) into v_n from public.session_reminders where email = c_remind;
    insert into probe_result(step, ok, detail)
    values ('reminder subscription recorded', v_n = 1, format('%s session_reminders row(s)', v_n));
  exception when others then
    insert into probe_result(step, ok, detail)
    values ('reminder path', false, sqlstate || ': ' || sqlerrm);
  end;

  -- ---------------------------------------------------------------------
  -- 5. A double submit must not produce a second email
  -- ---------------------------------------------------------------------
  begin
    select id into v_enrol from public.enrollments
     where order_id in (select order_id from public.enrollments)
       and student_email = c_approve limit 1;

    begin
      perform public.review_enrollment(v_enrol, 'approved', 'probe retry');
    exception when others then null;  -- a refusal is a fine outcome here
    end;

    select count(*) into v_n from public.email_outbox
     where to_email = c_approve and template = 'enrollment_approved';

    insert into probe_result(step, ok, detail)
    values ('admin retry does not duplicate the email', v_n = 1,
            format('%s enrollment_approved row(s) after a second approve', v_n));
  exception when others then
    insert into probe_result(step, ok, detail)
    values ('retry path', false, sqlstate || ': ' || sqlerrm);
  end;

  -- ---------------------------------------------------------------------
  -- 6. Everything queued, with the code value withheld
  -- ---------------------------------------------------------------------
  insert into probe_result(step, ok, detail)
  select 'queued in total', count(*) = 7, string_agg(template || ' → ' || to_email, ' · ' order by created_at)
    from public.email_outbox
   where to_email like 'probe+%@example.com';

  insert into probe_result(step, ok, detail)
  select 'payload keys', true,
         string_agg(template || ': ' || (
           select string_agg(k, ',' order by k) from jsonb_object_keys(payload) k
         ), ' · ' order by created_at)
    from public.email_outbox
   where to_email like 'probe+%@example.com';

  insert into probe_result(step, ok, detail)
  select 'every queued row is claimable', count(*) = 7,
         format('status=queued: %s · send_after <= now(): %s',
                count(*) filter (where status = 'queued'),
                count(*) filter (where send_after <= now()))
    from public.email_outbox
   where to_email like 'probe+%@example.com';
end
$probe$;

select jsonb_pretty(jsonb_agg(
  jsonb_build_object('step', step, 'ok', ok, 'detail', detail) order by seq
)) as e2e from probe_result;

rollback;
