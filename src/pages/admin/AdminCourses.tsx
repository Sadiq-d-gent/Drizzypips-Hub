import { AlertTriangle, BookOpen, Plus } from "lucide-react";
import { Link } from "react-router-dom";

import AdminStateCard from "@/components/admin/AdminStateCard";
import CourseTable from "@/components/admin/CourseTable";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCourseEnrollmentCounts } from "@/hooks/useCourseEnrollmentCounts";
import { useAllCourses } from "@/hooks/useCourses";
import { ADMIN_COURSE_NEW_PATH } from "@/lib/admin/routes";

/**
 * The course catalogue.
 *
 * Two queries, deliberately not one. The rows come from useAllCourses, which the enrollment
 * queue's course filter already uses — reusing it means publishing a course here updates that
 * filter in the same session for free. The enrollment counts come separately from
 * admin_course_stats(), because PostgREST cannot GROUP BY and one count request per course is
 * the N+1 this project does not do.
 *
 * The counts query is allowed to be slower or to fail on its own. A missing count shows as a
 * dash and the list still works; making the whole page wait on an aggregate would be the
 * wrong trade.
 */
const AdminCourses = () => {
  const coursesQuery = useAllCourses();
  const countsQuery = useCourseEnrollmentCounts();

  const courses = coursesQuery.data ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Courses</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Create courses, set their pricing and control what appears on the site.
          </p>
        </div>

        <Button asChild className="btn-premium min-h-12 gap-2">
          <Link to={ADMIN_COURSE_NEW_PATH}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New course
          </Link>
        </Button>
      </div>

      <div className="mt-6">
        {coursesQuery.isLoading ? (
          <div className="flex flex-col gap-3" aria-hidden="true">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
        ) : coursesQuery.isError ? (
          <AdminStateCard
            icon={AlertTriangle}
            title="Couldn't load courses"
            description="Something went wrong reading the catalogue. Please try again."
            tone="destructive"
          >
            <Button
              className="btn-premium min-h-11"
              onClick={() => {
                void coursesQuery.refetch();
              }}
            >
              Try again
            </Button>
          </AdminStateCard>
        ) : courses.length === 0 ? (
          <AdminStateCard
            icon={BookOpen}
            title="No courses yet"
            description="Create your first course to start taking enrollments. It stays hidden until you publish it."
          >
            <Button asChild className="btn-premium min-h-11 gap-2">
              <Link to={ADMIN_COURSE_NEW_PATH}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                New course
              </Link>
            </Button>
          </AdminStateCard>
        ) : (
          <>
            <CourseTable courses={courses} counts={countsQuery.data} />

            <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
              {courses.length} {courses.length === 1 ? "course" : "courses"} ·{" "}
              {courses.filter((course) => course.published).length} published
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminCourses;
