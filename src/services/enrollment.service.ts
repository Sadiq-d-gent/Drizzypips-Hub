import {
  ACCESS_TOKEN_LENGTH,
  ENROLLMENT_PAUSED_SQLSTATE,
  RATE_LIMIT_SQLSTATE,
} from "@/lib/constants/enrollment";
import { getUntypedSupabaseClient } from "@/lib/supabase/untypedClient";
import {
  CreateEnrollmentResult,
  EnrollmentSummary,
  UploadedReceipt,
} from "@/types/enrollment";

/**
 * Enrollment reads and writes.
 *
 * Both operations go through SECURITY DEFINER RPCs rather than table access, because
 * `anon` has no policies on public.enrollments at all. See the header of
 * supabase/migrations/002_create_enrollments.sql for the reasoning.
 */

export type CreateEnrollmentPayload = {
  courseSlug: string;
  studentName: string;
  studentEmail: string;
  studentPhone: string;
  studentNote: string | null;
  receipt: UploadedReceipt | null;
};

/**
 * Error carrying the PostgreSQL SQLSTATE, so callers can distinguish a rate limit or
 * an unavailable course from a generic failure without matching on message text.
 */
export class EnrollmentError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "EnrollmentError";
    this.code = code;
  }

  get isRateLimited() {
    return this.code === RATE_LIMIT_SQLSTATE;
  }

  /**
   * `PA001` — create_enrollment() refused because enrollments are paused (010).
   *
   * A student who reaches this got past the pause panel, which means the site was paused
   * between page load and submit. The raw message is never rendered: it is deliberately
   * generic operator text, and the administrator's own wording arrives separately through
   * get_enrollment_availability().
   */
  get isEnrollmentPaused() {
    return this.code === ENROLLMENT_PAUSED_SQLSTATE;
  }

  /** `no_data_found` — the course is missing, or unpublished (the RPC does not say which). */
  get isCourseUnavailable() {
    return this.code === "P0002";
  }
}

/**
 * Submits one enrollment.
 *
 * The price is not a parameter. create_enrollment() re-reads the course by slug and
 * snapshots the authoritative price and title itself, so nothing the browser sends can
 * change what is recorded. See the "tampered price" probe in the Phase 3 verification.
 *
 * The returned `access_token` is the raw secret, issued exactly once. It goes straight
 * into the confirmation URL and is never logged or persisted anywhere else.
 */
export const createEnrollment = async (
  payload: CreateEnrollmentPayload,
): Promise<CreateEnrollmentResult> => {
  const supabase = getUntypedSupabaseClient();

  const { data, error } = await supabase.rpc("create_enrollment", {
    p_course_slug: payload.courseSlug,
    p_student_name: payload.studentName,
    p_student_email: payload.studentEmail,
    p_student_phone: payload.studentPhone,
    p_student_note: payload.studentNote,
    p_receipt_path: payload.receipt?.path ?? null,
    p_receipt_filename: payload.receipt?.filename ?? null,
    p_receipt_size_bytes: payload.receipt?.sizeBytes ?? null,
    p_receipt_mime_type: payload.receipt?.mimeType ?? null,
  });

  if (error) {
    throw new EnrollmentError(error.message, error.code);
  }

  // The function is RETURNS TABLE, so PostgREST delivers an array even though exactly
  // one row is produced.
  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new EnrollmentError("The enrollment could not be created. Please try again.");
  }

  return row as CreateEnrollmentResult;
};

/**
 * Reads back one enrollment using its access token.
 *
 * Returns null for an unknown or malformed token. The RPC returns zero rows rather
 * than an error in that case, so a wrong token is indistinguishable from a token for
 * a record that does not exist — there is nothing here to enumerate against.
 */
export const fetchEnrollmentByToken = async (
  accessToken: string,
): Promise<EnrollmentSummary | null> => {
  // Cheap local check before spending a round trip on something that cannot match.
  if (!accessToken || accessToken.length !== ACCESS_TOKEN_LENGTH) {
    return null;
  }

  const supabase = getUntypedSupabaseClient();

  const { data, error } = await supabase.rpc("get_enrollment_by_token", {
    p_access_token: accessToken,
  });

  if (error) {
    throw new EnrollmentError(error.message, error.code);
  }

  const row = Array.isArray(data) ? data[0] : data;

  return (row as EnrollmentSummary | undefined) ?? null;
};
