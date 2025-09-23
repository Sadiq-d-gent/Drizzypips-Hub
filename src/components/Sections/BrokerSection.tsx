import { ExternalLink, Play, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import exnessLogo from "@/assets/exness-logo.jpg";

const BrokerSection = () => {
  const broker = {
    name: "Exness",
    description:
      "Globally trusted broker with lightning-fast execution, zero hidden fees, and deep liquidity. Ideal for both beginners and professional traders who need reliability and transparency.",
    setupVideoId: "dQw4w9WgXcQ",
    refLink: "https://one.exnessonelink.com/a/8a8m0r1s9v", // Use your affiliate/referral link
    features: [
      "Spreads from 0.0 pips",
      "Instant Withdrawals",
      "MetaTrader 4 & 5",
      "24/7 Multilingual Support",
    ],
    rating: 5,
  };

  const handleVideoClick = () => {
    window.open(`https://www.youtube.com/watch?v=${broker.setupVideoId}`, "_blank");
  };

  const handleBrokerLink = () => {
    window.open(broker.refLink, "_blank");
  };

  return (
    <section className="py-20 bg-muted/30" id="brokers">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div data-aos="fade-up" className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">
            Featured Broker
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            The broker I personally use and recommend for all Drizzypips mentees.
          </p>
        </div>

        {/* Featured Broker Card */}
        <div
          data-aos="fade-up"
          className="premium-card relative overflow-hidden p-8 text-center"
        >
          <div className="flex flex-col items-center mb-6">
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-4 shadow-lg border border-border">
              <img
                src={exnessLogo}
                alt="Exness Logo"
                className="w-16 h-16 object-contain"
              />
            </div>
            <h3 className="text-3xl font-bold text-foreground">{broker.name}</h3>
            <div className="flex space-x-1 text-yellow-400 my-3">
              {[...Array(broker.rating)].map((_, i) => (
                <span key={i}>⭐</span>
              ))}
            </div>
            <p className="text-muted-foreground max-w-2xl">{broker.description}</p>

            {/* Trust Badge */}
            <div className="flex items-center space-x-2 bg-success/10 px-4 py-2 rounded-full mt-4">
              <ShieldCheck className="text-success h-5 w-5" />
              <span className="text-success font-medium">
                Personally Recommended by Drizzypips
              </span>
            </div>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left mb-8">
            {broker.features.map((feature, index) => (
              <div
                key={index}
                className="flex items-center space-x-3 text-muted-foreground"
              >
                <div className="w-2 h-2 bg-success rounded-full" />
                <span>{feature}</span>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={handleVideoClick}
              variant="outline"
              className="flex items-center justify-center group"
            >
              <Play className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform" />
              Watch Setup Guide
            </Button>

            <Button
              onClick={handleBrokerLink}
              className="btn-premium flex items-center justify-center"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Account
            </Button>
          </div>
        </div>

        {/* Why Exness */}
        <div
          data-aos="fade-up"
          data-aos-delay="200"
          className="mt-16 text-center bg-gradient-card p-8 rounded-2xl border border-border"
        >
          <h3 className="text-2xl font-bold text-foreground mb-4">
            Why Exness?
          </h3>
          <p className="text-lg text-muted-foreground mb-6">
            Exness offers institutional-grade trading conditions with
            ultra-reliable execution, making it perfect for both retail and
            professional traders worldwide.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4">
              <div className="text-3xl font-bold text-success mb-2">✓</div>
              <div className="font-semibold text-foreground">Trusted Globally</div>
              <div className="text-sm text-muted-foreground">
                Regulated in multiple jurisdictions
              </div>
            </div>
            <div className="p-4">
              <div className="text-3xl font-bold text-success mb-2">⚡</div>
              <div className="font-semibold text-foreground">Lightning Execution</div>
              <div className="text-sm text-muted-foreground">
                Super-fast order matching with minimal slippage
              </div>
            </div>
            <div className="p-4">
              <div className="text-3xl font-bold text-success mb-2">💳</div>
              <div className="font-semibold text-foreground">Instant Withdrawals</div>
              <div className="text-sm text-muted-foreground">
                Get your profits in minutes, 24/7
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default BrokerSection;
