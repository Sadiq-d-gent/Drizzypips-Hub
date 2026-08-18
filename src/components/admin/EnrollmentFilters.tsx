import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ADMIN_SEARCH_DEBOUNCE_MS,
  ENROLLMENT_SORT_OPTIONS,
  ENROLLMENT_STATUS_FILTER_OPTIONS,
} from "@/lib/constants/admin";
import { EnrollmentQueueFiltersInput } from "@/lib/validation/admin.schema";
import { Course } from "@/types/course";

type EnrollmentFiltersProps = {
  filters: EnrollmentQueueFiltersInput;
  courses: Course[];
  onChange: (next: Partial<EnrollmentQueueFiltersInput>) => void;
};

/**
 * Queue filter bar.
 *
 * The search box keeps its own state and reports upward on a timer, because every reported
 * change is a database round trip and a new react-query cache entry. The effect resets when
 * `filters.search` changes from outside — clearing filters, or arriving with a `q` already
 * in the URL — so the input never drifts from the applied filter.
 *
 * Filtering is applied in the database, not to a page of rows in the browser: the queue is
 * paginated, so filtering client-side would only ever search the current 20 rows.
 */
const EnrollmentFilters = ({ filters, courses, onChange }: EnrollmentFiltersProps) => {
  const [searchDraft, setSearchDraft] = useState(filters.search);

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (searchDraft === filters.search) {
      return;
    }

    const timer = window.setTimeout(() => {
      onChange({ search: searchDraft });
    }, ADMIN_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [searchDraft, filters.search, onChange]);

  const hasFilters =
    filters.status !== "all" ||
    filters.courseId !== "all" ||
    filters.search !== "" ||
    filters.sort !== "newest";

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="relative flex-1 lg:max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="Search order ID or email"
          aria-label="Search enrollments by order ID or email"
          className="h-11 rounded-xl border-border bg-card pl-9"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:flex lg:items-center">
        <Select value={filters.status} onValueChange={(value) => onChange({ status: value as EnrollmentQueueFiltersInput["status"] })}>
          <SelectTrigger className="h-11 rounded-xl border-border bg-card lg:w-[11rem]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENROLLMENT_STATUS_FILTER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.courseId} onValueChange={(value) => onChange({ courseId: value })}>
          <SelectTrigger className="h-11 rounded-xl border-border bg-card lg:w-[13rem]" aria-label="Filter by course">
            <SelectValue placeholder="All courses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All courses</SelectItem>
            {courses.map((course) => (
              <SelectItem key={course.id} value={course.id}>
                {course.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.sort} onValueChange={(value) => onChange({ sort: value as EnrollmentQueueFiltersInput["sort"] })}>
          <SelectTrigger className="h-11 rounded-xl border-border bg-card lg:w-[11rem]" aria-label="Sort order">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENROLLMENT_SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasFilters ? (
        <Button
          variant="ghost"
          onClick={() =>
            onChange({ status: "all", courseId: "all", search: "", sort: "newest", page: 1 })
          }
          className="min-h-11 shrink-0 gap-2 rounded-xl text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Clear
        </Button>
      ) : null}
    </div>
  );
};

export default EnrollmentFilters;
