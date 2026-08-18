import { AlertTriangle, ArrowLeft, FileQuestion, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import AdminStateCard from "@/components/admin/AdminStateCard";
import {
  CoursePanel,
  EnrollmentPanel,
  StudentPanel,
} from "@/components/admin/EnrollmentDetailPanels";
import EnrollmentDeleteDialog from "@/components/admin/EnrollmentDeleteDialog";
import EnrollmentStatusBadge from "@/components/admin/EnrollmentStatusBadge";
import ReceiptPanel from "@/components/admin/ReceiptPanel";
import ReviewActions from "@/components/admin/ReviewActions";
import StatusHistoryTimeline from "@/components/admin/StatusHistoryTimeline";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminEnrollment } from "@/hooks/useAdminEnrollment";
import { ADMIN_ENROLLMENTS_PATH } from "@/lib/admin/routes";

/**
 * One enrollment, in full.
 *
 * Layout puts the review actions and the receipt in the right-hand column on desktop, since
 * approving requires looking at the receipt and nothing else on the page changes that
 * decision. On mobile the same order stacks: record first, then receipt, then the decision.
 */
const AdminEnrollmentDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enrollmentQuery, historyQuery } = useAdminEnrollment(id);

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const enrollment = enrollmentQuery.data;

  const backLink = (
    <Link
      to={ADMIN_ENROLLMENTS_PATH}
      className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Back to enrollments
    </Link>
  );

  if (enrollmentQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        {backLink}
        <div className="mt-6 flex flex-col gap-4" aria-hidden="true">
          <Skeleton className="h-10 w-64 rounded-xl" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (enrollmentQuery.isError) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        {backLink}
        <div className="mt-6">
          <AdminStateCard
            icon={AlertTriangle}
            title="Couldn't load this enrollment"
            description="Something went wrong reading the enrollment record. Please try again."
            tone="destructive"
          >
            <Button
              className="btn-premium min-h-11"
              onClick={() => {
                void enrollmentQuery.refetch();
              }}
            >
              Try again
            </Button>
          </AdminStateCard>
        </div>
      </div>
    );
  }

  if (!enrollment) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        {backLink}
        <div className="mt-6">
          <AdminStateCard
            icon={FileQuestion}
            title="Enrollment not found"
            description="There's no enrollment with that ID. It may have been deleted, or the link may be wrong."
          >
            <Button asChild className="btn-premium min-h-11">
              <Link to={ADMIN_ENROLLMENTS_PATH}>Back to enrollments</Link>
            </Button>
          </AdminStateCard>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      {backLink}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 break-all font-mono text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {enrollment.order_id}
        </h1>
        <EnrollmentStatusBadge status={enrollment.status} />
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        {enrollment.student_name} · {enrollment.course_title_snapshot}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <StudentPanel enrollment={enrollment} />
          <EnrollmentPanel enrollment={enrollment} />
          <CoursePanel enrollment={enrollment} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <ReceiptPanel enrollment={enrollment} />
          <ReviewActions enrollment={enrollment} />
        </div>
      </div>

      <div className="mt-4">
        <StatusHistoryTimeline
          entries={historyQuery.data ?? []}
          isLoading={historyQuery.isLoading}
          isError={historyQuery.isError}
        />
      </div>

      {/**
       * Deliberately last, and deliberately not in the review column.
       *
       * ReviewActions is where the day's work happens and is clicked constantly; a permanent
       * delete sitting beside Approve and Reject is a mis-click waiting to happen. Putting it
       * below the history also means the admin has scrolled past the whole record — including
       * every status change they are about to destroy — before they can reach it.
       *
       * It is on the detail page only, never on the queue. A bulk or drive-by delete of a
       * payment record is not an operation this panel should make easy.
       */}
      <section className="mt-8 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
        <h2 className="text-base font-semibold text-foreground">Delete this enrollment</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Erases the record, its payment receipt and its full status history. Nothing is kept,
          including any note of the deletion itself. To take an enrollment out of the queue
          without losing it, reject it instead.
        </p>

        <Button
          type="button"
          variant="outline"
          className="mt-4 min-h-11 gap-2 rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setConfirmingDelete(true)}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Delete enrollment
        </Button>
      </section>

      <EnrollmentDeleteDialog
        enrollment={enrollment}
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        onDeleted={() => navigate(ADMIN_ENROLLMENTS_PATH)}
      />
    </div>
  );
};

export default AdminEnrollmentDetail;
