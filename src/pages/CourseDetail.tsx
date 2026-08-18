import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Clock,
  CircleCheck,
  ImageOff,
  ListChecks,
  RefreshCw,
  SearchX,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import CourseDetailList from "@/components/courses/CourseDetailList";
import CourseDetailSkeleton from "@/components/courses/CourseDetailSkeleton";
import CourseStateCard from "@/components/courses/CourseStateCard";
import PublicPageLayout from "@/components/Layout/PublicPageLayout";
import SectionShell from "@/components/shared/SectionShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCourse } from "@/hooks/useCourse";
import { courseEnrollmentPath, MENTORSHIP_PATH } from "@/lib/courses/routes";
import { formatCoursePrice, isFreeCourse } from "@/lib/courses/price";
import { Course } from "@/types/course";

const BackToCatalogueLink = () => (
  <Link
    to={MENTORSHIP_PATH}
    className="inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
  >
    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
    Back to mentorship
  </Link>
);

type CourseDetailContentProps = {
  course: Course;
};

const CourseDetailContent = ({ course }: CourseDetailContentProps) => {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  const isFree = isFreeCourse(course.price);
  const formattedPrice = isFree ? "Free" : formatCoursePrice(course.price, course.currency);
  const showThumbnail = Boolean(course.thumbnail_url) && !thumbnailFailed;

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div>
          <div className="relative aspect-[16/9] overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/15 to-success/15 shadow-premium">
            {showThumbnail ? (
              <img
                src={course.thumbnail_url ?? undefined}
                alt=""
                onError={() => setThumbnailFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <ImageOff className="h-8 w-8 text-primary/70" aria-hidden="true" />
                <span className="text-lg font-semibold text-primary">{course.title}</span>
              </div>
            )}

            {isFree ? (
              <Badge className="absolute left-5 top-5 rounded-full bg-success px-3 py-1 text-success-foreground shadow-success hover:bg-success">
                Free
              </Badge>
            ) : null}
          </div>

          <h1 className="mt-8 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {course.title}
          </h1>

          <p className="mt-4 text-base leading-8 text-muted-foreground sm:text-lg">
            {course.short_description}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <span>{course.duration}</span>
            </span>

            {course.learnings.length > 0 ? (
              <span className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                <span>
                  {course.learnings.length} {course.learnings.length === 1 ? "topic" : "topics"}
                </span>
              </span>
            ) : null}
          </div>

          <Card className="mt-10 rounded-3xl border-border bg-card shadow-premium">
            <CardContent className="p-6 sm:p-8">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">About this course</h2>
              <div className="mt-6 space-y-4 text-base leading-8 text-muted-foreground">
                {course.description
                  .split(/\n{2,}/)
                  .map((paragraph) => paragraph.trim())
                  .filter(Boolean)
                  .map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
              </div>
            </CardContent>
          </Card>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <CourseDetailList
              title="What you'll learn"
              headingId="course-learnings"
              items={course.learnings}
              icon={CircleCheck}
              emptyMessage="The topic breakdown for this course is being finalised."
            />

            <CourseDetailList
              title="Requirements"
              headingId="course-requirements"
              items={course.requirements}
              icon={BadgeCheck}
              emptyMessage="No prior requirements — this course starts from the beginning."
            />
          </div>
        </div>

        <Card className="rounded-3xl border-border bg-card shadow-premium lg:sticky lg:top-24">
          <CardContent className="p-6 sm:p-8">
            <h2 className="sr-only">Enrollment</h2>

            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Price</p>
            <p className="mt-1 text-4xl font-bold text-primary">{formattedPrice}</p>

            <dl className="mt-6 space-y-3 border-t border-border pt-6 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Duration</dt>
                <dd className="font-medium text-foreground">{course.duration}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Topics covered</dt>
                <dd className="font-medium text-foreground">{course.learnings.length}</dd>
              </div>
            </dl>

            <Button asChild className="btn-premium mt-8 min-h-12 w-full">
              <Link to={courseEnrollmentPath(course.slug)}>Enroll Now</Link>
            </Button>

            <p className="mt-4 text-center text-sm leading-6 text-muted-foreground">
              Payment is not available yet. You&apos;ll be taken to the enrollment step.
            </p>
          </CardContent>
        </Card>
    </div>
  );
};

const CourseDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const { data: course, isPending, isError, refetch, isFetching } = useCourse(slug);

  const renderStatusMessage = () => {
    if (isPending) {
      return "Loading course…";
    }

    if (isError) {
      return "This course could not be loaded.";
    }

    if (!course) {
      return "Course not found.";
    }

    return `${course.title} loaded.`;
  };

  const renderContent = () => {
    if (isPending) {
      return <CourseDetailSkeleton />;
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
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
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

    return <CourseDetailContent course={course} />;
  };

  return (
    <PublicPageLayout>
      <SectionShell className="bg-muted/30">
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {renderStatusMessage()}
        </p>

        <BackToCatalogueLink />

        {renderContent()}
      </SectionShell>
    </PublicPageLayout>
  );
};

export default CourseDetail;
