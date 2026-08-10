import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, Images, HardDrive, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, formatApiError } from "@/lib/api";

const TIER_META = {
  silver: { label: "Silver", accent: "text-slate-600", ring: "border-slate-300", note: "Uygun fiyatlı başlangıç paketi." },
  gold: { label: "Gold", accent: "text-amber-600", ring: "border-amber-300", note: "Masa QR Kartları (yazdırılabilir PDF) dahil." },
};

export default function AdminMemoryWall() {
  const [tiers, setTiers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/admin/photowall-config");
      setTiers(data.tiers || {});
    } catch (e) {
      toast.error(formatApiError(e, "Yüklenemedi"));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const setField = (tier, key, val) =>
    setTiers((t) => ({ ...t, [tier]: { ...t[tier], [key]: val } }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        silver: { price: Number(tiers.silver.price), storage_gb: Number(tiers.silver.storage_gb) },
        gold: { price: Number(tiers.gold.price), storage_gb: Number(tiers.gold.storage_gb) },
      };
      const { data } = await api.put("/admin/photowall-config", payload);
      setTiers(data.tiers || tiers);
      toast.success("Anı Duvarı paket ayarları kaydedildi");
    } catch (e) {
      toast.error(formatApiError(e, "Kaydedilemedi"));
    } finally { setSaving(false); }
  };

  if (loading) return <div className="p-8 text-slate-400">Yükleniyor…</div>;

  return (
    <div className="p-4 sm:p-6 max-w-3xl" data-testid="admin-memorywall">
      <div className="flex items-center gap-3 mb-1">
        <Images className="text-indigo-600" />
        <h1 className="text-2xl font-bold text-slate-900">Anı Duvarı Paketleri</h1>
      </div>
      <p className="text-sm text-slate-500 mb-6">Davetiye Foto & Video Duvarı için Silver ve Gold paketlerinin fiyatını ve depolama kapasitesini belirleyin. Değişiklikler yeni oluşturulan davetiyelere anında uygulanır.</p>

      <div className="grid sm:grid-cols-2 gap-4">
        {["silver", "gold"].map((k) => {
          const meta = TIER_META[k];
          const t = tiers[k] || {};
          return (
            <div key={k} className={`rounded-2xl border-2 ${meta.ring} bg-white p-5`} data-testid={`mw-tier-${k}`}>
              <div className={`text-lg font-bold ${meta.accent} flex items-center justify-between`}>
                {meta.label}
                {t.table_qr && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 flex items-center gap-1"><QrCode className="w-3 h-3" /> Masa QR</span>}
              </div>
              <p className="text-[11px] text-slate-400 mb-4">{meta.note}</p>
              <label className="block text-xs font-medium text-slate-600 mb-1">Fiyat (₺, tek seferlik)</label>
              <Input type="number" min="0" value={t.price ?? ""} onChange={(e) => setField(k, "price", e.target.value)} data-testid={`mw-${k}-price`} className="mb-3" />
              <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1"><HardDrive className="w-3.5 h-3.5" /> Depolama (GB)</label>
              <Input type="number" min="1" value={t.storage_gb ?? ""} onChange={(e) => setField(k, "storage_gb", e.target.value)} data-testid={`mw-${k}-storage`} />
            </div>
          );
        })}
      </div>

      <Button onClick={save} disabled={saving} className="mt-6 gap-2 bg-indigo-600 hover:bg-indigo-700" data-testid="mw-save">
        <Save className="w-4 h-4" /> {saving ? "Kaydediliyor…" : "Kaydet"}
      </Button>
    </div>
  );
}
