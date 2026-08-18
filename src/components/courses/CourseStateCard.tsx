import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type CourseStateCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  tone?: "neutral" | "destructive";
  children?: ReactNode;
};

/**
 * Centred message card for the non-populated course states (not found, error,
 * enrollment placeholder). Renders an h1 because each state is the page's main
 * subject when it is shown.
 */
const CourseStateCard = ({
  icon: Icon,
  title,
  description,
  tone = "neutral",
  children,
}: CourseStateCardProps) => {
  return (
    <Card className="mx-auto max-w-2xl rounded-3xl border-border bg-card shadow-premium">
      <CardContent className="flex flex-col items-center p-8 text-center sm:p-12">
        <div
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-2xl",
            tone === "destructive"
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary",
          )}
        >
          <Icon className="h-7 w-7" aria-hidden="true" />
        </div>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground">{title}</h1>

        <p className="mt-3 max-w-xl leading-7 text-muted-foreground">{description}</p>

        {children ? <div className="mt-8 flex flex-wrap justify-center gap-3">{children}</div> : null}
      </CardContent>
    </Card>
  );
};

export default CourseStateCard;
