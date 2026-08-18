import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading placeholder shaped to match the course detail layout, so the page does not
 * reflow when the course arrives. Decorative — the live region announces loading.
 */
const CourseDetailSkeleton = () => {
  return (
    <div aria-hidden="true">
      <Skeleton className="h-5 w-44" />

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <Skeleton className="aspect-[16/9] w-full rounded-3xl" />

          <Skeleton className="mt-8 h-10 w-4/5" />
          <Skeleton className="mt-3 h-10 w-2/5" />

          <div className="mt-6 space-y-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-11/12" />
          </div>

          <Card className="mt-10 rounded-3xl border-border bg-card shadow-premium">
            <CardContent className="space-y-3 p-6 sm:p-8">
              <Skeleton className="h-8 w-52" />
              <Skeleton className="mt-4 h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {Array.from({ length: 2 }, (_, index) => (
              <Card key={index} className="rounded-3xl border-border bg-card shadow-premium">
                <CardContent className="space-y-4 p-6 sm:p-8">
                  <Skeleton className="h-8 w-40" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-11/12" />
                  <Skeleton className="h-4 w-4/5" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Card className="h-fit rounded-3xl border-border bg-card shadow-premium">
          <CardContent className="p-6 sm:p-8">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="mt-3 h-10 w-32" />
            <Skeleton className="mt-6 h-4 w-full" />
            <Skeleton className="mt-3 h-4 w-2/3" />
            <Skeleton className="mt-8 h-12 w-full rounded-xl" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CourseDetailSkeleton;
