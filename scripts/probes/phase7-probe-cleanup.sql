-- Cleanup for the Phase 7 probe suites.
--
-- Every row this deletes was created by a probe run against an address of the form
-- probe+<uuid>@example.com. The pattern is matched explicitly rather than deleting
-- by table, so a real address can never be caught by it, and the counts are printed
-- before and after so the deletion is verifiable rather than merely asserted.
select
  (select count(*) from public.email_outbox        where to_email like 'probe+%@example.com')::int as outbox_before,
  (select count(*) from public.email_verifications where email    like 'probe+%@example.com')::int as verifications_before,
  (select count(*) from public.session_reminders   where email    like 'probe+%@example.com')::int as reminders_before;

delete from public.email_outbox        where to_email like 'probe+%@example.com';
delete from public.email_verifications where email    like 'probe+%@example.com';
delete from public.session_reminders   where email    like 'probe+%@example.com';

select
  (select count(*) from public.email_outbox        where to_email like 'probe+%@example.com')::int as outbox_after,
  (select count(*) from public.email_verifications where email    like 'probe+%@example.com')::int as verifications_after,
  (select count(*) from public.session_reminders   where email    like 'probe+%@example.com')::int as reminders_after,
  (select count(*) from public.email_outbox)::int        as outbox_total,
  (select count(*) from public.email_verifications)::int as verifications_total;
