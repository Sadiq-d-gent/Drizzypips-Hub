/**
 * Email verification constants.
 *
 * Client-side mirrors of the rules inside 015_email_verification.sql. As with
 * src/lib/constants/enrollment.ts, the database is the authority and these exist so the
 * form can reject an obvious mistake without a round trip. Any change must be made in
 * both places; the SQL line is named against each constant below.
 */

/** Digits in a code. `lpad(..., 6, '0')` in request_email_verification() (015:271). */
export const VERIFICATION_CODE_LENGTH = 6;

/** `interval '10 minutes'` — the code's lifetime (015:222). */
export const VERIFICATION_CODE_TTL_MINUTES = 10;

/** `interval '2 hours'` — how long an address stays verified (015:386). */
export const VERIFIED_WINDOW_HOURS = 2;

/** `v_row.attempts >= 5` — wrong guesses allowed per code (015:360). */
export const VERIFICATION_MAX_ATTEMPTS = 5;

/**
 * `EV001` — raised by request_email_verification() for BOTH the 60-second cooldown and
 * the 5-per-hour cap. Deliberately one code, so the copy must not distinguish them.
 */
export const VERIFICATION_RATE_LIMIT_SQLSTATE = "EV001";

/**
 * `EV002` — raised by create_enrollment() when the address holds no live verification.
 *
 * This is the guard the whole flow rests on. The verify step is a courtesy so a student
 * is not ambushed at the end; this code is what actually enforces it, and it is the only
 * reason a client can be trusted to have verified anything.
 */
export const EMAIL_NOT_VERIFIED_SQLSTATE = "EV002";

/**
 * The statuses verify_email_code() can return (015:311-317).
 *
 * A discriminated result rather than a thrown error, which is why the UI switches on
 * this instead of catching: a wrong code is an ordinary outcome, and raising for it would
 * roll back the attempt counter the 5-guess cap depends on.
 */
export const VERIFICATION_STATUSES = [
  "verified",
  "incorrect",
  "expired",
  "no_code",
  "too_many_attempts",
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** Six digits, nothing else. `inputMode="numeric"` keeps the phone keypad up on mobile. */
export const VERIFICATION_CODE_PATTERN = /^[0-9]{6}$/;
