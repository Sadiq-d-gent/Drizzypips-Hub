import { ExternalLink } from "lucide-react";

import PublicPageLayout from "@/components/Layout/PublicPageLayout";
import SectionHeading from "@/components/shared/SectionHeading";
import SectionShell from "@/components/shared/SectionShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useWebsiteContent } from "@/hooks/useWebsiteSettings";
import { brokerBenefits } from "@/lib/constants/homepage";
import exnessLogo from "@/assets/exness-logo.jpg";

/**
 * The recommended broker page.
 *
 * The name, the description and the account link come from website settings so they can be
 * changed without a deploy. The logo and the four benefit chips stay compiled in — an image
 * and a set of icons are not text an administrator can safely retype into a form.
 */
const Broker = () => {
  const content = useWebsiteContent();

  return (
    <PublicPageLayout>
      <SectionShell className="bg-muted/30">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <SectionHeading
            align="left"
            eyebrow="Broker"
            title="You need a live account before you can place a trade."
            description="The mentorship covers the decisions; a broker is where the orders actually go. Below is the one recommended for students, with the link to open an account."
            className="mx-0"
          />

          <Card className="rounded-3xl border-border bg-card shadow-premium">
            <CardContent className="p-6 sm:p-8">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl border border-border bg-white shadow-sm">
                  {/*
                    Decorative: the heading beside it already names the broker, so a screen
                    reader announcing the name twice adds nothing. It also avoids labelling the
                    image with a name that may no longer match — the name is editable in
                    settings while this file is compiled in.
                  */}
                  <img
                    src={exnessLogo}
                    alt=""
                    aria-hidden="true"
                    className="h-16 w-16 object-contain"
                  />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-foreground">{content.brokerName}</h2>
                  <p className="mt-3 leading-7 text-muted-foreground">
                    {content.brokerDescription}
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
                <a href={content.brokerUrl} target="_blank" rel="noopener noreferrer">
                  Open Broker Account
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>

              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                This is a referral link, so Drizzypips may earn a commission if you open an
                account through it. You are free to use any broker you prefer.
              </p>
            </CardContent>
          </Card>
        </div>
      </SectionShell>
    </PublicPageLayout>
  );
};

export default Broker;
