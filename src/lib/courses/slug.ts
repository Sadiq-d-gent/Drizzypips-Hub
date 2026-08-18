/**
 * Turns a course title into a URL slug.
 *
 * The result has to satisfy the pattern courseCreateSchema enforces —
 * `^[a-z0-9]+(?:-[a-z0-9]+)*$` — so anything outside a–z and 0–9 becomes a separator and
 * runs of separators collapse.
 *
 * NFKD decomposes an accented letter into a base letter plus a combining mark, and the
 * `\p{M}` pass then drops the mark. Order matters: without it the mark would fall through to
 * the separator rule and split the word, giving "ana-lisis" for "Análisis" instead of
 * "analisis".
 *
 * Can return an empty string, for a title made entirely of punctuation or of a non-Latin
 * script. The caller treats that as "no suggestion" and leaves the admin to type a slug,
 * rather than offering one the schema will reject.
 */
export const slugifyCourseTitle = (title: string): string =>
  title
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
