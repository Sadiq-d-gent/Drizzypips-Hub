import Navbar from "@/components/Layout/Navbar";
import Footer from "@/components/Layout/Footer";
import React from "react";

const Accessibility: React.FC = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-16">
        <div className="container mx-auto px-4 py-20 max-w-3xl">
          <h1 className="text-4xl font-bold text-center mb-8">Accessibility Statement</h1>
          <p className="text-muted-foreground mb-4">
            At DrizzyPipsHub, we are committed to ensuring that our website is accessible to all users,
            including people with disabilities. We strive to provide an inclusive experience and
            continuously improve the accessibility of our site.
          </p>
          <p className="text-muted-foreground">
            If you encounter any accessibility barriers, please contact us at{" "}
            <a href="mailto:your@email.com" className="text-primary underline">
              your@email.com
            </a>
            , and we will work to address the issue promptly.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Accessibility;
