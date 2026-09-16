import { AlertTriangle, ArrowLeft, BookOpen, MessageCircle, RefreshCw, SearchX } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import CourseCardSkeleton from "@/components/courses/CourseCardSkeleton";
import CourseFilters from "@/components/courses/CourseFilters";
import MentorshipCategoryCards from "@/components/courses/MentorshipCategoryCards";
import MentorshipTrackSection from "@/components/courses/MentorshipTrackSection";
import PublicPageLayout from "@/components/Layout/PublicPageLayout";
import SectionHeading from "@/components/shared/SectionHeading";
import SectionShell from "@/components/shared/SectionShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCourses } from "@/hooks/useCourses";
import { useWebsiteContent } from "@/hooks/useWebsiteSettings";
import {
  MENTORSHIP_FORMATS,
  findDelivery,
  findFormat,
  groupCoursesByCategory,
} from "@/lib/courses/categories";
import type { DeliveryDescriptor, FormatDescriptor } from "@/lib/courses/categories";
import { areFiltersActive, DEFAULT_COURSE_FILTERS, filterCourses } from "@/lib/courses/filters";
import { mentorshipWhatsAppMessage } from "@/lib/constants/homepage";
import { openWhatsApp } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { Course, CourseFilters as CourseFiltersState } from "@/types/course";

/**
 * The mentorship catalogue, as two levels rather than one grid.
 *
 * WHAT CHANGED AND WHY
 * This page used to render every published course in one flat grid, so a visitor could not tell
 * that mentorship comes in a physical and an online form, each with a general and a one-on-one
 * track. Those four offerings are the product; a grid is a list of files. The page now asks the
 * question the product actually poses, in the order it poses it: which setting suits you, then
 * which track.
 *
 * NOTHING WAS REMOVED TO MAKE ROOM
 * The search box and price filters are the same component with the same behaviour, and all four
 * of the states the old page handled are still handled: the loading skeletons, the failed-query
 * card with its retry, the nothing-published card, and the nothing-matches card. Two groups were
 * *added* rather than removed, and that is the point of them: 013 leaves both taxonomy columns
 * nullable, so a course the client created before this feature existed has no category, and it
 * renders under its own heading instead of vanishing from a page it used to appear on.
 *
 * WHY THE SELECTION IS IN THE URL
 * `?delivery=` and `?format=` rather than useState, so the browser's back button steps back out
 * of a category, a visitor can be sent straight to "online one-on-one", and a reload does not
 * throw them back to the top. Same idiom as the enrollment wizard's `?step=`, and the reason
 * these are search params on one route rather than four routes is that the catalogue query is
 * shared: navigating between categories must not unmount and refetch it.
 */

const GRID_ID = "course-catalogue-grid";
const SKELETON_COUNT = 6;

const DELIVERY_PARAM = "delivery";
const FORMAT_PARAM = "format";

/**
 * Filters live in the URL too, so a filtered category is a shareable address and the back button
 * undoes a search the same way it undoes a category. Reading them from the same place as the
 * selection also means the page has one source of state rather than two that can disagree.
 */
const QUERY_PARAM = "q";
const PRICE_PARAM = "price";

const PRICE_RANGES = ["all", "under-150", "150-300", "over-300"] as const;

const isPriceRange = (value: string | null): value is CourseFiltersState["priceRange"] =>
  PRICE_RANGES.some((range) => range === value);

/** The skeleton grid, matching the shape of a track's course grid. */
const CourseGridSkeleton = () => (
  <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
    {Array.from({ length: SKELETON_COUNT }, (_, index) => (
      <CourseCardSkeleton key={index} />
    ))}
  </div>
);

/**
 * One of the three cards this page shows instead of courses.
 *
 * Extracted because the old page repeated the same eighteen lines of layout three times with a
 * different icon, heading and button in each. The tone of each message is unchanged.
 */
const StatusCard = ({
  icon: Icon,
  tone,
  title,
  description,
  children,
}: {
  icon: typeof AlertTriangle;
  tone: "destructive" | "primary" | "muted";
  title: string;
  description: string;
  children?: React.ReactNode;
}) => (
  <Card className="rounded-3xl border-border bg-card shadow-premium">
    <CardContent className="flex flex-col items-center p-8 text-center sm:p-12">
      <div
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-2xl",
          tone === "destructive" && "bg-destructive/10 text-destructive",
          tone === "primary" && "bg-primary/10 text-primary",
          tone === "muted" && "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-7 w-7" aria-hidden="true" />
      </div>
      <h3 className="mt-6 text-2xl font-bold text-foreground">{title}</h3>
      <p className="mt-3 max-w-xl leading-7 text-muted-foreground">{description}</p>
      {children ? <div className="mt-8 flex flex-wrap justify-center gap-3">{children}</div> : null}
    </CardContent>
  </Card>
);

