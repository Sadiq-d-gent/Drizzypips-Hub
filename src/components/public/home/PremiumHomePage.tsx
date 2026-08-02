import BrokerSection from "@/components/public/home/BrokerSection";
import FaqSection from "@/components/public/home/FaqSection";
import FeaturesSection from "@/components/public/home/FeaturesSection";
import HomeCtaSection from "@/components/public/home/HomeCtaSection";
import HomeHero from "@/components/public/home/HomeHero";
import MentorshipPreviewSection from "@/components/public/home/MentorshipPreviewSection";
import TestimonialsSection from "@/components/public/home/TestimonialsSection";

const PremiumHomePage = () => {
  return (
    <main>
      <HomeHero />
      <FeaturesSection />
      <MentorshipPreviewSection />
      <TestimonialsSection />
      <BrokerSection />
      <FaqSection />
      <HomeCtaSection />
    </main>
  );
};

export default PremiumHomePage;
