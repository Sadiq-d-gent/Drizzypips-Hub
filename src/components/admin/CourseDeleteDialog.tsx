import { Loader2 } from "lucide-react";
import type { MouseEvent } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteCourse } from "@/hooks/useCourseMutations";
import { CourseEnrollmentCount } from "@/types/admin";
import { Course } from "@/types/course";

type CourseDeleteDialogProps = {
  course: Course;
  /** Enrollment counts for this course, absent while they are still loading. */
  counts?: CourseEnrollmentCount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the delete succeeds — the edit page navigates away, the list does not. */
  onDeleted?: () => void;
};

/**
 * Confirmation for deleting a course.
 *
 * The interesting case is a course that has enrollments, which the database refuses outright:
 * `enrollments.course_id` is `on delete restrict`, so the delete raises 23503 and nothing
 * happens. The dialog says so before the click rather than letting the admin discover it from
 * an error toast, and names unpublishing as the thing they probably want instead.
 *
 * The confirm button stays live even then. The foreign key is the authority on whether the
 * delete is allowed, not a count this component fetched a moment ago — disabling the button
 * on a stale count would block a legitimate delete whose last enrollment was just removed,
 * and the mapped 23503 message is an honest outcome either way.
 */
const CourseDeleteDialog = ({
  course,
  counts,
  open,
  onOpenChange,
  onDeleted,
}: CourseDeleteDialogProps) => {
  const remove = useDeleteCourse();
  const total = counts?.total ?? 0;
  const blocked = total > 0;

  const handleConfirm = (event: MouseEvent<HTMLButtonElement>) => {
    // Held open so a failure leaves the explanation on screen instead of a bare toast.
    event.preventDefault();

    remove.mutate(
      { id: course.id, thumbnailUrl: course.thumbnail_url },
      {
        onSuccess: () => {
          onOpenChange(false);
          onDeleted?.();
        },
      },
    );
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {blocked ? "This course can't be deleted" : "Delete this course?"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                <span className="font-medium text-foreground">{course.title}</span>
              </p>

              {blocked ? (
                <>
                  <p>
                    {total} {total === 1 ? "student has" : "students have"} enrolled in this
                    course. An enrollment is a payment record, so the database will not let the
                    course it points at be destroyed — the delete will be refused.
                  </p>
                  <p>
                    To take it off the site, unpublish it instead. It disappears from the
                    catalogue immediately and the enrollment records stay intact.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Nobody has enrolled in this course, so it can be removed. Its thumbnail
                    image will be deleted too.
                  </p>
                  <p>This cannot be undone.</p>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={remove.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {remove.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Deleting
              </>
            ) : (
              "Delete course"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default CourseDeleteDialog;
