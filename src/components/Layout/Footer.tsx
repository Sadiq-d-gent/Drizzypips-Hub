import { Link } from "react-router-dom";
import { Instagram, MessageCircle, TrendingUp, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

const Footer = () => {
  const socialLinks = [
    {
      name: "Instagram",
      icon: Instagram,
      href: "https://instagram.com/drizzypipsacademy",
      color: "hover:text-pink-500",
    },
    {
      name: "TikTok",
      icon: TrendingUp,
      href: "https://tiktok.com/@drizzypips",
      color: "hover:text-black dark:hover:text-white",
    },
    {
      name: "WhatsApp",
      icon: MessageCircle,
      href: "https://wa.me/+2349035853860?text=Hi%20Drizzypips,%20I'm%20interested%20in%20your%20mentorship%20program", 
      color: "hover:text-success",
    },
  ];

  const quickLinks = [
    { name: "Home", href: "/" },
    { name: "Mentorship", href: "/mentorship" },
    { name: "Community", href: "/community" },
    { name: "Broker Guide", href: "/#brokers" },
  ];

  return (
    <footer className="bg-card border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <Link
              to="/"
              className="flex items-center space-x-2 font-bold text-xl text-primary mb-4"
            >
              <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">DP</span>
              </div>
              <span>Drizzypips</span>
            </Link>
            <p className="text-muted-foreground text-sm max-w-md mb-6">
              Master Forex trading with expert mentorship, live trading sessions, 
              and proven strategies. Join thousands of successful traders who've 
              transformed their financial future.
            </p>
            <div className="flex items-center space-x-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a
                href="mailto:contact@drizzypips.com"
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                contact@drizzypips.com
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">Quick Links</h3>
            <ul className="space-y-2">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    to={link.href}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Connect */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">Connect With Us</h3>
            <div className="flex flex-col space-y-3">
              {socialLinks.map((social) => {
                const IconComponent = social.icon;
                return (
                  <a
                    key={social.name}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center space-x-2 text-sm text-muted-foreground transition-colors ${social.color}`}
                  >
                    <IconComponent className="h-4 w-4" />
                    <span>{social.name}</span>
                  </a>
                );
              })}
              
              <Button
                asChild
                className="btn-premium mt-4"
              >
                <a
                  href="https://wa.me/+2349035853860?text=Hi%20Drizzypips,%20I'm%20interested%20in%20your%20mentorship%20program"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Contact Mentor
                </a>
              </Button>
            </div>
          </div>
        </div>

        <div className="border-t border-border mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-sm text-muted-foreground">
            © 2024 Drizzypips. All rights reserved.
          </p>
          <p className="text-sm text-muted-foreground mt-2 md:mt-0">
            Professional Forex Mentorship & Trading Education
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;