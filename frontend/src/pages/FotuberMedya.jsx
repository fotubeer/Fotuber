import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Megaphone, Sparkles, Building2, TrendingUp, PlayCircle, ArrowRight, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, API_BASE } from "@/lib/api";

const OFFERINGS = [
  { icon: Megaphone, title: "Sosyal Medya Yönetimi", desc: "Aylık içerik takvimi, çekim, kurgu, paylaşım ve topluluk yönetimi." },
  { icon: PlayCircle, title: "Kısa Video & Klip Prodüksiyonu", desc: "Reels, Shorts, TikTok — algoritmaya uygun sinematik içerikler." },
  { icon: TrendingUp, title: "Reklam Filmi & Kampanya", desc: "Marka konumlandırma ve dönüşüm odaklı reklam prodüksiyonları." },
  { icon: Building2, title: "Kurumsal Tanıtım", desc: "Firma tanıtım filmi, ürün lansmanı, ekip röportajları." },
];

const FotuberMedya = () => {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [clients, setClients] = useState([]);
  const [cat, setCat] = useState(null);

  useEffect(() => {
    api.get("/portfolio/categories").then((r) => setCategories(r.data));
    api.get("/clients").then((r) => setClients(r.data));
  }, []);
  useEffect(() => {
    api.get("/portfolio", { params: cat ? { category: cat } : {} }).then((r) => setItems(r.data));
  }, [cat]);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-neutral-900">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.15),transparent_50%)]" />
        <div className="relative max-w-7xl mx-auto px-6 pt-32 pb-24">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="uppercase tracking-[0.4em] text-xs text-[#d4af37] mb-6 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" /> Fotuber Medya · B2B
            </div>
            <h1 className="hero-title text-5xl md:text-7xl lg:text-[6rem] leading-[0.95] max-w-5xl mb-8">
              Markanızın hikayesini <em>sinematik</em> anlatalım.
            </h1>
            <p className="text-lg text-neutral-300 max-w-2xl mb-10">
              Fotuber Medya, firmaların sosyal medya yönetimi, klip, kısa video ve reklam prodüksiyonlarını
              baştan sona üstlenen prodüksiyon ekibimizin markasıdır.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="#iletisim">
                <Button data-testid="medya-cta-brief" className="rounded-full bg-[#d4af37] hover:bg-[#b5952f] text-black px-8 h-12">
                  Marka Brief'i Alalım <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </a>
              <a href="#portfolyo">
                <Button variant="outline" className="rounded-full border-neutral-600 bg-transparent text-white hover:bg-white hover:text-black h-12 px-8">
                  Portfolyoya Bak
                </Button>
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Offerings */}
      <section className="py-24 border-b border-neutral-900">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-xs tracking-[0.3em] uppercase text-[#d4af37] mb-3">Hizmetlerimiz</div>
          <h2 className="hero-title text-4xl md:text-5xl mb-14">Uçtan uca prodüksiyon.</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {OFFERINGS.map((o) => (
              <div key={o.title}>
                <o.icon className="w-6 h-6 text-[#d4af37] mb-4" strokeWidth={1.5} />
                <div className="font-serif text-2xl mb-2">{o.title}</div>
                <p className="text-sm text-neutral-500 leading-relaxed">{o.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Portfolio */}
      <section id="portfolyo" className="py-24 border-b border-neutral-900">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-xs tracking-[0.3em] uppercase text-[#d4af37] mb-3">Portfolyo</div>
          <h2 className="hero-title text-4xl md:text-5xl mb-10">Son çalışmalarımız.</h2>

          <div className="flex flex-wrap gap-2 mb-10">
            <button
              data-testid="portfolio-cat-all"
              onClick={() => setCat(null)}
              className={`px-4 py-2 rounded-full text-sm border ${!cat ? "bg-[#d4af37] text-black border-[#d4af37]" : "border-neutral-800 text-neutral-300"}`}
            >Tümü</button>
            {categories.map((c) => (
              <button
                key={c.slug}
                data-testid={`portfolio-cat-${c.slug}`}
                onClick={() => setCat(c.slug)}
                className={`px-4 py-2 rounded-full text-sm border ${cat === c.slug ? "bg-[#d4af37] text-black border-[#d4af37]" : "border-neutral-800 text-neutral-300"}`}
              >{c.name}</button>
            ))}
          </div>

          {items.length === 0 ? (
            <div className="border border-neutral-900 rounded-2xl py-20 text-center text-neutral-500">
              Bu kategoride henüz çalışma eklenmedi.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {items.map((p) => {
                const mediaUrl = p.media_id ? `${API_BASE}/portfolio/media/${p.media_id}` : null;
                return (
                  <div key={p.id} data-testid={`portfolio-item-${p.id}`} className="group border border-neutral-900 rounded-2xl overflow-hidden bg-neutral-950">
                    <div className="aspect-video overflow-hidden bg-black">
                      {mediaUrl ? (
                        p.media_type === "video" ? (
                          <video src={mediaUrl} controls className="w-full h-full object-cover" />
                        ) : (
                          <img src={mediaUrl} alt={p.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                        )
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-neutral-700">
                          <PlayCircle className="w-12 h-12" strokeWidth={1} />
                        </div>
                      )}
                    </div>
                    <div className="p-5">
                      <div className="text-xs uppercase tracking-[0.2em] text-[#d4af37] mb-2">
                        {(categories.find((c) => c.slug === p.category) || {}).name || p.category}
                      </div>
                      <div className="font-serif text-xl mb-1">{p.title}</div>
                      {p.client_name && <div className="text-xs text-neutral-500 mb-2">Müşteri: {p.client_name}</div>}
                      {p.description && <p className="text-sm text-neutral-400 line-clamp-2">{p.description}</p>}
                      {p.external_url && (
                        <a href={p.external_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#d4af37] mt-3 link-underline">
                          Projeyi görüntüle <ArrowRight className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Clients */}
      {clients.length > 0 && (
        <section className="py-24 border-b border-neutral-900">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-xs tracking-[0.3em] uppercase text-[#d4af37] mb-3">Çalıştığımız Firmalar</div>
            <h2 className="hero-title text-4xl md:text-5xl mb-14">Güvenilen isimler.</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
              {clients.map((c) => (
                <a
                  key={c.id}
                  href={c.website || "#"}
                  target={c.website ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  data-testid={`client-${c.id}`}
                  className="aspect-square border border-neutral-900 rounded-xl flex items-center justify-center bg-neutral-950 hover:border-[#d4af37] transition-colors p-4 group"
                  title={c.name}
                >
                  {c.logo_id ? (
                    <img
                      src={`${API_BASE}/clients/logo/${c.logo_id}`}
                      alt={c.name}
                      className="max-w-full max-h-full object-contain opacity-70 group-hover:opacity-100 transition-opacity"
                    />
                  ) : (
                    <div className="text-center">
                      <Building2 className="w-6 h-6 mx-auto mb-1 text-neutral-500" strokeWidth={1.5} />
                      <div className="text-xs text-neutral-400 font-medium">{c.name}</div>
                    </div>
                  )}
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section id="iletisim" className="py-24">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <Globe className="w-8 h-8 text-[#d4af37] mx-auto mb-6" strokeWidth={1.5} />
          <h3 className="hero-title text-4xl md:text-5xl mb-6">Bir sonraki hikaye <em>sizin</em> markanız olabilir.</h3>
          <p className="text-neutral-400 mb-10 max-w-2xl mx-auto">
            Sosyal medya stratejisi, prodüksiyon ve kampanya yönetimi için ekibimizle görüşün.
          </p>
          <Link to="/iletisim">
            <Button className="rounded-full bg-[#d4af37] hover:bg-[#b5952f] text-black h-12 px-10">Bize Ulaşın</Button>
          </Link>
        </div>
      </section>
    </div>
  );
};

export default FotuberMedya;
