import { format } from "date-fns";
import { History } from "lucide-react";

import EnrollmentStatusBadge from "@/components/admin/EnrollmentStatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EnrollmentHistoryEntry } from "@/types/admin";

type StatusHistoryTimelineProps = {
  entries: EnrollmentHistoryEntry[];
  isLoading: boolean;
  isError: boolean;
};

/**
 * Who describes a change, when the actor has no admin identity.
 *
 * `changed_by_name` is null for the creation entry, because the student was anonymous —
 * there is no admin row to name — and for anything done directly in SQL. `changed_by_role`
 * still says something useful in those cases, so it is used as the fallback rather than
 * printing "Unknown".
 */
const describeActor = (entry: EnrollmentHistoryEntry): string => {
  if (entry.changed_by_name) {
    return entry.changed_by_name;
  }

  if (entry.from_status === null) {
    return "Student submission";
  }

  return entry.changed_by_role ? `System (${entry.changed_by_role})` : "System";
};

/**
 * Read-only status history.
 *
 * Every entry here was written by the enrollments_log_status_change trigger from migration
 * 005. That table has a SELECT policy and nothing else — no INSERT, UPDATE or DELETE policy
 * for any role, administrators included — so the audit trail cannot be edited from the
 * application at all. This component reads it and offers no way to change it, which matches
 * how the database is built rather than merely respecting it by convention.
 */
const StatusHistoryTimeline = ({ entries, isLoading, isError }: StatusHistoryTimelineProps) => {
  return (
    <Card className="rounded-2xl border-border bg-card">
      <CardContent className="p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <History className="h-4 w-4" aria-hidden="true" />
          Status history
        </h2>

        {isLoading ? (
          <div className="mt-4 flex flex-col gap-3" aria-hidden="true">
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
          </div>
        ) : isError ? (
          <p className="mt-4 text-sm text-muted-foreground">
            The status history couldn't be loaded. The enrollment record above is unaffected.
          </p>
        ) : entries.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No status changes recorded yet.</p>
        ) : (
          <ol className="mt-4 flex flex-col gap-4">
            {entries.map((entry) => (
              <li key={entry.id} className="flex gap-3">
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />

                <div className="min-w-0 flex-1 border-b border-border pb-4 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {entry.from_status ? (
                      <>
                        <EnrollmentStatusBadge status={entry.from_status} />
                        <span className="text-xs text-muted-foreground" aria-label="changed to">
                          →
                        </span>
                      </>
                    ) : null}
                    <EnrollmentStatusBadge status={entry.to_status} />
                  </div>

                  <p className="mt-2 text-sm text-foreground">{describeActor(entry)}</p>

                  <p className="text-xs text-muted-foreground">
                    {format(new Date(entry.created_at), "d MMM yyyy, HH:mm")}
                  </p>

                  {entry.note ? (
                    <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-muted px-3 py-2 text-sm text-foreground">
                      {entry.note}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
};

export default StatusHistoryTimeline;
