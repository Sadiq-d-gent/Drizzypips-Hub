import { Instagram, Mail, MessageCircle, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  consultationWhatsAppMessage,
  supportWhatsAppNumber,
  telegramCommunityUrl,
} from "@/lib/constants/homepage";
import { createWhatsAppUrl } from "@/lib/whatsapp";

const Footer = () => {
  const socialLinks = [
    {
      name: "Instagram",
      icon: Instagram,
      href: "https://instagram.com/drizzypipsacademy",
      color: "hover:text-pink-500",
    },
    {
      name: "TikTok",
      icon: TrendingUp,
      href: "https://tiktok.com/@drizzypips",
      color: "hover:text-foreground",
    },
    {
      name: "WhatsApp",
      icon: MessageCircle,
      href: createWhatsAppUrl(consultationWhatsAppMessage, supportWhatsAppNumber),
      color: "hover:text-success",
    },
    {
      name: "Telegram",
      icon: MessageCircle,
      href: telegramCommunityUrl,
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
              A premium mentorship platform for learning trading with structure, practical
              guidance, and direct support while the full student flow is built.
            </p>
            <div className="flex items-center space-x-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a
                href="mailto:contact@drizzypips.com"
                className="text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                contact@drizzypips.com
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
                <a
                  href={createWhatsAppUrl(consultationWhatsAppMessage, supportWhatsAppNumber)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="h-4 w-4" />
                  Contact Support
                </a>
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-border pt-8 md:flex-row">
          <p className="text-sm text-muted-foreground">© 2026 Drizzypips. All rights reserved.</p>
          <p className="text-sm text-muted-foreground">Professional forex mentorship platform</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
