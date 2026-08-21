import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import AOS from "aos";
import "aos/dist/aos.css";

import AdminGuard from "@/components/admin/AdminGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import RouteScrollManager from "@/components/Layout/RouteScrollManager";
import AdminAccount from "./pages/admin/AdminAccount";
import AdminCourseEdit from "./pages/admin/AdminCourseEdit";
import AdminCourseNew from "./pages/admin/AdminCourseNew";
import AdminCourses from "./pages/admin/AdminCourses";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminEnrollmentDetail from "./pages/admin/AdminEnrollmentDetail";
import AdminEnrollments from "./pages/admin/AdminEnrollments";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminSettings from "./pages/admin/AdminSettings";
import Index from "./pages/Index";
import Mentorship from "./pages/Mentorship";
import CourseDetail from "./pages/CourseDetail";
import CourseEnrollment from "./pages/CourseEnrollment";
import EnrollmentConfirmation from "./pages/EnrollmentConfirmation";
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
          <BrowserRouter>
            <RouteScrollManager />
            <Routes>
              {/* Main Routes */}
              <Route path="/" element={<Index />} />
              <Route path="/mentorship" element={<Mentorship />} />
              <Route path="/courses/:slug" element={<CourseDetail />} />
              <Route path="/courses/:slug/enroll" element={<CourseEnrollment />} />
              <Route path="/enrollment/:accessToken" element={<EnrollmentConfirmation />} />
              <Route path="/signals" element={<Signals />} />
              <Route path="/telegram" element={<Telegram />} />
              <Route path="/broker" element={<Broker />} />

              <Route path="/accessibility" element={<Accessibility />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/disclaimer" element={<LegalDisclaimer />} />
              <Route path="/refund-policy" element={<RefundPolicy />} />

              {/*
                Admin area. Login sits outside the guard — guarding it would redirect an
                administrator away from the page they need in order to sign in.

                The pages below nest under a layout route so the sidebar is not rebuilt on
                every navigation. AdminGuard is UX only: each page's queries are gated in
                the database by public.is_admin(), so bypassing the guard in the browser
                yields an empty panel rather than access.
              */}
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route
                path="/admin"
                element={
                  <AdminGuard>
                    <AdminLayout />
                  </AdminGuard>
                }
              >
                <Route index element={<AdminDashboard />} />
                <Route path="enrollments" element={<AdminEnrollments />} />
                <Route path="enrollments/:id" element={<AdminEnrollmentDetail />} />
                <Route path="courses" element={<AdminCourses />} />
                <Route path="courses/new" element={<AdminCourseNew />} />
                <Route path="courses/:id" element={<AdminCourseEdit />} />
                <Route path="settings" element={<AdminSettings />} />
                <Route path="account" element={<AdminAccount />} />
              </Route>

              {/* Catch-all for 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
