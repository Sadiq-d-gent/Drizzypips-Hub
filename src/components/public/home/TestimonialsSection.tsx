import { Star } from "lucide-react";

import SectionHeading from "@/components/shared/SectionHeading";
import SectionShell from "@/components/shared/SectionShell";
import { Card, CardContent } from "@/components/ui/card";
import { testimonials } from "@/lib/constants/homepage";

const TestimonialsSection = () => {
  return (
    <SectionShell id="testimonials" className="bg-background">
      <SectionHeading
        eyebrow="Student stories"
        title="What students say."
        description="In their own words."
      />

      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {testimonials.map((testimonial, index) => (
          <Card
            key={testimonial.name}
            data-aos="fade-up"
            data-aos-delay={index * 100}
            className="h-full rounded-3xl border-border/70 bg-card shadow-premium transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
          >
            <CardContent className="flex h-full flex-col p-7">
              <div className="mb-5 flex gap-1 text-amber-400" aria-label="Five star rating">
                {Array.from({ length: 5 }).map((_, starIndex) => (
                  <Star key={starIndex} className="h-4 w-4 fill-current" />
                ))}
              </div>
              <blockquote className="flex-1 text-base leading-8 text-muted-foreground">
                “{testimonial.quote}”
              </blockquote>
              <div className="mt-7 flex items-center gap-4">
                <img
                  src={testimonial.image}
                  alt={testimonial.name}
                  className="h-12 w-12 rounded-full object-cover"
                  loading="lazy"
                />
                <div>
                  <div className="font-semibold text-foreground">{testimonial.name}</div>
                  <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </SectionShell>
  );
};

export default TestimonialsSection;
