import { Search, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRICE_RANGE_OPTIONS } from "@/lib/courses/filters";
import { cn } from "@/lib/utils";
import { CourseFilters as CourseFiltersState } from "@/types/course";

type CourseFiltersProps = {
  filters: CourseFiltersState;
  onChange: (filters: CourseFiltersState) => void;
  gridId: string;
};

/**
 * Filter bar for the course catalogue.
 *
 * Search is a labeled text input. The price controls are rendered as toggle buttons
 * carrying aria-pressed (as a single-choice group, aria-pressed expresses the state
 * the way a toggle button is expected to). The result count below the inputs is
 * announced to screen readers after every change via aria-live.
 */
const CourseFilters = ({ filters, onChange, gridId }: CourseFiltersProps) => {
  const updateQuery = (query: string) => onChange({ ...filters, query });
  const updatePriceRange = (priceRange: CourseFiltersState["priceRange"]) => onChange({ ...filters, priceRange });

  return (
    <div className="mt-12">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="w-full max-w-md">
          <Label htmlFor="course-search" className="sr-only">
            Search courses
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="course-search"
              type="search"
              autoComplete="off"
              placeholder="Search courses…"
              value={filters.query}
              onChange={(event) => updateQuery(event.target.value)}
              aria-controls={gridId}
              className="h-12 rounded-2xl border-border bg-card pl-11 shadow-premium"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <SlidersHorizontal className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
          <div
            role="group"
            aria-label="Filter courses by price"
            className="flex shrink-0 gap-2"
          >
            {PRICE_RANGE_OPTIONS.map((option) => {
              const isActive = filters.priceRange === option.value;

              return (
                <Button
                  key={option.value}
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={isActive}
                  onClick={() => updatePriceRange(option.value)}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium transition-all duration-300",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground shadow-glow hover:bg-primary-hover hover:text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-foreground",
                  )}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CourseFilters;
