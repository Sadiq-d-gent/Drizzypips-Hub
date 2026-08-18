/**
 * Enrollment domain types.
 *
 * HAND-AUTHORED ON PURPOSE.
 *
 * These were written when `src/types/database.types.ts` covered only `admins` and
 * `courses`, so the Phase 3 tables and RPC result shapes had nowhere generated to come
 * from. They are deliberately identical to what `supabase gen types` produces.
 *
 * database.types.ts has since been regenerated (Phase 4) and now covers the whole
 * schema, so these aliases could be re-pointed at the generated definitions. That is a
 * safe but unrelated refactor and is left for the same cleanup that removes
 * src/lib/supabase/untypedClient.ts.
 */

export type EnrollmentStatus = "pending_review" | "approved" | "rejected" | "cancelled";

/**
 * Row shape of `public.payment_settings` as exposed to anonymous readers.
 *
 * Every column of the table is listed: the public RLS policy filters by row
 * (`is_active = true`), not by column, because the table holds only publishable
 * fields by design. Operational config lives in `admin_settings`, which anon cannot
 * read at all.
 */
export type PaymentSettings = {
  id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  additional_details: string | null;
  currency: string;
  payment_instructions: string;
  review_window_hours: number;
  support_whatsapp_number: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * Whether the enrollment form is open, from `public.get_enrollment_availability()`.
 *
 * The RPC's entire return shape — two columns and no more. `admin_settings` also holds
 * `notification_email`, which is why 003 revokes that table from `anon` and 010 exposes
 * these two fields through a function instead of a policy: a function returning named
 * columns cannot be widened by a `select=*`.
 *
 * `paused_message` is null whenever `enrollment_enabled` is true. The database blanks it
 * rather than the client, so a message drafted ahead of a planned pause is not readable by
 * the public before it applies.
 */
export type EnrollmentAvailability = {
  enrollment_enabled: boolean;
  paused_message: string | null;
};

/**
 * Arguments accepted by the `create_enrollment` RPC.
 *
 * Note what is absent: there is no price, no course id and no order id. The function
 * re-reads the course by slug and snapshots the authoritative price itself, so a
 * tampered client cannot influence what gets recorded.
 */
export type CreateEnrollmentArgs = {
  p_course_slug: string;
  p_student_name: string;
  p_student_email: string;
  p_student_phone: string;
  p_student_note: string | null;
  p_receipt_path: string | null;
  p_receipt_filename: string | null;
  p_receipt_size_bytes: number | null;
  p_receipt_mime_type: string | null;
};

/**
 * Single row returned by `create_enrollment`.
 *
 * `access_token` is the only time the raw token exists outside the browser's URL bar —
 * the database stores nothing but its SHA-256 digest. It must never be logged or sent
 * anywhere other than into the confirmation route.
 */
export type CreateEnrollmentResult = {
  order_id: string;
  access_token: string;
  status: EnrollmentStatus;
  created_at: string;
};

/**
 * Student-safe view of one enrollment, returned by `get_enrollment_by_token`.
 *
 * Deliberately narrower than the table: `admin_note`, `reviewed_by`, `reviewed_at`,
 * `receipt_path` and `access_token_hash` are not returned by the RPC and so cannot
 * appear here.
 */
export type EnrollmentSummary = {
  order_id: string;
  course_title: string;
  course_slug: string;
  price_amount: number;
  price_currency: string;
  student_name: string;
  student_email: string;
  student_phone: string;
  student_note: string | null;
  receipt_filename: string | null;
  receipt_size_bytes: number | null;
  receipt_mime_type: string | null;
  receipt_uploaded_at: string | null;
  status: EnrollmentStatus;
  created_at: string;
  updated_at: string;
};

/** Metadata for a receipt that has finished uploading to the private bucket. */
export type UploadedReceipt = {
  path: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
};
