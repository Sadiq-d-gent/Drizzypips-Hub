import { Check, Star, MessageCircle, Crown, Users, Video, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const PricingSection = () => {
  const pricingPlans = [
    {
      name: "GENERAL ONLINE CLASS",
      price: "$100",
      description: "Perfect for beginners starting their Forex journey",
      features: [
        "Beginner to advanced knowledge",
        "Learn how to choose a strategy",
        "Learn risk management",
        "Learn how to use strategies",
        "Basic trading psychology",
        "Market analysis fundamentals",
        "Entry and exit techniques"
      ],
      icon: BookOpen,
      color: "border-border",
      badge: null,
      whatsappMessage: "Hi Drizzypips, I'm interested in the General Online Class ($100). Can you tell me more?",
    },
    {
      name: "LIVE PHYSICAL CLASS",
      price: "$150", 
      description: "Hands-on learning with live trading experience",
      features: [
        "Learn how to break down technicals",
        "Learn from scratch",
        "Trade live while you learn", 
        "Perfect your strategy",
        "Direct mentor feedback",
        "Small group sessions",
        "Practice with real accounts"
      ],
      icon: Users,
      color: "border-primary",
      badge: "Popular",
      whatsappMessage: "Hi Drizzypips, I'm interested in the Live Physical Class ($150). When is the next session?",
    },
    {
      name: "INNER CIRCLE",
      price: "$150",
      commitment: "$300+ Account Funding",
      description: "Exclusive access with funded account opportunity",
      features: [
        "Get account funded with $300+",
        "Pay $150 commitment fee",
        "Live analysis sessions",
        "Live trading with mentor",
        "Learn strategy while trading",
        "Priority support",
        "Advanced risk management"
      ],
      icon: Crown,
      color: "border-success",
      badge: "Exclusive",
      whatsappMessage: "Hi Drizzypips, I'm interested in the Inner Circle program ($150). How does the funding work?",
    },
    {
      name: "SPECIAL ONLINE CLASS",
      price: "$320",
      description: "Comprehensive online mentorship program",
      features: [
        "Learn beginner to advanced techniques",
        "Learn DRIZZYPIPs personal strategies",
        "Take my trades along with my strategies",
        "Advanced chart analysis",
        "Psychology mastery",
        "Risk management systems",
        "Weekly live sessions"
      ],
      icon: Video,
      color: "border-primary",
      badge: "Comprehensive",
      whatsappMessage: "Hi Drizzypips, I'm interested in the Special Online Class ($320). What's included?",
    },
    {
      name: "SPECIAL PHYSICAL CLASS",
      price: "$520",
      description: "Ultimate 1-on-1 mentorship experience",
      features: [
        "Physical 1-on-1 class with DRIZZYPIPs",
        "Learn beginner to advanced",
        "Learn DRIZZYPIPs personal strategies",
        "Trade live with DRIZZYPIPs",
        "Accommodation inclusive",
        "Complete lifestyle immersion",
        "Personalized trading plan"
      ],
      icon: Star,
      color: "border-success shadow-glow",
      badge: "Premium",
      whatsappMessage: "Hi Drizzypips, I'm interested in the Special Physical Class ($520). Can you provide more details about the accommodation and schedule?",
    },
  ];

  const handleWhatsAppClick = (message: string) => {
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/+2349035853860?text=${encodedMessage}`, '_blank');
  };

  return (
    <section className="py-20 bg-background" id="pricing">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div data-aos="fade-up" className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">
            Choose Your
            <span className="block text-primary">Mentorship Program</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Flexible learning options designed to fit your schedule, budget, and trading goals. 
            Each program includes lifetime support and proven strategies.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {pricingPlans.map((plan, index) => {
            const IconComponent = plan.icon;
            return (
              <div
                key={plan.name}
                data-aos="fade-up"
                data-aos-delay={index * 100}
                className={`premium-card relative ${plan.color} h-full flex flex-col`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-gradient-primary text-white px-4 py-1">
                      {plan.badge}
                    </Badge>
                  </div>
                )}

                <div className="text-center mb-6">
                  <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-primary mb-4 shadow-glow`}>
                    <IconComponent className="h-8 w-8 text-white" />
                  </div>
                  
                  <h3 className="text-xl font-bold text-foreground mb-2">
                    {plan.name}
                  </h3>
                  
                  <div className="mb-2">
                    <span className="text-4xl font-bold text-primary">{plan.price}</span>
                    {plan.commitment && (
                      <div className="text-sm text-muted-foreground mt-1">
                        + {plan.commitment}
                      </div>
                    )}
                  </div>
                  
                  <p className="text-sm text-muted-foreground">
                    {plan.description}
                  </p>
                </div>

                <div className="flex-1 space-y-3 mb-8">
                  {plan.features.map((feature, featureIndex) => (
                    <div
                      key={featureIndex}
                      className="flex items-start space-x-3"
                    >
                      <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-muted-foreground">{feature}</span>
                    </div>
                  ))}
                </div>

                <Button
                  onClick={() => handleWhatsAppClick(plan.whatsappMessage)}
                  className="btn-premium w-full group"
                >
                  <MessageCircle className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform" />
                  Join Now
                </Button>
              </div>
            );
          })}
        </div>

        <div data-aos="fade-up" data-aos-delay="500" className="mt-16 text-center">
          <div className="bg-gradient-card p-8 rounded-2xl border border-border max-w-4xl mx-auto">
            <h3 className="text-2xl font-bold text-foreground mb-4">
              Not Sure Which Program Is Right for You?
            </h3>
            <p className="text-lg text-muted-foreground mb-6">
              Book a free consultation call to discuss your trading goals and find the perfect mentorship program for your needs.
            </p>
            <Button
              onClick={() => handleWhatsAppClick("Hi Drizzypips, I'd like to book a free consultation to discuss which mentorship program would be best for me.")}
              className="btn-outline-premium"
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Book Free Consultation
            </Button>
          </div>
        </div>

        {/* Money Back Guarantee */}
        <div data-aos="fade-up" data-aos-delay="600" className="mt-12 text-center">
          <div className="flex items-center justify-center space-x-2 text-success">
            <div className="w-8 h-8 bg-success rounded-full flex items-center justify-center">
              <Check className="h-5 w-5 text-white" />
            </div>
            <span className="font-semibold">30-Day Money-Back Guarantee</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Not satisfied? Get a full refund within 30 days, no questions asked.
          </p>
        </div>
      </div>
    </section>
  );
};

export default PricingSection;