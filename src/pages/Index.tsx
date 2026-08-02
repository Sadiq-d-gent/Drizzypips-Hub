import Navbar from "@/components/Layout/Navbar";
import Footer from "@/components/Layout/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import PremiumHomePage from "@/components/public/home/PremiumHomePage";

const Index = () => {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Navbar />
      <PremiumHomePage />
      <Footer />
      <WhatsAppButton />
    </div>
  );
};

export default Index;
