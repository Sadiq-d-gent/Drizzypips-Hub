import { supportWhatsAppNumber } from "@/lib/constants/homepage";

export const createWhatsAppUrl = (message: string, phoneNumber = supportWhatsAppNumber) => {
  const normalizedPhoneNumber = phoneNumber.replace(/[^\d]/g, "");
  return `https://wa.me/${normalizedPhoneNumber}?text=${encodeURIComponent(message)}`;
};

export const openWhatsApp = (message: string) => {
  window.open(createWhatsAppUrl(message), "_blank", "noopener,noreferrer");
};
