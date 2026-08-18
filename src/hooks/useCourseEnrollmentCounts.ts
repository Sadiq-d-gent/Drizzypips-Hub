import { useQuery } from "@tanstack/react-query";

import { ADMIN_QUERY_SCOPE } from "@/lib/constants/admin";
import { fetchCourseEnrollmentCounts } from "@/services/adminCourse.service";

export const courseEnrollmentCountsQueryKey = [
  ...ADMIN_QUERY_SCOPE,
  "course-enrollment-counts",
] as const;

/**
 * Enrollment counts per course, for the course list.
 *
 * Under ADMIN_QUERY_SCOPE so useAdminSession clears it on sign-out along with the rest of
 * the admin caches. The counts contain no student data — course ids and integers — but
 * they are only readable by an admin, so they have no business surviving the session.
 *
 * Short staleTime: the number decides whether the delete action is offered at all, and an
 * enrollment can arrive at any moment from the public site. Stale-but-nonzero is harmless
 * here; stale-and-zero is what the SQLSTATE backstop in adminCourse.service.ts is for.
 */
export const useCourseEnrollmentCounts = () =>
  useQuery({
    queryKey: courseEnrollmentCountsQueryKey,
    queryFn: fetchCourseEnrollmentCounts,
    staleTime: 1000 * 30,
  });
