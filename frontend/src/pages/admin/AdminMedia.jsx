import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Aperture, Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function AdminMedia() {
  const [rows, setRows] = useState([]);
  const [ed, setEd] = useState(null);
  const load = () => api.get("/media/admin/partners").then(({ data }) => setRows(data.partners || [])).catch((e) => toast.error(formatApiError(e)));
  useEffect(() => { load(); }, []);

  const save = async () => {
    const body = { name: ed.name, email: ed.email, active: ed.active,
      can_download: ed.can_download, can_upload: ed.can_upload, can_backup: ed.can_backup };
    if (ed.password) body.password = ed.password;
    try {
      if (ed.id) await api.patch(`/media/admin/partners/${ed.id}`, body);
      else await api.post("/media/admin/partners", body);
      toast.success("Kaydedildi"); setEd(null); load();
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const del = async (id) => { if (!window.confirm("Firma ve dosyaları silinsin mi?")) return; await api.delete(`/media/admin/partners/${id}`); load(); };
  const openNew = () => setEd({ name: "", email: "", password: "", active: true, can_download: true, can_upload: false, can_backup: false });
  const openEdit = (p) => setEd({ id: p.id, name: p.name, email: p.email, password: "", active: p.active,
    can_download: !!p.perms?.download, can_upload: !!p.perms?.upload, can_backup: !!p.perms?.backup });

  return (
    <div className="space-y-6" data-testid="admin-media">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2"><Aperture className="text-sky-500" /> Fotuber Medya — Firmalar</h1>
          <p className="text-sm text-slate-500 mt-1">Firma hesapları, yetkiler (indir/yükle/yedekle) ve durum yönetimi.</p>
        </div>
        <div className="flex gap-2">
          <a href="/medya" target="_blank" rel="noreferrer"><Button variant="outline" className="gap-2"><ExternalLink size={16} /> Firma Portalı</Button></a>
          <Button onClick={openNew} className="bg-slate-900 hover:bg-slate-800 gap-1" data-testid="media-new"><Plus size={16} /> Firma Ekle</Button>
        </div>
      </div>

      <Card className="border-slate-200"><CardHeader><CardTitle className="text-base">Firmalar ({rows.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">Henüz firma yok.</p>}
          {rows.map((p) => (
            <div key={p.id} data-testid={`media-row-${p.id}`} className={`rounded-xl border p-3 flex items-center gap-3 ${p.active ? "border-slate-200" : "bg-slate-50 opacity-70 border-slate-200"}`}>
              <div className="flex-1">
                <div className="font-medium">{p.name} {!p.active && <span className="text-xs text-red-500">(pasif)</span>}</div>
                <div className="text-xs text-slate-500">{p.email} · {[p.perms?.download && "indir", p.perms?.upload && "yükle", p.perms?.backup && "yedek"].filter(Boolean).join(" · ") || "yetki yok"}</div>
              </div>
              <button onClick={() => openEdit(p)} className="text-slate-500 p-1" data-testid={`media-edit-${p.id}`}><Pencil size={15} /></button>
              <button onClick={() => del(p.id)} className="text-red-500 p-1" data-testid={`media-del-${p.id}`}><Trash2 size={15} /></button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!ed} onOpenChange={(o) => !o && setEd(null)}>
        <DialogContent data-testid="media-dialog">
          <DialogHeader><DialogTitle>{ed?.id ? "Firma Düzenle" : "Yeni Firma"}</DialogTitle></DialogHeader>
          {ed && (
            <div className="space-y-3">
              <div><Label>Firma Adı</Label><Input data-testid="media-name" value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} /></div>
              <div><Label>E-posta (giriş)</Label><Input data-testid="media-email-in" value={ed.email} onChange={(e) => setEd({ ...ed, email: e.target.value })} /></div>
              <div><Label>Şifre {ed.id && <span className="text-xs text-slate-400">(boş bırak = değişmez)</span>}</Label><Input data-testid="media-pass-in" value={ed.password} onChange={(e) => setEd({ ...ed, password: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-2">
                {[["can_download", "İndirme"], ["can_upload", "Yükleme"], ["can_backup", "Yedek/Sil"]].map(([k, l]) => (
                  <label key={k} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"><span>{l}</span><Switch data-testid={`media-${k}`} checked={ed[k]} onCheckedChange={(v) => setEd({ ...ed, [k]: v })} /></label>
                ))}
              </div>
              <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"><span>Aktif</span><Switch data-testid="media-active" checked={ed.active} onCheckedChange={(v) => setEd({ ...ed, active: v })} /></label>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setEd(null)}>Vazgeç</Button><Button onClick={save} className="bg-slate-900 hover:bg-slate-800" data-testid="media-save">Kaydet</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
