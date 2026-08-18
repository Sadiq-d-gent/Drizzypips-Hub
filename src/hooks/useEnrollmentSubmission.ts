import { useMutation } from "@tanstack/react-query";

import { CreateEnrollmentPayload, createEnrollment } from "@/services/enrollment.service";
import { CreateEnrollmentResult } from "@/types/enrollment";

/**
 * Submits the enrollment.
 *
 * `retry: false` is the important part. This mutation is not idempotent — a retried
 * call that actually succeeded the first time produces a second enrollment row, a
 * second order ID and a duplicate in the admin's review queue. A failed submission is
 * re-sent only when the student presses the button again.
 */
export const useEnrollmentSubmission = (
  onSuccess?: (result: CreateEnrollmentResult) => void,
) => {
  return useMutation<CreateEnrollmentResult, Error, CreateEnrollmentPayload>({
    mutationFn: createEnrollment,
    retry: false,
    onSuccess,
  });
};
