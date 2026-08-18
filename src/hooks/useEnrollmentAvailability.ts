import { useQuery } from "@tanstack/react-query";

import { fetchEnrollmentAvailability } from "@/services/enrollmentAvailability.service";

/**
 * Public — deliberately outside ADMIN_QUERY_SCOPE.
 *
 * This is anonymous data read by students, so it must survive an admin sign-out in the same
 * browser exactly as the course catalogue does.
 */
export const enrollmentAvailabilityQueryKey = ["enrollment-availability"] as const;

/**
 * Whether the enrollment form is open.
 *
 * Short `staleTime` because an administrator pausing enrollments expects it to take effect
 * for people already browsing, and the payload is two fields. Staleness is not a security
 * question: create_enrollment() carries the same check and refuses with PA001 whatever a
 * stale page believes, so this query only decides what the student is shown.
 *
 * `retry: 1` rather than the default three attempts. A failure here does not block anything
 * — isEnrollmentPausedFrom() reads an errored query as "not paused" — so spending three
 * round trips before rendering the wizard would delay the page for no gain.
 */
export const useEnrollmentAvailability = () =>
  useQuery({
    queryKey: enrollmentAvailabilityQueryKey,
    queryFn: fetchEnrollmentAvailability,
    staleTime: 1000 * 30,
    retry: 1,
  });
