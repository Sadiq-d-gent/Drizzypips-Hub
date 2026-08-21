import { AlertTriangle, ArrowRight, BookOpen, MessageCircle, RefreshCw } from "lucide-react";

import CourseCard from "@/components/courses/CourseCard";
import CourseCardSkeleton from "@/components/courses/CourseCardSkeleton";
import SectionHeading from "@/components/shared/SectionHeading";
import SectionShell from "@/components/shared/SectionShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCourses } from "@/hooks/useCourses";
import { consultationWhatsAppMessage } from "@/lib/constants/homepage";
import { MENTORSHIP_PATH } from "@/lib/courses/routes";
import { openWhatsApp } from "@/lib/whatsapp";
import { Link } from "react-router-dom";

/**
 * The first three published courses, on the homepage.
 *
 * Previously three hardcoded programs whose only action was a WhatsApp message — a visitor who
 * clicked one landed in a chat instead of at the thing they had just read about. These are the
 * real rows from `public.courses`, rendered with the same CourseCard the catalogue uses, so a
 * price change reaches the homepage the moment it is saved and every card leads to a course
 * that can actually be enrolled in.
 *
 * Three, and only the published ones, because `useCourses` resolves through the public policy
 * and this is a preview — the catalogue behind "View all courses" is the full list with filters.
 *
 * Unlike the copy on this page, this section does have real loading and error branches: it is
 * reading rows that may not exist, not falling back to a compiled-in string.
 */
const PREVIEW_COUNT = 3;

const gridClassName = "grid gap-6 sm:grid-cols-2 lg:grid-cols-3";

const MentorshipPreviewSection = () => {
  const { data, isPending, isError, refetch, isFetching } = useCourses();

  const courses = data ?? [];
  const previewCourses = courses.slice(0, PREVIEW_COUNT);

  const renderContent = () => {
    if (isPending) {
      return (
        <div className={gridClassName}>
          {Array.from({ length: PREVIEW_COUNT }, (_, index) => (
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
            <h3 className="mt-6 text-2xl font-bold text-foreground">
              We couldn&apos;t load the programs
            </h3>
            <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
              The rest of this page is fine — only the course list failed to load. Try again, or
              open the full catalogue.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
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
                <Link to={MENTORSHIP_PATH}>
                  View all courses
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (previewCourses.length === 0) {
      return (
        <Card className="rounded-3xl border-border bg-card shadow-premium">
          <CardContent className="flex flex-col items-center p-8 text-center sm:p-12">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <BookOpen className="h-7 w-7" aria-hidden="true" />
            </div>
            <h3 className="mt-6 text-2xl font-bold text-foreground">No programs published yet</h3>
            <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
              Enrollment opens as soon as the first program goes live. Message us and we&apos;ll
              tell you when it does.
            </p>
            <Button
              type="button"
              onClick={() => openWhatsApp(consultationWhatsAppMessage)}
              className="btn-premium mt-8 min-h-11"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Talk to a mentor
            </Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <>
        <div className={gridClassName}>
          {previewCourses.map((course, index) => (
            /*
              The AOS attributes live on a wrapper rather than on CourseCard, so the catalogue
              and the homepage keep sharing one card component — the animation is a property of
              this section, not of the card.
            */
            <div key={course.id} data-aos="fade-up" data-aos-delay={index * 100} className="h-full">
              <CourseCard course={course} />
            </div>
          ))}
        </div>

        {courses.length > previewCourses.length ? (
          <div className="mt-10 text-center">
            <Button
              asChild
              variant="outline"
              className="min-h-11 rounded-xl border-primary text-primary hover:bg-primary hover:text-primary-foreground"
            >
              <Link to={MENTORSHIP_PATH}>
                View all {courses.length} courses
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        ) : null}
      </>
    );
  };

  return (
    <SectionShell
      id="mentorship"
      className="overflow-hidden bg-muted/30"
      containerClassName="relative"
    >
      <div className="absolute -right-20 top-10 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <SectionHeading
        eyebrow="Mentorship"
        title="Choose a practical learning path."
        description="Each program lists what it covers, how long it runs, and what it costs. Enroll online and pay by bank transfer."
      />

      <div className="relative mt-14">{renderContent()}</div>

      <div
        data-aos="fade-up"
        className="relative mt-10 rounded-3xl border border-border bg-card/80 p-6 text-center shadow-premium sm:p-8"
      >
        <h3 className="text-2xl font-bold text-foreground">Not sure where to begin?</h3>
        <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
          Book a quick consultation and get pointed toward the right mentorship option for your
          current skill level.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-6 min-h-11 rounded-xl border-primary text-primary hover:bg-primary hover:text-primary-foreground"
          onClick={() => openWhatsApp(consultationWhatsAppMessage)}
        >
          <MessageCircle className="h-4 w-4" />
          Book Free Consultation
        </Button>
      </div>
    </SectionShell>
  );
};

export default MentorshipPreviewSection;
