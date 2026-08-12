import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save, Wand2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, formatApiError } from "@/lib/api";

export default function AdminDesignRights() {
  const [items, setItems] = useState([]);
  const [bulk, setBulk] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [a, b] = await Promise.all([
        api.get("/admin/design-rights-packages"),
        api.get("/admin/bulk-print-packages"),
      ]);
      setItems(a.data);
      setBulk(b.data);
    } catch (e) {
      toast.error(formatApiError(e, "Yüklenemedi"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // ---- AI design-rights packages ----
  const addNew = () =>
    setItems((p) => [...p, { _new: true, id: `tmp-${Date.now()}`, name: "Yeni AI Paketi", rights: 1, price: 0, active: true, sort: p.length }]);
  const upd = (id, k, v) => setItems((p) => p.map((it) => (it.id === id ? { ...it, [k]: v } : it)));
  const save = async (it) => {
    const body = { name: it.name, rights: parseInt(it.rights, 10) || 1, price: parseFloat(it.price) || 0, active: !!it.active, sort: it.sort || 0 };
    try {
      if (it._new) { const { data } = await api.post("/admin/design-rights-packages", body); setItems((p) => p.map((x) => (x.id === it.id ? data : x))); }
      else { await api.put(`/admin/design-rights-packages/${it.id}`, body); }
      toast.success("Kaydedildi");
    } catch (e) { toast.error(formatApiError(e, "Kaydedilemedi")); }
  };
  const del = async (it) => {
    if (it._new) { setItems((p) => p.filter((x) => x.id !== it.id)); return; }
    if (!window.confirm("Paket silinsin mi?")) return;
    try { await api.delete(`/admin/design-rights-packages/${it.id}`); setItems((p) => p.filter((x) => x.id !== it.id)); toast.success("Silindi"); }
    catch (e) { toast.error(formatApiError(e, "Silinemedi")); }
  };

  // ---- Personalized bulk-print packages ----
  const bAddNew = () =>
    setBulk((p) => [...p, { _new: true, id: `tmp-${Date.now()}`, name: "Yeni Baskı Paketi", prints: 200, bonus_ai: 5, price: 0, active: true, sort: p.length }]);
  const bUpd = (id, k, v) => setBulk((p) => p.map((it) => (it.id === id ? { ...it, [k]: v } : it)));
  const bSave = async (it) => {
    const body = { name: it.name, prints: parseInt(it.prints, 10) || 1, bonus_ai: parseInt(it.bonus_ai, 10) || 0, price: parseFloat(it.price) || 0, active: !!it.active, sort: it.sort || 0 };
    try {
      if (it._new) { const { data } = await api.post("/admin/bulk-print-packages", body); setBulk((p) => p.map((x) => (x.id === it.id ? data : x))); }
      else { await api.put(`/admin/bulk-print-packages/${it.id}`, body); }
      toast.success("Kaydedildi");
    } catch (e) { toast.error(formatApiError(e, "Kaydedilemedi")); }
  };
  const bDel = async (it) => {
    if (it._new) { setBulk((p) => p.filter((x) => x.id !== it.id)); return; }
    if (!window.confirm("Paket silinsin mi?")) return;
    try { await api.delete(`/admin/bulk-print-packages/${it.id}`); setBulk((p) => p.filter((x) => x.id !== it.id)); toast.success("Silindi"); }
    catch (e) { toast.error(formatApiError(e, "Silinemedi")); }
  };

  return (
    <div data-testid="admin-design-rights" className="p-4 sm:p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-1">
        <Wand2 className="text-amber-500" size={26} />
        <h1 className="text-2xl sm:text-3xl font-semibold">Tasarım Stüdyosu Paketleri</h1>
      </div>
      <p className="text-sm text-neutral-500 mb-6">Normal üyeler bu paketleri satın alarak AI davetiye tasarımı ve isme özel toplu baskı yapabilir. Stüdyo üyeliği gerekmez.</p>

      {loading ? (
        <p className="text-neutral-400">Yükleniyor…</p>
      ) : (
        <div className="space-y-8">
          {/* AI packages */}
          <section>
            <h2 className="text-lg font-semibold mb-1 flex items-center gap-2"><Wand2 size={18} className="text-amber-500" /> AI Tasarım Hakkı Paketleri</h2>
            <p className="text-xs text-neutral-500 mb-3">1 hak = 3 AI alternatifi veya 1 revize.</p>
            <div className="space-y-3">
              {items.map((it) => (
                <div key={it.id} data-testid={`drp-row-${it.id}`} className="rounded-xl border border-neutral-200 p-4 flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[160px]">
                    <label className="text-xs text-neutral-500">Paket Adı</label>
                    <Input value={it.name} onChange={(e) => upd(it.id, "name", e.target.value)} className="h-9" />
                  </div>
                  <div className="w-24">
                    <label className="text-xs text-neutral-500">Hak</label>
                    <Input type="number" value={it.rights} onChange={(e) => upd(it.id, "rights", e.target.value)} className="h-9" />
                  </div>
                  <div className="w-28">
                    <label className="text-xs text-neutral-500">Fiyat (₺)</label>
                    <Input type="number" value={it.price} onChange={(e) => upd(it.id, "price", e.target.value)} className="h-9" />
                  </div>
                  <div className="flex flex-col items-center">
                    <label className="text-xs text-neutral-500 mb-1">Aktif</label>
                    <Switch checked={!!it.active} onCheckedChange={(v) => upd(it.id, "active", v)} />
                  </div>
                  <Button data-testid={`drp-save-${it.id}`} size="sm" className="gap-1 bg-neutral-900 hover:bg-neutral-800" onClick={() => save(it)}><Save size={14} /> Kaydet</Button>
                  <Button data-testid={`drp-del-${it.id}`} size="sm" variant="destructive" className="gap-1" onClick={() => del(it)}><Trash2 size={14} /></Button>
                </div>
              ))}
              <Button data-testid="drp-add" variant="outline" className="gap-1" onClick={addNew}><Plus size={16} /> Yeni AI Paketi Ekle</Button>
            </div>
          </section>

          {/* Bulk-print packages */}
          <section>
            <h2 className="text-lg font-semibold mb-1 flex items-center gap-2"><Printer size={18} className="text-indigo-500" /> İsme Özel Toplu Baskı Paketleri</h2>
            <p className="text-xs text-neutral-500 mb-3">Matbaaya hazır kişiye özel davetiye baskı kotası. Hediye AI kredisi ekleyebilirsiniz.</p>
            <div className="space-y-3">
              {bulk.map((it) => (
                <div key={it.id} data-testid={`bpp-row-${it.id}`} className="rounded-xl border border-neutral-200 p-4 flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[160px]">
                    <label className="text-xs text-neutral-500">Paket Adı</label>
                    <Input value={it.name} onChange={(e) => bUpd(it.id, "name", e.target.value)} className="h-9" />
                  </div>
                  <div className="w-24">
                    <label className="text-xs text-neutral-500">Baskı</label>
                    <Input type="number" value={it.prints} onChange={(e) => bUpd(it.id, "prints", e.target.value)} className="h-9" />
                  </div>
                  <div className="w-24">
                    <label className="text-xs text-neutral-500">Hediye AI</label>
                    <Input type="number" value={it.bonus_ai} onChange={(e) => bUpd(it.id, "bonus_ai", e.target.value)} className="h-9" />
                  </div>
                  <div className="w-28">
                    <label className="text-xs text-neutral-500">Fiyat (₺)</label>
                    <Input type="number" value={it.price} onChange={(e) => bUpd(it.id, "price", e.target.value)} className="h-9" />
                  </div>
                  <div className="flex flex-col items-center">
                    <label className="text-xs text-neutral-500 mb-1">Aktif</label>
                    <Switch checked={!!it.active} onCheckedChange={(v) => bUpd(it.id, "active", v)} />
                  </div>
                  <Button data-testid={`bpp-save-${it.id}`} size="sm" className="gap-1 bg-neutral-900 hover:bg-neutral-800" onClick={() => bSave(it)}><Save size={14} /> Kaydet</Button>
                  <Button data-testid={`bpp-del-${it.id}`} size="sm" variant="destructive" className="gap-1" onClick={() => bDel(it)}><Trash2 size={14} /></Button>
                </div>
              ))}
              <Button data-testid="bpp-add" variant="outline" className="gap-1" onClick={bAddNew}><Plus size={16} /> Yeni Baskı Paketi Ekle</Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
