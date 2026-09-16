import { Database } from "@/types/database.types";

export type Course = Database["public"]["Tables"]["courses"]["Row"];
export type CourseInsert = Database["public"]["Tables"]["courses"]["Insert"];
export type CourseUpdate = Database["public"]["Tables"]["courses"]["Update"];

/**
 * Where a program is taught, and how.
 *
 * Aliases of the generated enum types rather than string unions written again here, so a label
 * added in a migration reaches every consumer through the typecheck. Both are nullable on the
 * row: null means the course has not been classified, which 013 explains is deliberately not
 * the same as "online" or "general".
 */
export type MentorshipDelivery = Database["public"]["Enums"]["mentorship_delivery"];
export type MentorshipFormat = Database["public"]["Enums"]["mentorship_format"];

export type CourseFilters = {
  query: string;
  priceRange: "all" | "under-150" | "150-300" | "over-300";
};
