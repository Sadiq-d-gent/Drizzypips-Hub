import { COURSE_SQLSTATE } from "@/lib/constants/admin";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  CourseCreateInput,
  CourseUpdateInput,
  courseCreateSchema,
  courseUpdateSchema,
} from "@/lib/validation/course.schema";
import { CourseEnrollmentCounts } from "@/types/admin";
import { Course } from "@/types/course";

/**
 * Course writes for the admin panel.
 *
 * WHY THESE ARE HERE AND NOT IN course.service.ts
 * Same split as enrollment.service.ts / adminEnrollment.service.ts: the public service
 * holds reads that an anonymous visitor makes, this one holds writes that only an
 * administrator can make. The four mutations below previously sat unused in
 * course.service.ts and have been moved rather than duplicated, so there is still one
 * implementation of each.
 *
 * WHY DIRECT TABLE ACCESS AND NOT AN RPC
 * 001 already ships admin INSERT/UPDATE/DELETE policies on public.courses, each gated on
 * public.is_admin(). A course row carries no invariant a policy cannot express — there is
 * no state machine to enforce as there is for enrollment review, and nothing to derive
 * from auth.uid(). An RPC here would add a layer without adding a guarantee. The
 * SECURITY DEFINER functions in 007 and 009 exist because they enforce something the
 * policies cannot; these writes do not need one.
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

/** The parts of a PostgREST failure this module reasons about. */
type CourseFailure = { code?: string | null; message?: string };

/**
 * Error from a course write, carrying the SQLSTATE so the UI can map it to copy.
 *
 * Mirrors ReviewError in adminEnrollment.service.ts.
 */
export class CourseMutationError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "CourseMutationError";
    this.code = code;
  }

  /** 23505: another course already holds that slug. Recoverable — the admin edits it. */
  get isDuplicateSlug(): boolean {
    return this.code === COURSE_SQLSTATE.DUPLICATE_SLUG;
  }

  /** 23503: students have enrolled, so `on delete restrict` refuses the delete. */
  get isReferencedByEnrollments(): boolean {
    return this.code === COURSE_SQLSTATE.HAS_ENROLLMENTS;
  }
}

/**
 * Turns a PostgREST failure into presentable copy.
 *
 * The default branch deliberately drops error.message. Raw Postgres text is written for
 * an operator reading a log — it names constraints, columns and sometimes the offending
 * value — and putting it in front of an admin is both confusing and a small disclosure of
 * schema detail. The code is kept so the real cause is still greppable from a thrown
 * error, and unmapped codes are surfaced in the console by the calling hook, not here.
 */
const toCourseError = (error: CourseFailure, fallback: string): CourseMutationError => {
  const code = error.code ?? undefined;

  switch (code) {
    case COURSE_SQLSTATE.DUPLICATE_SLUG:
      return new CourseMutationError(
        "That web address is already taken by another course. Change the slug and try again.",
        code,
      );
    case COURSE_SQLSTATE.HAS_ENROLLMENTS:
      return new CourseMutationError(
        "Students have already enrolled in this course, so it can't be deleted. Unpublish it instead to remove it from the catalogue.",
        code,
      );
    case COURSE_SQLSTATE.NOT_ADMIN:
      return new CourseMutationError("You don't have permission to change courses.", code);
    case COURSE_SQLSTATE.NO_ROW_RETURNED:
      return new CourseMutationError(
        "That course couldn't be found. It may have been deleted by someone else.",
        code,
      );
    default:
      return new CourseMutationError(fallback, code);
  }
};

export const createCourse = async (input: CourseCreateInput): Promise<Course> => {
  const supabase = getSupabaseClient();
  const payload = courseCreateSchema.parse(input);

  const { data, error } = await supabase
    .from("courses")
    .insert(payload)
    .select(COURSE_SELECT)
    .single();

  if (error) {
    throw toCourseError(error, "The course couldn't be created. Try again.");
  }

  return data;
};

export const updateCourse = async (id: string, input: CourseUpdateInput): Promise<Course> => {
  const supabase = getSupabaseClient();
  const payload = courseUpdateSchema.parse(input);

  const { data, error } = await supabase
    .from("courses")
    .update(payload)
    .eq("id", id)
    .select(COURSE_SELECT)
    .single();

  if (error) {
    throw toCourseError(error, "The course couldn't be saved. Try again.");
  }

  return data;
};

/**
 * Publish or unpublish, the one-field case of an update.
 *
 * Unpublishing is the real answer to "take this course down", since deleting one with
 * enrollments is refused by the schema. It removes the course from every anonymous
 * surface immediately: the catalogue query and the slug lookup in course.service.ts both
 * filter on `published = true`, and so does the course lookup inside create_enrollment,
 * so an in-flight student cannot slip an enrollment through against a hidden course.
 */
export const setCoursePublished = async (id: string, published: boolean): Promise<Course> =>
  updateCourse(id, { published });

/**
 * Deletes a course row. The caller is responsible for the thumbnail object.
 *
 * `.select("id")` is not decoration. A delete that matches nothing — because the id is
 * gone, or because RLS hid the row from a non-admin — comes back with no error at all,
 * so without asking for the deleted rows this function would report success for a delete
 * that never happened.
 */
export const deleteCourse = async (id: string): Promise<void> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("courses").delete().eq("id", id).select("id");

  if (error) {
    throw toCourseError(error, "The course couldn't be deleted. Try again.");
  }

  if (!data || data.length === 0) {
    throw new CourseMutationError(
      "That course couldn't be deleted. It may already be gone, or you may not have permission.",
    );
  }
};

/**
 * Enrollment counts per course from public.admin_course_stats(), keyed by course id.
 *
 * A map rather than a list because every caller has a course in hand and wants its
 * number. The function returns one row per course including zeros, so a missing key means
 * the course itself is unknown to the database, not that it has no enrollments.
 */
export const fetchCourseEnrollmentCounts = async (): Promise<CourseEnrollmentCounts> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("admin_course_stats");

  if (error) {
    throw toCourseError(error, "Enrollment counts couldn't be loaded.");
  }

  const counts: CourseEnrollmentCounts = {};

  for (const row of data ?? []) {
    counts[row.course_id] = {
      total: Number(row.total ?? 0),
      pending: Number(row.pending ?? 0),
    };
  }

  return counts;
};
