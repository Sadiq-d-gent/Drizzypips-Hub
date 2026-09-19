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

/** `public.email_status` from 014_email_outbox.sql, in the order the enum declares. */
export type EmailStatus = "queued" | "sending" | "sent" | "failed";

/**
 * How many rows sit in each state of the outbox.
 *
 * Four numbers rather than a total, because the total is the least informative of them.
 * `failed` is the one that needs a person, `queued` growing while `sent` does not is the
 * shape of a dispatcher that is not running, and `sending` is only ever transient — see
 * EMAIL_STUCK_AFTER_MINUTES.
 */
export type EmailDeliveryCounts = Record<EmailStatus, number>;

/**
 * One row of the delivery log.
 *
 * `payload` is deliberately absent. 015 puts the plaintext verification code in it and
 * 018's `complete_email_delivery()` redacts it on the same UPDATE that marks the row sent,
 * so a queued row's payload still holds a live code. Selecting it into the admin panel
 * would widen that window from "in the database until delivery" to "in a browser tab for as
 * long as it is open", for no gain: nothing the log shows needs it.
 *
 * `to_email` is present. It is the one field that makes a delivery failure actionable, and
 * the admin reading it already sees the same addresses in the enrollment queue.
 */
export type EmailLogEntry = {
  id: string;
  template: string;
  to_email: string;
  status: EmailStatus;
  attempts: number;
  last_error: string | null;
  send_after: string;
  sent_at: string | null;
  created_at: string;
  /**
   * When the row last changed, which for a `sending` row is when it was claimed: 018's
   * `claim_email_batch()` sets the status and 014's BEFORE UPDATE trigger moves this in the
   * same statement. That is the comparison `requeue_stuck_emails()` makes to decide a
   * dispatcher died mid-send, and the only reason this column is selected.
   */
  updated_at: string;
};

/** The delivery panel's whole dataset: the four counts, and a window on the newest rows. */
export type EmailDelivery = {
  counts: EmailDeliveryCounts;
  log: EmailLogEntry[];
};

/**
 * Reminder subscriber counts.
 *
 * `awaiting` is everyone still owed an email, whatever session they are pointed at.
 * `awaitingForSession` narrows that to the session currently configured in
 * `website_settings`, and is null when no session is configured — which is not zero, and
 * must not render as zero.
 *
 * The two are normally equal: 017's reschedule trigger repoints every pending row when an
 * administrator moves the date, precisely so nobody is stranded on a session that will
 * never arrive. A gap between them means some pending rows were not repointed, which is
 * worth showing rather than averaging away.
 */
export type ReminderStats = {
  awaiting: number;
  awaitingForSession: number | null;
  total: number;
};
