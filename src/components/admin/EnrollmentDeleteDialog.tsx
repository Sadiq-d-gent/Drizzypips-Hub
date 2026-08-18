import { Loader2 } from "lucide-react";
import type { MouseEvent } from "react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEnrollmentDelete } from "@/hooks/useEnrollmentDelete";
import { AdminEnrollmentDetail } from "@/types/admin";

type EnrollmentDeleteDialogProps = {
  enrollment: AdminEnrollmentDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the delete succeeds — the detail page navigates back to the queue. */
  onDeleted: () => void;
};

/**
 * Confirmation for permanently deleting an enrollment.
 *
 * WHY TYPE-TO-CONFIRM RATHER THAN AN OK BUTTON
 * Every other destructive action in this panel is recoverable or refusable: a rejected
 * enrollment can be re-reviewed, an unpublished course republished, a course with enrollments
 * simply cannot be deleted. This one is neither. It destroys the payment record, the receipt
 * image, and the entire status history in one step, and nothing anywhere records that it
 * happened. Copying the order ID is a small deliberate act that a mis-click cannot produce,
 * and it forces the admin to look at *which* enrollment is about to go.
 *
 * The order ID is the right thing to type: it is printed on the row, it is what the student
 * quotes, and it is not a credential — unlike the access token, which is one and must never
 * appear in the panel.
 */
const EnrollmentDeleteDialog = ({
  enrollment,
  open,
  onOpenChange,
  onDeleted,
}: EnrollmentDeleteDialogProps) => {
  const [typed, setTyped] = useState("");
  const remove = useEnrollmentDelete();

  const confirmed = typed.trim() === enrollment.order_id;

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setTyped("");
    }

    onOpenChange(next);
  };

  const handleConfirm = (event: MouseEvent<HTMLButtonElement>) => {
    // Held open so a partial failure keeps its explanation on screen.
    event.preventDefault();

    if (!confirmed) {
      return;
    }

    remove.mutate(
      { id: enrollment.id, receiptPath: enrollment.receipt_path },
      {
        onSuccess: () => {
          setTyped("");
          onOpenChange(false);
          onDeleted();
        },
      },
    );
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this enrollment permanently?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                This is not the same as cancelling. Cancelling keeps the record and logs who
                did it; this erases the record itself.
              </p>

              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <span className="font-medium text-foreground">
                    {enrollment.student_name}
                  </span>
                  &apos;s enrollment for {enrollment.course_title_snapshot} is destroyed.
                </li>
                <li>The uploaded payment receipt is deleted from storage.</li>
                <li>The full status history for this enrollment goes with it.</li>
                <li>No record is kept that the deletion happened.</li>
              </ul>

              <p>This cannot be undone.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label htmlFor="confirm-order-id" className="text-sm">
            Type <span className="font-mono text-foreground">{enrollment.order_id}</span> to
            confirm
          </Label>
          <Input
            id="confirm-order-id"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={remove.isPending}
            placeholder={enrollment.order_id}
            className="h-12 rounded-xl border-border bg-card font-mono text-sm"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!confirmed || remove.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {remove.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Deleting
              </>
            ) : (
              "Delete permanently"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default EnrollmentDeleteDialog;
