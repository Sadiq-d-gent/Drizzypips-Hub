-- 018_email_dispatch.sql
--
-- Phase 7: the three operations a dispatcher performs, defined in the database rather than
-- in the dispatcher.
--
--   claim_email_batch()        take ownership of queued rows, so two dispatchers cannot
--                              send the same email
--   complete_email_delivery()  record the outcome, and redact the payload on success
--   requeue_stuck_emails()     return rows abandoned by a crashed dispatcher
--
-- WHY THESE ARE SQL FUNCTIONS AND NOT supabase-js CALLS
--
-- The Edge Function holds the service role, which bypasses RLS, so it *could* do all three
-- with plain table writes. Three reasons it does not:
--
--   The redaction is a promise, not a convention. 015's header states that the plaintext
--   code's window closes at delivery: "The send-email Edge Function therefore redacts
--   payload on the same update that marks the row sent". If that lives in TypeScript, the
--   promise holds until someone edits the TypeScript. Here it is the same UPDATE that sets
--   status = 'sent', so a row cannot be marked delivered while still carrying a live code.
--
--   The claim has to be atomic and PostgREST cannot express it. See below.
--
--   014 already decided the outbox has no write policy for anybody. Keeping the writes in
--   definer functions means that stays true with service_role as the only exception, and the
--   set of things that can happen to a row is a short readable list rather than whatever the
--   dispatcher happens to send.
--
-- HOW THE CLAIM IS SAFE, AND WHY IT STILL USES skip locked
--
-- `update ... where status = 'queued'` is already race-free under READ COMMITTED: a second
-- dispatcher blocks on the locked row, then re-evaluates its WHERE against the committed new
-- version, sees 'sending', and skips it. Correctness does not need `for update skip locked`.
--
-- It is used anyway, because without it the second dispatcher *blocks* rather than moving
-- on, and two overlapping invocations, a cron tick and a manual drain, would serialise
-- instead of sharing the work. skip locked turns a correct-but-slow interaction into a
-- correct-and-parallel one.
--
-- WHY attempts IS INCREMENTED AT CLAIM TIME
--
-- Because the failure this protects against is a dispatcher that dies rather than one that
-- reports an error. A row whose payload crashes the renderer would otherwise be claimed,
-- kill the function before it can report anything, be requeued by the reaper, and repeat
-- forever. Counting at claim means the loop terminates: five claims and the row is refused
-- by the max-attempts filter, whatever happened afterwards.
--
-- The cost is that a dispatcher crash burns an attempt on innocent rows. Five attempts is
-- chosen with that in mind, and the reaper distinguishes the two cases in last_error.
--
-- AT LEAST ONCE, AND WHAT MAKES THAT ACCEPTABLE
--
-- If the provider accepts an email and the dispatcher dies before recording it, the reaper
-- requeues the row and it sends twice. No amount of SQL fixes this: the commit and the API
-- call cannot be one atomic act.
--
-- The answer is on the other side. The Edge Function sends the outbox row id as Resend's
-- Idempotency-Key, so a redelivery of the same row is recognised and dropped by the
-- provider rather than arriving in the student's inbox. The database guarantees at least
-- once; the idempotency key turns that into at most one delivery. 014's dedupe_key is the
-- same idea one layer up, stopping the duplicate from ever being enqueued.

-- ---------------------------------------------------------------------------
-- public.claim_email_batch(integer)
-- ---------------------------------------------------------------------------

