import { EnrollmentStatus } from "@/types/enrollment";

/**
 * Admin domain types.
 *
 * Deliberately narrower than the generated row types in database.types.ts. The queue
 * and detail queries name their columns explicitly rather than selecting `*`, and these
 * shapes are what those column lists produce — so a column that must never reach the
 * browser (`access_token_hash` above all) cannot appear here by accident.
 */

/** The signed-in administrator's own row, read through the self-only policy on public.admins. */
export type AdminProfile = {
  id: string;
  name: string;
  email: string;
};

/** Counts from public.admin_enrollment_stats(), camel-cased at the service boundary. */
export type EnrollmentStats = {
  pendingReview: number;
  approved: number;
  rejected: number;
  cancelled: number;
  total: number;
};

/** How many enrollments one course has, and how many of those still need review. */
export type CourseEnrollmentCount = {
  total: number;
  pending: number;
};

/**
 * public.admin_course_stats() keyed by course id.
 *
 * The course list needs a number per row to decide whether delete is even possible —
 * enrollments.course_id is `on delete restrict` — and one grouped call is what keeps that
 * from becoming a count request per course.
 */
export type CourseEnrollmentCounts = Record<string, CourseEnrollmentCount>;

/**
 * One row in the review queue.
 *
 * Snapshot columns, not joins: `course_title_snapshot` and `price_amount` are what the
 * student agreed to, which is the only thing that belongs in a payment queue.
 */
export type AdminEnrollmentRow = {
  id: string;
  order_id: string;
  student_name: string;
  student_email: string;
  student_phone: string;
  course_title_snapshot: string;
  price_amount: number;
  price_currency: string;
  status: EnrollmentStatus;
  created_at: string;
};

/** The course as it stands today, for comparison against the enrollment's snapshot. */
export type CurrentCourse = {
  id: string;
  title: string;
  slug: string;
  price: number;
  currency: string;
  published: boolean;
};

/**
 * One enrollment in full, for the detail page.
 *
 * `receipt_path` is present because minting a signed URL needs it. It is never rendered
 * and never logged — see ReceiptPanel.
 */
export type AdminEnrollmentDetail = AdminEnrollmentRow & {
  course_id: string;
  course_slug_snapshot: string;
  student_note: string | null;
  admin_note: string | null;
  receipt_path: string | null;
  receipt_filename: string | null;
  receipt_mime_type: string | null;
  receipt_size_bytes: number | null;
  receipt_uploaded_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  updated_at: string;
  /** null when the course row has since been deleted, which `on delete restrict` prevents. */
  current_course: CurrentCourse | null;
};

/**
 * One entry from public.get_enrollment_history().
 *
 * `changed_by_name` is null for the creation row — an anonymous student has no admin
 * identity — and for any change made directly in SQL. `changed_by_role` still names
 * something in those cases.
 */
export type EnrollmentHistoryEntry = {
  id: string;
  from_status: EnrollmentStatus | null;
  to_status: EnrollmentStatus;
  changed_by_name: string | null;
  changed_by_role: string | null;
  note: string | null;
  created_at: string;
};

/** The only two outcomes public.review_enrollment() accepts. */
export type ReviewDecision = "approved" | "rejected";

export type EnrollmentQueueFilters = {
  status: EnrollmentStatus | "all";
  courseId: string | "all";
  search: string;
  sort: "newest" | "pending-first";
  page: number;
};

export type EnrollmentQueuePage = {
  rows: AdminEnrollmentRow[];
  totalCount: number;
};

/**
 * `public.admin_settings` as the settings form reads it.
 *
 * The one row this table is constrained to hold, minus `id` (a constant `true`, useful
 * only as the upsert conflict target) and `created_at` (nothing displays it).
 * `updated_at` is kept because it is what remounts the form from persisted values after a
 * save, the same trick AdminCourseEdit uses.
 *
 * There is deliberately no counterpart type for `payment_settings` here: `PaymentSettings`
 * in src/types/enrollment.ts already describes every column of that table, and the admin
 * form reads the same active row through the same query as the student payment step. A
 * second declaration of one row shape would be two things to keep in step.
 */
export type AdminSettings = {
  notification_email: string | null;
  enrollment_enabled: boolean;
  enrollment_paused_message: string | null;
  updated_at: string;
};
