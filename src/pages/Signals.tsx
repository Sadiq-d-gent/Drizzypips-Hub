import { BellRing, ExternalLink, MessageCircle, ShieldCheck } from "lucide-react";

import PublicPageLayout from "@/components/Layout/PublicPageLayout";
import SectionHeading from "@/components/shared/SectionHeading";
import SectionShell from "@/components/shared/SectionShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { telegramCommunityUrl } from "@/lib/constants/homepage";

const Signals = () => {
  return (
    <PublicPageLayout>
      <SectionShell className="bg-muted/30">
        <div className="mx-auto max-w-4xl">
          <SectionHeading
            eyebrow="Signals"
            title="Signal group route is ready."
            description="This page is reserved for the signal group experience. For now, visitors can continue to the Telegram destination while the managed settings flow is built later."
          />

          <Card className="mt-12 rounded-3xl border-border bg-card shadow-premium">
            <CardContent className="p-6 text-center sm:p-10">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <BellRing className="h-8 w-8" />
              </div>
              <h2 className="mt-6 text-2xl font-bold text-foreground">Signals placeholder</h2>
              <p className="mx-auto mt-4 max-w-2xl leading-7 text-muted-foreground">
                The future version will pull the signal group link from website settings and can
                redirect automatically when approved.
              </p>
              <div className="mt-8 grid gap-3 text-left sm:grid-cols-2">
                <div className="rounded-2xl bg-muted/60 p-4">
                  <MessageCircle className="mb-3 h-5 w-5 text-success" />
                  <p className="font-medium text-foreground">Telegram-based access</p>
                </div>
                <div className="rounded-2xl bg-muted/60 p-4">
                  <ShieldCheck className="mb-3 h-5 w-5 text-success" />
                  <p className="font-medium text-foreground">Admin-managed link later</p>
                </div>
              </div>
              <Button asChild className="btn-premium mt-8">
                <a href={telegramCommunityUrl} target="_blank" rel="noopener noreferrer">
                  Continue to Telegram
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

export default Signals;
