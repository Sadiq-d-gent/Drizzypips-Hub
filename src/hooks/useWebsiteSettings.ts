import { useQuery } from "@tanstack/react-query";

import { resolveWebsiteSettings } from "@/lib/website/resolveWebsiteSettings";
import { fetchWebsiteSettings } from "@/services/websiteSettings.service";
import type { WebsiteContent } from "@/types/website";

/**
 * One cache key, read by both the public pages and the admin form.
 *
 * Deliberately outside ADMIN_QUERY_SCOPE, which the sign-out path clears with a single
 * `removeQueries`. Nothing in this table is PII or admin-only — it is the copy on the
 * homepage — so dropping it on sign-out would evict a cache the public site is using. This
 * is the `paymentSettingsQueryKey` arrangement, and the opposite of `adminSettingsQueryKey`,
 * which carries `notification_email` and must not survive a session.
 *
 * Sharing the key is also what makes one invalidation after a save update the admin form and
 * every public page at once.
 */
export const websiteSettingsQueryKey = ["website-settings"] as const;

/**
 * The raw row, for the admin form.
 *
 * The form needs to know the difference between "this column is null, so the site is using
 * the default" and "this column holds that value" — a resolved object cannot express that,
 * because in it a defaulted field and an explicitly-set-to-the-same-value field look
 * identical. It also needs `updated_at` for the remount-after-save key, and the query's
 * `isPending` / `error` states for the skeleton and the error card.
 *
 * Caches for ten minutes, like usePaymentSettings: settings change rarely, but not never,
 * and an edit should reach an already-open tab without a hard reload.
 */
export const useWebsiteSettings = () => {
  return useQuery({
    queryKey: websiteSettingsQueryKey,
    queryFn: fetchWebsiteSettings,
    staleTime: 1000 * 60 * 10,
  });
};

/**
 * The resolved content, for public pages.
 *
 * Returns a fully-populated `WebsiteContent` in every state — loading, error, empty table —
 * so a consumer never has a spinner or a fallback of its own. That is intentional: the
 * alternative is a homepage that flashes empty on first paint and shows nothing at all if
 * the request fails, which is strictly worse than briefly showing the copy the site shipped
 * with. Anything genuinely dynamic on these pages (the published courses) has its own query
 * with real loading and error branches.
 *
 * Rides the same query as useWebsiteSettings, so a page rendering both the hero and the
 * footer makes one request, not two.
 */
export const useWebsiteContent = (): WebsiteContent => {
  const { data } = useWebsiteSettings();

  return resolveWebsiteSettings(data);
};
