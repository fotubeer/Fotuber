import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Award, Camera, Video, Mic, MonitorPlay, Phone, MessageCircle, Zap, Gift, Heart, Mail, Sun, Sunset, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, galleryFileUrl } from "@/lib/api";
import { useSettings } from "@/context/SettingsContext";
import { SEO, buildLocalBusinessLd } from "@/components/SEO";
import IntroSplash from "@/components/IntroSplash";
import InstagramSlideshow from "@/components/InstagramSlideshow";
import AdBanners from "@/components/AdBanners";

const DEFAULT_HERO = "https://images.pexels.com/photos/5762880/pexels-photo-5762880.jpeg";

const HIGHLIGHTS = [
  { icon: Camera, title: "Profesyonel Ekipman", desc: "Full-frame kameralar, sinema lensleri ve stüdyo aydınlatması." },
  { icon: Video,  title: "Sinematografi",       desc: "Klip ve tanıtım filmleri için sinematik prodüksiyon." },
  { icon: Mic,    title: "Podcast Stüdyosu",    desc: "Akustik izole podcast alanı ve profesyonel mikrofonlar." },
  { icon: MonitorPlay, title: "Karaoke Alanı",  desc: "Özel etkinlikler için hazırlanmış canlı karaoke sahnesi." },
];

