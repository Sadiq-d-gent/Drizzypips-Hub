import { ArrowLeft, MessageCircle, PauseCircle } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { courseDetailPath } from "@/lib/courses/routes";
import { createWhatsAppUrl } from "@/lib/whatsapp";

type EnrollmentPausedPanelProps = {
  courseTitle: string;
  courseSlug: string;
  /** The administrator's own wording, already defaulted by the caller. */
  message: string;
  /** From payment_settings; null falls back to the number compiled into the site. */
  supportNumber?: string | null;
};

/**
 * Shown instead of the wizard while enrollments are paused.
 *
 * Deliberately not a use of CourseStateCard, whose `description` is a plain string: this
 * message is written by an administrator in a textarea and can carry line breaks, which need
 * `whitespace-pre-line` to survive. Everything else matches that card, so the two read as the
 * same component.
 *
 * The course is still listed and still browsable — only enrolment is closed — so the primary
 * action goes back to the course rather than away from it.
 */
const EnrollmentPausedPanel = ({
  courseTitle,
  courseSlug,
  message,
  supportNumber,
}: EnrollmentPausedPanelProps) => {
  const whatsappUrl = createWhatsAppUrl(
    `Hi Drizzypips, I'd like to enroll in "${courseTitle}" but enrollment is currently paused. Please let me know when it reopens.`,
    supportNumber ?? undefined,
  );

  return (
    <Card className="mx-auto max-w-2xl rounded-3xl border-border bg-card shadow-premium">
      <CardContent className="flex flex-col items-center p-8 text-center sm:p-12">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/10 text-warning">
          <PauseCircle className="h-7 w-7" aria-hidden="true" />
        </div>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground">
          Enrollment is paused
        </h1>

        <p className="mt-3 max-w-xl whitespace-pre-line leading-7 text-muted-foreground">
          {message}
        </p>

        <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
          Nothing has been charged, and if you have already enrolled your place is unaffected.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild className="btn-premium min-h-11">
            <Link to={courseDetailPath(courseSlug)}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to {courseTitle}
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            className="min-h-11 rounded-xl border-primary text-primary hover:bg-primary hover:text-primary-foreground"
          >
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Ask us when it reopens
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default EnrollmentPausedPanel;
