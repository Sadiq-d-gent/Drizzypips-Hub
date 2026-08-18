import { getSupabaseClient } from "@/lib/supabase/client";
import { Course } from "@/types/course";

/**
 * Course reads.
 *
 * Writes live in adminCourse.service.ts, which also owns the SQLSTATE mapping they need.
 * The two `fetchAll`/`fetchById` helpers below are admin-facing — they return unpublished
 * rows and therefore only ever succeed under the "Admins can read all courses" policy
 * from 001 — but they are reads, so they stay here with the rest.
 */

const COURSE_SELECT = `
  id,
  title,
  slug,
  short_description,
  description,
  learnings,
  requirements,
  duration,
  price,
  currency,
  thumbnail_url,
  published,
  created_at,
  updated_at
`;

const byCreatedDateDesc = { ascending: false } as const;

export const fetchPublishedCourses = async (): Promise<Course[]> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("courses")
    .select(COURSE_SELECT)
    .eq("published", true)
    .order("created_at", byCreatedDateDesc);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
};

export const fetchAllCourses = async (): Promise<Course[]> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("courses")
    .select(COURSE_SELECT)
    .order("created_at", byCreatedDateDesc);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
};

export const fetchCourseBySlug = async (slug: string): Promise<Course | null> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("courses")
    .select(COURSE_SELECT)
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

export const fetchCourseById = async (id: string): Promise<Course | null> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("courses")
    .select(COURSE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};
