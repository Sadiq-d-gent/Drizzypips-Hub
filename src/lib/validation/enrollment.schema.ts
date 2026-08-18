import { z } from "zod";

import {
  ACCEPTED_RECEIPT_MIME_TYPES,
  MAX_RECEIPT_SIZE_BYTES,
  MAX_RECEIPT_SIZE_LABEL,
  RECEIPT_TYPES_LABEL,
  STUDENT_NAME_MAX,
  STUDENT_NAME_MIN,
  STUDENT_NOTE_MAX,
  STUDENT_PHONE_MAX,
  STUDENT_PHONE_MIN,
} from "@/lib/constants/enrollment";

/**
 * Enrollment form validation.
 *
 * These rules mirror the checks inside public.create_enrollment() and the CHECK
 * constraints on public.enrollments. The database is the authority; this exists to
 * give the student an inline error instead of a failed round trip. Where the two
 * differ the database wins, so the bounds are kept identical rather than "close".
 */

export const enrollmentDetailsSchema = z.object({
  studentName: z
    .string()
    .trim()
    .min(STUDENT_NAME_MIN, "Enter your full name.")
    .max(STUDENT_NAME_MAX, `Name must be ${STUDENT_NAME_MAX} characters or fewer.`),
  studentEmail: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    // Same shape as the column's regex: something, @, something, dot, something, and
    // no whitespace. Deliberately permissive — the receipt is checked by a human, and
    // a stricter pattern would reject valid addresses for no gain.
    .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Enter a valid email address.")
    .max(254, "Email must be 254 characters or fewer."),
  studentPhone: z
    .string()
    .trim()
    .min(STUDENT_PHONE_MIN, "Enter your WhatsApp phone number.")
    .max(STUDENT_PHONE_MAX, `Phone must be ${STUDENT_PHONE_MAX} characters or fewer.`)
    .regex(
      /^[+()\d][\d\s()+-]*$/,
      "Use digits, spaces and + ( ) - only.",
    ),
  studentNote: z
    .string()
    .trim()
    .max(STUDENT_NOTE_MAX, `Note must be ${STUDENT_NOTE_MAX} characters or fewer.`)
    .optional()
    .or(z.literal("")),
});

export type EnrollmentDetailsInput = z.infer<typeof enrollmentDetailsSchema>;

/**
 * Validates a chosen file before any upload begins.
 *
 * Returns an error string rather than throwing so the caller can render it next to
 * the input. `file.type` is browser-reported and trivially spoofable — the bucket's
 * allowed_mime_types is what actually enforces this — but it catches the ordinary
 * case of somebody picking a .docx.
 */
export const validateReceiptFile = (file: File): string | null => {
  if (file.size === 0) {
    return "That file is empty. Choose your payment receipt.";
  }

  if (file.size > MAX_RECEIPT_SIZE_BYTES) {
    return `That file is larger than ${MAX_RECEIPT_SIZE_LABEL}. Choose a smaller file.`;
  }

  if (!ACCEPTED_RECEIPT_MIME_TYPES.includes(file.type as (typeof ACCEPTED_RECEIPT_MIME_TYPES)[number])) {
    return `Receipts must be ${RECEIPT_TYPES_LABEL}.`;
  }

  return null;
};
