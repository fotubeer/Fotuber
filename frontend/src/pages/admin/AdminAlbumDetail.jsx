import React, { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, formatApiError, API_BASE } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { UploadCloud, Copy, ArrowLeft, Trash2, Check, Users, Package } from "lucide-react";
import { toast } from "sonner";

const AdminAlbumDetail = () => {
  const { id } = useParams();
  const [album, setAlbum] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [selections, setSelections] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [copied, setCopied] = useState(false);
  const fileRef = useRef();

  const load = async () => {
    try {
      const { data } = await api.get(`/admin/photo-albums/${id}`);
      setAlbum(data.album);
      setPhotos(data.photos);
      const sel = await api.get(`/admin/photo-albums/${id}/selections`);
      setSelections(sel.data);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); }, [id]);

  const handleUpload = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    // Upload in batches of 20 to keep it snappy and avoid single huge request timeouts
    const batchSize = 20;
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    try {
      for (let i = 0; i < files.length; i += batchSize) {
        const chunk = files.slice(i, i + batchSize);
        const fd = new FormData();
        chunk.forEach((f) => fd.append("files", f));
        await api.post(`/admin/photo-albums/${id}/photos`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 600000,
        });
        setProgress({ done: Math.min(i + chunk.length, files.length), total: files.length });
      }
      toast.success(`${files.length} fotoğraf yüklendi`);
      await load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const removePhoto = async (p) => {
    try { await api.delete(`/admin/photo-albums/${id}/photos/${p.id}`); load(); toast.success("Fotoğraf silindi"); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const copyLink = () => {
    const url = `${window.location.origin}/albumler/${album.share_token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Bağlantı kopyalandı — müşteriye WhatsApp'tan gönderebilirsiniz");
    setTimeout(() => setCopied(false), 2500);
  };

  if (!album) return <div className="p-6 text-slate-500">Yükleniyor…</div>;

  const shareUrl = `${window.location.origin}/albumler/${album.share_token}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/admin/albumler" className="text-slate-500 hover:text-slate-900"><ArrowLeft className="w-5 h-5" /></Link>
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{album.couple_names}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {album.event_date && <>Etkinlik: <strong>{album.event_date}</strong> · </>}
            Paylaşım Kodu: <code className="text-xs bg-slate-100 px-2 py-0.5 rounded">{album.share_token}</code>
          </p>
        </div>
        <Button variant="outline" onClick={copyLink} data-testid="album-copy-share">
          {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
          Paylaşım Linkini Kopyala
        </Button>
      </div>

      <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between text-sm">
        <div className="truncate flex-1 mr-2">
          <span className="text-slate-500">Müşteriye gönderilecek link:</span>
          <span className="ml-2 font-mono text-slate-800">{shareUrl}</span>
        </div>
        <a href={shareUrl} target="_blank" rel="noreferrer" className="text-blue-600 text-xs underline">Aç</a>
      </div>

      <Tabs defaultValue="photos">
        <TabsList>
          <TabsTrigger value="photos" data-testid="tab-photos">Fotoğraflar ({photos.length})</TabsTrigger>
          <TabsTrigger value="selections" data-testid="tab-selections">
            Seçimler {selections ? `(${selections.count})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="photos" className="space-y-4 pt-4">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <UploadCloud className="w-4 h-4" /> Fotoğraf Yükle (En fazla 1500 adet)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-slate-500">
                Dosya adı = kod. Örn: <code>DSC00123.JPG</code> yüklerseniz kod olarak <strong>DSC00123</strong> kaydedilir.
                Fotoğraflar otomatik olarak preview kalitesine (max 1600px, JPEG 82%) küçültülür — orijinaller kalır sizde.
              </p>
              <Input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                disabled={uploading}
                onChange={(e) => handleUpload(e.target.files)}
                data-testid="album-file-input"
              />
              {uploading && (
                <div className="text-sm text-slate-600" data-testid="album-upload-progress">
                  Yükleniyor: {progress.done} / {progress.total}
                  <div className="w-full h-2 bg-slate-200 rounded mt-1 overflow-hidden">
                    <div className="h-full bg-slate-900" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative group aspect-square rounded overflow-hidden border border-slate-200 bg-slate-100" data-testid={`admin-photo-${p.id}`}>
                <img
                  src={`${API_BASE}/photo-albums/${album.share_token}/file/${p.id}`}
                  alt={p.code}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] px-1.5 py-0.5 font-mono truncate">{p.code}</div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 bg-red-600 hover:bg-red-700 text-white rounded p-1 transition-opacity" data-testid={`admin-photo-del-${p.id}`}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{p.code} silinsin mi?</AlertDialogTitle>
                      <AlertDialogDescription>Bu fotoğraf albümden ve müşteri seçimlerinden kalıcı olarak silinecek.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                      <AlertDialogAction onClick={() => removePhoto(p)} className="bg-red-600 hover:bg-red-700">Sil</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="selections" className="pt-4">
          {(!selections || selections.count === 0) ? (
            <div className="p-8 rounded-lg border border-slate-200 bg-slate-50 text-center text-slate-500 text-sm">
              Henüz seçim yapılmadı. Müşterinize paylaşım linkini gönderdiyseniz, seçim yaptıklarında burada listelenecek.
            </div>
          ) : (
            <div className="space-y-4">
              {selections.by_user.map((u) => (
                <Card key={u.user_id} className="border-slate-200" data-testid={`selection-user-${u.user_id}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-base font-semibold flex items-center gap-2">
                          <Users className="w-4 h-4" /> {u.user_name}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {u.user_phone} · {u.user_email} · {new Date(u.created_at).toLocaleString("tr-TR")}
                        </div>
                        {u.customer_note && <p className="text-sm text-slate-700 mt-2 italic">"{u.customer_note}"</p>}
                      </div>
                      <Badge className="bg-slate-900 text-white">{u.items.length} adet</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Kod</TableHead>
                          <TableHead>Ürün</TableHead>
                          <TableHead>Boyut/Model</TableHead>
                          <TableHead className="text-right">Adet</TableHead>
                          <TableHead>Not</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {u.items.map((it, ix) => (
                          <TableRow key={ix}>
                            <TableCell className="font-mono font-semibold" data-testid={`sel-code-${it.photo_code}`}>{it.photo_code}</TableCell>
                            <TableCell><Badge variant="outline">{it.product_type}</Badge></TableCell>
                            <TableCell className="text-sm">{it.product_variant || "—"}</TableCell>
                            <TableCell className="text-right font-semibold">{it.quantity}</TableCell>
                            <TableCell className="text-xs text-slate-500 max-w-xs truncate">{it.notes || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminAlbumDetail;
