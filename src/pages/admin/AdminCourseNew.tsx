import { ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import CourseForm from "@/components/admin/CourseForm";
import { Button } from "@/components/ui/button";
import { useCreateCourse } from "@/hooks/useCourseMutations";
import { ADMIN_COURSES_PATH } from "@/lib/admin/routes";

/**
 * Create a course.
 *
 * New courses are created as drafts unless the admin flips Published in the form, so an
 * unfinished course cannot appear on the site by accident.
 */
const AdminCourseNew = () => {
  const navigate = useNavigate();
  const create = useCreateCourse();

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

        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">New course</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Fill in the details below. The course stays hidden until you publish it.
        </p>
      </div>

      <div className="mt-8">
        <CourseForm
          isSubmitting={create.isPending}
          onCancel={() => navigate(ADMIN_COURSES_PATH)}
          onSubmit={(values) => {
            create.mutate(values, {
              onSuccess: () => navigate(ADMIN_COURSES_PATH),
            });
          }}
        />
      </div>
    </div>
  );
};

export default AdminCourseNew;
