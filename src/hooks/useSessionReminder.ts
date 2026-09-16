import { useMutation } from "@tanstack/react-query";

import {
  SessionReminderError,
  subscribeSessionReminder,
} from "@/services/sessionReminder.service";
import type { ReminderSubscriptionResult } from "@/types/reminders";

/**
 * Session reminder signup.
 *
 * `retry: false` for the same reason as the verification send: the global cap in 017 is
 * 200 signups per hour, and a silent retry that lands inside it fails with RM001 and would
 * look like the button did nothing. A visitor who wants to try again presses again.
 */

/**
 * Turns a refusal into copy a visitor can act on, beside the hook that raises it.
 *
 * RM001 and RM002 are deliberately vague in 017, and these messages stay vague in the same
 * places rather than being more helpful than the database intends to be:
 *
 * - RM001 is a global cap, not a personal one, so the copy says "in a moment" and does not
 *   accuse the visitor of having signed up too often. Nothing is disclosed by saying so.
 * - RM002 covers three different states — reminders off, no session scheduled, session
 *   already started — and the message that fits all three is "no upcoming session". That is
 *   also the honest reading from the visitor's side: in every one of the three, there is
 *   nothing to be reminded about.
 *
 * The raw PostgreSQL message is never rendered. It is generic operator text, and a check
 * violation from the email regex would surface as an unreadable constraint name.
 */
export const describeReminderError = (error: unknown): string => {
  if (error instanceof SessionReminderError) {
    if (error.isRateLimited) {
      return "We couldn't set that up just now. Please try again in a moment.";
    }

    if (error.isUnavailable) {
      return "There's no upcoming session to be reminded about right now. Please check back soon.";
    }
  }

  return "We couldn't set that reminder up. Please check your connection and try again.";
};

/**
 * Subscribes an address to the next session's reminder.
 *
 * Both outcomes resolve rather than rejecting: `subscribed` and `already_subscribed` are
 * both successes, and 017 returns the second one so that a repeat click confirms instead of
 * sending a duplicate email. Callers read `result.status` and use `onError` only for "we
 * could not reach the server", which is a genuinely different thing to tell a visitor.
 */
export const useSessionReminder = () => {
  return useMutation<ReminderSubscriptionResult, Error, string>({
    mutationFn: subscribeSessionReminder,
    retry: false,
  });
};
