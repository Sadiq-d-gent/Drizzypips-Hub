import { CheckCircle } from "lucide-react";
import mentorPortrait from "@/assets/mentor-portrait.jpg";

const MentorSection = () => {
  const achievements = [
    "5+ Years Professional Trading Experience",
    "Developed Proven Trading Strategies",
    "Helped 1000+ Students Achieve Profitability",
    "Specialized in Risk Management & Psychology",
    "Live Trading Education Expert",
    "Multiple Funded Trading Account Holder"
  ];

  return (
    <section className="py-20 bg-background" id="mentor">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Image */}
          <div data-aos="fade-right" className="relative">
            <div className="relative">
              <img
                src={mentorPortrait}
                alt="Drizzypips - Professional Forex Mentor"
                className="rounded-2xl shadow-premium w-full max-w-md mx-auto animate-float"
              />
              <div className="absolute -top-4 -right-4 w-20 h-20 bg-gradient-primary rounded-full flex items-center justify-center shadow-glow">
                <CheckCircle className="h-10 w-10 text-white" />
              </div>
            </div>
          </div>

          {/* Content */}
          <div data-aos="fade-left" className="space-y-8">
            <div>
              <h2 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">
                Meet Your 
                <span className="block text-primary">Forex Mentor</span>
              </h2>
              <p className="text-xl text-muted-foreground leading-relaxed">
                I'm Drizzypips, a professional Forex trader with over 5 years of experience 
                in the financial markets. My journey from a complete beginner to a successful 
                trader has equipped me with the knowledge and strategies to help you achieve 
                the same success.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-2xl font-semibold text-foreground mb-4">
                Why Choose My Mentorship?
              </h3>
              <div className="grid grid-cols-1 gap-3">
                {achievements.map((achievement, index) => (
                  <div
                    key={index}
                    className="flex items-center space-x-3 group"
                    data-aos="fade-up"
                    data-aos-delay={index * 50}
                  >
                    <CheckCircle className="h-5 w-5 text-success flex-shrink-0 group-hover:scale-110 transition-transform" />
                    <span className="text-foreground">{achievement}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gradient-card p-6 rounded-xl border border-border">
              <blockquote className="text-lg italic text-muted-foreground">
                "My mission is to provide you with the exact strategies, mindset, and 
                tools that transformed my trading. I believe in practical education 
                through live trading and real market experience."
              </blockquote>
              <footer className="mt-4">
                <cite className="text-primary font-semibold">— Drizzypips</cite>
              </footer>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default MentorSection;