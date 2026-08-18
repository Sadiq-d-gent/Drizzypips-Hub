import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, SearchX } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import AdminStateCard from "@/components/admin/AdminStateCard";
import EnrollmentFilters from "@/components/admin/EnrollmentFilters";
import EnrollmentTable from "@/components/admin/EnrollmentTable";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminEnrollments } from "@/hooks/useAdminEnrollments";
import { useAllCourses } from "@/hooks/useCourses";
import { ENROLLMENT_PAGE_SIZE } from "@/lib/constants/admin";
import {
  EnrollmentQueueFiltersInput,
  parseEnrollmentQueueFilters,
  serializeEnrollmentQueueFilters,
} from "@/lib/validation/admin.schema";

/**
 * The enrollment review queue.
 *
 * Filter state lives in the URL, not in component state. That makes a filtered view
 * shareable and bookmarkable, survives a refresh, lets the browser Back button undo a
 * filter, and is what allows the dashboard tiles to link to `?status=pending_review`
 * without this page needing to know they exist.
 *
 * Filtering, sorting and pagination all happen in the database — see
 * fetchEnrollmentQueue. The browser never holds more than one page of student PII.
 */
const AdminEnrollments = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => parseEnrollmentQueueFilters(searchParams), [searchParams]);

  const queueQuery = useAdminEnrollments(filters);
  const coursesQuery = useAllCourses();

  /**
   * Any filter change resets to page 1 unless the change *is* a page change. Landing on
   * page 4 of a result set with two pages would otherwise show an empty table.
   */
  const updateFilters = useCallback(
    (next: Partial<EnrollmentQueueFiltersInput>) => {
      const merged: EnrollmentQueueFiltersInput = {
        ...filters,
        ...next,
        page: next.page ?? 1,
      };

      setSearchParams(serializeEnrollmentQueueFilters(merged), { replace: true });
    },
    [filters, setSearchParams],
  );

  const rows = queueQuery.data?.rows ?? [];
  const totalCount = queueQuery.data?.totalCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / ENROLLMENT_PAGE_SIZE));
  const rangeStart = totalCount === 0 ? 0 : (filters.page - 1) * ENROLLMENT_PAGE_SIZE + 1;
  const rangeEnd = Math.min(filters.page * ENROLLMENT_PAGE_SIZE, totalCount);

  const hasActiveFilters =
    filters.status !== "all" || filters.courseId !== "all" || filters.search !== "";

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Enrollments</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Review submitted payments and approve or reject each enrollment.
        </p>
      </div>

      <div className="mt-6">
        <EnrollmentFilters
          filters={filters}
          courses={coursesQuery.data ?? []}
          onChange={updateFilters}
        />
      </div>

      <div className="mt-6">
        {queueQuery.isLoading ? (
          <div className="flex flex-col gap-3" aria-hidden="true">
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
          </div>
        ) : queueQuery.isError ? (
          <AdminStateCard
            icon={AlertTriangle}
            title="Couldn't load enrollments"
            description="Something went wrong reading the enrollment queue. Please try again."
            tone="destructive"
          >
            <Button
              className="btn-premium min-h-11"
              onClick={() => {
                void queueQuery.refetch();
              }}
            >
              Try again
            </Button>
          </AdminStateCard>
        ) : rows.length === 0 ? (
          hasActiveFilters ? (
            <AdminStateCard
              icon={SearchX}
              title="No matching enrollments"
              description="No enrollment matches these filters. Try a different status, course or search term."
            >
              <Button
                variant="outline"
                className="min-h-11 rounded-xl"
                onClick={() =>
                  updateFilters({ status: "all", courseId: "all", search: "", sort: "newest" })
                }
              >
                Clear filters
              </Button>
            </AdminStateCard>
          ) : (
            <AdminStateCard
              icon={Inbox}
              title="No enrollments yet"
              description="When a student submits an enrollment and uploads their payment receipt, it will appear here for review."
            />
          )
        ) : (
          <>
            <EnrollmentTable rows={rows} />

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                Showing {rangeStart}–{rangeEnd} of {totalCount.toLocaleString("en-US")}
              </p>

              {pageCount > 1 ? (
                <nav className="flex items-center gap-2" aria-label="Pagination">
                  <Button
                    variant="outline"
                    className="min-h-11 gap-1 rounded-xl"
                    disabled={filters.page <= 1}
                    onClick={() => updateFilters({ page: filters.page - 1 })}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    Previous
                  </Button>

                  <span className="px-2 text-sm text-muted-foreground">
                    Page {filters.page} of {pageCount}
                  </span>

                  <Button
                    variant="outline"
                    className="min-h-11 gap-1 rounded-xl"
                    disabled={filters.page >= pageCount}
                    onClick={() => updateFilters({ page: filters.page + 1 })}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </nav>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminEnrollments;
