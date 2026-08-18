import {
  ENROLLMENT_PAGE_SIZE,
  RECEIPT_SIGNED_URL_TTL_SECONDS,
  RECENT_ENROLLMENTS_LIMIT,
  REVIEW_SQLSTATE,
} from "@/lib/constants/admin";
import { RECEIPTS_BUCKET } from "@/lib/constants/enrollment";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  EnrollmentQueueFiltersInput,
  ReviewActionInput,
  pageToRange,
  reviewActionSchema,
} from "@/lib/validation/admin.schema";
import { removeStorageObject, storageObjectExists } from "@/services/storage.service";
import {
  AdminEnrollmentDetail,
  AdminEnrollmentRow,
  EnrollmentHistoryEntry,
  EnrollmentQueuePage,
  EnrollmentStats,
} from "@/types/admin";

/**
 * Enrollment reads and the review mutation, for administrators.
 *
 * WHAT AUTHORIZES ANY OF THIS
 * Nothing in this file. Reads go through the `enrollments` admin SELECT policy from
 * migration 002 (`to authenticated using (public.is_admin())`), and the review mutation
 * goes through public.review_enrollment(), which raises 42501 for a non-admin. A signed-in
 * non-admin calling these functions gets an empty array and an error respectively.
 *
 * WHY NOT `select *`
 * `enrollments.access_token_hash` is the student's capability credential. It must never
 * reach the browser, so every query names its columns and neither list includes it. The
 * column lists below are what src/types/admin.ts describes.
 */

/**
 * Queue columns.
 *
 * Snapshots (`course_title_snapshot`, `price_amount`, `price_currency`) rather than a join
 * to `courses`: what the student agreed to pay is the only figure that belongs in a
 * payment review queue, and it must not silently change when a course is repriced.
 */
const QUEUE_SELECT = `
  id,
  order_id,
  student_name,
  student_email,
  student_phone,
  course_title_snapshot,
  price_amount,
  price_currency,
  status,
  created_at
`;

/**
 * Detail columns, plus the current course row through the FK.
 *
 * `receipt_path` appears here and nowhere else. It is used only as the argument to
 * createSignedUrl() and is never rendered or logged. The embedded `courses` row resolves
 * through the existing "Admins can read all courses" policy, which is what makes the
 * snapshot-versus-current comparison possible even for an unpublished course.
 */
const DETAIL_SELECT = `
  ${QUEUE_SELECT},
  course_id,
  course_slug_snapshot,
  student_note,
  admin_note,
  receipt_path,
  receipt_filename,
  receipt_mime_type,
  receipt_size_bytes,
  receipt_uploaded_at,
  reviewed_at,
  reviewed_by,
  updated_at,
  current_course:courses!enrollments_course_id_fkey (
    id,
    title,
    slug,
    price,
    currency,
    published
  )
`;

/** Error from a review attempt, carrying the SQLSTATE so the UI can map it to copy. */
export class ReviewError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "ReviewError";
    this.code = code;
  }

  /** ST002: someone else reviewed this enrollment first. */
  get isNotPending(): boolean {
    return this.code === REVIEW_SQLSTATE.NOT_PENDING;
  }

  /** 42501: the caller is not an administrator. */
  get isForbidden(): boolean {
    return this.code === REVIEW_SQLSTATE.NOT_ADMIN;
  }

  /** P0002: no enrollment with that id. */
  get isNotFound(): boolean {
    return this.code === REVIEW_SQLSTATE.NOT_FOUND;
  }
}

/**
 * One page of the queue, filtered and sorted in the database.
 *
 * Server-side throughout — `count: "exact"` with `.range()` means the browser never holds
 * more than a page of student PII, and pagination stays correct as rows are reviewed.
 *
 * The two sorts map onto real indexes: "newest" uses `enrollments_created_at_idx`, and
 * "pending-first" orders by status ascending before `created_at desc`. `pending_review` is
 * the first label in the enum declared in 002, so ascending enum order puts pending at the
 * top without a CASE expression, and matches `enrollments_status_created_at_idx`.
 */
