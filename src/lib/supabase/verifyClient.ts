import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/env";

/**
 * A throwaway Supabase client used only to check a password.
 *
 * WHY THIS CANNOT BE getSupabaseClient()
 * That module returns a singleton configured with `persistSession: true`. Calling
 * `signInWithPassword` on it *replaces the stored session with the result* — so verifying a
 * password on the shared client would mean an administrator who mistypes their current
 * password gets signed out mid-task, and a correct entry would silently re-issue the session
 * they were already using. Neither is acceptable on a page whose whole job is a careful
 * change to the account.
 *
 * So this client persists nothing, refreshes nothing, and reads nothing from the URL. It is
 * created for one call and dropped. It uses the same publishable key and the same RLS as
 * everything else — no service-role key is involved, here or anywhere in this codebase — and
 * it grants no access the caller does not already have by knowing the password.
 *
 * The storage key is distinct anyway, belt-and-braces: `persistSession: false` already keeps
 * this client out of storage, and a separate key means it could not collide with the live
 * session even if that changed.
 *
 * SIGNING IT OUT
 * Use `scope: "local"` only. `"global"` would revoke every refresh token for the user,
 * including the session the administrator is currently working in, and `"others"` would
 * revoke everything *except* this throwaway one — which is the live session. Both would sign
 * the admin out as a side effect of typing their own password correctly. `"local"` discards
 * this client's in-memory session and leaves the real one alone; the short-lived token it
 * obtained is never written down and simply expires.
 *
 * No password is logged, stored or returned by anything in this module.
 */
export const createPasswordVerificationClient = () => {
  const { supabaseUrl, supabasePublishableKey } = getSupabaseEnv();

  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: "drizzypips-password-verification",
    },
  });
};
