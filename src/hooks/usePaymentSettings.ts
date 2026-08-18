import { useQuery } from "@tanstack/react-query";

import { fetchActivePaymentSettings } from "@/services/paymentSettings.service";

export const paymentSettingsQueryKey = ["payment-settings", "active"] as const;

/**
 * Active bank transfer details for the payment step.
 *
 * Settings change rarely, so this caches longer than the course queries — but not
 * indefinitely: an account number corrected by an admin needs to reach in-flight
 * sessions without a hard reload.
 */
export const usePaymentSettings = () => {
  return useQuery({
    queryKey: paymentSettingsQueryKey,
    queryFn: fetchActivePaymentSettings,
    staleTime: 1000 * 60 * 10,
  });
};
