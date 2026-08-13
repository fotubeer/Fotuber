import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast, Toaster } from "sonner";
import { Loader2, Plus, ExternalLink, BarChart3, Download, Trash2, Users, MessageCircleHeart, Calendar, Images, Eye, EyeOff, Presentation, QrCode, MessageCircle, Copy, Send, Clock, Check, LogOut, Mail, Lock, ArrowRight, Sparkles, Heart, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { EVENT_TYPE_LABELS } from "@/lib/invitationThemes";
import GuestManager from "@/components/invitation/GuestManager";

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
  const [modMeta, setModMeta] = useState(null); // { tier, tierLabel, tableQr, spamCount }
  const [modTab, setModTab] = useState("photos"); // photos | spam
  const [modLoading, setModLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [waInvite, setWaInvite] = useState(null);
  const [guestInv, setGuestInv] = useState(null);
  const [venueSvcInv, setVenueSvcInv] = useState(null);
  const [waMessage, setWaMessage] = useState("");
  const [waNumbers, setWaNumbers] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [mode, setMode] = useState("login"); // login | forgot
  const [forgotSent, setForgotSent] = useState(false);

  const sendForgot = async () => {
    if (!auth.email) { toast.error("Lütfen e-posta adresinizi girin"); return; }
    setBusy(true);
    try {
      await api("/member/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: auth.email }) });
      setForgotSent(true);
    } catch (e) { toast.error("İşlem başarısız, tekrar deneyin"); }
    finally { setBusy(false); }
  };

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

  const logout = async () => {
    try { await api("/auth/logout", { method: "POST" }); } catch (_) {}
    setMe(null); setItems([]); setAuth({ email: "", password: "" });
    toast.success("Çıkış yapıldı");
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
    setPhotoMod(inv); setModLoading(true); setModPhotos([]); setModStorage(null); setModMeta(null); setModTab("photos");
    try {
      const r = await api(`/invitations/${inv.id}/photos/manage`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Yüklenemedi");
      setModPhotos(d.photos || []);
      setModStorage({ used: d.storage_used || 0, limit: d.storage_limit || 0, gb: d.storage_limit_gb });
      setModMeta({ tier: d.tier, tierLabel: d.tier_label, tableQr: !!d.table_qr, spamCount: d.spam_count || 0 });
    } catch (e) { toast.error(e.message); }
    finally { setModLoading(false); }
  };

  const downloadTableQr = async (inv) => {
    toast.message("Masa QR Kartları hazırlanıyor…");
    try {
      const r = await api(`/invitations/${inv.id}/table-qr.pdf`);
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || "İndirilemedi"); }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `masa-qr-${inv.slug}.pdf`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Masa QR Kartları indirildi (A4, 6 kart)");
    } catch (e) { toast.error(e.message); }
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

  const toggleSpam = async (pid, spam) => {
    try {
      const r = await api(`/invitations/${photoMod.id}/photos/${pid}/spam`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spam }),
      });
      if (!r.ok) throw new Error();
      setModPhotos((x) => x.map((p) => (p.id === pid ? { ...p, spam } : p)));
      setModMeta((m) => m ? { ...m, spamCount: Math.max(0, (m.spamCount || 0) + (spam ? 1 : -1)) } : m);
      toast.success(spam ? "Spam kutusuna taşındı" : "Spam kutusundan çıkarıldı");
    } catch (e) { toast.error("İşlem başarısız"); }
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
    <div className="min-h-screen flex bg-[#0b0b12] text-white">
      <Toaster position="top-center" richColors />

      {/* Left — branded visual */}
      <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('https://static.prod-images.emergentagent.com/jobs/fc76a8ea-b91a-4ba1-bc47-0822af835ee4/images/bd6419db0e99de2e831e2a38bd305898d23335a98e04fd9dd756e8b96ba6f1fa.jpeg')" }} />
        <div className="absolute inset-0 bg-gradient-to-tr from-[#0b0b12] via-[#0b0b12]/80 to-transparent" />
        <div className="absolute inset-0" style={{ background: "radial-gradient(90% 70% at 20% 100%, rgba(99,102,241,0.35), transparent 60%)" }} />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-2">
            <span className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur grid place-items-center border border-white/15"><Heart className="w-5 h-5 text-rose-300" fill="currentColor" /></span>
            <span className="text-xl font-serif tracking-wide">fotuber</span>
          </div>
          <div>
            <h2 className="font-serif text-4xl xl:text-5xl leading-tight mb-4">Davetiyenizi<br /><em className="text-indigo-300">canlı</em> yönetin</h2>
            <p className="text-white/70 max-w-md mb-8">Her cihazdan giriş yapın; yanıtları anlık görün, misafirlerinizi yönetin ve anıları tek panelden toplayın.</p>
            <div className="space-y-3">
              {[
                { I: BarChart3, t: "LCV'yi canlı takip edin", d: "Gelen–gelmeyen–belki, anlık sayılar" },
                { I: Users, t: "Misafir yönetimi", d: "Gelin/damat tarafı, roller, WhatsApp davet" },
                { I: Images, t: "Anı & Foto Duvarı", d: "Misafir fotoğraflarını tek yerde toplayın" },
              ].map((f, i) => {
                const Ic = f.I;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-lg bg-white/10 border border-white/10 grid place-items-center shrink-0"><Ic className="w-4 h-4 text-indigo-200" /></span>
                    <div><div className="text-sm font-medium">{f.t}</div><div className="text-xs text-white/50">{f.d}</div></div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="text-xs text-white/40">© {new Date().getFullYear()} Fotuber Görsel Sanat</div>
        </div>
      </div>

      {/* Right — auth card */}
      <div className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 justify-center mb-6">
            <span className="w-9 h-9 rounded-xl bg-white/10 grid place-items-center border border-white/15"><Heart className="w-4 h-4 text-rose-300" fill="currentColor" /></span>
            <span className="text-lg font-serif">fotuber</span>
          </div>
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.25em] text-indigo-300 mb-2"><Sparkles className="w-3.5 h-3.5" /> Davetiye Paneli</div>

          {mode === "forgot" ? (
            forgotSent ? (
              <div data-testid="forgot-sent">
                <h1 className="text-2xl font-bold mb-2">E-postanızı kontrol edin</h1>
                <p className="text-sm text-white/60 mb-6">Eğer <b className="text-white/80">{auth.email}</b> ile kayıtlı bir hesap varsa, şifre sıfırlama bağlantısını gönderdik. Bağlantı 1 saat geçerlidir.</p>
                <Button onClick={() => { setMode("login"); setForgotSent(false); }} data-testid="back-to-login-btn"
                  className="w-full h-11 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 font-semibold">
                  Girişe Dön
                </Button>
              </div>
            ) : (
              <div data-testid="forgot-form">
                <h1 className="text-2xl font-bold mb-1">Şifremi unuttum</h1>
                <p className="text-sm text-white/50 mb-6">Kayıtlı e-posta adresinize sıfırlama bağlantısı gönderelim.</p>
                <label className="text-xs text-white/50 mb-1 block">E-posta</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input type="email" placeholder="ornek@eposta.com" value={auth.email}
                    onChange={(e) => setAuth({ ...auth, email: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && sendForgot()}
                    data-testid="forgot-email"
                    className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 h-11" />
                </div>
                <Button onClick={sendForgot} disabled={busy} data-testid="forgot-submit"
                  className="w-full mt-5 h-11 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 font-semibold gap-2">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Sıfırlama Bağlantısı Gönder
                </Button>
                <button onClick={() => setMode("login")} data-testid="forgot-back"
                  className="w-full mt-4 text-sm text-white/50 hover:text-white/80">← Girişe dön</button>
              </div>
            )
          ) : (
          <>
          <h1 className="text-2xl font-bold mb-1">Panelinize giriş yapın</h1>
          <p className="text-sm text-white/50 mb-6">Davetiyenizi oluştururken kullandığınız <b className="text-white/70">e-posta ve şifre</b> ile.</p>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-white/50 mb-1 block">E-posta</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input type="email" placeholder="ornek@eposta.com" value={auth.email}
                  onChange={(e) => setAuth({ ...auth, email: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && login()}
                  data-testid="myinv-email"
                  className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 h-11" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-white/50">Şifre</label>
                <button type="button" onClick={() => { setMode("forgot"); setForgotSent(false); }} data-testid="forgot-link"
                  className="text-xs text-indigo-300 hover:text-indigo-200">Şifremi unuttum?</button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input type={showPw ? "text" : "password"} placeholder="••••••••" value={auth.password}
                  onChange={(e) => setAuth({ ...auth, password: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && login()}
                  data-testid="myinv-password"
                  className="pl-9 pr-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 h-11" />
                <button type="button" onClick={() => setShowPw((v) => !v)} data-testid="myinv-toggle-pw"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <Button onClick={login} disabled={busy} data-testid="myinv-login"
            className="w-full mt-5 h-11 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 font-semibold gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Giriş Yap <ArrowRight className="w-4 h-4" />
          </Button>

          <div className="flex items-center gap-3 my-6">
            <div className="h-px bg-white/10 flex-1" /><span className="text-xs text-white/30">veya</span><div className="h-px bg-white/10 flex-1" />
          </div>

          <Link to="/davetiye-olustur" data-testid="myinv-create-link">
            <Button variant="outline" className="w-full h-11 border-white/15 bg-transparent text-white hover:bg-white/5 gap-2">
              <Plus className="w-4 h-4" /> Yeni Davetiye Oluştur
            </Button>
          </Link>
          <p className="text-center text-xs text-white/40 mt-4">Henüz hesabınız yoksa, davetiye oluştururken hesabınız otomatik açılır.</p>
          </>
          )}
          <Link to="/" className="block text-center text-xs text-white/40 hover:text-white/70 mt-4">← Ana sayfaya dön</Link>
        </div>
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
            <p className="text-sm text-slate-500">Yanıtları (LCV) ve anıları buradan takip edin.{me?.user?.email ? ` · ${me.user.email}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/davetiye-olustur"><Button className="bg-indigo-600 hover:bg-indigo-700" data-testid="new-invitation-btn"><Plus className="w-4 h-4 mr-1" /> Yeni</Button></Link>
            <Button variant="outline" onClick={logout} data-testid="member-logout-btn" className="border-slate-300 text-slate-700 hover:bg-slate-100">
              <LogOut className="w-4 h-4 mr-1" /> Çıkış Yap
            </Button>
          </div>
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
                <Button variant="outline" size="sm" className="w-full mt-2 text-fuchsia-700 border-fuchsia-200 hover:bg-fuchsia-50" onClick={() => setGuestInv(inv)} data-testid={`inv-guests-${inv.id}`}>
                  <Users className="w-4 h-4 mr-1" /> Misafir Yönetimi (Gelin / Damat)
                </Button>
                <Button variant="outline" size="sm" className="w-full mt-2 text-amber-700 border-amber-200 hover:bg-amber-50" onClick={() => setVenueSvcInv(inv)} data-testid={`inv-venue-services-${inv.id}`}>
                  <Sparkles className="w-4 h-4 mr-1" /> Salon Ek Hizmetleri
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
            {report.stats.menu && (
              <div className="rounded-lg border border-slate-200 p-3 my-2" data-testid="report-menu-summary">
                <div className="text-xs font-semibold text-slate-600 mb-1.5">İkram / Menü Dağılımı</div>
                <div className="flex flex-wrap gap-3 text-sm">
                  <span>🍽️ Standart: <b>{report.stats.menu.standard || 0}</b></span>
                  <span>🥗 Vejetaryen: <b>{report.stats.menu.vegetarian || 0}</b></span>
                  <span>🧒 Çocuk: <b>{report.stats.menu.child || 0}</b></span>
                  <span>🚐 Transfer isteyen: <b>{report.stats.transfer || 0}</b></span>
                </div>
              </div>
            )}
            <div className="mt-3">
              <div className="text-sm font-semibold mb-1">Katılım Yanıtları</div>
              {report.rsvps.length === 0 ? <div className="text-xs text-slate-400">Henüz yanıt yok.</div> : (
                <div className="space-y-1">
                  {report.rsvps.map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-sm border-b border-slate-100 py-1">
                      <span>
                        {r.name} {r.surname} {r.attending ? `(${r.guest_count} kişi)` : ""}
                        {r.attending && r.menu && r.menu !== "standard" && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{r.menu === "vegetarian" ? "Vejetaryen" : "Çocuk"}</span>}
                        {r.needs_transfer && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-700">Transfer</span>}
                        {r.companions && r.companions.length > 0 && <span className="ml-1 text-[11px] text-slate-400">+ {r.companions.map((c) => c.name).join(", ")}</span>}
                      </span>
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
              <DialogTitle className="flex items-center gap-2"><Images className="w-5 h-5" /> Anı Duvarı — {photoMod.person2 ? `${photoMod.person1} & ${photoMod.person2}` : photoMod.person1}
                {modMeta?.tierLabel && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${modMeta.tier === "gold" ? "bg-amber-400 text-amber-950" : "bg-slate-300 text-slate-700"}`}>{modMeta.tierLabel}</span>}
              </DialogTitle>
              <DialogDescription>İstenmeyen fotoğrafları gizleyin, Spam kutusuna taşıyın veya silin. Gizli/spam fotoğraflar davetiyede ve slaytta görünmez.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap gap-2 mb-3">
              <a href={`/davetiye/${photoMod.slug}/duvar`} target="_blank" rel="noreferrer" className="flex-1 min-w-[180px]">
                <Button className="w-full bg-slate-900 hover:bg-slate-800" data-testid="photowall-slideshow-link">
                  <Presentation className="w-4 h-4 mr-2" /> Tam Ekran Slayt Aç
                </Button>
              </a>
              {modMeta?.tableQr && (
                <Button onClick={() => downloadTableQr(photoMod)} className="flex-1 min-w-[180px] bg-amber-500 hover:bg-amber-600 text-amber-950" data-testid="photowall-table-qr">
                  <QrCode className="w-4 h-4 mr-2" /> Masa QR Kartları (PDF)
                </Button>
              )}
            </div>
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
            {/* Tab switch: Fotoğraflar / Spam Kutusu */}
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 mb-3 text-sm" data-testid="photowall-tabs">
              <button onClick={() => setModTab("photos")} data-testid="photowall-tab-photos"
                className={`flex-1 py-1.5 rounded-md transition-colors ${modTab === "photos" ? "bg-white shadow font-semibold text-slate-900" : "text-slate-500"}`}>
                Fotoğraflar ({modPhotos.filter((p) => !p.spam).length})
              </button>
              <button onClick={() => setModTab("spam")} data-testid="photowall-tab-spam"
                className={`flex-1 py-1.5 rounded-md transition-colors ${modTab === "spam" ? "bg-white shadow font-semibold text-rose-600" : "text-slate-500"}`}>
                Spam Kutusu ({modMeta?.spamCount ?? modPhotos.filter((p) => p.spam).length})
              </button>
            </div>
            {modLoading ? (
              <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" /></div>
            ) : (() => {
              const shown = modPhotos.filter((p) => modTab === "spam" ? p.spam : !p.spam);
              if (shown.length === 0) {
                return <div className="py-10 text-center text-slate-400 text-sm">{modTab === "spam" ? "Spam kutusu boş." : "Henüz misafir fotoğrafı yok."}</div>;
              }
              return (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {shown.map((p) => (
                  <div key={p.id} className={`relative rounded-lg overflow-hidden border ${p.spam ? "border-rose-400 opacity-70" : p.hidden ? "border-amber-300 opacity-70" : "border-slate-200"}`} data-testid={`mod-photo-${p.id}`}>
                    {p.kind === "video"
                      ? <video src={`${API}/api/invitations/photo/${p.id}`} className="w-full aspect-square object-cover" muted playsInline controls />
                      : <img src={`${API}/api/invitations/photo/${p.id}`} alt={p.uploader_name || "Anı"} className="w-full aspect-square object-cover" loading="lazy" />}
                    {p.kind === "video" && <div className="absolute top-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded">Video</div>}
                    {p.spam && <div className="absolute top-1 left-1 bg-rose-600 text-white text-[9px] px-1.5 py-0.5 rounded">Spam</div>}
                    {!p.spam && p.hidden && <div className="absolute top-1 left-1 bg-amber-500 text-white text-[9px] px-1.5 py-0.5 rounded">Gizli</div>}
                    {p.uploader_name && <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] px-1 py-0.5 truncate">{p.uploader_name}</div>}
                    <div className="absolute top-1 right-1 flex gap-1">
                      {modTab === "spam" ? (
                        <button onClick={() => toggleSpam(p.id, false)} title="Geri al" className="w-6 h-6 rounded bg-white/90 grid place-items-center hover:bg-white" data-testid={`mod-restore-${p.id}`}>
                          <ArrowRight className="w-3.5 h-3.5 text-emerald-600 rotate-180" />
                        </button>
                      ) : (
                        <>
                          <button onClick={() => toggleHide(p.id, !p.hidden)} title={p.hidden ? "Göster" : "Gizle"} className="w-6 h-6 rounded bg-white/90 grid place-items-center hover:bg-white" data-testid={`mod-hide-${p.id}`}>
                            {p.hidden ? <Eye className="w-3.5 h-3.5 text-emerald-600" /> : <EyeOff className="w-3.5 h-3.5 text-slate-700" />}
                          </button>
                          <button onClick={() => toggleSpam(p.id, true)} title="Spam'e taşı" className="w-6 h-6 rounded bg-white/90 grid place-items-center hover:bg-white" data-testid={`mod-spam-${p.id}`}>
                            <Ban className="w-3.5 h-3.5 text-rose-600" />
                          </button>
                        </>
                      )}
                      <button onClick={() => delPhoto(p.id)} title="Sil" className="w-6 h-6 rounded bg-white/90 grid place-items-center hover:bg-white" data-testid={`mod-del-${p.id}`}>
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              );
            })()}
          </>)}
        </DialogContent>
      </Dialog>

      {/* Guest management (Bride/Groom side, contacts import, WhatsApp, RSVP tracking) */}
      <Dialog open={!!guestInv} onOpenChange={(o) => { if (!o) { setGuestInv(null); load(); } }}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto" data-testid="guest-dialog">
          {guestInv && (<>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> Misafir Yönetimi — {guestInv.person2 ? `${guestInv.person1} & ${guestInv.person2}` : guestInv.person1}</DialogTitle>
              <DialogDescription>Rehberden ekleyin, Gelin/Damat tarafına ayırın, tek tıkla WhatsApp'tan davet gönderin. Katılım (LCV) otomatik takip edilir.</DialogDescription>
            </DialogHeader>
            <GuestManager inv={guestInv} />
          </>)}
        </DialogContent>
      </Dialog>

      <VenueServicesModal inv={venueSvcInv} onClose={() => setVenueSvcInv(null)} />

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

// Couple-facing venue add-on marketplace (public endpoints, no extra auth).
function VenueServicesModal({ inv, onClose }) {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState([]);
  const [saving, setSaving] = useState(false);
  const API = process.env.REACT_APP_BACKEND_URL;
  useEffect(() => {
    if (!inv) { setData(null); return; }
    setData(null);
    fetch(`${API}/api/venue/public/invitation/${inv.id}/services`)
      .then((r) => r.json())
      .then((d) => { setData(d); setSel(d.selected || []); })
      .catch(() => setData({ venue: null, services: [], selected: [] }));
  }, [inv, API]);
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/api/venue/public/invitation/${inv.id}/services`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ service_ids: sel }) });
      toast.success("Seçimleriniz salona iletildi");
      onClose();
    } catch { toast.error("Kaydedilemedi"); } finally { setSaving(false); }
  };
  const services = data?.services || [];
  const total = services.filter((s) => sel.includes(s.id)).reduce((a, s) => a + (s.price || 0), 0);
  return (
    <Dialog open={!!inv} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="venue-services-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-amber-500" /> Salon Ek Hizmetleri</DialogTitle>
          <DialogDescription>
            {data?.venue?.salon_adi ? `${data.venue.salon_adi} tarafından sunulan ek hizmetler. Seçip onaylayın; salon paneline düşer.` : "Bu davetiye bir salona bağlı değil veya salon henüz hizmet tanımlamamış."}
          </DialogDescription>
        </DialogHeader>
        {data === null && <p className="text-sm text-slate-400 py-6 text-center">Yükleniyor…</p>}
        {data && services.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">Şu an sunulan ek hizmet yok.</p>}
        <div className="space-y-2">
          {services.map((s) => {
            const on = sel.includes(s.id);
            return (
              <button key={s.id} onClick={() => toggle(s.id)} data-testid={`svc-opt-${s.id}`}
                className={`w-full text-left rounded-xl border p-3 flex items-center gap-3 transition ${on ? "border-amber-400 bg-amber-50 ring-2 ring-amber-200" : "border-slate-200 hover:bg-slate-50"}`}>
                <span className={`w-5 h-5 rounded-md grid place-items-center border ${on ? "bg-amber-500 border-amber-500 text-white" : "border-slate-300"}`}>{on && <Check className="w-3.5 h-3.5" />}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium text-slate-800">{s.name}</span>
                  {s.description && <span className="block text-xs text-slate-500">{s.description}</span>}
                </span>
                <span className="font-semibold text-amber-700 whitespace-nowrap">{(s.price || 0).toLocaleString("tr-TR")} ₺</span>
              </button>
            );
          })}
        </div>
        {services.length > 0 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t">
            <span className="text-sm text-slate-600">Seçilen toplam: <b className="text-amber-700">{total.toLocaleString("tr-TR")} ₺</b></span>
            <Button onClick={save} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-black" data-testid="venue-services-save">{saving ? "…" : "Onayla & Salona İlet"}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
