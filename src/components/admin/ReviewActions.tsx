import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useState } from "react";

import EnrollmentStatusBadge from "@/components/admin/EnrollmentStatusBadge";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEnrollmentReview } from "@/hooks/useEnrollmentReview";
import { ADMIN_NOTE_MAX } from "@/lib/constants/admin";
import { formatCoursePrice } from "@/lib/courses/price";
import { AdminEnrollmentDetail, ReviewDecision } from "@/types/admin";

type ReviewActionsProps = {
  enrollment: AdminEnrollmentDetail;
};

/**
 * Approve / reject, with confirmation.
 *
 * Only two actions exist, and only for an enrollment that is still `pending_review`. There
 * is no free-form status control: `public.review_enrollment()` accepts nothing but
 * `approved` and `rejected` from `pending_review`, raising ST001/ST002 otherwise, so a UI
 * offering more would only be offering errors. Once reviewed, this panel becomes a
 * read-only statement of the outcome — reversing a decision is a deliberate database
 * action, not a button.
 *
 * The note is optional for an approval and strongly encouraged for a rejection, since it is
 * the only record of why. It is written by the same UPDATE that changes the status, so the
 * migration 005 trigger copies it into the history row. It is internal: the student-facing
 * `get_enrollment_by_token()` does not return `admin_note`.
 */
const ReviewActions = ({ enrollment }: ReviewActionsProps) => {
  const [adminNote, setAdminNote] = useState("");
  const [pendingDecision, setPendingDecision] = useState<ReviewDecision | null>(null);
  const review = useEnrollmentReview(enrollment.id);

  const isPending = enrollment.status === "pending_review";

  if (!isPending) {
    return (
      <Card className="rounded-2xl border-border bg-card">
        <CardContent className="p-5 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Review
          </h2>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <EnrollmentStatusBadge status={enrollment.status} />
            <p className="text-sm text-muted-foreground">
              This enrollment has already been reviewed.
            </p>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Status changes are recorded in the history below. Changing a completed review
            requires a deliberate database change, so it is not offered here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const confirmReview = () => {
    if (!pendingDecision) {
      return;
    }

    review.mutate(
      { decision: pendingDecision, adminNote: adminNote.trim() || undefined },
      {
        onSuccess: () => {
          setAdminNote("");
        },
        onSettled: () => {
          setPendingDecision(null);
        },
      },
    );
  };

  const price = formatCoursePrice(Number(enrollment.price_amount), enrollment.price_currency);

  return (
    <Card className="rounded-2xl border-warning/30 bg-warning/5">
      <CardContent className="p-5 sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Review this enrollment
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          Confirm the receipt shows a completed transfer of {price} before approving.
        </p>

        <div className="mt-4">
          <Label htmlFor="admin-note" className="text-sm">
            Admin note <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="admin-note"
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
            maxLength={ADMIN_NOTE_MAX}
            rows={3}
            placeholder="Why are you approving or rejecting this? Saved to the enrollment history."
            className="mt-2 rounded-xl border-border bg-card"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {adminNote.length}/{ADMIN_NOTE_MAX} · Internal only — the student never sees this.
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Button
            onClick={() => setPendingDecision("approved")}
            disabled={review.isPending}
            className="btn-premium min-h-12 flex-1"
          >
            {review.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            )}
            Approve
          </Button>

          <Button
            variant="outline"
            onClick={() => setPendingDecision("rejected")}
            disabled={review.isPending}
            className="min-h-12 flex-1 gap-2 rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <XCircle className="h-4 w-4" aria-hidden="true" />
            Reject
          </Button>
        </div>
      </CardContent>

      <AlertDialog
        open={pendingDecision !== null}
        onOpenChange={(open) => {
          if (!open && !review.isPending) {
            setPendingDecision(null);
          }
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDecision === "approved" ? "Approve this enrollment?" : "Reject this enrollment?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDecision === "approved" ? (
                <>
                  {enrollment.student_name} will be marked as an approved student for{" "}
                  {enrollment.course_title_snapshot} at {price}. This is recorded in the
                  enrollment history and cannot be undone from the admin panel.
                </>
              ) : (
                <>
                  This marks {enrollment.student_name}'s payment for{" "}
                  {enrollment.course_title_snapshot} as rejected. This is recorded in the
                  enrollment history and cannot be undone from the admin panel.
                  {adminNote.trim() ? null : " Consider adding a note explaining why."}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={review.isPending} className="min-h-11 rounded-xl">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Keep the dialog open while the request is in flight, so the spinner is visible.
                event.preventDefault();
                confirmReview();
              }}
              disabled={review.isPending}
              className="btn-premium min-h-11"
            >
              {review.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {pendingDecision === "approved" ? "Approve" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default ReviewActions;
