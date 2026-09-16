import type { ReminderSubscriptionStatus } from "@/lib/constants/reminders";

/**
 * Session reminder shapes.
 *
 * Hand-authored for the same reason as src/types/verification.ts and src/types/enrollment.ts:
 * these mirror what a SECURITY DEFINER function returns rather than a table row, and the two
 * shapes are not the same thing. The row type is generated for anyone who needs it.
 */

/**
 * What `subscribe_session_reminder()` returns.
 *
 * `session_at` is the moment the subscription is now pointed at, read back from
 * website_settings rather than echoed from anything the browser sent — which is why this
 * type carries it at all. It is the session the visitor will actually be reminded about,
 * including the case where an administrator moved the date between signing up and now.
 */
export type ReminderSubscriptionResult = {
  status: ReminderSubscriptionStatus;
  sessionAt: string;
};
