import { Course, CourseFilters } from "@/types/course";

/**
 * Client-side filtering for the published-course collection.
 *
 * The catalogue fetches published courses once (react-query, staleTime 5min) and
 * filters that array in memory, so typing in the search box never re-queries Supabase.
 */

export const PRICE_RANGE_OPTIONS = [
  { value: "all", label: "All prices" },
  { value: "under-150", label: "Under 150" },
  { value: "150-300", label: "150 – 300" },
  { value: "over-300", label: "Over 300" },
] as const satisfies ReadonlyArray<{ value: CourseFilters["priceRange"]; label: string }>;

export const DEFAULT_COURSE_FILTERS: CourseFilters = {
  query: "",
  priceRange: "all",
};

/**
 * Price buckets are inclusive at the upper edge of the middle band, so the seeded
 * boundary values land in exactly one bucket each: 149 -> under-150, 299 -> 150-300.
 * Boundaries are compared against the raw numeric price regardless of currency; the
 * catalogue has no exchange-rate source, so an NGN amount is bucketed by its own number.
 */
const matchesPriceRange = (price: number, priceRange: CourseFilters["priceRange"]) => {
  switch (priceRange) {
    case "under-150":
      return price < 150;
    case "150-300":
      return price >= 150 && price <= 300;
    case "over-300":
      return price > 300;
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
