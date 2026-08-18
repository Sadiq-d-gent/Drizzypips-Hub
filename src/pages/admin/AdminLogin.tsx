import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAdminSession } from "@/hooks/useAdminSession";
import { ADMIN_ROOT_PATH, isSafeAdminRedirect } from "@/lib/admin/routes";
import { AdminAuthError, signInAdmin } from "@/services/admin.service";
import { AdminLoginInput, adminLoginSchema } from "@/lib/validation/admin.schema";

/**
 * Maps a sign-in failure to copy.
 *
 * Wrong email and wrong password give the same message deliberately: telling an attacker
 * which half they got right turns the form into an account-enumeration oracle.
 */
const describeAuthError = (error: unknown): string => {
  if (error instanceof AdminAuthError) {
    if (error.isInvalidCredentials) {
      return "That email and password don't match an account.";
    }

    if (error.isRateLimited) {
      return "Too many attempts. Wait a minute and try again.";
    }
  }

  return "Something went wrong signing you in. Please try again.";
};

/**
 * Administrator sign-in.
 *
 * Not linked from anywhere in the public site — an administrator reaches it by typing the
 * URL, or by being redirected here by AdminGuard. There is deliberately no sign-up link
 * and no password reset: public.admins has no INSERT policy for any role, so an account
 * can only be created by someone with database access running
 * supabase/maintenance/grant_admin.sql.
 */
const AdminLogin = () => {
  const location = useLocation();
  const { isResolving, isAdmin } = useAdminSession();

  const redirectState = location.state as { redirectTo?: string } | null;
  const redirectTo = isSafeAdminRedirect(redirectState?.redirectTo)
    ? redirectState.redirectTo
    : ADMIN_ROOT_PATH;

  const form = useForm<AdminLoginInput>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  });

  /**
   * The session cache is not written here. signInWithPassword fires onAuthStateChange,
   * and useAdminSession's subscription is the single place that updates the cache — so a
   * sign-in from any source lands the same way.
   */
  const mutation = useMutation({
    mutationFn: signInAdmin,
    onError: (error) => {
      form.setError("root", { message: describeAuthError(error) });
      form.resetField("password");
    },
  });

  /**
   * An administrator who is already signed in has no business on this page.
   *
   * Gated on `isResolving` so the redirect waits for a real answer. Note the condition is
   * `isAdmin`, not `isAuthenticated`: an authenticated non-admin must stay here, because
   * bouncing them to /admin would only send them back and loop.
   */
  if (!isResolving && isAdmin) {
    return <Navigate to={redirectTo} replace />;
  }

  const rootError = form.formState.errors.root?.message;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground">Admin sign in</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Drizzypips Hub enrollment review. Administrator accounts only.
          </p>
        </div>

        <Card className="mt-8 rounded-3xl border-border bg-card shadow-premium">
          <CardContent className="p-6 sm:p-8">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
                className="space-y-5"
                noValidate
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email address</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          autoComplete="email"
                          inputMode="email"
                          autoFocus
                          placeholder="admin@example.com"
                          className="h-12 rounded-xl border-border bg-background"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          autoComplete="current-password"
                          placeholder="••••••••"
                          className="h-12 rounded-xl border-border bg-background"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {rootError ? (
                  <p
                    role="alert"
                    className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                  >
                    {rootError}
                  </p>
                ) : null}

                <Button
                  type="submit"
                  className="btn-premium min-h-12 w-full"
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" aria-hidden="true" />
                      Sign in
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
          Access is granted directly in the database. There is no self-service sign-up.
        </p>
      </div>
    </main>
  );
};

export default AdminLogin;
