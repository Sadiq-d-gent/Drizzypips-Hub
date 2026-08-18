import { AlertTriangle, ArrowLeft, RefreshCw, SearchX } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import CourseStateCard from "@/components/courses/CourseStateCard";
import EnrollmentDetailsForm from "@/components/enrollment/EnrollmentDetailsForm";
import EnrollmentPausedPanel from "@/components/enrollment/EnrollmentPausedPanel";
import EnrollmentStepper from "@/components/enrollment/EnrollmentStepper";
import EnrollmentSummaryCard from "@/components/enrollment/EnrollmentSummaryCard";
import PaymentInstructions from "@/components/enrollment/PaymentInstructions";
import ReceiptUploader from "@/components/enrollment/ReceiptUploader";
import PublicPageLayout from "@/components/Layout/PublicPageLayout";
import SectionShell from "@/components/shared/SectionShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCourse } from "@/hooks/useCourse";
import { useEnrollmentAvailability } from "@/hooks/useEnrollmentAvailability";
import { useEnrollmentSubmission } from "@/hooks/useEnrollmentSubmission";
import { usePaymentSettings } from "@/hooks/usePaymentSettings";
import { useReceiptUpload } from "@/hooks/useReceiptUpload";
import { DEFAULT_ENROLLMENT_PAUSED_MESSAGE } from "@/lib/constants/enrollment";
import {
  courseDetailPath,
  enrollmentConfirmationPath,
  MENTORSHIP_PATH,
} from "@/lib/courses/routes";
import { EnrollmentStep, isEnrollmentStep } from "@/lib/enrollment/steps";
import { isEnrollmentPausedFrom } from "@/services/enrollmentAvailability.service";
import { EnrollmentError } from "@/services/enrollment.service";
import { EnrollmentDetailsInput } from "@/lib/validation/enrollment.schema";

const STEP_PARAM = "step";
const DRAFT_STORAGE_PREFIX = "drizzypips:enrollment-draft:";

const EMPTY_DETAILS: EnrollmentDetailsInput = {
  studentName: "",
  studentEmail: "",
  studentPhone: "",
  studentNote: "",
};

/**
 * Reads the saved draft for a course.
 *
 * sessionStorage rather than localStorage: a half-finished enrollment holding a name,
 * email and phone number should not outlive the browser session, especially on a
 * shared or public device. Parse failures fall back to empty rather than throwing —
 * a corrupt draft must not be able to break the page.
 */
const readDraft = (slug: string): EnrollmentDetailsInput => {
  try {
    const raw = sessionStorage.getItem(`${DRAFT_STORAGE_PREFIX}${slug}`);

    if (!raw) {
      return EMPTY_DETAILS;
    }

    const parsed = JSON.parse(raw) as Partial<EnrollmentDetailsInput>;

    return {
      studentName: typeof parsed.studentName === "string" ? parsed.studentName : "",
      studentEmail: typeof parsed.studentEmail === "string" ? parsed.studentEmail : "",
      studentPhone: typeof parsed.studentPhone === "string" ? parsed.studentPhone : "",
      studentNote: typeof parsed.studentNote === "string" ? parsed.studentNote : "",
    };
  } catch {
    return EMPTY_DETAILS;
  }
};

/**
 * Three-step enrollment wizard: details → payment → receipt.
 *
 * The step lives in a query parameter so the browser's back button moves between steps
 * instead of leaving the flow, and so a reload keeps the student where they were. The
 * details themselves are held in sessionStorage against the course slug, which is what
 * makes that reload survivable.
 *
 * The course is re-read through the same published-only query the detail page uses, so
 * an unpublished slug cannot be reached by typing the URL. That is a UI guard only —
 * create_enrollment() enforces the same rule server-side.
 */
