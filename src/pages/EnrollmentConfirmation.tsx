import { format } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  LucideIcon,
  MessageCircle,
  RefreshCw,
  SearchX,
  XCircle,
} from "lucide-react";
import { ReactNode, useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";

import CourseStateCard from "@/components/courses/CourseStateCard";
import PublicPageLayout from "@/components/Layout/PublicPageLayout";
import SectionShell from "@/components/shared/SectionShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEnrollment } from "@/hooks/useEnrollment";
import { usePaymentSettings } from "@/hooks/usePaymentSettings";
import {
  ACCESS_TOKEN_LENGTH,
  DEFAULT_REVIEW_WINDOW_HOURS,
  ENROLLMENT_STATUS_LABELS,
} from "@/lib/constants/enrollment";
import { formatCoursePrice } from "@/lib/courses/price";
import { courseDetailPath, MENTORSHIP_PATH } from "@/lib/courses/routes";
import { describeFileType, formatFileSize } from "@/lib/enrollment/files";
import { downloadEnrollmentCard } from "@/lib/enrollment/receiptCard";
import { buildEnrollmentWhatsAppMessage } from "@/lib/enrollment/whatsappMessage";
import { cn } from "@/lib/utils";
import { createWhatsAppUrl } from "@/lib/whatsapp";
import { EnrollmentStatus, EnrollmentSummary } from "@/types/enrollment";

type StatusPresentation = {
  icon: LucideIcon;
  pill: string;
  heading: string;
  description: string;
};

/**
 * Copy and tone for each status.
 *
 * Written from the student's point of view rather than the admin's: the status column is
 * a review outcome, but what the student needs to know is whether they have to do
 * anything next. Rejected and cancelled therefore both end in "message us with your
 * order ID" — the order ID is the reference a human can look up, which is exactly what
 * it is for.
 */
const describeStatus = (
  status: EnrollmentStatus,
  reviewWindowHours: number,
): StatusPresentation => {
  switch (status) {
    case "approved":
      return {
        icon: CheckCircle2,
        pill: "border-success/30 bg-success/10 text-success",
        heading: "Your enrollment is confirmed",
        description:
          "We've checked your payment and your place is confirmed. Keep this page for your records.",
      };
    case "rejected":
      return {
        icon: XCircle,
        pill: "border-destructive/30 bg-destructive/10 text-destructive",
        heading: "This enrollment wasn't approved",
        description:
          "We couldn't match your receipt to a payment we received. Message us with your order ID and we'll look into it with you.",
      };
    case "cancelled":
      return {
        icon: XCircle,
        pill: "border-border bg-muted text-muted-foreground",
        heading: "This enrollment was cancelled",
        description:
          "This enrollment is no longer active. If that's unexpected, message us with your order ID.",
      };
    default:
      return {
        icon: Clock,
        pill: "border-warning/30 bg-warning/10 text-warning",
        heading: "We've received your enrollment",
        description: `Your receipt is with us. We usually review payments within ${reviewWindowHours} hours, and this page always shows the current status.`,
      };
  }
};

type DetailRowProps = {
  label: string;
  children: ReactNode;
};

const DetailRow = ({ label, children }: DetailRowProps) => (
  <div className="flex flex-col gap-1 border-b border-border py-4 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
    <dt className="text-sm text-muted-foreground">{label}</dt>
    <dd className="break-words font-medium text-foreground sm:text-right">{children}</dd>
  </div>
);

type ReceiptMetadataProps = {
  enrollment: EnrollmentSummary;
};

/**
 * Receipt metadata only — filename, type, size and upload time.
 *
 * The uploaded image itself is not shown. The bucket is private and anon has no read
 * grant on it, so displaying the file would need a signed URL minted by a trusted
 * server, which this phase does not have. Metadata is enough for the student to confirm
 * the right file arrived, and it comes from the same RPC as the rest of this page.
 */
const ReceiptMetadata = ({ enrollment }: ReceiptMetadataProps) => {
  if (!enrollment.receipt_filename) {
    return null;
  }

  return (
    <Card className="rounded-3xl border-border bg-card shadow-premium">
      <CardContent className="p-6 sm:p-8">
        <h2 className="text-lg font-bold tracking-tight text-foreground">Your receipt</h2>

        <div className="mt-5 flex items-start gap-4 rounded-2xl border border-border bg-muted/20 p-5">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground"
            aria-hidden="true"
          >
            <FileText className="h-5 w-5" />
          </span>

          <div className="min-w-0">
            <p className="break-words font-medium text-foreground">
              {enrollment.receipt_filename}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {describeFileType(enrollment.receipt_mime_type)}
              {typeof enrollment.receipt_size_bytes === "number"
                ? ` · ${formatFileSize(enrollment.receipt_size_bytes)}`
                : ""}
            </p>
            {enrollment.receipt_uploaded_at ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Uploaded {format(new Date(enrollment.receipt_uploaded_at), "d MMM yyyy, HH:mm")}
              </p>
            ) : null}
          </div>
        </div>

        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Your receipt is stored privately and is only visible to our team while we review your
          payment.
        </p>
      </CardContent>
    </Card>
  );
};

