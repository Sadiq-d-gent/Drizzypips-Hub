import { AlertTriangle, CreditCard, Globe, Info, ToggleLeft } from "lucide-react";

import AdminSection from "@/components/admin/AdminSection";
import AdminStateCard from "@/components/admin/AdminStateCard";
import PaymentSettingsForm from "@/components/admin/PaymentSettingsForm";
import SiteSettingsForm from "@/components/admin/SiteSettingsForm";
import WebsiteSettingsForm from "@/components/admin/WebsiteSettingsForm";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminSettings } from "@/hooks/useAdminSettings";
import { usePaymentSettings } from "@/hooks/usePaymentSettings";
import {
  useSavePaymentSettings,
  useSaveSiteSettings,
  useSaveWebsiteSettings,
} from "@/hooks/useSettingsMutations";
import { useWebsiteSettings } from "@/hooks/useWebsiteSettings";

/**
 * The three settings tables, edited on one screen.
 *
 * Three independent sections, each with its own query, its own form and its own save button.
 * That separation is the point of the screen: an account number left blank must not be able
 * to stop someone from pausing enrollments, pausing must not require re-validating the
 * payment instructions, and neither must stand between an administrator and a corrected
 * Telegram link. Nothing is shared between them but the page shell.
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
  const websiteQuery = useWebsiteSettings();

  const savePayment = useSavePaymentSettings();
  const saveSite = useSaveSiteSettings();
  const saveWebsite = useSaveWebsiteSettings();

  const payment = paymentQuery.data ?? null;
  const site = siteQuery.data ?? null;
  const website = websiteQuery.data ?? null;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Bank details students pay into, the switch that closes enrollment, and the copy and
          links on the public pages. All of it takes effect as soon as you save.
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

        <AdminSection
          divided
          icon={Globe}
          title="Website content"
          description="Headline, hero figures, community and broker links, socials and footer — without a deploy."
        >
          {websiteQuery.isLoading ? (
            <FormSkeleton rows={["h-20", "h-12", "h-24", "h-32", "h-40"]} />
          ) : websiteQuery.isError ? (
            /*
              The one settings card where the error branch is protective rather than
              informational. The public pages fail open — they render the compiled-in copy when
              this query fails — but an admin form that rendered on a failed read would show
              every field empty, and saving that would write NULL over whatever is actually
              stored. So nothing is offered to edit until the current values are known.
            */
            <AdminStateCard
              icon={AlertTriangle}
              title="Couldn't load the website content"
              description="Something went wrong reading the settings. The public pages are unaffected — they are still showing the saved copy. Please try again before editing."
              tone="destructive"
            >
              <Button
                className="btn-premium min-h-11"
                onClick={() => {
                  void websiteQuery.refetch();
                }}
              >
                Try again
              </Button>
            </AdminStateCard>
          ) : (
            <WebsiteSettingsForm
              key={website?.updated_at ?? "empty"}
              settings={website}
              isSubmitting={saveWebsite.isPending}
              onSubmit={(values) => saveWebsite.mutate(values)}
            />
          )}
        </AdminSection>
      </div>
    </div>
  );
};

export default AdminSettings;