const CourseEnrollment = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: course, isPending, isError, refetch, isFetching } = useCourse(slug);
  const paymentSettings = usePaymentSettings();

  /**
   * Whether the site is accepting enrollments at all.
   *
   * A UI courtesy, not the enforcement: create_enrollment() raises PA001 regardless of what
   * this says, so a stale or failed answer here costs a refused submission rather than an
   * enrollment that should not exist. That is why it fails open — see
   * isEnrollmentPausedFrom().
   */
  const availability = useEnrollmentAvailability();

  /**
   * Identifies this attempt, and namespaces the receipt object key.
   *
   * Generated once per mount rather than derived from anything stable: it is only a
   * folder name, and a fresh one per attempt means an abandoned upload is never
   * confused with the next one.
   */
  const [draftId] = useState(() => crypto.randomUUID());
  const upload = useReceiptUpload(draftId);

  const [details, setDetails] = useState<EnrollmentDetailsInput>(EMPTY_DETAILS);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const stepParam = searchParams.get(STEP_PARAM);
  const currentStep: EnrollmentStep = isEnrollmentStep(stepParam) ? stepParam : "details";

  useEffect(() => {
    if (slug) {
      setDetails(readDraft(slug));
    }
  }, [slug]);

  const goToStep = useCallback(
    (step: EnrollmentStep) => {
      const next = new URLSearchParams(searchParams);
      next.set(STEP_PARAM, step);
      setSearchParams(next);
      // The step changes without a route change, so nothing moves the viewport by
      // default and the student would land mid-page on the new step.
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [searchParams, setSearchParams],
  );

  const handleDetailsSubmit = useCallback(
    (values: EnrollmentDetailsInput) => {
      setDetails(values);

      if (slug) {
        try {
          sessionStorage.setItem(`${DRAFT_STORAGE_PREFIX}${slug}`, JSON.stringify(values));
        } catch {
          // Storage can be full or disabled (private mode on some browsers). The draft
          // is a convenience, so failing to save it must not block the flow.
        }
      }

      goToStep("payment");
    },
    [goToStep, slug],
  );

  const submission = useEnrollmentSubmission((result) => {
    // The draft has served its purpose, and it holds PII — clear it as soon as the
    // enrollment is recorded rather than waiting for the session to end.
    if (slug) {
      try {
        sessionStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${slug}`);
      } catch {
        // Non-fatal, same reasoning as above.
      }
    }

    // `replace` so the browser's back button returns to the course rather than to a
    // wizard whose draft has just been cleared.
    navigate(enrollmentConfirmationPath(result.access_token), { replace: true });
  });

  const handleSubmit = useCallback(() => {
    if (!course || !upload.uploaded) {
      return;
    }

    setSubmitError(null);

    submission.mutate(
      {
        courseSlug: course.slug,
        studentName: details.studentName,
        studentEmail: details.studentEmail,
        studentPhone: details.studentPhone,
        studentNote: details.studentNote?.trim() ? details.studentNote.trim() : null,
        receipt: upload.uploaded,
      },
      {
        onError: (error) => {
          /**
           * Paused between page load and submit — the race the in-function guard exists for.
           *
           * The wording is the one already used for a course that became unavailable, because
           * the situation is the same and worse: this student has paid. It deliberately does
           * not repeat the administrator's "come back later" message, which is written for
           * someone who has not yet transferred anything.
           */
          if (error instanceof EnrollmentError && error.isEnrollmentPaused) {
            setSubmitError(
              "Enrollment closed while you were completing this form, so we could not record your submission. Please contact support before making any further payment — keep your receipt.",
            );
            // Brings the cache in line with reality for the rest of the session. The panel
            // does not take over the page while this error is on screen; see renderContent.
            void availability.refetch();
            return;
          }

          if (error instanceof EnrollmentError && error.isRateLimited) {
            setSubmitError(
              "We've received several enrollments from this email address recently. Please wait a little while before trying again.",
            );
            return;
          }

          if (error instanceof EnrollmentError && error.isCourseUnavailable) {
            setSubmitError(
              "This course is no longer available for enrollment. Please contact support before making any further payment.",
            );
            return;
          }

          setSubmitError(
            "Something went wrong while submitting your enrollment. Your payment has not been lost — please try again, or contact support with your receipt.",
          );
        },
      },
    );
  }, [course, details, submission, upload.uploaded, availability]);

  const stepHeading = useMemo(() => {
    switch (currentStep) {
      case "payment":
        return "Make your payment";
      case "receipt":
        return "Upload your receipt";
      default:
        return "Your details";
    }
  }, [currentStep]);

  const renderStep = () => {
    if (!course) {
      return null;
    }

    if (currentStep === "payment") {
      return (
        <PaymentInstructions
          settings={paymentSettings.data}
          isPending={paymentSettings.isPending}
          isError={paymentSettings.isError}
          priceAmount={course.price}
          priceCurrency={course.currency}
          onBack={() => goToStep("details")}
          onContinue={() => goToStep("receipt")}
        />
      );
    }

    if (currentStep === "receipt") {
      return (
        <ReceiptUploader
          upload={upload}
          isSubmitting={submission.isPending}
          submitError={submitError}
          onBack={() => goToStep("payment")}
          onSubmit={handleSubmit}
        />
      );
    }

    return <EnrollmentDetailsForm defaultValues={details} onSubmit={handleDetailsSubmit} />;
  };

  const renderContent = () => {
    // Waits on availability as well as the course, so a paused site never flashes the first
    // step of a form the student is not allowed to finish.
    if (isPending || availability.isPending) {
      return (
        <div aria-hidden="true" className="mx-auto max-w-5xl">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="mt-4 h-5 w-96 max-w-full" />
          <Skeleton className="mt-10 h-12 w-full rounded-2xl" />
          <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-6">
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
            <Skeleton className="h-64 w-full rounded-3xl" />
          </div>
        </div>
      );
    }

    if (isError) {
      return (
        <CourseStateCard
          icon={AlertTriangle}
          tone="destructive"
          title="We couldn't load this course"
          description="Something went wrong while reaching our course library. Please check your connection and try again."
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
          <Button
            asChild
            variant="outline"
            className="min-h-11 rounded-xl border-primary text-primary hover:bg-primary hover:text-primary-foreground"
          >
            <Link to={MENTORSHIP_PATH}>Back to mentorship</Link>
          </Button>
        </CourseStateCard>
      );
    }

    // fetchCourseBySlug filters on published = true, and RLS hides unpublished rows from
    // anonymous visitors, so a draft course is indistinguishable from a missing one here.
    if (!course) {
      return (
        <CourseStateCard
          icon={SearchX}
          title="We couldn't find that course"
          description="This course may have been renamed, unpublished, or the link may be incorrect. Browse the catalogue to find what you're looking for."
        >
          <Button asChild className="btn-premium min-h-11">
            <Link to={MENTORSHIP_PATH}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to mentorship
            </Link>
          </Button>
        </CourseStateCard>
      );
    }

    /**
     * Enrollments are closed. Checked after the course resolves so a paused site still says
     * "we couldn't find that course" for a slug that does not exist, rather than implying one
     * is there waiting to reopen.
     *
     * Skipped while a submission error is on screen: someone refused by PA001 after paying
     * needs the contact-support instruction they were just given, and replacing it with the
     * general "come back later" panel would throw away the only thing telling them what to do.
     */
    if (!submitError && isEnrollmentPausedFrom(availability.data)) {
      return (
        <EnrollmentPausedPanel
          courseTitle={course.title}
          courseSlug={course.slug}
          message={
            availability.data?.paused_message?.trim() || DEFAULT_ENROLLMENT_PAUSED_MESSAGE
          }
          supportNumber={paymentSettings.data?.support_whatsapp_number}
        />
      );
    }

    return (
      <div className="mx-auto max-w-5xl">
        <Button
          asChild
          variant="ghost"
          className="-ml-3 min-h-11 rounded-xl text-muted-foreground hover:text-foreground"
        >
          <Link to={courseDetailPath(course.slug)}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to course
          </Link>
        </Button>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Enroll in {course.title}
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
          Three steps: confirm your details, transfer the fee, then upload your receipt. We'll
          confirm your place once the payment is checked.
        </p>

        <div className="mt-10">
          <EnrollmentStepper currentStep={currentStep} />
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <h2 className="sr-only">{stepHeading}</h2>
            {renderStep()}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <EnrollmentSummaryCard course={course} />
          </aside>
        </div>
      </div>
    );
  };

  return (
    <PublicPageLayout>
      <SectionShell className="bg-muted/30">{renderContent()}</SectionShell>
    </PublicPageLayout>
  );
};

export default CourseEnrollment;
