import { ArrowRight, Clock, ImageOff, ListChecks } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCoursePrice, isFreeCourse } from "@/lib/courses/price";
import { courseDetailPath } from "@/lib/courses/routes";
import { Course } from "@/types/course";

type CourseCardProps = {
  course: Course;
};

const CourseCard = ({ course }: CourseCardProps) => {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  const isFree = isFreeCourse(course.price);
  const formattedPrice = isFree ? "Free" : formatCoursePrice(course.price, course.currency);
  const showThumbnail = Boolean(course.thumbnail_url) && !thumbnailFailed;
  const topicCount = course.learnings.length;

  return (
    <Card className="group flex h-full flex-col overflow-hidden rounded-3xl border-border bg-card shadow-premium transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-primary/15 to-success/15">
        {showThumbnail ? (
          <img
            src={course.thumbnail_url ?? undefined}
            alt=""
            onError={() => setThumbnailFailed(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <ImageOff className="h-7 w-7 text-primary/70" aria-hidden="true" />
            <span className="line-clamp-2 text-base font-semibold text-primary">{course.title}</span>
          </div>
        )}

        {isFree ? (
          <Badge className="absolute left-4 top-4 rounded-full bg-success px-3 py-1 text-success-foreground shadow-success hover:bg-success">
            Free
          </Badge>
        ) : null}
      </div>

      <CardContent className="flex flex-1 flex-col p-6">
        <h3 className="text-xl font-bold leading-snug text-foreground">{course.title}</h3>

        <p className="mt-3 line-clamp-3 text-sm leading-7 text-muted-foreground">
          {course.short_description}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <span>{course.duration}</span>
          </span>

          {topicCount > 0 ? (
            <span className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <span>
                {topicCount} {topicCount === 1 ? "topic" : "topics"}
              </span>
            </span>
          ) : null}
        </div>

        <div className="mt-auto flex flex-wrap items-end justify-between gap-4 border-t border-border pt-5">
          <p className="flex flex-col">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Price
            </span>
            <span className="mt-1 text-2xl font-bold text-primary">{formattedPrice}</span>
          </p>

          <Button
            asChild
            className="btn-premium min-h-11 px-6 py-2"
            aria-label={`View course details for ${course.title}`}
          >
            <Link to={courseDetailPath(course.slug)}>
              View Course
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default CourseCard;
