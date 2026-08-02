import { ExternalLink } from "lucide-react";

import SectionHeading from "@/components/shared/SectionHeading";
import SectionShell from "@/components/shared/SectionShell";
import { Button } from "@/components/ui/button";
import { brokerAffiliateUrl, brokerBenefits } from "@/lib/constants/homepage";
import exnessLogo from "@/assets/exness-logo.jpg";

const BrokerSection = () => {
  return (
    <SectionShell id="broker" className="bg-muted/30">
      <div className="grid items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
        <SectionHeading
          align="left"
          eyebrow="Featured broker"
          title="A simple broker recommendation for new mentees."
          description="The broker section remains available on the homepage while the future admin-managed broker page is reserved for a later phase."
          className="mx-0"
        />

        <div
          data-aos="fade-left"
          className="rounded-[2rem] border border-border bg-card p-6 shadow-premium sm:p-8"
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl border border-border bg-white shadow-sm">
              <img src={exnessLogo} alt="Exness logo" className="h-16 w-16 object-contain" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-foreground">Exness</h3>
              <p className="mt-2 leading-7 text-muted-foreground">
                A globally used broker recommended for students who need straightforward account
                setup, fast execution, and reliable withdrawals.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {brokerBenefits.map((benefit) => {
              const Icon = benefit.icon;

              return (
                <div key={benefit.label} className="flex items-center gap-3 rounded-2xl bg-muted/60 p-4">
                  <div className="rounded-xl bg-success/10 p-2 text-success">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="font-medium text-foreground">{benefit.label}</span>
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
        </div>
      </div>
    </SectionShell>
  );
};

export default BrokerSection;
