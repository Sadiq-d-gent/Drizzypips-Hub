import type { Session } from "@supabase/supabase-js";

import { getSupabaseClient } from "@/lib/supabase/client";
import { createPasswordVerificationClient } from "@/lib/supabase/verifyClient";
import { AdminLoginInput, adminLoginSchema } from "@/lib/validation/admin.schema";
import { AdminProfile } from "@/types/admin";

/**
 * Administrator authentication.
 *
 * Uses the same browser client as the rest of the app — the publishable key, with RLS
 * enforced. No service-role key is involved at any point, and none exists in this
 * codebase. Sessions persist and refresh because getSupabaseClient() already configures
 * `persistSession` and `autoRefreshToken`.
 *
 * HOW ADMIN STATUS IS DETERMINED
 * Signing in proves only that an auth user's password was correct. It does not make
 * anyone an administrator. Membership lives in public.admins, and the only way to read
 * it is the self-only SELECT policy (`auth_id = auth.uid()`), so fetchAdminProfile()
 * returns a row precisely when the signed-in user is an admin — the database answers the
 * question, not the client.
 *
 * That answer is a convenience for routing and for showing a name in the sidebar. It is
 * not the security boundary: every query the panel makes is independently gated by
 * public.is_admin() through RLS, so forcing this to return a row in a debugger would
 * reveal an empty panel and nothing else.
 */

const ADMIN_SELECT = `
  id,
  name,
  email
`;

/**
 * Error from the sign-in path, carrying the Supabase status so the UI can distinguish
 * "wrong password" from "the service is unreachable" without matching on message text.
 */
export class AdminAuthError extends Error {
  readonly status?: number;

  /**
   * Supabase Auth's own error code, where it sends one — `weak_password`,
   * `same_password`. The status alone cannot separate those two: both arrive as 422.
   */
  readonly code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "AdminAuthError";
    this.status = status;
    this.code = code;
  }

  /** 400/401 from Supabase Auth: the credentials themselves were rejected. */
  get isInvalidCredentials(): boolean {
    return this.status === 400 || this.status === 401;
  }

  /** Too many attempts against this account or IP. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /**
   * The new password fails the project's password policy.
   *
   * That policy is configured in Supabase and is the authority — passwordChangeSchema's
   * length floor is only a round-trip saver, so this can fire on a value the form accepted.
   */
  get isWeakPassword(): boolean {
    return this.code === "weak_password";
  }

  /** Supabase refused a change to the password already in use. */
  get isSamePassword(): boolean {
    return this.code === "same_password";
  }
}

/**
 * Signs in with email and password.
 *
 * Re-parses through the schema so a caller that skipped the form cannot send an empty
 * password, and so the email is trimmed exactly once. Neither the password nor the
 * returned session is logged.
 */
export const signInAdmin = async (input: AdminLoginInput): Promise<Session> => {
  const supabase = getSupabaseClient();
  const credentials = adminLoginSchema.parse(input);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });

  if (error) {
    throw new AdminAuthError(error.message, error.status);
  }

  if (!data.session) {
    throw new AdminAuthError("Sign-in did not return a session.");
  }

  return data.session;
};

/**
 * Ends the session.
 *
 * Scoped to this browser (`local`) rather than every device, so signing out of one
 * machine does not sign the administrator out of another.
 */
export const signOutAdmin = async (): Promise<void> => {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });

  if (error) {
    throw new AdminAuthError(error.message, error.status);
  }
};

/** The current session, or null. Reads from storage; no network round trip in the common case. */
export const fetchSession = async (): Promise<Session | null> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new AdminAuthError(error.message, error.status);
  }

  return data.session;
};

/**
 * The signed-in user's own admin row, or null if they are not an administrator.
 *
 * `maybeSingle()` rather than `single()`: no row is the expected answer for an
 * authenticated non-admin, and it is not an error. An actual error here — network,
 * expired token — is thrown so the guard can offer a retry rather than silently
 * presenting the user as unauthorized.
 */
export const fetchAdminProfile = async (): Promise<AdminProfile | null> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("admins").select(ADMIN_SELECT).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

/**
 * Changes the signed-in administrator's password.
 *
 * TWO STEPS, TWO CLIENTS, AND THAT IS THE POINT.
 *
 * 1. The current password is verified on a throwaway non-persisting client. Supabase's
 *    `updateUser({ password })` does *not* ask for the old password — a session alone is
 *    enough — so without this step an unattended signed-in browser would be enough to take
 *    the account over. See src/lib/supabase/verifyClient.ts for why this cannot happen on
 *    the shared client: a wrong guess there would replace the live session and sign the
 *    administrator out.
 *
 * 2. The update itself runs on the live client, because that is the one holding the session
 *    Supabase will apply the change to.
 *
 * Verification failure is reported as invalid credentials, deliberately without saying which
 * of the two passwords was the problem beyond that — though in practice only the current one
 * can fail here.
 *
 * Neither password is logged, stored, or included in any error. The two Supabase calls are
 * the only place either value goes.
 */
export const changeAdminPassword = async (input: {
  email: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> => {
  const verifier = createPasswordVerificationClient();

  try {
    const { error } = await verifier.auth.signInWithPassword({
      email: input.email,
      password: input.currentPassword,
    });

    if (error) {
      throw new AdminAuthError(error.message, error.status, error.code);
    }
  } finally {
    // `local` only — see verifyClient.ts. Failures here are ignored on purpose: this client
    // persists nothing, so a sign-out that does not complete leaves nothing behind, and
    // surfacing it would replace a real error with a meaningless one.
    await verifier.auth.signOut({ scope: "local" }).catch(() => undefined);
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password: input.newPassword });

  if (error) {
    throw new AdminAuthError(error.message, error.status, error.code);
  }
};
