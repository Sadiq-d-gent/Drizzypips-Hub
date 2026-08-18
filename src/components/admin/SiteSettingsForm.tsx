import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PauseCircle } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_ENROLLMENT_PAUSED_MESSAGE } from "@/lib/constants/enrollment";
import { SiteSettingsInput, siteSettingsSchema } from "@/lib/validation/settings.schema";
import type { AdminSettings } from "@/types/admin";

type SiteSettingsFormProps = {
  /** The single admin_settings row, or null when it does not exist yet. */
  settings: AdminSettings | null;
  isSubmitting: boolean;
  onSubmit: (values: SiteSettingsInput) => void;
};

/**
 * The enrollment kill switch, and the address notifications will eventually use.
 *
 * `enrollment_enabled` was added in 003 and did nothing at all until 010 — the column
 * existed, was commented as a kill switch, and no code on either side of the wire read it.
 * This form is one of the two ends that changed; the other is the guard inside
 * create_enrollment(), which is what actually refuses a submission.
 */
const EMPTY_SITE_SETTINGS: SiteSettingsInput = {
  notification_email: "",
  enrollment_enabled: true,
  enrollment_paused_message: "",
};

const toFormValues = (settings: AdminSettings | null): SiteSettingsInput =>
  settings
    ? {
        notification_email: settings.notification_email ?? "",
        enrollment_enabled: settings.enrollment_enabled,
        enrollment_paused_message: settings.enrollment_paused_message ?? "",
      }
    : EMPTY_SITE_SETTINGS;

const SiteSettingsForm = ({ settings, isSubmitting, onSubmit }: SiteSettingsFormProps) => {
  const form = useForm<SiteSettingsInput>({
    resolver: zodResolver(siteSettingsSchema),
    defaultValues: toFormValues(settings),
    mode: "onBlur",
  });

  /**
   * Values held back while the confirmation dialog is open.
   *
   * The toggle itself is not confirmed — it only edits form state, and nothing reaches a
   * student until the form is saved. The confirmation belongs at save, which is the moment
   * the site actually closes.
   */
  const [pendingPause, setPendingPause] = useState<SiteSettingsInput | null>(null);

  const enabled = form.watch("enrollment_enabled");
  const pausedMessage = form.watch("enrollment_paused_message");

  /** No row yet means enrollments are on — the column default, and what the RPC returns. */
  const savedAsEnabled = settings?.enrollment_enabled ?? true;

  const handleSubmit = (values: SiteSettingsInput) => {
    // Ask only when this save is what closes the site. Editing the message of an already
    // paused site, or reopening it, goes straight through.
    if (!values.enrollment_enabled && savedAsEnabled) {
      setPendingPause(values);
      return;
    }

    onSubmit(values);
  };

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6" noValidate>
          <FormField
            control={form.control}
            name="notification_email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notification email</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="email"
                    autoComplete="off"
                    placeholder="you@example.com"
                    className="h-12 rounded-xl border-border bg-card"
                  />
                </FormControl>
                <FormDescription>
                  Stored, but nothing sends mail yet — no email goes out when an enrollment
                  arrives. Check the queue. Optional until notifications are built.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="enrollment_enabled"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start justify-between gap-6 rounded-2xl border border-border bg-card p-5">
                <div className="min-w-0 space-y-1">
                  <FormLabel className="text-base">Accepting enrollments</FormLabel>
                  <FormDescription>
                    {enabled
                      ? "Students can enrol and submit receipts as normal."
                      : "The enrollment form is closed. Courses stay listed and browsable, and existing enrollments are unaffected."}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-label="Accepting enrollments"
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="enrollment_paused_message"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Message shown while paused</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={3}
                    placeholder="We are closed for enrollment until 3 September. Join the waitlist on WhatsApp and we will let you know."
                    className="rounded-xl border-border bg-card"
                  />
                </FormControl>
                <FormDescription>
                  {enabled
                    ? "Editable now so it is ready in advance. Students cannot see it while enrollments are open."
                    : "This is the only explanation a blocked student gets. Required while paused."}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/*
            Live preview of the student's side. The fallback is what a settings row edited
            outside this form would produce — the schema will not let anyone pause from here
            without writing something.
          */}
          <div className="rounded-2xl border border-warning/40 bg-warning/10 p-5">
            <div className="flex items-center gap-2">
              <PauseCircle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">
                What a student sees on the enrol page while paused
              </p>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">
              {pausedMessage.trim() || DEFAULT_ENROLLMENT_PAUSED_MESSAGE}
            </p>
          </div>

          <Button type="submit" className="btn-premium min-h-12" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Saving
              </>
            ) : (
              "Save enrollment settings"
            )}
          </Button>
        </form>
      </Form>

      <AlertDialog
        open={pendingPause !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingPause(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause enrollments?</AlertDialogTitle>
            <AlertDialogDescription>
              Nobody will be able to enrol on any course until you turn this back on, and
              anyone part-way through the form will be stopped when they submit. Courses stay
              listed and existing enrollments are untouched. Students will read:{" "}
              <span className="font-medium text-foreground">
                {pendingPause?.enrollment_paused_message.trim() ||
                  DEFAULT_ENROLLMENT_PAUSED_MESSAGE}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Keep accepting enrollments</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingPause) {
                  onSubmit(pendingPause);
                }
                setPendingPause(null);
              }}
            >
              Pause enrollments
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default SiteSettingsForm;
