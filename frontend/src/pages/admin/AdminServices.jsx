import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const empty = { name: "", description: "", price: 0, duration_hours: 1, image_url: "", active: true };

const AdminServices = () => {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = () => api.get("/services", { params: { only_active: false } }).then((r) => setItems(r.data));
  useEffect(load, []);

  const save = async () => {
    try {
      const payload = { ...editing, price: Number(editing.price || 0), duration_hours: Number(editing.duration_hours || 1) };
      if (editing.id) await api.put(`/services/${editing.id}`, payload);
      else await api.post("/services", payload);
      toast.success("Kaydedildi");
      setEditing(null); load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const del = async (id) => {
    if (!window.confirm("Bu hizmet silinsin mi?")) return;
    await api.delete(`/services/${id}`); load(); toast.success("Silindi");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="admin-services-title">Hizmetler</h1>
          <p className="text-sm text-slate-500 mt-1">Müşterinin randevu alırken göreceği hizmetleri yönetin.</p>
        </div>
        <Button data-testid="service-add-btn" onClick={() => setEditing({ ...empty })} className="bg-slate-900 hover:bg-slate-800">
          <Plus className="w-4 h-4 mr-1" /> Yeni Hizmet
        </Button>
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Görsel</TableHead>
                <TableHead>Ad</TableHead>
                <TableHead>Süre</TableHead>
                <TableHead>Fiyat</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">Aksiyon</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((s) => (
                <TableRow key={s.id} data-testid={`service-row-${s.id}`}>
                  <TableCell>
                    {s.image_url ? <img src={s.image_url} alt={s.name} className="w-14 h-14 object-cover rounded" /> : <div className="w-14 h-14 rounded bg-slate-100" />}
                  </TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.duration_hours} sa</TableCell>
                  <TableCell>₺{Number(s.price).toLocaleString("tr-TR")}</TableCell>
                  <TableCell>{s.active ? <span className="text-emerald-600">Aktif</span> : <span className="text-slate-400">Pasif</span>}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(s)}><Pencil className="w-3 h-3" /></Button>
                    <Button size="sm" variant="destructive" onClick={() => del(s.id)}><Trash2 className="w-3 h-3" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Hizmet Düzenle" : "Yeni Hizmet"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label className="text-xs">Ad</Label><Input data-testid="service-name-input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label className="text-xs">Açıklama</Label><Textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Fiyat (₺)</Label><Input type="number" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} /></div>
                <div><Label className="text-xs">Süre (saat)</Label><Input type="number" value={editing.duration_hours} onChange={(e) => setEditing({ ...editing, duration_hours: e.target.value })} /></div>
              </div>
              <div><Label className="text-xs">Görsel URL</Label><Input value={editing.image_url} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })} placeholder="https://..." /></div>
              <div className="flex items-center gap-3">
                <Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />
                <span className="text-sm">Aktif</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Vazgeç</Button>
            <Button data-testid="service-save-btn" onClick={save} className="bg-slate-900 hover:bg-slate-800">Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminServices;
