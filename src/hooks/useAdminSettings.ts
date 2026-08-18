import { useQuery } from "@tanstack/react-query";

import { ADMIN_QUERY_SCOPE } from "@/lib/constants/admin";
import { fetchAdminSettings } from "@/services/adminSettings.service";

/**
 * Inside ADMIN_QUERY_SCOPE, unlike paymentSettingsQueryKey.
 *
 * The distinction is not tidiness. `admin_settings` carries `notification_email`, so this
 * cache has to be dropped by the `removeQueries` on sign-out that clears the admin scope —
 * a shared browser must not hand the next person the previous administrator's contact
 * address. Payment settings are the opposite: publishing them is the point, so they stay
 * outside the scope and survive sign-out like any other public data.
 */
export const adminSettingsQueryKey = [...ADMIN_QUERY_SCOPE, "settings", "site"] as const;

/**
 * The single admin_settings row.
 *
 * `null` data is a real answer — no settings row yet — and the form renders its empty
 * defaults for it rather than an error. Saving then creates the row via upsert.
 */
export const useAdminSettings = () =>
  useQuery({
    queryKey: adminSettingsQueryKey,
    queryFn: fetchAdminSettings,
    staleTime: 1000 * 60,
  });
