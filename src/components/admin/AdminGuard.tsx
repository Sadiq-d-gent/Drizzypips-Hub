import { Loader2, ShieldX, WifiOff } from "lucide-react";
import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import AdminStateCard from "@/components/admin/AdminStateCard";
import { Button } from "@/components/ui/button";
import { useAdminSession } from "@/hooks/useAdminSession";
import { ADMIN_LOGIN_PATH } from "@/lib/admin/routes";

type AdminGuardProps = {
  children: ReactNode;
};

/**
 * Gates the admin area on a resolved administrator identity.
 *
 * THIS IS UX, NOT SECURITY.
 * Anything this component decides happens in the browser and could be defeated by anyone
 * willing to edit their own JavaScript. It exists so an administrator sees a sign-in form
 * instead of a wall of failed requests, and so a non-admin gets an explanation instead of
 * an empty table.
 *
 * The actual boundary is in the database. `isAdmin` is true only because the self-only
 * SELECT policy on public.admins returned a row for `auth.uid()`, and every query behind
 * this guard is independently gated by public.is_admin() through RLS — with the three
 * review functions in migration 007 raising 42501 for anyone else. Forcing this to render
 * its children yields an empty panel.
 *
 * Four states are distinguished on purpose:
 *   resolving           — render nothing conclusive; a redirect here would bounce a
 *                         signed-in admin to the login page on every refresh.
 *   read failed         — offer a retry. Not the same as "not an administrator", and
 *                         signing someone out over a dropped connection is hostile.
 *   not authenticated   — redirect to sign-in, remembering where they were going.
 *   authenticated, not an admin — say so plainly, and offer sign-out so they can switch
 *                         accounts. No redirect loop: sending them to the login page
 *                         while they hold a valid session would bounce them straight back.
 */
const AdminGuard = ({ children }: AdminGuardProps) => {
  const location = useLocation();
  const { isResolving, error, isAuthenticated, isAdmin, retry, signOut } = useAdminSession();

  if (isResolving) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
          <p className="text-sm" role="status">
            Checking your access…
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-lg">
          <AdminStateCard
            icon={WifiOff}
            title="Couldn't verify your access"
            description="We couldn't reach the server to confirm your administrator account. Check your connection and try again."
            tone="destructive"
          >
            <Button onClick={retry} className="btn-premium min-h-11">
              Try again
            </Button>
          </AdminStateCard>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to={ADMIN_LOGIN_PATH}
        replace
        state={{ redirectTo: `${location.pathname}${location.search}` }}
      />
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-lg">
          <AdminStateCard
            icon={ShieldX}
            title="You don't have admin access"
            description="This account is signed in but isn't an administrator. Sign in with an administrator account, or ask whoever manages the site to grant access."
            tone="destructive"
          >
            <Button
              variant="outline"
              className="min-h-11 rounded-xl"
              onClick={() => {
                void signOut();
              }}
            >
              Sign out
            </Button>
          </AdminStateCard>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AdminGuard;
