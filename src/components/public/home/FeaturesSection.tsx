import SectionHeading from "@/components/shared/SectionHeading";
import SectionShell from "@/components/shared/SectionShell";
import { Card, CardContent } from "@/components/ui/card";
import { featureCards } from "@/lib/constants/homepage";

const FeaturesSection = () => {
  return (
    <SectionShell id="features" className="bg-background">
      <SectionHeading
        eyebrow="Why Drizzypips Hub"
        title="A calmer, cleaner way to start trading education."
        description="The new homepage introduces the premium product direction while keeping today’s contact paths simple and dependable."
      />

      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {featureCards.map((feature, index) => {
          const Icon = feature.icon;

          return (
            <Card
              key={feature.title}
              data-aos="fade-up"
              data-aos-delay={index * 75}
              className="group h-full rounded-3xl border-border/70 bg-card/80 shadow-premium transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
            >
              <CardContent className="p-6">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-105">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </SectionShell>
  );
};

export default FeaturesSection;
