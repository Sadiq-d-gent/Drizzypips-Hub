import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminCourseQueryKey } from "@/hooks/useAdminCourse";
import { courseEnrollmentCountsQueryKey } from "@/hooks/useCourseEnrollmentCounts";
import { CourseCreateInput, CourseUpdateInput } from "@/lib/validation/course.schema";
import {
  CourseMutationError,
  createCourse,
  deleteCourse,
  setCoursePublished,
  updateCourse,
} from "@/services/adminCourse.service";
import { deleteCourseThumbnailByUrl } from "@/services/courseThumbnail.service";
import { Course } from "@/types/course";

/**
 * Course create / update / publish / delete, with the thumbnail bookkeeping each one
 * implies.
 *
 * The service layer writes rows and the storage layer writes objects; composing the two is
 * this file's job, because "save the course" and "tidy the image the course no longer uses"
 * are one action to the admin and two to the database.
 */

/**
 * Presentable copy for a failed course write.
 *
 * CourseMutationError already carries mapped copy for every SQLSTATE the service knows, so
 * this passes its message straight through. The fallback is for anything that never reached
 * the service — an offline fetch, or a Zod parse failure from a form field that got past
 * the resolver.
 */
const describeCourseError = (error: unknown): string => {
  if (error instanceof CourseMutationError) {
    return error.message;
  }

  return "Something went wrong saving the course. Please try again.";
};

/**
 * Removes a thumbnail object without letting its failure fail the mutation.
 *
 * The row is what matters; the image is derived. A save that has already committed must not
 * report failure because a 4 KB leftover could not be swept, so this swallows the error and
 * says so out loud. Anything it leaves behind is listed by
 * supabase/maintenance/cleanup_orphan_thumbnails.sql.
 */
const discardThumbnail = async (url: string | null | undefined): Promise<void> => {
  try {
    await deleteCourseThumbnailByUrl(url);
  } catch (error) {
    // Not a user-facing failure, and the URL is public marketing material, not PII.
    console.warn("Could not remove the previous course thumbnail.", error);
  }
};

/**
 * Invalidates every cache a course write can affect.
 *
 * `["courses"]` is a prefix, so this covers both the public catalogue key
 * (`["courses","published"]`) and the admin list (`["courses","all"]`) in one call —
 * publishing a course has to change what the public pages show in the same session, not
 * just what the admin sees.
 */
const useCourseCacheInvalidation = () => {
  const queryClient = useQueryClient();

  return (courseId?: string) => {
    void queryClient.invalidateQueries({ queryKey: ["courses"] });
    void queryClient.invalidateQueries({ queryKey: courseEnrollmentCountsQueryKey });

    if (courseId) {
      void queryClient.invalidateQueries({ queryKey: adminCourseQueryKey(courseId) });
    }
  };
};

export const useCreateCourse = () => {
  const invalidate = useCourseCacheInvalidation();

  return useMutation({
    mutationFn: (input: CourseCreateInput) => createCourse(input),
    onSuccess: (course) => {
      invalidate(course.id);
      toast.success(
        course.published ? "Course created and published" : "Course created as a draft",
      );
    },
    onError: (error) => {
      toast.error(describeCourseError(error));
    },
  });
};

export type UpdateCourseVariables = {
  input: CourseUpdateInput;
  /**
   * thumbnail_url as it was before this save.
   *
   * Passed in rather than re-read, because after the update the old value is gone and the
   * object it pointed at would be unreachable — an orphan with nothing left to name it.
   */
  previousThumbnailUrl?: string | null;
};

export const useUpdateCourse = (id: string) => {
  const invalidate = useCourseCacheInvalidation();

  return useMutation({
    mutationFn: ({ input }: UpdateCourseVariables) => updateCourse(id, input),
    onSuccess: async (course, variables) => {
      /**
       * Only after the row has committed. Deleting the old image first would destroy a
       * live thumbnail if the update then failed — on a duplicate slug, say, which is a
       * routine mistake rather than an exceptional one.
       */
      const previous = variables.previousThumbnailUrl;
      if (previous && previous !== course.thumbnail_url) {
        await discardThumbnail(previous);
      }

      invalidate(course.id);
      toast.success("Course saved");
    },
    onError: (error) => {
      toast.error(describeCourseError(error));
    },
  });
};

/**
 * Publish or unpublish from the list, without opening the form.
 *
 * Unpublishing is the supported way to take a course down, since a course with enrollments
 * cannot be deleted at all.
 */
export const useCoursePublishToggle = () => {
  const invalidate = useCourseCacheInvalidation();

  return useMutation({
    mutationFn: ({ id, published }: { id: string; published: boolean }) =>
      setCoursePublished(id, published),
    onSuccess: (course: Course) => {
      invalidate(course.id);
      toast.success(
        course.published
          ? "Course published — it's now visible on the site"
          : "Course unpublished — it's no longer visible on the site",
      );
    },
    onError: (error) => {
      toast.error(describeCourseError(error));
    },
  });
};

export type DeleteCourseVariables = {
  id: string;
  thumbnailUrl?: string | null;
};

/**
 * Deletes a course, then its thumbnail.
 *
 * ROW FIRST — AND NOTE THAT THE ENROLLMENT DELETE DOES THE OPPOSITE.
 * The order is not a style choice in either place; it follows from whether the row delete
 * can fail. This one routinely can: enrollments.course_id is `on delete restrict`, so
 * deleting a course anybody enrolled in raises 23503. Removing the image first would mean
 * a failed delete had already destroyed the thumbnail of a course that still exists and is
 * possibly still published. An enrollment row, by contrast, has nothing that can refuse the
 * delete — its history rows cascade — so there the receipt goes first, to guarantee the
 * payment record never outlives the evidence attached to it.
 */
export const useDeleteCourse = () => {
  const invalidate = useCourseCacheInvalidation();

  return useMutation({
    mutationFn: async ({ id, thumbnailUrl }: DeleteCourseVariables) => {
      await deleteCourse(id);
      await discardThumbnail(thumbnailUrl);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Course deleted");
    },
    onError: (error) => {
      toast.error(describeCourseError(error));
    },
  });
};
