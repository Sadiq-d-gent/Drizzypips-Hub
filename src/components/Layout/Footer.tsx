import { Instagram, Mail, MessageCircle, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { usePaymentSettings } from "@/hooks/usePaymentSettings";
import { useWebsiteContent } from "@/hooks/useWebsiteSettings";
import { consultationWhatsAppMessage } from "@/lib/constants/homepage";
import { createWhatsAppUrl } from "@/lib/whatsapp";

const Footer = () => {
  const content = useWebsiteContent();

  /**
   * The support number comes from `payment_settings`, not from `website_settings`.
   *
   * Deliberately not a column on the new table: this is the number a student contacts about a
   * payment, it is already editable on the Payment details card, and a second copy would be a
   * second source of truth for the one contact that matters after money has moved. Passing
   * `undefined` when it is unset lets createWhatsAppUrl fall back to the compiled-in number,
   * which is the same fallback the payment step uses.
   *
   * This query is shared with the enrollment flow under `paymentSettingsQueryKey`, so the
   * footer being on every page warms the cache the payment step needs rather than adding a
   * request of its own.
   */
  const paymentSettings = usePaymentSettings();
  const supportWhatsAppUrl = createWhatsAppUrl(
    consultationWhatsAppMessage,
    paymentSettings.data?.support_whatsapp_number ?? undefined,
  );

  const socialLinks = [
    {
      name: "Instagram",
      icon: Instagram,
      href: content.instagramUrl,
      color: "hover:text-pink-500",
    },
    {
      name: "TikTok",
      icon: TrendingUp,
      href: content.tiktokUrl,
      color: "hover:text-foreground",
    },
    {
      name: "WhatsApp",
      icon: MessageCircle,
      href: supportWhatsAppUrl,
      color: "hover:text-success",
    },
    {
      name: "Telegram",
      icon: MessageCircle,
      href: content.telegramUrl,
      color: "hover:text-primary",
    },
  ];

  const quickLinks = [
    { name: "Home", href: "/" },
    { name: "Mentorship", href: "/mentorship" },
    { name: "Signals", href: "/signals" },
    { name: "Telegram Channel", href: "/telegram" },
    { name: "Broker", href: "/broker" },
    { name: "FAQ", href: "/#faq" },
    { name: "Accessibility Statement", href: "/accessibility" },
    { name: "Terms & Conditions", href: "/terms" },
    { name: "Privacy Policy", href: "/privacy-policy" },
    { name: "Legal Disclaimer", href: "/disclaimer" },
    { name: "Return & Refund Policy", href: "/refund-policy" },
  ];

  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <Link
              to="/"
              className="mb-4 flex items-center space-x-2 text-xl font-bold text-primary"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary text-sm font-bold text-white">
                DP
              </div>
              <span>Drizzypips Hub</span>
            </Link>
            <p className="mb-6 max-w-md text-sm leading-7 text-muted-foreground">
              {content.footerTagline}
            </p>
            <div className="flex items-center space-x-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a
                href={`mailto:${content.contactEmail}`}
                className="text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                {content.contactEmail}
              </a>
            </div>
          </div>

          <div>
            <h3 className="mb-4 font-semibold text-foreground">Quick Links</h3>
            <ul className="space-y-2">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    to={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 font-semibold text-foreground">Connect</h3>
            <div className="flex flex-col space-y-3">
              {socialLinks.map((social) => {
                const Icon = social.icon;

                return (
                  <a
                    key={social.name}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center space-x-2 text-sm text-muted-foreground transition-colors ${social.color}`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{social.name}</span>
                  </a>
                );
              })}

              <Button asChild className="btn-premium mt-4">
                <a href={supportWhatsAppUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4" />
                  Contact Support
                </a>
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-border pt-8 md:flex-row">
          <p className="text-sm text-muted-foreground">{content.footerCopyright}</p>
          <p className="text-sm text-muted-foreground">Professional forex mentorship platform</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
