import { MessageCircle } from "lucide-react";
import { consultationWhatsAppMessage } from "@/lib/constants/homepage";
import { openWhatsApp } from "@/lib/whatsapp";

const WhatsAppButton = () => {
  const handleWhatsAppClick = () => {
    openWhatsApp(consultationWhatsAppMessage);
  };

  return (
    <button
      onClick={handleWhatsAppClick}
      className="whatsapp-button group"
      aria-label="Contact via WhatsApp"
    >
      <MessageCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
      <span className="sr-only">Contact via WhatsApp</span>
    </button>
  );
};

export default WhatsAppButton;
