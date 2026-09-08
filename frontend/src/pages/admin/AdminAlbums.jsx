import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, ImageIcon, ExternalLink, Trash2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

const emptyAlbum = { couple_names: "", event_date: "", notes: "", max_selections: "", selection_deadline: "" };

const AdminAlbums = () => {
  const [albums, setAlbums] = useState([]);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/admin/photo-albums");
      setAlbums(data);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...editing };
      if (payload.max_selections === "") delete payload.max_selections;
      else payload.max_selections = Number(payload.max_selections);
      await api.post("/admin/photo-albums", payload);
      toast.success("Albüm oluşturuldu");
      setEditing(null);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const remove = async (a) => {
    try { await api.delete(`/admin/photo-albums/${a.id}`); toast.success("Silindi"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const copyLink = (a) => {
    const url = `${window.location.origin}/albumler/${a.share_token}`;
    navigator.clipboard.writeText(url);
    setCopied(a.id);
    toast.success("Bağlantı kopyalandı");
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="admin-albums-title">Fotoğraf Seçim Albümleri</h1>
          <p className="text-sm text-slate-500 mt-1">
            Çektiğiniz fotoğrafları çifte özel albüm olarak yükleyin. Onlar seçtiği kareleri albüm/baskı/tablo olarak işaretler; size sadece kodlar gelir.
          </p>
        </div>
        <Button data-testid="album-new-btn" onClick={() => setEditing({ ...emptyAlbum })} className="bg-slate-900 hover:bg-slate-800">
          <Plus className="w-4 h-4 mr-2" /> Yeni Albüm
        </Button>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Albümler</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Çift / Etkinlik</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead className="text-right">Fotoğraf</TableHead>
                <TableHead>Oluşturulma</TableHead>
                <TableHead className="text-right">Aksiyon</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {albums.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">Henüz albüm yok — "Yeni Albüm" ile başlayın.</TableCell></TableRow>
              )}
              {albums.map((a) => (
                <TableRow key={a.id} data-testid={`album-row-${a.id}`}>
                  <TableCell>
                    <Link to={`/admin/albumler/${a.id}`} className="font-medium hover:text-slate-900">
                      {a.couple_names}
                    </Link>
                  </TableCell>
                  <TableCell className="text-slate-600 text-sm">{a.event_date || "—"}</TableCell>
                  <TableCell className="text-right font-semibold">
                    <Badge variant="outline" className="border-slate-300 bg-slate-50">
                      <ImageIcon className="w-3 h-3 mr-1" /> {a.photo_count}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">{new Date(a.created_at).toLocaleDateString("tr-TR")}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="outline" onClick={() => copyLink(a)} data-testid={`album-copy-${a.id}`}>
                      {copied === a.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span className="ml-1 hidden md:inline">Link</span>
                    </Button>
                    <Link to={`/admin/albumler/${a.id}`}>
                      <Button size="sm" className="bg-slate-900 hover:bg-slate-800" data-testid={`album-open-${a.id}`}>
                        <ExternalLink className="w-3 h-3 md:mr-1" /><span className="hidden md:inline">Aç</span>
                      </Button>
                    </Link>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="destructive" data-testid={`album-delete-${a.id}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{a.couple_names} albümü silinsin mi?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Bu albüm ve içindeki {a.photo_count} fotoğraf tamamen silinecek. Müşteri seçimleri de silinir. Bu işlem geri alınamaz.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(a)} className="bg-red-600 hover:bg-red-700">Sil</AlertDialogAction>
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

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent data-testid="album-dialog">
          <DialogHeader>
            <DialogTitle>Yeni Fotoğraf Seçim Albümü</DialogTitle>
            <DialogDescription>Çift adları, tarih ve seçim kuralları. Fotoğrafları oluşturduktan sonra yükleyeceksiniz.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-semibold text-slate-900 mb-1 block">Çift / Etkinlik Adı</Label>
                <Input value={editing.couple_names} onChange={(e) => setEditing({ ...editing, couple_names: e.target.value })} placeholder="Ayşe & Mehmet — Düğün" data-testid="album-couple-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-semibold text-slate-900 mb-1 block">Etkinlik Tarihi</Label>
                  <Input type="date" value={editing.event_date} onChange={(e) => setEditing({ ...editing, event_date: e.target.value })} data-testid="album-date-input" />
                </div>
                <div>
                  <Label className="text-sm font-semibold text-slate-900 mb-1 block">Seçim Bitiş Tarihi (ops.)</Label>
                  <Input type="date" value={editing.selection_deadline} onChange={(e) => setEditing({ ...editing, selection_deadline: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="text-sm font-semibold text-slate-900 mb-1 block">Maksimum Seçim (ops.)</Label>
                <Input type="number" min="1" value={editing.max_selections} onChange={(e) => setEditing({ ...editing, max_selections: e.target.value })} placeholder="Örn: 50 fotoğrafla sınırla" />
              </div>
              <div>
                <Label className="text-sm font-semibold text-slate-900 mb-1 block">Notlar</Label>
                <Textarea rows={2} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="Müşteriye görünecek kısa açıklama" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Vazgeç</Button>
            <Button onClick={save} disabled={saving} className="bg-slate-900 hover:bg-slate-800" data-testid="album-save-btn">
              {saving ? "Oluşturuluyor..." : "Oluştur"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminAlbums;
