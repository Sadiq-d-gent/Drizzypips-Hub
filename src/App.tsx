import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import AOS from "aos";
import "aos/dist/aos.css";

import RouteScrollManager from "@/components/Layout/RouteScrollManager";
import Index from "./pages/Index";
import Mentorship from "./pages/Mentorship";
import Signals from "./pages/Signals";
import Telegram from "./pages/Telegram";
import Broker from "./pages/Broker";
import Accessibility from "./pages/Accessibility";
import Terms from "./pages/Terms";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import LegalDisclaimer from "./pages/Disclaimer";
import RefundPolicy from "./pages/RefundPolicy";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    AOS.init({
      duration: 1600,
      easing: "ease-out-cubic",
      once: true,
      offset: 100,
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <TooltipProvider>
          <Toaster />
          <Sonner />
         {/*
<BrowserRouter>
  <RouteScrollManager />
  <Routes>
    <Route path="/" element={<Index />} />
    <Route path="/mentorship" element={<Mentorship />} />
    <Route path="/signals" element={<Signals />} />
    <Route path="/telegram" element={<Telegram />} />
    <Route path="/broker" element={<Broker />} />

    <Route path="/accessibility" element={<Accessibility />} />
    <Route path="/terms" element={<Terms />} />
    <Route path="/privacy-policy" element={<PrivacyPolicy />} />
    <Route path="/disclaimer" element={<LegalDisclaimer />} />
    <Route path="/refund-policy" element={<RefundPolicy />} />

    <Route path="*" element={<NotFound />} />
  </Routes>
</BrowserRouter>
*/}

<div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 flex items-center justify-center px-6">
  <div className="max-w-2xl w-full bg-white rounded-3xl shadow-2xl p-10 text-center">
    <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-blue-100 flex items-center justify-center text-4xl">
      🚧
    </div>

    <h1 className="text-4xl font-bold text-slate-900 mb-4">
      Drizzypips
    </h1>

    <h2 className="text-2xl font-semibold text-slate-700 mb-4">
      We're Upgrading Your Experience
    </h2>

    <p className="text-slate-600 leading-8 mb-8">
      Our website is currently undergoing scheduled maintenance while we
      introduce exciting new features and improvements to better serve our
      students.
    </p>

    <div className="inline-flex items-center gap-3 bg-blue-50 text-blue-700 px-6 py-3 rounded-full font-medium">
      <span className="w-3 h-3 rounded-full bg-blue-600 animate-pulse"></span>
      Maintenance in Progress
    </div>

    <div className="mt-10 border-t pt-6 text-sm text-slate-500">
      <p>Thank you for your patience.</p>
      <p className="mt-2">
        We'll be back online as soon as the updates are complete.
      </p>
    </div>
  </div>
</div>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
