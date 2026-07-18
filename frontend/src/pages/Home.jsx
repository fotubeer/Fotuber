import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Award, Camera, Video, Mic, MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, galleryFileUrl } from "@/lib/api";

const HERO_IMG = "https://images.pexels.com/photos/5762880/pexels-photo-5762880.jpeg";

const HIGHLIGHTS = [
  { icon: Camera, title: "Profesyonel Ekipman", desc: "Full-frame kameralar, sinema lensleri ve stüdyo aydınlatması." },
  { icon: Video,  title: "Sinematografi",       desc: "Klip ve tanıtım filmleri için sinematik prodüksiyon." },
  { icon: Mic,    title: "Podcast Stüdyosu",    desc: "Akustik izole podcast alanı ve profesyonel mikrofonlar." },
  { icon: MonitorPlay, title: "Karaoke Alanı",  desc: "Özel etkinlikler için hazırlanmış canlı karaoke sahnesi." },
];

const Home = () => {
  const [services, setServices] = useState([]);
  const [gallery, setGallery] = useState([]);

  useEffect(() => {
    api.get("/services").then((r) => setServices(r.data)).catch(() => {});
    api.get("/gallery").then((r) => setGallery(r.data.slice(0, 6))).catch(() => {});
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="relative min-h-[92vh] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${HERO_IMG})` }}
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
              Fotuber Studio · fotuber.com.tr
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.1, delay: 0.15 }}
              className="hero-title text-6xl md:text-7xl lg:text-[7.5rem] text-white mb-8"
            >
              Anlar, <em>ışıkla</em><br />ölümsüzleşir.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.9, delay: 0.4 }}
              className="text-lg text-neutral-300 max-w-xl mb-10 leading-relaxed"
            >
              Düğün ve nişan çekimlerinden podcast prodüksiyonuna, stüdyo portresinden klip yapımına
              — Fotuber ile her ana özenle, sinematik bir bakışla dokunuyoruz.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.55 }}
              className="flex flex-wrap items-center gap-4"
            >
              <Link to="/randevu">
                <Button data-testid="hero-cta-book" className="rounded-full bg-[#d4af37] hover:bg-[#b5952f] text-black px-8 h-12 text-sm tracking-wide">
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
                    <div className="text-sm text-neutral-300 mt-2">₺{Number(s.price).toLocaleString("tr-TR")}</div>
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
            <Button data-testid="cta-bottom-book" className="rounded-full bg-[#d4af37] hover:bg-[#b5952f] text-black h-12 px-10">
              Randevu Oluştur
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
};

export default Home;
