import { AlertTriangle, BookOpen, MessageCircle, RefreshCw, SearchX } from "lucide-react";
import { useMemo, useState } from "react";

import CourseCard from "@/components/courses/CourseCard";
import CourseCardSkeleton from "@/components/courses/CourseCardSkeleton";
import CourseFilters from "@/components/courses/CourseFilters";
import PublicPageLayout from "@/components/Layout/PublicPageLayout";
import SectionHeading from "@/components/shared/SectionHeading";
import SectionShell from "@/components/shared/SectionShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCourses } from "@/hooks/useCourses";
import { areFiltersActive, DEFAULT_COURSE_FILTERS, filterCourses } from "@/lib/courses/filters";
import { mentorshipWhatsAppMessage } from "@/lib/constants/homepage";
import { openWhatsApp } from "@/lib/whatsapp";
import { CourseFilters as CourseFiltersState } from "@/types/course";

const GRID_ID = "course-catalogue-grid";
const SKELETON_COUNT = 6;

const gridClassName = "grid gap-6 sm:grid-cols-2 lg:grid-cols-3";

const Mentorship = () => {
  const { data, isPending, isError, refetch, isFetching } = useCourses();
  const [filters, setFilters] = useState<CourseFiltersState>(DEFAULT_COURSE_FILTERS);

  const courses = useMemo(() => data ?? [], [data]);
  const visibleCourses = useMemo(() => filterCourses(courses, filters), [courses, filters]);

  const hasActiveFilters = areFiltersActive(filters);
  const clearFilters = () => setFilters(DEFAULT_COURSE_FILTERS);

  const renderStatusMessage = () => {
    if (isPending) {
      return "Loading courses…";
    }

    if (isError) {
      return "Courses could not be loaded.";
    }

    if (courses.length === 0) {
      return "No courses are available yet.";
    }

    return `Showing ${visibleCourses.length} of ${courses.length} ${
      courses.length === 1 ? "course" : "courses"
    }.`;
  };

  const renderContent = () => {
    if (isPending) {
      return (
        <div className={gridClassName}>
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <CourseCardSkeleton key={index} />
          ))}
        </div>
      );
    }

    if (isError) {
      return (
        <Card className="rounded-3xl border-border bg-card shadow-premium">
          <CardContent className="flex flex-col items-center p-8 text-center sm:p-12">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-7 w-7" aria-hidden="true" />
            </div>
            <h3 className="mt-6 text-2xl font-bold text-foreground">We couldn&apos;t load the courses</h3>
            <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
              Something went wrong while reaching our course library. Please check your connection and
              try again.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
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
                type="button"
                variant="outline"
                onClick={() => openWhatsApp(mentorshipWhatsAppMessage)}
                className="min-h-11 rounded-xl border-primary text-primary hover:bg-primary hover:text-primary-foreground"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                Ask on WhatsApp
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (courses.length === 0) {
      return (
        <Card className="rounded-3xl border-border bg-card shadow-premium">
          <CardContent className="flex flex-col items-center p-8 text-center sm:p-12">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <BookOpen className="h-7 w-7" aria-hidden="true" />
            </div>
            <h3 className="mt-6 text-2xl font-bold text-foreground">No courses published yet</h3>
            <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
              New mentorship programs are on the way. Message us and we&apos;ll let you know as soon as
              enrollment opens.
            </p>
            <Button
              type="button"
              onClick={() => openWhatsApp(mentorshipWhatsAppMessage)}
              className="btn-premium mt-8 min-h-11"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Talk to a mentor
            </Button>
          </CardContent>
        </Card>
      );
    }

    if (visibleCourses.length === 0) {
      return (
        <Card className="rounded-3xl border-border bg-card shadow-premium">
          <CardContent className="flex flex-col items-center p-8 text-center sm:p-12">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <SearchX className="h-7 w-7" aria-hidden="true" />
            </div>
            <h3 className="mt-6 text-2xl font-bold text-foreground">No courses match your search</h3>
            <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
              Try a different keyword, or widen the price range to see the full catalogue again.
            </p>
            <Button type="button" onClick={clearFilters} className="btn-premium mt-8 min-h-11">
              Clear filters
            </Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className={gridClassName}>
        {visibleCourses.map((course) => (
          <CourseCard key={course.id} course={course} />
        ))}
      </div>
    );
  };

  return (
    <PublicPageLayout>
      <SectionShell className="bg-muted/30">
        <SectionHeading
          align="left"
          eyebrow="Mentorship"
          title="Find the course that fits where you are."
          description="Browse the published mentorship programs, filter by price, and reach out when you are ready to start."
          className="mx-0"
        />

        <CourseFilters filters={filters} onChange={setFilters} gridId={GRID_ID} />

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite" aria-atomic="true">
            {renderStatusMessage()}
          </p>

          {hasActiveFilters && !isPending && !isError ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-auto rounded-full px-3 py-1.5 text-sm text-primary hover:bg-primary/10 hover:text-primary"
            >
              Clear filters
            </Button>
          ) : null}
        </div>

        <div id={GRID_ID} className="mt-6">
          {renderContent()}
        </div>
      </SectionShell>
    </PublicPageLayout>
  );
};

export default Mentorship;
