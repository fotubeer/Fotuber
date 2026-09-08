import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "@/lib/api";
import { toast } from "sonner";
import { Aperture, LogIn, LogOut, Plus, Trash2, Play, Save, Loader2 } from "lucide-react";

const TK = "booth_token";
const LAYOUTS = [
  { key: "strip4", label: "4'lü Şerit" }, { key: "grid4", label: "2x2 Kare" },
  { key: "postcard", label: "Kartpostal" }, { key: "polaroid", label: "Polaroid" }, { key: "single", label: "Tek Kare" },
];

export default function PhotoboothPanel() {
  const navigate = useNavigate();
  const [token, setToken] = useState(localStorage.getItem(TK) || "");
  const [tenant, setTenant] = useState(null);
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [settings, setSettings] = useState({});
  const [templates, setTemplates] = useState([]);
  const [canEditFrames, setCanEditFrames] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tpl, setTpl] = useState({ name: "", layout: "strip4", accent: "#111827", frame_url: "", border_color: "#d4af37", border_width: 8 });

  const hdr = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
  const perms = { ...(tenant?.perms || {}) };

  const loadAll = async (tk = token) => {
    try {
      const me = await fetch(`${API_BASE}/photobooth/operator/me`, { headers: { Authorization: `Bearer ${tk}` } });
      if (!me.ok) { localStorage.removeItem(TK); setToken(""); setTenant(null); return; }
      const d = await me.json(); setTenant(d.tenant); setSettings(d.tenant.settings || {});
      const tr = await fetch(`${API_BASE}/photobooth/operator/templates`, { headers: { Authorization: `Bearer ${tk}` } });
      const td = await tr.json(); setTemplates(td.templates || []); setCanEditFrames(td.can_edit);
    } catch { /* */ }
  };
  useEffect(() => { if (token) loadAll(); }, []); // eslint-disable-line

  const login = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/photobooth/operator/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: pw }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Giriş başarısız");
      localStorage.setItem(TK, d.token); setToken(d.token); await loadAll(d.token);
      toast.success("Giriş yapıldı");
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const logout = () => { localStorage.removeItem(TK); setToken(""); setTenant(null); };

  const saveSettings = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/photobooth/operator/settings`, { method: "PUT", headers: hdr(), body: JSON.stringify({ settings }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Kaydedilemedi");
      setTenant(d.tenant); setSettings(d.tenant.settings); toast.success("Ayarlar kaydedildi");
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const addFrame = async () => {
    if (!tpl.name.trim()) { toast.error("Çerçeve adı girin"); return; }
    try {
      const r = await fetch(`${API_BASE}/photobooth/operator/templates`, { method: "POST", headers: hdr(), body: JSON.stringify({ ...tpl, border_width: parseInt(tpl.border_width) || 0, category: tpl.layout, sort: templates.length }) });
      if (!r.ok) { const j = await r.json(); throw new Error(j.detail); }
      setTpl({ name: "", layout: "strip4", accent: "#111827", frame_url: "", border_color: "#d4af37", border_width: 8 }); loadAll();
    } catch (e) { toast.error(e.message); }
  };
  const delFrame = async (id) => {
    await fetch(`${API_BASE}/photobooth/operator/templates/${id}`, { method: "DELETE", headers: hdr() });
    setTemplates((r) => r.filter((x) => x.id !== id));
  };

  const set = (k, v) => setSettings((s) => ({ ...s, [k]: v }));

  if (!tenant) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4" data-testid="booth-login">
          <div className="flex items-center gap-2 text-fuchsia-400"><Aperture /> <span className="font-bold text-lg">Photobooth Firma Paneli</span></div>
          <p className="text-sm text-white/50">Etkinlik alanı operatör girişi</p>
          <input data-testid="booth-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-posta" className="w-full h-11 rounded-lg bg-white/5 border border-white/15 px-3 outline-none" />
          <input data-testid="booth-password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} placeholder="Şifre" className="w-full h-11 rounded-lg bg-white/5 border border-white/15 px-3 outline-none" />
          <button data-testid="booth-login-btn" onClick={login} disabled={busy} className="w-full h-11 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 font-semibold flex items-center justify-center gap-2">{busy ? <Loader2 className="animate-spin" size={18} /> : <LogIn size={18} />} Giriş Yap</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white" data-testid="booth-panel">
      <div className="border-b border-white/10 px-5 py-4 flex items-center gap-3">
        <Aperture className="text-fuchsia-400" />
        <div className="flex-1"><div className="font-bold">{tenant.name}</div><div className="text-xs text-white/40">{tenant.operator_email}</div></div>
        <button data-testid="booth-start-kiosk" onClick={() => navigate("/photobooth-kiosk")} className="rounded-full bg-emerald-500 hover:bg-emerald-400 px-5 py-2 font-semibold flex items-center gap-2"><Play size={16} /> Kiosku Başlat</button>
        <button data-testid="booth-logout" onClick={logout} className="text-white/60 hover:text-white p-2"><LogOut size={18} /></button>
      </div>

      <div className="max-w-3xl mx-auto p-5 space-y-6">
        {/* Etkinlik & Yazılar & Baskı */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
          <div className="font-semibold text-lg">Etkinlik & Baskı Ayarları</div>
          {perms.event_info && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className="text-xs text-white/50">Etkinlik Adı</label><input data-testid="booth-event-name" value={settings.event_name || ""} onChange={(e) => set("event_name", e.target.value)} className="w-full h-10 rounded-lg bg-white/5 border border-white/15 px-3 mt-1" /></div>
              <div><label className="text-xs text-white/50">Hashtag (baskıda)</label><input data-testid="booth-hashtag" value={settings.event_hashtag || ""} onChange={(e) => set("event_hashtag", e.target.value)} placeholder="#AyseMehmet" className="w-full h-10 rounded-lg bg-white/5 border border-white/15 px-3 mt-1" /></div>
            </div>
          )}
          {perms.texts && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className="text-xs text-white/50">Slogan / Alt Yazı</label><input data-testid="booth-slogan" value={settings.brand_slogan || ""} onChange={(e) => set("brand_slogan", e.target.value)} className="w-full h-10 rounded-lg bg-white/5 border border-white/15 px-3 mt-1" /></div>
              <div><label className="text-xs text-white/50">Logo URL</label><input data-testid="booth-logo" value={settings.brand_logo_url || ""} onChange={(e) => set("brand_logo_url", e.target.value)} className="w-full h-10 rounded-lg bg-white/5 border border-white/15 px-3 mt-1" /></div>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            {perms.event_info && (
              <label className="flex items-center gap-2 text-sm bg-white/5 rounded-lg px-3 py-2"><input data-testid="booth-showdate" type="checkbox" checked={!!settings.show_date} onChange={(e) => set("show_date", e.target.checked)} /> Baskıda Tarih</label>
            )}
            {perms.print_toggle && (<>
              <label className="flex items-center gap-2 text-sm bg-white/5 rounded-lg px-3 py-2"><input data-testid="booth-payreq" type="checkbox" checked={!!settings.payment_required} onChange={(e) => set("payment_required", e.target.checked)} /> Ödeme Adımı Zorunlu</label>
              <label className="flex items-center gap-2 text-sm bg-white/5 rounded-lg px-3 py-2"><input data-testid="booth-cash" type="checkbox" checked={!!settings.cash_enabled} onChange={(e) => set("cash_enabled", e.target.checked)} /> Nakit Ödeme Açık</label>
            </>)}
          </div>
          <button data-testid="booth-save-settings" onClick={saveSettings} disabled={busy} className="h-10 px-5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 font-semibold flex items-center gap-2">{busy ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Kaydet</button>
          <p className="text-xs text-white/40">Fiyat/paketler site yöneticisi tarafından belirlenir; bu panelden değiştirilemez.</p>
        </div>

        {/* Çerçeveler */}
        {perms.frames && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4" data-testid="booth-frames">
            <div className="font-semibold text-lg">Çerçeveler</div>
            <div className="grid sm:grid-cols-5 gap-2 items-end">
              <div className="sm:col-span-2"><label className="text-xs text-white/50">Ad</label><input data-testid="booth-frame-name" value={tpl.name} onChange={(e) => setTpl({ ...tpl, name: e.target.value })} className="w-full h-10 rounded-lg bg-white/5 border border-white/15 px-3 mt-1" /></div>
              <div><label className="text-xs text-white/50">Düzen</label><select data-testid="booth-frame-layout" value={tpl.layout} onChange={(e) => setTpl({ ...tpl, layout: e.target.value })} className="w-full h-10 rounded-lg bg-neutral-900 border border-white/15 px-2 mt-1">{LAYOUTS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</select></div>
              <div><label className="text-xs text-white/50">Kenarlık</label><input type="color" value={tpl.border_color} onChange={(e) => setTpl({ ...tpl, border_color: e.target.value })} className="w-full h-10 rounded-lg bg-white/5 border border-white/15 mt-1" /></div>
              <button data-testid="booth-frame-add" onClick={addFrame} className="h-10 rounded-lg bg-emerald-500 hover:bg-emerald-400 font-semibold flex items-center justify-center gap-1"><Plus size={16} /> Ekle</button>
            </div>
            <div><label className="text-xs text-white/50">Çerçeve PNG URL (şeffaf overlay, opsiyonel)</label><input data-testid="booth-frame-url" value={tpl.frame_url} onChange={(e) => setTpl({ ...tpl, frame_url: e.target.value })} placeholder="https://…" className="w-full h-10 rounded-lg bg-white/5 border border-white/15 px-3 mt-1" /></div>
            <div className="space-y-2">
              {templates.length === 0 && <p className="text-white/40 text-sm">Henüz çerçeve yok.</p>}
              {templates.map((t) => (
                <div key={t.id} data-testid={`booth-frame-${t.id}`} className="flex items-center gap-3 rounded-lg border border-white/10 p-3">
                  <span className="w-4 h-4 rounded" style={{ background: t.accent }} />
                  <span className="flex-1">{t.name} <span className="text-xs text-white/40">· {t.layout}{t.border_width ? ` · kenarlık ${t.border_width}px` : ""}</span></span>
                  <button data-testid={`booth-frame-del-${t.id}`} onClick={() => delFrame(t.id)} className="text-red-400 hover:text-red-300"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
