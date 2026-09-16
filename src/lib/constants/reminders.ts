/**
 * Session reminder constants.
 *
 * Mirror 017_session_reminders.sql, the same way src/lib/constants/verification.ts mirrors
 * 015. Where a value is a bound the database enforces, the SQL is named and the database
 * stays the authority; nothing here is a security control.
 */

/**
 * Bounds on `website_settings.countdown_reminder_lead_hours`.
 *
 * These two *are* a real constraint, unlike most maxima in src/lib/constants/admin.ts:
 * 017_adds `check (countdown_reminder_lead_hours between 1 and 720)`, so a value outside
 * this range comes back as a 23514 rather than being quietly accepted. 720 hours is thirty
 * days.
 */
export const REMINDER_LEAD_HOURS_MIN = 1;
export const REMINDER_LEAD_HOURS_MAX = 720;

/** The column default from 017, used when a row predates it. */
export const REMINDER_LEAD_HOURS_DEFAULT = 24;

/**
 * SQLSTATEs raised by public.subscribe_session_reminder() in 017.
 *
 * One code covers three different refusals on purpose — reminders switched off, no session
 * date, and a session that has already started — because all three mean the same thing to
 * the visitor: there is nothing to be reminded about. Keeping them one code is what lets
 * the UI tell the truth without disclosing which of the three the administrator has set.
 */
export const REMINDER_SQLSTATE = {
  /** The global 200-per-hour cap. */
  RATE_LIMITED: "RM001",
  /** Reminders off, no session scheduled, or the session has already begun. */
  UNAVAILABLE: "RM002",
  /** check_violation from the email regex in 017 — the form prevents this. */
  INVALID_EMAIL: "23514",
} as const;

/**
 * The two statuses the function returns instead of raising.
 *
 * Both are successes. `already_subscribed` is not an error: the address already has a
 * pending subscription for this session, and 017 returns it precisely so a repeat click
 * produces a confirmation rather than a second email.
 */
export type ReminderSubscriptionStatus = "subscribed" | "already_subscribed";
