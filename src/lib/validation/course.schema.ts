import { z } from "zod";

import type { MentorshipDelivery, MentorshipFormat } from "@/types/course";

const textArraySchema = z.array(z.string().trim().min(1)).default([]);

/**
 * The two mentorship enums, nullable, defaulting to unclassified.
 *
 * `satisfies` against the generated enum types rather than a hand-written union, so a label
 * added in a migration and regenerated into database.types.ts fails the typecheck here instead
 * of silently going unvalidated. Zod needs a literal tuple, which is why these are written out
 * rather than derived from MENTORSHIP_DELIVERIES; the check is what keeps the two in step.
 */
const DELIVERY_VALUES = ["physical", "online"] as const satisfies readonly MentorshipDelivery[];
const FORMAT_VALUES = ["general", "one_on_one"] as const satisfies readonly MentorshipFormat[];

/**
 * `.nullable().default(null)` rather than `.optional()`, because "clear this course's category"
 * has to be expressible. An absent optional field leaves the column as it was on an update;
 * an explicit null writes null and removes the classification, which is what the admin form's
 * "Not categorised" option means.
 */
const mentorshipDeliverySchema = z.enum(DELIVERY_VALUES).nullable().default(null);
const mentorshipFormatSchema = z.enum(FORMAT_VALUES).nullable().default(null);

export const courseCreateSchema = z.object({
  title: z.string().trim().min(2, "Course title is required."),
  slug: z.string().trim().min(2).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a URL-safe slug."),
  short_description: z.string().trim().min(10, "Short description is required."),
  description: z.string().trim().min(20, "Course description is required."),
  learnings: textArraySchema,
  requirements: textArraySchema,
  duration: z.string().trim().min(2, "Course duration is required."),
  price: z.number().nonnegative("Course price must be zero or higher."),
  currency: z.string().trim().min(1).max(8).default("USD"),
  thumbnail_url: z.string().trim().url().nullable().optional(),
  mentorship_delivery: mentorshipDeliverySchema,
  mentorship_format: mentorshipFormatSchema,
  published: z.boolean().default(false),
});

export const courseUpdateSchema = courseCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required to update a course.",
);

export type CourseCreateInput = z.infer<typeof courseCreateSchema>;
export type CourseUpdateInput = z.infer<typeof courseUpdateSchema>;
