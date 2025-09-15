import { TrendingUp, Users, Target, Award } from "lucide-react";

const StatsSection = () => {
  const stats = [
    {
      icon: TrendingUp,
      value: "5+",
      label: "Years Trading",
      description: "Professional experience in Forex markets",
      color: "text-success",
    },
    {
      icon: Users,
      value: "1000+",
      label: "Students Trained",
      description: "Successful traders mentored worldwide",
      color: "text-primary",
    },
    {
      icon: Target,
      value: "85%",
      label: "Win Rate",
      description: "Consistent profitable trading strategy",
      color: "text-success",
    },
    {
      icon: Award,
      value: "50+",
      label: "Funded Traders",
      description: "Students who secured prop firm funding",
      color: "text-primary",
    },
  ];

  return (
    <section className="py-20 bg-muted/30" id="stats">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div data-aos="fade-up" className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">
            Proven Track Record
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Numbers that speak for themselves. See the results that have made 
            Drizzypips a trusted name in Forex education.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, index) => {
            const IconComponent = stat.icon;
            return (
              <div
                key={index}
                data-aos="fade-up"
                data-aos-delay={index * 100}
                className="premium-card text-center group cursor-pointer"
              >
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-primary mb-6 shadow-glow group-hover:scale-110 transition-transform duration-300`}>
                  <IconComponent className="h-8 w-8 text-white" />
                </div>
                
                <div className="mb-2">
                  <div className={`text-4xl sm:text-5xl font-bold ${stat.color} mb-2`}>
                    {stat.value}
                  </div>
                  <div className="text-xl font-semibold text-foreground mb-2">
                    {stat.label}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {stat.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Additional Info */}
        <div data-aos="fade-up" data-aos-delay="400" className="mt-16 text-center">
          <div className="bg-gradient-card p-8 rounded-2xl border border-border max-w-4xl mx-auto">
            <h3 className="text-2xl font-bold text-foreground mb-4">
              Join the Success Stories
            </h3>
            <p className="text-lg text-muted-foreground mb-6">
              These numbers represent real people who transformed their financial lives 
              through dedicated learning and proper mentorship. Your success story could be next.
            </p>
            <div className="flex justify-center">
              <button
                onClick={() => {
                  const element = document.getElementById("pricing");
                  element?.scrollIntoView({ behavior: "smooth" });
                }}
                className="btn-premium"
              >
                Start Your Journey
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default StatsSection;