import { z } from "zod";

import { ADMIN_NOTE_MAX, ENROLLMENT_PAGE_SIZE, PASSWORD_MIN_LENGTH } from "@/lib/constants/admin";

/**
 * Admin form and URL schemas.
 *
 * These shape input before it leaves the browser. They are not the authorization
 * boundary: public.is_admin() and the RLS policies from 002/003/005 decide what an
 * administrator may see or change, and public.review_enrollment() decides what a legal
 * status transition is. A caller who bypasses these schemas entirely gets 42501 from the
 * database, not a review.
 */

/**
 * Sign-in credentials.
 *
 * No password complexity rule here. Password policy belongs to Supabase Auth, and
 * asserting a minimum length at sign-in would only produce a misleading message for an
 * account whose password predates the rule — 1 is enough to catch an empty field.
 */
export const adminLoginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { message: "Enter your email address." })
    .email({ message: "Enter a valid email address." }),
  password: z.string().min(1, { message: "Enter your password." }),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

/**
 * A password change.
 *
 * NOTE THE ASYMMETRY WITH adminLoginSchema, which is deliberate. That schema has no length
 * rule because validating a password you are merely *checking* tells an attacker nothing and
 * would produce a misleading message for an account whose password predates the rule.
 * Choosing a *new* one is the opposite case: a length floor here saves a round trip and is
 * the one moment where a rule can be applied without breaking anyone.
 *
 * Supabase Auth's own password policy stays the authority. If it is configured stricter than
 * PASSWORD_MIN_LENGTH it will reject the value with `weak_password`, which usePasswordChange
 * surfaces rather than duplicating the policy here.
 *
 * `currentPassword` is required because the account page verifies it before changing
 * anything — a signed-in session that has been left open on a shared machine should not be
 * enough on its own to take the account over.
 */
export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, { message: "Enter your current password." }),
    newPassword: z.string().min(PASSWORD_MIN_LENGTH, {
      message: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
    }),
    confirmPassword: z.string().min(1, { message: "Repeat the new password." }),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "The two new passwords do not match.",
    path: ["confirmPassword"],
  })
  /**
   * Caught here so the obvious no-op does not cost a round trip. Supabase also refuses it,
   * with `same_password`, and that rejection is mapped too — this check only covers the case
   * where both fields came from the same keyboard in the same minute.
   */
  .refine((value) => value.newPassword !== value.currentPassword, {
    message: "The new password is the same as the current one.",
    path: ["newPassword"],
  });

export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;

/**
 * An approve/reject decision plus its optional note.
 *
 * `decision` is an enum of exactly the two outcomes review_enrollment() accepts, so the
 * UI cannot ask for `cancelled` or an invented status. The database re-checks this and
 * raises ST001 regardless.
 */
export const reviewActionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  adminNote: z
    .string()
    .trim()
    .max(ADMIN_NOTE_MAX, { message: `Keep the note under ${ADMIN_NOTE_MAX} characters.` })
    .optional(),
});

export type ReviewActionInput = z.infer<typeof reviewActionSchema>;

/**
 * Queue filters as they appear in the URL.
 *
 * Every field is optional and defaulted, because the queue is reachable from a bare
 * `/admin/enrollments` and from dashboard tiles that set only `status`. `catch` is used
 * rather than a validation error: a hand-edited or stale query string should fall back to
 * the default view, not show the admin an error page.
 */
export const enrollmentQueueFiltersSchema = z.object({
  status: z
    .enum(["all", "pending_review", "approved", "rejected", "cancelled"])
    .catch("all"),
  courseId: z.string().trim().min(1).catch("all"),
  search: z.string().trim().max(200).catch(""),
  sort: z.enum(["newest", "pending-first"]).catch("newest"),
  page: z.coerce.number().int().min(1).catch(1),
});

export type EnrollmentQueueFiltersInput = z.infer<typeof enrollmentQueueFiltersSchema>;

/**
 * Reads queue filters out of a URLSearchParams.
 *
 * Kept beside the schema because the queue page, and anything that links into it, must
 * agree on the parameter names. Returns fully-populated filters — never partial — so
 * downstream code has no defaulting of its own to get wrong.
 */
export const parseEnrollmentQueueFilters = (
  params: URLSearchParams,
): EnrollmentQueueFiltersInput =>
  enrollmentQueueFiltersSchema.parse({
    status: params.get("status") ?? undefined,
    courseId: params.get("course") ?? undefined,
    search: params.get("q") ?? undefined,
    sort: params.get("sort") ?? undefined,
    page: params.get("page") ?? undefined,
  });

/**
 * Serialises filters back into a query string, omitting anything at its default.
 *
 * Keeps the URL short and shareable, and means the "no filters" state is a bare
 * `/admin/enrollments` rather than five redundant parameters.
 */
export const serializeEnrollmentQueueFilters = (
  filters: EnrollmentQueueFiltersInput,
): URLSearchParams => {
  const params = new URLSearchParams();

  if (filters.status !== "all") {
    params.set("status", filters.status);
  }

  if (filters.courseId !== "all") {
    params.set("course", filters.courseId);
  }

  if (filters.search) {
    params.set("q", filters.search);
  }

  if (filters.sort !== "newest") {
    params.set("sort", filters.sort);
  }

  if (filters.page > 1) {
    params.set("page", String(filters.page));
  }

  return params;
};

/** Zero-based range for a PostgREST `.range()` call, derived from a 1-based page. */
export const pageToRange = (page: number, pageSize: number = ENROLLMENT_PAGE_SIZE) => {
  const from = (Math.max(1, page) - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
};
