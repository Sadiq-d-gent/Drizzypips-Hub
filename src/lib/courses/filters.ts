import { Course, CourseFilters } from "@/types/course";

/**
 * Client-side filtering for the published-course collection.
 *
 * The catalogue fetches published courses once (react-query, staleTime 5min) and
 * filters that array in memory, so typing in the search box never re-queries Supabase.
 */

export const PRICE_RANGE_OPTIONS = [
  { value: "all", label: "All prices" },
  { value: "under-250k", label: "Under 250,000" },
  { value: "250k-450k", label: "250,000 – 450,000" },
  { value: "over-450k", label: "Over 450,000" },
] as const satisfies ReadonlyArray<{ value: CourseFilters["priceRange"]; label: string }>;

export const DEFAULT_COURSE_FILTERS: CourseFilters = {
  query: "",
  priceRange: "all",
};

/**
 * Price buckets are inclusive at the upper edge of the middle band, so a program sitting
 * exactly on a boundary lands in one bucket only: 250,000 -> 250k-450k, 450,000 -> 250k-450k.
 * Boundaries are compared against the raw numeric price regardless of currency; the
 * catalogue has no exchange-rate source, so an NGN amount is bucketed by its own number.
 *
 * The edges are naira-scaled because the catalogue is. The original 150/300 boundaries were
 * chosen for dollar-priced sample rows, and against the real programs (150,000 to 600,000)
 * they degenerated: two buckets matched nothing and the third matched everything, which is a
 * filter that cannot filter. These four split as 150k | 250k, 450k | 600k, so every option
 * returns something and no option returns the whole list.
 */
const matchesPriceRange = (price: number, priceRange: CourseFilters["priceRange"]) => {
  switch (priceRange) {
    case "under-250k":
      return price < 250000;
    case "250k-450k":
      return price >= 250000 && price <= 450000;
    case "over-450k":
      return price > 450000;
    case "all":
    default:
      return true;
  }
};

const matchesQuery = (course: Course, normalizedQuery: string) => {
  if (!normalizedQuery) {
    return true;
  }

  return [course.title, course.short_description, course.duration].some((field) =>
    field?.toLowerCase().includes(normalizedQuery),
  );
};

export const filterCourses = (courses: Course[], filters: CourseFilters): Course[] => {
  const normalizedQuery = filters.query.trim().toLowerCase();

  return courses.filter(
    (course) => matchesQuery(course, normalizedQuery) && matchesPriceRange(course.price, filters.priceRange),
  );
};

export const areFiltersActive = (filters: CourseFilters) =>
  filters.query.trim().length > 0 || filters.priceRange !== "all";
