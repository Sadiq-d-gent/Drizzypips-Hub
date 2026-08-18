import { Database } from "@/types/database.types";

export type Course = Database["public"]["Tables"]["courses"]["Row"];
export type CourseInsert = Database["public"]["Tables"]["courses"]["Insert"];
export type CourseUpdate = Database["public"]["Tables"]["courses"]["Update"];

export type CourseFilters = {
  query: string;
  priceRange: "all" | "under-150" | "150-300" | "over-300";
};
