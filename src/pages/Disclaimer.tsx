import Navbar from "@/components/Layout/Navbar";
import Footer from "@/components/Layout/Footer";
import React from "react";

const Disclaimer: React.FC = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-16">
        <div className="container mx-auto px-4 py-20 max-w-3xl">
          <h1 className="text-4xl font-bold text-center mb-8">Legal Disclaimer</h1>
          <p className="text-muted-foreground">
            All information provided on DrizzyPipsHub is for <strong>educational purposes only</strong>.
            Trading in financial markets involves risk and may not be suitable for everyone.
            Past performance is not indicative of future results.
          </p>
          <p className="text-muted-foreground mt-4">
            DrizzyPipsHub will not be held liable for any losses incurred based on the information or resources provided on this site.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Disclaimer;
