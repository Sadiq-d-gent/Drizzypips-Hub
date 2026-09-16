/**
 * The enrollment wizard's steps, in order.
 *
 * The array order IS the sequence: EnrollmentStepper derives "completed" from the index
 * of the current step, and CourseEnrollment maps each id to its panel. Adding a step means
 * adding it here and handling it in both of those places.
 */

export type EnrollmentStep = "details" | "verify" | "payment" | "receipt";

export const ENROLLMENT_STEPS: { id: EnrollmentStep; label: string }[] = [
  { id: "details", label: "Your details" },
  { id: "verify", label: "Verify email" },
  { id: "payment", label: "Make payment" },
  { id: "receipt", label: "Upload receipt" },
];

export const isEnrollmentStep = (value: string | null): value is EnrollmentStep =>
  ENROLLMENT_STEPS.some((step) => step.id === value);

/**
 * Where a submission refused with EV002 sends the student.
 *
 * create_enrollment() raises EV002 when the address holds no live verification. Rather
 * than leave the student on a dead end after they have already paid, the page returns them
 * here with an explanation. Named once so the string is not repeated across the page.
 */
export const VERIFICATION_STEP: EnrollmentStep = "verify";
