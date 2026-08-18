import { AlertTriangle, CreditCard, Info, ToggleLeft } from "lucide-react";

import AdminSection from "@/components/admin/AdminSection";
import AdminStateCard from "@/components/admin/AdminStateCard";
import PaymentSettingsForm from "@/components/admin/PaymentSettingsForm";
import SiteSettingsForm from "@/components/admin/SiteSettingsForm";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminSettings } from "@/hooks/useAdminSettings";
import { usePaymentSettings } from "@/hooks/usePaymentSettings";
import { useSavePaymentSettings, useSaveSiteSettings } from "@/hooks/useSettingsMutations";

/**
 * The two settings tables, edited side by side.
 *
 * Two independent sections, each with its own query, its own form and its own save button.
 * That separation is the point of the screen: an account number left blank must not be able
 * to stop someone from pausing enrollments, and pausing must not require re-validating the
 * payment instructions. Nothing is shared between them but the page shell.
 */

/** Placeholder heights roughly matching each form, so the page does not jump on load. */
const FormSkeleton = ({ rows }: { rows: readonly string[] }) => (
  <div className="flex flex-col gap-4" aria-hidden="true">
    {rows.map((height, index) => (
      <Skeleton key={index} className={`${height} rounded-xl`} />
    ))}
  </div>
);

const AdminSettings = () => {
  const paymentQuery = usePaymentSettings();
  const siteQuery = useAdminSettings();

  const savePayment = useSavePaymentSettings();
  const saveSite = useSaveSiteSettings();

  const payment = paymentQuery.data ?? null;
  const site = siteQuery.data ?? null;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Bank details students pay into, and the switch that closes enrollment. Both take
          effect as soon as you save.
        </p>
      </div>

      <div className="mt-8">
        <AdminSection
          icon={CreditCard}
          title="Payment details"
          description="Shown to every student on the payment step, exactly as written here."
        >
          {paymentQuery.isLoading ? (
            <FormSkeleton rows={["h-12", "h-12", "h-24", "h-32", "h-12"]} />
          ) : paymentQuery.isError ? (
            <AdminStateCard
              icon={AlertTriangle}
              title="Couldn't load the payment details"
              description="Something went wrong reading the settings. Nothing has changed — please try again."
              tone="destructive"
            >
              <Button
                className="btn-premium min-h-11"
                onClick={() => {
                  void paymentQuery.refetch();
                }}
              >
                Try again
              </Button>
            </AdminStateCard>
          ) : (
            <>
              {/*
                No active row is a real state, not an error: the payment step renders its own
                explanatory panel when this is missing, so students currently cannot see where
                to pay. Saving this form creates the row.
              */}
              {!payment ? (
                <div className="mb-6 flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-5">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                  <p className="text-sm leading-6 text-muted-foreground">
                    No payment details are set up yet, so students reaching the payment step are
                    told to contact support instead of being shown an account. Filling this in
                    and saving fixes that.
                  </p>
                </div>
              ) : null}

              {/*
                Remounted on the row's updated_at, so after a save the form restarts from the
                values that actually persisted rather than from what was typed — the same trick
                AdminCourseEdit uses.
              */}
              <PaymentSettingsForm
                key={payment?.updated_at ?? "empty"}
                settings={payment}
                isSubmitting={savePayment.isPending}
                onSubmit={(values) => savePayment.mutate(values)}
              />
            </>
          )}
        </AdminSection>

        <AdminSection
          divided
          icon={ToggleLeft}
          title="Enrollment availability"
          description="Close enrollment without a deploy. Courses stay listed and browsable either way."
        >
          {siteQuery.isLoading ? (
            <FormSkeleton rows={["h-12", "h-20", "h-24", "h-24"]} />
          ) : siteQuery.isError ? (
            <AdminStateCard
              icon={AlertTriangle}
              title="Couldn't load the enrollment settings"
              description="Something went wrong reading the settings. Enrollment is unaffected — please try again."
              tone="destructive"
            >
              <Button
                className="btn-premium min-h-11"
                onClick={() => {
                  void siteQuery.refetch();
                }}
              >
                Try again
              </Button>
            </AdminStateCard>
          ) : (
            <SiteSettingsForm
              key={site?.updated_at ?? "empty"}
              settings={site}
              isSubmitting={saveSite.isPending}
              onSubmit={(values) => saveSite.mutate(values)}
            />
          )}
        </AdminSection>
      </div>
    </div>
  );
};

export default AdminSettings;
