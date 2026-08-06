import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast, Toaster } from "sonner";
import { Loader2, Sparkles, Check, Copy, ExternalLink, Upload, ArrowRight, Music, Eye, Lock, QrCode, Images, Download, CreditCard } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import InvitationPreview from "@/components/invitation/InvitationPreview";
import InvitationReveal from "@/components/invitation/InvitationReveal";
import VoiceRecorder from "@/components/invitation/VoiceRecorder";
import { INVITATION_THEMES, EVENT_TYPE_LABELS, getTheme, printColors } from "@/lib/invitationThemes";
import { getMessagesFor } from "@/lib/invitationMessages";

const API = process.env.REACT_APP_BACKEND_URL;
const api = (path, opts = {}) => fetch(`${API}/api${path}`, { credentials: "include", ...opts });

export default function InvitationCreate() {
  const navigate = useNavigate();
  const [data, setData] = useState({
    event_type: "dugun", person1: "", person2: "", event_date: "", event_time: "",
    venue_name: "", venue_address: "", map_url: "", message: "", theme: "romantic",
    primary_color: "", cover_image_id: "", music_url: "",
    gift: { full_name: "", bank_name: "", iban: "", note: "" },
    sections: { countdown: true, map: true, memories: true, rsvp: true, gift: true, music: false },
  });
  const [gate, setGate] = useState(false); // membership gate at the end
  const [authTab, setAuthTab] = useState("register");
  const [authForm, setAuthForm] = useState({ email: "", password: "", full_name: "", phone: "", company_name: "", kvkk_accepted: false, sms_consent: false, email_consent: false });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [published, setPublished] = useState(null); // { slug, url }
  const [payGate, setPayGate] = useState(null); // { invitation_id, price, pricing, slug, url }
  const [paying, setPaying] = useState(false);
  const [previewReveal, setPreviewReveal] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [tplOpen, setTplOpen] = useState(false);
  const [previewTpl, setPreviewTpl] = useState(null); // theme key being inspected fullscreen
  const [mobilePrev, setMobilePrev] = useState(false);

  const set = (k, v) => setData((d) => ({ ...d, [k]: v }));
  const setGift = (k, v) => setData((d) => ({ ...d, gift: { ...d.gift, [k]: v } }));
  const setSection = (k, v) => setData((d) => ({ ...d, sections: { ...d.sections, [k]: v } }));

  const uploadAudio = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await api("/invitations/audio", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Yüklenemedi");
      set("greeting_audio_id", d.id);
      setSection("music", true);
      toast.success("Karşılama sesi eklendi");
    } catch (e) { toast.error(e.message); }
    finally { setUploading(false); }
  };

  const canPublish = data.person1.trim() && data.event_date;
  const isPremiumTheme = INVITATION_THEMES[data.theme]?.premium;
  const hasPhotowall = !!data.sections.photowall;
  const invPrice = hasPhotowall ? 750 : (isPremiumTheme ? 200 : 0);
  const shareUrl = useMemo(() => (published ? `${window.location.origin}/davetiye/${published.slug}` : ""), [published]);

  const uploadCover = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await api("/invitations/cover", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Yüklenemedi");
      set("cover_image_id", d.id);
      toast.success("Kapak fotoğrafı eklendi");
    } catch (e) { toast.error(e.message); }
    finally { setUploading(false); }
  };

  const startPublish = async () => {
    if (!canPublish) { toast.error("İsim ve tarih zorunludur"); return; }
    // Check if already a logged-in member; if so publish directly, else open gate.
    const me = await api("/member/me");
    if (me.ok) { const d = await me.json(); if (d.user?.role === "member") { return doPublish(); } }
    setGate(true);
  };

  const doAuthThenPublish = async () => {
    const isReg = authTab === "register";
    if (!authForm.email || !authForm.password) { toast.error("E-posta ve şifre gerekli"); return; }
    if (isReg && (!authForm.full_name || !authForm.phone)) { toast.error("Ad Soyad ve telefon gerekli"); return; }
    if (isReg && !(authForm.kvkk_accepted && authForm.sms_consent && authForm.email_consent)) { toast.error("Lütfen tüm izinleri onaylayın"); return; }
    setBusy(true);
    try {
      const body = isReg ? authForm : { email: authForm.email, password: authForm.password };
      const r = await api(isReg ? "/member/register" : "/member/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "İşlem başarısız");
      await doPublish();
    } catch (e) { toast.error(e.message); setBusy(false); }
  };

  const doPublish = async () => {
    setBusy(true);
    try {
      const r = await api("/invitations", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Yayınlanamadı");
      setGate(false);
      if (d.requires_payment) {
        setPayGate({ invitation_id: d.id, price: d.price, pricing: d.pricing, slug: d.slug, url: d.url });
      } else {
        setPublished({ slug: d.slug, url: d.url });
        toast.success("Davetiyeniz yayında! 🎉");
      }
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const startInvitationPayment = async () => {
    if (!payGate) return;
    setPaying(true);
    try {
      const r = await api("/payments/paytr/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "invitation", invitation_id: payGate.invitation_id, origin_url: window.location.origin }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Ödeme başlatılamadı");
      window.open(d.link, "_blank");
      const iv = setInterval(async () => {
        try {
          const sr = await api(`/payments/status/${d.callback_id}`);
          const sd = await sr.json().catch(() => ({}));
          if (sd.status === "paid") {
            clearInterval(iv); setPaying(false);
            setPublished({ slug: payGate.slug, url: payGate.url });
            setPayGate(null);
            toast.success("Ödeme alındı, davetiyeniz yayında! 🎉");
          }
        } catch (e) { /* keep polling */ }
      }, 3000);
      setTimeout(() => clearInterval(iv), 300000);
    } catch (e) { toast.error(e.message); setPaying(false); }
  };

  const downloadPrintPdf = async () => {
    if (!data.person1.trim()) { toast.error("En az bir isim girin"); return; }
    const colors = printColors(data.theme);
    const qr_url = published?.slug ? `${window.location.origin}/davetiye/${published.slug}` : "";
    const body = {
      person1: data.person1, person2: data.person2, event_type: data.event_type,
      event_date: data.event_date, event_time: data.event_time, venue_name: data.venue_name,
      venue_address: data.venue_address, message: data.message, size: "a5", symbol: "heart", qr_url, ...colors,
    };
    try {
      const r = await fetch(`${API}/api/invitations/print-pdf`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || "PDF oluşturulamadı"); }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `davetiye-${(data.person1 || "baski").toLowerCase()}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast.success("Baskıya hazır PDF indirildi");
    } catch (e) { toast.error(e.message); }
  };

  const copyLink = () => { navigator.clipboard.writeText(shareUrl); toast.success("Bağlantı kopyalandı"); };

  if (published) {
    return (
      <div className="min-h-screen bg-slate-950 text-white grid place-items-center px-6">
        <Toaster position="top-center" richColors />
        <div className="max-w-md w-full text-center bg-slate-900 border border-slate-800 rounded-2xl p-8" data-testid="publish-success">
          <div className="w-14 h-14 rounded-full bg-emerald-500/15 grid place-items-center mx-auto mb-4">
            <Check className="w-7 h-7 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Davetiyeniz Hazır!</h1>
          <p className="text-sm text-slate-400 mb-5">Bu bağlantıyı sevdiklerinizle paylaşın. Misafirleriniz doğrudan davetiyeyi görecek.</p>
          <div className="bg-white p-3 rounded-xl inline-block mb-4"><QRCodeCanvas value={shareUrl} size={160} data-testid="publish-qr" /></div>
          <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2 mb-4">
            <span className="text-xs text-slate-300 truncate flex-1 text-left" data-testid="publish-link">{shareUrl}</span>
            <button onClick={copyLink} className="text-indigo-400" data-testid="copy-link-btn"><Copy className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <a href={`https://wa.me/?text=${encodeURIComponent("Davetiyemize bekleriz: " + shareUrl)}`} target="_blank" rel="noreferrer">
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700" data-testid="share-whatsapp">WhatsApp</Button>
            </a>
            <a href={published.url} target="_blank" rel="noreferrer">
              <Button variant="outline" className="w-full border-slate-600 text-white" data-testid="open-invitation"><ExternalLink className="w-4 h-4 mr-1" /> Görüntüle</Button>
            </a>
          </div>
          <button onClick={() => navigate("/davetiyelerim")} className="mt-5 text-sm text-indigo-400" data-testid="go-my-invitations">Davetiyelerim →</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Toaster position="top-center" richColors />
      <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-0">
        {/* Form */}
        <div className="p-6 sm:p-10 bg-white min-h-screen overflow-y-auto text-slate-900">
          <div className="mb-6">
            <div className="text-xs uppercase tracking-widest text-indigo-600 font-semibold">Fotuber · Dijital Davetiye</div>
            <h1 className="text-3xl font-bold text-slate-900 mt-1">Davetiyeni Oluştur</h1>
            <p className="text-sm text-slate-500 mt-1">Alanları doldur, sağdan canlı önizle. Yayınlamak için son adımda üyelik gerekir.</p>
          </div>

          <div className="space-y-5">
            <div>
              <Label>Etkinlik Türü</Label>
              <Select value={data.event_type} onValueChange={(v) => set("event_type", v)}>
                <SelectTrigger data-testid="event-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>1. İsim *</Label><Input value={data.person1} onChange={(e) => set("person1", e.target.value)} placeholder="Ahmet" data-testid="person1" /></div>
              <div><Label>2. İsim</Label><Input value={data.person2} onChange={(e) => set("person2", e.target.value)} placeholder="Yasemin" data-testid="person2" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tarih *</Label><Input type="date" value={data.event_date} onChange={(e) => set("event_date", e.target.value)} data-testid="event-date" /></div>
              <div><Label>Saat</Label><Input type="time" value={data.event_time} onChange={(e) => set("event_time", e.target.value)} data-testid="event-time" /></div>
            </div>
            <div><Label>Mekân Adı</Label><Input value={data.venue_name} onChange={(e) => set("venue_name", e.target.value)} placeholder="Deniz Restoran" data-testid="venue-name" /></div>
            <div><Label>Adres</Label><Input value={data.venue_address} onChange={(e) => set("venue_address", e.target.value)} placeholder="İzmir" data-testid="venue-address" /></div>
            <div><Label>Harita Bağlantısı (Google Maps)</Label><Input value={data.map_url} onChange={(e) => set("map_url", e.target.value)} placeholder="https://maps.google.com/..." data-testid="map-url" /></div>
            <div>
              <Label>Davet Mesajı</Label>
              <Textarea value={data.message} onChange={(e) => set("message", e.target.value)} rows={3} placeholder="Kendiniz yazın ya da aşağıdan hazır bir metin seçin." data-testid="message" />
              <div className="mt-2">
                <div className="text-xs text-slate-500 mb-1">Hazır metinler ({EVENT_TYPE_LABELS[data.event_type]}):</div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {getMessagesFor(data.event_type).map((m, i) => (
                    <button key={i} type="button" onClick={() => set("message", m)}
                      className={`text-left text-[11px] leading-snug px-2 py-1 rounded border transition ${data.message === m ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                      data-testid={`preset-msg-${i}`}>{m.length > 60 ? m.slice(0, 60) + "…" : m}</button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <Label>Kapak Fotoğrafı (isteğe bağlı)</Label>
              <label className="mt-1 flex items-center gap-2 px-3 py-2 border border-dashed rounded-lg cursor-pointer text-sm text-slate-600 hover:bg-slate-50">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {data.cover_image_id ? "Fotoğraf eklendi — değiştir" : "Fotoğraf yükle"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadCover(e.target.files?.[0])} data-testid="cover-upload" />
              </label>
            </div>

            <div>
              <Label>Sesli / Müzikli Karşılama (isteğe bağlı)</Label>
              <p className="text-xs text-slate-500 mb-1">Davetiye açılınca çalacak sesinizi veya müziği yükleyin.</p>
              <label className="flex items-center gap-2 px-3 py-2 border border-dashed rounded-lg cursor-pointer text-sm text-slate-600 hover:bg-slate-50">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Music className="w-4 h-4" />}
                {data.greeting_audio_id ? "Ses eklendi — değiştir" : "Ses/müzik yükle (mp3)"}
                <input type="file" accept="audio/*" className="hidden" onChange={(e) => uploadAudio(e.target.files?.[0])} data-testid="audio-upload" />
              </label>
              <div className="text-center text-[11px] text-slate-400 my-2">— veya kendi sesinle kaydet —</div>
              <VoiceRecorder onUpload={uploadAudio} uploading={uploading} />
              {data.greeting_audio_id && <div className="mt-2 text-xs text-emerald-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Karşılama sesi eklendi</div>}
            </div>

            <div>
              <Label>Şablon</Label>
              <button type="button" onClick={() => setTplOpen(true)} data-testid="open-template-gallery"
                className="mt-1 w-full flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 hover:border-indigo-400 transition"
                style={{ background: getTheme(data.theme).bg }}>
                <span className="font-medium" style={{ color: getTheme(data.theme).text }}>
                  {INVITATION_THEMES[data.theme]?.name}
                  {INVITATION_THEMES[data.theme]?.premium && <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-amber-950">PREMIUM</span>}
                </span>
                <span className="text-xs px-3 py-1.5 rounded-full bg-white/80 text-slate-700 flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> Şablonları Gör</span>
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="font-medium text-sm">Özellikler</div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-700"><Images className="w-4 h-4 text-indigo-600" /> Etkinlik Anı Duvarı <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-400 text-amber-950">PREMIUM</span></div>
                <Switch checked={data.sections.photowall} onCheckedChange={(v) => setSection("photowall", v)} data-testid="toggle-photowall" />
              </div>
              <p className="text-[11px] text-slate-500 -mt-1">QR kod ile misafirler etkinlik anında fotoğraf yükler, canlı akar.</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-700"><QrCode className="w-4 h-4 text-indigo-600" /> QR ile Kapıda Giriş</div>
                <Switch checked={data.checkin_enabled} onCheckedChange={(v) => set("checkin_enabled", v)} data-testid="toggle-checkin" />
              </div>
              <p className="text-[11px] text-slate-500 -mt-1">Katılımı onaylayan misafirlere QR verilir; kapıda hızlı giriş yapılır.</p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="font-medium text-sm mb-2">Hediye / Takı Bilgileri (isteğe bağlı)</div>
              <p className="text-xs text-slate-500 mb-3">Misafirler bu IBAN'a hediye gönderebilir.</p>
              <div className="space-y-2">
                <Input value={data.gift.full_name} onChange={(e) => setGift("full_name", e.target.value)} placeholder="Ad Soyad" data-testid="gift-name" />
                <Input value={data.gift.bank_name} onChange={(e) => setGift("bank_name", e.target.value)} placeholder="Banka Adı" data-testid="gift-bank" />
                <Input value={data.gift.iban} onChange={(e) => setGift("iban", e.target.value)} placeholder="IBAN" data-testid="gift-iban" />
              </div>
            </div>

            <button onClick={() => { setPreviewKey((k) => k + 1); setPreviewReveal(true); }} type="button" data-testid="preview-reveal-btn"
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-indigo-200 text-indigo-700 text-sm font-medium hover:bg-indigo-50">
              <Eye className="w-4 h-4" /> Açılış Animasyonunu Önizle
            </button>
            <p className="text-[11px] text-slate-400 text-center -mt-1">Etkinlik türüne göre açılış: düğün/nikah kapı, kına mum & kına eli, sünnet perde, doğum günü balon, nişan tül.</p>

            {invPrice > 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2" data-testid="premium-price-note">
                <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Premium davetiye: <b>{invPrice}₺</b> {hasPhotowall ? "(canlı foto duvarı dahil)" : "(premium şablon)"} — yayınlarken PayTR ile tek seferlik ödenir.</span>
              </div>
            )}

            <Button onClick={startPublish} disabled={!canPublish || busy} className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 text-base" data-testid="publish-btn">
              {busy ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Sparkles className="w-5 h-5 mr-2" />}
              {invPrice > 0 ? `Yayınla ve Öde · ${invPrice}₺` : "Davetiyeyi Yayınla"}
            </Button>

            <button onClick={downloadPrintPdf} type="button" data-testid="wizard-print-pdf"
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50">
              <Download className="w-4 h-4" /> Baskıya Hazır PDF İndir (ücretsiz)
            </button>
            <p className="text-[11px] text-slate-400 text-center -mt-1">Basılı davetiye için: yüksek kaliteli PDF, seçili şablon renkleriyle.</p>
          </div>
        </div>

        {/* Live preview (desktop) */}
        <div className="hidden lg:block sticky top-0 h-screen overflow-y-auto bg-slate-200">
          <InvitationPreview data={data} />
        </div>
      </div>

      {/* Mobile preview floating button */}
      <button onClick={() => setMobilePrev(true)} data-testid="mobile-preview-btn"
        className="lg:hidden fixed bottom-4 right-4 z-40 bg-indigo-600 text-white rounded-full shadow-lg px-5 py-3 text-sm font-semibold flex items-center gap-2">
        <Eye className="w-4 h-4" /> Önizle
      </button>

      {/* Mobile preview modal */}
      {mobilePrev && (
        <div className="lg:hidden fixed inset-0 z-50 bg-slate-900/60" data-testid="mobile-preview-modal">
          <div className="absolute inset-x-0 bottom-0 top-10 bg-white rounded-t-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b">
              <span className="font-medium text-slate-700">Önizleme</span>
              <button onClick={() => setMobilePrev(false)} className="text-slate-500" data-testid="mobile-preview-close">Kapat</button>
            </div>
            <div className="flex-1 overflow-y-auto"><InvitationPreview data={data} /></div>
          </div>
        </div>
      )}

      {/* Template gallery */}
      <Dialog open={tplOpen} onOpenChange={setTplOpen}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto" data-testid="template-gallery">
          <DialogTitle className="text-lg font-bold text-slate-900">Şablon Seç</DialogTitle>
          <p className="text-sm text-slate-500 -mt-1">Önce inceleyin, beğendiğiniz şablonla devam edin. Premium şablonlar ücretlidir.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
            {Object.entries(INVITATION_THEMES).map(([k, th]) => (
              <div key={k} className={`rounded-xl overflow-hidden border ${data.theme === k ? "ring-2 ring-indigo-500" : "border-slate-200"}`} data-testid={`tpl-card-${k}`}>
                <div className="h-24 flex items-center justify-center relative" style={{ background: th.bg }}>
                  <span style={{ color: th.text, fontFamily: th.heading }} className="text-sm">Aa</span>
                  {th.premium && <span className="absolute top-1 right-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-400 text-amber-950 flex items-center gap-0.5"><Lock className="w-2.5 h-2.5" />PREMIUM</span>}
                </div>
                <div className="p-2 bg-white">
                  <div className="text-xs font-medium text-slate-800 truncate">{th.name}</div>
                  <div className="flex gap-1 mt-1">
                    <button onClick={() => setPreviewTpl(k)} className="flex-1 text-[11px] py-1 rounded border border-slate-200 text-slate-600" data-testid={`tpl-inspect-${k}`}>İncele</button>
                    <button onClick={() => { set("theme", k); setTplOpen(false); }} className="flex-1 text-[11px] py-1 rounded bg-indigo-600 text-white" data-testid={`tpl-use-${k}`}>Kullan</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Full template inspect */}
      {previewTpl && (
        <div className="fixed inset-0 z-[60] bg-black/70" data-testid="tpl-inspect-modal">
          <div className="absolute inset-x-0 bottom-0 top-6 bg-white rounded-t-2xl overflow-hidden flex flex-col max-w-2xl mx-auto">
            <div className="flex items-center justify-between px-4 py-2 border-b">
              <span className="font-medium text-slate-700">{INVITATION_THEMES[previewTpl]?.name} {INVITATION_THEMES[previewTpl]?.premium && <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-400 text-amber-950">PREMIUM</span>}</span>
              <button onClick={() => setPreviewTpl(null)} className="text-slate-500" data-testid="tpl-inspect-close">Kapat</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <InvitationPreview data={{ ...data, theme: previewTpl,
                person1: data.person1 || "Ahmet", person2: data.person2 || "Yasemin",
                event_date: data.event_date || "2026-12-31", message: data.message || "Mutluluğumuza ortak olmanızdan onur duyarız." }} />
            </div>
            <div className="p-3 border-t">
              <Button onClick={() => { set("theme", previewTpl); setPreviewTpl(null); setTplOpen(false); }} className="w-full bg-indigo-600 hover:bg-indigo-700" data-testid="tpl-inspect-use">
                Bu Şablonla Devam Et
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Membership gate (last step) */}
      {gate && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4" data-testid="publish-gate">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-slate-900">
            <h3 className="text-xl font-bold text-slate-900">Son adım: Üyelik</h3>
            <p className="text-sm text-slate-500 mt-1 mb-4">Davetiyenizi kaydetmek ve yönetmek için ücretsiz üyelik gerekli.</p>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setAuthTab("register")} className={`flex-1 py-2 rounded-lg text-sm font-medium ${authTab === "register" ? "bg-indigo-600 text-white" : "bg-slate-100"}`} data-testid="gate-register-tab">Üye Ol</button>
              <button onClick={() => setAuthTab("login")} className={`flex-1 py-2 rounded-lg text-sm font-medium ${authTab === "login" ? "bg-indigo-600 text-white" : "bg-slate-100"}`} data-testid="gate-login-tab">Giriş Yap</button>
            </div>
            <div className="space-y-2">
              {authTab === "register" && (<>
                <Input placeholder="Ad Soyad" value={authForm.full_name} onChange={(e) => setAuthForm({ ...authForm, full_name: e.target.value })} data-testid="gate-fullname" />
                <Input placeholder="Telefon" value={authForm.phone} onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })} data-testid="gate-phone" />
                <Input placeholder="Firma (isteğe bağlı)" value={authForm.company_name} onChange={(e) => setAuthForm({ ...authForm, company_name: e.target.value })} data-testid="gate-company" />
              </>)}
              <Input type="email" placeholder="E-posta" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} data-testid="gate-email" />
              <Input type="password" placeholder="Şifre" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} data-testid="gate-password" />
            </div>
            {authTab === "register" && (
              <div className="mt-3 space-y-2">
                <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={authForm.kvkk_accepted} onChange={(e) => setAuthForm({ ...authForm, kvkk_accepted: e.target.checked })} data-testid="gate-kvkk" />
                  <span><b>KVKK Aydınlatma Metni</b>'ni okudum, kişisel verilerimin işlenmesini kabul ediyorum.</span>
                </label>
                <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={authForm.sms_consent} onChange={(e) => setAuthForm({ ...authForm, sms_consent: e.target.checked })} data-testid="gate-sms" />
                  <span>SMS ile kampanya ve duyuruların gönderilmesine izin veriyorum.</span>
                </label>
                <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={authForm.email_consent} onChange={(e) => setAuthForm({ ...authForm, email_consent: e.target.checked })} data-testid="gate-email-consent" />
                  <span>E-posta ile kampanya ve duyuruların gönderilmesine izin veriyorum.</span>
                </label>
              </div>
            )}
            <Button onClick={doAuthThenPublish} disabled={busy} className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700" data-testid="gate-submit">
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />} Üye Ol ve Yayınla
            </Button>
            <button onClick={() => setGate(false)} className="w-full mt-2 text-xs text-slate-500">Vazgeç</button>
          </div>
        </div>
      )}
      {/* Reveal animation preview */}
      {previewReveal && (
        <div className="fixed inset-0 z-[80]" data-testid="reveal-preview-modal">
          <InvitationReveal key={previewKey}
            t={getTheme(data.theme, data.primary_color)} themeKey={data.theme} eventType={data.event_type}
            names={data.person2 ? `${data.person1 || "İsim"} & ${data.person2}` : (data.person1 || "İsimler")}
            initials={`${(data.person1 || "").trim()[0] || ""}${(data.person2 || "").trim()[0] || ""}`.toUpperCase() || "♥"}
            onDone={() => {}} />
          <div className="fixed top-4 right-4 z-[95] flex gap-2">
            <button onClick={() => setPreviewKey((k) => k + 1)} className="px-3 py-1.5 rounded-full bg-white/90 text-slate-800 text-xs font-semibold shadow" data-testid="preview-replay">↻ Tekrar Oynat</button>
            <button onClick={() => setPreviewReveal(false)} className="px-3 py-1.5 rounded-full bg-slate-900 text-white text-xs font-semibold shadow" data-testid="preview-close">Kapat</button>
          </div>
        </div>
      )}

      {/* Premium invitation payment (one-time via PayTR) */}
      {payGate && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4" data-testid="pay-gate">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-amber-100 grid place-items-center mx-auto mb-4">
              <Lock className="w-7 h-7 text-amber-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Premium Davetiye</h3>
            <p className="text-sm text-slate-500 mt-1 mb-4">
              {payGate.pricing?.photowall
                ? "Premium şablon + canlı foto duvarı içeren davetiyeniz için tek seferlik ödeme."
                : "Premium şablonlu davetiyeniz için tek seferlik ödeme."}
            </p>
            <div className="text-4xl font-bold text-slate-900 mb-1" data-testid="pay-amount">{payGate.price}₺</div>
            <p className="text-xs text-slate-400 mb-5">Ödeme sonrası davetiyeniz otomatik yayına alınır.</p>
            {paying ? (
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-2 text-sm text-slate-600" data-testid="pay-waiting">
                  <Loader2 className="w-4 h-4 animate-spin" /> Ödeme bekleniyor…
                </div>
                <button onClick={startInvitationPayment} className="text-xs text-indigo-600" data-testid="pay-reopen">Ödeme sayfasını yeniden aç</button>
              </div>
            ) : (
              <Button onClick={startInvitationPayment} className="w-full bg-amber-500 hover:bg-amber-600 text-amber-950 h-12" data-testid="pay-start">
                <CreditCard className="w-5 h-5 mr-2" /> PayTR ile Öde
              </Button>
            )}
            <button onClick={() => { setPayGate(null); setPaying(false); }} className="w-full mt-3 text-xs text-slate-500" data-testid="pay-cancel">Vazgeç</button>
            <p className="text-[11px] text-slate-400 mt-3">Ödeme yapmadan da <button onClick={downloadPrintPdf} className="underline">baskıya hazır PDF</button> indirebilirsiniz (ücretsiz).</p>
          </div>
        </div>
      )}
    </div>
  );
}
