import { ExternalLink, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

const BrokerSection = () => {
  const brokers = [
    {
      name: "IC Markets",
      description: "Professional ECN broker with tight spreads and fast execution. Perfect for scalping and high-frequency trading strategies.",
      setupVideoId: "dQw4w9WgXcQ",
      refLink: "https://icmarkets.com?ref=drizzypips",
      features: ["Raw Spreads from 0.0 pips", "MetaTrader 4 & 5", "cTrader Platform", "24/7 Support"],
      rating: "⭐⭐⭐⭐⭐",
    },
    {
      name: "XM Global",
      description: "Regulated broker with excellent education resources and flexible account types. Great for beginners and experienced traders.",
      setupVideoId: "dQw4w9WgXcQ", 
      refLink: "https://xm.com?ref=drizzypips",
      features: ["$5 Minimum Deposit", "1:888 Leverage", "100+ Instruments", "No Requotes"],
      rating: "⭐⭐⭐⭐⭐",
    },
    {
      name: "FTMO",
      description: "Leading prop trading firm offering funded accounts up to $400k. Perfect for skilled traders looking for capital.",
      setupVideoId: "dQw4w9WgXcQ",
      refLink: "https://ftmo.com?ref=drizzypips", 
      features: ["Up to $400k Funding", "80% Profit Split", "Free Retries", "Scaling Program"],
      rating: "⭐⭐⭐⭐⭐",
    },
    {
      name: "MyForexFunds",
      description: "Fast-growing prop firm with competitive profit splits and flexible trading rules. Quick evaluation process.",
      setupVideoId: "dQw4w9WgXcQ",
      refLink: "https://myforexfunds.com?ref=drizzypips",
      features: ["85% Profit Split", "No Time Limits", "$300k Max Funding", "Instant Funding"],
      rating: "⭐⭐⭐⭐⭐",
    },
  ];

  const handleVideoClick = (videoId: string, brokerName: string) => {
    window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
  };

  const handleBrokerLink = (link: string, brokerName: string) => {
    window.open(link, '_blank');
  };

  return (
    <section className="py-20 bg-muted/30" id="brokers">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div data-aos="fade-up" className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">
            Recommended Brokers
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Trusted brokers and prop firms that I personally use and recommend. 
            Each comes with detailed setup guides and exclusive benefits.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {brokers.map((broker, index) => (
            <div
              key={broker.name}
              data-aos="fade-up"
              data-aos-delay={index * 100}
              className="premium-card"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-2xl font-bold text-foreground mb-2">
                    {broker.name}
                  </h3>
                  <div className="text-sm text-muted-foreground">
                    {broker.rating}
                  </div>
                </div>
                <div className="w-16 h-16 bg-gradient-primary rounded-xl flex items-center justify-center">
                  <span className="text-white font-bold text-lg">
                    {broker.name.substring(0, 2).toUpperCase()}
                  </span>
                </div>
              </div>

              <p className="text-muted-foreground mb-6 leading-relaxed">
                {broker.description}
              </p>

              <div className="space-y-3 mb-6">
                <h4 className="font-semibold text-foreground">Key Features:</h4>
                <ul className="space-y-2">
                  {broker.features.map((feature, featureIndex) => (
                    <li
                      key={featureIndex}
                      className="flex items-center space-x-2 text-sm text-muted-foreground"
                    >
                      <div className="w-1.5 h-1.5 bg-success rounded-full" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={() => handleVideoClick(broker.setupVideoId, broker.name)}
                  variant="outline"
                  className="flex-1 group"
                >
                  <Play className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform" />
                  Watch Setup Guide
                </Button>
                
                <Button
                  onClick={() => handleBrokerLink(broker.refLink, broker.name)}
                  className="btn-premium flex-1"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Account
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div data-aos="fade-up" data-aos-delay="400" className="mt-16 text-center">
          <div className="bg-gradient-card p-8 rounded-2xl border border-border max-w-4xl mx-auto">
            <h3 className="text-2xl font-bold text-foreground mb-4">
              Why These Brokers?
            </h3>
            <p className="text-lg text-muted-foreground mb-6">
              I've personally tested and traded with each of these brokers. They offer 
              the best combination of spreads, execution speed, regulation, and support 
              that every serious trader needs.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
              <div className="p-4">
                <div className="text-3xl font-bold text-success mb-2">✓</div>
                <div className="font-semibold text-foreground">Regulated</div>
                <div className="text-sm text-muted-foreground">All brokers are properly regulated</div>
              </div>
              <div className="p-4">
                <div className="text-3xl font-bold text-success mb-2">⚡</div>
                <div className="font-semibold text-foreground">Fast Execution</div>
                <div className="text-sm text-muted-foreground">Sub-second order execution</div>
              </div>
              <div className="p-4">
                <div className="text-3xl font-bold text-success mb-2">💰</div>
                <div className="font-semibold text-foreground">Competitive</div>
                <div className="text-sm text-muted-foreground">Best spreads and conditions</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default BrokerSection;