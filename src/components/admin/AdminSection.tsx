import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type AdminSectionProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Divider and spacing above, for every section after the first on a page. */
  divided?: boolean;
  children: ReactNode;
};

/**
 * A titled block within a single admin page.
 *
 * Used where one page holds two unrelated concerns — payment details beside the enrollment
 * switch, identity beside the password form — and each needs its own heading without being
 * its own route.
 *
 * The content is not wrapped in a filled card on purpose: the inputs inside are `bg-card`,
 * the same token, so a panel in that colour would leave every field defined by its border
 * alone. The heading and the divider carry the separation instead.
 *
 * Renders an `h2`, because the page above it already owns the `h1`.
 */
const AdminSection = ({
  icon: Icon,
  title,
  description,
  divided = false,
  children,
}: AdminSectionProps) => (
  <section className={divided ? "mt-12 border-t border-border pt-12" : undefined}>
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>

    <div className="mt-6">{children}</div>
  </section>
);

export default AdminSection;
