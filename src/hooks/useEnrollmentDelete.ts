import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  adminEnrollmentQueryKey,
  enrollmentHistoryQueryKey,
} from "@/hooks/useAdminEnrollment";
import { courseEnrollmentCountsQueryKey } from "@/hooks/useCourseEnrollmentCounts";
import { enrollmentStatsQueryKey } from "@/hooks/useEnrollmentStats";
import { ADMIN_QUERY_SCOPE } from "@/lib/constants/admin";
import { ReviewError, deleteEnrollment } from "@/services/adminEnrollment.service";

/**
 * Turns a failed delete into copy an administrator can act on.
 *
 * The important case is a failure that lands between the two halves — the receipt removed,
 * the row not. The service already says so in its own message, so a ReviewError is passed
 * through rather than replaced; overwriting it with something generic would hide the one
 * detail that tells the admin what state they are now in.
 */
const describeDeleteError = (error: unknown): string => {
  if (error instanceof ReviewError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    /**
     * A storage failure, which is the other realistic outcome. Its message comes from the
     * Storage API rather than Postgres — it names a bucket and an HTTP status, not a
     * constraint or a column value — so it is safe to show and more useful than a generic
     * line. Nothing here is student data: the receipt path holds no name or email.
     */
    return error.message;
  }

  return "Couldn't delete that enrollment. Please try again.";
};

export type DeleteEnrollmentVariables = {
  id: string;
  /** `enrollments.receipt_path`, null for a row whose upload never completed. */
  receiptPath: string | null;
};

/**
 * Permanently deletes an enrollment.
 *
 * `removeQueries` rather than `invalidateQueries` for the row's own keys. The enrollment is
 * gone, so refetching it would only produce a 'not found' the detail page then has to render;
 * dropping the cache entry outright is both cheaper and more accurate. Its cached copy also
 * holds the student's name, email and phone, and there is no reason to keep that in memory
 * once the record it belonged to has been destroyed.
 *
 * The list and stats keys are invalidated as usual, since those views still exist and are now
 * one row shorter.
 */
export const useEnrollmentDelete = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, receiptPath }: DeleteEnrollmentVariables) =>
      deleteEnrollment(id, receiptPath),
    onSuccess: (_result, variables) => {
      queryClient.removeQueries({ queryKey: adminEnrollmentQueryKey(variables.id) });
      queryClient.removeQueries({ queryKey: enrollmentHistoryQueryKey(variables.id) });

      void queryClient.invalidateQueries({ queryKey: [...ADMIN_QUERY_SCOPE, "enrollments"] });
      void queryClient.invalidateQueries({ queryKey: enrollmentStatsQueryKey });
      void queryClient.invalidateQueries({ queryKey: courseEnrollmentCountsQueryKey });

      toast.success("Enrollment deleted");
    },
    onError: (error) => {
      toast.error(describeDeleteError(error));
    },
  });
};
