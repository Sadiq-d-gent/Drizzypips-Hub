-- 004_create_receipts_storage.sql
--
-- Phase 3: private bucket for uploaded payment receipts.
--
-- WHY THE ANON ROLE GETS INSERT AND NOTHING ELSE
-- The upload runs in the browser with no student login, so the write has to be
-- reachable by `anon`. It is done through createSignedUploadUrl(), which the
-- storage-js client implements as a POST to /object/upload/sign/<path>; that call
-- requires `objects: insert` on the target path and nothing more. The subsequent
-- uploadToSignedUrl() PUT is authorised by the returned token and needs no table
-- permission at all. So a single INSERT policy is sufficient for the whole flow,
-- including byte-level progress via XHR — no SELECT, UPDATE or DELETE for anon.
--
-- The consequence is deliberate: a student can add an object but cannot list the
-- bucket, read anything back (including their own upload), overwrite, or delete.
-- Object keys are random UUIDs, so they are not enumerable. Receipts are reviewed by
-- an admin, and the confirmation page shows the stored metadata (filename, size,
-- type, upload time) rather than the image itself.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  5242880, -- 5 MB, matched by the check constraint on enrollments.receipt_size_bytes
  -- SVG is excluded on purpose: it is an executable document, and a stored-XSS
  -- vector the moment an admin opens one in a browser tab. Raster images and PDF only.
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Storage policies
-- ---------------------------------------------------------------------------
-- storage.objects already has RLS enabled by Supabase; only the policies are ours.

-- Upload. Scoped to the receipts bucket and to the two-segment key convention
-- "<draft uuid>/<object uuid>", which public.is_valid_receipt_path() re-checks when
-- the path is recorded on an enrollment. `storage.foldername()` returns the path
-- segments before the filename, so requiring exactly one keeps writes from being
-- scattered at the bucket root or nested arbitrarily deep.
drop policy if exists "Anyone can upload a receipt" on storage.objects;
create policy "Anyone can upload a receipt"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'receipts'
  and array_length(storage.foldername(name), 1) = 1
  -- Parentheses are required to subscript a function result in PostgreSQL.
  and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);

-- Admin read. This is what makes the future admin panel able to open a receipt: an
-- authenticated admin can create a signed download URL for any object in the bucket.
drop policy if exists "Admins can read receipts" on storage.objects;
create policy "Admins can read receipts"
on storage.objects
for select
to authenticated
using (bucket_id = 'receipts' and public.is_admin());

-- Admin delete, for removing receipts on rejected or duplicated enrollments and for
-- clearing orphans left by abandoned drafts (see supabase/maintenance/).
drop policy if exists "Admins can delete receipts" on storage.objects;
create policy "Admins can delete receipts"
on storage.objects
for delete
to authenticated
using (bucket_id = 'receipts' and public.is_admin());

-- No UPDATE policy for any role. An uploaded receipt is evidence attached to a
-- payment record; replacing its bytes in place would leave no trace. "Replace" in
-- the upload UI writes a new object under a new key instead.
