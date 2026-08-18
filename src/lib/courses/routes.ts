/**
 * Course route paths.
 *
 * Centralised so the catalogue, the detail page and the enrollment placeholder cannot
 * drift apart. Slugs come from the database and are interpolated into a URL, so they
 * are encoded here rather than at each call site.
 */

export const MENTORSHIP_PATH = "/mentorship";

export const courseDetailPath = (slug: string) => `/courses/${encodeURIComponent(slug)}`;

export const courseEnrollmentPath = (slug: string) => `${courseDetailPath(slug)}/enroll`;

/**
 * Confirmation page for a submitted enrollment.
 *
 * The token in this URL is a capability: holding it is what grants access to the
 * record. It is hex from the database so encoding is a formality, but it is applied
 * anyway so this builder cannot produce a malformed URL if the token format changes.
 */
export const enrollmentConfirmationPath = (accessToken: string) =>
  `/enrollment/${encodeURIComponent(accessToken)}`;
