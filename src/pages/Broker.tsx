import { ExternalLink } from "lucide-react";

import PublicPageLayout from "@/components/Layout/PublicPageLayout";
import SectionHeading from "@/components/shared/SectionHeading";
import SectionShell from "@/components/shared/SectionShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { brokerAffiliateUrl, brokerBenefits } from "@/lib/constants/homepage";
import exnessLogo from "@/assets/exness-logo.jpg";

const Broker = () => {
  return (
    <PublicPageLayout>
      <SectionShell className="bg-muted/30">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <SectionHeading
            align="left"
            eyebrow="Broker"
            title="Broker page route is ready."
            description="This production route preserves the affiliate CTA and prepares the page for future admin-managed broker content."
            className="mx-0"
          />

          <Card className="rounded-3xl border-border bg-card shadow-premium">
            <CardContent className="p-6 sm:p-8">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl border border-border bg-white shadow-sm">
                  <img src={exnessLogo} alt="Exness logo" className="h-16 w-16 object-contain" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Exness</h2>
                  <p className="mt-3 leading-7 text-muted-foreground">
                    Recommended broker placeholder content for the future full broker page.
                  </p>
                </div>
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {brokerBenefits.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div key={item.label} className="flex items-center gap-3 rounded-2xl bg-muted/60 p-4">
                      <Icon className="h-5 w-5 text-success" />
                      <span className="font-medium text-foreground">{item.label}</span>
                    </div>
                  );
                })}
              </div>

              <Button asChild className="btn-premium mt-8 w-full sm:w-auto">
                <a href={brokerAffiliateUrl} target="_blank" rel="noopener noreferrer">
                  Open Broker Account
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </SectionShell>
    </PublicPageLayout>
  );
};

export default Broker;
