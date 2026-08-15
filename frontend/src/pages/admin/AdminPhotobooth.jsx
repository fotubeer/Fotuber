import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Aperture, Plus, Trash2, ExternalLink, Info, Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/api";

const LAYOUT_LABELS = { strip4: "4'lü Şerit", grid4: "2x2 Izgara", postcard: "Kartpostal", polaroid: "Polaroid", single: "Tek Kare" };

export default function AdminPhotobooth() {
  const [settings, setSettings] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [packages, setPackages] = useState([]);
  const [tx, setTx] = useState({ transactions: [], count: 0, revenue: 0 });
  const [tplForm, setTplForm] = useState({ name: "", layout: "strip4", accent: "#111827", frame_url: "", border_color: "", border_width: 0 });
  const [pkgForm, setPkgForm] = useState({ name: "", price: "", prints: 0 });
  const [frames, setFrames] = useState([]);
  const [frName, setFrName] = useState("");
  const [frLayout, setFrLayout] = useState("postcard");
  const [frFile, setFrFile] = useState(null);
  const [frW, setFrW] = useState(10);
  const [frH, setFrH] = useState(15);
  const [frCopies, setFrCopies] = useState("1");
  const [frBusy, setFrBusy] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [tnForm, setTnForm] = useState({ name: "", operator_email: "", password: "", perms: { event_info: true, frames: true, texts: true, print_toggle: true } });
  const [tnPkg, setTnPkg] = useState({});

  const loadTenants = async () => {
    try { const { data } = await api.get("/photobooth/admin/tenants"); setTenants(data.tenants || []); } catch { /* */ }
  };
  const createTenant = async () => {
    if (!tnForm.name || !tnForm.operator_email || !tnForm.password) { toast.error("Ad, e-posta ve şifre gerekli"); return; }
    try { await api.post("/photobooth/admin/tenants", tnForm); toast.success("Firma eklendi"); setTnForm({ name: "", operator_email: "", password: "", perms: { event_info: true, frames: true, texts: true, print_toggle: true } }); loadTenants(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const toggleTenantPerm = async (t, key) => {
    const perms = { ...t.perms, [key]: !t.perms[key] };
    try { await api.patch(`/photobooth/admin/tenants/${t.id}`, { name: t.name, operator_email: t.operator_email, active: t.active, perms }); loadTenants(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const delTenant = async (id) => { if (!window.confirm("Firma ve tüm çerçeve/paketleri silinsin mi?")) return; await api.delete(`/photobooth/admin/tenants/${id}`); loadTenants(); };
  const addTenantPackage = async (tid) => {
    const f = tnPkg[tid] || {};
    if (!f.name || !(Number(f.price) > 0)) { toast.error("Paket adı ve 0'dan büyük fiyat girin"); return; }
    try { await api.post("/photobooth/admin/packages", { name: f.name, price: Number(f.price), prints: Number(f.prints) || 0, tenant_id: tid }); toast.success("Firma paketi eklendi"); setTnPkg({ ...tnPkg, [tid]: {} }); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const loadFrames = async () => {
    try { const { data } = await api.get("/photobooth/admin/frames"); setFrames(data.frames || []); } catch { /* */ }
  };
  const uploadFrame = async () => {
    if (!frFile) { toast.error("PNG dosyası seçin"); return; }
    setFrBusy(true);
    try {
      const fd = new FormData();
      fd.append("image", frFile); fd.append("name", frName || "Çerçeve"); fd.append("layout", frLayout);
      fd.append("width_cm", frW || 10); fd.append("height_cm", frH || 15);
      fd.append("copies_per_sheet", frCopies);
      await api.post("/photobooth/admin/frames/upload", fd);
      toast.success("Çerçeve yüklendi — tüm kiosklara yansıyacak");
      setFrFile(null); setFrName(""); loadFrames();
    } catch (e) { toast.error(formatApiError(e)); } finally { setFrBusy(false); }
  };
  const delFrame = async (id) => {
    try { await api.delete(`/photobooth/admin/frames/${id}`); setFrames((r) => r.filter((f) => f.id !== id)); } catch (e) { toast.error(formatApiError(e)); }
  };

  const loadAll = async () => {
    try {
      const [s, t, p, x] = await Promise.all([
        api.get("/photobooth/admin/settings"),
        api.get("/photobooth/admin/templates"),
        api.get("/photobooth/admin/packages"),
        api.get("/photobooth/admin/transactions"),
      ]);
      setSettings(s.data.settings);
      setTemplates(t.data.templates || []);
      setPackages(p.data.packages || []);
      setTx(x.data);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { loadAll(); loadFrames(); loadTenants(); }, []);

  const saveSettings = async () => {
    try { await api.put("/photobooth/admin/settings", settings); toast.success("Ayarlar kaydedildi"); loadAll(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const addTemplate = async () => {
    if (!tplForm.name.trim()) { toast.error("İsim girin"); return; }
    try { await api.post("/photobooth/admin/templates", { ...tplForm, border_width: parseInt(tplForm.border_width) || 0, category: tplForm.layout, sort: templates.length }); setTplForm({ name: "", layout: "strip4", accent: "#111827", frame_url: "", border_color: "", border_width: 0 }); loadAll(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const toggleTemplate = async (t) => { await api.patch(`/photobooth/admin/templates/${t.id}`, { ...t, active: !t.active }); loadAll(); };
  const delTemplate = async (id) => { if (!window.confirm("Silinsin mi?")) return; await api.delete(`/photobooth/admin/templates/${id}`); loadAll(); };

  const addPackage = async () => {
    const price = parseFloat(pkgForm.price) || 0;
    if (!pkgForm.name.trim() || price <= 0) { toast.error("İsim ve 0'dan büyük fiyat girin"); return; }
    try { await api.post("/photobooth/admin/packages", { name: pkgForm.name, price, prints: parseInt(pkgForm.prints) || 0, includes_qr: true, sort: packages.length }); setPkgForm({ name: "", price: "", prints: 0 }); loadAll(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const togglePackage = async (p) => { await api.patch(`/photobooth/admin/packages/${p.id}`, { ...p, active: !p.active }); loadAll(); };
  const delPackage = async (id) => { if (!window.confirm("Silinsin mi?")) return; await api.delete(`/photobooth/admin/packages/${id}`); loadAll(); };

  if (!settings) return <div className="p-8 text-slate-400">Yükleniyor…</div>;

  return (
    <div className="space-y-6" data-testid="admin-photobooth">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2"><Aperture className="text-fuchsia-500" /> Photobooth Kiosk</h1>
          <p className="text-sm text-slate-500 mt-1">Kiosk yazılımı — çerçeveler, paketler, ödeme (Nakit/Kart-POS) ve marka ayarları. (AI arka plan silme & video/GIF sonraki fazda)</p>
        </div>
        <a href="/photobooth-kiosk" target="_blank" rel="noreferrer">
          <Button data-testid="pb-open-kiosk" className="bg-fuchsia-600 hover:bg-fuchsia-500 gap-2"><ExternalLink size={16} /> Kiosk'u Aç</Button>
        </a>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
        <Info size={16} className="mt-0.5 shrink-0" />
        <span>Akış: Geri sayım → çekim → filtre → çerçeve → paket → <b>ödeme (Nakit / Kart-POS, personel PIN onayı)</b> → baskı & QR. Nakit ödemeyi firmaya göre aç/kapatabilirsiniz. Çerçevelere şeffaf PNG overlay + kenarlık + logo/hashtag ekleyebilirsiniz. (AI arka plan silme, video/GIF, Anı Duvarı sonraki fazlarda.)</span>
      </div>

      {/* Özet */}
      <div className="grid grid-cols-3 gap-4">
        {[["Çekim", tx.count], ["Ciro (₺)", (tx.revenue || 0).toLocaleString("tr-TR")], ["Aktif Çerçeve", templates.filter((t) => t.active).length]].map(([l, v]) => (
          <Card key={l} className="border-slate-200"><CardContent className="p-4"><div className="text-xs text-slate-500">{l}</div><div className="text-2xl font-bold">{v}</div></CardContent></Card>
        ))}
      </div>

      {/* Ayarlar */}
      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-lg">Marka & Kiosk Ayarları</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div><Label>Slogan / Marka Metni</Label><Input data-testid="pb-set-slogan" value={settings.brand_slogan || ""} onChange={(e) => setSettings({ ...settings, brand_slogan: e.target.value })} /></div>
          <div><Label>Logo URL (opsiyonel)</Label><Input data-testid="pb-set-logo" value={settings.brand_logo_url || ""} onChange={(e) => setSettings({ ...settings, brand_logo_url: e.target.value })} placeholder="https://…" /></div>
          <div><Label>Yönetici Çıkış PIN'i</Label><Input data-testid="pb-set-pin" value={settings.admin_exit_pin || ""} onChange={(e) => setSettings({ ...settings, admin_exit_pin: e.target.value.replace(/\D/g, "").slice(0, 6) })} /></div>
          <div><Label>Geri Sayım (saniye)</Label><Input data-testid="pb-set-countdown" type="number" min="1" max="10" value={settings.countdown_seconds || 3} onChange={(e) => setSettings({ ...settings, countdown_seconds: parseInt(e.target.value) || 3 })} /></div>
          <div><Label>Etkinlik Etiketi / Hashtag (baskıda)</Label><Input data-testid="pb-set-hashtag" value={settings.event_hashtag || ""} onChange={(e) => setSettings({ ...settings, event_hashtag: e.target.value })} placeholder="#AyseMehmet" /></div>
          <div className="sm:col-span-2 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[["payment_required", "Ödeme Adımı Zorunlu"], ["cash_enabled", "Nakit Ödemeye İzin Ver"], ["show_date", "Baskıda Tarih Damgası"]].map(([k, l]) => (
              <div key={k} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                <span className="text-sm">{l}</span>
                <Switch data-testid={`pb-toggle-${k}`} checked={!!settings[k]} onCheckedChange={(v) => setSettings({ ...settings, [k]: v })} />
              </div>
            ))}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3 bg-slate-50">
              <span className="text-sm text-slate-600">Kart Ödemesi</span>
              <span className="text-xs font-medium text-slate-500">Fiziki POS</span>
            </div>
          </div>
          <div className="sm:col-span-2 grid grid-cols-3 gap-3">
            {[["video_mode", "Video/GIF Modu"], ["ai_bg_removal", "AI Arka Plan Silme"], ["live_wall", "Anı Duvarı (Canlı)"]].map(([k, l]) => (
              <div key={k} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 opacity-90">
                <span className="text-sm">{l} <span className="text-[10px] text-slate-400">(taslak)</span></span>
                <Switch data-testid={`pb-toggle-${k}`} checked={!!settings[k]} onCheckedChange={(v) => setSettings({ ...settings, [k]: v })} />
              </div>
            ))}
          </div>
          <div className="sm:col-span-2"><Button data-testid="pb-save-settings" onClick={saveSettings} className="bg-slate-900 hover:bg-slate-800">Ayarları Kaydet</Button></div>
        </CardContent>
      </Card>

      {/* Firmalar — operatör hesapları + yetkiler + firma bazlı fiyat */}
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Aperture size={18} className="text-emerald-600" /> Firmalar (Operatör Hesapları)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">Etkinlik alanındaki firma operatörü için hesap açın. Operatör yalnızca kendi sınırlı panelini görür; fiyatları göremez/değiştiremez.</p>
          <div className="grid sm:grid-cols-4 gap-2 items-end">
            <div><Label>Firma Adı</Label><Input data-testid="pb-tn-name" value={tnForm.name} onChange={(e) => setTnForm({ ...tnForm, name: e.target.value })} /></div>
            <div><Label>Operatör E-posta</Label><Input data-testid="pb-tn-email" value={tnForm.operator_email} onChange={(e) => setTnForm({ ...tnForm, operator_email: e.target.value })} /></div>
            <div><Label>Şifre</Label><Input data-testid="pb-tn-pw" value={tnForm.password} onChange={(e) => setTnForm({ ...tnForm, password: e.target.value })} /></div>
            <Button data-testid="pb-tn-add" onClick={createTenant} className="bg-emerald-600 hover:bg-emerald-500 gap-1"><Plus size={16} /> Firma Ekle</Button>
          </div>
          <div className="space-y-3">
            {tenants.length === 0 && <p className="text-slate-400 text-sm">Henüz firma yok.</p>}
            {tenants.map((t) => (
              <div key={t.id} data-testid={`pb-tenant-${t.id}`} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1"><div className="font-medium">{t.name}</div><div className="text-xs text-slate-500">{t.operator_email}</div></div>
                  <Link to="/photobooth-panel" target="_blank" className="text-xs text-emerald-700 flex items-center gap-1">Panel <ExternalLink size={12} /></Link>
                  <button data-testid={`pb-tenant-del-${t.id}`} onClick={() => delTenant(t.id)} className="text-red-500 hover:text-red-600"><Trash2 size={16} /></button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[["event_info", "Etkinlik Bilgisi"], ["frames", "Çerçeve"], ["texts", "Yazı/Logo"], ["print_toggle", "Baskı Aç/Kapat"]].map(([k, l]) => (
                    <label key={k} className="flex items-center gap-1.5 text-xs rounded-full border border-slate-200 px-2.5 py-1">
                      <input data-testid={`pb-tenant-perm-${t.id}-${k}`} type="checkbox" checked={!!t.perms?.[k]} onChange={() => toggleTenantPerm(t, k)} /> {l}
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-2 items-end border-t border-slate-100 pt-2">
                  <div className="col-span-1"><Label className="text-xs">Paket Adı</Label><Input data-testid={`pb-tnpkg-name-${t.id}`} value={(tnPkg[t.id]?.name) || ""} onChange={(e) => setTnPkg({ ...tnPkg, [t.id]: { ...tnPkg[t.id], name: e.target.value } })} className="h-9" /></div>
                  <div><Label className="text-xs">Fiyat ₺</Label><Input data-testid={`pb-tnpkg-price-${t.id}`} type="number" value={(tnPkg[t.id]?.price) || ""} onChange={(e) => setTnPkg({ ...tnPkg, [t.id]: { ...tnPkg[t.id], price: e.target.value } })} className="h-9" /></div>
                  <div><Label className="text-xs">Baskı</Label><Input data-testid={`pb-tnpkg-prints-${t.id}`} type="number" value={(tnPkg[t.id]?.prints) || ""} onChange={(e) => setTnPkg({ ...tnPkg, [t.id]: { ...tnPkg[t.id], prints: e.target.value } })} className="h-9" /></div>
                  <Button data-testid={`pb-tnpkg-add-${t.id}`} onClick={() => addTenantPackage(t.id)} variant="outline" className="h-9 gap-1"><Plus size={14} /> Paket</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Global PNG Çerçeveler — tüm kiosklara otomatik yansır */}
      <Card className="border-fuchsia-200 bg-fuchsia-50/40">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Upload size={18} className="text-fuchsia-600" /> Global PNG Çerçeveler</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">Buraya yüklediğiniz şeffaf PNG çerçeveler <b>tüm firma kiosklarında otomatik</b> görünür — böylece toplu güncelleme yapabilirsiniz. Baskı boyutunu (cm) girin ki tekli/çoklu düzenlerde çerçeve tam otursun.</p>
          <div className="grid sm:grid-cols-6 gap-2 items-end">
            <div className="sm:col-span-2"><Label>Çerçeve Adı</Label><Input data-testid="pb-frame-name" value={frName} onChange={(e) => setFrName(e.target.value)} placeholder="Ör. Altın Kenar" /></div>
            <div><Label>Düzen</Label>
              <Select value={frLayout} onValueChange={setFrLayout}>
                <SelectTrigger data-testid="pb-frame-layout"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(LAYOUT_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>En (cm)</Label><Input data-testid="pb-frame-w" type="number" min="1" step="0.1" value={frW} onChange={(e) => setFrW(e.target.value)} /></div>
            <div><Label>Boy (cm)</Label><Input data-testid="pb-frame-h" type="number" min="1" step="0.1" value={frH} onChange={(e) => setFrH(e.target.value)} /></div>
            <div className="sm:col-span-6 grid sm:grid-cols-2 gap-2 items-end">
              <div><Label>Sayfa başına kopya (yazıcı ortadan keser)</Label>
                <Select value={frCopies} onValueChange={setFrCopies}>
                  <SelectTrigger data-testid="pb-frame-copies"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 (tek baskı)</SelectItem>
                    <SelectItem value="2">2 (yan yana — HiTi vb. ortadan kes → 2 şerit)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2 items-end">
                <div><Label>PNG (şeffaf)</Label><Input data-testid="pb-frame-file" type="file" accept="image/png" onChange={(e) => setFrFile(e.target.files?.[0] || null)} className="h-10" /></div>
                <Button data-testid="pb-frame-upload" onClick={uploadFrame} disabled={frBusy} className="bg-fuchsia-600 hover:bg-fuchsia-500 gap-1"><Upload size={16} /> {frBusy ? "Yükleniyor…" : "Yükle"}</Button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {frames.length === 0 && <p className="text-slate-400 text-sm col-span-full">Henüz global çerçeve yok.</p>}
            {frames.map((f) => (
              <div key={f.id} data-testid={`pb-frame-${f.id}`} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                <div className="aspect-square bg-[repeating-conic-gradient(#eee_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] flex items-center justify-center">
                  <img src={`${API_BASE}/photobooth/frame/${f.id}`} alt={f.name} className="w-full h-full object-contain" />
                </div>
                <div className="p-2">
                  <div className="flex items-center gap-1">
                    <span className="text-xs truncate flex-1 font-medium">{f.name}</span>
                    <button data-testid={`pb-frame-del-${f.id}`} onClick={() => delFrame(f.id)} className="text-red-500 hover:text-red-600"><Trash2 size={14} /></button>
                  </div>
                  <div className="text-[10px] text-slate-400">{LAYOUT_LABELS[f.layout] || f.layout}{f.width_cm ? ` · ${f.width_cm}×${f.height_cm} cm` : ""}{f.copies_per_sheet === 2 ? " · 2 şerit (kes)" : ""}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Çerçeveler */}
      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-lg">Çerçeve / Düzen Kataloğu</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-4 gap-2 items-end">
            <div><Label>İsim</Label><Input data-testid="pb-tpl-name" value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} /></div>
            <div><Label>Düzen</Label>
              <Select value={tplForm.layout} onValueChange={(v) => setTplForm({ ...tplForm, layout: v })}>
                <SelectTrigger data-testid="pb-tpl-layout"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(LAYOUT_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Vurgu Rengi</Label><Input data-testid="pb-tpl-accent" type="color" value={tplForm.accent} onChange={(e) => setTplForm({ ...tplForm, accent: e.target.value })} className="h-10 p-1" /></div>
            <Button data-testid="pb-tpl-add" onClick={addTemplate} className="bg-fuchsia-600 hover:bg-fuchsia-500 gap-1"><Plus size={16} /> Ekle</Button>
          </div>
          <div className="grid sm:grid-cols-3 gap-2 items-end">
            <div><Label>Çerçeve PNG URL (şeffaf overlay)</Label><Input data-testid="pb-tpl-frame" value={tplForm.frame_url} onChange={(e) => setTplForm({ ...tplForm, frame_url: e.target.value })} placeholder="https://… (opsiyonel)" /></div>
            <div><Label>Kenarlık Rengi</Label><Input data-testid="pb-tpl-border-color" type="color" value={tplForm.border_color || "#ffffff"} onChange={(e) => setTplForm({ ...tplForm, border_color: e.target.value })} className="h-10 p-1" /></div>
            <div><Label>Kenarlık Kalınlığı (px)</Label><Input data-testid="pb-tpl-border-width" type="number" min="0" max="60" value={tplForm.border_width} onChange={(e) => setTplForm({ ...tplForm, border_width: e.target.value })} /></div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates.map((t) => (
              <div key={t.id} data-testid={`pb-tpl-row-${t.id}`} className={`rounded-xl border p-3 flex items-center gap-3 ${t.active ? "border-slate-200" : "border-slate-200 bg-slate-50 opacity-70"}`}>
                <div className="w-9 h-12 rounded" style={{ background: t.accent }} />
                <div className="flex-1"><div className="font-medium text-sm">{t.name}</div><div className="text-xs text-slate-500">{LAYOUT_LABELS[t.layout] || t.layout}</div></div>
                <Switch checked={t.active} onCheckedChange={() => toggleTemplate(t)} />
                <button onClick={() => delTemplate(t.id)} className="text-red-500 p-1"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Paketler */}
      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-lg">Fiyat Paketleri <span className="text-xs font-normal text-slate-400">(ücretsiz seçenek yok)</span></CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-4 gap-2 items-end">
            <div><Label>İsim</Label><Input data-testid="pb-pkg-name" value={pkgForm.name} onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })} /></div>
            <div><Label>Fiyat (₺)</Label><Input data-testid="pb-pkg-price" type="number" value={pkgForm.price} onChange={(e) => setPkgForm({ ...pkgForm, price: e.target.value })} /></div>
            <div><Label>Baskı Adedi</Label><Input data-testid="pb-pkg-prints" type="number" min="0" value={pkgForm.prints} onChange={(e) => setPkgForm({ ...pkgForm, prints: e.target.value })} /></div>
            <Button data-testid="pb-pkg-add" onClick={addPackage} className="bg-fuchsia-600 hover:bg-fuchsia-500 gap-1"><Plus size={16} /> Ekle</Button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {packages.map((p) => (
              <div key={p.id} data-testid={`pb-pkg-row-${p.id}`} className={`rounded-xl border p-3 flex items-center gap-3 ${p.active ? "border-slate-200" : "border-slate-200 bg-slate-50 opacity-70"}`}>
                <div className="flex-1"><div className="font-medium text-sm">{p.name}</div><div className="text-xs text-slate-500">{p.prints > 0 ? `${p.prints} baskı` : "baskı yok"} · {p.includes_qr ? "QR" : "—"}</div></div>
                <div className="font-bold text-fuchsia-600">{p.price}₺</div>
                <Switch checked={p.active} onCheckedChange={() => togglePackage(p)} />
                <button onClick={() => delPackage(p.id)} className="text-red-500 p-1"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
