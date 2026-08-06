import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const empty = { name: "", role: "Fotoğrafçı", phone: "", email: "", salary: 0, active: true, hired_at: "" };

const Staff = () => {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = () => api.get("/staff").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const payload = { ...editing, salary: Number(editing.salary || 0) };
      if (editing.id) await api.put(`/staff/${editing.id}`, payload);
      else await api.post("/staff", payload);
      toast.success("Kaydedildi");
      setEditing(null);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const remove = async (id) => {
    if (!window.confirm("Bu personel silinsin mi?")) return;
    try { await api.delete(`/staff/${id}`); load(); toast.success("Silindi"); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="admin-staff-title">Personel</h1>
          <p className="text-sm text-slate-500 mt-1">Personel bilgilerini ve maaşlarını yönetin.</p>
        </div>
        <Button data-testid="staff-add-btn" onClick={() => setEditing({ ...empty })} className="bg-slate-900 hover:bg-slate-800">
          <Plus className="w-4 h-4 mr-1" /> Yeni Personel
        </Button>
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad Soyad</TableHead>
                <TableHead>Görev</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>E-posta</TableHead>
                <TableHead>Maaş</TableHead>
                <TableHead>İşe Giriş</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">Aksiyon</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-500">Kayıtlı personel yok.</TableCell></TableRow>
              )}
              {items.map((s) => (
                <TableRow key={s.id} data-testid={`staff-row-${s.id}`}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.role}</TableCell>
                  <TableCell>{s.phone}</TableCell>
                  <TableCell className="text-slate-500">{s.email}</TableCell>
                  <TableCell>₺{Number(s.salary || 0).toLocaleString("tr-TR")}</TableCell>
                  <TableCell>{s.hired_at}</TableCell>
                  <TableCell>{s.active ? <span className="text-emerald-600">Aktif</span> : <span className="text-slate-400">Pasif</span>}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(s)}><Pencil className="w-3 h-3" /></Button>
                    <Button size="sm" variant="destructive" onClick={() => remove(s.id)}><Trash2 className="w-3 h-3" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Personel Düzenle" : "Yeni Personel"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Ad Soyad</Label><Input data-testid="staff-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
                <div><Label className="text-xs">Görev</Label><Input value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Telefon</Label><Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
                <div><Label className="text-xs">E-posta</Label><Input value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Maaş (₺)</Label><Input type="number" value={editing.salary} onChange={(e) => setEditing({ ...editing, salary: e.target.value })} /></div>
                <div><Label className="text-xs">İşe Giriş</Label><Input type="date" value={editing.hired_at || ""} onChange={(e) => setEditing({ ...editing, hired_at: e.target.value })} /></div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />
                <span className="text-sm">Aktif</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Vazgeç</Button>
            <Button data-testid="staff-save-btn" onClick={save} className="bg-slate-900 hover:bg-slate-800">Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Staff;
