import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast, Toaster } from "sonner";
import { Loader2, Sparkles, Check, Copy, ExternalLink, Upload, ArrowRight } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import InvitationPreview from "@/components/invitation/InvitationPreview";
import { INVITATION_THEMES, EVENT_TYPE_LABELS } from "@/lib/invitationThemes";

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
  const [authForm, setAuthForm] = useState({ email: "", password: "", full_name: "", phone: "", company_name: "" });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [published, setPublished] = useState(null); // { slug, url }

  const set = (k, v) => setData((d) => ({ ...d, [k]: v }));
  const setGift = (k, v) => setData((d) => ({ ...d, gift: { ...d.gift, [k]: v } }));

  const canPublish = data.person1.trim() && data.event_date;
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
      setPublished({ slug: d.slug, url: d.url });
      setGate(false);
      toast.success("Davetiyeniz yayında! 🎉");
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
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
        <div className="p-6 sm:p-10 bg-white min-h-screen overflow-y-auto">
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
            <div><Label>Davet Mesajı</Label><Textarea value={data.message} onChange={(e) => set("message", e.target.value)} rows={3} placeholder="Mutluluğumuza ortak olmanızdan onur duyarız." data-testid="message" /></div>

            <div>
              <Label>Kapak Fotoğrafı (isteğe bağlı)</Label>
              <label className="mt-1 flex items-center gap-2 px-3 py-2 border border-dashed rounded-lg cursor-pointer text-sm text-slate-600 hover:bg-slate-50">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {data.cover_image_id ? "Fotoğraf eklendi — değiştir" : "Fotoğraf yükle"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadCover(e.target.files?.[0])} data-testid="cover-upload" />
              </label>
            </div>

            <div>
              <Label>Tema</Label>
              <div className="grid grid-cols-4 gap-2 mt-1">
                {Object.entries(INVITATION_THEMES).map(([k, th]) => (
                  <button key={k} onClick={() => set("theme", k)} data-testid={`theme-${k}`}
                    className={`h-14 rounded-lg text-[10px] font-medium flex items-end p-1 transition ${data.theme === k ? "ring-2 ring-offset-1 ring-indigo-500" : ""}`}
                    style={{ background: th.bg, color: th.text }}>{th.name}</button>
                ))}
              </div>
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

            <Button onClick={startPublish} disabled={!canPublish || busy} className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 text-base" data-testid="publish-btn">
              {busy ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Sparkles className="w-5 h-5 mr-2" />} Davetiyeyi Yayınla
            </Button>
          </div>
        </div>

        {/* Live preview */}
        <div className="hidden lg:block sticky top-0 h-screen overflow-y-auto">
          <InvitationPreview data={data} />
        </div>
      </div>

      {/* Membership gate (last step) */}
      {gate && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4" data-testid="publish-gate">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6">
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
            <Button onClick={doAuthThenPublish} disabled={busy} className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700" data-testid="gate-submit">
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />} Üye Ol ve Yayınla
            </Button>
            <button onClick={() => setGate(false)} className="w-full mt-2 text-xs text-slate-500">Vazgeç</button>
          </div>
        </div>
      )}
    </div>
  );
}
