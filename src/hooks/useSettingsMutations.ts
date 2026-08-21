import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminSettingsQueryKey } from "@/hooks/useAdminSettings";
import { enrollmentAvailabilityQueryKey } from "@/hooks/useEnrollmentAvailability";
import { paymentSettingsQueryKey } from "@/hooks/usePaymentSettings";
import { websiteSettingsQueryKey } from "@/hooks/useWebsiteSettings";
import type {
  PaymentSettingsInput,
  SiteSettingsInput,
  WebsiteSettingsInput,
} from "@/lib/validation/settings.schema";
import {
  SettingsError,
  saveAdminSettings,
  savePaymentSettings,
  saveWebsiteSettings,
} from "@/services/adminSettings.service";

/**
 * Settings mutations.
 *
 * Three independent mutations, matching the three independent forms: saving bank details
 * cannot disturb the pause, pausing cannot fail because an account number is blank, and
 * correcting a Telegram link cannot be held up by either.
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

/**
 * Saves the public website copy.
 *
 * One invalidation is enough, and that is the point of `websiteSettingsQueryKey` being shared
 * rather than admin-scoped: the same cache entry backs this form and every public page, so a
 * corrected Telegram link reaches an already-open homepage tab without a reload.
 *
 * No second key here — unlike the site settings above, which also invalidate the public
 * availability query because the pause is read through a different function.
 */
export const useSaveWebsiteSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: WebsiteSettingsInput) => saveWebsiteSettings(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: websiteSettingsQueryKey });
      toast.success("Website content saved. The public pages are updated.");
    },
    onError: (error) => {
      toast.error(describeSettingsError(error));
    },
  });
};
