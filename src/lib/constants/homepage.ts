import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Crown,
  GraduationCap,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";

export const supportWhatsAppNumber = "+2349035853860";
export const telegramCommunityUrl = "https://t.me/Drizzypipz";
export const brokerAffiliateUrl = "https://one.exnessonelink.com/a/8a8m0r1s9v";

export const homepageNavItems = [
  { name: "Mentorship", href: "/mentorship", external: false },
  { name: "Signals", href: "/signals", external: false },
  { name: "Telegram Channel", href: "/telegram", external: false },
  { name: "Broker", href: "/broker", external: false },
] as const;

export const heroStats = [
  { value: "5+", label: "Years trading" },
  { value: "1,000+", label: "Students trained" },
  { value: "50+", label: "Funded traders" },
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
      "Students can reach support quickly while the platform evolves toward a full self-service flow.",
  },
] as const;

export const mentorshipPrograms = [
  {
    icon: BookOpen,
    name: "General Online Class",
    price: "$100",
    description: "A focused online program for beginners building strong market fundamentals.",
    highlights: ["Beginner to advanced knowledge", "Risk management basics", "Strategy selection"],
    badge: "Starter",
  },
  {
    icon: Users,
    name: "Live Physical Class",
    price: "$150",
    description: "Hands-on class experience with live feedback and practical chart sessions.",
    highlights: ["Technical breakdowns", "Live trading practice", "Direct mentor feedback"],
    badge: "Popular",
  },
  {
    icon: Crown,
    name: "Special Physical Class",
    price: "$520",
    description: "Premium one-on-one mentorship with immersive practical learning.",
    highlights: ["Personal strategy work", "Live mentor trading", "Accommodation inclusive"],
    badge: "Premium",
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
    question: "Is the new enrollment flow available yet?",
    answer:
      "Not in this phase. This homepage prepares the product experience while enrollment, payment, and receipt upload come in later phases.",
  },
  {
    question: "Can I still contact Drizzypips directly?",
    answer:
      "Yes. WhatsApp and Telegram contact paths are preserved so visitors can still ask questions immediately.",
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
  href: "#mentorship",
  icon: ArrowRight,
} as const;
