import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { DeliveryDescriptor } from "@/lib/courses/categories";

/**
 * The first choice a visitor makes on /mentorship: physical or online.
 *
 * WHY TWO CARDS AND NOT A FILTER DROPDOWN
 * The page used to be one flat grid of every published course, which is why a visitor could not
 * tell that mentorship comes in two settings at all. That is a navigation problem, not a
 * filtering one: the two settings are the product, so they are the page's first screen, and the
 * tracks inside them are the second. A dropdown would leave the structure invisible until
 * someone opened it.
 *
 * WHY A BUTTON RATHER THAN A LINK
 * The choice is a query parameter on this same page, not a route, so there is no separate
 * document to link to. The page pushes `?delivery=` and the browser's back button steps out
 * again, which is the behaviour a link would have given us without the router unmounting and
 * refetching the catalogue. Same reason the enrollment wizard keeps its step in `?step=`.
 */

/** One delivery mode with the number of published courses under it. */
export type DeliveryOption = {
  delivery: DeliveryDescriptor;
  courseCount: number;
};

type MentorshipCategoryCardsProps = {
  options: DeliveryOption[];
  onSelect: (delivery: DeliveryDescriptor) => void;
};

/**
 * A count of zero is shown, not hidden.
 *
 * Both settings exist whether or not a course is published under one today, and a card that
 * quietly disappeared would tell a visitor looking for in-person mentorship that there is none,
 * which is a different claim. The card still opens: the section behind it says plainly that
 * nothing is published yet and offers WhatsApp, which is the honest answer and reuses the empty
 * branch the page needs for a filtered-to-nothing track anyway.
 */
const describeCount = (courseCount: number): string => {
  if (courseCount === 0) {
    return "No programs published yet";
  }

  return `${courseCount} ${courseCount === 1 ? "program" : "programs"}`;
};

const MentorshipCategoryCards = ({ options, onSelect }: MentorshipCategoryCardsProps) => (
  <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
    {options.map(({ delivery, courseCount }) => {
      const Icon = delivery.icon;

      return (
        <button
          key={delivery.value}
          type="button"
          onClick={() => onSelect(delivery)}
          className={cn(
            "group flex min-w-0 flex-col rounded-3xl border border-border bg-card p-6 text-left shadow-premium",
            "transition-all duration-300 hover:-translate-y-1 hover:border-primary/60 hover:shadow-2xl sm:p-8",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
            <Icon className="h-7 w-7" aria-hidden="true" />
          </span>

          <span className="mt-6 text-2xl font-bold leading-snug text-foreground">
            {delivery.label}
          </span>

          <span className="mt-3 text-sm leading-7 text-muted-foreground">{delivery.blurb}</span>

          <span className="mt-6 flex items-center justify-between gap-4 border-t border-border pt-5">
            <span className="text-sm font-medium text-muted-foreground">
              {describeCount(courseCount)}
            </span>
            <span className="flex items-center gap-2 text-sm font-semibold text-primary">
              View programs
              <ArrowRight
                className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                aria-hidden="true"
              />
            </span>
          </span>
        </button>
      );
    })}
  </div>
);

export default MentorshipCategoryCards;
