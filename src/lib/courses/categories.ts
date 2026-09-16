import { Building2, Monitor, UserRound, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Course, MentorshipDelivery, MentorshipFormat } from "@/types/course";

/**
 * The mentorship taxonomy, in one place.
 *
 * WHY THIS MODULE EXISTS
 * Four surfaces need to agree on the same four offerings: the /mentorship page's two delivery
 * cards, the two track sections inside whichever card is open, the admin form's two selects,
 * and the URL that remembers which one a visitor picked. Writing "Physical Mentorship" or
 * `"one_on_one"` in four files is how those four drift apart, and a mislabelled select in the
 * admin panel would put a course under a heading it does not belong to. Same instinct as
 * courses/routes.ts, which exists so a path has one definition.
 *
 * The labels here are also the only place the enum values are turned into words. `one_on_one`
 * is a Postgres identifier and must never be rendered; nothing outside this file should be
 * doing that conversion.
 */

/** Where a program is taught, as the page presents it. */
export type DeliveryDescriptor = {
  value: MentorshipDelivery;
  label: string;
  /** One line under the label on the category card. */
  blurb: string;
  icon: LucideIcon;
};

/** How a program is taught, as the page presents it. */
export type FormatDescriptor = {
  value: MentorshipFormat;
  label: string;
  blurb: string;
  icon: LucideIcon;
};

/**
 * The two delivery modes, in the order the page shows them.
 *
 * Physical first, deliberately. It is the option a visitor is least likely to assume exists,
 * and the client's own sentence names it first.
 */
export const MENTORSHIP_DELIVERIES = [
  {
    value: "physical",
    label: "Physical Mentorship",
    blurb: "Learn in person, in the room, with direct hands-on guidance.",
    icon: Building2,
  },
  {
    value: "online",
    label: "Online Mentorship",
    blurb: "Learn from anywhere, with live sessions and the same structured path.",
    icon: Monitor,
  },
] as const satisfies readonly DeliveryDescriptor[];

/** The two tracks that exist inside each delivery mode. */
export const MENTORSHIP_FORMATS = [
  {
    value: "general",
    label: "General Mentorship",
    blurb: "A group program that runs through the full curriculum together.",
    icon: Users,
  },
  {
    value: "one_on_one",
    label: "One-on-One Mentorship",
    blurb: "Private sessions paced entirely around you and your goals.",
    icon: UserRound,
  },
] as const satisfies readonly FormatDescriptor[];

/**
 * A delivery mode's descriptor, or undefined for a value that is not one.
 *
 * Takes `string | null | undefined` rather than `MentorshipDelivery` on purpose: the callers
 * are a query parameter and a database column, and neither can be trusted to hold a label the
 * frontend knows. Returning undefined is what lets the page treat `?delivery=nonsense` as "no
 * selection" rather than crashing on a lookup.
 */
export const findDelivery = (
  value: string | null | undefined,
): DeliveryDescriptor | undefined =>
  MENTORSHIP_DELIVERIES.find((delivery) => delivery.value === value);

export const findFormat = (value: string | null | undefined): FormatDescriptor | undefined =>
  MENTORSHIP_FORMATS.find((format) => format.value === value);

/** One track inside a delivery mode, with the courses that belong to it. */
export type MentorshipTrack = {
  format: FormatDescriptor;
  courses: Course[];
};

/**
 * Courses split by delivery mode, and within each mode by track.
 *
 * `unclassified` is not an oversight bucket, it is a requirement. 013 leaves both columns
 * nullable because there is no honest default for where a course is taught, so every course the
 * client created before this feature existed has no category. Dropping those rows would make a
 * schema change silently unpublish real programs; they render under their own heading instead,
 * and stay enrollable throughout.
 *
 * A course with a delivery but no format is in the same position: it belongs to a delivery mode,
 * but not to either track inside it. It lands in that mode's `unassignedCourses` rather than
 * being forced into "general", for the same reason.
 *
 * Order is preserved from the input array, so the caller's sort (newest first, from
 * fetchPublishedCourses) survives the grouping.
 */
export type MentorshipGrouping = {
  deliveries: {
    delivery: DeliveryDescriptor;
    tracks: MentorshipTrack[];
    /** Courses in this delivery mode whose track is unset. */
    unassignedCourses: Course[];
    /** Every course in this delivery mode, tracked or not. Used for the card's count. */
    totalCourses: number;
  }[];
  /** Courses with no delivery mode at all. */
  unclassified: Course[];
};

export const groupCoursesByCategory = (courses: Course[]): MentorshipGrouping => ({
  deliveries: MENTORSHIP_DELIVERIES.map((delivery) => {
    const inDelivery = courses.filter(
      (course) => course.mentorship_delivery === delivery.value,
    );

    return {
      delivery,
      tracks: MENTORSHIP_FORMATS.map((format) => ({
        format,
        courses: inDelivery.filter((course) => course.mentorship_format === format.value),
      })),
      unassignedCourses: inDelivery.filter((course) => course.mentorship_format === null),
      totalCourses: inDelivery.length,
    };
  }),
  unclassified: courses.filter((course) => course.mentorship_delivery === null),
});
