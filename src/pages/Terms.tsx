import Navbar from "@/components/Layout/Navbar";
import Footer from "@/components/Layout/Footer";
import React from "react";

const Terms: React.FC = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-16">
        <div className="container mx-auto px-4 py-20 max-w-3xl">
          <h1 className="text-4xl font-bold text-center mb-8">Terms & Conditions</h1>
          <p className="text-muted-foreground mb-4">
            Welcome to DrizzyPipsHub. By accessing our website, you agree to comply with and be bound by the following terms:
          </p>
          <ul className="list-disc pl-6 text-muted-foreground space-y-2">
            <li><strong>Use of Content:</strong> All information on this site is for educational purposes only.</li>
            <li><strong>No Financial Advice:</strong> We are not liable for any financial decisions you make based on the content provided.</li>
            <li><strong>User Conduct:</strong> You agree not to misuse the site or attempt to interfere with its functionality.</li>
            <li><strong>Changes:</strong> We may update these terms at any time. Continued use of the site means you accept the updated terms.</li>
          </ul>
          <p className="text-muted-foreground mt-4">
            If you do not agree with these terms, please discontinue using our website.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Terms;