export const fetchEnrollmentQueue = async (
  filters: EnrollmentQueueFiltersInput,
): Promise<EnrollmentQueuePage> => {
  const supabase = getSupabaseClient();
  const { from, to } = pageToRange(filters.page, ENROLLMENT_PAGE_SIZE);

  let query = supabase.from("enrollments").select(QUEUE_SELECT, { count: "exact" });

  if (filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  if (filters.courseId !== "all") {
    query = query.eq("course_id", filters.courseId);
  }

  /**
   * Search spans order ID and email, the two things an administrator has to hand when a
   * student gets in touch. `%` and `,` are stripped from the term: `%` would turn a
   * search into a wildcard scan, and `,` would break out of this `or()` filter into
   * another one.
   */
  const term = filters.search.replace(/[%,]/g, "").trim();
  if (term) {
    query = query.or(`order_id.ilike.%${term}%,student_email.ilike.%${term}%`);
  }

  if (filters.sort === "pending-first") {
    query = query.order("status", { ascending: true }).order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    throw new Error(error.message);
  }

  return {
    rows: (data ?? []) as AdminEnrollmentRow[],
    totalCount: count ?? 0,
  };
};

/** The newest few submissions, for the dashboard. Same columns as the queue. */
export const fetchRecentEnrollments = async (): Promise<AdminEnrollmentRow[]> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("enrollments")
    .select(QUEUE_SELECT)
    .order("created_at", { ascending: false })
    .limit(RECENT_ENROLLMENTS_LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as AdminEnrollmentRow[];
};

/**
 * One enrollment in full, or null if there is no such row.
 *
 * `maybeSingle()` because a bad id in the URL is a 404 to render, not an error to throw.
 * An admin whose session expired mid-session also lands here with null rather than a
 * thrown error, which the detail page treats as not-found — the guard catches the session
 * problem on the next navigation.
 */
export const fetchAdminEnrollment = async (id: string): Promise<AdminEnrollmentDetail | null> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("enrollments")
    .select(DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as AdminEnrollmentDetail | null;
};

/**
 * Dashboard counts from public.admin_enrollment_stats().
 *
 * One grouped query in the database rather than five `head` count requests from the
 * browser. Camel-cased here so the snake_case shape stops at the service boundary.
 */
export const fetchEnrollmentStats = async (): Promise<EnrollmentStats> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("admin_enrollment_stats");

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    pendingReview: Number(row?.pending_review ?? 0),
    approved: Number(row?.approved ?? 0),
    rejected: Number(row?.rejected ?? 0),
    cancelled: Number(row?.cancelled ?? 0),
    total: Number(row?.total ?? 0),
  };
};

/**
 * Status history for one enrollment, newest first.
 *
 * An RPC rather than a table read with a join, because the SELECT policy on
 * public.admins is self-only: an admin reading a row that a *different* admin changed
 * cannot resolve that person's name. get_enrollment_history() does the join as
 * SECURITY DEFINER, which is narrower than widening the admins policy.
 *
 * `changed_by_name` is null for the creation entry — an anonymous student has no admin
 * identity — and the timeline renders that case explicitly.
 */
