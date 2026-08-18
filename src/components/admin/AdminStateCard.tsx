import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AdminStateCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  tone?: "neutral" | "destructive";
  children?: ReactNode;
};

/**
 * Centred message card for admin loading/empty/error states.
 *
 * Deliberately not a reuse of CourseStateCard, which renders an `h1` because each state
 * it shows *is* the page's main subject. Inside the admin layout these states appear
 * beneath a page heading that already owns the `h1`, so this renders a `p` — two `h1`s on
 * one page would misreport the document outline to a screen reader. Everything else
 * matches, so the two look identical.
 */
const AdminStateCard = ({
  icon: Icon,
  title,
  description,
  tone = "neutral",
  children,
}: AdminStateCardProps) => {
  return (
    <Card className="rounded-3xl border-border bg-card shadow-premium">
      <CardContent className="flex flex-col items-center p-8 text-center sm:p-12">
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-2xl",
            tone === "destructive"
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary",
          )}
        >
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>

        <p className="mt-5 text-lg font-semibold tracking-tight text-foreground">{title}</p>

        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>

        {children ? (
          <div className="mt-6 flex flex-wrap justify-center gap-3">{children}</div>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default AdminStateCard;
