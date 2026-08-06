import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast, Toaster } from "sonner";
import { Loader2, Plus, ExternalLink, BarChart3, Download, Trash2, Users, MessageCircleHeart, Calendar, Images, Eye, EyeOff, Presentation, QrCode, MessageCircle, Copy, Send, Clock, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { EVENT_TYPE_LABELS } from "@/lib/invitationThemes";

const API = process.env.REACT_APP_BACKEND_URL;
const api = (path, opts = {}) => fetch(`${API}/api${path}`, { credentials: "include", ...opts });

const normalizePhone = (raw) => {
  let d = String(raw).replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("90")) return d;
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) return "90" + d;
  return d;
};

export default function MyInvitations() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [items, setItems] = useState([]);
  const [report, setReport] = useState(null);
  const [auth, setAuth] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [photoMod, setPhotoMod] = useState(null);
  const [modPhotos, setModPhotos] = useState([]);
  const [modStorage, setModStorage] = useState(null);
  const [modLoading, setModLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [waInvite, setWaInvite] = useState(null);
  const [waMessage, setWaMessage] = useState("");
  const [waNumbers, setWaNumbers] = useState("");

  const load = useCallback(async () => {
    try {
      const meRes = await api("/member/me");
      if (!meRes.ok) { setMe(null); setLoading(false); return; }
      const md = await meRes.json();
      if (md.user?.role !== "member") { setMe(null); setLoading(false); return; }
      setMe(md);
      const r = await api("/invitations");
      if (r.ok) { const d = await r.json(); setItems(d.invitations || []); }
    } catch (e) { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const login = async () => {
    setBusy(true);
    try {
      const r = await api("/member/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(auth) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Giriş başarısız");
      setLoading(true); await load();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const openReport = async (id) => {
    try {
      const r = await api(`/invitations/${id}/report`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Rapor alınamadı");
      setReport(d);
    } catch (e) { toast.error(e.message); }
  };

  const downloadCsv = async (id, slug) => {
    try {
      const r = await api(`/invitations/${id}/report.csv`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `davetiye_${slug}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error("İndirilemedi"); }
  };

  const remove = async (id) => {
    if (!window.confirm("Bu davetiye ve tüm yanıtları silinsin mi?")) return;
    try {
      const r = await api(`/invitations/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setItems((x) => x.filter((i) => i.id !== id));
      toast.success("Silindi");
    } catch (e) { toast.error("Silinemedi"); }
  };

  const openPhotoWall = async (inv) => {
    setPhotoMod(inv); setModLoading(true); setModPhotos([]); setModStorage(null);
    try {
      const r = await api(`/invitations/${inv.id}/photos/manage`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Yüklenemedi");
      setModPhotos(d.photos || []);
      setModStorage({ used: d.storage_used || 0, limit: d.storage_limit || 0, gb: d.storage_limit_gb });
    } catch (e) { toast.error(e.message); }
    finally { setModLoading(false); }
  };

  const extendInvitation = async (inv) => {
    if (inv.extended) { toast.message("Bu davetiyenin süresi zaten uzatılmış"); return; }
    setPaying(true);
    try {
      const r = await api("/payments/paytr/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "invitation_extend", invitation_id: inv.id, origin_url: window.location.origin }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Ödeme başlatılamadı");
      window.open(d.link, "_blank");
      toast.message("Ödeme sayfası açıldı", { description: "Ödeme tamamlanınca süre otomatik uzatılır." });
      const iv = setInterval(async () => {
        try {
          const sr = await api(`/payments/status/${d.callback_id}`);
          const sd = await sr.json().catch(() => ({}));
          if (sd.status === "paid") {
            clearInterval(iv); setPaying(false);
            toast.success("Süre uzatıldı! Bağlantı etkinlikten 15 gün sonrasına kadar geçerli 🎉");
            load();
          }
        } catch (e) { /* keep polling */ }
      }, 3000);
      setTimeout(() => { clearInterval(iv); setPaying(false); }, 300000);
    } catch (e) { toast.error(e.message); setPaying(false); }
  };

  const downloadMedia = async (inv) => {
    toast.message("Medya paketi hazırlanıyor…");
    try {
      const r = await api(`/invitations/${inv.id}/photos/download`);
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || "İndirilemedi"); }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `davetiye_${inv.slug}_foto-video.zip`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Foto/video paketi indirildi");
    } catch (e) { toast.error(e.message); }
  };

  const toggleHide = async (pid, hidden) => {
    try {
      const r = await api(`/invitations/${photoMod.id}/photos/${pid}/moderate`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hidden }),
      });
      if (!r.ok) throw new Error();
      setModPhotos((x) => x.map((p) => (p.id === pid ? { ...p, hidden } : p)));
      toast.success(hidden ? "Fotoğraf gizlendi" : "Fotoğraf tekrar gösteriliyor");
    } catch (e) { toast.error("İşlem başarısız"); }
  };

  const delPhoto = async (pid) => {
    if (!window.confirm("Bu fotoğraf kalıcı olarak silinsin mi?")) return;
    try {
      const r = await api(`/invitations/${photoMod.id}/photos/${pid}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setModPhotos((x) => x.filter((p) => p.id !== pid));
      toast.success("Silindi");
    } catch (e) { toast.error("Silinemedi"); }
  };

  const openWhatsApp = (inv) => {
    const link = `${window.location.origin}/davetiye/${inv.slug}`;
    const names = inv.person2 ? `${inv.person1} & ${inv.person2}` : inv.person1;
    setWaMessage(`Merhaba! ${names} olarak sizi özel günümüze davet ediyoruz 💐\nDavetiye, konum ve LCV için: ${link}`);
    setWaNumbers("");
    setWaInvite(inv);
  };

  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-950 text-white"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  if (!me) return (
    <div className="min-h-screen grid place-items-center bg-slate-950 text-white px-4">
      <Toaster position="top-center" richColors />
      <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
        <h1 className="text-xl font-bold mb-1">Davetiyelerim</h1>
        <p className="text-sm text-slate-400 mb-4">Davetiyelerinizi görmek için giriş yapın.</p>
        <div className="space-y-2 text-left">
          <Input type="email" placeholder="E-posta" value={auth.email} onChange={(e) => setAuth({ ...auth, email: e.target.value })} data-testid="myinv-email" />
          <Input type="password" placeholder="Şifre" value={auth.password} onChange={(e) => setAuth({ ...auth, password: e.target.value })} data-testid="myinv-password" />
        </div>
        <Button onClick={login} disabled={busy} className="w-full mt-3 bg-indigo-600 hover:bg-indigo-700" data-testid="myinv-login">
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Giriş Yap
        </Button>
        <Link to="/davetiye-olustur" className="block mt-4 text-sm text-indigo-400" data-testid="myinv-create-link">+ Yeni Davetiye Oluştur</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 py-10 px-4 text-slate-900">
      <Toaster position="top-center" richColors />
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Davetiyelerim</h1>
            <p className="text-sm text-slate-500">Yanıtları (LCV) ve anıları buradan takip edin.</p>
          </div>
          <Link to="/davetiye-olustur"><Button className="bg-indigo-600 hover:bg-indigo-700" data-testid="new-invitation-btn"><Plus className="w-4 h-4 mr-1" /> Yeni</Button></Link>
        </div>

        {items.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center text-slate-500 border border-slate-200">
            Henüz davetiyeniz yok. <Link to="/davetiye-olustur" className="text-indigo-600 font-medium">İlk davetiyenizi oluşturun →</Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {items.map((inv) => (
              <div key={inv.id} className="bg-white rounded-2xl border border-slate-200 p-5" data-testid={`inv-card-${inv.id}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <Badge variant="outline" className="mb-1">{EVENT_TYPE_LABELS[inv.event_type] || "Etkinlik"}</Badge>
                    <div className="text-lg font-semibold text-slate-900">{inv.person2 ? `${inv.person1} & ${inv.person2}` : inv.person1}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-1"><Calendar className="w-3 h-3" /> {inv.event_date}</div>
                  </div>
                  {inv.expired && <Badge className="bg-slate-200 text-slate-600">Süresi doldu</Badge>}
                </div>
                <div className="flex items-center gap-4 mt-3 text-sm">
                  <span className="flex items-center gap-1 text-emerald-600"><Users className="w-4 h-4" /> {inv.stats.rsvp_yes}/{inv.stats.rsvp_total}</span>
                  <span className="flex items-center gap-1 text-rose-500"><MessageCircleHeart className="w-4 h-4" /> {inv.stats.memories}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <a href={`/davetiye/${inv.slug}`} target="_blank" rel="noreferrer"><Button variant="outline" size="sm" className="w-full" data-testid={`inv-view-${inv.id}`}><ExternalLink className="w-4 h-4 mr-1" /> Aç</Button></a>
                  <Button variant="outline" size="sm" onClick={() => openReport(inv.id)} data-testid={`inv-report-${inv.id}`}><BarChart3 className="w-4 h-4 mr-1" /> Rapor</Button>
                  <Button variant="outline" size="sm" onClick={() => downloadCsv(inv.id, inv.slug)} data-testid={`inv-csv-${inv.id}`}><Download className="w-4 h-4 mr-1" /> CSV</Button>
                  <Button variant="outline" size="sm" className="text-rose-600 hover:bg-rose-50" onClick={() => remove(inv.id)} data-testid={`inv-delete-${inv.id}`}><Trash2 className="w-4 h-4 mr-1" /> Sil</Button>
                </div>
                {inv.sections?.photowall && (<>
                  <Button variant="outline" size="sm" className="w-full mt-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50" onClick={() => openPhotoWall(inv)} data-testid={`inv-photowall-${inv.id}`}>
                    <Images className="w-4 h-4 mr-1" /> Foto/Video Duvarı Yönetimi
                  </Button>
                  <Button variant="outline" size="sm" className="w-full mt-2 text-slate-700 border-slate-300 hover:bg-slate-50" onClick={() => downloadMedia(inv)} data-testid={`inv-download-media-${inv.id}`}>
                    <Download className="w-4 h-4 mr-1" /> Foto/Videoları İndir (ZIP)
                  </Button>
                </>)}
                {inv.checkin_enabled && (
                  <a href={`/davetiye/${inv.id}/kapi`} target="_blank" rel="noreferrer" className="block">
                    <Button variant="outline" size="sm" className="w-full mt-2 text-emerald-600 border-emerald-200 hover:bg-emerald-50" data-testid={`inv-checkin-${inv.id}`}>
                      <QrCode className="w-4 h-4 mr-1" /> Kapıda Karşılama (QR)
                    </Button>
                  </a>
                )}
                <Button variant="outline" size="sm" className="w-full mt-2 text-[#128C7E] border-[#25D366]/40 hover:bg-[#25D366]/10" onClick={() => openWhatsApp(inv)} data-testid={`inv-whatsapp-${inv.id}`}>
                  <MessageCircle className="w-4 h-4 mr-1" /> WhatsApp ile Davet Gönder
                </Button>
                {!inv.extended ? (
                  <Button variant="outline" size="sm" className="w-full mt-2 text-amber-700 border-amber-300 hover:bg-amber-50" onClick={() => extendInvitation(inv)} disabled={paying} data-testid={`inv-extend-${inv.id}`}>
                    <Clock className="w-4 h-4 mr-1" /> Süreyi Uzat · 99₺ (+15 gün)
                  </Button>
                ) : (
                  <div className="w-full mt-2 text-center text-[11px] text-emerald-600 flex items-center justify-center gap-1" data-testid={`inv-extended-${inv.id}`}><Check className="w-3.5 h-3.5" /> Süre uzatıldı (etkinlik + 15 gün)</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!report} onOpenChange={(o) => !o && setReport(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="report-dialog">
          {report && (<>
            <DialogHeader><DialogTitle>{report.invitation.person2 ? `${report.invitation.person1} & ${report.invitation.person2}` : report.invitation.person1} — Rapor</DialogTitle>
            <DialogDescription>Katılım yanıtları, kişi sayısı ve misafir anıları.</DialogDescription></DialogHeader>
            <div className="grid grid-cols-4 gap-2 text-center my-2">
              {[["Geliyor", report.stats.attending], ["Gelemiyor", report.stats.declined], ["Toplam Kişi", report.stats.total_guests], ["Anı", report.stats.memories]].map(([l, v]) => (
                <div key={l} className="rounded-lg border border-slate-200 p-2"><div className="text-xl font-bold">{v}</div><div className="text-[10px] text-slate-500">{l}</div></div>
              ))}
            </div>
            <div className="mt-3">
              <div className="text-sm font-semibold mb-1">Katılım Yanıtları</div>
              {report.rsvps.length === 0 ? <div className="text-xs text-slate-400">Henüz yanıt yok.</div> : (
                <div className="space-y-1">
                  {report.rsvps.map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-sm border-b border-slate-100 py-1">
                      <span>{r.name} {r.surname} {r.attending ? `(${r.guest_count} kişi)` : ""}</span>
                      <Badge className={r.attending ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}>{r.attending ? "Geliyor" : "Gelemiyor"}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-4">
              <div className="text-sm font-semibold mb-1">Anılar & Dilekler</div>
              {report.memories.length === 0 ? <div className="text-xs text-slate-400">Henüz anı yok.</div> : (
                <div className="space-y-2">
                  {report.memories.map((m) => (
                    <div key={m.id} className="rounded-lg bg-slate-50 p-2 text-sm"><b>{m.name}:</b> {m.message}</div>
                  ))}
                </div>
              )}
            </div>
          </>)}
        </DialogContent>
      </Dialog>

      {/* Photo wall moderation */}
      <Dialog open={!!photoMod} onOpenChange={(o) => !o && setPhotoMod(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="photowall-dialog">
          {photoMod && (<>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Images className="w-5 h-5" /> Foto Duvarı — {photoMod.person2 ? `${photoMod.person1} & ${photoMod.person2}` : photoMod.person1}</DialogTitle>
              <DialogDescription>Uygunsuz fotoğrafları gizleyin veya silin. Gizlenenler davetiyede ve slaytta görünmez.</DialogDescription>
            </DialogHeader>
            <a href={`/davetiye/${photoMod.slug}/duvar`} target="_blank" rel="noreferrer">
              <Button className="w-full bg-slate-900 hover:bg-slate-800 mb-3" data-testid="photowall-slideshow-link">
                <Presentation className="w-4 h-4 mr-2" /> Tam Ekran Slayt Aç (projeksiyon için)
              </Button>
            </a>
            {modStorage && modStorage.limit > 0 && (
              <div className="mb-3" data-testid="photowall-storage">
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                  <span>Depolama</span>
                  <span>{(modStorage.used / 1073741824).toFixed(2)} / {modStorage.gb || Math.round(modStorage.limit / 1073741824)} GB</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, (modStorage.used / modStorage.limit) * 100)}%` }} />
                </div>
              </div>
            )}
            {modLoading ? (
              <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" /></div>
            ) : modPhotos.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">Henüz misafir fotoğrafı yok.</div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {modPhotos.map((p) => (
                  <div key={p.id} className={`relative rounded-lg overflow-hidden border ${p.hidden ? "border-rose-300 opacity-60" : "border-slate-200"}`} data-testid={`mod-photo-${p.id}`}>
                    {p.kind === "video"
                      ? <video src={`${API}/api/invitations/photo/${p.id}`} className="w-full aspect-square object-cover" muted playsInline controls />
                      : <img src={`${API}/api/invitations/photo/${p.id}`} alt={p.uploader_name || "Anı"} className="w-full aspect-square object-cover" loading="lazy" />}
                    {p.kind === "video" && <div className="absolute top-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded">Video</div>}
                    {p.hidden && <div className="absolute top-1 left-1 bg-rose-600 text-white text-[9px] px-1.5 py-0.5 rounded">Gizli</div>}
                    {p.uploader_name && <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] px-1 py-0.5 truncate">{p.uploader_name}</div>}
                    <div className="absolute top-1 right-1 flex gap-1">
                      <button onClick={() => toggleHide(p.id, !p.hidden)} title={p.hidden ? "Göster" : "Gizle"} className="w-6 h-6 rounded bg-white/90 grid place-items-center hover:bg-white" data-testid={`mod-hide-${p.id}`}>
                        {p.hidden ? <Eye className="w-3.5 h-3.5 text-emerald-600" /> : <EyeOff className="w-3.5 h-3.5 text-slate-700" />}
                      </button>
                      <button onClick={() => delPhoto(p.id)} title="Sil" className="w-6 h-6 rounded bg-white/90 grid place-items-center hover:bg-white" data-testid={`mod-del-${p.id}`}>
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>)}
        </DialogContent>
      </Dialog>

      {/* WhatsApp bulk invite */}
      <Dialog open={!!waInvite} onOpenChange={(o) => !o && setWaInvite(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="whatsapp-dialog">
          {waInvite && (() => {
            const link = `${window.location.origin}/davetiye/${waInvite.slug}`;
            const nums = [...new Set(waNumbers.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).map(normalizePhone).filter(Boolean))];
            const enc = encodeURIComponent(waMessage);
            const openAll = () => {
              if (nums.length === 0) { toast.error("Önce numara ekleyin"); return; }
              nums.forEach((n, i) => setTimeout(() => window.open(`https://wa.me/${n}?text=${enc}`, "_blank"), i * 700));
              toast.message("WhatsApp sekmeleri açılıyor", { description: "Tarayıcı engellerse açılır pencerelere izin verin." });
            };
            const copyLink = async () => { try { await navigator.clipboard.writeText(link); toast.success("Bağlantı kopyalandı"); } catch (e) { toast.error("Kopyalanamadı"); } };
            return (<>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-[#128C7E]"><MessageCircle className="w-5 h-5" /> WhatsApp ile Davet Gönder</DialogTitle>
                <DialogDescription>Davetiye bağlantısını hazır mesajla gönderin. Numaraları ekleyip tek tek ya da sırayla açın.</DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2 mb-3">
                <Input readOnly value={link} className="text-xs" data-testid="wa-link" />
                <Button variant="outline" size="sm" onClick={copyLink} data-testid="wa-copy"><Copy className="w-4 h-4" /></Button>
              </div>
              <Label className="text-xs">Mesaj</Label>
              <Textarea rows={3} value={waMessage} onChange={(e) => setWaMessage(e.target.value)} className="mb-3" data-testid="wa-message" />
              <Label className="text-xs">Telefon Numaraları (her satıra bir numara veya virgülle ayırın)</Label>
              <Textarea rows={4} value={waNumbers} onChange={(e) => setWaNumbers(e.target.value)} placeholder={"0555 111 22 33\n0532 444 55 66"} className="mb-2 font-mono text-sm" data-testid="wa-numbers" />
              <div className="text-xs text-slate-500 mb-3">{nums.length} geçerli numara</div>
              <div className="flex flex-wrap gap-2 mb-4">
                <Button onClick={openAll} className="bg-[#25D366] hover:bg-[#1fb457] text-white" data-testid="wa-send-all"><Send className="w-4 h-4 mr-2" /> Tümünü Sırayla Aç ({nums.length})</Button>
                <a href={`https://wa.me/?text=${enc}`} target="_blank" rel="noreferrer"><Button variant="outline" data-testid="wa-share-general"><MessageCircle className="w-4 h-4 mr-2" /> Rehberden Seç</Button></a>
              </div>
              {nums.length > 0 && (
                <div className="border-t pt-3 space-y-1.5 max-h-52 overflow-y-auto" data-testid="wa-list">
                  {nums.map((n, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="font-mono text-slate-700">+{n}</span>
                      <a href={`https://wa.me/${n}?text=${enc}`} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="ghost" className="text-[#128C7E] h-8" data-testid={`wa-send-${i}`}><Send className="w-3.5 h-3.5 mr-1" /> Gönder</Button>
                      </a>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-slate-400 mt-3">Not: Her kişiye hazır mesaj tek dokunuşla açılır; "Gönder"e WhatsApp içinde siz basarsınız.</p>
            </>);
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
