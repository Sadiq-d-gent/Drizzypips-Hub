import { ENROLLMENT_STATUS_TONES } from "@/lib/constants/admin";
import { ENROLLMENT_STATUS_LABELS } from "@/lib/constants/enrollment";
import { cn } from "@/lib/utils";
import { EnrollmentStatus } from "@/types/enrollment";

type EnrollmentStatusBadgeProps = {
  status: EnrollmentStatus;
  className?: string;
};

/**
 * Status pill.
 *
 * Labels come from ENROLLMENT_STATUS_LABELS, the same map the student confirmation page
 * uses, so a status never reads one way to a student and another to an administrator.
 * Falls back to the raw value rather than rendering blank if the enum ever gains a member
 * before this map does.
 */
const EnrollmentStatusBadge = ({ status, className }: EnrollmentStatusBadgeProps) => (
  <span
    className={cn(
      "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium",
      ENROLLMENT_STATUS_TONES[status] ?? "border-border bg-muted text-muted-foreground",
      className,
    )}
  >
    {ENROLLMENT_STATUS_LABELS[status] ?? status}
  </span>
);

export default EnrollmentStatusBadge;
