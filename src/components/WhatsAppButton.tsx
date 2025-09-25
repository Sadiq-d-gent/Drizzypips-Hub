import { MessageCircle } from "lucide-react";

const WhatsAppButton = () => {
  const handleWhatsAppClick = () => {
    const phoneNumber = "+2349035853860"; // Replace with actual WhatsApp number
    const message = encodeURIComponent("Hi! I'm interested in your trading mentorship program.");
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
    window.open(whatsappUrl, "_blank");
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