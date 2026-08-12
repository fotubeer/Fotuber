import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, Wallet, Heart, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, formatApiError } from "@/lib/api";

const Field = ({ label, hint, value, onChange, testid }) => (
  <div>
    <label className="text-xs font-medium text-neutral-600">{label}</label>
    <Input type="number" min="0" value={value ?? ""} onChange={(e) => onChange(e.target.value)} data-testid={testid} className="mt-1" />
    {hint && <p className="text-[10px] text-neutral-400 mt-0.5">{hint}</p>}
  </div>
);

export default function AdminSitePricing() {
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try { setC((await api.get("/admin/site-pricing")).data); }
    catch (e) { toast.error(formatApiError(e, "Yüklenemedi")); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const set = (k, v) => setC((p) => ({ ...p, [k]: v }));
  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/admin/site-pricing", {
        member_monthly: Number(c.member_monthly), member_yearly: Number(c.member_yearly),
        invite_premium: Number(c.invite_premium), invite_extend: Number(c.invite_extend),
      });
      setC(data);
      toast.success("Fiyatlar kaydedildi");
    } catch (e) { toast.error(formatApiError(e, "Kaydedilemedi")); }
    finally { setSaving(false); }
  };

  if (loading || !c) return <div className="p-8 text-neutral-400">Yükleniyor…</div>;
  const savings = c.member_monthly > 0 ? Math.round((c.member_monthly * 12 - c.member_yearly) / (c.member_monthly * 12) * 100) : 0;

  return (
    <div data-testid="admin-site-pricing" className="p-4 sm:p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-1">
        <Wallet className="text-emerald-600" />
        <h1 className="text-2xl font-bold text-neutral-900">Genel Fiyatlar</h1>
      </div>
      <p className="text-sm text-neutral-500 mb-6">Üyelik ve davetiye fiyatlarını buradan yönetin. Stüdyo modül fiyat & kotaları için "Stüdyo Fiyat & Kota", Anı Duvarı için "Anı Duvarı Paketleri", tasarım/baskı için "Tasarım Stüdyosu Paketleri" sayfalarını kullanın.</p>

      <div className="space-y-5">
        <section className="rounded-2xl border border-neutral-200 p-5">
          <h2 className="font-semibold flex items-center gap-2 mb-3"><UserCheck size={18} className="text-indigo-600" /> Üyelik (Davetiye üyeliği)</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Aylık (₺)" value={c.member_monthly} onChange={(v) => set("member_monthly", v)} testid="sp-member-monthly" />
            <Field label="Yıllık (₺)" hint={savings > 0 ? `Yıllıkta ~%${savings} tasarruf` : ""} value={c.member_yearly} onChange={(v) => set("member_yearly", v)} testid="sp-member-yearly" />
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-200 p-5">
          <h2 className="font-semibold flex items-center gap-2 mb-3"><Heart size={18} className="text-rose-500" /> Dijital Davetiye</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Premium Tema (tek seferlik ₺)" value={c.invite_premium} onChange={(v) => set("invite_premium", v)} testid="sp-invite-premium" />
            <Field label="Süre Uzatma (₺)" value={c.invite_extend} onChange={(v) => set("invite_extend", v)} testid="sp-invite-extend" />
          </div>
        </section>
      </div>

      <Button onClick={save} disabled={saving} className="mt-6 gap-2 bg-emerald-600 hover:bg-emerald-700" data-testid="sp-save">
        <Save className="w-4 h-4" /> {saving ? "Kaydediliyor…" : "Kaydet"}
      </Button>
    </div>
  );
}
