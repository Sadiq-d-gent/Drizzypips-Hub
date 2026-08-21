import { CalendarClock } from "lucide-react";
import { useEffect, useState } from "react";

import { countdownBreakdown, formatSessionMoment } from "@/lib/website/countdown";
import type { CountdownBreakdown } from "@/lib/website/countdown";
import type { WebsiteCountdown } from "@/types/website";

/**
 * The countdown to the next live mentorship session, in the homepage hero.
 *
 * WHY THIS COMPONENT DECIDES NOTHING
 * Whether there is a countdown at all is resolveWebsiteSettings' answer, not this file's: the
 * switch being off, the moment being unset, an unreadable value and a failed query all arrive
 * here as `countdown: null`. So the disabled path is one falsy check rather than four, and the
 * admin form's preview vanishes under exactly the conditions a visitor's does.
 *
 * WHY THE OUTER COMPONENT IS A SEPARATE ONE
 * The null check cannot live in the same component as the interval, because a hook may not run
 * conditionally. Splitting them keeps the "render nothing" contract inside this module — where
 * a reader looking for it will look — instead of pushing it into HomeHero's JSX.
 *
 * WHAT IT LOOKS LIKE, AND WHY
 * The hero's own glass idiom — `border-white/10`, `bg-white/[0.07]`, `backdrop-blur` — reused
 * rather than re-invented, so the card reads as part of the hero and not as an announcement bar
 * dropped into it. Four cells in a fixed four-column grid at every width: at 375px that is
 * about 79px per cell, which fits a two-digit number at `text-2xl` and its label, and stacking
 * or hiding units would mean a visitor on a phone could not see the same information as one on
 * a laptop.
 */

type MentorshipCountdownProps = {
  /** Resolved content, or null when there is nothing to count down to. */
  countdown: WebsiteCountdown | null;
};

/** How often the card recomputes. One second, because it shows seconds. */
const TICK_MS = 1000;

/**
 * The four numbers, kept current.
 *
 * Recomputed from the clock on every tick rather than decremented, which matters more than it
 * looks: a backgrounded tab has its timers throttled to once a minute or stopped outright, so a
 * counter that subtracted one per tick would come back minutes behind and count down to a
 * moment that had already passed. Reading `Date.now()` each time makes the interval a repaint
 * schedule rather than the source of truth, and a tab that slept through the session shows the
 * arrival state the moment it wakes.
 *
 * The interval clears itself once the moment lands, so a page left open on a finished countdown
 * is not re-rendering once a second forever.
 */
const useCountdown = (targetAt: string): CountdownBreakdown => {
  const [breakdown, setBreakdown] = useState<CountdownBreakdown>(() =>
    countdownBreakdown(targetAt, Date.now()),
  );

  useEffect(() => {
    // Recomputed immediately as well as on the interval: `targetAt` may have changed since the
    // initial state was computed — an admin saving a new date invalidates the shared query and
    // this prop arrives updated — and waiting a second to reflect it would show the old moment.
    setBreakdown(countdownBreakdown(targetAt, Date.now()));

    const id = window.setInterval(() => {
      const next = countdownBreakdown(targetAt, Date.now());

      setBreakdown(next);

      if (next.reached) {
        window.clearInterval(id);
      }
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, [targetAt]);

  return breakdown;
};

/**
 * The four units, in the order they are read.
 *
 * Days are not padded — a three-digit figure is legitimate two months out, and a leading zero
 * on "07 days" reads like a clock rather than a calendar. The other three are, because a jump
 * between one and two digits every tenth second is the jitter `tabular-nums` exists to avoid.
 */
const unitCells = (breakdown: CountdownBreakdown) =>
  [
    { label: "Days", value: String(breakdown.days) },
    { label: "Hours", value: String(breakdown.hours).padStart(2, "0") },
    { label: "Minutes", value: String(breakdown.minutes).padStart(2, "0") },
    { label: "Seconds", value: String(breakdown.seconds).padStart(2, "0") },
  ] as const;

/** The remaining time as one sentence, for a screen reader. */
const describeRemaining = (breakdown: CountdownBreakdown): string =>
  `${breakdown.days} days, ${breakdown.hours} hours, ${breakdown.minutes} minutes and ` +
  `${breakdown.seconds} seconds until the next session.`;

const CountdownCard = ({ countdown }: { countdown: WebsiteCountdown }) => {
  const breakdown = useCountdown(countdown.targetAt);
  const moment = formatSessionMoment(countdown.targetAt);

  return (
    <div
      /**
       * `role="timer"` with no `aria-live`, deliberately. An `aria-live` region here would
       * announce a new number every second and make the page unusable with a screen reader; the
       * role marks what this is, and the sr-only sentence below gives the same information to
       * anyone who navigates to it.
       */
      role="timer"
      className="mt-8 w-full max-w-xl rounded-2xl border border-white/10 bg-white/[0.07] p-4 shadow-premium backdrop-blur sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
          <CalendarClock className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          {countdown.title}
        </span>
        {moment ? (
          <span className="text-xs text-slate-300 sm:text-sm">{moment}</span>
        ) : null}
      </div>

      {breakdown.reached ? (
        /*
          The arrival state, and the reason the breakdown carries a `reached` flag rather than
          four zeroes for the hero to interpret. Counting past the moment into negative numbers
          is the failure this replaces; so is a card that silently disappears at the very moment
          the people it was for are arriving.
        */
        <p className="mt-4 flex items-center gap-2.5 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-base font-semibold text-white">
          <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
          </span>
          Session is starting
        </p>
      ) : (
        <>
          {/*
            Hidden from assistive technology as a grid of loose numbers, and replaced by the
            sentence below it. Four labelled cells read out in sequence, once a second, is noise.
          */}
          <div className="mt-4 grid grid-cols-4 gap-2 sm:gap-3" aria-hidden="true">
            {unitCells(breakdown).map((unit) => (
              <div
                key={unit.label}
                className="min-w-0 rounded-xl border border-white/10 bg-slate-950/50 px-1 py-3 text-center"
              >
                <div className="text-2xl font-bold tabular-nums leading-none text-white sm:text-3xl">
                  {unit.value}
                </div>
                <div className="mt-1.5 text-[0.625rem] uppercase tracking-wide text-slate-400 sm:text-xs">
                  {unit.label}
                </div>
              </div>
            ))}
          </div>

          <span className="sr-only">{describeRemaining(breakdown)}</span>
        </>
      )}
    </div>
  );
};

const MentorshipCountdown = ({ countdown }: MentorshipCountdownProps) => {
  if (!countdown) {
    return null;
  }

  return <CountdownCard countdown={countdown} />;
};

export default MentorshipCountdown;
