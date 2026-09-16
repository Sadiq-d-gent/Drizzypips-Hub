import { BellRing, PlayCircle, ShieldCheck, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

import MentorshipCountdown from "@/components/public/home/MentorshipCountdown";
import { Button } from "@/components/ui/button";
import { useWebsiteContent } from "@/hooks/useWebsiteSettings";
import { heroPrimaryCta } from "@/lib/constants/homepage";
import heroTradingImage from "@/assets/hero-trading.jpg";

const HomeHero = () => {
  const PrimaryIcon = heroPrimaryCta.icon;

  /**
   * Headline, paragraph, the three figures, the three CTA destinations and the session countdown
   * come from `website_settings` when set, and from the compiled-in defaults otherwise. There is
   * no loading branch on purpose: the resolver returns the shipped copy while the query is in
   * flight, so the hero paints once with real words rather than flashing empty. See
   * useWebsiteContent.
   *
   * The countdown is the one part with no default. `content.countdown` is null until an
   * administrator schedules a session, and null renders nothing.
   */
  const content = useWebsiteContent();

  return (
    <section
      id="hero"
      className="relative isolate min-h-screen overflow-hidden bg-trading-darker pt-24 text-white"
    >
      <div className="absolute inset-0 -z-20">
        <img
          src={heroTradingImage}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover opacity-35"
        />
      </div>
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.34),transparent_32%),linear-gradient(135deg,rgba(2,6,23,0.96),rgba(15,23,42,0.84)_45%,rgba(2,6,23,0.98))]" />
      <div className="absolute left-1/2 top-28 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/25 blur-3xl" />

      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-7xl items-center px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid w-full items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div data-aos="fade-up" className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white/80 backdrop-blur">
              <ShieldCheck className="h-4 w-4 text-success" />
              Premium forex mentorship for serious learners
            </div>

            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
              {content.heroTitle}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
              {content.heroSubtitle}
            </p>

            {/*
              THREE CTAs, AND THE BROKER IS THE LOUD ONE
              The client asked for attention to be drawn to the broker, so it gets a treatment no
              other button on the page has: a flat success fill with a ring and a halo, against a
              row where the other two are a gradient and an outline. The flag beside the label is
              doing the other half of that work, because a colour difference alone reads as "a
              second button" rather than as a recommendation.

              Explore Mentorship stays first. Visual weight and reading order are different
              things, and the mentorship catalogue is still what most of this page is about.

              `flex-wrap` rather than a three-column grid: three buttons at these widths will not
              fit on one line on a small tablet, and wrapping is the behaviour that cannot
              overflow horizontally at any viewport. At 375px they stack full-width.
            */}
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
              <Button asChild size="lg" className="btn-premium min-h-12 rounded-xl px-7">
                {/*
                  A router Link to the catalogue, not an anchor to a section further down this
                  page. The section below now lists real published courses, and the visitor who
                  clicks "Explore Mentorship" wants the full list and the enrollment flow behind
                  it, whereas an in-page jump left them on a page with nowhere to go.
                */}
                <Link to={heroPrimaryCta.href}>
                  {heroPrimaryCta.label}
                  <PrimaryIcon className="h-5 w-5" />
                </Link>
              </Button>

              <Button
                asChild
                size="lg"
                className="min-h-12 rounded-xl bg-success px-7 font-semibold text-success-foreground shadow-success ring-2 ring-success/45 ring-offset-2 ring-offset-trading-darker transition-all duration-300 hover:scale-[1.02] hover:bg-success hover:shadow-glow active:scale-95"
              >
                {/*
                  `content.brokerName` rather than the word "Broker", so the button names the
                  broker the client actually recommends and follows the settings row when that
                  changes. The URL is the same editable column the /broker page uses.
                */}
                <a href={content.brokerUrl} target="_blank" rel="noopener noreferrer">
                  <TrendingUp className="h-5 w-5" />
                  Open {content.brokerName} account
                  <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">
                    Recommended
                  </span>
                </a>
              </Button>

              <Button
                asChild
                size="lg"
                variant="outline"
                className="min-h-12 rounded-xl border-white/25 bg-white/10 px-7 text-white hover:bg-white hover:text-slate-950"
              >
                {/*
                  `signalGroupUrl`, which resolveWebsiteSettings falls back to `telegramUrl` for
                  while no distinct group link is set. That fallback is why this CTA needed no new
                  column and no hardcoded URL: before the column existed this destination *was*
                  the Telegram community, and it stays that until an administrator sets the group.
                */}
                <a href={content.signalGroupUrl} target="_blank" rel="noopener noreferrer">
                  <BellRing className="h-5 w-5" />
                  VIP Signal Group
                </a>
              </Button>
            </div>

            {/*
              Below the CTAs rather than above them, and that ordering is deliberate. The
              countdown arrives with the settings query while the rest of the hero paints from
              the compiled-in defaults, so anything placed above the buttons would push them
              down under the visitor's cursor a moment after the page settled. Here, a late
              arrival moves only the figures below it. It renders nothing at all when no session
              is configured, per MentorshipCountdown.
            */}
            <MentorshipCountdown countdown={content.countdown} />

            {/*
              Keyed by index rather than by label: the labels are administrator-editable now,
              so two of them can legitimately be identical for as long as it takes to finish
              typing the second one.
            */}
            <div className="mt-10 grid max-w-2xl grid-cols-3 gap-3 sm:gap-5">
              {content.heroStats.map((stat, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur"
                >
                  <div className="text-2xl font-bold text-white sm:text-3xl">{stat.value}</div>
                  <div className="mt-1 text-xs text-slate-300 sm:text-sm">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div data-aos="fade-left" className="relative hidden lg:block">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.08] p-4 shadow-2xl backdrop-blur-xl">
              <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-6">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-400">Mentorship dashboard</p>
                    <h2 className="mt-1 text-2xl font-semibold">Student growth snapshot</h2>
                  </div>
                  <div className="rounded-full bg-success/15 p-3 text-success">
                    <PlayCircle className="h-6 w-6" />
                  </div>
                </div>

                <div className="space-y-4">
                  {["Strategy clarity", "Risk discipline", "Live execution"].map((label, index) => (
                    <div key={label} className="rounded-2xl bg-white/[0.06] p-4">
                      <div className="mb-3 flex items-center justify-between text-sm">
                        <span className="text-slate-300">{label}</span>
                        <span className="font-medium text-white">{82 + index * 6}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/10">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-primary to-success"
                          style={{ width: `${82 + index * 6}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-2xl border border-success/20 bg-success/10 p-4">
                  <p className="text-sm leading-6 text-slate-200">
                    Enroll in minutes: choose a program, pay by bank transfer, then upload your
                    receipt. Every enrollment is checked by hand, and your confirmation page
                    tracks where it stands.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HomeHero;
