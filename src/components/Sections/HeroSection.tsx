import { ArrowRight, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroTradingImage from "@/assets/hero-trading.jpg";

const HeroSection = () => {
  const scrollToPricing = () => {
    const element = document.getElementById("pricing");
    element?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden" id="hero">
      {/* Background Video/Image */}
      <div className="absolute inset-0 z-0">
        <div
          className="w-full h-full bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${heroTradingImage})` }}
        />
        <div className="absolute inset-0 video-overlay" />
      </div>

      {/* Animated Background Elements */}
      <div className="absolute inset-0 z-10">
        <div className="absolute top-20 left-10 w-2 h-2 bg-success rounded-full animate-pulse" />
        <div className="absolute top-40 right-20 w-3 h-3 bg-primary rounded-full animate-float" />
        <div className="absolute bottom-40 left-20 w-1 h-1 bg-success rounded-full animate-pulse" />
        <div className="absolute bottom-20 right-10 w-2 h-2 bg-primary rounded-full animate-float" />
      </div>

      {/* Content */}
      <div className="relative z-20 text-center max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div data-aos="fade-up" data-aos-delay="100">
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight">
            Master Forex Trading
            <span className="block text-glow bg-gradient-to-r from-success to-primary bg-clip-text text-transparent">
              with Drizzypips
            </span>
          </h1>
        </div>

        <div data-aos="fade-up" data-aos-delay="200">
          <p className="text-xl sm:text-2xl text-gray-300 mb-8 max-w-3xl mx-auto leading-relaxed">
            Learn with expert mentorship, live trading sessions, and proven strategies
            that have helped thousands achieve financial freedom.
          </p>
        </div>

        <div data-aos="fade-up" data-aos-delay="300" className="flex flex-col sm:flex-row gap-6 justify-center items-center">
          {/* Join Mentorship Button */}
          <Button
            onClick={scrollToPricing}
            size="lg"
            className="btn-premium text-lg px-8 py-6 shadow-glow"
          >
            Join Mentorship
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>

          {/* New Join Telegram Button */}
          <Button
            asChild
            variant="outline"
            size="lg"
            className="btn-outline-premium text-lg px-8 py-6 group"
          >
            <a
              href="https://t.me/drizzypipscommunity"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center"
            >
              <MessageCircle className="mr-2 h-5 w-5 group-hover:scale-110 transition-transform text-primary" />
              Join Our TG Community
            </a>
          </Button>
        </div>

        {/* Scroll Indicator */}
        <div
          data-aos="fade-up"
          data-aos-delay="500"
          className="absolute bottom-8 left-1/2 transform -translate-x-1/2"
        >
          <div className="animate-bounce">
            <div className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center">
              <div className="w-1 h-3 bg-white rounded-full mt-2 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
