import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ScanFace, Images, Check, Loader2, Tag } from "lucide-react";
import { studioApi } from "@/lib/studioApi";
import { Button } from "@/components/ui/button";

const MODULES = {
  vesikalik: { label: "Vesikalık", icon: ScanFace, desc: "Biyometrik üretim, AI kıyafet, 3'lü işleme, firma arşivi." },
  gallery: { label: "Etkinlik Galerisi", icon: Images, desc: "Müşteri foto seçimi, sipariş takibi, personel atama." },
};

export default function StudioPackages() {
  const navigate = useNavigate();
  const [pricing, setPricing] = useState([]);
  const [mods, setMods] = useState({});
  const [busy, setBusy] = useState(null);
  const [period, setPeriod] = useState("monthly");

  useEffect(() => {
    studioApi.get("/studio/modules/pricing")
      .then((r) => { setPricing(r.data.pricing || []); setMods(r.data.modules || {}); })
      .catch(() => navigate("/studyo"));
  }, [navigate]);

  const buy = async (module, plan) => {
    setBusy(`${module}-${plan}`);
    try {
      const { data } = await studioApi.post("/studio/payments/module/create", {
        module, plan, period, origin_url: window.location.origin + "/studyo/panel",
      });
      const url = data.payment_url || data.url || data.link;
      if (url) { window.location.href = url; return; }
      toast.error("Ödeme bağlantısı alınamadı");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "İşlem başarısız");
    } finally { setBusy(null); }
  };

  const byModule = (m) => pricing.filter((p) => p.module === m);

  return (
    <div data-testid="studio-packages" className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-2">
          <button data-testid="pkg-back" onClick={() => navigate("/studyo/panel")} className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white"><ArrowLeft className="w-4 h-4" /> Panel</button>
          <h1 className="text-xl font-semibold ml-1">Paketler & Satın Al</h1>
        </div>
        <p className="text-sm text-white/50 mb-4 flex items-center gap-2"><Tag className="w-4 h-4 text-amber-400" /> İkinci modülü satın aldığınızda otomatik <b className="text-amber-300">%20 indirim</b> uygulanır.</p>

        <div className="inline-flex items-center gap-1 p-1 rounded-full bg-white/5 mb-6" data-testid="pkg-period-toggle">
          {[["monthly", "Aylık"], ["yearly", "Yıllık · ~2 ay bedava"]].map(([k, l]) => (
            <button key={k} data-testid={`pkg-period-${k}`} onClick={() => setPeriod(k)}
              className={`px-4 h-8 rounded-full text-sm font-medium ${period === k ? "bg-amber-500 text-neutral-900" : "text-white/60 hover:text-white"}`}>{l}</button>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {Object.entries(MODULES).map(([mkey, m]) => {
            const owned = mods[mkey];
            const Icon = m.icon;
            return (
              <div key={mkey} data-testid={`pkg-module-${mkey}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-9 h-9 rounded-lg bg-white/10 grid place-items-center"><Icon className="w-4 h-4 text-amber-400" /></div>
                  <h2 className="font-semibold">{m.label}</h2>
                  {owned && <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center gap-1"><Check className="w-3 h-3" /> Aktif</span>}
                </div>
                <p className="text-xs text-white/50 mb-4">{m.desc}</p>
                <div className="space-y-2">
                  {byModule(mkey).map((p) => (
                    <div key={p.plan} data-testid={`pkg-${mkey}-${p.plan}`} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="font-medium text-sm">{p.plan_name}</div>
                        {p.discount > 0 && <div className="text-[11px] text-amber-300">%{p.discount} indirim uygulandı</div>}
                      </div>
                      <div className="ml-auto text-right">
                        {period === "monthly"
                          ? <>{p.discount > 0 && <div className="text-[11px] text-white/40 line-through">{p.base_price}₺</div>}
                              <div className="font-semibold text-amber-300">{p.price}₺<span className="text-[10px] text-white/40">/ay</span></div></>
                          : <>{p.discount > 0 && <div className="text-[11px] text-white/40 line-through">{p.base_yearly}₺</div>}
                              <div className="font-semibold text-amber-300">{p.price_yearly}₺<span className="text-[10px] text-white/40">/yıl</span></div>
                              {p.savings_pct > 0 && <div data-testid={`pkg-savings-${mkey}-${p.plan}`} className="inline-block mt-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5">%{p.savings_pct} tasarruf</div>}</>}
                      </div>
                      <Button data-testid={`pkg-buy-${mkey}-${p.plan}`} size="sm" onClick={() => buy(mkey, p.plan)} disabled={busy === `${mkey}-${p.plan}`}
                        className="gap-1 bg-amber-500 hover:bg-amber-600 text-neutral-900 font-semibold">
                        {busy === `${mkey}-${p.plan}` ? <Loader2 className="w-4 h-4 animate-spin" /> : "Satın Al"}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
