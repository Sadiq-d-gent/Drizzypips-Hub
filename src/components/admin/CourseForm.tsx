import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { useRef } from "react";
import { useForm } from "react-hook-form";

import CourseListField from "@/components/admin/CourseListField";
import CourseThumbnailField from "@/components/admin/CourseThumbnailField";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { COURSE_CURRENCY_OPTIONS } from "@/lib/constants/admin";
import { courseDetailPath } from "@/lib/courses/routes";
import { slugifyCourseTitle } from "@/lib/courses/slug";
import { CourseCreateInput, courseCreateSchema } from "@/lib/validation/course.schema";
import { Course } from "@/types/course";

type CourseFormProps = {
  /** The course being edited, or undefined when creating. */
  course?: Course;
  isSubmitting: boolean;
  onSubmit: (values: CourseCreateInput) => void;
  onCancel: () => void;
};

/**
 * Create and edit form for a course, shared by both routes.
 *
 * Validated with courseCreateSchema in both modes, not courseUpdateSchema. The partial
 * schema exists so a caller can send one field — the publish toggle does exactly that — but
 * this form always holds every field, and validating against the partial would let a saved
 * course lose its description to an empty string.
 */
const EMPTY_COURSE: CourseCreateInput = {
  title: "",
  slug: "",
  short_description: "",
  description: "",
  learnings: [],
  requirements: [],
  duration: "",
  price: 0,
  currency: "NGN",
  thumbnail_url: null,
  published: false,
};

const toFormValues = (course: Course | undefined): CourseCreateInput =>
  course
    ? {
        title: course.title,
        slug: course.slug,
        short_description: course.short_description,
        description: course.description,
        learnings: course.learnings ?? [],
        requirements: course.requirements ?? [],
        duration: course.duration,
        price: Number(course.price),
        currency: course.currency,
        thumbnail_url: course.thumbnail_url,
        published: course.published,
      }
    : EMPTY_COURSE;

