import Navbar from "@/components/Layout/Navbar";
import Footer from "@/components/Layout/Footer";
import React from "react";

const RefundPolicy: React.FC = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-16">
        <div className="container mx-auto px-4 py-20 max-w-3xl">
          <h1 className="text-4xl font-bold text-center mb-8">Return & Refund Policy</h1>
          <p className="text-muted-foreground mb-4">
            At DrizzyPipsHub, we aim to ensure customer satisfaction.
          </p>
          <ul className="list-disc pl-6 text-muted-foreground space-y-2">
            <li><strong>Digital Products:</strong> All sales are final and non-refundable once accessed or delivered.</li>
            <li>
              <strong>Exceptional Cases:</strong> If you believe you are entitled to a refund, contact us within 7 days at{" "}
              <a href="mailto:Drizzypips@gmail.com" className="text-primary underline">
                Drizzypips@gmail.com
              </a>.
            </li>
          </ul>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default RefundPolicy;
