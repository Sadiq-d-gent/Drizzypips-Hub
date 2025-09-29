import Navbar from "@/components/Layout/Navbar";
import Footer from "../components/Layout/Footer";
import React from "react";

const PrivacyPolicy: React.FC = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-16">
        <div className="container mx-auto px-4 py-20 max-w-3xl">
          <h1 className="text-4xl font-bold text-center mb-8">Privacy Policy</h1>
          <p className="text-muted-foreground mb-4">
            At DrizzyPipsHub, we respect your privacy and are committed to protecting it.
          </p>
          <ul className="list-disc pl-6 text-muted-foreground space-y-2">
            <li><strong>Information We Collect:</strong> We may collect your name, email, and browsing information.</li>
            <li><strong>How We Use It:</strong> To improve our services, send updates, and respond to inquiries.</li>
            <li><strong>Third-Party Sharing:</strong> We do not sell your data. We may share it only when required by law.</li>
            <li><strong>Cookies:</strong> Our website may use cookies to improve your experience.</li>
          </ul>
          <p className="text-muted-foreground mt-4">
            For questions, contact us at{" "}
            <a href="mailto:Drizzypips@gmail.com" className="text-primary underline">
              Drizzypips@gmail.com
            </a>.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