/**
 * Confirmation page for one submitted enrollment.
 *
 * Reached at /enrollment/:accessToken. The token in the URL is the authorization: it is
 * a 256-bit secret, the database stores only its SHA-256 digest, and
 * get_enrollment_by_token() is the only way to read the record. The order ID shown on
 * this page authorizes nothing — it is a reference for talking to a human.
 *
 * There is no student login, so this URL is the student's only route back here. That is
 * called out on the page rather than assumed.
 */
const EnrollmentConfirmation = () => {
  const { accessToken } = useParams<{ accessToken: string }>();

  const isTokenWellFormed = accessToken?.length === ACCESS_TOKEN_LENGTH;

  const { data: enrollment, isPending, isError, refetch, isFetching } = useEnrollment(accessToken);
  const paymentSettings = usePaymentSettings();

  const [cardError, setCardError] = useState<string | null>(null);
  const [isBuildingCard, setIsBuildingCard] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!enrollment) {
      return;
    }

    setCardError(null);
    setIsBuildingCard(true);

    try {
      await downloadEnrollmentCard(enrollment);
    } catch {
      // Canvas or toBlob can fail on a locked-down browser. The record itself is safe,
      // so this degrades to "you can still screenshot this page".
      setCardError(
        "We couldn't generate the receipt image in this browser. Your enrollment is still recorded — you can save this page instead.",
      );
    } finally {
      setIsBuildingCard(false);
    }
  }, [enrollment]);

  const notFoundCard = (
    <CourseStateCard
      icon={SearchX}
      title="We couldn't find that enrollment"
      description="This link may be incomplete, or it may have been mistyped. Please open the exact link from your browser history, or message us with your order ID and we'll help."
    >
      <Button asChild className="btn-premium min-h-11">
        <Link to={MENTORSHIP_PATH}>Back to mentorship</Link>
      </Button>
    </CourseStateCard>
  );

  const renderContent = () => {
    // Checked before the loading branch: useEnrollment stays disabled for a malformed
    // token, so it would otherwise sit in `isPending` forever and render a skeleton that
    // never resolves.
    if (!isTokenWellFormed) {
      return notFoundCard;
    }

    if (isPending) {
      return (
        <div aria-hidden="true" className="mx-auto max-w-3xl">
          <Skeleton className="h-32 w-full rounded-3xl" />
          <Skeleton className="mt-6 h-72 w-full rounded-3xl" />
          <Skeleton className="mt-6 h-40 w-full rounded-3xl" />
        </div>
      );
    }

    if (isError) {
      return (
        <CourseStateCard
          icon={AlertTriangle}
          tone="destructive"
          title="We couldn't load your enrollment"
          description="Something went wrong while reaching our records. Your enrollment is not affected — please check your connection and try again."
        >
          <Button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-premium min-h-11"
          >
            <RefreshCw
              className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"}
              aria-hidden="true"
            />
            {isFetching ? "Retrying…" : "Try again"}
          </Button>
        </CourseStateCard>
      );
    }

    // A well-formed token that matches nothing and a token that has been altered are
    // indistinguishable here: the RPC returns zero rows for both, and revealing which
    // would let someone probe for valid tokens.
    if (!enrollment) {
      return notFoundCard;
    }

    return renderEnrollment(enrollment);
  };

  function renderEnrollment(record: EnrollmentSummary) {
    const reviewWindow =
      paymentSettings.data?.review_window_hours ?? DEFAULT_REVIEW_WINDOW_HOURS;
    const presentation = describeStatus(record.status, reviewWindow);
    const StatusIcon = presentation.icon;

    const whatsappUrl = createWhatsAppUrl(
      buildEnrollmentWhatsAppMessage(record),
      paymentSettings.data?.support_whatsapp_number ?? undefined,
    );

    return (
      <div className="mx-auto max-w-3xl">
        <Card className="rounded-3xl border-border bg-card shadow-premium">
          <CardContent className="p-6 sm:p-8">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <StatusIcon className="h-7 w-7" aria-hidden="true" />
            </span>

            <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {presentation.heading}
            </h1>
            <p className="mt-3 leading-7 text-muted-foreground">{presentation.description}</p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <span className="rounded-xl border border-border bg-muted/40 px-4 py-2 font-mono text-sm font-medium text-foreground">
                {record.order_id}
              </span>
              <span
                className={cn(
                  "rounded-xl border px-4 py-2 text-sm font-medium",
                  presentation.pill,
                )}
              >
                {ENROLLMENT_STATUS_LABELS[record.status] ?? record.status}
              </span>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">
              Quote this order ID in any message about your enrollment.
            </p>
          </CardContent>
        </Card>

        <Card className="mt-6 rounded-3xl border-border bg-card shadow-premium">
          <CardContent className="p-6 sm:p-8">
            <h2 className="text-lg font-bold tracking-tight text-foreground">Enrollment details</h2>

            <dl className="mt-4">
              <DetailRow label="Course">
                <Link
                  to={courseDetailPath(record.course_slug)}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {record.course_title}
                </Link>
              </DetailRow>
              <DetailRow label="Amount">
                {formatCoursePrice(record.price_amount, record.price_currency)}
              </DetailRow>
              <DetailRow label="Submitted">
                {format(new Date(record.created_at), "d MMM yyyy, HH:mm")}
              </DetailRow>
              <DetailRow label="Name">{record.student_name}</DetailRow>
              <DetailRow label="Email">{record.student_email}</DetailRow>
              <DetailRow label="WhatsApp">{record.student_phone}</DetailRow>
              {record.student_note ? (
                <DetailRow label="Your note">
                  <span className="whitespace-pre-line">{record.student_note}</span>
                </DetailRow>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <div className="mt-6">
          <ReceiptMetadata enrollment={record} />
        </div>

        {cardError ? (
          <div
            role="alert"
            className="mt-6 flex gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
            <p className="text-sm leading-6 text-foreground">{cardError}</p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            onClick={handleDownload}
            disabled={isBuildingCard}
            className="btn-premium min-h-12 sm:w-auto"
          >
            {isBuildingCard ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            {isBuildingCard ? "Preparing…" : "Download receipt"}
          </Button>

          {/* Optional: the enrollment is already recorded and under review, so this is a
              way to follow up, never a step that has to be completed. */}
          <Button
            asChild
            variant="outline"
            className="min-h-12 rounded-xl border-primary text-primary hover:bg-primary hover:text-primary-foreground sm:w-auto"
          >
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Message us on WhatsApp
            </a>
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={() => refetch()}
            disabled={isFetching}
            className="min-h-12 rounded-xl text-muted-foreground hover:text-foreground sm:w-auto"
          >
            <RefreshCw
              className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"}
              aria-hidden="true"
            />
            {isFetching ? "Checking…" : "Refresh status"}
          </Button>
        </div>

        <div className="mt-6 flex gap-3 rounded-2xl border border-warning/30 bg-warning/5 p-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
          <div>
            <p className="font-medium text-foreground">Save this page</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              This link is the only way back to your enrollment status, so bookmark it or keep the
              email you used. Treat it like a receipt and don't share it publicly.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PublicPageLayout>
      <SectionShell className="bg-muted/30">{renderContent()}</SectionShell>
    </PublicPageLayout>
  );
};

export default EnrollmentConfirmation;
