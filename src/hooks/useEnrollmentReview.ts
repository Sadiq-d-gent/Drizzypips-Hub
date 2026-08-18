import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  adminEnrollmentQueryKey,
  enrollmentHistoryQueryKey,
} from "@/hooks/useAdminEnrollment";
import { ADMIN_QUERY_SCOPE } from "@/lib/constants/admin";
import { ReviewActionInput } from "@/lib/validation/admin.schema";
import { ReviewError, reviewEnrollment } from "@/services/adminEnrollment.service";

/**
 * Turns a review failure into copy an administrator can act on.
 *
 * ST002 is the interesting one: it means a colleague reviewed this enrollment between the
 * page loading and the button being pressed. That is a routine race in a shared queue, not
 * a fault, so it reads as information rather than an error.
 */
const describeReviewError = (error: unknown): string => {
  if (error instanceof ReviewError) {
    if (error.isNotPending) {
      return "This enrollment has already been reviewed. Refresh to see the current status.";
    }

    if (error.isForbidden) {
      return "Your account isn't authorised to review enrollments.";
    }

    if (error.isNotFound) {
      return "That enrollment no longer exists.";
    }
  }

  return "Couldn't record that decision. Please try again.";
};

/**
 * Approve or reject an enrollment.
 *
 * No optimistic update. A review is a payment decision whose legality is settled in the
 * database — the transition rules, the row lock and `reviewed_by` all live in
 * public.review_enrollment() — so showing "Approved" before the server agrees would mean
 * showing a state that may never exist. The refetch is fast and honest.
 *
 * The whole enrollments scope is invalidated rather than a single key, because a decision
 * moves the row between filtered views and changes the dashboard counts.
 */
export const useEnrollmentReview = (enrollmentId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ReviewActionInput) => reviewEnrollment(enrollmentId, input),
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: adminEnrollmentQueryKey(enrollmentId) });
      void queryClient.invalidateQueries({ queryKey: enrollmentHistoryQueryKey(enrollmentId) });
      void queryClient.invalidateQueries({ queryKey: [...ADMIN_QUERY_SCOPE, "enrollments"] });
      void queryClient.invalidateQueries({ queryKey: [...ADMIN_QUERY_SCOPE, "enrollment-stats"] });

      toast.success(
        input.decision === "approved" ? "Enrollment approved" : "Enrollment rejected",
      );
    },
    onError: (error) => {
      toast.error(describeReviewError(error));
    },
  });
};
