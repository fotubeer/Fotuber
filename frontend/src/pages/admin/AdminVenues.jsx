import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { QRCodeCanvas } from "qrcode.react";
import { Plus, MapPin, QrCode, Trash2, Download, Copy, Users, Sparkles, PowerOff } from "lucide-react";
import { toast } from "sonner";

const EVENT_TYPES = [
  { value: "wedding", label: "Düğün" },
  { value: "engagement", label: "Nişan" },
  { value: "henna", label: "Kına" },
  { value: "nikah", label: "Nikah" },
  { value: "birthday", label: "Doğum Günü" },
  { value: "other", label: "Diğer" },
];

const eventTypeLabel = (t) => EVENT_TYPES.find((x) => x.value === t)?.label || t;

const AdminVenues = () => {
  const [venues, setVenues] = useState([]);
  const [creating, setCreating] = useState(null);
  const [activating, setActivating] = useState(null);
  const [showQr, setShowQr] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try { const { data } = await api.get("/admin/venues"); setVenues(data); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); }, []);

  const saveVenue = async () => {
    setSaving(true);
    try {
      if (creating.id) await api.patch(`/admin/venues/${creating.id}`, creating);
      else await api.post("/admin/venues", creating);
      toast.success("Kaydedildi");
      setCreating(null);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const activate = async () => {
    setSaving(true);
    try {
      await api.post(`/admin/venues/${activating.venue_id}/activate`, activating);
      toast.success("Yeni çift bu mekana atandı — QR aynı, misafirler artık bu çifte yüklüyor.");
      setActivating(null);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const deactivate = async (v) => {
    try { await api.post(`/admin/venues/${v.id}/deactivate`); toast.success("Mekan pasif duruma alındı"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const removeVenue = async (v) => {
    try { await api.delete(`/admin/venues/${v.id}`); toast.success("Silindi"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const downloadQr = (v) => {
    const canvas = document.getElementById(`venue-qr-${v.id}`);
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qr-mekan-${v.name.replace(/\s/g, "_")}.png`;
    a.click();
  };

  const venueUrl = (v) => `${window.location.origin}/mekan/${v.qr_token}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="admin-venues-title">Mekanlar (Sabit QR Kodları)</h1>
          <p className="text-sm text-slate-500 mt-1">
            Her mekan için <strong>bir sabit QR</strong> üretin (nişanevi, düğün salonu vb.).
            Bu QR asla değişmez — masalarınıza yerleştirin veya laminate edin.
            Yeni bir çift geldiğinde sadece "Aktif Çifti Değiştir" butonuyla o günün çiftini/organizasyonunu güncellersiniz;
            misafirler QR'ı taradığında karşılarına o çift çıkar.
          </p>
        </div>
        <Button data-testid="venue-new-btn" onClick={() => setCreating({ name: "", description: "", default_max_size_per_user_mb: 200, default_retention_days: 3 })} className="bg-slate-900 hover:bg-slate-800">
          <Plus className="w-4 h-4 mr-2" /> Yeni Mekan
        </Button>
      </div>

      {venues.length === 0 && (
        <Card className="border-slate-200 border-dashed">
          <CardContent className="py-16 text-center text-slate-500">
            <MapPin className="w-8 h-8 mx-auto mb-3 text-slate-400" />
            Henüz mekan tanımlanmadı. Örneğin: "Nişanevi", "Fotuber Düğün Salonu" oluşturup QR'ı laminate edin.
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {venues.map((v) => {
          const ev = v.current_event;
          const active = !!ev && (!ev.delete_at || ev.delete_at > new Date().toISOString());
          return (
            <Card key={v.id} className="border-slate-200" data-testid={`venue-card-${v.id}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-slate-400" /> {v.name}
                    </CardTitle>
                    {v.description && <p className="text-xs text-slate-500 mt-1">{v.description}</p>}
                  </div>
                  {active ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">Aktif</Badge>
                  ) : (
                    <Badge variant="outline" className="text-slate-500">Boşta</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {ev ? (
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="w-3 h-3 text-[#d4af37]" />
                      <span className="text-[11px] uppercase tracking-widest text-slate-500">Şu an aktif çift</span>
                    </div>
                    <div className="text-lg font-serif" style={{ fontFamily: "var(--fotuber-font-heading)" }}>
                      {ev.couple_names || ev.name}
                    </div>
                    <div className="text-xs text-slate-500 flex gap-3 flex-wrap mt-1">
                      <span>{eventTypeLabel(ev.event_type)}</span>
                      {ev.event_date && <span>· {ev.event_date}</span>}
                      <span>· Silinme: {new Date(ev.delete_at).toLocaleDateString("tr-TR")}</span>
                      <span>· {ev.upload_count || 0} yükleme</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                    Bu mekana henüz aktif çift atanmadı. Misafirler QR'ı taradığında "aktif etkinlik yok" mesajı görür.
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => setActivating({ venue_id: v.id, venue_name: v.name, couple_names: "", event_date: "", event_type: "wedding", welcome_message: "", retention_days: v.default_retention_days, max_size_per_user_mb: v.default_max_size_per_user_mb })}
                    className="bg-[#d4af37] hover:bg-[#b5952f] text-black"
                    data-testid={`venue-activate-${v.id}`}
                  >
                    <Sparkles className="w-3 h-3 mr-1" /> {ev ? "Aktif Çifti Değiştir" : "Bugünün Çiftini Ata"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowQr(v)} data-testid={`venue-qr-${v.id}`}>
                    <QrCode className="w-3 h-3 mr-1" /> QR
                  </Button>
                  {ev && (
                    <Button size="sm" variant="outline" onClick={() => deactivate(v)} className="text-orange-700 border-orange-300" data-testid={`venue-deactivate-${v.id}`}>
                      <PowerOff className="w-3 h-3 mr-1" /> Pasif Yap
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setCreating({ ...v })}>
                    Düzenle
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive" data-testid={`venue-delete-${v.id}`}><Trash2 className="w-3 h-3" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{v.name} mekanı silinsin mi?</AlertDialogTitle>
                        <AlertDialogDescription>QR kodu geçersiz olur. Bu mekanın etkinlikleri "Etkinlik QR" sayfasında görünmeye devam eder.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                        <AlertDialogAction onClick={() => removeVenue(v)} className="bg-red-600 hover:bg-red-700">Sil</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Hidden QR canvases */}
      <div style={{ position: "absolute", left: -9999 }}>
        {venues.map((v) => <QRCodeCanvas key={v.id} id={`venue-qr-${v.id}`} value={venueUrl(v)} size={800} level="H" includeMargin />)}
      </div>

      {/* Create/Edit venue dialog */}
      <Dialog open={!!creating} onOpenChange={(o) => !o && setCreating(null)}>
        <DialogContent data-testid="venue-dialog">
          <DialogHeader>
            <DialogTitle>{creating?.id ? "Mekanı Düzenle" : "Yeni Mekan"}</DialogTitle>
            <DialogDescription>Her mekan için bir defa QR oluşturursunuz. Sonrasında sadece o günün çiftini değiştirirsiniz.</DialogDescription>
          </DialogHeader>
          {creating && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-semibold mb-1 block">Mekan Adı</Label>
                <Input value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} placeholder="Fotuber Nişanevi" data-testid="venue-name-input" />
              </div>
              <div>
                <Label className="text-sm font-semibold mb-1 block">Açıklama (opsiyonel)</Label>
                <Textarea rows={2} value={creating.description} onChange={(e) => setCreating({ ...creating, description: e.target.value })} placeholder="Mekan hakkında kısa not" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-semibold mb-1 block">Varsayılan Kota (MB/kişi)</Label>
                  <Input type="number" min="10" max="1000" value={creating.default_max_size_per_user_mb} onChange={(e) => setCreating({ ...creating, default_max_size_per_user_mb: Number(e.target.value) })} />
                </div>
                <div>
                  <Label className="text-sm font-semibold mb-1 block">Varsayılan Silinme (Gün)</Label>
                  <Input type="number" min="1" max="30" value={creating.default_retention_days} onChange={(e) => setCreating({ ...creating, default_retention_days: Number(e.target.value) })} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(null)}>Vazgeç</Button>
            <Button onClick={saveVenue} disabled={saving} className="bg-slate-900 hover:bg-slate-800" data-testid="venue-save-btn">
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activate couple dialog */}
      <Dialog open={!!activating} onOpenChange={(o) => !o && setActivating(null)}>
        <DialogContent data-testid="venue-activate-dialog">
          <DialogHeader>
            <DialogTitle>Bugünün Çiftini Ata — {activating?.venue_name}</DialogTitle>
            <DialogDescription>
              Bu formu doldurduğunuzda mekandaki QR aynı kalır, ancak misafirler artık bu çifte yüklüyor. Yeni etkinlik otomatik oluşturulur.
            </DialogDescription>
          </DialogHeader>
          {activating && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-semibold mb-1 block">Çift Adları</Label>
                <Input value={activating.couple_names} onChange={(e) => setActivating({ ...activating, couple_names: e.target.value })} placeholder="Ayşe & Mehmet" data-testid="activate-couple-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-semibold mb-1 block">Organizasyon Türü</Label>
                  <Select value={activating.event_type} onValueChange={(v) => setActivating({ ...activating, event_type: v })}>
                    <SelectTrigger data-testid="activate-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-semibold mb-1 block">Tarih</Label>
                  <Input type="date" value={activating.event_date} onChange={(e) => setActivating({ ...activating, event_date: e.target.value })} data-testid="activate-date" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-semibold mb-1 block">Kişi Başı Kota (MB)</Label>
                  <Input type="number" min="10" max="1000" value={activating.max_size_per_user_mb} onChange={(e) => setActivating({ ...activating, max_size_per_user_mb: Number(e.target.value) })} />
                </div>
                <div>
                  <Label className="text-sm font-semibold mb-1 block">Silinme (Gün)</Label>
                  <Input type="number" min="1" max="30" value={activating.retention_days} onChange={(e) => setActivating({ ...activating, retention_days: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <Label className="text-sm font-semibold mb-1 block">Karşılama Mesajı</Label>
                <Textarea rows={2} value={activating.welcome_message} onChange={(e) => setActivating({ ...activating, welcome_message: e.target.value })} placeholder="Örn: Bu kareler bizim için çok değerli — çekin, paylaşın!" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivating(null)}>Vazgeç</Button>
            <Button onClick={activate} disabled={saving || !activating?.couple_names} className="bg-[#d4af37] hover:bg-[#b5952f] text-black" data-testid="activate-save-btn">
              {saving ? "Kaydediliyor..." : "Aktif Et"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR dialog */}
      <Dialog open={!!showQr} onOpenChange={(o) => !o && setShowQr(null)}>
        <DialogContent data-testid="venue-qr-dialog">
          <DialogHeader>
            <DialogTitle>{showQr?.name} — Sabit QR Kodu</DialogTitle>
            <DialogDescription>Bu QR asla değişmez. Aktif çift değiştikçe misafirlere otomatik olarak yeni çift gösterilir.</DialogDescription>
          </DialogHeader>
          {showQr && (
            <div className="text-center space-y-4">
              <div className="inline-block p-6 bg-white rounded-2xl border border-slate-200">
                <QRCodeCanvas value={venueUrl(showQr)} size={280} level="H" includeMargin />
              </div>
              <div className="text-xs font-mono text-slate-500 break-all">{venueUrl(showQr)}</div>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={() => { navigator.clipboard.writeText(venueUrl(showQr)); toast.success("Link kopyalandı"); }}>
                  <Copy className="w-4 h-4 mr-2" /> Linki Kopyala
                </Button>
                <Button className="bg-slate-900 hover:bg-slate-800" onClick={() => downloadQr(showQr)}>
                  <Download className="w-4 h-4 mr-2" /> QR'ı İndir (PNG)
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminVenues;
