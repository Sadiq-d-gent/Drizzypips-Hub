import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PASSWORD_MIN_LENGTH } from "@/lib/constants/admin";
import { PasswordChangeInput, passwordChangeSchema } from "@/lib/validation/admin.schema";

type PasswordChangeFormProps = {
  isSubmitting: boolean;
  onSubmit: (values: PasswordChangeInput) => void;
};

/**
 * Change the signed-in administrator's password.
 *
 * The current password is asked for even though Supabase does not require it: a session
 * alone is enough for `updateUser({ password })`, so without this field an unattended
 * signed-in browser would be enough to take the account over. See admin.service.ts for how
 * it is checked without disturbing the live session.
 *
 * The fields carry `autoComplete` values a password manager understands — `current-password`
 * for the first and `new-password` for the other two — so a stored credential is offered for
 * the field it belongs to and the generated one is offered for the fields it belongs to.
 *
 * Nothing here is logged, and the values never leave the two Supabase Auth calls. The page
 * remounts this form after a successful change, which is what clears the typed passwords.
 */
const PasswordChangeForm = ({ isSubmitting, onSubmit }: PasswordChangeFormProps) => {
  const form = useForm<PasswordChangeInput>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
    mode: "onBlur",
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Current password</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="h-12 rounded-xl border-border bg-card"
                />
              </FormControl>
              <FormDescription>
                Checked before anything changes. Getting it wrong does not sign you out.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="newPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="h-12 rounded-xl border-border bg-card"
                  />
                </FormControl>
                <FormDescription>
                  At least {PASSWORD_MIN_LENGTH} characters. Your project's password policy may
                  ask for more.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Repeat new password</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="h-12 rounded-xl border-border bg-card"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" className="btn-premium min-h-12" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Changing password
            </>
          ) : (
            <>
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Change password
            </>
          )}
        </Button>
      </form>
    </Form>
  );
};

export default PasswordChangeForm;
