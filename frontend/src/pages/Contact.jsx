import React from "react";
import { Phone, MessageCircle, Mail, MapPin, Instagram, Youtube, Facebook, Music2, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/context/SettingsContext";
import { instagramUrl, youtubeUrl, tiktokUrl, facebookUrl, extractMapEmbedSrc } from "@/lib/social";

const formatPhone = (raw) => {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  const local = d.startsWith("90") ? d.slice(2) : d.startsWith("0") ? d.slice(1) : d;
  if (local.length !== 10) return raw;
  return `0(${local.slice(0, 3)}) ${local.slice(3, 6)} ${local.slice(6, 8)} ${local.slice(8, 10)}`;
};

const stripAt = (s) => (s || "").replace(/^@/, "").replace(/^https?:\/\/(www\.)?(instagram|youtube|tiktok|facebook)\.com\/@?/, "");

const Contact = () => {
  const { settings } = useSettings();
  const phone = settings?.phone || "05010002523";
  const wa = settings?.whatsapp || "905010002523";
  const email = settings?.email || "info@fotuber.com.tr";
  const address = settings?.address || "";

  const ig1 = instagramUrl(settings?.instagram);
  const ig2 = instagramUrl(settings?.instagram_secondary);
  const yt = youtubeUrl(settings?.youtube);
  const tt = tiktokUrl(settings?.tiktok);
  const fb = facebookUrl(settings?.facebook);
  const mapsUrl = settings?.google_maps_url;
  const mapsEmbed = extractMapEmbedSrc(settings?.google_maps_embed);

  return (
    <div className="max-w-6xl mx-auto px-6 py-24">
      <div className="text-xs tracking-[0.3em] uppercase text-[#d4af37] mb-3">İletişim</div>
      <h1 className="hero-title text-5xl md:text-6xl mb-14">
        Bize <em>ulaşın</em>.
      </h1>

      <div className="grid md:grid-cols-2 gap-8 mb-8">
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
          <div className="flex items-center gap-3 mb-3"><MapPin className="w-5 h-5 text-neutral-300" /> <span className="text-lg">Adres</span></div>
          <p className="text-neutral-400 mb-4">{address || "fotuber.com.tr · Randevu ile ziyaret"}</p>
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
              <Button data-testid="contact-directions-btn" variant="outline" className="rounded-full border-neutral-700 bg-transparent text-neutral-200 hover:bg-neutral-800">
                <Navigation className="w-4 h-4 mr-2" /> Yol Tarifi Al
              </Button>
            </a>
          )}
        </div>
      </div>

      {/* Sosyal medya */}
      {(ig1 || ig2 || yt || tt || fb) && (
        <div className="mb-8">
          <div className="text-xs tracking-[0.3em] uppercase text-[#d4af37] mb-4">Sosyal Medya</div>
          <div className="flex flex-wrap gap-3">
            {ig1 && (
              <a href={ig1} target="_blank" rel="noopener noreferrer" data-testid="social-ig-1" className="flex items-center gap-2 px-5 py-3 rounded-full border border-neutral-800 hover:border-[#d4af37] transition-colors">
                <Instagram className="w-4 h-4 text-[#E1306C]" /> <span className="text-sm">{stripAt(settings.instagram) || "instagram"}</span>
              </a>
            )}
            {ig2 && (
              <a href={ig2} target="_blank" rel="noopener noreferrer" data-testid="social-ig-2" className="flex items-center gap-2 px-5 py-3 rounded-full border border-neutral-800 hover:border-[#d4af37] transition-colors">
                <Instagram className="w-4 h-4 text-[#E1306C]" /> <span className="text-sm">{stripAt(settings.instagram_secondary) || "instagram"}</span>
              </a>
            )}
            {yt && (
              <a href={yt} target="_blank" rel="noopener noreferrer" data-testid="social-yt" className="flex items-center gap-2 px-5 py-3 rounded-full border border-neutral-800 hover:border-[#d4af37] transition-colors">
                <Youtube className="w-4 h-4 text-[#FF0000]" /> <span className="text-sm">YouTube</span>
              </a>
            )}
            {tt && (
              <a href={tt} target="_blank" rel="noopener noreferrer" data-testid="social-tt" className="flex items-center gap-2 px-5 py-3 rounded-full border border-neutral-800 hover:border-[#d4af37] transition-colors">
                <Music2 className="w-4 h-4" /> <span className="text-sm">TikTok</span>
              </a>
            )}
            {fb && (
              <a href={fb} target="_blank" rel="noopener noreferrer" data-testid="social-fb" className="flex items-center gap-2 px-5 py-3 rounded-full border border-neutral-800 hover:border-[#d4af37] transition-colors">
                <Facebook className="w-4 h-4 text-[#1877F2]" /> <span className="text-sm">Facebook</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Harita */}
      {mapsEmbed && (
        <div className="mt-4">
          <div className="text-xs tracking-[0.3em] uppercase text-[#d4af37] mb-4">Konum</div>
          <div className="rounded-2xl overflow-hidden border border-neutral-900 aspect-video">
            <iframe
              title="Google Haritalar Konumu"
              src={mapsEmbed}
              className="w-full h-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
              data-testid="contact-map-iframe"
            />
          </div>
        </div>
      )}
    </div>
  );
};
export default Contact;
