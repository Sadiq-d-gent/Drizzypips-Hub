-- =============================================================================
-- MAINTENANCE — ORPHANED RECEIPT OBJECTS (IDENTIFY ONLY)
-- =============================================================================
--
-- THIS FILE IS NOT A MIGRATION AND IS NOT SCHEDULED.
-- It is a documented manual procedure. Nothing in Phase 3 runs it automatically, and
-- it must not be wired to a cron job without the review noted under SAFETY below.
--
-- THIS FILE DOES NOT DELETE ANYTHING. IT ONLY IDENTIFIES.
--   Deletion is done through the Storage API — see DELETING, below.
--
-- THE PROBLEM
--   A receipt is uploaded to the `receipts` bucket *before* the enrollment row is
--   created — the upload has to finish so its path can be passed to
--   public.create_enrollment(). That ordering is what makes a real progress bar
--   possible, but it means any student who uploads a file and then abandons the form
--   leaves an object behind that no enrollment references.
--
--   These orphans are harmless but not free: they consume storage, and they contain
--   whatever the student photographed, which is usually a bank statement. Clearing
--   them periodically is a privacy measure as much as a housekeeping one.
--
-- WHY THIS FILE NO LONGER DELETES
--   An earlier version of this file ended with a `delete from storage.objects`.
--   That was wrong. `storage.objects` is a bookkeeping table for a service that also
--   owns bytes in an object store; the row and the file are two halves of one record.
--   Deleting the row removes the half Postgres can see and orphans the half it
--   cannot, which is the opposite of what this procedure is for — the point is to
--   reclaim storage and remove a student's bank statement, and a SQL delete does
--   neither. Supabase guards against this directly: `storage.protect_delete()` is
--   attached to `storage.objects` to stop out-of-band deletes, so the statement
--   would likely have errored anyway. Working around that trigger would have been a
--   worse outcome than the error, because it would have "succeeded" while silently
--   leaving every file behind.
--
--   The supported path is the Storage API, which deletes the object and its row
--   together, as one operation, through the service that owns both.
--
-- HOW TO RUN
--   Run the query below as a privileged role (SQL Editor / service role). The anon
--   role cannot list storage objects, which is the point.
--
-- SAFETY
--   * The 24-hour grace window must stay comfortably longer than the time between an
--     upload finishing and create_enrollment() being called. That gap is normally
--     seconds; 24 hours means a clock skew or a long-open browser tab cannot cause a
--     receipt to be deleted out from under a live submission.
--   * Read the full result before deleting anything. An unexpectedly large orphan
--     count usually means the submit step is failing, not that students are
--     abandoning the form — investigate before clearing the evidence.
--   * Before automating this, confirm the retention question with the business's
--     accountant/legal adviser — an abandoned receipt is not obviously a business
--     record, but "obviously" is not a standard worth relying on for payment data.
--     See the retention note on public.enrollments in 002_create_enrollments.sql.
--
-- =============================================================================
-- IDENTIFY (read only, safe to run at any time)
-- =============================================================================

select
  o.name as object_path,
  o.created_at,
  round((o.metadata ->> 'size')::numeric / 1024, 1) as size_kb,
  o.metadata ->> 'mimetype' as mime_type
from storage.objects o
where o.bucket_id = 'receipts'
  and o.created_at < now() - interval '24 hours'
  and not exists (
    select 1
    from public.enrollments e
    where e.receipt_path = o.name
  )
order by o.created_at;

-- Totals, if you want the size before deciding:
--
--   select
--     count(*) as orphan_count,
--     pg_size_pretty(coalesce(sum((o.metadata ->> 'size')::bigint), 0)) as total_size
--   from storage.objects o
--   where o.bucket_id = 'receipts'
--     and o.created_at < now() - interval '24 hours'
--     and not exists (select 1 from public.enrollments e where e.receipt_path = o.name);

-- =============================================================================
-- DELETING
-- =============================================================================
-- Take the object_path values from the query above and remove them with the Storage
-- API, using the SERVICE ROLE key. That key bypasses RLS and must never appear in
-- frontend code, in VITE_* variables, or in anything committed to this repository —
-- run this from a trusted machine with the key supplied by the environment.
--
--   supabase storage rm \
--     ss:///receipts/<uuid-folder>/<uuid-object>.png
--
-- or, from a trusted Node script (not the browser):
--
--   const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);
--   const { data, error } = await admin.storage.from("receipts").remove(paths);
--
-- `remove()` takes up to 1000 paths per call and returns the objects it deleted, so
-- compare that list against the paths you passed rather than assuming success.
--
-- After deleting, re-run the IDENTIFY query. It should return zero rows; anything
-- still listed was not actually removed.
--
-- =============================================================================
-- RELATED CHECK — enrollments pointing at a missing object
-- =============================================================================
-- The opposite inconsistency: a row claims a receipt that is no longer in the bucket.
-- This should return zero rows. Anything here means a receipt was deleted while its
-- enrollment still needed it — investigate rather than clean up.
--
--   select e.order_id, e.receipt_path, e.status, e.created_at
--   from public.enrollments e
--   where e.receipt_path is not null
--     and not exists (
--       select 1
--       from storage.objects o
--       where o.bucket_id = 'receipts' and o.name = e.receipt_path
--     )
--   order by e.created_at desc;
--
-- =============================================================================
