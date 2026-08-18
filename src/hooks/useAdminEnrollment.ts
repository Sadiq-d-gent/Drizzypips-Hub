import { useQuery } from "@tanstack/react-query";

import { ADMIN_QUERY_SCOPE } from "@/lib/constants/admin";
import {
  fetchAdminEnrollment,
  fetchEnrollmentHistory,
} from "@/services/adminEnrollment.service";

export const adminEnrollmentQueryKey = (id: string) =>
  [...ADMIN_QUERY_SCOPE, "enrollment", id] as const;

export const enrollmentHistoryQueryKey = (id: string) =>
  [...ADMIN_QUERY_SCOPE, "enrollment-history", id] as const;

/**
 * One enrollment and its status history.
 *
 * Two queries rather than one so the record renders as soon as it arrives, instead of
 * waiting on the history RPC. They invalidate together after a review, since a decision
 * changes both.
 */
export const useAdminEnrollment = (id: string | undefined) => {
  const enabled = Boolean(id);

  const enrollmentQuery = useQuery({
    queryKey: adminEnrollmentQueryKey(id ?? ""),
    queryFn: () => fetchAdminEnrollment(id ?? ""),
    enabled,
    staleTime: 15_000,
  });

  const historyQuery = useQuery({
    queryKey: enrollmentHistoryQueryKey(id ?? ""),
    queryFn: () => fetchEnrollmentHistory(id ?? ""),
    enabled,
    staleTime: 15_000,
  });

  return { enrollmentQuery, historyQuery };
};
