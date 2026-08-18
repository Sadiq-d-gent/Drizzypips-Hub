import { Check } from "lucide-react";

import { ENROLLMENT_STEPS, EnrollmentStep } from "@/lib/enrollment/steps";
import { cn } from "@/lib/utils";

type EnrollmentStepperProps = {
  currentStep: EnrollmentStep;
};

/**
 * Progress indicator for the three-step enrollment wizard.
 *
 * Marked up as an ordered list rather than a row of divs so the sequence and the
 * position within it are conveyed structurally. `aria-current="step"` names the active
 * one, and completed steps carry visually-hidden text so a screen reader hears
 * "completed" rather than an unexplained tick.
 */
const EnrollmentStepper = ({ currentStep }: EnrollmentStepperProps) => {
  const currentIndex = ENROLLMENT_STEPS.findIndex((step) => step.id === currentStep);

  return (
    <nav aria-label="Enrollment progress">
      <ol className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
        {ENROLLMENT_STEPS.map((step, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <li key={step.id} className="flex flex-1 items-center gap-3">
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                  isComplete && "border-success bg-success text-success-foreground",
                  isCurrent && "border-primary bg-primary text-primary-foreground",
                  !isComplete && !isCurrent && "border-border bg-card text-muted-foreground",
                )}
              >
                {isComplete ? (
                  <>
                    <Check className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">Completed:</span>
                  </>
                ) : (
                  index + 1
                )}
              </span>

              <span
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "text-sm font-medium",
                  isCurrent ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>

              {index < ENROLLMENT_STEPS.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "hidden h-px flex-1 sm:block",
                    isComplete ? "bg-success" : "bg-border",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default EnrollmentStepper;
