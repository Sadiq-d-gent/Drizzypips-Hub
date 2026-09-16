import {
  REMINDER_SQLSTATE,
  type ReminderSubscriptionStatus,
} from "@/lib/constants/reminders";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ReminderSubscriptionResult } from "@/types/reminders";

/**
 * Session reminder signup.
 *
 * One SECURITY DEFINER call, and the only thing an anonymous visitor can do here. `anon`
 * holds no privileges of any kind on public.session_reminders (017 revokes them outright),
 * so the table is unreachable from this bundle and this function is the entire public
 * surface of the feature.
 *
 * WHAT THIS MODULE DOES NOT DECIDE
 * Whether reminders are available, and when the reminder will be sent. Both are answered
 * inside the function, against website_settings, at the moment of the call — so a page that
 * was left open while an administrator switched the feature off cannot subscribe anyone to
 * anything. Nothing here sends the reminder either: that is dispatch_session_reminders()
 * running on the server's schedule, never a timer in this tab.
 */

/**
 * Error carrying the PostgreSQL SQLSTATE.
 *
 * Same shape as VerificationError, for the same reason: the two refusals below are
 * distinguished by code rather than by message text, so the copy a visitor reads can change
 * without a migration.
 */
export class SessionReminderError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "SessionReminderError";
    this.code = code;
  }

  /**
   * `RM001` — the global 200-per-hour cap.
   *
   * Deliberately blunt, and 017 says so: a real announcement could plausibly draw a hundred
   * signups in an hour, so it refuses genuine visitors in order to frustrate a script. The
   * copy for it says "try again shortly" and does not pretend to be about this visitor.
   */
  get isRateLimited() {
    return this.code === REMINDER_SQLSTATE.RATE_LIMITED;
  }

  /**
   * `RM002` — reminders switched off, no session scheduled, or one already under way.
   *
   * All three raise the same code on purpose (017:270-287), and a visitor has no more
   * business knowing which of the three is true than they have of knowing the difference.
   */
  get isUnavailable() {
    return this.code === REMINDER_SQLSTATE.UNAVAILABLE;
  }
}

/**
 * Adds an address to the next session's reminder list.
 *
 * Throws only when nothing was recorded: the global cap, the feature being unavailable, a
 * malformed address, or a transport failure. The two ordinary outcomes come back as a status
 * — reusing an address produces `already_subscribed` and sends nothing, which 017 arranges
 * with a partial unique index rather than by counting.
 *
 * The confirmation email is queued inside the same transaction, so a resolved promise means
 * the confirmation was actually committed rather than merely requested.
 */
export const subscribeSessionReminder = async (
  email: string,
): Promise<ReminderSubscriptionResult> => {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.rpc("subscribe_session_reminder", {
    p_email: email,
  });

  if (error) {
    throw new SessionReminderError(error.message, error.code);
  }

  // RETURNS TABLE, so PostgREST delivers a one-element array.
  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new SessionReminderError("We couldn't set that reminder up. Please try again.");
  }

  return {
    // The column is plain `text` in the generated type; the function only ever returns these
    // two values, and this cast is where that contract is stated once.
    status: row.status as ReminderSubscriptionStatus,
    sessionAt: row.session_at,
  };
};
