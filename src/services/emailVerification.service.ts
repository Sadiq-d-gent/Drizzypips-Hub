import { VERIFICATION_RATE_LIMIT_SQLSTATE } from "@/lib/constants/verification";
import { getSupabaseClient } from "@/lib/supabase/client";
import { RequestVerificationResult, VerifyCodeResult } from "@/types/verification";

/**
 * Email verification.
 *
 * Both calls go through SECURITY DEFINER RPCs. `anon` holds no privileges of any kind on
 * public.email_verifications (015:184-186), so the table is unreachable from here and
 * these two functions are the entire student-facing surface.
 *
 * WHAT THIS MODULE DOES NOT DO
 * It does not decide whether an address is verified. request_email_verification() and
 * verify_email_code() are the only questions the browser may ask, and neither answers
 * "is this address verified right now" — has_verified_email() exists but is deliberately
 * revoked from anon and authenticated (015:463-470). The authoritative check runs inside
 * create_enrollment(), which raises EV002 if the answer is no. Everything here is
 * therefore presentational, and a client that lies about it changes nothing: the POST
 * still fails.
 */

/**
 * Error carrying the PostgreSQL SQLSTATE, so callers distinguish a rate limit from a
 * generic failure without matching on message text.
 */
export class VerificationError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "VerificationError";
    this.code = code;
  }

  /**
   * `EV001` — the 60-second cooldown or the 5-per-hour cap.
   *
   * Both limits raise this same code on purpose, so the UI cannot tell the student which
   * one they hit. The raw SQL message is generic operator text and is never rendered;
   * the copy shown for this is chosen in the hook.
   */
  get isRateLimited() {
    return this.code === VERIFICATION_RATE_LIMIT_SQLSTATE;
  }
}

/**
 * Issues a verification code and emails it.
 *
 * Throws VerificationError on the two limits, or if the address is malformed. On success
 * the code is already queued for delivery — enqueue_email() runs in the same transaction
 * (015:293-297), so a returned promise means an email was actually committed, not merely
 * requested.
 */
export const requestEmailVerification = async (
  email: string,
): Promise<RequestVerificationResult> => {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.rpc("request_email_verification", {
    p_email: email,
  });

  if (error) {
    throw new VerificationError(error.message, error.code);
  }

  // RETURNS TABLE, so PostgREST delivers a one-element array.
  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new VerificationError("We couldn't send a code. Please try again.");
  }

  return row as RequestVerificationResult;
};

/**
 * Submits a code and reports what happened.
 *
 * Does NOT throw for a wrong, expired or exhausted code. Those are ordinary outcomes that
 * the caller renders as guidance, and the RPC returns them as a `status` value precisely
 * so the attempt counter survives — raising would roll back the increment that makes the
 * five-guess cap real (015:302-306). Only a transport failure or a blank submission
 * throws, and the form prevents the latter.
 */
export const verifyEmailCode = async (
  email: string,
  code: string,
): Promise<VerifyCodeResult> => {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.rpc("verify_email_code", {
    p_email: email,
    p_code: code,
  });

  if (error) {
    throw new VerificationError(error.message, error.code);
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new VerificationError("We couldn't check that code. Please try again.");
  }

  return row as VerifyCodeResult;
};
