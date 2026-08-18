import { useQuery } from "@tanstack/react-query";

import { fetchCourseBySlug } from "@/services/course.service";

export const courseQueryKey = (slug: string | undefined) => ["courses", "detail", slug] as const;

export const useCourse = (slug: string | undefined) => {
  return useQuery({
    queryKey: courseQueryKey(slug),
    queryFn: () => {
      if (!slug) {
        throw new Error("Course slug is required.");
      }

      return fetchCourseBySlug(slug);
    },
    enabled: Boolean(slug),
    staleTime: 1000 * 60 * 5,
  });
};
