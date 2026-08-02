import { Check, MessageCircle } from "lucide-react";

import SectionHeading from "@/components/shared/SectionHeading";
import SectionShell from "@/components/shared/SectionShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  consultationWhatsAppMessage,
  mentorshipPrograms,
  mentorshipWhatsAppMessage,
} from "@/lib/constants/homepage";
import { openWhatsApp } from "@/lib/whatsapp";

const MentorshipPreviewSection = () => {
  return (
    <SectionShell
      id="mentorship"
      className="overflow-hidden bg-muted/30"
      containerClassName="relative"
    >
      <div className="absolute -right-20 top-10 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <SectionHeading
        eyebrow="Mentorship"
        title="Choose a practical learning path."
        description="This phase showcases the core programs without implementing the full enrollment flow yet."
      />

      <div className="relative mt-14 grid gap-6 lg:grid-cols-3">
        {mentorshipPrograms.map((program, index) => {
          const Icon = program.icon;

          return (
            <Card
              key={program.name}
              data-aos="fade-up"
              data-aos-delay={index * 100}
              className="group relative h-full overflow-hidden rounded-3xl border-border/70 bg-card shadow-premium transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-success" />
              <CardContent className="flex h-full flex-col p-7">
                <div className="mb-7 flex items-start justify-between gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="h-7 w-7" />
                  </div>
                  <Badge className="rounded-full bg-success/10 px-3 py-1 text-success hover:bg-success/10">
                    {program.badge}
                  </Badge>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-foreground">{program.name}</h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    {program.description}
                  </p>
                  <div className="mt-5 text-4xl font-bold text-primary">{program.price}</div>
                </div>

                <div className="my-7 space-y-3">
                  {program.highlights.map((highlight) => (
                    <div key={highlight} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <span>{highlight}</span>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  className="btn-premium mt-auto w-full"
                  onClick={() => openWhatsApp(mentorshipWhatsAppMessage)}
                >
                  <MessageCircle className="h-4 w-4" />
                  Ask About This Program
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div
        data-aos="fade-up"
        className="relative mt-10 rounded-3xl border border-border bg-card/80 p-6 text-center shadow-premium sm:p-8"
      >
        <h3 className="text-2xl font-bold text-foreground">Not sure where to begin?</h3>
        <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
          Book a quick consultation and get pointed toward the right mentorship option for your
          current skill level.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-6 min-h-11 rounded-xl border-primary text-primary hover:bg-primary hover:text-primary-foreground"
          onClick={() => openWhatsApp(consultationWhatsAppMessage)}
        >
          <MessageCircle className="h-4 w-4" />
          Book Free Consultation
        </Button>
      </div>
    </SectionShell>
  );
};

export default MentorshipPreviewSection;
