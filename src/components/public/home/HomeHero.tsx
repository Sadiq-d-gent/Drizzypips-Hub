import { MessageCircle, PlayCircle, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { heroPrimaryCta, heroStats, telegramCommunityUrl } from "@/lib/constants/homepage";
import heroTradingImage from "@/assets/hero-trading.jpg";

const HomeHero = () => {
  const PrimaryIcon = heroPrimaryCta.icon;

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
              Trade with structure, confidence, and a mentor-led path.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
              Drizzypips Hub is evolving into a polished mentorship platform where students can
              discover programs, learn the process, and connect with support without friction.
            </p>

            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <Button asChild size="lg" className="btn-premium min-h-12 rounded-xl px-7">
                <a href={heroPrimaryCta.href}>
                  {heroPrimaryCta.label}
                  <PrimaryIcon className="h-5 w-5" />
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="min-h-12 rounded-xl border-white/25 bg-white/10 px-7 text-white hover:bg-white hover:text-slate-950"
              >
                <a href={telegramCommunityUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-5 w-5" />
                  Join Telegram
                </a>
              </Button>
            </div>

            <div className="mt-10 grid max-w-2xl grid-cols-3 gap-3 sm:gap-5">
              {heroStats.map((stat) => (
                <div
                  key={stat.label}
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
                    Phase 1 focuses on a premium homepage foundation. Enrollment, payment, and
                    receipt upload flows arrive in later approved phases.
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
