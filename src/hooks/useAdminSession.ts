import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { ADMIN_QUERY_SCOPE } from "@/lib/constants/admin";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchAdminProfile, fetchSession, signOutAdmin } from "@/services/admin.service";

export const adminSessionQueryKey = [...ADMIN_QUERY_SCOPE, "session"] as const;

export const adminProfileQueryKey = [...ADMIN_QUERY_SCOPE, "profile"] as const;

/**
 * Session and admin-profile state for the whole panel.
 *
 * Two queries rather than one, chained on `enabled`, because they answer different
 * questions and fail differently: the session comes from local storage and is cheap, the
 * profile is a network read whose empty result is the meaningful "authenticated but not
 * an administrator" case. Splitting them lets the guard tell a non-admin apart from a
 * transient read failure.
 *
 * `staleTime: Infinity` on both: nothing invalidates a session except an auth event, and
 * the subscription below handles those. Refetching on window focus would put a request on
 * every tab switch for data that has not changed.
 */
export const useAdminSession = () => {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: adminSessionQueryKey,
    queryFn: fetchSession,
    staleTime: Infinity,
    retry: false,
  });

  const profileQuery = useQuery({
    queryKey: adminProfileQueryKey,
    queryFn: fetchAdminProfile,
    enabled: Boolean(sessionQuery.data),
    staleTime: Infinity,
    retry: false,
  });

  /**
   * Keeps the cache honest when the session changes outside this hook.
   *
   * Fires on sign-in, sign-out, token refresh, and — importantly — on a sign-out that
   * happened in another tab. On the way out the entire admin scope is removed rather than
   * invalidated: these caches hold student names, emails and phone numbers, and
   * invalidating would leave them readable in memory until something refetched.
   */
  useEffect(() => {
    const supabase = getSupabaseClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      queryClient.setQueryData(adminSessionQueryKey, session);

      if (event === "SIGNED_OUT" || !session) {
        queryClient.removeQueries({ queryKey: ADMIN_QUERY_SCOPE });
        queryClient.setQueryData(adminSessionQueryKey, null);
        return;
      }

      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        void queryClient.invalidateQueries({ queryKey: adminProfileQueryKey });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const isResolving =
    sessionQuery.isLoading || (Boolean(sessionQuery.data) && profileQuery.isLoading);

  return {
    session: sessionQuery.data ?? null,
    admin: profileQuery.data ?? null,
    /** True only once both questions have been answered. Nothing should render on a guess. */
    isResolving,
    /** A read failed — distinct from "not an administrator", which is a resolved answer. */
    error: sessionQuery.error ?? profileQuery.error ?? null,
    isAuthenticated: Boolean(sessionQuery.data),
    /** Authoritative for routing only; every query is separately RLS-gated. */
    isAdmin: Boolean(profileQuery.data),
    retry: () => {
      void sessionQuery.refetch();
      void profileQuery.refetch();
    },
    /** Ends the session. onAuthStateChange clears the cached PII. */
    signOut: signOutAdmin,
  };
};
