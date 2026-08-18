import { useQuery } from "@tanstack/react-query";

import { fetchAllCourses, fetchPublishedCourses } from "@/services/course.service";

export const coursesQueryKey = ["courses", "published"] as const;

export const allCoursesQueryKey = ["courses", "all"] as const;

export const useCourses = () => {
  return useQuery({
    queryKey: coursesQueryKey,
    queryFn: fetchPublishedCourses,
    staleTime: 1000 * 60 * 5,
  });
};

/**
 * Every course, published or not — for the admin queue's course filter.
 *
 * Resolves through the existing "Admins can read all courses" policy, so for anyone else
 * this returns only what the public policy allows. An unpublished course can still have
 * enrollments against it, so filtering by course has to be able to name one.
 */
export const useAllCourses = () => {
  return useQuery({
    queryKey: allCoursesQueryKey,
    queryFn: fetchAllCourses,
    staleTime: 1000 * 60 * 5,
  });
};