const CourseForm = ({ course, isSubmitting, onSubmit, onCancel }: CourseFormProps) => {
  const isEditing = Boolean(course);

  const form = useForm<CourseCreateInput>({
    resolver: zodResolver(courseCreateSchema),
    defaultValues: toFormValues(course),
    mode: "onBlur",
  });

  /**
   * Whether the admin has taken over the slug by hand.
   *
   * Until they do, a new course's slug follows its title, which is what almost everyone
   * wants and saves a step. The moment they edit the slug themselves, the suggestion stops
   * — silently overwriting a deliberately chosen slug on the next title keystroke would be
   * the worse behaviour by far.
   */
  const slugIsManual = useRef(isEditing);

  const slug = form.watch("slug");
  const published = form.watch("published");

  /**
   * On an existing course the slug is a live public URL, so changing it is a real decision
   * rather than a detail: /courses/<old-slug> stops resolving the moment it is saved, and
   * any link already sent to a student — or indexed by a search engine — breaks. Worth a
   * warning at the point of change; not worth blocking, because fixing a typo in a slug
   * nobody has seen yet is legitimate.
   */
  const slugChanged = isEditing && course !== undefined && slug !== course.slug;

  const handleTitleChange = (value: string) => {
    form.setValue("title", value, { shouldDirty: true, shouldValidate: false });

    if (slugIsManual.current) {
      return;
    }

    const suggestion = slugifyCourseTitle(value);
    if (suggestion) {
      form.setValue("slug", suggestion, { shouldDirty: true, shouldValidate: false });
    }
  };

  const regenerateSlug = () => {
    const suggestion = slugifyCourseTitle(form.getValues("title"));
    if (!suggestion) {
      form.setError("slug", {
        message: "The title has no letters or numbers to build a slug from.",
      });
      return;
    }

    slugIsManual.current = false;
    form.setValue("slug", suggestion, { shouldDirty: true, shouldValidate: true });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8" noValidate>
        <section className="space-y-6">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Course title</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    onChange={(event) => handleTitleChange(event.target.value)}
                    placeholder="ICT Mentorship Programme"
                    className="h-12 rounded-xl border-border bg-card"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Web address</FormLabel>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <FormControl>
                    <Input
                      {...field}
                      onChange={(event) => {
                        slugIsManual.current = true;
                        field.onChange(event);
                      }}
                      placeholder="ict-mentorship-programme"
                      className="h-12 rounded-xl border-border bg-card font-mono text-sm"
                    />
                  </FormControl>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-12 shrink-0 gap-2 rounded-xl"
                    onClick={regenerateSlug}
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    From title
                  </Button>
                </div>
                <FormDescription>
                  The course will live at{" "}
                  <span className="font-mono text-xs">
                    {courseDetailPath(slug || "your-course")}
                  </span>
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {slugChanged ? (
            <div
              className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4"
              role="status"
            >
              <TriangleAlert
                className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                aria-hidden="true"
              />
              <p className="text-sm text-foreground">
                Changing the web address breaks the old one.{" "}
                <span className="font-mono text-xs">{courseDetailPath(course.slug)}</span> will
                stop working, including any link already shared with a student.
              </p>
            </div>
          ) : null}

          <FormField
            control={form.control}
            name="short_description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Short description</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={2}
                    placeholder="One or two lines for the course card."
                    className="rounded-xl border-border bg-card"
                  />
                </FormControl>
                <FormDescription>Shown on the catalogue card.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full description</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={7}
                    placeholder="What the course covers, who it is for, and how it runs."
                    className="rounded-xl border-border bg-card"
                  />
                </FormControl>
                <FormDescription>Shown on the course page.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <section className="space-y-6">
          <FormField
            control={form.control}
            name="learnings"
            render={({ field }) => (
              <FormItem>
                <FormLabel>What students will learn</FormLabel>
                <FormControl>
                  <CourseListField
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder={"Read market structure with confidence\nBuild a repeatable trading plan"}
                  />
                </FormControl>
                <FormDescription>
                  One per line. {field.value.length}{" "}
                  {field.value.length === 1 ? "point" : "points"}.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="requirements"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Requirements</FormLabel>
                <FormControl>
                  <CourseListField
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    rows={4}
                    placeholder={"A funded or demo trading account\nAround 4 hours a week"}
                  />
                </FormControl>
                <FormDescription>
                  One per line. {field.value.length}{" "}
                  {field.value.length === 1 ? "requirement" : "requirements"}.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <section className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="duration"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Duration</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="8 weeks"
                    className="h-12 rounded-xl border-border bg-card"
                  />
                </FormControl>
                <FormDescription>Free text — shown as written.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Currency</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="h-12 rounded-xl border-border bg-card">
                      <SelectValue placeholder="Select a currency" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {COURSE_CURRENCY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Price</FormLabel>
                <FormControl>
                  <Input
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={Number.isFinite(field.value) ? String(field.value) : ""}
                    /**
                     * valueAsNumber gives NaN for an empty or half-typed value, and NaN
                     * would fail the schema with "expected number" rather than anything
                     * useful. Zero keeps the field valid while it is being typed, and
                     * "free" is a real price the catalogue already renders.
                     */
                    onChange={(event) =>
                      field.onChange(
                        Number.isNaN(event.target.valueAsNumber)
                          ? 0
                          : event.target.valueAsNumber,
                      )
                    }
                    className="h-12 rounded-xl border-border bg-card"
                  />
                </FormControl>
                <FormDescription>Zero shows the course as free.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <FormField
          control={form.control}
          name="thumbnail_url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Thumbnail</FormLabel>
              <FormControl>
                <CourseThumbnailField
                  value={field.value ?? null}
                  onChange={field.onChange}
                  persistedUrl={course?.thumbnail_url}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="published"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start justify-between gap-6 rounded-2xl border border-border bg-card p-5">
              <div className="min-w-0 space-y-1">
                <FormLabel className="text-base">Published</FormLabel>
                <FormDescription>
                  {published
                    ? "Live on the site. Anyone can see this course and enrol in it."
                    : "Hidden. Only administrators can see this course, and nobody can enrol."}
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  aria-label="Published"
                />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="flex flex-wrap gap-3">
          <Button type="submit" className="btn-premium min-h-12" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Saving
              </>
            ) : isEditing ? (
              "Save changes"
            ) : (
              "Create course"
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="min-h-12 rounded-xl"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default CourseForm;
