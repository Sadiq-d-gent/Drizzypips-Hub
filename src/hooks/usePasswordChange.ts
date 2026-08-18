import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import type { PasswordChangeInput } from "@/lib/validation/admin.schema";
import { AdminAuthError, changeAdminPassword } from "@/services/admin.service";

/**
 * The password change mutation.
 *
 * Nothing is invalidated on success. The change does not alter any cached data — the admin
 * profile, the queue and the settings are all unaffected — and the session survives it, which
 * is the behaviour the account page states and the browser walk-through checks.
 */

/**
 * Turns a failure into something an administrator can act on.
 *
 * Ordered most specific first. `isInvalidCredentials` last of the AdminAuthError branches
 * because at this point only one credential has been offered for checking: the current
 * password. A 400 here means that was wrong, not that the account is unknown.
 */
const describePasswordError = (error: unknown): string => {
  if (error instanceof AdminAuthError) {
    if (error.isWeakPassword) {
      return "That password does not meet this project's password policy. Try a longer one, or mix in numbers and symbols.";
    }

    if (error.isSamePassword) {
      return "That is already your password. Choose a different one.";
    }

    if (error.isRateLimited) {
      return "Too many attempts. Wait a few minutes and try again.";
    }

    if (error.isInvalidCredentials) {
      return "Your current password is not correct. You are still signed in — try again.";
    }
  }

  return "The password could not be changed. Please try again.";
};

export const usePasswordChange = (email: string | undefined) =>
  useMutation({
    mutationFn: (input: PasswordChangeInput) =>
      changeAdminPassword({
        // The address comes from the signed-in admin's own profile row, not from a form
        // field, so this cannot be used to probe or act on another account.
        email: email as string,
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
      }),
    onSuccess: () => {
      toast.success("Password changed. You are still signed in on this device.");
    },
    onError: (error) => {
      toast.error(describePasswordError(error));
    },
  });
