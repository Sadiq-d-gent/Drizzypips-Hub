import { ReactNode } from "react";

import Footer from "@/components/Layout/Footer";
import Navbar from "@/components/Layout/Navbar";
import WhatsAppButton from "@/components/WhatsAppButton";

type PublicPageLayoutProps = {
  children: ReactNode;
};

const PublicPageLayout = ({ children }: PublicPageLayoutProps) => {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <Navbar />
      <main className="pt-16">{children}</main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
};

export default PublicPageLayout;
