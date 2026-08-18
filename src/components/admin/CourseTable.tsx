import { format } from "date-fns";
import { ExternalLink, ImageOff, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import CourseDeleteDialog from "@/components/admin/CourseDeleteDialog";
import CoursePublishToggle from "@/components/admin/CoursePublishToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminCourseEditPath } from "@/lib/admin/routes";
import { formatCoursePrice, isFreeCourse } from "@/lib/courses/price";
import { courseDetailPath } from "@/lib/courses/routes";
import { CourseEnrollmentCounts } from "@/types/admin";
import { Course } from "@/types/course";

type CourseTableProps = {
  courses: Course[];
  /** Undefined while admin_course_stats() is still in flight. */
  counts?: CourseEnrollmentCounts;
};

const formatUpdated = (iso: string) => format(new Date(iso), "d MMM yyyy");

/**
 * The course catalogue, as the admin sees it.
 *
 * Same two-rendering approach as EnrollmentTable: a table from `md` up, cards below.
 *
 * The enrollment count earns its column. It is the difference between "delete" being a
 * button and being a trap — a course with even one enrollment cannot be deleted at all, and
 * knowing that before clicking is the whole point of showing the number here.
 */
const CourseTable = ({ courses, counts }: CourseTableProps) => {
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);

  const renderCount = (courseId: string) => {
    if (!counts) {
      return <span className="text-muted-foreground">—</span>;
    }

    const row = counts[courseId];
    const total = row?.total ?? 0;
    const pending = row?.pending ?? 0;

    if (total === 0) {
      return <span className="text-muted-foreground">None</span>;
    }

    return (
      <span className="inline-flex items-center gap-2">
        <span className="font-medium text-foreground">{total}</span>
        {pending > 0 ? (
          <Badge
            variant="outline"
            className="border-warning/30 bg-warning/10 text-warning"
            title={`${pending} awaiting review`}
          >
            {pending} pending
          </Badge>
        ) : null}
      </span>
    );
  };

  const renderPrice = (course: Course) =>
    isFreeCourse(Number(course.price))
      ? "Free"
      : formatCoursePrice(Number(course.price), course.currency);

  const renderThumbnail = (course: Course, className: string) =>
    course.thumbnail_url ? (
      <img
        src={course.thumbnail_url}
        alt=""
        className={`${className} object-cover`}
        loading="lazy"
      />
    ) : (
      <div className={`${className} flex items-center justify-center text-muted-foreground`}>
        <ImageOff className="h-4 w-4" aria-hidden="true" />
      </div>
    );

  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-24">
                <span className="sr-only">Thumbnail</span>
              </TableHead>
              <TableHead>Course</TableHead>
              <TableHead className="whitespace-nowrap text-right">Price</TableHead>
              <TableHead className="whitespace-nowrap">Enrollments</TableHead>
              <TableHead className="whitespace-nowrap">Published</TableHead>
              <TableHead className="hidden whitespace-nowrap lg:table-cell">Updated</TableHead>
              <TableHead className="w-24 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {courses.map((course) => (
              <TableRow key={course.id} className="align-middle">
                <TableCell>
                  {renderThumbnail(
                    course,
                    "h-12 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted",
                  )}
                </TableCell>

                <TableCell className="max-w-[20rem]">
                  <Link
                    to={adminCourseEditPath(course.id)}
                    className="block truncate font-medium text-foreground hover:text-primary"
                  >
                    {course.title}
                  </Link>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    /{course.slug}
                  </p>
                </TableCell>

                <TableCell className="whitespace-nowrap text-right text-sm font-medium text-foreground">
                  {renderPrice(course)}
                </TableCell>

                <TableCell className="whitespace-nowrap text-sm">
                  {renderCount(course.id)}
                </TableCell>

                <TableCell>
                  <CoursePublishToggle course={course} />
                </TableCell>

                <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground lg:table-cell">
                  {formatUpdated(course.updated_at)}
                </TableCell>

                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {course.published ? (
                      <a
                        href={courseDetailPath(course.slug)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label={`View ${course.title} on the site`}
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      </a>
                    ) : null}

                    <Link
                      to={adminCourseEditPath(course.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label={`Edit ${course.title}`}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Link>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(course)}
                      aria-label={`Delete ${course.title}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {courses.map((course) => (
          <li
            key={course.id}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <div className="flex items-start gap-3">
              {renderThumbnail(
                course,
                "h-14 w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-muted",
              )}

              <div className="min-w-0 flex-1">
                <Link
                  to={adminCourseEditPath(course.id)}
                  className="block truncate font-medium text-foreground"
                >
                  {course.title}
                </Link>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  /{course.slug}
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {renderPrice(course)}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-sm text-muted-foreground">
                {renderCount(course.id)}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {course.published ? "Published" : "Draft"}
                </span>
                <CoursePublishToggle course={course} />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild variant="outline" className="min-h-11 flex-1 gap-2 rounded-xl">
                <Link to={adminCourseEditPath(course.id)}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Edit
                </Link>
              </Button>

              {course.published ? (
                <Button asChild variant="outline" className="min-h-11 gap-2 rounded-xl">
                  <a
                    href={courseDetailPath(course.slug)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`View ${course.title} on the site`}
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                </Button>
              ) : null}

              <Button
                type="button"
                variant="ghost"
                className="min-h-11 gap-2 rounded-xl text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteTarget(course)}
                aria-label={`Delete ${course.title}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {deleteTarget ? (
        <CourseDeleteDialog
          course={deleteTarget}
          counts={counts?.[deleteTarget.id]}
          open
          onOpenChange={(next) => {
            if (!next) {
              setDeleteTarget(null);
            }
          }}
        />
      ) : null}
    </>
  );
};

export default CourseTable;
