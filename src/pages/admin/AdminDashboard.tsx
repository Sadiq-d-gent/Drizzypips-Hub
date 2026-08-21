import { AlertTriangle, ArrowRight, BookOpen, Inbox } from "lucide-react";
import { Link } from "react-router-dom";

import AdminStateCard from "@/components/admin/AdminStateCard";
import EnrollmentStatsCards from "@/components/admin/EnrollmentStatsCards";
import EnrollmentTable from "@/components/admin/EnrollmentTable";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminSession } from "@/hooks/useAdminSession";
import { useRecentEnrollments } from "@/hooks/useAdminEnrollments";
import { useAllCourses } from "@/hooks/useCourses";
import { useEnrollmentStats } from "@/hooks/useEnrollmentStats";
import {
  ADMIN_COURSES_PATH,
  ADMIN_ENROLLMENTS_PATH,
  adminEnrollmentsByStatusPath,
} from "@/lib/admin/routes";

/**
 * Admin dashboard.
 *
 * Answers one question on arrival: is there anything waiting? The pending count is the
 * dominant tile and there is a direct call to action to the filtered queue, so the work
 * queue is never more than one click away.
 */
const AdminDashboard = () => {
  const { admin } = useAdminSession();
  const statsQuery = useEnrollmentStats();
  const recentQuery = useRecentEnrollments();

  /**
   * The catalogue is now what the homepage and the mentorship page render, so "nothing is
   * published" is the one condition that makes the public site look broken while every
   * enrollment number on this page still reads zero for a perfectly good reason. Worth a line
   * here rather than only on the courses page an admin has no reason to open.
   *
   * `useAllCourses` rather than `useCourses`: an unpublished course is exactly what this row
   * needs to be able to count.
   */
  const coursesQuery = useAllCourses();

  const pendingCount = statsQuery.data?.pendingReview ?? 0;

  const renderCourseSummary = () => {
    if (coursesQuery.isLoading) {
      return "Checking the catalogue…";
    }

    if (coursesQuery.isError) {
      return "Course counts didn't load.";
    }

    const courses = coursesQuery.data ?? [];
    const publishedCount = courses.filter((course) => course.published).length;

    if (courses.length === 0) {
      return "No courses yet — students have nothing to enroll in until one is published.";
    }

    if (publishedCount === 0) {
      return `${courses.length} ${courses.length === 1 ? "course" : "courses"} · none published, so none are visible to students`;
    }

    return `${courses.length} ${courses.length === 1 ? "course" : "courses"} · ${publishedCount} published`;
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {admin ? `Signed in as ${admin.name}.` : "Enrollment review overview."}
          </p>
        </div>

        {pendingCount > 0 ? (
          <Button asChild className="btn-premium min-h-11">
            <Link to={adminEnrollmentsByStatusPath("pending_review")}>
              Review {pendingCount} pending
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="mt-6">
        {statsQuery.isError ? (
          <AdminStateCard
            icon={AlertTriangle}
            title="Couldn't load the counts"
            description="The enrollment totals didn't load. Everything else on this page still works."
            tone="destructive"
          >
            <Button
              variant="outline"
              className="min-h-11 rounded-xl"
              onClick={() => {
                void statsQuery.refetch();
              }}
            >
              Try again
            </Button>
          </AdminStateCard>
        ) : (
          <EnrollmentStatsCards stats={statsQuery.data} isLoading={statsQuery.isLoading} />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <BookOpen className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {renderCourseSummary()}
          </p>
        </div>
        <Link
          to={ADMIN_COURSES_PATH}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Manage courses
        </Link>
      </div>

      <section className="mt-10" aria-labelledby="recent-submissions-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="recent-submissions-heading"
            className="text-xl font-semibold tracking-tight text-foreground"
          >
            Recent submissions
          </h2>
          <Link
            to={ADMIN_ENROLLMENTS_PATH}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            View all enrollments
          </Link>
        </div>

        <div className="mt-4">
          {recentQuery.isLoading ? (
            <div className="flex flex-col gap-3" aria-hidden="true">
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-16 rounded-2xl" />
            </div>
          ) : recentQuery.isError ? (
            <AdminStateCard
              icon={AlertTriangle}
              title="Couldn't load recent submissions"
              description="Something went wrong reading the enrollment list. Please try again."
              tone="destructive"
            >
              <Button
                variant="outline"
                className="min-h-11 rounded-xl"
                onClick={() => {
                  void recentQuery.refetch();
                }}
              >
                Try again
              </Button>
            </AdminStateCard>
          ) : (recentQuery.data?.length ?? 0) === 0 ? (
            <AdminStateCard
              icon={Inbox}
              title="No enrollments yet"
              description="When a student submits an enrollment and uploads their payment receipt, it will appear here for review."
            />
          ) : (
            <EnrollmentTable rows={recentQuery.data ?? []} />
          )}
        </div>
      </section>
    </div>
  );
};

export default AdminDashboard;
