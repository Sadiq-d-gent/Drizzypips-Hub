import type { LucideIcon } from "lucide-react";

import CourseCard from "@/components/courses/CourseCard";
import { Course } from "@/types/course";

/**
 * One track inside a delivery mode: its heading, its one-line description, and its courses.
 *
 * WHY THIS TAKES AN ICON AND LABEL RATHER THAN A FormatDescriptor
 * Because the same section renders the two real tracks *and* the two catch-all groups, which are
 * not formats: courses in a delivery mode with no track set, and courses with no delivery mode at
 * all. 013 leaves both columns nullable, so those two groups are a permanent part of the page
 * rather than a migration artefact, and giving them the same section as a real track is what
 * keeps a course from disappearing because nobody has classified it. A descriptor-shaped prop
 * would have forced two invented enum values to make that work.
 *
 * WHY THE EMPTY STATE DISTINGUISHES ITS TWO CAUSES
 * "Nothing here" and "nothing here matching your search" send a visitor in opposite directions,
 * so `totalCourses` is passed alongside the filtered list. Without it the section would tell
 * someone to clear a filter they never set.
 */

type MentorshipTrackSectionProps = {
  label: string;
  blurb: string;
  icon: LucideIcon;
  /** The courses to render, after the page's search and price filters. */
  courses: Course[];
  /** How many courses this track holds before filtering. See the note above. */
  totalCourses: number;
};

const MentorshipTrackSection = ({
  label,
  blurb,
  icon: Icon,
  courses,
  totalCourses,
}: MentorshipTrackSectionProps) => (
  <section className="min-w-0">
    <div className="flex items-start gap-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-success/10 text-success">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h3 className="text-xl font-bold leading-snug text-foreground sm:text-2xl">{label}</h3>
        <p className="mt-1 text-sm leading-7 text-muted-foreground">{blurb}</p>
      </div>
    </div>

    {courses.length > 0 ? (
      <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {courses.map((course) => (
          <CourseCard key={course.id} course={course} />
        ))}
      </div>
    ) : (
      <p className="mt-6 rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-sm leading-7 text-muted-foreground">
        {totalCourses > 0
          ? "Nothing in this track matches your search. Clear the filters to see it again."
          : "No programs are published in this track yet. Message us and we will tell you when one opens."}
      </p>
    )}
  </section>
);

export default MentorshipTrackSection;
