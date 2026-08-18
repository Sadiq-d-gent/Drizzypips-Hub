import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminSettingsQueryKey } from "@/hooks/useAdminSettings";
import { enrollmentAvailabilityQueryKey } from "@/hooks/useEnrollmentAvailability";
import { paymentSettingsQueryKey } from "@/hooks/usePaymentSettings";
import type { PaymentSettingsInput, SiteSettingsInput } from "@/lib/validation/settings.schema";
import {
  SettingsError,
  saveAdminSettings,
  savePaymentSettings,
} from "@/services/adminSettings.service";

/**
 * Settings mutations.
 *
 * Two independent mutations, matching the two independent forms: saving bank details cannot
 * disturb the pause, and pausing cannot fail because an account number is blank.
 */

/**
 * Only a SettingsError carries copy written for an administrator. Anything else — a network
 * failure, a bug — gets the generic line, because whatever text it holds was not written to
 * be read by a person.
 */
const describeSettingsError = (error: unknown): string => {
  if (error instanceof SettingsError) {
    return error.message;
  }

  return "Something went wrong saving these settings. Please try again.";
};

/**
 * Saves the payment details and refreshes the *student-facing* cache.
 *
 * `paymentSettingsQueryKey` is the key the enrollment payment step reads through, so this
 * invalidation is what makes a corrected account number reach someone who already has the
 * page open. That shared key is the reason the admin form does not add a second query of its
 * own for the same row.
 */
export const useSavePaymentSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PaymentSettingsInput) => savePaymentSettings(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: paymentSettingsQueryKey });
      toast.success("Payment details saved. Students will see them from now on.");
    },
    onError: (error) => {
      toast.error(describeSettingsError(error));
    },
  });
};

/**
 * Saves the site settings, and invalidates the public availability query as well as the
 * admin one — pausing enrollments has to change what students see, not just what the
 * settings form shows.
 */
export const useSaveSiteSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SiteSettingsInput) => saveAdminSettings(input),
    onSuccess: (settings) => {
      void queryClient.invalidateQueries({ queryKey: adminSettingsQueryKey });
      void queryClient.invalidateQueries({ queryKey: enrollmentAvailabilityQueryKey });
      toast.success(
        settings.enrollment_enabled
          ? "Settings saved. Enrollments are open."
          : "Settings saved. Enrollments are paused.",
      );
    },
    onError: (error) => {
      toast.error(describeSettingsError(error));
    },
  });
};
