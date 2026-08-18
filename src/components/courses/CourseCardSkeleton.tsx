import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading placeholder shaped to match CourseCard, so the grid does not reflow when
 * real data arrives. Decorative — the live region on the catalogue announces loading.
 */
const CourseCardSkeleton = () => {
  return (
    <Card
      aria-hidden="true"
      className="flex h-full flex-col overflow-hidden rounded-3xl border-border bg-card shadow-premium"
    >
      <Skeleton className="aspect-[16/10] w-full rounded-none" />

      <CardContent className="flex flex-1 flex-col p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-16" />
        </div>

        <Skeleton className="h-6 w-4/5" />
        <Skeleton className="mt-2 h-6 w-2/5" />

        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/5" />
        </div>

        <Skeleton className="mt-5 h-4 w-28" />

        <div className="mt-auto pt-5">
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </CardContent>
    </Card>
  );
};

export default CourseCardSkeleton;
