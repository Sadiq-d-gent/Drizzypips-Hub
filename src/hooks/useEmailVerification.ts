import { useMutation } from "@tanstack/react-query";

import {
  VerificationError,
  requestEmailVerification,
  verifyEmailCode,
} from "@/services/emailVerification.service";
import { RequestVerificationResult, VerifyCodeResult } from "@/types/verification";

/**
 * Email verification mutations.
 *
 * Both are `retry: false`, for different reasons. Sending is rate limited — a silent
 * retry that lands inside the 60-second cooldown fails with EV001 and would look to the
 * student like the button did nothing. Verifying is worse: every wrong guess consumes one
 * of five attempts, so an automatic retry of a mistyped code burns the cap on the
 * student's behalf.
 */

/**
 * Turns a send failure into copy a student can act on.
 *
 * EV001 covers both the 60-second cooldown and the 5-per-hour cap, and 015 raises them
 * with the same code on purpose so the limits cannot be paced by an attacker. That means
 * this message must be true of either: it says a code was sent recently and to wait,
 * which is the correct instruction for both without disclosing which limit was hit.
 *
 * The raw SQL message is never rendered. It is generic operator text; the wording a
 * student sees is chosen here so it can change without a migration.
 */
export const describeVerificationSendError = (error: unknown): string => {
  if (error instanceof VerificationError && error.isRateLimited) {
    return "We've sent a code to this address very recently. Please check your inbox, or wait a few minutes before requesting another.";
  }

  return "We couldn't send a verification code. Please check your connection and try again.";
};

/** Issues a code. One-shot; a failed send is retried only by the student pressing again. */
export const useRequestEmailVerification = () => {
  return useMutation<RequestVerificationResult, Error, string>({
    mutationFn: requestEmailVerification,
    retry: false,
  });
};

/**
 * Checks a submitted code.
 *
 * Note that a wrong code RESOLVES rather than rejecting: the RPC reports it as a
 * `status` value, and only a transport failure throws. Callers therefore inspect
 * `result.status` for the outcome and reserve `onError` for "we could not reach the
 * server", which is a genuinely different situation for the student.
 */
export const useVerifyEmailCode = () => {
  return useMutation<VerifyCodeResult, Error, { email: string; code: string }>({
    mutationFn: ({ email, code }) => verifyEmailCode(email, code),
    retry: false,
  });
};
