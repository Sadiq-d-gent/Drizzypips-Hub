import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  COURSE_CURRENCY_OPTIONS,
  REVIEW_WINDOW_HOURS_MAX,
  REVIEW_WINDOW_HOURS_MIN,
} from "@/lib/constants/admin";
import { DEFAULT_REVIEW_WINDOW_HOURS } from "@/lib/constants/enrollment";
import { PaymentSettingsInput, paymentSettingsSchema } from "@/lib/validation/settings.schema";
import type { PaymentSettings } from "@/types/enrollment";

type PaymentSettingsFormProps = {
  /** The active row, or null when none exists yet. */
  settings: PaymentSettings | null;
  isSubmitting: boolean;
  onSubmit: (values: PaymentSettingsInput) => void;
};

/**
 * The bank details every paying student is shown.
 *
 * There is no cancel button and no danger zone. Nothing here is destructive — the worst a
 * mistake does is display the wrong account number until it is corrected — and the form is
 * the whole card, so "cancel" would mean navigating away, which the browser already offers.
 *
 * Every field is public. That is the point of the table, not an oversight: 003 keeps these
 * columns separate from `admin_settings` precisely so the public read policy can be a flat
 * `is_active = true` over a table holding only publishable values.
 */
const EMPTY_PAYMENT_SETTINGS: PaymentSettingsInput = {
  bank_name: "",
  account_name: "",
  account_number: "",
  additional_details: "",
  currency: "NGN",
  payment_instructions: "",
  review_window_hours: DEFAULT_REVIEW_WINDOW_HOURS,
  support_whatsapp_number: "",
};

/**
 * Row to form values.
 *
 * Nullable columns become `""`, because that is what an empty text input holds. The reverse
 * conversion happens in savePaymentSettings, so a cleared field is stored as NULL rather than
 * an empty string — which matters, since a null `support_whatsapp_number` is how the payment
 * step knows to fall back to the compiled-in support number.
 */
const toFormValues = (settings: PaymentSettings | null): PaymentSettingsInput =>
  settings
    ? {
        bank_name: settings.bank_name,
        account_name: settings.account_name,
        account_number: settings.account_number,
        additional_details: settings.additional_details ?? "",
        currency: settings.currency,
        payment_instructions: settings.payment_instructions,
        review_window_hours: Number(settings.review_window_hours),
        support_whatsapp_number: settings.support_whatsapp_number ?? "",
      }
    : EMPTY_PAYMENT_SETTINGS;

const PaymentSettingsForm = ({
  settings,
  isSubmitting,
  onSubmit,
}: PaymentSettingsFormProps) => {
  const form = useForm<PaymentSettingsInput>({
    resolver: zodResolver(paymentSettingsSchema),
    defaultValues: toFormValues(settings),
    mode: "onBlur",
  });

  /**
   * The currency list is closed, but a row seeded outside the app could hold a code that is
   * not on it. Dropping that value into a Select with no matching item would render an empty
   * trigger and silently change the currency on the next save, so the existing code is added
   * to the list instead.
   */
  const currencyOptions = COURSE_CURRENCY_OPTIONS.some(
    (option) => option.value === settings?.currency,
  )
    ? COURSE_CURRENCY_OPTIONS
    : [
        ...COURSE_CURRENCY_OPTIONS,
        ...(settings?.currency
          ? [{ value: settings.currency, label: `${settings.currency} — in use` }]
          : []),
      ];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="bank_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bank name</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="Zenith Bank"
                    className="h-12 rounded-xl border-border bg-card"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="account_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Account name</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="Drizzypips Academy Ltd"
                    className="h-12 rounded-xl border-border bg-card"
                  />
                </FormControl>
                <FormDescription>
                  Students check this against what their bank shows.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="account_number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Account number</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="0123456789"
                    className="h-12 rounded-xl border-border bg-card font-mono"
                  />
                </FormControl>
                <FormDescription>
                  Not restricted to digits, so an IBAN or routing number fits. Check it
                  carefully — this is where money goes.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Currency this account accepts</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="h-12 rounded-xl border-border bg-card">
                      <SelectValue placeholder="Select a currency" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {currencyOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Shown beside the course price so a mismatch is visible before the student
                  reaches the bank.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="additional_details"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Additional details</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={3}
                  placeholder="Sort code, IBAN, SWIFT, branch — whatever this account needs."
                  className="rounded-xl border-border bg-card"
                />
              </FormControl>
              <FormDescription>Optional. Leave blank if there is nothing to add.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="payment_instructions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Payment instructions</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={5}
                  placeholder="Transfer the exact course fee, then upload your receipt on the next step."
                  className="rounded-xl border-border bg-card"
                />
              </FormControl>
              <FormDescription>
                Shown on the payment step, above the account details.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="review_window_hours"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Review window (hours)</FormLabel>
                <FormControl>
                  <Input
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    type="number"
                    min={REVIEW_WINDOW_HOURS_MIN}
                    max={REVIEW_WINDOW_HOURS_MAX}
                    step={1}
                    inputMode="numeric"
                    value={Number.isFinite(field.value) ? String(field.value) : ""}
                    onChange={(event) => field.onChange(event.target.valueAsNumber)}
                    className="h-12 rounded-xl border-border bg-card"
                  />
                </FormControl>
                <FormDescription>
                  Copy only — "we review within N hours". Nothing enforces it, and no
                  reminder is sent. Between {REVIEW_WINDOW_HOURS_MIN} and{" "}
                  {REVIEW_WINDOW_HOURS_MAX}.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="support_whatsapp_number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Support WhatsApp number</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    inputMode="tel"
                    autoComplete="off"
                    placeholder="+2349035853860"
                    className="h-12 rounded-xl border-border bg-card font-mono"
                  />
                </FormControl>
                <FormDescription>
                  Optional. Left blank, the site uses the number built into the code.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" className="btn-premium min-h-12" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Saving
            </>
          ) : (
            "Save payment details"
          )}
        </Button>
      </form>
    </Form>
  );
};

export default PaymentSettingsForm;
