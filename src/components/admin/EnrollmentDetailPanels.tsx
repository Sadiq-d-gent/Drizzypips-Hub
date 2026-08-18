import { format } from "date-fns";
import { AlertTriangle, BookOpen, FileText, Mail, Phone, User } from "lucide-react";
import { ReactNode } from "react";
import { Link } from "react-router-dom";

import EnrollmentStatusBadge from "@/components/admin/EnrollmentStatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { courseDetailPath } from "@/lib/courses/routes";
import { formatCoursePrice } from "@/lib/courses/price";
import { AdminEnrollmentDetail } from "@/types/admin";

const formatTimestamp = (iso: string | null) =>
  iso ? format(new Date(iso), "d MMM yyyy, HH:mm") : "—";

/**
 * Price with its currency always legible.
 *
 * `formatCoursePrice` delegates to Intl, which decides for itself whether to print a symbol
 * or the code: NGN in en-US comes out as "NGN 150,000" but USD comes out as "$149". Scope
 * requires the currency to be visible either way, so the code is appended only when Intl has
 * not already shown it — otherwise the panel reads "NGN 150,000 NGN".
 */
const priceWithCurrency = (amount: number, currency: string) => {
  const formatted = formatCoursePrice(amount, currency);
  const code = (currency?.trim().toUpperCase() || "USD");
  return { formatted, code: formatted.toUpperCase().includes(code) ? null : code };
};

/** One panel. `h2` because the page's `h1` is the order ID heading. */
const Panel = ({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof User;
  children: ReactNode;
}) => (
  <Card className="rounded-2xl border-border bg-card">
    <CardContent className="p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {title}
      </h2>
      <dl className="mt-4 flex flex-col gap-4">{children}</dl>
    </CardContent>
  </Card>
);

/** `break-words` throughout: emails and notes are arbitrary student input. */
const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className="mt-1 break-words text-sm text-foreground">{children}</dd>
  </div>
);

export const StudentPanel = ({ enrollment }: { enrollment: AdminEnrollmentDetail }) => (
  <Panel title="Student" icon={User}>
    <Field label="Name">{enrollment.student_name}</Field>

    <Field label="Email">
      <a
        href={`mailto:${enrollment.student_email}`}
        className="inline-flex items-center gap-2 text-primary underline-offset-4 hover:underline"
      >
        <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {enrollment.student_email}
      </a>
    </Field>

    <Field label="WhatsApp">
      <a
        href={`tel:${enrollment.student_phone}`}
        className="inline-flex items-center gap-2 text-primary underline-offset-4 hover:underline"
      >
        <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {enrollment.student_phone}
      </a>
    </Field>

    <Field label="Student note">
      {enrollment.student_note ? (
        <span className="whitespace-pre-wrap">{enrollment.student_note}</span>
      ) : (
        <span className="text-muted-foreground">None</span>
      )}
    </Field>
  </Panel>
);

/**
 * The enrollment record.
 *
 * Every course value here is a snapshot column, and the panel says so. These are what the
 * student agreed to at submission time; they are never overwritten, and the comparison
 * against the live course happens in CoursePanel below.
 */
export const EnrollmentPanel = ({ enrollment }: { enrollment: AdminEnrollmentDetail }) => (
  <Panel title="Enrollment" icon={FileText}>
    <Field label="Order ID">
      <span className="font-mono text-xs">{enrollment.order_id}</span>
    </Field>

    <Field label="Status">
      <EnrollmentStatusBadge status={enrollment.status} />
    </Field>

    <Field label="Course at submission">
      {enrollment.course_title_snapshot}
      <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
        {enrollment.course_slug_snapshot}
      </span>
    </Field>

    <Field label="Price agreed">
      {(() => {
        const { formatted, code } = priceWithCurrency(
          Number(enrollment.price_amount),
          enrollment.price_currency,
        );
        return (
          <>
            {formatted}
            {code ? <span className="ml-2 text-xs text-muted-foreground">{code}</span> : null}
          </>
        );
      })()}
    </Field>

    <Field label="Submitted">{formatTimestamp(enrollment.created_at)}</Field>

    <Field label="Last updated">{formatTimestamp(enrollment.updated_at)}</Field>

    {enrollment.reviewed_at ? (
      <Field label="Reviewed">{formatTimestamp(enrollment.reviewed_at)}</Field>
    ) : null}

    {enrollment.admin_note ? (
      <Field label="Admin note">
        <span className="whitespace-pre-wrap">{enrollment.admin_note}</span>
        <span className="mt-1 block text-xs text-muted-foreground">
          Internal only — never shown to the student.
        </span>
      </Field>
    ) : null}
  </Panel>
);

/**
 * The course as it stands today, against the enrollment's snapshot.
 *
 * Reads through the existing "Admins can read all courses" policy, which is why an
 * unpublished course still resolves here. Where a value has changed since submission it is
 * called out explicitly — the point is to let an administrator notice that a price was
 * edited after a student paid, not to quietly present today's figure as the agreed one.
 * The snapshot in EnrollmentPanel remains authoritative in every case.
 */
export const CoursePanel = ({ enrollment }: { enrollment: AdminEnrollmentDetail }) => {
  const course = enrollment.current_course;

  if (!course) {
    return (
      <Panel title="Course today" icon={BookOpen}>
        <p className="text-sm text-muted-foreground">
          The course record for this enrollment could not be read. The snapshot above is
          still the authoritative record of what was purchased.
        </p>
      </Panel>
    );
  }

  const titleChanged = course.title !== enrollment.course_title_snapshot;
  const slugChanged = course.slug !== enrollment.course_slug_snapshot;
  const priceChanged =
    Number(course.price) !== Number(enrollment.price_amount) ||
    course.currency !== enrollment.price_currency;

  return (
    <Panel title="Course today" icon={BookOpen}>
      <Field label="Title">
        {course.title}
        {titleChanged ? (
          <span className="mt-1 flex items-start gap-1.5 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Changed since submission — was “{enrollment.course_title_snapshot}”
          </span>
        ) : null}
      </Field>

      <Field label="Price">
        {formatCoursePrice(Number(course.price), course.currency)}
        {priceChanged ? (
          <span className="mt-1 flex items-start gap-1.5 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Changed since submission — student agreed to{" "}
            {formatCoursePrice(Number(enrollment.price_amount), enrollment.price_currency)}
          </span>
        ) : null}
      </Field>

      <Field label="Published">
        {course.published ? "Yes" : "No — not visible to students"}
      </Field>

      <Field label="Public page">
        {course.published ? (
          <Link
            to={courseDetailPath(course.slug)}
            className="break-all text-primary underline-offset-4 hover:underline"
          >
            {courseDetailPath(course.slug)}
          </Link>
        ) : (
          <span className="break-all font-mono text-xs text-muted-foreground">{course.slug}</span>
        )}
        {slugChanged ? (
          <span className="mt-1 flex items-start gap-1.5 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Slug changed — was “{enrollment.course_slug_snapshot}”
          </span>
        ) : null}
      </Field>
    </Panel>
  );
};
