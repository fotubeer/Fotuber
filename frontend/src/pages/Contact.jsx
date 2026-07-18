import React from "react";
import { Phone, MessageCircle, Mail, MapPin, Instagram } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/context/SettingsContext";

const formatPhone = (raw) => {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  const local = d.startsWith("90") ? d.slice(2) : d.startsWith("0") ? d.slice(1) : d;
  if (local.length !== 10) return raw;
  return `0(${local.slice(0, 3)}) ${local.slice(3, 6)} ${local.slice(6, 8)} ${local.slice(8, 10)}`;
};

const Contact = () => {
  const { settings } = useSettings();
  const phone = settings?.phone || "05010002523";
  const wa = settings?.whatsapp || "905010002523";
  const email = settings?.email || "info@fotuber.com.tr";
  const address = settings?.address || "fotuber.com.tr · Randevu ile ziyaret";
  const insta = settings?.instagram;

  return (
    <div className="max-w-6xl mx-auto px-6 py-24">
      <div className="text-xs tracking-[0.3em] uppercase text-[#d4af37] mb-3">İletişim</div>
      <h1 className="hero-title text-5xl md:text-6xl mb-14">
        Bize <em>ulaşın</em>.
      </h1>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="glass rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-3"><Phone className="w-5 h-5 text-[#d4af37]" /> <span className="text-lg">Telefon</span></div>
          <p className="text-neutral-400 mb-4">Kapora ve genel bilgi için doğrudan arayabilirsiniz.</p>
          <a href={`tel:+${wa}`}>
            <Button data-testid="contact-phone-btn" className="rounded-full bg-[#d4af37] text-black hover:bg-[#b5952f]">{formatPhone(phone)}</Button>
          </a>
        </div>
        <div className="glass rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-3"><MessageCircle className="w-5 h-5 text-[#25D366]" /> <span className="text-lg">WhatsApp</span></div>
          <p className="text-neutral-400 mb-4">Görsel referans ve hızlı yanıt için WhatsApp tercih edebilirsiniz.</p>
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">
            <Button data-testid="contact-whatsapp-btn" className="rounded-full bg-[#25D366] hover:bg-[#20b957] text-white">WhatsApp'tan Yaz</Button>
          </a>
        </div>
        <div className="glass rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-3"><Mail className="w-5 h-5 text-neutral-300" /> <span className="text-lg">E-posta</span></div>
          <p className="text-neutral-400">{email}</p>
        </div>
        <div className="glass rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-3"><MapPin className="w-5 h-5 text-neutral-300" /> <span className="text-lg">Stüdyo</span></div>
          <p className="text-neutral-400">{address}</p>
          {insta && (
            <p className="text-sm text-neutral-500 mt-3 flex items-center gap-2">
              <Instagram className="w-4 h-4" /> {insta}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
export default Contact;
