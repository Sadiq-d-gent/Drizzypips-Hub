import { AlertTriangle, ArrowLeft, SearchX, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import AdminStateCard from "@/components/admin/AdminStateCard";
import CourseDeleteDialog from "@/components/admin/CourseDeleteDialog";
import CourseForm from "@/components/admin/CourseForm";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminCourse } from "@/hooks/useAdminCourse";
import { useCourseEnrollmentCounts } from "@/hooks/useCourseEnrollmentCounts";
import { useUpdateCourse } from "@/hooks/useCourseMutations";
import { ADMIN_COURSES_PATH } from "@/lib/admin/routes";
import { courseDetailPath } from "@/lib/courses/routes";

/**
 * Edit a course.
 *
 * Keyed on the course id rather than its slug, because the slug is the one field this screen
 * exists to be able to change — a URL that stops resolving the moment you save it would be a
 * poor address for the editor.
 */
const AdminCourseEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const courseQuery = useAdminCourse(id);
  const countsQuery = useCourseEnrollmentCounts();
  const update = useUpdateCourse(id ?? "");

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const course = courseQuery.data;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="min-w-0">
        <Button
          asChild
          variant="ghost"
          className="-ml-3 min-h-11 gap-2 rounded-xl text-muted-foreground hover:text-foreground"
        >
          <Link to={ADMIN_COURSES_PATH}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            All courses
          </Link>
        </Button>

        <h1 className="mt-4 truncate text-3xl font-bold tracking-tight text-foreground">
          {course ? course.title : "Edit course"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {course ? (
            course.published ? (
              <>
                Live at{" "}
                <a
                  href={courseDetailPath(course.slug)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs underline hover:text-foreground"
                >
                  {courseDetailPath(course.slug)}
                </a>
              </>
            ) : (
              "Draft — not visible on the site."
            )
          ) : (
            "Loading course details."
          )}
        </p>
      </div>

      <div className="mt-8">
        {courseQuery.isLoading ? (
          <div className="flex flex-col gap-4" aria-hidden="true">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        ) : courseQuery.isError ? (
          <AdminStateCard
            icon={AlertTriangle}
            title="Couldn't load this course"
            description="Something went wrong reading the course. Please try again."
            tone="destructive"
          >
            <Button
              className="btn-premium min-h-11"
              onClick={() => {
                void courseQuery.refetch();
              }}
            >
              Try again
            </Button>
          </AdminStateCard>
        ) : !course ? (
          <AdminStateCard
            icon={SearchX}
            title="Course not found"
            description="No course exists with that id. It may have been deleted."
          >
            <Button asChild variant="outline" className="min-h-11 rounded-xl">
              <Link to={ADMIN_COURSES_PATH}>Back to courses</Link>
            </Button>
          </AdminStateCard>
        ) : (
          <>
            {/**
             * Remounted whenever the row changes, which after a save means the form restarts
             * from the values that actually persisted. That also clears the thumbnail field's
             * record of session uploads — correct, because the image it just uploaded is now
             * the course's live thumbnail and must not be swept as a leftover.
             */}
            <CourseForm
              key={course.updated_at}
              course={course}
              isSubmitting={update.isPending}
              onCancel={() => navigate(ADMIN_COURSES_PATH)}
              onSubmit={(values) => {
                update.mutate({
                  input: values,
                  previousThumbnailUrl: course.thumbnail_url,
                });
              }}
            />

            <section className="mt-12 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
              <h2 className="text-base font-semibold text-foreground">Delete this course</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Removes the course and its thumbnail for good. A course that students have
                enrolled in cannot be deleted — unpublish it instead.
              </p>

              <Button
                type="button"
                variant="outline"
                className="mt-4 min-h-11 gap-2 rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete course
              </Button>
            </section>

            <CourseDeleteDialog
              course={course}
              counts={countsQuery.data?.[course.id]}
              open={confirmingDelete}
              onOpenChange={setConfirmingDelete}
              onDeleted={() => navigate(ADMIN_COURSES_PATH)}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default AdminCourseEdit;
