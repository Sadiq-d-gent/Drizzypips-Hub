import { useQuery } from "@tanstack/react-query";

import { ADMIN_QUERY_SCOPE } from "@/lib/constants/admin";
import { EnrollmentQueueFiltersInput } from "@/lib/validation/admin.schema";
import {
  fetchEnrollmentQueue,
  fetchRecentEnrollments,
} from "@/services/adminEnrollment.service";

/**
 * Keyed on the whole filter object, so changing a filter is a different cache entry
 * rather than a mutation of the current one. Under ADMIN_QUERY_SCOPE, so signing out
 * drops every cached page of student PII in one call — see useAdminSession.
 */
export const adminEnrollmentsQueryKey = (filters: EnrollmentQueueFiltersInput) =>
  [...ADMIN_QUERY_SCOPE, "enrollments", filters] as const;

export const recentEnrollmentsQueryKey = [...ADMIN_QUERY_SCOPE, "enrollments", "recent"] as const;

/**
 * One page of the review queue.
 *
 * `placeholderData` keeps the previous page on screen while the next one loads, so paging
 * and typing in the search box do not collapse the table to a spinner on every keystroke.
 * `staleTime` is short because the queue is shared: another administrator may have
 * reviewed something a moment ago.
 */
export const useAdminEnrollments = (filters: EnrollmentQueueFiltersInput) => {
  return useQuery({
    queryKey: adminEnrollmentsQueryKey(filters),
    queryFn: () => fetchEnrollmentQueue(filters),
    placeholderData: (previous) => previous,
    staleTime: 15_000,
  });
};

export const useRecentEnrollments = () => {
  return useQuery({
    queryKey: recentEnrollmentsQueryKey,
    queryFn: fetchRecentEnrollments,
    staleTime: 15_000,
  });
};
