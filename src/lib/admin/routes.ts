/**
 * Admin route paths.
 *
 * Centralised for the same reason as src/lib/courses/routes.ts: the guard, the sidebar,
 * the dashboard tiles and the queue all navigate between these, and a typo in any one of
 * them is a dead link that typechecks.
 */

import { EnrollmentStatus } from "@/types/enrollment";

export const ADMIN_ROOT_PATH = "/admin";

export const ADMIN_LOGIN_PATH = "/admin/login";

export const ADMIN_ENROLLMENTS_PATH = "/admin/enrollments";

export const adminEnrollmentDetailPath = (id: string) =>
  `${ADMIN_ENROLLMENTS_PATH}/${encodeURIComponent(id)}`;

/** Queue pre-filtered to one status — how the dashboard tiles link into the queue. */
export const adminEnrollmentsByStatusPath = (status: EnrollmentStatus) =>
  `${ADMIN_ENROLLMENTS_PATH}?status=${encodeURIComponent(status)}`;

export const ADMIN_COURSES_PATH = "/admin/courses";

export const ADMIN_COURSE_NEW_PATH = "/admin/courses/new";

/**
 * Course edit form, keyed by id rather than slug.
 *
 * The slug is the one field the form exists to be able to change, and it is the public
 * URL for the course, so keying the editor on it would move the page out from under the
 * admin on save and put a second meaning on a value the catalogue already owns. The id is
 * immutable.
 */
export const adminCourseEditPath = (id: string) =>
  `${ADMIN_COURSES_PATH}/${encodeURIComponent(id)}`;

/** Payment details students are shown, and the enrollment pause. */
export const ADMIN_SETTINGS_PATH = "/admin/settings";

/**
 * The signed-in administrator's own account.
 *
 * Password change only. `public.admins` has no UPDATE policy — 001 grants it a single
 * self-only SELECT policy and nothing else — so a name edit from the client would silently
 * affect zero rows, and `auth.users.email` is a second source of truth for the address.
 * Both are shown read-only.
 */
export const ADMIN_ACCOUNT_PATH = "/admin/account";

/**
 * Whether a path is safe to redirect to after sign-in.
 *
 * The login page reads its post-sign-in destination from router state, which only this
 * application writes. Constraining it anyway costs nothing and means the redirect cannot
 * become an open redirect if that value ever starts coming from a query string. Rejects
 * protocol-relative URLs (`//evil.example`) and anything outside the admin area.
 */
export const isSafeAdminRedirect = (path: string | null | undefined): path is string => {
  if (!path) {
    return false;
  }

  if (path.startsWith("//")) {
    return false;
  }

  return path === ADMIN_ROOT_PATH || path.startsWith(`${ADMIN_ROOT_PATH}/`);
};
