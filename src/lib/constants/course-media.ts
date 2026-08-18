/**
 * Course thumbnail constants.
 *
 * Same arrangement as src/lib/constants/enrollment.ts: the limits below are duplicated
 * from the storage layer on purpose. The bucket created in
 * 008_create_course_thumbnails_storage.sql is the authority and enforces its own size
 * and MIME limits, but repeating the values here lets the form reject a 12 MB photo
 * before spending the upload. Any change must be made in both places.
 */

/** Matches the `course-thumbnails` bucket file_size_limit in 008. */
export const MAX_THUMBNAIL_SIZE_BYTES = 2 * 1024 * 1024;

export const MAX_THUMBNAIL_SIZE_LABEL = "2 MB";

/**
 * Matches the bucket's allowed_mime_types in 008.
 *
 * Narrower than the receipt allowlist in two ways. SVG is excluded for the same reason
 * as there — it is a scriptable document, and this bucket is public, so an SVG would be
 * a stored-XSS payload served from our own origin to every visitor rather than to one
 * admin. PDF is excluded because a PDF is not an image and cannot be a thumbnail.
 */
export const ACCEPTED_THUMBNAIL_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AcceptedThumbnailMimeType = (typeof ACCEPTED_THUMBNAIL_MIME_TYPES)[number];

/**
 * Extensions mirroring the MIME allowlist, used for the file input's `accept`
 * attribute and to build the object key.
 */
export const ACCEPTED_THUMBNAIL_EXTENSIONS: Record<AcceptedThumbnailMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** `accept` value for the file input. Both MIME types and extensions, because Android browsers historically honour only one or the other. */
export const THUMBNAIL_INPUT_ACCEPT = [
  ...ACCEPTED_THUMBNAIL_MIME_TYPES,
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
].join(",");

export const THUMBNAIL_TYPES_LABEL = "JPG, PNG or WebP";

export const COURSE_THUMBNAILS_BUCKET = "course-thumbnails";

/**
 * Whether a stored thumbnail URL points at our own bucket.
 *
 * courses.thumbnail_url is only required to be a URL, and the seed data uses images
 * hosted elsewhere. Replace-cleanup must only delete objects we own, so it asks this
 * first: an externally hosted image has no object to remove, and attempting one would
 * be a delete against a path we invented.
 */
export const isManagedThumbnailUrl = (url: string | null | undefined): boolean =>
  Boolean(url && url.includes(`/${COURSE_THUMBNAILS_BUCKET}/`));

/**
 * The bucket-relative object path inside one of our own thumbnail URLs, or null.
 *
 * Public URLs are `<origin>/storage/v1/object/public/course-thumbnails/<folder>/<file>`,
 * so the path is everything after the bucket segment. Query strings are dropped —
 * a cache-busting suffix is not part of the object key.
 */
export const thumbnailPathFromUrl = (url: string | null | undefined): string | null => {
  if (!isManagedThumbnailUrl(url)) {
    return null;
  }

  const marker = `/${COURSE_THUMBNAILS_BUCKET}/`;
  const tail = url!.slice(url!.indexOf(marker) + marker.length);
  const path = tail.split(/[?#]/)[0];

  return path.length > 0 ? path : null;
};
