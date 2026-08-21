import { MessageCircle } from "lucide-react";

import SectionShell from "@/components/shared/SectionShell";
import { Button } from "@/components/ui/button";
import { useWebsiteContent } from "@/hooks/useWebsiteSettings";
import { consultationWhatsAppMessage } from "@/lib/constants/homepage";
import { openWhatsApp } from "@/lib/whatsapp";

const HomeCtaSection = () => {
  const content = useWebsiteContent();

  return (
    <SectionShell className="bg-muted/30">
      <div
        data-aos="fade-up"
        className="overflow-hidden rounded-[2rem] border border-border bg-trading-darker p-8 text-center text-white shadow-2xl sm:p-12"
      >
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-success">
          Start with clarity
        </p>
        <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-bold tracking-tight sm:text-5xl">
          Build your trading foundation with a mentor-led path.
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
          Choose a program, enroll online, and pay by bank transfer. If you would rather ask
          before committing, support is one message away.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
          <Button
            type="button"
            size="lg"
            className="btn-premium min-h-12 rounded-xl px-7"
            onClick={() => openWhatsApp(consultationWhatsAppMessage)}
          >
            <MessageCircle className="h-5 w-5" />
            Talk to Support
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="min-h-12 rounded-xl border-white/25 bg-white/10 px-7 text-white hover:bg-white hover:text-slate-950"
          >
            <a href={content.telegramUrl} target="_blank" rel="noopener noreferrer">
              Join Telegram Channel
            </a>
          </Button>
        </div>
      </div>
    </SectionShell>
  );
};

export default HomeCtaSection;
