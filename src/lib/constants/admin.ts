/**
 * Admin panel constants.
 *
 * Same principle as src/lib/constants/enrollment.ts: where a value also exists in the
 * database, the SQL source is named beside it and the database remains the authority.
 * Nothing here is a security control — the admin panel is gated by RLS and by the
 * SECURITY DEFINER functions in 007_admin_review_functions.sql, not by these numbers.
 */

import { EnrollmentStatus } from "@/types/enrollment";

/**
 * Root of every react-query key the admin panel uses.
 *
 * Every admin query key starts with this, so signing out can drop all of it in one
 * `removeQueries` call. Enrollment rows contain student PII and must not survive into
 * the next session in a shared browser.
 */
export const ADMIN_QUERY_SCOPE = ["admin"] as const;

/** Rows per page in the enrollment queue. */
export const ENROLLMENT_PAGE_SIZE = 20;

/** Submissions shown on the dashboard beneath the counts. */
export const RECENT_ENROLLMENTS_LIMIT = 6;

/**
 * Lifetime of a receipt signed URL, in seconds.
 *
 * Short on purpose. The URL is a bearer capability for a private object: anyone holding
 * it can read the file until it expires, without authenticating. It is minted on click,
 * used immediately, and never stored — see useReceiptSignedUrl.
 */
export const RECEIPT_SIGNED_URL_TTL_SECONDS = 60;

/** Delay before a typed search term reaches the database. */
export const ADMIN_SEARCH_DEBOUNCE_MS = 300;

/**
 * Cap on an admin note in the review dialog.
 *
 * Note that `enrollments.admin_note` in 002_create_enrollments.sql is plain `text` with
 * no length check — unlike `student_note`, which is constrained to 1000. This is a UI
 * guard for the sake of the layout, not a constraint being mirrored.
 */
export const ADMIN_NOTE_MAX = 1000;

/**
 * Tailwind classes for each status pill.
 *
 * `warning` and `success` are project tokens defined in tailwind.config.ts and
 * index.css; they are not stock Tailwind colours.
 */
export const ENROLLMENT_STATUS_TONES: Record<EnrollmentStatus, string> = {
  pending_review: "border-warning/30 bg-warning/10 text-warning",
  approved: "border-success/30 bg-success/10 text-success",
  rejected: "border-destructive/30 bg-destructive/10 text-destructive",
  cancelled: "border-border bg-muted text-muted-foreground",
};

/** Status filter options for the queue, "all" first. */
export const ENROLLMENT_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "pending_review", label: "Pending review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export const ENROLLMENT_SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "pending-first", label: "Pending first" },
] as const;

/**
 * SQLSTATEs raised by public.review_enrollment() in 007_admin_review_functions.sql.
 *
 * Matched on the code rather than the message so the copy on both sides can change
 * independently, exactly as RATE_LIMIT_SQLSTATE does for the student flow.
 */
export const REVIEW_SQLSTATE = {
  /** Caller is not an administrator. Raised by every function in 007. */
  NOT_ADMIN: "42501",
  /** No enrollment with that id. */
  NOT_FOUND: "P0002",
  /** Requested status is neither `approved` nor `rejected`. */
  NOT_A_REVIEW_OUTCOME: "ST001",
  /** Enrollment has already left `pending_review` — someone else reviewed it first. */
  NOT_PENDING: "ST002",
} as const;

/**
 * Currencies offered by the course form.
 *
 * A closed list rather than a free-text field. formatCoursePrice hands the code to
 * Intl.NumberFormat, which throws a RangeError on anything that is not a valid ISO 4217
 * code — it has a fallback, but the fallback renders a bare code next to the number, so a
 * typo would quietly downgrade every price on the public catalogue. courses.currency stays
 * a text column, so adding a code here is the only change a new currency needs.
 */
export const COURSE_CURRENCY_OPTIONS = [
  { value: "NGN", label: "NGN — Nigerian Naira" },
  { value: "USD", label: "USD — US Dollar" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "EUR", label: "EUR — Euro" },
] as const;

/**
 * SQLSTATEs a course mutation can come back with.
 *
 * Unlike REVIEW_SQLSTATE these are not raised by a function of ours — course writes are
 * direct table access under the admin policies from 001, so these are the constraint
 * violations Postgres itself reports. Both matter to the admin, and neither is
 * presentable in raw form.
 */