const Home = () => {
  const [services, setServices] = useState([]);
  const [gallery, setGallery] = useState([]);
  const { settings } = useSettings();
  const heroImg = settings?.hero_image_url || DEFAULT_HERO;
  const heroTitle = settings?.hero_title || "Anlar, ";
  const heroAccent = settings?.hero_title_accent || "ışıkla";
  const heroSubtitle = settings?.hero_subtitle || "ölümsüzleşir.";
  const heroIntro = settings?.hero_intro || "Düğün ve nişan çekimlerinden podcast prodüksiyonuna, stüdyo portresinden klip yapımına — Fotuber ile her ana özenle, sinematik bir bakışla dokunuyoruz.";
  const tagline = settings?.tagline || "Fotuber Studio · fotuber.com.tr";
  const rawPhone = (settings?.phone || "05010002523").replace(/[^0-9]/g, "");
  const rawWhatsapp = (settings?.whatsapp || settings?.phone || "05010002523").replace(/[^0-9]/g, "");
  const phoneTel = rawPhone.startsWith("90") ? `+${rawPhone}` : (rawPhone.startsWith("0") ? `+9${rawPhone}` : `+${rawPhone}`);
  const waNumber = rawWhatsapp.startsWith("90") ? rawWhatsapp : (rawWhatsapp.startsWith("0") ? `9${rawWhatsapp}` : rawWhatsapp);
  const discountPercent = Math.round(settings?.discount_percent || 10);
  const discountActive = settings?.discount_active !== false;

  useEffect(() => {
    api.get("/services").then((r) => {
      const raw = r.data;
      const list = Array.isArray(raw) ? raw
        : Array.isArray(raw?.data) ? raw.data
        : Array.isArray(raw?.services) ? raw.services
        : Array.isArray(raw?.results) ? raw.results
        : [];
      setServices(list);
    }).catch(() => {});
    api.get("/gallery").then((r) => {
      const raw = r.data;
      const list = Array.isArray(raw) ? raw
        : Array.isArray(raw?.data) ? raw.data
        : Array.isArray(raw?.gallery) ? raw.gallery
        : Array.isArray(raw?.results) ? raw.results
        : [];
      setGallery(list.slice(0, 6));
    }).catch(() => {});
  }, []);

  return (
    <div>
      <IntroSplash />
      <SEO path="/" jsonLd={buildLocalBusinessLd(settings)} />
      {/* Hero */}
      <section className="relative min-h-[92vh] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroImg})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black" />
        <div className="absolute inset-0 bg-grain" />

        <div className="relative max-w-7xl mx-auto px-6 pt-32 pb-24 grid lg:grid-cols-12 gap-12 items-end min-h-[92vh]">
          <div className="lg:col-span-8">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9 }}
              className="uppercase tracking-[0.4em] text-xs text-[#d4af37] mb-6"
            >
              {tagline}
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.1, delay: 0.15 }}
              className="hero-title text-6xl md:text-7xl lg:text-[7.5rem] text-white mb-8"
            >
              {heroTitle}<em>{heroAccent}</em><br />{heroSubtitle}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.9, delay: 0.4 }}
              className="text-lg text-neutral-300 max-w-xl mb-10 leading-relaxed"
            >
              {heroIntro}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.55 }}
              className="flex flex-wrap items-center gap-4"
            >
              <Link to="/randevu">
                <Button data-testid="hero-cta-book" className="rounded-full bg-emerald-500 hover:bg-emerald-600 text-black font-semibold px-8 h-12 text-sm tracking-wide shadow-[0_0_35px_rgba(16,185,129,0.5)]">
                  Hemen Randevu Al <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link to="/galeri">
                <Button data-testid="hero-cta-gallery" variant="outline" className="rounded-full border-neutral-600 bg-transparent text-white hover:bg-white hover:text-black h-12 px-8">
                  Galeriye Göz At
                </Button>
              </Link>
            </motion.div>
          </div>

          <div className="lg:col-span-4">
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center gap-2 text-xs text-[#d4af37] uppercase tracking-[0.3em] mb-3">
                <Sparkles className="w-3.5 h-3.5" /> Özel Not
              </div>
              <div className="text-2xl font-serif leading-snug text-white mb-3">
                Her seans, tek ve tekrarlanmaz bir hikaye.
              </div>
              <p className="text-sm text-neutral-400 leading-relaxed">
                Rezervasyonunuz için küçük bir kapora alıyoruz; tarihiniz ve saatiniz
                onaylandığı an sadece size ayrılır.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Highlights strip */}
      <section className="bg-neutral-950 border-y border-neutral-900">
        <div className="max-w-7xl mx-auto px-6 py-14 grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {HIGHLIGHTS.map((h) => (
            <div key={h.title} className="group">
              <h.icon className="w-6 h-6 text-[#d4af37] mb-4" strokeWidth={1.5} />
              <div className="font-serif text-2xl mb-1">{h.title}</div>
              <p className="text-sm text-neutral-500 leading-relaxed">{h.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FOMO Banner: urgency + phone/whatsapp CTAs */}
      <section className="relative bg-gradient-to-r from-red-950/40 via-neutral-950 to-red-950/40 border-y border-red-900/40 overflow-hidden">
        <div className="absolute inset-0 bg-grain opacity-40 pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex items-center gap-4"
          >
            <motion.div
              animate={{ scale: [1, 1.15, 1], rotate: [0, -8, 8, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className="w-12 h-12 rounded-full bg-red-500/20 border border-red-400/50 flex items-center justify-center shrink-0"
            >
              <Zap className="w-6 h-6 text-red-300" />
            </motion.div>
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-red-300 mb-1">Aktif Rezervasyon</div>
              <div className="text-lg md:text-xl font-serif text-white leading-tight">
                Aktif randevu oluşturmak için <em className="text-red-300">acele edin</em> — <span className="text-neutral-300">müsait tarihler hızla doluyor.</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="flex items-center gap-3 shrink-0"
          >
            <a href={`tel:${phoneTel}`} data-testid="fomo-phone-cta">
              <Button className="rounded-full bg-white text-black hover:bg-neutral-200 h-11 px-5 gap-2 font-semibold shadow-lg">
                <Phone className="w-4 h-4" /> Hemen Ara
              </Button>
            </a>
            <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer" data-testid="fomo-whatsapp-cta">
              <Button className="rounded-full bg-[#25D366] text-white hover:bg-[#1ea855] h-11 px-5 gap-2 font-semibold shadow-lg">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </Button>
            </a>
          </motion.div>
        </div>
      </section>

      {/* Digital Invitation CTA — premium, animated */}
      <section className="relative py-24 overflow-hidden border-y border-[#e9c96e]/20" style={{ background: "radial-gradient(900px 500px at 50% -10%, #3b1258 0%, #1a0f2e 45%, #0b0510 100%)" }}>
        {/* floating hearts */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
          {[12, 32, 55, 74, 88].map((left, i) => (
            <motion.div key={i} className="absolute" style={{ left: `${left}%`, bottom: -30 }}
              initial={{ y: 0, opacity: 0 }}
              animate={{ y: [-20, -420], opacity: [0, 0.5, 0], x: [0, i % 2 ? 30 : -30, 0] }}
              transition={{ duration: 9 + i, repeat: Infinity, delay: i * 1.4, ease: "easeInOut" }}>
              <Heart className="w-5 h-5" style={{ color: "#e9c96e" }} fill="#e9c96e" />
            </motion.div>
          ))}
        </div>

        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-[#e9c96e] mb-6">
              <Sparkles className="w-4 h-4" /> Yeni · Dijital Davetiye
            </div>
            <h2 className="font-serif text-4xl md:text-6xl text-white leading-tight mb-5">
              Dijital <em className="text-[#e9c96e]">Davetiyeni</em> Oluştur
            </h2>
            <p className="text-neutral-300 max-w-2xl mx-auto mb-4 leading-relaxed">
              Düğün, nişan, kına ve tüm özel günleriniz için <span className="text-white">animasyonlu, şık ve interaktif</span> davetiyeler.
              LCV takibi, anı & dilek duvarı, geri sayım, sesli karşılama ve hediye IBAN'ı — hepsi tek bağlantıda.
            </p>
            <p className="text-sm text-neutral-500 mb-9">Ücretsiz oluşturmaya başla · Yayınlamak için üyelik yeterli</p>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.98 }} className="inline-block">
              <Link to="/davetiye-olustur" data-testid="home-invitation-cta">
                <Button className="rounded-full bg-[#e9c96e] hover:bg-[#d4af37] text-[#190826] h-14 px-10 text-base font-bold shadow-[0_0_45px_rgba(233,201,110,0.45)]">
                  <Mail className="w-5 h-5 mr-2" /> Davetiyeni Oluştur <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Golden Hour promo — prominent standalone tool */}
      <section className="relative py-24 border-b border-neutral-900 overflow-hidden" data-testid="home-goldenhour-section">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(120% 90% at 85% -10%, rgba(230,162,74,0.18), transparent 55%), radial-gradient(90% 80% at 5% 120%, rgba(69,90,158,0.18), transparent 55%)" }} />
        <div className="relative max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-[#e6a24a] mb-6">
              <Sun className="w-4 h-4" /> Ücretsiz Işık Aracı
            </div>
            <h2 className="font-serif text-4xl md:text-6xl text-white leading-tight mb-5">
              Altın Saat & <em className="text-[#e6a24a]">Gün Batımı</em>
            </h2>
            <p className="text-neutral-300 max-w-xl mb-4 leading-relaxed">
              Şehir ve tarih seçin; <span className="text-white">altın saat, mavi saat, gün batımı</span> ve o günün
              hava durumunu anında görün. Önerilen çekim mekanları, kıyafet için asistan ve tek tıkla randevu — hepsi burada.
            </p>
            <p className="text-sm text-neutral-500 mb-9">Kayıt gerekmez · Tamamen ücretsiz</p>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.98 }} className="inline-block">
              <Link to="/altin-saat" data-testid="home-goldenhour-cta">
                <Button className="rounded-full bg-[#e6a24a] hover:bg-[#f0b45f] text-neutral-950 h-14 px-10 text-base font-bold shadow-[0_0_45px_rgba(230,162,74,0.45)]">
                  <Sun className="w-5 h-5 mr-2" /> Işık Zamanını Hesapla <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </motion.div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="relative rounded-3xl border border-[#e6a24a]/25 bg-neutral-900/40 p-6 overflow-hidden"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Bugünün Işığı</div>
              <Camera className="w-4 h-4 text-[#e6a24a]" />
            </div>
            <div className="space-y-3">
              {[
                { I: Sun, t: "Akşam Altın Saat", d: "En iyi düğün ışığı", c: "#e6a24a", tip: true },
                { I: Sunset, t: "Gün Batımı", d: "Sinematik ufuk", c: "#d9603f", tip: false },
                { I: Moon, t: "Mavi Saat", d: "Yumuşak gökyüzü tonları", c: "#455a9e", tip: false },
              ].map((r, i) => {
                const Ic = r.I;
                return (
                  <div key={i} className={`flex items-center gap-3 rounded-2xl border p-3 ${r.tip ? "border-[#e6a24a]/50 bg-[#e6a24a]/5" : "border-neutral-800 bg-neutral-950/50"}`}>
                    <span className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: `${r.c}22`, color: r.c }}><Ic className="w-5 h-5" /></span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">{r.t}</div>
                      <div className="text-xs text-neutral-500">{r.d}</div>
                    </div>
                    {r.tip && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#e6a24a] text-neutral-950">ÖNERİLEN</span>}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </section>


      {/* Instagram Slideshow — aesthetic mid-section, admin-managed */}
      <InstagramSlideshow />

      {/* Discount code CTA (animated) */}
      {discountActive && (
        <section className="relative py-16 border-b border-neutral-900 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-[#d4af37]/10 blur-3xl" />
            <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-[#d4af37]/5 blur-3xl" />
          </div>
          <div className="relative max-w-5xl mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.7 }}
              className="rounded-3xl border border-[#d4af37]/40 bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8"
            >
              <div className="flex items-center gap-6">
                <motion.div
                  animate={{ y: [0, -8, 0], rotate: [-4, 4, -4] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-[#d4af37]/15 border border-[#d4af37]/40 flex items-center justify-center shrink-0"
                >
                  <Gift className="w-10 h-10 md:w-12 md:h-12 text-[#d4af37]" strokeWidth={1.5} />
                </motion.div>
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-[#d4af37] mb-2 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5" /> Sana Özel
                  </div>
                  <h3 className="font-serif text-3xl md:text-4xl text-white leading-tight mb-2">
                    Sosyal medyayı takip et, <em>%{discountPercent}</em> indirim kazan.
                  </h3>
                  <p className="text-sm md:text-base text-neutral-400 max-w-xl">
                    Hesaplarımızı takip et, kodunu anında al. Stüdyoya bizzat geldiğinde geçerli olur.
                  </p>
                </div>
              </div>
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.98 }}>
                <Link to="/indirim-kodu" data-testid="home-discount-cta">
                  <Button className="rounded-full bg-[#d4af37] hover:bg-[#b5952f] text-black h-12 px-7 font-semibold shadow-xl">
                    %{discountPercent} İndirim Kodu Al <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>
      )}

      {/* Services bento */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-end justify-between mb-12">
            <div>
              <div className="text-xs tracking-[0.3em] uppercase text-[#d4af37] mb-3">Hizmetlerimiz</div>
              <h2 className="font-serif text-4xl md:text-5xl leading-tight">
                Farklı ihtiyaçlara,<br />zarif bir cevap.
              </h2>
            </div>
            <Link to="/hizmetler" className="hidden md:inline-flex text-sm text-neutral-400 hover:text-[#d4af37] link-underline">Tümünü Gör →</Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-6 auto-rows-[240px]">
            {services.slice(0, 5).map((s, i) => {
              const spanClasses = [
                "md:col-span-3 md:row-span-2",
                "md:col-span-3 md:row-span-1",
                "md:col-span-2 md:row-span-1",
                "md:col-span-2 md:row-span-1",
                "md:col-span-2 md:row-span-1",
              ];
              return (
                <Link
                  to="/randevu"
                  key={s.id}
                  data-testid={`service-card-${s.id}`}
                  className={`group relative overflow-hidden rounded-2xl border border-neutral-900 ${spanClasses[i]}`}
                >
                  <img
                    src={s.image_url}
                    alt={s.name}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
                  <div className="absolute bottom-5 left-5 right-5">
                    <div className="text-xs uppercase tracking-[0.3em] text-[#d4af37] mb-2">{s.duration_hours} saat</div>
                    <div className="font-serif text-2xl md:text-3xl text-white leading-tight">{s.name}</div>
                    {s.description && <div className="text-xs text-neutral-300 mt-2 line-clamp-2 opacity-80">{s.description}</div>}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Gallery preview */}
      {gallery.length > 0 && (
        <section className="py-24 border-t border-neutral-900">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex items-end justify-between mb-10">
              <div>
                <div className="text-xs tracking-[0.3em] uppercase text-[#d4af37] mb-3">Galeri</div>
                <h2 className="font-serif text-4xl md:text-5xl">Son çalışmalarımız</h2>
              </div>
              <Link to="/galeri" className="text-sm text-neutral-400 hover:text-[#d4af37] link-underline">Tümünü Gör →</Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {gallery.map((g) => (
                <div key={g.id} className="aspect-[4/5] overflow-hidden rounded-xl border border-neutral-900 group">
                  {g.media_type === "video" ? (
                    <video src={galleryFileUrl(g.id)} className="w-full h-full object-cover" muted playsInline />
                  ) : (
                    <img src={galleryFileUrl(g.id)} alt={g.title || "Galeri"} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-24 border-t border-neutral-900">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <Award className="w-8 h-8 text-[#d4af37] mx-auto mb-6" strokeWidth={1.5} />
          <h3 className="font-serif text-4xl md:text-6xl leading-tight mb-6">Anınızı sonsuzlaştıralım.</h3>
          <p className="text-neutral-400 max-w-2xl mx-auto mb-10">
            Şimdi randevu alın; ekibimiz sizi arayarak kapora ile tarihinizi kesinleştirsin.
          </p>
          <Link to="/randevu">
            <Button data-testid="cta-bottom-book" className="rounded-full bg-emerald-500 hover:bg-emerald-600 text-black font-semibold h-12 px-10 shadow-[0_0_35px_rgba(16,185,129,0.5)]">
              Randevu Oluştur
            </Button>
          </Link>
        </div>
      </section>
      {/* Admin-managed ad banners (footer) */}
      <section className="py-10 border-t border-neutral-900">
        <div className="max-w-5xl mx-auto px-6">
          <AdBanners placement="home_footer" dark />
        </div>
      </section>
    </div>
  );
};

export default Home;
