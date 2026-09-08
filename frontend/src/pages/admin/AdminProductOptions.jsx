import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Frame, Book } from "lucide-react";
import { toast } from "sonner";

const empty = { kind: "canvas", name: "", size: "", price: 0, description: "", active: true, sort_order: 0 };

const AdminProductOptions = () => {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try { const { data } = await api.get("/admin/product-options"); setItems(data); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...editing, price: Number(editing.price) || 0, sort_order: Number(editing.sort_order) || 0 };
      if (editing.id) await api.patch(`/admin/product-options/${editing.id}`, payload);
      else await api.post("/admin/product-options", payload);
      toast.success("Kaydedildi");
      setEditing(null);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const remove = async (opt) => {
    try { await api.delete(`/admin/product-options/${opt.id}`); toast.success("Silindi"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const canvasList = items.filter((i) => i.kind === "canvas");
  const albumList = items.filter((i) => i.kind === "album");

  const renderTable = (list, kind, icon) => (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          {icon} {kind === "canvas" ? "Tablo Modelleri" : "Albüm Modelleri"} ({list.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ad</TableHead>
              <TableHead>Boyut</TableHead>
              <TableHead className="text-right">Fiyat</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead className="text-right">Aksiyon</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-slate-500">Henüz {kind === "canvas" ? "tablo" : "albüm"} eklenmedi.</TableCell></TableRow>
            )}
            {list.map((o) => (
              <TableRow key={o.id} data-testid={`option-row-${o.id}`}>
                <TableCell>
                  <div className="font-medium">{o.name}</div>
                  {o.description && <div className="text-xs text-slate-500 max-w-xs truncate">{o.description}</div>}
                </TableCell>
                <TableCell className="text-sm">{o.size || "—"}</TableCell>
                <TableCell className="text-right">{o.price ? `₺${Number(o.price).toLocaleString("tr-TR")}` : "—"}</TableCell>
                <TableCell>
                  {o.active
                    ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">Aktif</Badge>
                    : <Badge variant="outline">Pasif</Badge>}
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing({ ...o })} data-testid={`option-edit-${o.id}`}><Pencil className="w-3 h-3" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive" data-testid={`option-delete-${o.id}`}><Trash2 className="w-3 h-3" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{o.name} silinsin mi?</AlertDialogTitle>
                        <AlertDialogDescription>Bu seçenek albümdeki müşterilere artık gösterilmeyecek.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove(o)} className="bg-red-600 hover:bg-red-700">Sil</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="admin-product-options-title">Ürün Seçenekleri</h1>
          <p className="text-sm text-slate-500 mt-1">
            Fotoğraf seçim albümünde müşteriye gösterilecek tablo ve albüm modellerini buradan yönetin. Baskı boyutları (10x15, 13x18, 15x21, 20x30, 30x40) sabittir ve otomatik listelenir.
          </p>
        </div>
        <Button data-testid="option-new-btn" onClick={() => setEditing({ ...empty })} className="bg-slate-900 hover:bg-slate-800">
          <Plus className="w-4 h-4 mr-2" /> Yeni Seçenek
        </Button>
      </div>

      {renderTable(canvasList, "canvas", <Frame className="w-4 h-4" />)}
      {renderTable(albumList, "album", <Book className="w-4 h-4" />)}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent data-testid="option-dialog">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Seçeneği Düzenle" : "Yeni Seçenek"}</DialogTitle>
            <DialogDescription>Bu seçenek müşteri seçim ekranında ilgili ürün türünde listelenecek.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-semibold mb-1 block">Tür</Label>
                <Select value={editing.kind} onValueChange={(v) => setEditing({ ...editing, kind: v })}>
                  <SelectTrigger data-testid="option-kind"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="canvas">Tablo (Kanvas)</SelectItem>
                    <SelectItem value="album">Albüm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-semibold mb-1 block">Ad / Model</Label>
                  <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Örn: Ahşap Çerçeve, Klasik Deri Albüm" data-testid="option-name" />
                </div>
                <div>
                  <Label className="text-sm font-semibold mb-1 block">Boyut</Label>
                  <Input value={editing.size} onChange={(e) => setEditing({ ...editing, size: e.target.value })} placeholder="Örn: 50x70 cm, 30x40 · 30 sayfa" data-testid="option-size" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-semibold mb-1 block">Fiyat (₺, ops.)</Label>
                  <Input type="number" min="0" step="0.01" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} />
                </div>
                <div>
                  <Label className="text-sm font-semibold mb-1 block">Sıralama</Label>
                  <Input type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="text-sm font-semibold mb-1 block">Açıklama</Label>
                <Textarea rows={2} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Kısa açıklama (opsiyonel)" />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} data-testid="option-active" />
                Aktif (müşteri seçim ekranında göster)
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Vazgeç</Button>
            <Button onClick={save} disabled={saving} className="bg-slate-900 hover:bg-slate-800" data-testid="option-save-btn">
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminProductOptions;
