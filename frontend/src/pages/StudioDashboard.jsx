import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Camera, LogOut, IdCard, Clock, Sparkles, HardDrive, CalendarRange, ShieldAlert,
  Images, Palette, ScanFace, Check, Crown, Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { studioApi, clearStudioToken } from "@/lib/studioApi";

export default function StudioDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    studioApi.get("/studio/me")
      .then((r) => setData(r.data))
      .catch(() => navigate("/studyo"))
      .finally(() => setLoading(false));
  }, [navigate]);

  const logout = async () => {
    try { await studioApi.post("/studio/logout"); } catch {}
    clearStudioToken();
    toast.success("Çıkış yapıldı");
    navigate("/studyo");
  };

  if (loading) return <div className="min-h-screen grid place-items-center bg-neutral-950 text-white/60">Yükleniyor…</div>;
  if (!data) return null;

  const acc = data.account;
  const m = acc.membership;
  const plans = data.plans || [];
  const wm = m.limits.watermark_forced;

  return (
    <div data-testid="studio-dashboard" className="min-h-screen text-white"
      style={{ background: "radial-gradient(1000px 500px at 85% -10%, #17233d 0%, #070b14 60%, #05070d 100%)" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Top bar */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 grid place-items-center">
            <Camera className="text-neutral-900" size={20} />
          </div>
          <div>
            <div className="text-sm text-white/50 leading-none">Fotuber Stüdyo Paneli</div>
            <div data-testid="studio-firma-name" className="text-lg font-semibold leading-tight">{acc.firma_adi}</div>
          </div>
          <Button data-testid="studio-logout" variant="outline" size="sm" onClick={logout}
            className="ml-auto gap-1.5 bg-white/5 border-white/15 text-white hover:bg-white/10">
            <LogOut size={15} /> Çıkış
          </Button>
        </div>

        {/* Hero cards: FTB + trial */}
        <div className="grid sm:grid-cols-3 gap-4 mt-6">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-white/12 p-5 bg-white/5">
            <div className="flex items-center gap-2 text-white/50 text-xs"><IdCard size={15} /> MÜŞTERİ KODU</div>
            <div data-testid="studio-ftb-code" className="mt-2 text-2xl font-mono font-bold tracking-widest text-amber-300">{acc.ftb_code}</div>
            <p className="mt-1 text-xs text-white/40">Destek ve siparişlerde bu kodu kullanın.</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="rounded-2xl border border-white/12 p-5 bg-white/5">
            <div className="flex items-center gap-2 text-white/50 text-xs"><Clock size={15} /> ÜYELİK DURUMU</div>
            <div data-testid="studio-status" className="mt-2 flex items-center gap-2">
              <span className={`text-2xl font-bold ${m.active ? "text-emerald-400" : "text-red-400"}`}>
                {m.status === "trial" ? "Deneme" : m.status === "active" ? "Aktif" : "Süresi Doldu"}
              </span>
            </div>
            <p className="mt-1 text-xs text-white/40">
              {m.active ? `${m.days_left} gün kaldı · ${m.plan_name}` : "Devam için plan seçin"}
            </p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className={`rounded-2xl border p-5 ${wm ? "border-amber-400/40 bg-amber-500/10" : "border-white/12 bg-white/5"}`}>
            <div className="flex items-center gap-2 text-white/50 text-xs"><ShieldAlert size={15} /> FİLİGRAN</div>
            <div data-testid="studio-watermark" className="mt-2 text-2xl font-bold">
              {wm ? <span className="text-amber-300">Zorunlu</span> : <span className="text-emerald-400">Kapalı</span>}
            </div>
            <p className="mt-1 text-xs text-white/40">
              {wm ? "Deneme sürümünde çıktılara Fotuber filigranı eklenir." : "Filigransız dışa aktarım aktif."}
            </p>
          </motion.div>
        </div>

        {/* Limits */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <Limit icon={Sparkles} label="AI Kredisi" value={m.ai_credits_remaining} testid="studio-limit-ai" />
          <Limit icon={Wand2} label="Tasarım Hakkı" value={acc.design_rights ?? 0} testid="studio-limit-design" />
          <Limit icon={HardDrive} label="Depolama" value={`${m.limits.storage_gb} GB`} testid="studio-limit-storage" />
          <Limit icon={CalendarRange} label="Etkinlik" value={m.limits.max_events} testid="studio-limit-events" />
        </div>

        {/* Modules */}
        <h2 className="mt-8 mb-3 text-sm font-semibold text-white/60 uppercase tracking-wide">Modüller</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <ModuleCard testid="studio-module-vesikalik" icon={ScanFace} title="Vesikalık Stüdyosu"
            desc="Biyometrik vesikalık üretimi, AI kıyafet, rötuş ve baskı." to="/vesikalik" cta="Aç" />
          <ModuleCard testid="studio-module-design" icon={Palette} title="Davetiye Tasarım Stüdyosu"
            desc="Canva benzeri sürükle-bırak editör, 50+ font, kişiselleştirme." to="/tasarim-studyosu" cta="Tasarla" accent />
          <ModuleCard testid="studio-module-gallery" icon={Images} title="Etkinlik Galerisi"
            desc="Müşteri foto seçimi, albüm, retouch ve sipariş takibi." soon />
        </div>

        {/* Plans */}
        <h2 className="mt-8 mb-3 text-sm font-semibold text-white/60 uppercase tracking-wide">Abonelik Planları</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {plans.map((p) => (
            <div key={p.id} data-testid={`studio-plan-${p.id}`}
              className={`rounded-2xl border p-4 ${p.id === m.plan ? "border-amber-400 bg-amber-500/10" : "border-white/12 bg-white/5"}`}>
              <div className="flex items-center gap-1.5">
                {p.id === "gold" && <Crown size={15} className="text-amber-300" />}
                <span className="font-semibold">{p.name}</span>
              </div>
              <div className="mt-1.5 text-xl font-bold">
                {p.price === 0 ? "Ücretsiz" : `${p.price}₺`}
                <span className="text-xs font-normal text-white/40"> / {p.period}</span>
              </div>
              <ul className="mt-2.5 space-y-1">
                {p.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-white/60">
                    <Check size={13} className="mt-0.5 text-emerald-400 shrink-0" />{h}
                  </li>
                ))}
              </ul>
              {p.id !== "trial" && p.id !== m.plan && (
                <Button data-testid={`studio-upgrade-${p.id}`} size="sm"
                  onClick={() => toast.info("PayTR ile ödeme Aşama 2'de aktifleşecek.")}
                  className="mt-3 w-full h-8 bg-white/10 hover:bg-white/20 text-white text-xs">Yükselt</Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Limit({ icon: Icon, label, value, testid }) {
  return (
    <div data-testid={testid} className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center gap-1.5 text-white/45 text-[11px]"><Icon size={13} /> {label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function ModuleCard({ testid, icon: Icon, title, desc, to, cta, soon, accent }) {
  const inner = (
    <div className={`h-full rounded-2xl border p-5 transition-colors ${
      accent ? "border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/15"
             : soon ? "border-white/10 bg-white/5 opacity-70"
                    : "border-white/12 bg-white/5 hover:bg-white/10"}`}>
      <div className="w-11 h-11 rounded-xl grid place-items-center bg-white/10"><Icon size={22} /></div>
      <div className="mt-3 font-semibold flex items-center gap-2">
        {title}
        {soon && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">Yakında</span>}
      </div>
      <p className="mt-1 text-xs text-white/50 leading-relaxed">{desc}</p>
      {!soon && <div className="mt-3 text-sm font-medium text-amber-300">{cta} →</div>}
    </div>
  );
  return soon ? <div data-testid={testid}>{inner}</div> : <Link data-testid={testid} to={to}>{inner}</Link>;
}
