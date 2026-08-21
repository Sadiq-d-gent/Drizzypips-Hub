/**
 * The countdown's date arithmetic, as pure functions.
 *
 * WHY THIS IS ITS OWN MODULE AND NOT PART OF THE COMPONENT
 * Three separate places need the same answers and must not disagree: the admin form (which
 * turns two inputs into a moment, and a stored moment back into two inputs), the write path
 * in saveWebsiteSettings (which stores that moment), and the hero (which counts down to it).
 * Putting the arithmetic beside resolveWebsiteSettings — a pure function over a row, for the
 * same reason — means the admin can preview the countdown through the very code a visitor
 * runs, which is the habit WebsiteSettingsForm already follows for every other field.
 *
 * TWO FORM INPUTS, ONE STORED INSTANT
 * `website_settings.countdown_session_at` is a single `timestamptz`, because a live session
 * happens at one instant and every visitor has to reach zero when it actually starts — see
 * 012_add_mentorship_countdown.sql for why two columns would make the session appear to
 * begin twice in two timezones. The administrator still types a date and a time, so the
 * conversion has to live somewhere; it lives here, and `combineSessionDateTime` reads them
 * in the administrator's own timezone, which is what `formatSessionMoment` then shows back to
 * them with its name attached so the assumption is visible rather than silent.
 */

/** `YYYY-MM-DD`, the value shape of `<input type="date">`. */
export const SESSION_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `HH:MM`, the value shape of `<input type="time">` — with optional seconds, which some
 * browsers append when `step` allows them. Seconds are parsed and then ignored: a session
 * starts on the minute, and a countdown to :30 past would read as a broken clock.
 */
export const SESSION_TIME_PATTERN = /^\d{2}:\d{2}(:\d{2})?$/;

/** The two halves of the session moment, as the form holds them. */
export type SessionDateTime = {
  date: string;
  time: string;
};

const pad = (value: number): string => String(value).padStart(2, "0");

/**
 * The two form fields as one instant, or null when they do not make one.
 *
 * Null covers every case the caller must not distinguish: either field blank, either field
 * malformed, and — the one that a regex cannot catch — a date that does not exist. `new
 * Date(2026, 1, 30)` does not throw, it silently becomes 2 March, so the parts are read back
 * off the constructed date and compared. That check is why the schema can rely on this
 * function rather than restating a calendar in Zod.
 *
 * Built with the local-time `Date` constructor on purpose: the administrator typed a wall
 * clock time, and `2026-09-05T20:00` means 8pm where they are, not 8pm UTC.
 */
export const combineSessionDateTime = (
  date: string | null | undefined,
  time: string | null | undefined,
): string | null => {
  const trimmedDate = date?.trim() ?? "";
  const trimmedTime = time?.trim() ?? "";

  if (!SESSION_DATE_PATTERN.test(trimmedDate) || !SESSION_TIME_PATTERN.test(trimmedTime)) {
    return null;
  }

  const [year, month, day] = trimmedDate.split("-").map(Number);
  const [hours, minutes] = trimmedTime.split(":").map(Number);

  if (hours > 23 || minutes > 59) {
    return null;
  }

  const moment = new Date(year, month - 1, day, hours, minutes, 0, 0);

  if (Number.isNaN(moment.getTime())) {
    return null;
  }

  // The rollover guard. Also rejects a two-digit year, which the Date constructor maps into
  // the 1900s — `new Date(26, ...)` is 1926, and getFullYear() then disagrees with 26.
  if (
    moment.getFullYear() !== year ||
    moment.getMonth() !== month - 1 ||
    moment.getDate() !== day
  ) {
    return null;
  }

  return moment.toISOString();
};

/**
 * A stored instant as the two form fields, in the administrator's timezone.
 *
 * The exact inverse of `combineSessionDateTime`, so loading the form and saving it again
 * without touching anything stores the same moment. Blank pairs for null or for a value that
 * is not a date, because a form field cannot show "unparseable" — and a blank pair is the
 * "no countdown" state, which the schema then refuses to combine with the switch on.
 */
export const splitSessionDateTime = (iso: string | null | undefined): SessionDateTime => {
  if (!iso) {
    return { date: "", time: "" };
  }

  const moment = new Date(iso);

  if (Number.isNaN(moment.getTime())) {
    return { date: "", time: "" };
  }

  return {
    date: `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`,
    time: `${pad(moment.getHours())}:${pad(moment.getMinutes())}`,
  };
};

/**
 * What the hero renders: four numbers, or the fact that the moment has arrived.
 *
 * `reached` is a field rather than something the consumer derives from four zeroes, because
 * the two states are visually different — the card swaps the digits for "Session is
 * starting" — and "all four are zero" is also true for the second before the moment lands.
 */
export type CountdownBreakdown = {
  reached: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * 60;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

/**
 * The gap between now and the target, split into units and never negative.
 *
 * `now` is a parameter rather than a call to `Date.now()` inside, which is what makes this
 * testable and what lets the admin form show "counts down for another 3 days" from the same
 * function the hero ticks on.
 *
 * A target already passed returns `reached: true` with four zeroes rather than negative
 * numbers — the requirement the whole "Session is starting" state exists for. An unparseable
 * target does the same: the resolver has already ruled that out, and inventing a duration for
 * a value we cannot read would be worse than saying the moment is here.
 *
 * Truncating rather than rounding, so the last whole second shows `0` for its duration and
 * then flips — which is how a clock reads.
 */
export const countdownBreakdown = (
  targetAt: string,
  now: number,
): CountdownBreakdown => {
  const target = new Date(targetAt).getTime();
  const remaining = Number.isNaN(target) ? 0 : target - now;

  if (remaining <= 0) {
    return { reached: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const totalSeconds = Math.floor(remaining / MS_PER_SECOND);

  return {
    reached: false,
    days: Math.floor(totalSeconds / SECONDS_PER_DAY),
    hours: Math.floor(totalSeconds / SECONDS_PER_HOUR) % 24,
    minutes: Math.floor(totalSeconds / SECONDS_PER_MINUTE) % SECONDS_PER_MINUTE,
    seconds: totalSeconds % SECONDS_PER_MINUTE,
  };
};

/**
 * The session moment as a sentence, in the reader's own timezone.
 *
 * Shown under the countdown in the hero and beside the two inputs in the admin form. The
 * timezone name is included deliberately in both places: in the hero because a visitor
 * abroad needs to know 8pm is not their 8pm, and in the form because it is the only visible
 * confirmation that the date and time an administrator typed were read as local.
 *
 * `undefined` as the locale, so the browser's own formatting is used rather than a locale
 * this project has picked for everyone. Returns `""` for a value that is not a date; every
 * caller already treats an empty string as "print nothing".
 */
export const formatSessionMoment = (iso: string): string => {
  const moment = new Date(iso);

  if (Number.isNaN(moment.getTime())) {
    return "";
  }

  return moment.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
};
