import { ArrowRight, BookOpen, Search, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router-dom";

import PublicPageLayout from "@/components/Layout/PublicPageLayout";
import SectionHeading from "@/components/shared/SectionHeading";
import SectionShell from "@/components/shared/SectionShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const Mentorship = () => {
  return (
    <PublicPageLayout>
      <SectionShell className="bg-muted/30">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_0.85fr]">
          <SectionHeading
            align="left"
            eyebrow="Mentorship"
            title="Course catalog routing is ready."
            description="This placeholder establishes the production route for the mentorship catalog. Course cards, filters, and enrollment actions will be implemented in the approved mentorship phase."
            className="mx-0"
          />

          <Card className="rounded-3xl border-border bg-card shadow-premium">
            <CardContent className="p-6 sm:p-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <BookOpen className="h-7 w-7" />
              </div>
              <h2 className="mt-6 text-2xl font-bold text-foreground">Upcoming catalog features</h2>
              <div className="mt-6 space-y-4">
                {[
                  { icon: Search, label: "Search published mentorship programs" },
                  { icon: SlidersHorizontal, label: "Filter courses by learning path" },
                  { icon: ArrowRight, label: "Open dedicated course detail pages" },
                ].map((item) => {
                  const Icon = item.icon;

                  return (
                    <div key={item.label} className="flex items-center gap-3 text-muted-foreground">
                      <Icon className="h-5 w-5 text-success" />
                      <span>{item.label}</span>
                    </div>
                  );
                })}
              </div>
              <Button asChild className="btn-premium mt-8">
                <Link to="/#mentorship">
                  View Homepage Preview
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </SectionShell>
    </PublicPageLayout>
  );
};

export default Mentorship;
