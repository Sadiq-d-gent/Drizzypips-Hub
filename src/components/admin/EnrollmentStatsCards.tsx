import { CheckCircle2, Clock, Layers, XCircle } from "lucide-react";
import { Link } from "react-router-dom";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ADMIN_ENROLLMENTS_PATH, adminEnrollmentsByStatusPath } from "@/lib/admin/routes";
import { cn } from "@/lib/utils";
import { EnrollmentStats } from "@/types/admin";

type EnrollmentStatsCardsProps = {
  stats: EnrollmentStats | undefined;
  isLoading: boolean;
};

/**
 * Dashboard count tiles.
 *
 * Pending review is deliberately dominant: it is the only count that represents work
 * waiting to be done, and it spans two columns with an accent border so it reads first.
 * The rest are historical record. Every tile links into the queue pre-filtered, so a count
 * is one click from the rows behind it.
 *
 * `cancelled` is included because the enum has it and hiding a status would misstate the
 * total, but nothing in the product sets it yet.
 */
const EnrollmentStatsCards = ({ stats, isLoading }: EnrollmentStatsCardsProps) => {
  const tiles = [
    {
      key: "pending",
      label: "Pending review",
      value: stats?.pendingReview,
      icon: Clock,
      to: adminEnrollmentsByStatusPath("pending_review"),
      emphasis: true,
      tone: "text-warning",
      surface: "border-warning/30 bg-warning/5",
    },
    {
      key: "approved",
      label: "Approved",
      value: stats?.approved,
      icon: CheckCircle2,
      to: adminEnrollmentsByStatusPath("approved"),
      emphasis: false,
      tone: "text-success",
      surface: "border-border bg-card",
    },
    {
      key: "rejected",
      label: "Rejected",
      value: stats?.rejected,
      icon: XCircle,
      to: adminEnrollmentsByStatusPath("rejected"),
      emphasis: false,
      tone: "text-destructive",
      surface: "border-border bg-card",
    },
    {
      key: "total",
      label: "Total enrollments",
      value: stats?.total,
      icon: Layers,
      to: ADMIN_ENROLLMENTS_PATH,
      emphasis: false,
      tone: "text-muted-foreground",
      surface: "border-border bg-card",
    },
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <Link
          key={tile.key}
          to={tile.to}
          className={cn(
            "group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            tile.emphasis && "sm:col-span-2 xl:col-span-2",
          )}
        >
          <Card
            className={cn(
              "h-full rounded-2xl transition-colors group-hover:border-primary/40",
              tile.surface,
            )}
          >
            <CardContent className="flex h-full items-center gap-4 p-5">
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-background/60",
                  tile.tone,
                )}
              >
                <tile.icon className="h-5 w-5" aria-hidden="true" />
              </div>

              <div className="min-w-0">
                <p className="truncate text-sm text-muted-foreground">{tile.label}</p>
                {isLoading || tile.value === undefined ? (
                  <Skeleton className="mt-2 h-8 w-16" />
                ) : (
                  <p
                    className={cn(
                      "mt-1 font-bold tracking-tight text-foreground",
                      tile.emphasis ? "text-4xl" : "text-3xl",
                    )}
                  >
                    {tile.value.toLocaleString("en-US")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}

      {/* Cancelled sits apart from the tiles: a real status, but not a queue anyone works.
          It is stated even at zero — a count that disappears when empty is indistinguishable
          from a count nobody is tracking, and the five statuses should always add up in view. */}
      {!isLoading && stats ? (
        <p className="text-sm text-muted-foreground sm:col-span-2 xl:col-span-4">
          {stats.cancelled.toLocaleString("en-US")} cancelled{" "}
          <Link
            to={adminEnrollmentsByStatusPath("cancelled")}
            className="text-primary underline-offset-4 hover:underline"
          >
            View
          </Link>
        </p>
      ) : null}
    </div>
  );
};

export default EnrollmentStatsCards;
