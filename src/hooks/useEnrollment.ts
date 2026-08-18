import { useQuery } from "@tanstack/react-query";

import { ACCESS_TOKEN_LENGTH } from "@/lib/constants/enrollment";
import { fetchEnrollmentByToken } from "@/services/enrollment.service";

export const enrollmentQueryKey = (accessToken: string) =>
  ["enrollment", "by-token", accessToken] as const;

/**
 * Reads one enrollment by its access token, for the confirmation page.
 *
 * `staleTime: 0` on purpose, unlike the course queries. Status is the thing the
 * student comes back to check, so a revisit should re-ask rather than render a cached
 * "pending review" that an admin has since approved.
 *
 * `retry: false` because the two ways this fails — a malformed token and an unknown
 * one — are both permanent. Retrying would only delay the "not found" panel.
 */
export const useEnrollment = (accessToken: string | undefined) => {
  return useQuery({
    queryKey: enrollmentQueryKey(accessToken ?? ""),
    queryFn: () => fetchEnrollmentByToken(accessToken ?? ""),
    enabled: Boolean(accessToken) && accessToken?.length === ACCESS_TOKEN_LENGTH,
    staleTime: 0,
    retry: false,
  });
};
