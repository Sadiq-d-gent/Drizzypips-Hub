import {
  ACCEPTED_THUMBNAIL_EXTENSIONS,
  ACCEPTED_THUMBNAIL_MIME_TYPES,
  AcceptedThumbnailMimeType,
  COURSE_THUMBNAILS_BUCKET,
  MAX_THUMBNAIL_SIZE_BYTES,
  MAX_THUMBNAIL_SIZE_LABEL,
  THUMBNAIL_TYPES_LABEL,
  thumbnailPathFromUrl,
} from "@/lib/constants/course-media";
import { getSupabaseClient } from "@/lib/supabase/client";
import { removeStorageObject, storageObjectExists } from "@/services/storage.service";

/**
 * Course thumbnail uploads to the public `course-thumbnails` bucket.
 *
 * WHY THIS IS A PLAIN upload() WHEN receipt.service.ts IS NOT
 * The receipt path goes through createSignedUploadUrl plus a hand-rolled XHR PUT for
 * one reason: an anonymous student uploads a phone photo over a mobile connection and
 * needs a progress bar, and fetch() cannot report upload progress. Neither half applies
 * here. The uploader is a signed-in admin who holds the INSERT policy on this bucket
 * directly, so there is nothing for a signed token to authorise, and the ceiling is
 * 2 MB, so a spinner tells the truth for the whole wait. Same security model, far fewer
 * moving parts.
 */

/**
 * One year, in seconds.
 *
 * Safe only because an object at a given key is never rewritten: 008 grants INSERT and
 * DELETE but deliberately no UPDATE, and every key carries a fresh uuid, so the bytes
 * behind a URL cannot change after they are published. Replacing a thumbnail produces a
 * new URL rather than new content at the old one, which is what makes an aggressive
 * cache correct instead of a stale-image bug.
 */
const UPLOAD_CACHE_CONTROL = "31536000";

/**
 * Builds the object key: "<random uuid>/<random uuid>.<ext>".
 *
 * The leading segment is a fresh uuid rather than the course id, because the create form
 * uploads before the course exists and therefore has no id to key on. The storage INSERT
 * policy in 008 checks exactly this shape — one folder segment, and that segment a uuid —
 * so the regex there and the string here have to stay in step.
 */
export const buildThumbnailPath = (mimeType: AcceptedThumbnailMimeType): string => {
  const extension = ACCEPTED_THUMBNAIL_EXTENSIONS[mimeType];
  return `${crypto.randomUUID()}/${crypto.randomUUID()}.${extension}`;
};

/**
 * Why a file is unacceptable, or null when it is fine.
 *
 * The bucket enforces both of these limits itself and is the real authority; checking
 * here only saves the admin from spending an upload to be told no. Returning a message
 * rather than throwing keeps this usable directly as form-field state.
 */
export const validateThumbnailFile = (file: File): string | null => {
  if (!ACCEPTED_THUMBNAIL_MIME_TYPES.includes(file.type as AcceptedThumbnailMimeType)) {
    return `That file type isn't supported. Use ${THUMBNAIL_TYPES_LABEL}.`;
  }

  if (file.size > MAX_THUMBNAIL_SIZE_BYTES) {
    return `That image is larger than ${MAX_THUMBNAIL_SIZE_LABEL}. Choose a smaller one.`;
  }

  if (file.size === 0) {
    return "That file is empty. Choose a different image.";
  }

  return null;
};

export type UploadedThumbnail = {
  /** Bucket-relative object key, kept so a failed save can clean up after itself. */
  path: string;
  /** Stable public URL — this is what goes into courses.thumbnail_url. */
  publicUrl: string;
};

/**
 * Uploads one thumbnail and resolves with its public URL.
 *
 * `upsert` is left off: keys are random, so a collision would mean crypto.randomUUID()
 * repeated itself, and in that impossible case failing is better than overwriting an
 * image another course is using.
 */
export const uploadCourseThumbnail = async (file: File): Promise<UploadedThumbnail> => {
  const rejection = validateThumbnailFile(file);
  if (rejection) {
    throw new Error(rejection);
  }

  const supabase = getSupabaseClient();
  const path = buildThumbnailPath(file.type as AcceptedThumbnailMimeType);

  const { data, error } = await supabase.storage
    .from(COURSE_THUMBNAILS_BUCKET)
    .upload(path, file, {
      cacheControl: UPLOAD_CACHE_CONTROL,
      contentType: file.type,
    });

  if (error || !data) {
    throw new Error(
      error?.message ?? "The image couldn't be uploaded. Check your connection and try again.",
    );
  }

  const { data: publicUrlData } = supabase.storage
    .from(COURSE_THUMBNAILS_BUCKET)
    .getPublicUrl(data.path);

  return { path: data.path, publicUrl: publicUrlData.publicUrl };
};

/**
 * Removes the object behind a thumbnail URL, when that object is one of ours.
 *
 * Returns false without touching storage for a URL we do not own — the seeded sample
 * courses point at images hosted elsewhere, and inventing a bucket path for those would
 * be a delete against a key we made up. Absence is also reported as false rather than
 * raised, so a retried cleanup is not a failure.
 *
 * Callers treat this as best-effort. A thumbnail that outlives its course row is a few
 * kilobytes and is listed by supabase/maintenance/cleanup_orphan_thumbnails.sql; a save
 * that fails because a *previous* image could not be tidied would be the worse bug.
 */
export const deleteCourseThumbnailByUrl = async (
  url: string | null | undefined,
): Promise<boolean> => {
  const path = thumbnailPathFromUrl(url);
  if (!path) {
    return false;
  }

  if (!(await storageObjectExists(COURSE_THUMBNAILS_BUCKET, path))) {
    return false;
  }

  await removeStorageObject(COURSE_THUMBNAILS_BUCKET, path);
  return true;
};