export const fetchEnrollmentHistory = async (
  enrollmentId: string,
): Promise<EnrollmentHistoryEntry[]> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("get_enrollment_history", {
    p_enrollment_id: enrollmentId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as EnrollmentHistoryEntry[];
};

/**
 * Approves or rejects an enrollment.
 *
 * Everything that matters happens in public.review_enrollment(): it re-checks
 * public.is_admin(), rejects any transition other than pending_review → approved/rejected
 * (ST001/ST002), takes a row lock so two administrators reviewing at once cannot both
 * win, and sets `reviewed_by` from auth.uid() and `reviewed_at` from now(). None of those
 * three values is sent from here, so none can be forged by a tampered client.
 *
 * The note is written in the same UPDATE as the status so the
 * enrollments_log_status_change trigger from migration 005 copies it into the history row.
 * History stays trigger-generated; nothing in this file writes to it.
 */
export const reviewEnrollment = async (
  enrollmentId: string,
  input: ReviewActionInput,
): Promise<void> => {
  const supabase = getSupabaseClient();
  const action = reviewActionSchema.parse(input);

  const { error } = await supabase.rpc("review_enrollment", {
    p_enrollment_id: enrollmentId,
    p_status: action.decision,
    p_admin_note: action.adminNote?.trim() || undefined,
  });

  if (error) {
    throw new ReviewError(error.message, error.code);
  }
};

/**
 * A short-lived signed URL for one receipt.
 *
 * The bucket is private and stays private. This resolves only because of the
 * "Admins can read receipts" policy on storage.objects
 * (`bucket_id = 'receipts' and public.is_admin()`), so a non-admin gets an error rather
 * than a URL.
 *
 * The result is a bearer capability: whoever holds the URL can read the file until it
 * expires, without authenticating. So it is minted on demand, lives for
 * RECEIPT_SIGNED_URL_TTL_SECONDS, is never written to the database, and is never cached
 * by react-query.
 *
 * `download` makes the response carry `Content-Disposition: attachment`. Receipts are
 * untrusted uploads, and serving one inline invites the browser to interpret it in the
 * admin panel's origin.
 */
export const createReceiptSignedUrl = async (
  receiptPath: string,
  options: { download?: boolean } = {},
): Promise<string> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(receiptPath, RECEIPT_SIGNED_URL_TTL_SECONDS, {
      download: options.download ?? false,
    });

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.signedUrl) {
    throw new Error("Could not create a link for this receipt.");
  }

  return data.signedUrl;
};

/**
 * Permanently deletes an enrollment and the receipt image attached to it.
 *
 * WHAT THIS DESTROYS
 * The row, and with it every `enrollment_status_history` row pointing at it —
 * 005_create_enrollment_history.sql declares that FK `on delete cascade`, deliberately, so
 * history cannot outlive the record it describes. The `enrollments_log_status_change` trigger
 * fires on INSERT and UPDATE, not DELETE, so nothing anywhere records that the deletion
 * happened. That is a property of hard delete, not an oversight: the alternative is a
 * tombstone table, which would be a second audit system, and the audit authority in this
 * schema is the history trigger. Cancelling an enrollment is the reversible, audited action;
 * this is not that.
 *
 * WHY THE OBJECT GOES FIRST — THE COURSE DELETE DOES THE OPPOSITE
 * The order in each place follows from whether the row delete can be refused. Here it cannot:
 * nothing references an enrollment except its history, which cascades. So the risky half is
 * the receipt, and doing it first means a storage failure leaves both halves intact and the
 * admin simply retries. Reversing it would strand bytes in a private bucket with nothing left
 * in the database to name them — findable only by cleanup_orphan_receipts.sql. A course
 * delete, by contrast, is routinely refused by `on delete restrict`, so there the row goes
 * first to avoid destroying the thumbnail of a course that still exists.
 *
 * The existence check makes a retry safe. `removeStorageObject` treats "deleted nothing" as a
 * failure — correct in general, wrong for the second attempt after the object is already
 * gone, which would otherwise loop forever with a row that can never be deleted.
 */
export const deleteEnrollment = async (
  id: string,
  receiptPath: string | null,
): Promise<void> => {
  if (receiptPath && (await storageObjectExists(RECEIPTS_BUCKET, receiptPath))) {
    await removeStorageObject(RECEIPTS_BUCKET, receiptPath);
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("enrollments").delete().eq("id", id).select("id");

  if (error) {
    /**
     * The raw message is dropped for the same reason the review path drops it: Postgres
     * error text names constraints, columns and values, and none of that belongs in front
     * of an admin who asked to delete a row.
     */
    throw new ReviewError(
      error.code === REVIEW_SQLSTATE.NOT_ADMIN
        ? "You don't have permission to delete enrollments."
        : "The enrollment couldn't be deleted. Its receipt has already been removed — try again.",
      error.code,
    );
  }

  /**
   * A delete that matched nothing returns no error at all. An id that does not exist and a
   * row the admin policy hides are indistinguishable here, which is what RLS is for.
   */
  if (!data || data.length === 0) {
    throw new ReviewError(
      "That enrollment couldn't be deleted. It may already be gone, or you may not have permission.",
    );
  }
};
