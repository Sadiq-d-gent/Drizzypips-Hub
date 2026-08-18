-- =============================================================================
-- MAINTENANCE — ORPHANED COURSE THUMBNAIL OBJECTS (IDENTIFY ONLY)
-- =============================================================================
--
-- THIS FILE IS NOT A MIGRATION AND IS NOT SCHEDULED.
-- It is a documented manual procedure, the counterpart to
-- cleanup_orphan_receipts.sql for the `course-thumbnails` bucket created in 008.
--
-- THIS FILE DOES NOT DELETE ANYTHING. IT ONLY IDENTIFIES.
--   Deletion is done through the Storage API — see DELETING, below.
--
-- THE PROBLEM
--   A thumbnail is uploaded before the course row exists. On the create form there is
--   no course id yet, so the image goes to the bucket first and its public URL is
--   submitted with the rest of the form. An admin who uploads an image and then
--   abandons the form leaves an object no course references.
--
--   The second source is a failed cleanup. Replacing a thumbnail writes a new object
--   and then deletes the old one; that delete is best-effort, because losing the new
--   image because the old one could not be removed would be the worse outcome. A
--   transient storage failure therefore leaves the previous image behind.
--
-- HOW THIS DIFFERS FROM THE RECEIPTS CASE
--   Only in seriousness. An orphaned receipt is a photograph of somebody's bank
--   statement, so clearing those is a privacy measure. An orphaned thumbnail is a
--   marketing image that was already published to a public bucket — there is nothing
--   to protect and nobody to protect it from. This is housekeeping: it reclaims
--   storage and keeps the bucket legible. Do not let that difference tempt you into
--   scheduling it more aggressively; see SAFETY.
--
-- WHY THIS FILE DOES NOT DELETE
--   Same reason as the receipts procedure. `storage.objects` is bookkeeping for a
--   service that also owns bytes in an object store, and the row and the file are two
--   halves of one record. `storage.protect_delete()` is attached to the table and
--   raises 42501 on any direct delete, with the message "Use the Storage API instead."
--   Setting `storage.allow_delete_query` to work around it would be worse than the
--   error: the statement would succeed, the row would vanish, and every file would
--   still be there — permanently unreferenced and now invisible to this query too.
--
-- HOW TO RUN
--   Run the query below as a privileged role (SQL Editor / service role). The anon
--   role cannot list storage objects even in a public bucket — a public bucket serves
--   objects by URL, it does not publish an index of them.
--
-- SAFETY
--   * The 24-hour grace window must stay comfortably longer than the time an admin
--     might spend on the create form after picking an image. That is normally a few
--     minutes; 24 hours means an interrupted afternoon cannot cost somebody their
--     upload.
--   * A large orphan count means the create form is failing after upload, or that
--     replace-cleanup is failing consistently. Investigate before clearing, because
--     the orphans are the evidence.
--   * Check the RELATED CHECK at the bottom first. A course pointing at a missing
--     object is a broken image on a public page, which is a live defect rather than
--     housekeeping.
--
-- =============================================================================
-- IDENTIFY (read only, safe to run at any time)
-- =============================================================================
--
-- courses.thumbnail_url stores a full public URL
-- (.../storage/v1/object/public/course-thumbnails/<folder>/<file>), not a bucket
-- path, because the column is rendered directly as an <img src> and is validated as a
-- URL. So the match is on the URL's tail rather than on equality. The `/` before the
-- bucket name keeps the pattern from matching a URL that merely ends with the same
-- characters.

select
  o.name as object_path,
  o.created_at,
  round((o.metadata ->> 'size')::numeric / 1024, 1) as size_kb,
  o.metadata ->> 'mimetype' as mime_type
from storage.objects o
where o.bucket_id = 'course-thumbnails'
  and o.created_at < now() - interval '24 hours'
  and not exists (
    select 1
    from public.courses c
    where c.thumbnail_url like '%/course-thumbnails/' || o.name
  )
order by o.created_at;

-- Totals, if you want the size before deciding:
--
--   select
--     count(*) as orphan_count,
--     pg_size_pretty(coalesce(sum((o.metadata ->> 'size')::bigint), 0)) as total_size
--   from storage.objects o
--   where o.bucket_id = 'course-thumbnails'
--     and o.created_at < now() - interval '24 hours'
--     and not exists (
--       select 1 from public.courses c
--       where c.thumbnail_url like '%/course-thumbnails/' || o.name
--     );

-- =============================================================================
-- DELETING
-- =============================================================================
-- Take the object_path values from the query above and remove them with the Storage
-- API, using the SERVICE ROLE key. That key bypasses RLS and must never appear in
-- frontend code, in VITE_* variables, or in anything committed to this repository —
-- run this from a trusted machine with the key supplied by the environment.
--
--   supabase storage rm \
--     ss:///course-thumbnails/<uuid-folder>/<uuid-object>.webp
--
-- or, from a trusted Node script (not the browser):
--
--   const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);
--   const { data, error } = await admin.storage.from("course-thumbnails").remove(paths);
--
-- `remove()` takes up to 1000 paths per call and returns the objects it deleted, so
-- compare that list against the paths you passed rather than assuming success.
--
-- After deleting, re-run the IDENTIFY query. It should return zero rows; anything
-- still listed was not actually removed.
--
-- =============================================================================
-- RELATED CHECK — a course pointing at a missing object
-- =============================================================================
-- The opposite inconsistency, and the more urgent one: a course claims a thumbnail
-- that is no longer in the bucket, which renders as a broken image on the public
-- catalogue. This should return zero rows.
--
-- It excludes URLs from outside this bucket, because thumbnail_url is only required
-- to be a URL — a course whose image is hosted elsewhere is not a fault.
--
--   select c.slug, c.published, c.thumbnail_url
--   from public.courses c
--   where c.thumbnail_url like '%/course-thumbnails/%'
--     and not exists (
--       select 1
--       from storage.objects o
--       where o.bucket_id = 'course-thumbnails'
--         and c.thumbnail_url like '%/course-thumbnails/' || o.name
--     )
--   order by c.published desc, c.slug;
--
-- =============================================================================
