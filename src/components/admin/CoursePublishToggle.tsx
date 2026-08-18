import { useState } from "react";

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
import { Switch } from "@/components/ui/switch";
import { useCoursePublishToggle } from "@/hooks/useCourseMutations";
import { Course } from "@/types/course";

type CoursePublishToggleProps = {
  course: Course;
};

/**
 * Publish / unpublish a course from the list, without opening the form.
 *
 * Publishing happens on the click. Unpublishing asks first, because it is the one direction
 * with an immediate outward-facing effect: the course vanishes from the catalogue, and any
 * /courses/<slug> link already shared stops resolving for everyone who is not an admin.
 * Reversible, but not invisible — worth a sentence before it happens rather than only a
 * toast afterwards.
 */
const CoursePublishToggle = ({ course }: CoursePublishToggleProps) => {
  const [confirmingUnpublish, setConfirmingUnpublish] = useState(false);
  const toggle = useCoursePublishToggle();

  const apply = (published: boolean) => {
    toggle.mutate({ id: course.id, published });
  };

  return (
    <>
      <Switch
        checked={course.published}
        disabled={toggle.isPending}
        onCheckedChange={(next) => {
          if (next) {
            apply(true);
            return;
          }

          setConfirmingUnpublish(true);
        }}
        aria-label={course.published ? `Unpublish ${course.title}` : `Publish ${course.title}`}
      />

      <AlertDialog open={confirmingUnpublish} onOpenChange={setConfirmingUnpublish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpublish this course?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{course.title}</span> will be
              removed from the catalogue and nobody will be able to enrol in it. Links already
              shared will stop working. Existing enrollments are not affected, and you can
              publish it again at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Keep it published</AlertDialogCancel>
            <AlertDialogAction onClick={() => apply(false)}>Unpublish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default CoursePublishToggle;
