-- supabase/migrations/020_schedule_email_dispatch.sql
--
-- Phase 7: create the two cron jobs that 017 intended to create.
--
-- WHY THIS MIGRATION EXISTS
--
-- 017's closing `do` block already schedules these two jobs. It is guarded on pg_cron
-- being installed, and pg_cron was absent when 017 was applied, so the block took its
-- early return and the jobs were never created. 017 has been applied and must not be
-- edited, and an applied migration does not run again, so the jobs need a migration of
-- their own. This is that migration and nothing more.
--
-- WHAT IT ADDS
--
-- Two rows in cron.job. No table, no function, no grant, no policy, no template, no
-- column. Both functions it schedules already exist and are left exactly as 017 wrote
-- them:
--
--   public.dispatch_session_reminders()   pure SQL, moves due reminders into the outbox
--   public.dispatch_email_outbox()        017:454, pokes the Edge Function over pg_net
--
-- This is deliberately not a second email system. The outbox, the templates, the claim
-- and complete functions, and the single Edge Function that talks to Resend are all
-- unchanged. All this migration adds is a clock.
--
-- PREREQUISITES, AND WHY THIS RAISES RATHER THAN SKIPS
--
-- pg_cron and pg_net are dashboard actions on Supabase (Database, Extensions) and cannot
-- be enabled from a migration. 017 chose to skip quietly when they were missing, which
-- was right there: scheduling was optional to everything above it in that file. Here
-- scheduling is the entire point, so a missing extension raises. A silent skip is
-- precisely what left these jobs uncreated the first time, and repeating it would hide
-- the same failure twice.
--
-- The two Vault secrets are treated differently and only warn. dispatch_email_outbox()
-- already looks them up at call time and returns 0 with a notice when either is absent,
-- so a job created before the secrets exist is harmless and begins working the moment
-- they are created. Forcing an order between the two would buy nothing.
--
-- IDEMPOTENCE
--
-- cron.schedule() matches on job name and updates an existing job of the same name
-- rather than adding a duplicate, so re-running this migration re-asserts the two
-- schedules instead of accumulating jobs.

do $$
declare
  v_url_present    boolean;
  v_secret_present boolean;
begin
  -- -------------------------------------------------------------------------
  -- Prerequisites
  -- -------------------------------------------------------------------------
  if to_regnamespace('cron') is null then
    raise exception
      'pg_cron is not installed, so the email dispatch schedule cannot be created. '
      'Enable it in the Supabase dashboard under Database, Extensions, then re-run this '
      'migration. Nothing else in Phase 7 depends on it: until then, invoke the '
      'send-email Edge Function on an external schedule instead.'
      using errcode = 'CR001';
  end if;

  if to_regnamespace('net') is null then
    raise exception
      'pg_net is not installed, so drain-email-outbox would be created as a permanent '
      'no-op: dispatch_email_outbox() returns 0 without pg_net. Enable pg_net in the '
      'Supabase dashboard under Database, Extensions, then re-run this migration.'
      using errcode = 'CR002';
  end if;

  -- -------------------------------------------------------------------------
  -- Reminder sweep, every five minutes.
  --
  -- Pure SQL, so this job is useful even if the drain below never posts. It moves
  -- session_reminders rows that are due into email_outbox; it does not send.
  -- -------------------------------------------------------------------------
  perform cron.schedule(
    'dispatch-session-reminders',
    '*/5 * * * *',
    $job$ select public.dispatch_session_reminders(); $job$
  );

  -- -------------------------------------------------------------------------
  -- Outbox drain, every minute.
  --
  -- dispatch_email_outbox() counts queued rows with send_after <= now() and returns
  -- 0 without posting when there are none, so an idle minute costs one count. When
  -- there is work it reads edge_send_email_url and edge_send_email_secret from Vault
  -- and makes one pg_net POST to the Edge Function. It never reads a payload and never
  -- marks a row sent; the Edge Function claims rows itself, so there remains exactly
  -- one component that talks to the mail provider.
  -- -------------------------------------------------------------------------
  perform cron.schedule(
    'drain-email-outbox',
    '* * * * *',
    $job$ select public.dispatch_email_outbox(); $job$
  );

  -- -------------------------------------------------------------------------
  -- Vault, advisory only. See the header.
  -- -------------------------------------------------------------------------
  select exists(select 1 from vault.secrets where name = 'edge_send_email_url'),
         exists(select 1 from vault.secrets where name = 'edge_send_email_secret')
    into v_url_present, v_secret_present;

  if not v_url_present or not v_secret_present then
    raise notice
      'Both cron jobs are scheduled, but Vault is missing %. Until it is created, '
      'drain-email-outbox runs and does nothing: dispatch_email_outbox() declines to '
      'post when either secret is absent. Reminders are still queued on schedule.',
      case
        when not v_url_present and not v_secret_present
          then 'edge_send_email_url and edge_send_email_secret'
        when not v_url_present then 'edge_send_email_url'
        else 'edge_send_email_secret'
      end;
  end if;
end $$;
