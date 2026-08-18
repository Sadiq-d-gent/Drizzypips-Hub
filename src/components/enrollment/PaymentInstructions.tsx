import { AlertTriangle, ArrowLeft, ArrowRight, Check, Copy, Landmark } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFAULT_REVIEW_WINDOW_HOURS } from "@/lib/constants/enrollment";
import { formatCoursePrice } from "@/lib/courses/price";
import { PaymentSettings } from "@/types/enrollment";

type PaymentInstructionsProps = {
  settings: PaymentSettings | null | undefined;
  isPending: boolean;
  isError: boolean;
  priceAmount: number;
  priceCurrency: string;
  onBack: () => void;
  onContinue: () => void;
};

type CopyableRowProps = {
  label: string;
  value: string;
  copyable?: boolean;
};

/**
 * One bank detail, with a copy button where the value is something the student has to
 * retype into a banking app. Copying is a convenience only — the value stays visible
 * and selectable, so a browser that blocks the clipboard API costs nothing.
 */
const DetailRow = ({ label, value, copyable = true }: CopyableRowProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied or unavailable (older browsers, insecure origin).
      // The value is on screen either way, so this needs no error surface.
    }
  };

  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-4 last:border-b-0">
      <div className="min-w-0">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="mt-1 break-words font-medium text-foreground">{value}</dd>
      </div>

      {copyable ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="min-h-11 shrink-0 rounded-xl px-3 text-muted-foreground hover:text-foreground"
        >
          {copied ? (
            <Check className="h-4 w-4 text-success" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
          <span className="sr-only">
            {copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
          </span>
          <span aria-hidden="true" className="ml-1 hidden text-xs sm:inline">
            {copied ? "Copied" : "Copy"}
          </span>
        </Button>
      ) : null}
    </div>
  );
};

/**
 * Step 2: how to pay.
 *
 * Read-only. Nothing here is submitted — the student leaves for their banking app and
 * comes back to upload the receipt, which is why the continue button is always enabled
 * rather than gated on a "I have paid" checkbox that could not be verified anyway.
 */
const PaymentInstructions = ({
  settings,
  isPending,
  isError,
  priceAmount,
  priceCurrency,
  onBack,
  onContinue,
}: PaymentInstructionsProps) => {
  const amountToPay = formatCoursePrice(priceAmount, priceCurrency);

  const renderDetails = () => {
    if (isPending) {
      return (
        <div aria-hidden="true" className="space-y-4">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-5 w-3/5" />
        </div>
      );
    }

    // A missing configuration and a failed read are shown the same way: in both cases
    // the student cannot pay, and the actionable advice is identical.
    if (isError || !settings) {
      return (
        <div className="flex gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-medium text-foreground">Payment details are unavailable</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              We couldn't load the bank transfer details. Please refresh the page, or contact
              support before making a payment.
            </p>
          </div>
        </div>
      );
    }

    return (
      <>
        <dl>
          <DetailRow label="Bank name" value={settings.bank_name} />
          <DetailRow label="Account name" value={settings.account_name} />
          <DetailRow label="Account number" value={settings.account_number} />
          <DetailRow label="Amount to pay" value={amountToPay} />
          {settings.additional_details ? (
            <DetailRow label="Additional details" value={settings.additional_details} copyable={false} />
          ) : null}
        </dl>

        {settings.currency.trim().toUpperCase() !== priceCurrency.trim().toUpperCase() ? (
          // Surfaced rather than silently reconciled: the course is priced in one
          // currency and the account accepts another, and only a human can decide what
          // the student should actually transfer.
          <div className="mt-5 flex gap-3 rounded-2xl border border-warning/30 bg-warning/5 p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-sm leading-6 text-muted-foreground">
              This course is priced in {priceCurrency.toUpperCase()} but the account above accepts{" "}
              {settings.currency.toUpperCase()}. Please confirm the exact amount with support
              before transferring.
            </p>
          </div>
        ) : null}
      </>
    );
  };

  const reviewWindow = settings?.review_window_hours ?? DEFAULT_REVIEW_WINDOW_HOURS;

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-border bg-card shadow-premium">
        <CardContent className="p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Landmark className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Transfer {amountToPay}
            </h2>
          </div>

          <div className="mt-6">{renderDetails()}</div>
        </CardContent>
      </Card>

      {settings?.payment_instructions ? (
        <Card className="rounded-3xl border-border bg-muted/30">
          <CardContent className="p-6 sm:p-8">
            <h3 className="font-semibold text-foreground">Before you continue</h3>
            <p className="mt-3 whitespace-pre-line text-sm leading-7 text-muted-foreground">
              {settings.payment_instructions}
            </p>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              We usually review payments within {reviewWindow} hours.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="min-h-12 rounded-xl border-border sm:w-auto"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Button>
        <Button type="button" onClick={onContinue} className="btn-premium min-h-12 sm:w-auto">
          I've made the payment
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
};

export default PaymentInstructions;
