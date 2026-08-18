import { Card, CardContent } from "@/components/ui/card";
import { formatCoursePrice, isFreeCourse } from "@/lib/courses/price";
import { Course } from "@/types/course";

type EnrollmentSummaryCardProps = {
  course: Course;
};

/**
 * Order summary shown alongside the wizard.
 *
 * Displays the price straight from the course record. The value here is presentational
 * only — public.create_enrollment() re-reads the course and snapshots its own price, so
 * what is stored never depends on what this component rendered.
 */
const EnrollmentSummaryCard = ({ course }: EnrollmentSummaryCardProps) => {
  const isFree = isFreeCourse(course.price);

  return (
    <Card className="rounded-3xl border-border bg-card shadow-premium">
      <CardContent className="p-6 sm:p-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Order summary
        </h2>

        <p className="mt-4 text-lg font-bold leading-7 text-foreground">{course.title}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{course.short_description}</p>

        <dl className="mt-6 space-y-3 border-t border-border pt-6">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-sm text-muted-foreground">Duration</dt>
            <dd className="text-sm font-medium text-foreground">{course.duration}</dd>
          </div>

          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-sm text-muted-foreground">Total</dt>
            <dd className="text-2xl font-bold text-foreground">
              {isFree ? "Free" : formatCoursePrice(course.price, course.currency)}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
};

export default EnrollmentSummaryCard;
