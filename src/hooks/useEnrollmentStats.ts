import { useQuery } from "@tanstack/react-query";

import { ADMIN_QUERY_SCOPE } from "@/lib/constants/admin";
import { fetchEnrollmentStats } from "@/services/adminEnrollment.service";

export const enrollmentStatsQueryKey = [...ADMIN_QUERY_SCOPE, "enrollment-stats"] as const;

/**
 * Dashboard counts.
 *
 * One RPC, not five count queries — public.admin_enrollment_stats() does the whole thing
 * in a single scan. Invalidated by useEnrollmentReview after a decision, so the pending
 * tile is right the moment an administrator approves something.
 */
export const useEnrollmentStats = () => {
  return useQuery({
    queryKey: enrollmentStatsQueryKey,
    queryFn: fetchEnrollmentStats,
    staleTime: 15_000,
  });
};
