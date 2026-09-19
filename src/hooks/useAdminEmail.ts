import { useQuery } from "@tanstack/react-query";

import { ADMIN_QUERY_SCOPE } from "@/lib/constants/admin";
import { fetchEmailDelivery, fetchReminderStats } from "@/services/adminEmail.service";

/**
 * Both keys sit under ADMIN_QUERY_SCOPE, so signing out drops them with the rest of the
 * admin cache in one `removeQueries` call. That matters more here than for most admin
 * queries: the delivery log holds student and subscriber email addresses, and the reminder
 * counts describe a private list. Neither may survive into the next session in a shared
 * browser.
 */
export const emailDeliveryQueryKey = [...ADMIN_QUERY_SCOPE, "email-delivery"] as const;

export const reminderStatsQueryKey = (sessionAt: string | null) =>
  [...ADMIN_QUERY_SCOPE, "reminder-stats", sessionAt] as const;

/**
 * Outbox state: four counts and a window on the newest rows.
 *
 * `staleTime` is longer than useEnrollmentStats' 15s because nothing an administrator does
 * on this page changes it. The outbox moves when the dispatcher runs, on the server's
 * schedule, so there is no mutation to invalidate against and no decision waiting on a
 * fresher number. Refetching on focus stays on, which is the behaviour that matters: coming
 * back to a tab after a cron tick shows what the tick did.
 */
export const useEmailDelivery = () => {
  return useQuery({
    queryKey: emailDeliveryQueryKey,
    queryFn: fetchEmailDelivery,
    staleTime: 30_000,
  });
};

/**
 * Reminder subscriber counts for the session currently configured.
 *
 * Keyed on `sessionAt`, so saving a new date in the form above refetches against the new
 * instant rather than showing the previous session's subscribers under the new date. Passing
 * null is a valid call, not a disabled one: the total and the awaiting count are still real
 * facts when the countdown is switched off, and the panel says so.
 */
export const useReminderStats = (sessionAt: string | null) => {
  return useQuery({
    queryKey: reminderStatsQueryKey(sessionAt),
    queryFn: () => fetchReminderStats(sessionAt),
    staleTime: 30_000,
  });
};