const Mentorship = () => {
  const { data, isPending, isError, refetch, isFetching } = useCourses();
  const content = useWebsiteContent();
  const [searchParams, setSearchParams] = useSearchParams();

  /**
   * Both halves of the selection, read from the URL through the taxonomy's own lookups.
   *
   * `findDelivery` and `findFormat` take an untrusted string and return undefined for anything
   * that is not one of the two values, so `?delivery=nonsense` is "nothing selected" rather than
   * a crash or an empty page with no explanation. A typed URL is exactly the input that needs
   * that, and the same lookups guard a column whose value predates the frontend.
   */
  const selectedDelivery = findDelivery(searchParams.get(DELIVERY_PARAM)) ?? null;
  const selectedFormat = findFormat(searchParams.get(FORMAT_PARAM)) ?? null;

  const filters = useMemo<CourseFiltersState>(() => {
    const price = searchParams.get(PRICE_PARAM);

    return {
      query: searchParams.get(QUERY_PARAM) ?? "",
      priceRange: isPriceRange(price) ? price : DEFAULT_COURSE_FILTERS.priceRange,
    };
  }, [searchParams]);

  /**
   * Writes only the params that carry meaning, so a default never ends up in the address bar.
   *
   * `replace: true` for filters and `false` for the category, deliberately. Typing in a search
   * box would otherwise push one history entry per keystroke and make the back button useless,
   * while stepping out of a category is precisely what a visitor expects back to do.
   */
  const updateParams = useCallback(
    (
      next: {
        delivery?: DeliveryDescriptor | null;
        format?: FormatDescriptor | null;
        filters?: CourseFiltersState;
      },
      options?: { replace?: boolean },
    ) => {
      const delivery = next.delivery === undefined ? selectedDelivery : next.delivery;
      const format = next.format === undefined ? selectedFormat : next.format;
      const nextFilters = next.filters ?? filters;

      const params = new URLSearchParams();

      if (delivery) {
        params.set(DELIVERY_PARAM, delivery.value);
      }

      // A track with no delivery mode selected is not a state this page has, so the format is
      // dropped rather than kept as an orphan that would reappear on the next category.
      if (delivery && format) {
        params.set(FORMAT_PARAM, format.value);
      }

      if (nextFilters.query.trim().length > 0) {
        params.set(QUERY_PARAM, nextFilters.query);
      }

      if (nextFilters.priceRange !== DEFAULT_COURSE_FILTERS.priceRange) {
        params.set(PRICE_PARAM, nextFilters.priceRange);
      }

      setSearchParams(params, { replace: options?.replace ?? false });
    },
    [filters, selectedDelivery, selectedFormat, setSearchParams],
  );

  const courses = useMemo(() => data ?? [], [data]);
  const grouping = useMemo(() => groupCoursesByCategory(courses), [courses]);

  /**
   * The filters applied inside whichever group is on screen.
   *
   * Memoised on the filter object rather than run per group at render time, so typing a letter
   * filters each list once instead of once per re-render of the section that holds it.
   */
  const applyFilters = useCallback(
    (list: Course[]) => filterCourses(list, filters),
    [filters],
  );

  const hasActiveFilters = areFiltersActive(filters);
  const clearFilters = () => updateParams({ filters: DEFAULT_COURSE_FILTERS }, { replace: true });

  const deliveryOptions = useMemo(
    () =>
      grouping.deliveries.map(({ delivery, totalCourses }) => ({
        delivery,
        courseCount: totalCourses,
      })),
    [grouping],
  );

  const activeGroup = useMemo(
    () =>
      selectedDelivery
        ? (grouping.deliveries.find(
            (group) => group.delivery.value === selectedDelivery.value,
          ) ?? null)
        : null,
    [grouping, selectedDelivery],
  );

  /**
   * The tracks to render inside the open category.
   *
   * `?format=` narrows to one, which is what makes each of the four offerings its own address,
   * and no format renders both. The two are the same list either way, so the sections do not
   * need to know which case they are in.
   */
  const visibleTracks = useMemo(() => {
    if (!activeGroup) {
      return [];
    }

    return selectedFormat
      ? activeGroup.tracks.filter((track) => track.format.value === selectedFormat.value)
      : activeGroup.tracks;
  }, [activeGroup, selectedFormat]);

  /**
   * How many courses are on screen, and how many there are in total, for the announced count.
   *
   * Counted from what is actually rendered rather than from `courses`, so the sentence is true
   * inside a category as well as on the landing view. The old page's phrasing is kept, because
   * it is what the aria-live region reads out after every change.
   */
  const { visibleCount, totalCount } = useMemo(() => {
    if (activeGroup) {
      const tracked = visibleTracks.flatMap((track) => track.courses);
      const unassigned = selectedFormat ? [] : activeGroup.unassignedCourses;
      const inScope = [...tracked, ...unassigned];

      return {
        visibleCount: applyFilters(inScope).length,
        totalCount: inScope.length,
      };
    }

    return { visibleCount: applyFilters(courses).length, totalCount: courses.length };
  }, [activeGroup, applyFilters, courses, selectedFormat, visibleTracks]);

  const renderStatusMessage = () => {
    if (isPending) {
      return "Loading courses…";
    }

    if (isError) {
      return "Courses could not be loaded.";
    }

    if (courses.length === 0) {
      return "No courses are available yet.";
    }

    return `Showing ${visibleCount} of ${totalCount} ${
      totalCount === 1 ? "course" : "courses"
    }.`;
  };

  /**
   * The open category: its two tracks, then anything in the category with no track set.
   *
   * The unassigned group is rendered only when both tracks are showing. With `?format=` pinned to
   * one track it would be a heading that has nothing to do with the track above it.
   */
  const renderCategory = (group: NonNullable<typeof activeGroup>) => {
    const unassigned = applyFilters(group.unassignedCourses);
    const showUnassigned = !selectedFormat && group.unassignedCourses.length > 0;

    if (group.totalCourses === 0) {
      return (
        <StatusCard
          icon={BookOpen}
          tone="primary"
          title={`No ${group.delivery.label.toLowerCase()} programs yet`}
          description="This setting is available, but nothing is published under it at the moment. Message us and we will tell you what is coming, or look at the other setting."
        >
          <Button
            type="button"
            onClick={() => openWhatsApp(mentorshipWhatsAppMessage)}
            className="btn-premium min-h-11"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            Talk to a mentor
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => updateParams({ delivery: null, format: null })}
            className="min-h-11 rounded-xl border-primary text-primary hover:bg-primary hover:text-primary-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Both settings
          </Button>
        </StatusCard>
      );
    }

    return (
      <div className="space-y-14">
        {visibleTracks.map((track) => (
          <MentorshipTrackSection
            key={track.format.value}
            label={track.format.label}
            blurb={track.format.blurb}
            icon={track.format.icon}
            courses={applyFilters(track.courses)}
            totalCourses={track.courses.length}
          />
        ))}

        {showUnassigned ? (
          <MentorshipTrackSection
            label="Other programs in this setting"
            blurb="Published under this setting without a track. Ask us which one it belongs to and we will point you at the right fit."
            icon={BookOpen}
            courses={unassigned}
            totalCourses={group.unassignedCourses.length}
          />
        ) : null}
      </div>
    );
  };

  /** The landing view: the two category cards, then anything with no category at all. */
  const renderLanding = () => {
    const unclassified = applyFilters(grouping.unclassified);

    return (
      <div className="space-y-14">
        <MentorshipCategoryCards
          options={deliveryOptions}
          onSelect={(delivery) => updateParams({ delivery, format: null })}
        />

        {grouping.unclassified.length > 0 ? (
          <MentorshipTrackSection
            label="All other programs"
            blurb="Published without a setting yet. These are open to enroll in exactly as they were, and we will tell you whether they run in person or online."
            icon={BookOpen}
            courses={unclassified}
            totalCourses={grouping.unclassified.length}
          />
        ) : null}
      </div>
    );
  };

  const renderContent = () => {
    if (isPending) {
      return <CourseGridSkeleton />;
    }

    if (isError) {
      return (
        <StatusCard
          icon={AlertTriangle}
          tone="destructive"
          title="We couldn't load the courses"
          description="Something went wrong while reaching our course library. Please check your connection and try again."
        >
          <Button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-premium min-h-11"
          >
            <RefreshCw
              className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"}
              aria-hidden="true"
            />
            {isFetching ? "Retrying…" : "Try again"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => openWhatsApp(mentorshipWhatsAppMessage)}
            className="min-h-11 rounded-xl border-primary text-primary hover:bg-primary hover:text-primary-foreground"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            Ask on WhatsApp
          </Button>
        </StatusCard>
      );
    }

    if (courses.length === 0) {
      return (
        <StatusCard
          icon={BookOpen}
          tone="primary"
          title="No courses published yet"
          description="New mentorship programs are on the way. Message us and we'll let you know as soon as enrollment opens."
        >
          <Button
            type="button"
            onClick={() => openWhatsApp(mentorshipWhatsAppMessage)}
            className="btn-premium min-h-11"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            Talk to a mentor
          </Button>
        </StatusCard>
      );
    }

    /**
     * Nothing anywhere matches the filters, so no category or track has anything to show.
     *
     * Checked across the whole catalogue rather than per group: a search that matches only online
     * courses should still open the physical category and let its tracks say so themselves, and a
     * search that matches nothing at all is the one case worth interrupting the page for.
     */
    if (visibleCount === 0 && hasActiveFilters) {
      return (
        <StatusCard
          icon={SearchX}
          tone="muted"
          title="No courses match your search"
          description="Try a different keyword, or widen the price range to see the full catalogue again."
        >
          <Button type="button" onClick={clearFilters} className="btn-premium min-h-11">
            Clear filters
          </Button>
        </StatusCard>
      );
    }

    return activeGroup ? renderCategory(activeGroup) : renderLanding();
  };

  return (
    <PublicPageLayout>
      <SectionShell className="bg-muted/30">
        {activeGroup ? (
          <>
            {/*
              A button rather than a router Link, because the category is a query parameter on
              this route. `updateParams` clears both halves of the selection and keeps the
              filters, so stepping out of a category does not silently discard a search.
            */}
            <Button
              type="button"
              variant="ghost"
              onClick={() => updateParams({ delivery: null, format: null })}
              className="mb-6 h-auto rounded-full px-3 py-1.5 text-sm text-primary hover:bg-primary/10 hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              All mentorship settings
            </Button>

            <SectionHeading
              align="left"
              eyebrow="Mentorship"
              title={activeGroup.delivery.label}
              description={activeGroup.delivery.blurb}
              className="mx-0"
            />

            {/*
              The two tracks as a single-choice group, so each of the four offerings has its own
              address. aria-pressed rather than radio semantics, matching the price filters, which
              are the same kind of single-choice toggle bar.
            */}
            <div
              role="group"
              aria-label="Filter by mentorship track"
              className="mt-8 flex flex-wrap gap-2"
            >
              {[null, ...MENTORSHIP_FORMATS].map((format) => {
                const isActive = (selectedFormat?.value ?? null) === (format?.value ?? null);

                return (
                  <Button
                    key={format?.value ?? "both"}
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-pressed={isActive}
                    onClick={() => updateParams({ format }, { replace: true })}
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-medium transition-all duration-300",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground shadow-glow hover:bg-primary-hover hover:text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-foreground",
                    )}
                  >
                    {format?.label ?? "Both tracks"}
                  </Button>
                );
              })}
            </div>
          </>
        ) : (
          <SectionHeading
            align="left"
            eyebrow="Mentorship"
            title={content.mentorshipHeading}
            description={content.mentorshipIntro}
            className="mx-0"
          />
        )}

        <CourseFilters
          filters={filters}
          onChange={(next) => updateParams({ filters: next }, { replace: true })}
          gridId={GRID_ID}
        />

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite" aria-atomic="true">
            {renderStatusMessage()}
          </p>

          {hasActiveFilters && !isPending && !isError ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-auto rounded-full px-3 py-1.5 text-sm text-primary hover:bg-primary/10 hover:text-primary"
            >
              Clear filters
            </Button>
          ) : null}
        </div>

        <div id={GRID_ID} className="mt-6">
          {renderContent()}
        </div>
      </SectionShell>
    </PublicPageLayout>
  );
};

export default Mentorship;
