/**
 * Email verification domain types.
 *
 * Hand-authored, like src/types/enrollment.ts and src/types/reminders.ts, and for a reason that
 * survived the Phase 7 regeneration of src/types/database.types.ts: these mirror what a
 * SECURITY DEFINER function RETURNS, not a table row, and a generated RPC signature is not the
 * same shape as the hand-written contract around it. `RequestVerificationResult` states that
 * the code is absent on purpose, which no generator can express.
 *
 * That said, the generated file now covers 001-018, so the shapes here ARE checked against it:
 * `request_email_verification` and `verify_email_code` are resolvable by name, which is why
 * emailVerification.service.ts reads through the typed client rather than the untyped one.
 * Where the two disagree the generated type wins, and this file is what has to change.
 */

import type { VerificationStatus } from "@/lib/constants/verification";

/**
 * Result of request_email_verification().
 *
 * Note what is not here: the code. The RPC returns only when the code expires and when
 * another may be requested, so the browser never holds the secret it is asking the
 * student to prove they received. See 015:203-208.
 */
export type RequestVerificationResult = {
  expires_at: string;
  resend_after: string;
};

/**
 * Result of verify_email_code().
 *
 * Always three columns, whatever the outcome — the status is a value, not an exception.
 * `verified_until` is non-null only for "verified"; `attempts_remaining` is meaningful
 * only for "incorrect" and is 0 otherwise.
 *
 * `verified_until` is `string | null` here and non-nullable in the generated signature, which
 * is the safe direction: the wider type is what the callers need, and narrowing it would mean
 * this file asserting something about the "incorrect" branch that the SQL declares rather than
 * enforces.
 */
export type VerifyCodeResult = {
  status: VerificationStatus;
  verified_until: string | null;
  attempts_remaining: number;
};
