import { getSupabaseClient } from "@/lib/supabase/client";
import type { EnrollmentAvailability } from "@/types/enrollment";

/**
 * The public read of whether enrollments are open.
 *
 * Its own module, not a function in adminSettings.service.ts, so that importing this from
 * the student enrollment page cannot drag admin reads and writes into the same bundle. The
 * two files talk to the same two tables and have opposite audiences.
 *
 * WHY AN RPC AND NOT A TABLE READ
 * `admin_settings` is revoked from `anon` by 003 and stays that way. It holds
 * `notification_email` alongside the pause fields, so an anon SELECT policy would either
 * expose that address or need column filtering that a future column could silently widen.
 * `public.get_enrollment_availability()` (010) returns two named columns and nothing else,
 * and a function's return shape cannot be widened by a `select=*`.
 */

/**
 * Reads the pause state.
 *
 * `get_enrollment_availability()` is `RETURNS TABLE`, so PostgREST delivers an array even
 * though the function is built to always produce exactly one row — it left-joins against a
 * one-row VALUES literal precisely so that an empty settings table still returns something.
 * The `?? enabled` below therefore covers only an impossible case, and covers it the same
 * way everything else here does.
 *
 * Errors are thrown, not swallowed. Failing open is the caller's decision and is expressed
 * by isEnrollmentPausedFrom() below; burying it here would put a fabricated "enrollments are
 * open" answer into the query cache, indistinguishable from a real one.
 */
export const fetchEnrollmentAvailability = async (): Promise<EnrollmentAvailability> => {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.rpc("get_enrollment_availability");

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    return { enrollment_enabled: true, paused_message: null };
  }

  return {
    enrollment_enabled: row.enrollment_enabled,
    // The generator types this column as `string` because it cannot see that a RETURNS
    // TABLE column is nullable. It is null whenever enrollments are enabled.
    paused_message: row.paused_message ?? null,
  };
};

/**
 * Whether to show the pause panel instead of the wizard.
 *
 * `=== false` rather than `!enabled` is the whole point: `undefined` — still loading, or the
 * query errored — is not a pause. This is the fail-open rule in one expression.
 *
 * Failing open is safe because it is not the security boundary. `create_enrollment` carries
 * the same check as its first statement and raises PA001 regardless of what the browser
 * believes, so the worst case here is a student who gets as far as submitting and is then
 * refused. The opposite default would take enrollments down on any transient network error.
 */
export const isEnrollmentPausedFrom = (
  availability: EnrollmentAvailability | undefined,
): boolean => availability?.enrollment_enabled === false;
