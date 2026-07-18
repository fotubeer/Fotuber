import React from "react";
import { Phone, MessageCircle } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";

export const FloatingContact = () => {
  const { settings } = useSettings();
  const wa = settings?.whatsapp || "905010002523";
  const phoneRaw = (settings?.phone || "05010002523").replace(/\D/g, "");
  const telHref = phoneRaw.startsWith("0") ? `tel:+90${phoneRaw.slice(1)}` : `tel:+${phoneRaw}`;
  const name = settings?.business_name || "Fotuber Studio";

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
      <a
        href={`https://wa.me/${wa}?text=${encodeURIComponent(`Merhaba, ${name} hakkında bilgi almak istiyorum.`)}`}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="floating-whatsapp-btn"
        className="w-14 h-14 rounded-full bg-[#25D366] flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
        title="WhatsApp"
      >
        <MessageCircle className="w-6 h-6 text-white" />
      </a>
      <a
        href={telHref}
        data-testid="floating-phone-btn"
        className="w-14 h-14 rounded-full bg-[#d4af37] flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
        title="Bizi Ara"
      >
        <Phone className="w-6 h-6 text-black" />
      </a>
    </div>
  );
};

export default FloatingContact;
