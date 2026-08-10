import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, formatApiError } from "@/lib/api";

export default function AdminDesignRights() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get("/admin/design-rights-packages");
      setItems(data);
    } catch (e) {
      toast.error(formatApiError(e, "Yüklenemedi"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const addNew = () =>
    setItems((p) => [...p, { _new: true, id: `tmp-${Date.now()}`, name: "Yeni Paket", rights: 1, price: 0, active: true, sort: p.length }]);

  const upd = (id, k, v) => setItems((p) => p.map((it) => (it.id === id ? { ...it, [k]: v } : it)));

  const save = async (it) => {
    const body = { name: it.name, rights: parseInt(it.rights, 10) || 1, price: parseFloat(it.price) || 0, active: !!it.active, sort: it.sort || 0 };
    try {
      if (it._new) {
        const { data } = await api.post("/admin/design-rights-packages", body);
        setItems((p) => p.map((x) => (x.id === it.id ? data : x)));
      } else {
        await api.put(`/admin/design-rights-packages/${it.id}`, body);
      }
      toast.success("Kaydedildi");
    } catch (e) {
      toast.error(formatApiError(e, "Kaydedilemedi"));
    }
  };

  const del = async (it) => {
    if (it._new) { setItems((p) => p.filter((x) => x.id !== it.id)); return; }
    if (!window.confirm("Paket silinsin mi?")) return;
    try {
      await api.delete(`/admin/design-rights-packages/${it.id}`);
      setItems((p) => p.filter((x) => x.id !== it.id));
      toast.success("Silindi");
    } catch (e) {
      toast.error(formatApiError(e, "Silinemedi"));
    }
  };

  return (
    <div data-testid="admin-design-rights" className="p-4 sm:p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-1">
        <Wand2 className="text-amber-500" size={26} />
        <h1 className="text-2xl sm:text-3xl font-semibold">Tasarım Hakkı Paketleri</h1>
      </div>
      <p className="text-sm text-neutral-500 mb-6">Stüdyo Paneli kullanıcılarının AI davetiye tasarımı için satın alabileceği paketler. 1 hak = 3 AI alternatifi veya 1 revize.</p>

      {loading ? (
        <p className="text-neutral-400">Yükleniyor…</p>
      ) : (
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
              <Button data-testid={`drp-save-${it.id}`} size="sm" className="gap-1 bg-neutral-900 hover:bg-neutral-800" onClick={() => save(it)}>
                <Save size={14} /> Kaydet
              </Button>
              <Button data-testid={`drp-del-${it.id}`} size="sm" variant="destructive" className="gap-1" onClick={() => del(it)}>
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
          <Button data-testid="drp-add" variant="outline" className="gap-1" onClick={addNew}><Plus size={16} /> Yeni Paket Ekle</Button>
        </div>
      )}
    </div>
  );
}
