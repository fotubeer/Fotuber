import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Instagram, Youtube, Facebook, Music2, Sparkles, Copy, Check, ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { api, formatApiError } from "@/lib/api";
import { useSettings } from "@/context/SettingsContext";
import { instagramUrl, youtubeUrl, tiktokUrl, facebookUrl } from "@/lib/social";
import { toast } from "sonner";

const DiscountCode = () => {
  const { settings } = useSettings();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [checked, setChecked] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const socials = [];
  if (instagramUrl(settings?.instagram)) socials.push({ key: "instagram", label: `Instagram ${(settings.instagram || "").replace(/^@/, "")}`, url: instagramUrl(settings.instagram), Icon: Instagram, color: "#E1306C" });
  if (instagramUrl(settings?.instagram_secondary)) socials.push({ key: "instagram_2", label: `Instagram ${(settings.instagram_secondary || "").replace(/^@/, "")}`, url: instagramUrl(settings.instagram_secondary), Icon: Instagram, color: "#E1306C" });
  if (youtubeUrl(settings?.youtube)) socials.push({ key: "youtube", label: "YouTube", url: youtubeUrl(settings.youtube), Icon: Youtube, color: "#FF0000" });
  if (tiktokUrl(settings?.tiktok)) socials.push({ key: "tiktok", label: "TikTok", url: tiktokUrl(settings.tiktok), Icon: Music2, color: "#ffffff" });
  if (facebookUrl(settings?.facebook)) socials.push({ key: "facebook", label: "Facebook", url: facebookUrl(settings.facebook), Icon: Facebook, color: "#1877F2" });

  const submit = async (e) => {
    e.preventDefault();
    const platforms = Object.keys(checked).filter((k) => checked[k]);
    if (platforms.length === 0) { toast.error("En az bir hesabı takip ettiğinizi işaretleyin."); return; }
    if (!name.trim() || !phone.trim()) { toast.error("Ad ve telefon zorunludur."); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/discount-codes/request", { name, phone, platforms_followed: platforms });
      setResult(data);
    } catch (err) {
      toast.error(formatApiError(err, "Kod alınamadı"));
    } finally { setBusy(false); }
  };

  const copyCode = () => {
    if (!result?.code) return;
    navigator.clipboard.writeText(result.code);
    setCopied(true);
    toast.success("Kod panoya kopyalandı");
    setTimeout(() => setCopied(false), 2000);
  };

  const active = settings?.discount_active !== false;
  const percent = settings?.discount_percent || 10;
  const heading = settings?.discount_heading || `Sosyal medyada takip et, %${Math.round(percent)} indirim kazan`;
  const subtitle = settings?.discount_subtitle || "Hesaplarımızı takip et, özel kodunu anında al. Kod, stüdyoya bizzat geldiğinde geçerli olur.";

  if (!active) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center text-neutral-400">
        <h1 className="hero-title text-4xl mb-4">İndirim kampanyası şu an aktif değil</h1>
        <p>Yakında yeni bir kampanya duyurulacak. Bizi takip etmeye devam edin.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-24">
      <div className="text-xs tracking-[0.3em] uppercase text-[#d4af37] mb-3 flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5" /> Fotuber'da Sana Özel
      </div>
      <h1 className="hero-title text-5xl md:text-6xl mb-6 max-w-3xl">
        {heading.split(new RegExp(`(%${Math.round(percent)})`))
          .map((part, i) => part === `%${Math.round(percent)}` ? <em key={i}>{part}</em> : part)}
      </h1>
      <p className="text-neutral-400 max-w-2xl mb-10">{subtitle}</p>

      {result ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass rounded-2xl p-10 text-center"
          data-testid="discount-code-result"
        >
          <div className="text-xs uppercase tracking-[0.3em] text-[#d4af37] mb-4">İndirim Kodunuz</div>
          <div
            data-testid="discount-code-value"
            className="text-5xl md:text-6xl font-serif tracking-wider mb-6 text-white"
          >
            {result.code}
          </div>
          <div className="text-lg text-[#d4af37] mb-8">%{Math.round(result.discount_percent)} indirim</div>
          <div className="flex justify-center gap-3 mb-8">
            <Button data-testid="copy-code-btn" onClick={copyCode} className="rounded-full bg-[#d4af37] hover:bg-[#b5952f] text-black">
              {copied ? <><Check className="w-4 h-4 mr-2" /> Kopyalandı</> : <><Copy className="w-4 h-4 mr-2" /> Kodu Kopyala</>}
            </Button>
            <Link to="/randevu">
              <Button variant="outline" className="rounded-full border-neutral-700 bg-transparent text-neutral-200 hover:bg-neutral-800">
                Randevu Al
              </Button>
            </Link>
          </div>
          <div className="border-t border-neutral-800 pt-6 text-sm text-neutral-400 leading-relaxed max-w-xl mx-auto">
            <div className="flex items-start gap-2 mb-2 text-neutral-300">
              <ShieldCheck className="w-4 h-4 text-[#d4af37] mt-0.5 shrink-0" />
              <p><b>Önemli:</b> Bu kod sadece <b>stüdyomuza bizzat geldiğinizde</b> geçerlidir. Online rezervasyonda kullanılamaz.</p>
            </div>
            <p className="text-xs">
              Kod {new Date(result.expires_at).toLocaleDateString("tr-TR")} tarihine kadar geçerlidir. Kodu WhatsApp'ta da size gönderdik.
            </p>
          </div>
        </motion.div>
      ) : (
        <div className="grid lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3 glass rounded-2xl p-8">
            <div className="text-sm uppercase tracking-[0.2em] text-neutral-400 mb-6">Adım 1 · Bizi takip et</div>
            <div className="space-y-3 mb-6">
              {socials.length === 0 && (
                <p className="text-sm text-neutral-500">Sosyal medya hesapları henüz ayarlanmamış.</p>
              )}
              {socials.map((s) => (
                <div key={s.key} className="flex items-center gap-3 p-3 rounded-lg border border-neutral-800 hover:border-neutral-700">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`discount-social-${s.key}`}
                    className="flex items-center gap-3 flex-1 min-w-0"
                  >
                    <s.Icon className="w-5 h-5 shrink-0" style={{ color: s.color }} />
                    <span className="text-sm truncate">{s.label}</span>
                    <ExternalLink className="w-3 h-3 text-neutral-500 ml-auto shrink-0" />
                  </a>
                  <label className="flex items-center gap-2 cursor-pointer shrink-0">
                    <Checkbox
                      data-testid={`follow-checkbox-${s.key}`}
                      checked={!!checked[s.key]}
                      onCheckedChange={(v) => setChecked({ ...checked, [s.key]: !!v })}
                      className="border-neutral-700 data-[state=checked]:bg-[#d4af37] data-[state=checked]:text-black data-[state=checked]:border-[#d4af37]"
                    />
                    <span className="text-xs text-neutral-400">Takip ettim</span>
                  </label>
                </div>
              ))}
            </div>
            <div className="text-xs text-neutral-500 leading-relaxed">
              🎯 Kodu aldıktan sonra takipten çıkarsanız stüdyoda kontrol edildiğinde kod geçersiz kabul edilebilir.
            </div>
          </div>

          <div className="lg:col-span-2">
            <form onSubmit={submit} className="glass rounded-2xl p-8 sticky top-24">
              <div className="text-sm uppercase tracking-[0.2em] text-neutral-400 mb-6">Adım 2 · Bilgilerini bırak</div>
              <div className="space-y-4">
                <div>
                  <Label className="text-neutral-400 text-xs">Adınız Soyadınız</Label>
                  <Input data-testid="discount-name" value={name} onChange={(e) => setName(e.target.value)} className="bg-neutral-950 border-neutral-800 text-neutral-100 mt-1" required />
                </div>
                <div>
                  <Label className="text-neutral-400 text-xs">WhatsApp'ınız (koda ulaşmanız için)</Label>
                  <Input data-testid="discount-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05011112233" className="bg-neutral-950 border-neutral-800 text-neutral-100 mt-1" required />
                </div>
                <Button
                  type="submit"
                  data-testid="discount-submit-btn"
                  disabled={busy}
                  className="w-full rounded-full bg-[#d4af37] hover:bg-[#b5952f] text-black h-11"
                >
                  {busy ? "Kod oluşturuluyor..." : `%${Math.round(percent)} Kodumu Al`}
                </Button>
                <p className="text-xs text-neutral-500 text-center">
                  Bilgileriniz sadece kod doğrulaması için kullanılır.
                </p>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiscountCode;
