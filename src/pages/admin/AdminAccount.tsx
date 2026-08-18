import { AlertTriangle, KeyRound, UserRound } from "lucide-react";
import { useState } from "react";

import AdminSection from "@/components/admin/AdminSection";
import AdminStateCard from "@/components/admin/AdminStateCard";
import PasswordChangeForm from "@/components/admin/PasswordChangeForm";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminSession } from "@/hooks/useAdminSession";
import { usePasswordChange } from "@/hooks/usePasswordChange";

/**
 * The administrator's own account.
 *
 * Password change only. Name and email are read-only, and not for tidiness:
 * `public.admins` ships a self-only SELECT policy and no INSERT, UPDATE or DELETE policy for
 * any role, so an edit to `admins.name` from here would silently affect zero rows. The
 * address is Supabase Auth's, which is not this table's to change either.
 *
 * There is no "sign out everywhere" and no session list. Sign-out is scoped to this browser
 * throughout the panel, deliberately, so acting on one machine cannot interrupt work on
 * another.
 */

/** Read-only identity row. Selectable text, because an email is a thing people copy. */
const IdentityRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-6">
    <p className="w-40 shrink-0 text-sm text-muted-foreground">{label}</p>
    <p className="min-w-0 break-words text-sm font-medium text-foreground">{value}</p>
  </div>
);

const AdminAccount = () => {
  const { admin, session, isResolving } = useAdminSession();

  /**
   * The address the password is verified against.
   *
   * Taken from the session rather than the `admins` row, because Supabase Auth is what the
   * sign-in actually goes to. The two are separate columns in separate tables and nothing
   * keeps them in step, so using the profile copy here would turn a stale `admins.email`
   * into an unexplainable "your current password is not correct".
   */
  const signInEmail = session?.user.email ?? admin?.email;

  const change = usePasswordChange(signInEmail);

  /**
   * Bumped on success to remount the form, which is what clears the three typed passwords.
   * Keyed on success rather than on every submit: a wrong current password must not also
   * wipe the new one the admin just chose.
   */
  const [changeCount, setChangeCount] = useState(0);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Your account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Who you are signed in as, and how to change your password.
        </p>
      </div>

      <div className="mt-8">
        <AdminSection
          icon={UserRound}
          title="Administrator"
          description="Read-only here. Your name is set in the database, your email in Supabase Auth."
        >
          {isResolving ? (
            <div className="flex flex-col gap-4" aria-hidden="true">
              <Skeleton className="h-6 rounded-xl" />
              <Skeleton className="h-6 rounded-xl" />
            </div>
          ) : !admin ? (
            <AdminStateCard
              icon={AlertTriangle}
              title="Couldn't read your profile"
              description="Your administrator record could not be loaded, so there is nothing to show here. Try reloading the page."
              tone="destructive"
            />
          ) : (
            <>
              <div className="divide-y divide-border rounded-2xl border border-border px-5 py-2">
                <IdentityRow label="Name" value={admin.name} />
                <IdentityRow label="Sign-in email" value={signInEmail ?? admin.email} />
              </div>

              {/*
                Two columns in two tables, nothing keeping them in step. Worth saying out loud
                when they have drifted, because the sign-in email is the one that matters and
                the other is what the rest of the panel displays.
              */}
              {signInEmail && signInEmail !== admin.email ? (
                <p className="mt-4 text-sm leading-6 text-warning">
                  Your admin record lists{" "}
                  <span className="font-medium">{admin.email}</span>, which is not the address
                  you sign in with. Worth correcting in the database so the two agree.
                </p>
              ) : null}

              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Administrator access is granted directly in the database — there is no
                self-service sign-up, and no way to add or remove an administrator from this
                panel.
              </p>
            </>
          )}
        </AdminSection>

        <AdminSection
          divided
          icon={KeyRound}
          title="Change password"
          description="Takes effect immediately. You stay signed in on this device."
        >
          {isResolving ? (
            <div className="flex flex-col gap-4" aria-hidden="true">
              <Skeleton className="h-12 rounded-xl" />
              <Skeleton className="h-12 rounded-xl" />
              <Skeleton className="h-12 rounded-xl" />
            </div>
          ) : !signInEmail ? (
            /*
              The form is withheld rather than shown disabled. Without an address there is
              nothing to verify the current password against, and offering a form that cannot
              submit is worse than saying why.
            */
            <AdminStateCard
              icon={AlertTriangle}
              title="Password change unavailable"
              description="Your session does not carry an email address, so the current password cannot be verified. Sign out and sign in again, then try once more."
              tone="destructive"
            />
          ) : (
            <PasswordChangeForm
              key={changeCount}
              isSubmitting={change.isPending}
              onSubmit={(values) => {
                change.mutate(values, {
                  onSuccess: () => setChangeCount((count) => count + 1),
                });
              }}
            />
          )}
        </AdminSection>
      </div>
    </div>
  );
};

export default AdminAccount;
