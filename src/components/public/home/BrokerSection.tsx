import { ExternalLink } from "lucide-react";

import SectionHeading from "@/components/shared/SectionHeading";
import SectionShell from "@/components/shared/SectionShell";
import { Button } from "@/components/ui/button";
import { useWebsiteContent } from "@/hooks/useWebsiteSettings";
import { brokerBenefits } from "@/lib/constants/homepage";
import exnessLogo from "@/assets/exness-logo.jpg";

const BrokerSection = () => {
  /** Name, description and link are editable; the logo and the benefit chips are not. */
  const content = useWebsiteContent();

  return (
    <SectionShell id="broker" className="bg-muted/30">
      <div className="grid items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
        <SectionHeading
          align="left"
          eyebrow="Featured broker"
          title="A simple broker recommendation for new mentees."
          description="Every student needs a broker account before placing a trade. This is the one recommended for straightforward setup and reliable withdrawals — the broker page has the full rundown."
          className="mx-0"
        />

        <div
          data-aos="fade-left"
          className="rounded-[2rem] border border-border bg-card p-6 shadow-premium sm:p-8"
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl border border-border bg-white shadow-sm">
              {/*
                Decorative: the broker's name is the heading immediately beside it, so a
                screen reader would read it twice. `alt=""` also avoids naming a broker the
                image may no longer be — the name is editable from /admin/settings while this
                logo is compiled in, which is the tradeoff the plan accepted rather than
                building an upload path for one image.
              */}
              <img src={exnessLogo} alt="" aria-hidden="true" className="h-16 w-16 object-contain" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-foreground">{content.brokerName}</h3>
              <p className="mt-2 leading-7 text-muted-foreground">{content.brokerDescription}</p>
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
            <a href={content.brokerUrl} target="_blank" rel="noopener noreferrer">
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
