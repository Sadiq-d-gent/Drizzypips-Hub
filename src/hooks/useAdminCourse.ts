import { useQuery } from "@tanstack/react-query";

import { ADMIN_QUERY_SCOPE } from "@/lib/constants/admin";
import { fetchCourseById } from "@/services/course.service";

export const adminCourseQueryKey = (id: string) => [...ADMIN_QUERY_SCOPE, "course", id] as const;

/**
 * One course by id, for the edit form.
 *
 * Keyed under the admin scope rather than reusing the public course caches, because this
 * reads an unpublished row through the "Admins can read all courses" policy from 001.
 *
 * `null` data is a real answer, not a failure: no course with that id, or a row RLS is
 * hiding. fetchCourseById uses maybeSingle() so the two are indistinguishable, which is
 * the correct behaviour — the page renders "not found" either way rather than confirming
 * that an id exists but is off-limits.
 */
export const useAdminCourse = (id: string | undefined) =>
  useQuery({
    queryKey: adminCourseQueryKey(id ?? ""),
    queryFn: () => fetchCourseById(id as string),
    enabled: Boolean(id),
    staleTime: 1000 * 60,
  });
