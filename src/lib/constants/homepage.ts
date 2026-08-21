import {
  ArrowRight,
  BarChart3,
  GraduationCap,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  WalletCards,
} from "lucide-react";

import { MENTORSHIP_PATH } from "@/lib/courses/routes";
import type { WebsiteContent } from "@/types/website";

export const supportWhatsAppNumber = "+2349035853860";

/**
 * Compiled-in defaults for every column of `public.website_settings`.
 *
 * These are the values the site shipped with, and they remain the single source of truth
 * for each string. 011_create_website_settings.sql seeds one row with every content column
 * NULL, and null means "use the default from here" — so a fresh database, a partially
 * filled row, a dropped table and a failed query all render exactly this copy rather than
 * blank space. The admin form shows each of these as its field's placeholder, so an
 * administrator can see what they are overriding.
 *
 * `signalGroupUrl` is deliberately absent: there is no independent default for it. When the
 * column is unset the signals page uses the resolved Telegram URL, which is what it did
 * before the column existed — see resolveWebsiteSettings.
 *
 * `countdown` is absent for a stronger reason, which is why this object is not simply
 * `satisfies WebsiteContent` minus one key. Two of its three columns have no default at all:
 * an unset `countdown_session_at` means the hero renders no countdown, because there is no
 * honest default for "when is the next session", and `countdown_enabled` is a switch rather
 * than a value. Only the title has a default, and it is `countdownTitle` below.
 */
export const WEBSITE_DEFAULTS = {
  heroTitle: "Trade with structure, confidence, and a mentor-led path.",
  heroSubtitle:
    "Structured forex mentorship with a clear path from market foundations to live execution. Browse a program, enroll online, and pay by bank transfer — every enrollment is reviewed by hand.",
  heroStats: [
    { value: "5+", label: "Years trading" },
    { value: "1,000+", label: "Students trained" },
    { value: "50+", label: "Funded traders" },
  ],
  /**
   * Heading above the countdown, used when `countdown_title` is unset.
   *
   * Unlike every other default here this one is never rendered on its own: it only appears
   * once an administrator has switched the countdown on and set a session moment, so it is
   * the caption for a date rather than copy the site ships with.
   */
  countdownTitle: "Next live mentorship session",
  telegramUrl: "https://t.me/Drizzypipz",
  brokerName: "Exness",
  brokerDescription:
    "A globally used broker recommended for students who need straightforward account setup, fast execution, and reliable withdrawals.",
  brokerUrl: "https://one.exnessonelink.com/a/8a8m0r1s9v",
  instagramUrl: "https://instagram.com/drizzypipsacademy",
  tiktokUrl: "https://tiktok.com/@drizzypips",
  contactEmail: "contact@drizzypips.com",
  footerTagline:
    "A premium mentorship platform for learning trading with structure, practical guidance, and direct support at every step.",
  /**
   * The year is computed rather than written, because the footer's hardcoded "© 2026" would
   * have been wrong from the first of January. An administrator who sets this column takes
   * the year over with it.
   */
  footerCopyright: `© ${new Date().getFullYear()} Drizzypips. All rights reserved.`,
} as const satisfies Omit<WebsiteContent, "signalGroupUrl" | "countdown"> & {
  countdownTitle: string;
};

export const homepageNavItems = [
  { name: "Mentorship", href: "/mentorship", external: false },
  { name: "Signals", href: "/signals", external: false },
  { name: "Telegram Channel", href: "/telegram", external: false },
  { name: "Broker", href: "/broker", external: false },
] as const;

export const featureCards = [
  {
    icon: GraduationCap,
    title: "Structured mentorship",
    description:
      "Clear learning paths from beginner foundations to live-market execution and strategy refinement.",
  },
  {
    icon: BarChart3,
    title: "Practical market training",
    description:
      "Learn chart breakdowns, risk management, trade planning, and execution with real examples.",
  },
  {
    icon: ShieldCheck,
    title: "Risk-first education",
    description:
      "Build disciplined habits before chasing entries, so trading decisions stay measured and repeatable.",
  },
  {
    icon: MessageCircle,
    title: "Direct support",
    description:
      "Reach a person on WhatsApp or Telegram at any point — choosing a program, paying, or after your receipt is in.",
  },
] as const;

export const testimonials = [
  {
    name: "Ngozi Okafor",
    role: "Trader",
    image: "/image/ngozi.avif",
    quote: "Drizzypips mentorship made the learning curve clearer and helped me trade with confidence.",
  },
  {
    name: "Bola Adeyemi",
    role: "Student Trader",
    image: "/image/bola.avif",
    quote: "The risk management lessons changed how I approach every setup.",
  },
  {
    name: "Ifeanyi Uzo",
    role: "Prop Firm Trader",
    image: "/image/ifenyi.avif",
    quote: "The mentorship helped me become more disciplined and consistent.",
  },
] as const;

export const faqs = [
  {
    question: "Do I need trading experience before joining?",
    answer:
      "No. The mentorship is designed to support beginners while still giving growing traders a structured path.",
  },
  {
    question: "How do I enroll and pay?",
    answer:
      "Choose a program, fill in the enrollment form, transfer the fee to the bank details shown on the payment step, then upload your receipt. Every enrollment is reviewed by hand, and the confirmation link you get shows where yours stands.",
  },
  {
    question: "Can I still contact Drizzypips directly?",
    answer:
      "Yes. WhatsApp and Telegram links sit in the footer of every page, so you can ask before choosing a program or after your receipt is in.",
  },
] as const;

export const brokerBenefits = [
  { icon: TrendingUp, label: "Fast execution" },
  { icon: WalletCards, label: "Instant withdrawals" },
  { icon: Target, label: "Beginner friendly" },
  { icon: Sparkles, label: "Mentor recommended" },
] as const;

export const mentorshipWhatsAppMessage =
  "Hi Drizzypips, I'm interested in your mentorship programs. Please guide me on the best option.";

export const consultationWhatsAppMessage =
  "Hi Drizzypips, I'd like to book a free consultation to choose the right mentorship program.";

export const heroPrimaryCta = {
  label: "Explore Mentorship",
  /**
   * The catalogue route, taken from courses/routes.ts rather than written again here — that
   * module exists so the path has one definition. It used to be `#mentorship`, an in-page
   * anchor to a section of hardcoded programs that led nowhere; the section below it now lists
   * real courses, and this button goes to the full list.
   */
  href: MENTORSHIP_PATH,
  icon: ArrowRight,
} as const;
