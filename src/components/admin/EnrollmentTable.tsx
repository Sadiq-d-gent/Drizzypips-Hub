import { format } from "date-fns";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import EnrollmentStatusBadge from "@/components/admin/EnrollmentStatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminEnrollmentDetailPath } from "@/lib/admin/routes";
import { formatCoursePrice } from "@/lib/courses/price";
import { AdminEnrollmentRow } from "@/types/admin";

type EnrollmentTableProps = {
  rows: AdminEnrollmentRow[];
};

const formatSubmitted = (iso: string) => format(new Date(iso), "d MMM yyyy, HH:mm");

/**
 * The review queue.
 *
 * Two renderings of the same rows: a table from `md` up, stacked cards below. A single
 * table with horizontal scroll was the alternative, but nine columns on a 375px screen
 * means the status and the price — the two things being scanned for — are always off
 * screen.
 *
 * Prices use formatCoursePrice with the snapshot's own currency, not the course's current
 * one, so a repriced or re-denominated course cannot change what an old row appears to
 * have cost.
 */
const EnrollmentTable = ({ rows }: EnrollmentTableProps) => {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="whitespace-nowrap">Order</TableHead>
              <TableHead>Student</TableHead>
              <TableHead className="hidden lg:table-cell">Contact</TableHead>
              <TableHead>Course</TableHead>
              <TableHead className="whitespace-nowrap text-right">Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="whitespace-nowrap">Submitted</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className="align-top">
                <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                  {row.order_id}
                </TableCell>

                <TableCell className="max-w-[14rem]">
                  <p className="truncate font-medium text-foreground">{row.student_name}</p>
                  <p className="truncate text-xs text-muted-foreground lg:hidden">
                    {row.student_email}
                  </p>
                </TableCell>

                <TableCell className="hidden max-w-[16rem] lg:table-cell">
                  <p className="truncate text-sm text-foreground">{row.student_email}</p>
                  <p className="truncate text-xs text-muted-foreground">{row.student_phone}</p>
                </TableCell>

                <TableCell className="max-w-[16rem]">
                  <p className="truncate text-sm text-foreground">{row.course_title_snapshot}</p>
                </TableCell>

                <TableCell className="whitespace-nowrap text-right text-sm font-medium text-foreground">
                  {formatCoursePrice(Number(row.price_amount), row.price_currency)}
                </TableCell>

                <TableCell>
                  <EnrollmentStatusBadge status={row.status} />
                </TableCell>

                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {formatSubmitted(row.created_at)}
                </TableCell>

                <TableCell>
                  <Link
                    to={adminEnrollmentDetailPath(row.id)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={`Review enrollment ${row.order_id}`}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              to={adminEnrollmentDetailPath(row.id)}
              className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                  {row.order_id}
                </p>
                <EnrollmentStatusBadge status={row.status} />
              </div>

              <p className="mt-2 truncate font-medium text-foreground">{row.student_name}</p>
              <p className="truncate text-sm text-muted-foreground">{row.student_email}</p>
              <p className="mt-2 truncate text-sm text-foreground">{row.course_title_snapshot}</p>

              <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
                <span className="text-sm font-medium text-foreground">
                  {formatCoursePrice(Number(row.price_amount), row.price_currency)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatSubmitted(row.created_at)}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
};

export default EnrollmentTable;