export const COURSE_SQLSTATE = {
  /** unique_violation on courses.slug — another course already uses that slug. */
  DUPLICATE_SLUG: "23505",
  /**
   * foreign_key_violation from enrollments.course_id, which is `on delete restrict`
   * (002). Deleting a course that anyone has enrolled in is refused by design: an
   * enrollment is a payment record and must outlive the catalogue entry.
   */
  HAS_ENROLLMENTS: "23503",
  /** insufficient_privilege. Reaches us from an RPC guard, not from a table policy. */
  NOT_ADMIN: "42501",
  /**
   * PostgREST, not Postgres: "no (or more than one) row returned" from a write that
   * asked for a single row back. An RLS-hidden row and a nonexistent row are
   * indistinguishable here, which is the point of RLS — the copy has to cover both.
   */
  NO_ROW_RETURNED: "PGRST116",
} as const;

/** Courses per page in the admin course list. */
export const COURSE_PAGE_SIZE = 20;

/**
 * SQLSTATEs a settings write can come back with.
 *
 * Like COURSE_SQLSTATE these are Postgres's own codes, not ours: both settings tables are
 * written by direct table access under the admin policies from 003, so there is no
 * function of ours raising a custom condition here.
 */
export const SETTINGS_SQLSTATE = {
  /**
   * unique_violation on payment_settings_single_active_idx — a second active row. Should
   * be unreachable through savePaymentSettings(), which updates the active row in place
   * rather than inserting a replacement; it is mapped because a row inserted outside the
   * app could still leave the table in that state.
   */
  DUPLICATE_ACTIVE: "23505",
  /** check_violation — review_window_hours outside 1–336, or admin_settings.id not true. */
  CHECK_VIOLATION: "23514",
  /** insufficient_privilege. */
  NOT_ADMIN: "42501",
  /**
   * PostgREST: a write asked for one row back and got none. Here it means RLS hid the row
   * from the writer, which for these tables means public.is_admin() returned false.
   */
  NO_ROW_RETURNED: "PGRST116",
} as const;

/**
 * Bounds on payment_settings.review_window_hours.
 *
 * These two mirror an actual database constraint, unlike the maxima below:
 * `check (review_window_hours > 0 and review_window_hours <= 336)` in
 * 003_create_payment_settings.sql. 336 hours is two weeks.
 */
export const REVIEW_WINDOW_HOURS_MIN = 1;
export const REVIEW_WINDOW_HOURS_MAX = 336;

/**
 * Length caps on the settings text fields.
 *
 * Every one of these columns is plain `text` with no length check, so — exactly like
 * ADMIN_NOTE_MAX — these are UI guards for the sake of the layout and of a sane payload
 * size, not constraints being mirrored. Nothing rejects a longer value server-side.
 */
export const SETTINGS_SHORT_TEXT_MAX = 200;
export const SETTINGS_LONG_TEXT_MAX = 2000;

/**
 * Caps on the three hero figures.
 *
 * Tighter than SETTINGS_SHORT_TEXT_MAX because these two are the only settings fields whose
 * length is a layout constraint rather than a courtesy: the hero renders the value at
 * `text-3xl` inside a three-column grid, so "1,000+" fits and a sentence does not. Like
 * every other maximum in this file, `website_settings.hero_stat_*` is plain `text` with no
 * check — nothing rejects a longer value server-side.
 */
export const HERO_STAT_VALUE_MAX = 12;
export const HERO_STAT_LABEL_MAX = 32;

/**
 * Cap on the countdown heading.
 *
 * A layout constraint like the two above, not a mirrored one: the heading sits on one line
 * above four number cells inside the hero card, and at 375px that line is about 40 characters
 * wide before it wraps to a third row and starts pushing the CTAs down. `countdown_title` is
 * plain `text` in 012 with no check, so nothing rejects a longer value server-side.
 */
export const COUNTDOWN_TITLE_MAX = 60;

/**
 * Minimum length for a *new* administrator password.
 *
 * Deliberately asymmetric with adminLoginSchema, which has no length rule at all — see
 * the comment on passwordChangeSchema in src/lib/validation/admin.schema.ts. Supabase
 * Auth's own password policy remains the authority; this only avoids a round trip for an
 * obviously too-short entry, and Supabase's `weak_password` rejection is surfaced when
 * its policy is stricter than this number.
 */
export const PASSWORD_MIN_LENGTH = 8;
