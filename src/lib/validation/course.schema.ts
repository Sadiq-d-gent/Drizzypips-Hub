import { z } from "zod";

const textArraySchema = z.array(z.string().trim().min(1)).default([]);

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
  published: z.boolean().default(false),
});

export const courseUpdateSchema = courseCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required to update a course.",
);

export type CourseCreateInput = z.infer<typeof courseCreateSchema>;
export type CourseUpdateInput = z.infer<typeof courseUpdateSchema>;
