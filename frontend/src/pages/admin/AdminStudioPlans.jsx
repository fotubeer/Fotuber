import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, SlidersHorizontal, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, formatApiError } from "@/lib/api";

const FIELDS = [
  { key: "price", label: "Aylık Fiyat (₺)" },
  { key: "ai_credits", label: "AI Kredisi" },
  { key: "storage_gb", label: "Depolama (GB)" },
  { key: "max_events", label: "Maks. Etkinlik" },
  { key: "max_users", label: "Maks. Kullanıcı" },
  { key: "max_devices", label: "Maks. Cihaz" },
  { key: "link_days", label: "Link Süresi (gün)" },
  { key: "del_days", label: "Silinme Süresi (gün)" },
];

export default function AdminStudioPlans() {
  const [plans, setPlans] = useState([]);
  const [discount, setDiscount] = useState(20);
  const [trialDays, setTrialDays] = useState(3);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/admin/studio-plans");
      setPlans(data.plans || []);
      setDiscount(data.second_module_discount ?? 20);
      setTrialDays(data.trial_days ?? 3);
    } catch (e) {
      toast.error(formatApiError(e, "Yüklenemedi"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const upd = (id, k, v) => setPlans((p) => p.map((it) => (it.id === id ? { ...it, [k]: v } : it)));

  const savePlan = async (plan) => {
    setSavingId(plan.id);
    const body = {};
    FIELDS.forEach(({ key }) => {
      const v = plan[key];
      if (v !== "" && v != null) body[key] = key === "price" ? parseFloat(v) : parseInt(v, 10);
    });
    try {
      await api.put(`/admin/studio-plans/${plan.id}`, body);
      toast.success(`${plan.name} güncellendi`);
    } catch (e) {
      toast.error(formatApiError(e, "Kaydedilemedi"));
    } finally {
      setSavingId(null);
    }
  };

  const saveDiscount = async () => {
    try {
      await api.put("/admin/studio-config", { second_module_discount: parseInt(discount, 10) || 0 });
      toast.success("İkinci modül indirimi güncellendi");
    } catch (e) {
      toast.error(formatApiError(e, "Kaydedilemedi"));
    }
  };

  return (
    <div data-testid="admin-studio-plans" className="p-4 sm:p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-1">
        <SlidersHorizontal className="text-amber-500" size={26} />
        <h1 className="text-2xl sm:text-3xl font-semibold">Stüdyo Fiyat & Kota Paneli</h1>
      </div>
      <p className="text-sm text-neutral-500 mb-6">
        Stüdyo Paneli abonelik planlarının fiyatlarını, kotalarını ve sürelerini düzenleyin.
        Değişiklikler anında tüm stüdyo hesaplarına yansır. Deneme süresi: <b>{trialDays} gün</b>.
      </p>

      <div data-testid="asp-discount" className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-6 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2 text-amber-700 font-medium"><Percent size={18} /> İkinci Modül İndirimi</div>
        <div className="w-28">
          <label className="text-xs text-neutral-500">İndirim (%)</label>
          <Input data-testid="asp-discount-input" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} className="h-9 bg-white" />
        </div>
        <Button data-testid="asp-discount-save" size="sm" className="gap-1 bg-amber-600 hover:bg-amber-700" onClick={saveDiscount}>
          <Save size={14} /> Kaydet
        </Button>
        <span className="text-xs text-neutral-500">Bir stüdyo ikinci modülü (Vesikalık + Galeri) alırsa bu indirim uygulanır.</span>
      </div>

      {loading ? (
        <p className="text-neutral-400">Yükleniyor…</p>
      ) : (
        <div className="space-y-4">
          {plans.map((plan) => (
            <div key={plan.id} data-testid={`asp-plan-${plan.id}`} className="rounded-xl border border-neutral-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-lg flex items-center gap-2">
                  {plan.name}
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 uppercase">{plan.id}</span>
                  {plan.id === "trial" && <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600">Ücretsiz</span>}
                </div>
                <Button data-testid={`asp-save-${plan.id}`} size="sm" disabled={savingId === plan.id}
                  className="gap-1 bg-neutral-900 hover:bg-neutral-800" onClick={() => savePlan(plan)}>
                  <Save size={14} /> {savingId === plan.id ? "..." : "Kaydet"}
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {FIELDS.map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-xs text-neutral-500">{label}</label>
                    <Input data-testid={`asp-${plan.id}-${key}`} type="number" value={plan[key] ?? 0}
                      onChange={(e) => upd(plan.id, key, e.target.value)} className="h-9" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
