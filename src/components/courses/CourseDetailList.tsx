import { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

type CourseDetailListProps = {
  title: string;
  items: string[];
  icon: LucideIcon;
  emptyMessage: string;
  headingId: string;
};

/**
 * "What you'll learn" / "Requirements" panel.
 *
 * `learnings` and `requirements` are `text[] not null default '{}'`, so an empty array is
 * a legitimate value rather than missing data. The panel keeps its heading and explains
 * the absence instead of collapsing, which would make the two-column layout jump.
 */
const CourseDetailList = ({ title, items, icon: Icon, emptyMessage, headingId }: CourseDetailListProps) => {
  return (
    <Card className="rounded-3xl border-border bg-card shadow-premium">
      <CardContent className="p-6 sm:p-8">
        <h2 id={headingId} className="text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h2>

        {items.length > 0 ? (
          <ul className="mt-6 space-y-4" aria-labelledby={headingId}>
            {items.map((item) => (
              <li key={item} className="flex gap-3 text-base leading-7 text-muted-foreground">
                <Icon className="mt-1 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-base leading-7 text-muted-foreground">{emptyMessage}</p>
        )}
      </CardContent>
    </Card>
  );
};

export default CourseDetailList;