create or replace function public.claim_email_batch(p_limit integer default 20)
returns table (
  id uuid,
  template text,
  to_email text,
  payload jsonb,
  attempts integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  return query
  with claimed as (
    select o.id
    from public.email_outbox o
    where o.status = 'queued'
      and o.send_after <= now()
      and o.attempts < 5
    order by o.send_after, o.created_at
    limit v_limit
    for update skip locked
  )
  update public.email_outbox o
  set status = 'sending',
      attempts = o.attempts + 1
  from claimed c
  where o.id = c.id
  returning o.id, o.template, o.to_email, o.payload, o.attempts;
end;
$$;

comment on function public.claim_email_batch(integer) is
  'Takes ownership of up to p_limit due emails, marking them sending and counting the '
  'attempt. Uses for-update-skip-locked so overlapping dispatchers share the queue instead '
  'of serialising. Rows at five attempts are never claimed again.';

-- ---------------------------------------------------------------------------
-- public.email_outbox.payload_provider_id
-- ---------------------------------------------------------------------------
--
-- The provider's own id for the message, kept so a delivery question can be traced into the
-- provider's dashboard after the payload has been redacted. Added here rather than in 014
-- because it only means something once there is a dispatcher to fill it in.
--
-- Declared before the function that writes it. A PL/pgSQL body is not resolved against the
-- catalogue until it first runs, so the reverse order would have created cleanly and then
-- failed at the first delivery. 017 shipped exactly that mistake in its pg_cron block.

alter table public.email_outbox
  add column if not exists payload_provider_id text;

comment on column public.email_outbox.payload_provider_id is
  'The mail provider''s message id. The one durable handle on a delivery once the payload '
  'has been redacted.';

-- ---------------------------------------------------------------------------
-- public.complete_email_delivery(uuid, text, text)
-- ---------------------------------------------------------------------------
--
-- One call per claimed row, whatever happened. p_error null means the provider accepted it.
--
-- The retry schedule is quadratic in the attempt number: roughly 1, 4, 9 and 16 minutes.
-- Gentler than doubling, which would push the fifth attempt over an hour out, and a
-- verification code expires in ten minutes, so an hour-late retry would deliver a code that
-- is already dead. Better to exhaust the attempts while the code still means something.
create or replace function public.complete_email_delivery(
  p_id uuid,
  p_provider_id text default null,
  p_error text default null
)
returns public.email_status
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_attempts integer;
  v_template text;
  v_new_status public.email_status;
begin
  select o.attempts, o.template into v_attempts, v_template
  from public.email_outbox o
  where o.id = p_id
  for update;

  if not found then
    raise exception 'No such outbox row'
      using errcode = 'no_data_found';
  end if;

  if p_error is null then
    -- Delivered. The redaction and the status change are one statement, deliberately: see
    -- the header. A verification payload is the only one that carries a secret, so it is
    -- the only one stripped, and the key is replaced with a marker rather than removed
    -- silently, so the delivery log reads as "there was a code here" and not as a row that
    -- never had one.
    update public.email_outbox o
    set status = 'sent',
        sent_at = now(),
        last_error = null,
        payload = case
          when v_template = 'verification_code'
            then (o.payload - 'code') || jsonb_build_object('code_redacted', true)
          else o.payload
        end,
        payload_provider_id = p_provider_id
    where o.id = p_id;

    return 'sent'::public.email_status;
  end if;

  -- Failed. Exhausted attempts stop here; anything else goes back on the queue with backoff.
  if v_attempts >= 5 then
    v_new_status := 'failed';
  else
    v_new_status := 'queued';
  end if;

  update public.email_outbox o
  set status = v_new_status,
      last_error = left(p_error, 2000),
      send_after = case
        when v_new_status = 'queued'
          then now() + make_interval(secs => (v_attempts * v_attempts * 60))
        else o.send_after
      end
  where o.id = p_id;

  return v_new_status;
end;
$$;

comment on function public.complete_email_delivery(uuid, text, text) is
  'Records the outcome of one delivery attempt. On success it marks the row sent and '
  'redacts a verification code in the same statement, so a row can never read as delivered '
  'while still carrying a live code. On failure it requeues with quadratic backoff, or '
  'marks failed once five attempts are spent.';

-- ---------------------------------------------------------------------------
-- public.requeue_stuck_emails(interval)
-- ---------------------------------------------------------------------------
--
-- A row sits in 'sending' only between a claim and its completion. One that has been there
-- for longer than a dispatcher run can plausibly take belongs to an invocation that died,
-- and without this it would sit there permanently: nothing else ever looks at 'sending'.
--
-- last_error says so explicitly, because "the dispatcher died" and "the provider rejected
-- it" are different problems and a delivery log that blurs them is not worth reading.
--
-- Both branches of the status CASE carry an explicit cast. A bare 'failed' assigned straight
-- to the column would be coerced to email_status, but a CASE with two unknown-typed literals
-- resolves to text on its own, before the assignment is considered, and the update is then
-- rejected. Caught by the probe on first run.
create or replace function public.requeue_stuck_emails(p_older_than interval default '10 minutes')
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count integer;
begin
  with stuck as (
    update public.email_outbox o
    set status = case
          when o.attempts >= 5 then 'failed'::public.email_status
          else 'queued'::public.email_status
        end,
        last_error = 'Dispatcher did not report an outcome; requeued by requeue_stuck_emails()'
    where o.status = 'sending'
      and o.updated_at < now() - p_older_than
    returning o.id
  )
  select count(*) into v_count from stuck;

  return coalesce(v_count, 0);
end;
$$;

comment on function public.requeue_stuck_emails(interval) is
  'Returns rows abandoned mid-send by a crashed dispatcher to the queue, or fails them if '
  'their attempts are spent. Nothing else inspects the sending state, so without this a '
  'row stranded there would never move again.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
--
-- service_role only, on all three. These are the dispatcher's operations: a visitor has no
-- reason to claim an email, and an admin marking a row sent from the panel would suppress a
-- message a student is owed, which is the same reasoning 014 gives for granting the panel
-- SELECT and nothing else.
--
-- Revoked from each role by name rather than only from public. Supabase grants EXECUTE on
-- new functions in this schema to anon and authenticated via ALTER DEFAULT PRIVILEGES, and
-- `revoke ... from public` does not remove a grant a role holds explicitly. Verifying 017
-- caught a definer function left executable by anon for exactly this reason.

revoke all on function public.claim_email_batch(integer) from public;
revoke all on function public.claim_email_batch(integer) from anon;
revoke all on function public.claim_email_batch(integer) from authenticated;
grant execute on function public.claim_email_batch(integer) to service_role;

revoke all on function public.complete_email_delivery(uuid, text, text) from public;
revoke all on function public.complete_email_delivery(uuid, text, text) from anon;
revoke all on function public.complete_email_delivery(uuid, text, text) from authenticated;
grant execute on function public.complete_email_delivery(uuid, text, text) to service_role;

revoke all on function public.requeue_stuck_emails(interval) from public;
revoke all on function public.requeue_stuck_emails(interval) from anon;
revoke all on function public.requeue_stuck_emails(interval) from authenticated;
grant execute on function public.requeue_stuck_emails(interval) to service_role;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- VERIFICATION (run manually; not executed as part of the migration)
-- ---------------------------------------------------------------------------
--
-- Expected: all three functions grant EXECUTE to service_role and to nobody else.
--
-- select jsonb_pretty(jsonb_object_agg(p.proname, jsonb_build_object(
--          'acl', array_to_string(p.proacl, ' | '),
--          'anon', has_function_privilege('anon', p.oid, 'execute'),
--          'authenticated', has_function_privilege('authenticated', p.oid, 'execute'))))
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in ('claim_email_batch', 'complete_email_delivery', 'requeue_stuck_emails');
--
-- -- A claim/complete round trip, proving the redaction:
-- --   select public.enqueue_email('verification_code', 'probe-018@example.com',
-- --                               '{"code":"123456"}'::jsonb);
-- --   select * from public.claim_email_batch(10);       -- payload still carries the code
-- --   select public.complete_email_delivery('<that id>', 'resend_abc');
-- --   select payload from public.email_outbox where to_email = 'probe-018@example.com';
-- --                                                    -- expect code_redacted, no code
-- --   delete from public.email_outbox where to_email = 'probe-018@example.com';
