/**
 * Enrollment constants.
 *
 * Client-side limits duplicated from the database and storage layers on purpose. The
 * server is the authority — public.create_enrollment() re-validates all of this, and
 * the bucket enforces its own size/MIME limits — but repeating the values here lets
 * the form reject a 40 MB photo before uploading it. Any change must be made in both
 * places; the SQL sources are named against each constant below.
 */

/** Matches the `receipts` bucket file_size_limit in 004_create_receipts_storage.sql. */
export const MAX_RECEIPT_SIZE_BYTES = 5 * 1024 * 1024;

export const MAX_RECEIPT_SIZE_LABEL = "5 MB";

/**
 * Matches the bucket's allowed_mime_types and the check in create_enrollment().
 *
 * SVG is excluded deliberately: it is a scriptable document, and accepting one would
 * hand a stored-XSS payload to whichever admin opens the receipt.
 */
export const ACCEPTED_RECEIPT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type AcceptedReceiptMimeType = (typeof ACCEPTED_RECEIPT_MIME_TYPES)[number];

/**
 * Extensions mirroring the MIME allowlist, used for the file input's `accept`
 * attribute and to build the object key. Kept in sync with the regex in
 * public.is_valid_receipt_path().
 */
export const ACCEPTED_RECEIPT_EXTENSIONS: Record<AcceptedReceiptMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** `accept` value for the file input. Both MIME types and extensions, because Android browsers historically honour only one or the other. */
export const RECEIPT_INPUT_ACCEPT = [
  ...ACCEPTED_RECEIPT_MIME_TYPES,
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".pdf",
].join(",");

export const RECEIPT_TYPES_LABEL = "JPG, PNG, WebP or PDF";

export const RECEIPTS_BUCKET = "receipts";

export const STUDENT_NAME_MIN = 2;
export const STUDENT_NAME_MAX = 120;
export const STUDENT_PHONE_MIN = 7;
export const STUDENT_PHONE_MAX = 32;
export const STUDENT_NOTE_MAX = 1000;

/** Length of the hex-encoded 32-byte access token issued by create_enrollment(). */
export const ACCESS_TOKEN_LENGTH = 64;

/**
 * SQLSTATE raised by create_enrollment() when one email address submits too often.
 * Matched instead of the message text so the copy can change independently.
 */
export const RATE_LIMIT_SQLSTATE = "RL001";

/** Fallback when payment_settings.review_window_hours cannot be read. */
export const DEFAULT_REVIEW_WINDOW_HOURS = 24;

/**
 * SQLSTATE raised by create_enrollment() while admin_settings.enrollment_enabled is false.
 * Added by 010_enrollment_availability.sql.
 *
 * This is the backstop, not the main path: the enrollment page asks
 * get_enrollment_availability() first and shows the pause panel instead of the wizard, so
 * this code only reaches a student whose site was paused between page load and submit.
 */
export const ENROLLMENT_PAUSED_SQLSTATE = "PA001";

/**
 * Shown when enrollments are paused and admin_settings.enrollment_paused_message is empty.
 *
 * A fallback for a settings row edited outside the app — the site settings form requires a
 * message before it will let anyone pause. Generic on purpose: it must be true whatever the
 * real reason for the pause is.
 */
export const DEFAULT_ENROLLMENT_PAUSED_MESSAGE =
  "Enrollments are temporarily closed. Please check back soon.";

export const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};
