import { useEffect } from "react";
import Navbar from "@/components/Layout/Navbar";
import Footer from "@/components/Layout/Footer";
import HeroSection from "@/components/Sections/HeroSection";
import MentorSection from "@/components/Sections/MentorSection";
import StatsSection from "@/components/Sections/StatsSection";
import TestimonialsSection from "@/components/Sections/TestimonialsSection";
import BrokerSection from "@/components/Sections/BrokerSection";
import PricingSection from "@/components/Sections/PricingSection";
import WhatsAppButton from "@/components/WhatsAppButton";

const Index = () => {
  useEffect(() => {
    // Initialize any additional animations or effects
    const handleSmoothScroll = (e: Event) => {
      const target = e.target as HTMLAnchorElement;
      if (target.hash) {
        e.preventDefault();
        const element = document.querySelector(target.hash);
        element?.scrollIntoView({ behavior: "smooth" });
      }
    };

    // Add event listeners for smooth scrolling
    const links = document.querySelectorAll('a[href^="#"]');
    links.forEach(link => {
      link.addEventListener("click", handleSmoothScroll);
    });

    return () => {
      links.forEach(link => {
        link.removeEventListener("click", handleSmoothScroll);
      });
    };
  }, []);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Navbar />
      
      <main>
        <HeroSection />
        <MentorSection />
        <StatsSection />
        <TestimonialsSection />
        <BrokerSection />
        <PricingSection />
      </main>

      <Footer />
      <WhatsAppButton />
    </div>
  );
};

export default Index;