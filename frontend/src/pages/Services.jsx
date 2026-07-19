import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Clock, ArrowRight } from "lucide-react";
import { SEO } from "@/components/SEO";

const Services = () => {
  const [services, setServices] = useState([]);
  useEffect(() => { api.get("/services").then((r) => setServices(r.data)).catch(() => {}); }, []);

  return (
    <div className="max-w-7xl mx-auto px-6 py-24">
      <SEO title="Hizmetler" description="Fotuber Studio hizmetleri: düğün, nişan, bebek, aile, portre, kurumsal fotoğraf ve podcast prodüksiyonu paketleri." path="/hizmetler" />
      <div className="max-w-2xl mb-16">
        <div className="text-xs tracking-[0.3em] uppercase text-[#d4af37] mb-3">Hizmetler</div>
        <h1 className="hero-title text-5xl md:text-6xl mb-6">
          Bir <em>anı</em> yakalamanın<br />birden çok yolu vardır.
        </h1>
        <p className="text-neutral-400">Aşağıdaki hizmetlerimizden ihtiyacınıza en uygun olanı seçebilirsiniz.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {services.map((s) => (
          <div key={s.id} data-testid={`services-page-card-${s.id}`} className="group border border-neutral-900 rounded-2xl overflow-hidden bg-neutral-950">
            <div className="aspect-[16/10] overflow-hidden">
              <img src={s.image_url} alt={s.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
            </div>
            <div className="p-8">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[#d4af37] mb-3">
                <Clock className="w-3.5 h-3.5" /> {s.duration_hours} saat
              </div>
              <h3 className="font-serif text-3xl mb-3">{s.name}</h3>
              <p className="text-neutral-400 leading-relaxed mb-6">{s.description}</p>
              <div className="flex items-center justify-between">
                <div className="text-neutral-300">
                  <span className="text-xs text-neutral-500 mr-2">Başlangıç</span>
                  <span className="text-2xl font-serif">₺{Number(s.price).toLocaleString("tr-TR")}</span>
                </div>
                <Link to="/randevu">
                  <Button className="rounded-full bg-[#d4af37] hover:bg-[#b5952f] text-black">
                    Randevu Al <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Services;
