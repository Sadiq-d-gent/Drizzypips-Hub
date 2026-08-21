import { ExternalLink, MessageCircle, Radio, Users } from "lucide-react";

import PublicPageLayout from "@/components/Layout/PublicPageLayout";
import SectionHeading from "@/components/shared/SectionHeading";
import SectionShell from "@/components/shared/SectionShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useWebsiteContent } from "@/hooks/useWebsiteSettings";

/**
 * The Telegram channel page.
 *
 * Informational rather than a redirect, for the same reason the signals page is: a nav item
 * that throws the visitor off-site immediately breaks the back button and gives them no
 * chance to see where they are going.
 */
const Telegram = () => {
  const content = useWebsiteContent();

  return (
    <PublicPageLayout>
      <SectionShell className="bg-background">
        <div className="mx-auto max-w-4xl">
          <SectionHeading
            eyebrow="Telegram Channel"
            title="Announcements and market notes, on Telegram."
            description="Opening the channel needs the Telegram app and nothing else. There is no account to create on this site to read it."
          />

          <Card className="mt-12 overflow-hidden rounded-3xl border-border bg-card shadow-premium">
            <CardContent className="p-6 sm:p-10">
              <div className="grid gap-8 md:grid-cols-[0.75fr_1fr] md:items-center">
                <div className="rounded-3xl bg-gradient-to-br from-primary/15 to-success/15 p-8 text-center">
                  <MessageCircle className="mx-auto h-16 w-16 text-primary" />
                  <p className="mt-5 text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Community updates
                  </p>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Join the Drizzypips channel</h2>
                  <p className="mt-4 leading-7 text-muted-foreground">
                    Worth following whether or not you enroll. If you have a question about a
                    program or an enrollment you have already submitted, WhatsApp support is the
                    faster route — the link is in the footer of every page.
                  </p>
                  <div className="mt-6 space-y-3">
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <Radio className="h-5 w-5 text-success" />
                      <span>Announcements and platform updates</span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <Users className="h-5 w-5 text-success" />
                      <span>Free to follow, nothing to sign up for here</span>
                    </div>
                  </div>
                  <Button asChild className="btn-premium mt-8">
                    <a href={content.telegramUrl} target="_blank" rel="noopener noreferrer">
                      Open Telegram Channel
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </SectionShell>
    </PublicPageLayout>
  );
};

export default Telegram;
