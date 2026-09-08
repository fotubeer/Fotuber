import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ScanFace, Images, Check, Loader2, Sparkles } from "lucide-react";
import { studioApi } from "@/lib/studioApi";
import { Button } from "@/components/ui/button";

const MODULES = {
  vesikalik: { label: "Vesikalık", icon: ScanFace, accent: "from-blue-500 to-cyan-500",
    features: ["Biyometrik vesikalık üretimi", "AI kıyafet değişimi", "3'lü toplu işleme", "Firma arşivi & tekrar baskı"] },
  gallery: { label: "Etkinlik Galerisi", icon: Images, accent: "from-fuchsia-500 to-rose-500",
    features: ["Müşteri foto seçim linki", "Sipariş & baskı takibi", "Personel atama", "Toplu yükleme (chunked)"] },
};

export default function StudioPackages() {
  const navigate = useNavigate();
  const [pricing, setPricing] = useState([]);
  const [mods, setMods] = useState({});
  const [busy, setBusy] = useState(null);
  const [period, setPeriod] = useState("monthly");
  const [sel, setSel] = useState({});

  useEffect(() => {
    studioApi.get("/studio/modules/pricing")
      .then((r) => {
        const rows = r.data.pricing || [];
        setPricing(rows);
        setMods(r.data.modules || {});
        const init = {};
        Object.keys(MODULES).forEach((m) => {
          const opts = rows.filter((p) => p.module === m);
          if (opts.length) init[m] = opts[Math.min(2, opts.length - 1)].plan; // varsayılan orta/üst tier
        });
        setSel(init);
      })
      .catch(() => navigate("/studyo"));
  }, [navigate]);

  const buy = async (module) => {
    const plan = sel[module];
    if (!plan) return;
    setBusy(module);
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

  return (
    <div data-testid="studio-packages" className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-6 sm:py-10">
        <button data-testid="pkg-back" onClick={() => navigate("/studyo/panel")} className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white mb-6"><ArrowLeft className="w-4 h-4" /> Panele Dön</button>

        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Modülünü Seç</h1>
          <p className="text-white/50 mt-2 text-sm">Vesikalık ve Etkinlik Galerisi'ni ayrı ayrı satın al. 3 günlük denemede ikisi de açık; sonrasında yalnızca aldığın modül panelinde kalır.</p>
        </div>

        {/* Period toggle */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex items-center gap-1 p-1 rounded-full bg-white/5 border border-white/10" data-testid="pkg-period-toggle">
            {[["monthly", "Aylık"], ["yearly", "Yıllık"]].map(([k, l]) => (
              <button key={k} data-testid={`pkg-period-${k}`} onClick={() => setPeriod(k)}
                className={`px-6 h-9 rounded-full text-sm font-semibold transition-colors ${period === k ? "bg-amber-500 text-neutral-900" : "text-white/60 hover:text-white"}`}>
                {l}{k === "yearly" && <span className="ml-1.5 text-[10px] font-bold text-emerald-300">2 ay bedava</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {Object.entries(MODULES).map(([mkey, m]) => {
            const opts = pricing.filter((p) => p.module === mkey);
            const chosen = opts.find((p) => p.plan === sel[mkey]) || opts[0];
            const Icon = m.icon;
            const owned = mods[mkey];
            if (!chosen) return null;
            const price = period === "yearly" ? chosen.price_yearly : chosen.price;
            const unit = period === "yearly" ? "/yıl" : "/ay";
            return (
              <div key={mkey} data-testid={`pkg-module-${mkey}`}
                className="relative rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent p-6 flex flex-col">
                {owned && <span className="absolute top-4 right-4 text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center gap-1"><Check className="w-3 h-3" /> Aktif</span>}
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${m.accent} grid place-items-center mb-4`}><Icon className="w-6 h-6 text-white" /></div>
                <h2 className="text-xl font-semibold">{m.label}</h2>

                {/* Price */}
                <div className="mt-4 flex items-end gap-2">
                  <span className="text-4xl font-bold text-amber-300" data-testid={`pkg-price-${mkey}`}>{price}₺</span>
                  <span className="text-white/40 text-sm mb-1.5">{unit}</span>
                  {period === "yearly" && chosen.savings_pct > 0 && (
                    <span data-testid={`pkg-savings-${mkey}`} className="mb-2 text-[11px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 px-2 py-0.5">%{chosen.savings_pct} tasarruf</span>
                  )}
                </div>
                {period === "yearly" && (
                  <p className="text-[11px] text-white/40 mt-1">Aylık {chosen.price}₺ yerine yıllık {chosen.price_yearly}₺</p>
                )}

                {/* Features */}
                <ul className="mt-5 space-y-2">
                  {m.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-white/70"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> {f}</li>
                  ))}
                </ul>

                {/* Quota tier selector */}
                {opts.length > 1 && (
                  <div className="mt-5">
                    <p className="text-[11px] text-white/40 mb-1.5 flex items-center gap-1"><Sparkles className="w-3 h-3 text-amber-400" /> Kota paketi</p>
                    <div className="flex flex-wrap gap-2" data-testid={`pkg-tiers-${mkey}`}>
                      {opts.map((p) => (
                        <button key={p.plan} data-testid={`pkg-tier-${mkey}-${p.plan}`} onClick={() => setSel((s) => ({ ...s, [mkey]: p.plan }))}
                          className={`px-3 h-8 rounded-full text-xs font-medium border transition-colors ${sel[mkey] === p.plan ? "bg-white text-neutral-900 border-white" : "border-white/15 text-white/60 hover:text-white"}`}>
                          {p.plan_name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <Button data-testid={`pkg-buy-${mkey}`} onClick={() => buy(mkey)} disabled={busy === mkey}
                  className={`mt-6 w-full h-11 gap-2 font-semibold bg-gradient-to-r ${m.accent} text-white hover:opacity-90`}>
                  {busy === mkey ? <Loader2 className="w-4 h-4 animate-spin" /> : owned ? "Süreyi Uzat" : "Satın Al"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
