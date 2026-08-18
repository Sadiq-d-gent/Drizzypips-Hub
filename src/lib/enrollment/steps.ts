/**
 * Enrollment wizard step definitions.
 *
 * Kept out of EnrollmentStepper.tsx so that component file exports only a component.
 * The wizard page needs these to validate the `?step=` query parameter, so they are
 * shared data rather than presentation.
 */

export type EnrollmentStep = "details" | "payment" | "receipt";

export const ENROLLMENT_STEPS: { id: EnrollmentStep; label: string }[] = [
  { id: "details", label: "Your details" },
  { id: "payment", label: "Make payment" },
  { id: "receipt", label: "Upload receipt" },
];

export const isEnrollmentStep = (value: string | null): value is EnrollmentStep =>
  ENROLLMENT_STEPS.some((step) => step.id === value);
