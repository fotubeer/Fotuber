import React, { useEffect, useRef, useState } from "react";
import { api, formatApiError, API_BASE } from "@/lib/api";
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
import { QRCodeCanvas } from "qrcode.react";
import { Plus, QrCode, Trash2, Download, ExternalLink, Clock, Copy, HardDrive, Link2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const emptyEvent = { name: "", couple_names: "", event_date: "", max_size_per_user_mb: 200, retention_days: 3, welcome_message: "" };

const formatBytes = (n) => {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0; let x = n;
  while (x > 1024 && i < u.length - 1) { x /= 1024; i++; }
  return `${x.toFixed(1)} ${u[i]}`;
};

const AdminGuestEvents = () => {
  const [events, setEvents] = useState([]);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showQr, setShowQr] = useState(null);
  const [detail, setDetail] = useState(null);
  const [downloadLink, setDownloadLink] = useState(null); // { event, token, expires_at, days }
  const qrRef = useRef();

  const load = async () => {
    try { const { data } = await api.get("/admin/guest-events"); setEvents(data); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/admin/guest-events", editing);
      toast.success("Etkinlik oluşturuldu — QR kodu görüntüleyebilirsiniz");
      setEditing(null);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const remove = async (ev) => {
    try { await api.delete(`/admin/guest-events/${ev.id}`); toast.success("Silindi"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const openDetail = async (ev) => {
    try { const { data } = await api.get(`/admin/guest-events/${ev.id}`); setDetail(data); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const extend = async (ev, days) => {
    try {
      await api.post(`/admin/guest-events/${ev.id}/extend?days=${days}`);
      toast.success(`${days} gün uzatıldı`);
      load();
      if (detail?.event?.id === ev.id) openDetail(ev);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const downloadZip = async (ev) => {
    try {
      toast.info("ZIP hazırlanıyor... (Dosya boyutuna göre 1-3 dk sürebilir)");
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/admin/guest-events/${ev.id}/download-zip`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("İndirme başarısız");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ev.name.replace(/\s/g, "_")}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(String(e)); }
  };

  const downloadQr = (ev) => {
    const canvas = document.getElementById(`qr-canvas-${ev.id}`);
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-${ev.name.replace(/\s/g, "_")}.png`;
    a.click();
  };

  const generateDownloadLink = async (ev, days) => {
    try {
      const { data } = await api.post(`/admin/guest-events/${ev.id}/generate-download-link`, { days });
      setDownloadLink({ event: ev, ...data });
      toast.success(`İndirme linki oluşturuldu (${days} gün geçerli)`);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const revokeDownloadLink = async (ev) => {
    try {
      await api.post(`/admin/guest-events/${ev.id}/revoke-download-link`);
      toast.success("İndirme linki iptal edildi");
      setDownloadLink(null);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const eventUrl = (ev) => `${window.location.origin}/etkinlik/${ev.upload_token}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="admin-events-title">Etkinlik QR — Misafir Fotoğraf Toplama</h1>
          <p className="text-sm text-slate-500 mt-1">
            Masalara bırakabileceğiniz QR kodları ile misafirler siteye kayıt olup fotoğraf/video yüklerler.
            Kişi başı 200MB, süre sonunda otomatik silinir.
          </p>
        </div>
        <Button data-testid="event-new-btn" onClick={() => setEditing({ ...emptyEvent })} className="bg-slate-900 hover:bg-slate-800">
          <Plus className="w-4 h-4 mr-2" /> Yeni Etkinlik
        </Button>
      </div>

      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base font-semibold">Etkinlikler</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Etkinlik</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead className="text-right">Yükleme</TableHead>
                <TableHead className="text-right">Boyut</TableHead>
                <TableHead>Silinme</TableHead>
                <TableHead className="text-right">Aksiyon</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">Henüz etkinlik yok</TableCell></TableRow>
              )}
              {events.map((ev) => {
                const expired = ev.delete_at && new Date(ev.delete_at) < new Date();
                return (
                  <TableRow key={ev.id} data-testid={`event-row-${ev.id}`}>
                    <TableCell>
                      <div className="font-medium">{ev.name}</div>
                      {ev.couple_names && <div className="text-xs text-slate-500">{ev.couple_names}</div>}
                    </TableCell>
                    <TableCell className="text-sm">{ev.event_date || "—"}</TableCell>
                    <TableCell className="text-right"><Badge variant="outline">{ev.upload_count || 0} dosya</Badge></TableCell>
                    <TableCell className="text-right text-sm">{formatBytes(ev.total_size || 0)}</TableCell>
                    <TableCell>
                      {expired ? (
                        <Badge className="bg-red-100 text-red-700 border-red-300">Süresi Doldu</Badge>
                      ) : (
                        <span className="text-xs text-slate-600 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {new Date(ev.delete_at).toLocaleDateString("tr-TR")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="outline" onClick={() => setShowQr(ev)} data-testid={`event-qr-${ev.id}`}>
                        <QrCode className="w-3 h-3 md:mr-1" /><span className="hidden md:inline">QR</span>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openDetail(ev)} data-testid={`event-detail-${ev.id}`}>
                        <ExternalLink className="w-3 h-3 md:mr-1" /><span className="hidden md:inline">Aç</span>
                      </Button>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => downloadZip(ev)} disabled={(ev.upload_count || 0) === 0} data-testid={`event-zip-${ev.id}`}>
                        <Download className="w-3 h-3 md:mr-1" /><span className="hidden md:inline">ZIP</span>
                      </Button>
                      <Button size="sm" className="bg-[#d4af37] hover:bg-[#b5952f] text-black" onClick={() => setDownloadLink({ event: ev, download_token: ev.download_token, download_expires_at: ev.download_expires_at, days: ev.download_days })} disabled={(ev.upload_count || 0) === 0} data-testid={`event-share-${ev.id}`} title="Çifte indirme linki">
                        <Link2 className="w-3 h-3 md:mr-1" /><span className="hidden md:inline">Çifte Link</span>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive" data-testid={`event-delete-${ev.id}`}><Trash2 className="w-3 h-3" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{ev.name} silinsin mi?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Etkinlik ve tüm yüklenen dosyalar ({ev.upload_count || 0}) kalıcı olarak silinecek.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(ev)} className="bg-red-600 hover:bg-red-700">Sil</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Hidden QR canvases (for downloadable PNG each) */}
      <div style={{ position: "absolute", left: -9999 }}>
        {events.map((ev) => (
          <QRCodeCanvas key={ev.id} id={`qr-canvas-${ev.id}`} value={eventUrl(ev)} size={800} level="H" includeMargin />
        ))}
      </div>

      {/* New event dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent data-testid="event-dialog">
          <DialogHeader>
            <DialogTitle>Yeni Etkinlik</DialogTitle>
            <DialogDescription>Misafirlerin fotoğraf yükleyebilmesi için etkinlik oluşturun. QR kodu oluşturulduktan sonra masalara yerleştirin.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-semibold mb-1 block">Etkinlik Adı</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Örn: Ayşe & Mehmet Düğün" data-testid="event-name-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-semibold mb-1 block">Çift Adları</Label>
                  <Input value={editing.couple_names} onChange={(e) => setEditing({ ...editing, couple_names: e.target.value })} placeholder="Ayşe & Mehmet" />
                </div>
                <div>
                  <Label className="text-sm font-semibold mb-1 block">Tarih</Label>
                  <Input type="date" value={editing.event_date} onChange={(e) => setEditing({ ...editing, event_date: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-semibold mb-1 block">Kişi Başı Kota (MB)</Label>
                  <Input type="number" min="10" max="1000" value={editing.max_size_per_user_mb} onChange={(e) => setEditing({ ...editing, max_size_per_user_mb: Number(e.target.value) })} />
                </div>
                <div>
                  <Label className="text-sm font-semibold mb-1 block">Saklama Süresi (Gün)</Label>
                  <Input type="number" min="1" max="30" value={editing.retention_days} onChange={(e) => setEditing({ ...editing, retention_days: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <Label className="text-sm font-semibold mb-1 block">Karşılama Mesajı</Label>
                <Textarea rows={2} value={editing.welcome_message} onChange={(e) => setEditing({ ...editing, welcome_message: e.target.value })} placeholder="Örn: Bu kareler bizim için çok değerli!" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Vazgeç</Button>
            <Button onClick={save} disabled={saving} className="bg-slate-900 hover:bg-slate-800" data-testid="event-save-btn">
              {saving ? "Oluşturuluyor..." : "Oluştur"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR view dialog */}
      <Dialog open={!!showQr} onOpenChange={(o) => !o && setShowQr(null)}>
        <DialogContent data-testid="qr-dialog">
          <DialogHeader>
            <DialogTitle>{showQr?.name} — QR Kodu</DialogTitle>
            <DialogDescription>Masalara yerleştirmek için indirebilirsiniz. Misafirler QR'ı tarayıp direkt yükleme sayfasına gider.</DialogDescription>
          </DialogHeader>
          {showQr && (
            <div className="text-center space-y-4">
              <div className="inline-block p-6 bg-white rounded-2xl border border-slate-200">
                <QRCodeCanvas value={eventUrl(showQr)} size={280} level="H" includeMargin />
              </div>
              <div className="text-xs font-mono text-slate-500 break-all">{eventUrl(showQr)}</div>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={() => { navigator.clipboard.writeText(eventUrl(showQr)); toast.success("Link kopyalandı"); }} data-testid="qr-copy-link">
                  <Copy className="w-4 h-4 mr-2" /> Linki Kopyala
                </Button>
                <Button className="bg-slate-900 hover:bg-slate-800" onClick={() => downloadQr(showQr)} data-testid="qr-download">
                  <Download className="w-4 h-4 mr-2" /> QR'ı İndir (PNG)
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.event.name}</DialogTitle>
                <DialogDescription>
                  {detail.uploads.length} dosya · {formatBytes(detail.event.total_size || 0)} · Silinme: {new Date(detail.event.delete_at).toLocaleString("tr-TR")}
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-2 mb-3">
                <Button size="sm" variant="outline" onClick={() => extend(detail.event, 3)}>+3 Gün</Button>
                <Button size="sm" variant="outline" onClick={() => extend(detail.event, 7)}>+7 Gün</Button>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => downloadZip(detail.event)} disabled={detail.uploads.length === 0}>
                  <Download className="w-3 h-3 mr-1" /> Tüm Dosyaları ZIP İndir
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Yükleyen</TableHead>
                    <TableHead>Dosya</TableHead>
                    <TableHead>Tür</TableHead>
                    <TableHead className="text-right">Boyut</TableHead>
                    <TableHead>Zaman</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.uploads.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="text-sm">{u.user_name}<div className="text-xs text-slate-500">{u.user_phone}</div></TableCell>
                      <TableCell className="text-xs max-w-xs truncate">{u.filename}</TableCell>
                      <TableCell className="text-xs">{u.mime_type?.split("/")[0] || "?"}</TableCell>
                      <TableCell className="text-right text-sm">{formatBytes(u.size)}</TableCell>
                      <TableCell className="text-xs text-slate-500">{new Date(u.uploaded_at).toLocaleString("tr-TR")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Couple download link dialog */}
      <Dialog open={!!downloadLink} onOpenChange={(o) => !o && setDownloadLink(null)}>
        <DialogContent data-testid="download-link-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Link2 className="w-4 h-4" /> Çifte İndirme Linki</DialogTitle>
            <DialogDescription>
              Bu linki çifte WhatsApp'tan gönderin. Onlar tüm misafir yüklemelerini ZIP olarak indirebilir. Süre dolduğunda link otomatik geçersiz olur.
            </DialogDescription>
          </DialogHeader>
          {downloadLink && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500 mb-1">Etkinlik</div>
                <div className="font-semibold">{downloadLink.event.couple_names || downloadLink.event.name}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {downloadLink.event.upload_count || 0} dosya · {formatBytes(downloadLink.event.total_size || 0)}
                </div>
              </div>

              {downloadLink.download_token ? (
                <>
                  <div>
                    <Label className="text-xs">İndirme Bağlantısı</Label>
                    <div className="flex gap-2 mt-1">
                      <Input readOnly value={`${window.location.origin}/paylas/${downloadLink.download_token}`} className="font-mono text-xs" />
                      <Button variant="outline" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/paylas/${downloadLink.download_token}`); toast.success("Kopyalandı"); }} data-testid="download-link-copy">
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    Geçerlilik sonu: <b>{new Date(downloadLink.download_expires_at).toLocaleString("tr-TR")}</b>
                  </div>
                  <div className="pt-2 border-t border-slate-200">
                    <Label className="text-xs mb-2 block">Süreyi Yenile veya Değiştir</Label>
                    <div className="flex flex-wrap gap-2">
                      {[2, 3, 4, 5, 6, 7].map((d) => (
                        <Button
                          key={d}
                          size="sm"
                          variant="outline"
                          onClick={() => generateDownloadLink(downloadLink.event, d)}
                          data-testid={`download-link-days-${d}`}
                        >
                          {d} gün
                        </Button>
                      ))}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => revokeDownloadLink(downloadLink.event)}
                        data-testid="download-link-revoke"
                      >
                        <Trash2 className="w-3 h-3 mr-1" /> Linki İptal Et
                      </Button>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2">
                      Yeni süre seçtiğinizde link değişmeden sadece bitiş tarihi güncellenir.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-600">
                    Bu etkinlik için henüz indirme linki oluşturulmadı. Kaç gün geçerli olsun?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[2, 3, 4, 5, 6, 7].map((d) => (
                      <Button
                        key={d}
                        onClick={() => generateDownloadLink(downloadLink.event, d)}
                        className={d === 3 ? "bg-[#d4af37] hover:bg-[#b5952f] text-black" : "bg-slate-900 hover:bg-slate-800"}
                        data-testid={`download-link-create-${d}`}
                      >
                        {d} gün geçerli
                      </Button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDownloadLink(null)}>Kapat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminGuestEvents;
