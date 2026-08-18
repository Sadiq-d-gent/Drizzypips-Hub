-- 008_create_course_thumbnails_storage.sql
--
-- Phase 5a: public bucket for course thumbnail images.
--
-- WHY THIS BUCKET IS PUBLIC AND THE RECEIPTS BUCKET IS NOT
-- A thumbnail is marketing material. It is rendered as an <img src> on the catalogue
-- and course detail pages, both of which are read by anonymous visitors, and
-- courses.thumbnail_url is validated as a URL by courseCreateSchema — so the column
-- has to hold a fetchable address, not a bucket path. A signed URL cannot be that
-- address: it expires, and every expiry would blank an image on a public page. The
-- public object endpoint gives a stable URL instead, and world-readable is the
-- correct posture for a picture whose whole job is to be seen by strangers.
--
-- A receipt is the opposite: a photograph of somebody's bank statement. It stays in
-- the private bucket created by 004, reachable only through a short-lived signed URL
-- minted for an admin.
--
-- WHY ANON GETS NOTHING AT ALL HERE
-- Unlike 004, there is no unauthenticated writer to accommodate. Only an admin ever
-- uploads a thumbnail, so every policy below is `to authenticated` and gated on
-- public.is_admin(). Anonymous read still works, because a public bucket is served
-- through the public object endpoint rather than through a SELECT policy.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-thumbnails',
  'course-thumbnails',
  true,
  2097152, -- 2 MB. A catalogue thumbnail that needs more than this is the wrong image.
  -- SVG is excluded for the same reason as in 004: it is an executable document, and a
  -- stored-XSS vector the moment a browser renders it from our own origin. Raster only.
  -- PDF is excluded too — it is not an image and cannot be a thumbnail.
  array['image/jpeg', 'image/png', 'image/webp']
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

-- Upload. The key convention is "<random uuid>/<random uuid>.<ext>", the same shape
-- 004 enforces for receipts. The leading segment is deliberately NOT the course id:
-- on the create form the course does not exist yet, so there is no id to key on, and
-- keeping create and edit on one convention means one policy and one path builder.
drop policy if exists "Admins can upload a course thumbnail" on storage.objects;
create policy "Admins can upload a course thumbnail"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'course-thumbnails'
  and public.is_admin()
  and array_length(storage.foldername(name), 1) = 1
  -- Parentheses are required to subscript a function result in PostgreSQL.
  and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);

-- Read. Not needed to *display* a thumbnail — the public endpoint handles that without
-- consulting RLS — but the Storage API resolves an object before deleting it, so the
-- delete below would fail without it. This grants nothing that is not already public:
-- every object in this bucket is readable by URL by anyone.
drop policy if exists "Admins can read course thumbnails" on storage.objects;
create policy "Admins can read course thumbnails"
on storage.objects
for select
to authenticated
using (bucket_id = 'course-thumbnails' and public.is_admin());

-- Delete. This is what lets the admin panel clear the previous image when a thumbnail
-- is replaced, instead of accumulating an orphan per edit. Deletion goes through the
-- Storage API: storage.protect_delete() blocks direct SQL deletes on storage.objects
-- precisely because they would remove the row and orphan the bytes.
drop policy if exists "Admins can delete course thumbnails" on storage.objects;
create policy "Admins can delete course thumbnails"
on storage.objects
for delete
to authenticated
using (bucket_id = 'course-thumbnails' and public.is_admin());

-- No UPDATE policy, matching 004. "Replace the thumbnail" writes a new object under a
-- new random key and deletes the old one, which means a stale public URL can never
-- start serving different bytes than the ones it was published with.
