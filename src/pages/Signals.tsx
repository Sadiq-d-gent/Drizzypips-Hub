import { BellRing, ExternalLink, MessageCircle, ShieldCheck } from "lucide-react";

import PublicPageLayout from "@/components/Layout/PublicPageLayout";
import SectionHeading from "@/components/shared/SectionHeading";
import SectionShell from "@/components/shared/SectionShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useWebsiteContent } from "@/hooks/useWebsiteSettings";

/**
 * The signal group page.
 *
 * Informational rather than a redirect. A nav item that bounces the visitor straight off-site
 * is hostile — it breaks the back button and gives no chance to read what they are joining —
 * so the page explains the destination and links to it.
 */
const Signals = () => {
  const content = useWebsiteContent();

  return (
    <PublicPageLayout>
      <SectionShell className="bg-muted/30">
        <div className="mx-auto max-w-4xl">
          <SectionHeading
            eyebrow="Signals"
            title="Market ideas and commentary, posted on Telegram."
            description="The signal group runs on Telegram, so there is no separate account to make and nothing to install beyond the app you already have."
          />

          <Card className="mt-12 rounded-3xl border-border bg-card shadow-premium">
            <CardContent className="p-6 text-center sm:p-10">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <BellRing className="h-8 w-8" />
              </div>
              <h2 className="mt-6 text-2xl font-bold text-foreground">Before you join</h2>
              <p className="mx-auto mt-4 max-w-2xl leading-7 text-muted-foreground">
                Ideas posted in the group are education, not personal financial advice. Nobody
                there knows your account size, your risk tolerance or your circumstances — so
                treat every idea as something to check against your own plan, and size your own
                risk.
              </p>
              <div className="mt-8 grid gap-3 text-left sm:grid-cols-2">
                <div className="rounded-2xl bg-muted/60 p-4">
                  <MessageCircle className="mb-3 h-5 w-5 text-success" />
                  <p className="font-medium text-foreground">Telegram-based access</p>
                </div>
                <div className="rounded-2xl bg-muted/60 p-4">
                  <ShieldCheck className="mb-3 h-5 w-5 text-success" />
                  <p className="font-medium text-foreground">Education, not advice</p>
                </div>
              </div>
              {/*
                `signalGroupUrl` falls back to the Telegram channel when no distinct group link
                is set, which is what this button did before the two could be configured
                separately — so the label holds either way.
              */}
              <Button asChild className="btn-premium mt-8">
                <a href={content.signalGroupUrl} target="_blank" rel="noopener noreferrer">
                  Open the signal group
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
