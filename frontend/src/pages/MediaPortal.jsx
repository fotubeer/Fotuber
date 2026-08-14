import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Aperture, LogOut, Upload, Download, Trash2, Image as ImageIcon, Building2, LogIn, Sparkles, Wand2, Copy, X, CalendarDays, Star, History, Loader2 } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL + "/api/media";
const TK = "fotuber_partner_token";
const authCfg = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem(TK) || ""}` } });
const fmtSize = (n) => n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil((n || 0) / 1024)} KB`;

export default function MediaPortal() {
  const [partner, setPartner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [files, setFiles] = useState([]);
  const [perms, setPerms] = useState({});
  const [company, setCompany] = useState({ phone: "", website: "", about: "" });
  const fileRef = useRef(null);
  const logoRef = useRef(null);

  // AI İçerik Asistanı
  const aiImgRef = useRef(null);
  const [aiFile, setAiFile] = useState(null);
  const [aiPreview, setAiPreview] = useState("");
  const [aiPlatform, setAiPlatform] = useState("instagram_post");
  const [aiContext, setAiContext] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const PLATFORMS = [
    { key: "instagram_post", label: "Instagram Gönderi" },
    { key: "instagram_story", label: "Instagram Story" },
    { key: "facebook", label: "Facebook" },
    { key: "tiktok", label: "TikTok" },
    { key: "twitter", label: "X (Twitter)" },
  ];

  // Sekmeler + Özel Gün Takvimi + Geçmiş
  const [tab, setTab] = useState("ai");
  const [days, setDays] = useState([]);
  const [selDay, setSelDay] = useState(null);
  const [spFormat, setSpFormat] = useState("post");
  const [spContext, setSpContext] = useState("");
  const [spBusy, setSpBusy] = useState(false);
  const [spImages, setSpImages] = useState([]);
  const [history, setHistory] = useState([]);
  const [favOnly, setFavOnly] = useState(false);

  const loadMe = async () => {
    if (!localStorage.getItem(TK)) { setLoading(false); return; }
    try {
      const { data } = await axios.get(`${API}/partner/me`, authCfg());
      setPartner(data.partner); setCompany({ phone: "", website: "", about: "", ...(data.partner.company || {}) });
      loadFiles();
    } catch { localStorage.removeItem(TK); }
    finally { setLoading(false); }
  };
  const loadFiles = async () => {
    try { const { data } = await axios.get(`${API}/partner/files`, authCfg()); setFiles(data.files || []); setPerms(data.perms || {}); } catch { /* */ }
  };
  useEffect(() => { loadMe(); }, []);

  const login = async () => {
    try {
      const { data } = await axios.post(`${API}/partner/login`, { email, password: pass });
      localStorage.setItem(TK, data.token); setLoading(true); await loadMe();
      toast.success("Giriş başarılı");
    } catch (e) { toast.error(e?.response?.data?.detail || "Giriş başarısız"); }
  };
  const logout = () => { localStorage.removeItem(TK); setPartner(null); };

  const doUpload = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const fd = new FormData(); fd.append("file", f);
    try { await axios.post(`${API}/partner/upload`, fd, authCfg()); toast.success("Yüklendi"); loadFiles(); }
    catch (er) { toast.error(er?.response?.data?.detail || "Yüklenemedi"); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  };
  const doLogo = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const fd = new FormData(); fd.append("image", f);
    try { const { data } = await axios.post(`${API}/partner/logo`, fd, authCfg()); setPartner((p) => ({ ...p, logo_url: data.logo_url })); toast.success("Logo güncellendi"); }
    catch { toast.error("Logo yüklenemedi"); }
  };
  const doDownload = async (fl) => {
    try {
      const res = await axios.get(`${API}/partner/file/${fl.id}`, { ...authCfg(), responseType: "blob" });
      const url = URL.createObjectURL(res.data); const a = document.createElement("a"); a.href = url; a.download = fl.name;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { toast.error(e?.response?.data?.detail || "İndirilemedi"); }
  };
  const doDelete = async (fl) => {
    if (!window.confirm("Silinsin mi?")) return;
    try { await axios.delete(`${API}/partner/file/${fl.id}`, authCfg()); loadFiles(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Silinemedi"); }
  };
  const saveCompany = async () => {
    try { const { data } = await axios.put(`${API}/partner/company`, { company }, authCfg()); setPartner(data.partner); toast.success("Bilgiler kaydedildi"); }
    catch { toast.error("Kaydedilemedi"); }
  };

  const pickAiImage = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Lütfen bir görsel seçin"); return; }
    setAiFile(f); setAiResult(null);
    const rd = new FileReader(); rd.onload = () => setAiPreview(rd.result); rd.readAsDataURL(f);
  };
  const clearAiImage = () => { setAiFile(null); setAiPreview(""); setAiResult(null); if (aiImgRef.current) aiImgRef.current.value = ""; };
  const generateAi = async () => {
    if (!aiFile) { toast.error("Önce bir görsel yükleyin"); return; }
    setAiBusy(true); setAiResult(null);
    const fd = new FormData();
    fd.append("image", aiFile); fd.append("platform", aiPlatform); fd.append("context", aiContext);
    try {
      const { data } = await axios.post(`${API}/partner/ai-content`, fd, authCfg());
      setAiResult(data); toast.success("İçerik üretildi"); loadHistory();
    } catch (e) { toast.error(e?.response?.data?.detail || "İçerik üretilemedi"); }
    finally { setAiBusy(false); }
  };
  const copyText = (t) => { navigator.clipboard?.writeText(t); toast.success("Kopyalandı"); };

  // Özel Gün Takvimi
  const loadDays = async () => {
    try { const { data } = await axios.get(`${API}/partner/special-days`, authCfg()); setDays(data.days || []); }
    catch { /* */ }
  };
  const genSpecial = async () => {
    if (!selDay) { toast.error("Önce bir özel gün seçin"); return; }
    setSpBusy(true); setSpImages([]);
    try {
      const { data } = await axios.post(`${API}/partner/special-day-images`,
        { day_name: selDay.name, format: spFormat, context: spContext }, authCfg());
      setSpImages(data.images || []);
      toast.success(data.has_logo ? "Logolu görseller üretildi" : "Görseller üretildi (logo bulunamadı)");
    } catch (e) { toast.error(e?.response?.data?.detail || "Görsel üretilemedi"); }
    finally { setSpBusy(false); }
  };
  const downloadImg = (im, i) => {
    const a = document.createElement("a"); a.href = im.data_url;
    a.download = `${(selDay?.name || "ozel-gun").replace(/\s+/g, "-")}-${i + 1}.jpg`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  // İçerik Geçmişi
  const loadHistory = async (fav = favOnly) => {
    try { const { data } = await axios.get(`${API}/partner/ai-history?favorites=${fav}`, authCfg()); setHistory(data.history || []); }
    catch { /* */ }
  };
  const toggleFav = async (h) => {
    try { const { data } = await axios.post(`${API}/partner/ai-history/${h.id}/favorite`, {}, authCfg());
      setHistory((rows) => rows.map((r) => r.id === h.id ? { ...r, favorite: data.favorite } : r).filter((r) => !favOnly || r.favorite)); }
    catch { toast.error("İşlem başarısız"); }
  };
  const delHistory = async (h) => {
    try { await axios.delete(`${API}/partner/ai-history/${h.id}`, authCfg()); setHistory((rows) => rows.filter((r) => r.id !== h.id)); }
    catch { toast.error("Silinemedi"); }
  };

  useEffect(() => { if (partner) { loadDays(); loadHistory(false); } }, [partner]);

  const logoSrc = partner?.logo_url ? (process.env.REACT_APP_BACKEND_URL + partner.logo_url) : null;

  if (loading) return <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">Yükleniyor…</div>;

  if (!partner) return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-4" data-testid="media-login"
      style={{ background: "radial-gradient(900px 500px at 50% -10%, #14203a 0%, #0a0e18 60%, #05070d 100%)" }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-6"><Aperture className="text-sky-400" /><span className="text-xl font-semibold tracking-tight">Fotuber Medya</span></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 space-y-3">
          <p className="text-sm text-white/50 text-center">Firma girişi — Fotuber Photography</p>
          <input data-testid="media-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-posta"
            className="w-full h-11 rounded-lg bg-white/5 border border-white/15 px-3 outline-none focus:border-sky-400" />
          <input data-testid="media-password" type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} placeholder="Şifre"
            className="w-full h-11 rounded-lg bg-white/5 border border-white/15 px-3 outline-none focus:border-sky-400" />
          <button data-testid="media-login-btn" onClick={login} className="w-full h-11 rounded-lg bg-sky-500 hover:bg-sky-400 font-semibold flex items-center justify-center gap-2"><LogIn size={17} /> Giriş Yap</button>
          <p className="text-xs text-white/30 text-center">Hesabınız yoksa Fotuber ile iletişime geçin.</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-white" data-testid="media-dashboard"
      style={{ background: "radial-gradient(1100px 600px at 50% -10%, #14203a 0%, #0a0e18 55%, #05070d 100%)" }}>
      <div className="border-b border-white/10 px-5 py-3 flex items-center gap-3">
        <Aperture className="text-sky-400" /><span className="font-semibold">Fotuber Medya</span>
        <span className="text-white/40 text-sm">· {partner.name}</span>
        <button onClick={logout} className="ml-auto text-white/60 hover:text-white text-sm flex items-center gap-1" data-testid="media-logout"><LogOut size={15} /> Çıkış</button>
      </div>

      <div className="max-w-5xl mx-auto p-5 grid lg:grid-cols-3 gap-5">
        {/* Firma bilgileri + logo */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
          <div className="flex items-center gap-2 text-white/70"><Building2 size={17} /> <span className="font-semibold">Firma Bilgileri</span></div>
          <div className="flex items-center gap-3">
            <div className="w-20 h-20 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
              {logoSrc ? <img src={logoSrc} alt="logo" className="w-full h-full object-contain" data-testid="media-logo-img" /> : <ImageIcon className="text-white/30" />}
            </div>
            <div>
              <input ref={logoRef} type="file" accept="image/*" hidden onChange={doLogo} data-testid="media-logo-input" />
              <button onClick={() => logoRef.current?.click()} className="text-sm rounded-lg bg-white/10 hover:bg-white/15 px-3 py-2" data-testid="media-logo-btn">Logo Yükle</button>
            </div>
          </div>
          <input value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} placeholder="Telefon" className="w-full h-10 rounded-lg bg-white/5 border border-white/15 px-3 text-sm outline-none" data-testid="media-company-phone" />
          <input value={company.website} onChange={(e) => setCompany({ ...company, website: e.target.value })} placeholder="Web sitesi" className="w-full h-10 rounded-lg bg-white/5 border border-white/15 px-3 text-sm outline-none" />
          <textarea value={company.about} onChange={(e) => setCompany({ ...company, about: e.target.value })} placeholder="Firma hakkında" rows={3} className="w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm outline-none" />
          <button onClick={saveCompany} className="w-full h-10 rounded-lg bg-sky-500 hover:bg-sky-400 font-medium text-sm" data-testid="media-company-save">Kaydet</button>
        </div>

        {/* Dosya alanı */}
        <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="font-semibold">Dosyalarım</span>
            <span className="text-xs text-white/40">({[perms.download && "indir", perms.upload && "yükle", perms.backup && "sil/yedek"].filter(Boolean).join(" · ") || "yetki yok"})</span>
            {perms.upload && <>
              <input ref={fileRef} type="file" hidden onChange={doUpload} data-testid="media-file-input" />
              <button onClick={() => fileRef.current?.click()} className="ml-auto text-sm rounded-lg bg-sky-500 hover:bg-sky-400 px-3 py-2 flex items-center gap-1.5" data-testid="media-upload-btn"><Upload size={15} /> Yükle</button>
            </>}
          </div>
          <div className="space-y-2">
            {files.length === 0 && <p className="text-white/40 text-sm py-6 text-center">Henüz dosya yok.</p>}
            {files.map((f) => (
              <div key={f.id} data-testid={`media-file-${f.id}`} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex-1 min-w-0"><div className="truncate text-sm">{f.name}</div><div className="text-xs text-white/40">{fmtSize(f.size)} · {(f.created_at || "").slice(0, 10)}</div></div>
                {perms.download && <button onClick={() => doDownload(f)} className="text-sky-300 hover:text-sky-200 p-1" data-testid={`media-dl-${f.id}`}><Download size={17} /></button>}
                {perms.backup && <button onClick={() => doDelete(f)} className="text-red-400 hover:text-red-300 p-1" data-testid={`media-del-${f.id}`}><Trash2 size={16} /></button>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sekmeler: İçerik Asistanı / Özel Gün Takvimi / Geçmiş */}
      <div className="max-w-5xl mx-auto px-5 pb-3 flex flex-wrap gap-2" data-testid="media-tabs">
        {[
          { key: "ai", label: "İçerik Asistanı", icon: Sparkles },
          { key: "special", label: "Özel Gün Takvimi", icon: CalendarDays },
          { key: "history", label: "İçerik Geçmişi", icon: History },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} data-testid={`tab-${t.key}`}
            className={`text-sm px-4 py-2 rounded-full border flex items-center gap-1.5 transition-colors ${tab === t.key ? "bg-white/10 border-white/25 text-white" : "border-white/10 text-white/50 hover:text-white/80"}`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {/* Yapay Zeka İçerik Asistanı */}
      <div className={`max-w-5xl mx-auto px-5 pb-10 ${tab === "ai" ? "" : "hidden"}`}>
        <div className="rounded-2xl border border-fuchsia-400/20 bg-gradient-to-br from-fuchsia-500/[0.07] to-sky-500/[0.05] p-5" data-testid="media-ai-panel">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="text-fuchsia-400" size={18} />
            <span className="font-semibold text-lg">Yapay Zeka İçerik Asistanı</span>
          </div>
          <p className="text-sm text-white/50 mb-4">Bir ürün/mekan fotoğrafı yükleyin, platformu seçin — Fotuber AI sizin için Türkçe açıklama ve hashtag üretsin.</p>

          <div className="grid md:grid-cols-2 gap-5">
            {/* Sol: giriş */}
            <div className="space-y-4">
              <input ref={aiImgRef} type="file" accept="image/*" hidden onChange={pickAiImage} data-testid="ai-image-input" />
              {!aiPreview ? (
                <button onClick={() => aiImgRef.current?.click()} data-testid="ai-upload-btn"
                  className="w-full h-40 rounded-xl border-2 border-dashed border-white/15 hover:border-fuchsia-400/50 bg-white/[0.02] flex flex-col items-center justify-center gap-2 text-white/50 transition-colors">
                  <ImageIcon size={26} /> <span className="text-sm">Fotoğraf yükle</span>
                </button>
              ) : (
                <div className="relative rounded-xl overflow-hidden border border-white/10">
                  <img src={aiPreview} alt="önizleme" className="w-full h-40 object-cover" data-testid="ai-image-preview" />
                  <button onClick={clearAiImage} className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 rounded-full p-1.5" data-testid="ai-image-clear"><X size={15} /></button>
                </div>
              )}

              <div>
                <label className="text-xs text-white/50 mb-1.5 block">Platform</label>
                <div className="flex flex-wrap gap-2" data-testid="ai-platforms">
                  {PLATFORMS.map((pl) => (
                    <button key={pl.key} onClick={() => setAiPlatform(pl.key)} data-testid={`ai-platform-${pl.key}`}
                      className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${aiPlatform === pl.key ? "bg-fuchsia-500 border-fuchsia-500 text-white" : "border-white/15 text-white/60 hover:border-white/30"}`}>
                      {pl.label}
                    </button>
                  ))}
                </div>
              </div>

              <textarea value={aiContext} onChange={(e) => setAiContext(e.target.value)} rows={3} data-testid="ai-context"
                placeholder="Ek bağlam (opsiyonel) — ör. düğün paketi kampanyası, %20 indirim, İstanbul stüdyo…"
                className="w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm outline-none focus:border-fuchsia-400" />

              <button onClick={generateAi} disabled={aiBusy || !aiFile} data-testid="ai-generate-btn"
                className="w-full h-11 rounded-lg bg-gradient-to-r from-fuchsia-500 to-sky-500 hover:opacity-90 disabled:opacity-40 font-semibold flex items-center justify-center gap-2">
                <Wand2 size={17} /> {aiBusy ? "Üretiliyor…" : "İçerik Üret"}
              </button>
            </div>

            {/* Sağ: sonuç */}
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 min-h-[16rem]" data-testid="ai-result">
              {aiBusy && <div className="h-full flex items-center justify-center text-white/50 text-sm">Fotuber AI düşünüyor…</div>}
              {!aiBusy && !aiResult && <div className="h-full flex items-center justify-center text-white/30 text-sm text-center px-4">Üretilen açıklama ve hashtag'ler burada görünecek.</div>}
              {!aiBusy && aiResult && (
                <div className="space-y-4">
                  {(aiResult.captions || []).map((c, i) => (
                    <div key={i} className="rounded-lg bg-white/[0.04] border border-white/10 p-3" data-testid={`ai-caption-${i}`}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs text-fuchsia-300 font-medium">Varyant {i + 1}</span>
                        <button onClick={() => copyText(c)} className="text-white/50 hover:text-white shrink-0" data-testid={`ai-caption-copy-${i}`}><Copy size={14} /></button>
                      </div>
                      <p className="text-sm mt-1 whitespace-pre-wrap">{c}</p>
                    </div>
                  ))}
                  {(aiResult.hashtags || []).length > 0 && (
                    <div className="rounded-lg bg-white/[0.04] border border-white/10 p-3" data-testid="ai-hashtags">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-sky-300 font-medium">Hashtag'ler</span>
                        <button onClick={() => copyText((aiResult.hashtags || []).join(" "))} className="text-white/50 hover:text-white" data-testid="ai-hashtags-copy"><Copy size={14} /></button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {aiResult.hashtags.map((h, i) => <span key={i} className="text-xs bg-sky-500/15 text-sky-200 px-2 py-0.5 rounded-full">{h}</span>)}
                      </div>
                    </div>
                  )}
                  {aiResult.tip && <p className="text-xs text-white/50 flex items-start gap-1.5"><Sparkles size={13} className="text-fuchsia-400 mt-0.5 shrink-0" /> {aiResult.tip}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Özel Gün Takvimi */}
      <div className={`max-w-5xl mx-auto px-5 pb-10 ${tab === "special" ? "" : "hidden"}`}>
        <div className="rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-500/[0.07] to-rose-500/[0.05] p-5" data-testid="media-special-panel">
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays className="text-amber-400" size={18} />
            <span className="font-semibold text-lg">Özel Gün Takvimi</span>
          </div>
          <p className="text-sm text-white/50 mb-4">Yaklaşan bir özel günü seçin — Fotuber AI, firmanızın logosuyla 3 farklı paylaşıma hazır görsel üretsin.</p>

          <div className="grid md:grid-cols-2 gap-5">
            {/* Sol: gün seçimi + ayarlar */}
            <div className="space-y-4">
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1" data-testid="special-days">
                {days.length === 0 && <p className="text-white/40 text-sm">Yükleniyor…</p>}
                {days.map((d) => (
                  <button key={d.date + d.name} onClick={() => { setSelDay(d); setSpImages([]); }} data-testid={`special-day-${d.date}`}
                    className={`w-full text-left flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${selDay?.date === d.date && selDay?.name === d.name ? "bg-amber-500/15 border-amber-400/50" : "border-white/10 hover:border-white/25"}`}>
                    <span className="text-xl">{d.emoji}</span>
                    <span className="flex-1 min-w-0"><span className="text-sm block truncate">{d.name}</span><span className="text-xs text-white/40">{d.label}</span></span>
                    <span className="text-xs text-amber-300 shrink-0">{d.days_left === 0 ? "Bugün" : `${d.days_left} gün`}</span>
                  </button>
                ))}
              </div>

              <div>
                <label className="text-xs text-white/50 mb-1.5 block">Format</label>
                <div className="flex gap-2">
                  <button onClick={() => setSpFormat("post")} data-testid="special-format-post" className={`text-sm px-3 py-1.5 rounded-full border ${spFormat === "post" ? "bg-amber-500 border-amber-500 text-white" : "border-white/15 text-white/60"}`}>Gönderi (1:1)</button>
                  <button onClick={() => setSpFormat("story")} data-testid="special-format-story" className={`text-sm px-3 py-1.5 rounded-full border ${spFormat === "story" ? "bg-amber-500 border-amber-500 text-white" : "border-white/15 text-white/60"}`}>Story (9:16)</button>
                </div>
              </div>

              <textarea value={spContext} onChange={(e) => setSpContext(e.target.value)} rows={2} data-testid="special-context"
                placeholder="Ek istek (opsiyonel) — ör. kampanya, renk tercihi, slogan…"
                className="w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm outline-none focus:border-amber-400" />

              <button onClick={genSpecial} disabled={spBusy || !selDay} data-testid="special-generate-btn"
                className="w-full h-11 rounded-lg bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-90 disabled:opacity-40 font-semibold flex items-center justify-center gap-2">
                {spBusy ? <><Loader2 size={17} className="animate-spin" /> Görseller üretiliyor…</> : <><Wand2 size={17} /> Logolu Görsel Üret</>}
              </button>
              {spBusy && <p className="text-xs text-white/40 text-center">Bu işlem 20-40 saniye sürebilir.</p>}
            </div>

            {/* Sağ: üretilen görseller */}
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 min-h-[16rem]" data-testid="special-result">
              {!spBusy && spImages.length === 0 && <div className="h-full flex items-center justify-center text-white/30 text-sm text-center px-4">Üretilen 3 görsel burada görünecek.</div>}
              {spBusy && <div className="h-full flex items-center justify-center text-white/50 text-sm">Fotuber AI görselleri hazırlıyor…</div>}
              {spImages.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  {spImages.map((im, i) => (
                    <div key={im.id} className="space-y-2" data-testid={`special-img-${i}`}>
                      <img src={im.data_url} alt={`görsel ${i + 1}`} className="w-full rounded-lg border border-white/10" />
                      <button onClick={() => downloadImg(im, i)} data-testid={`special-download-${i}`} className="w-full text-xs rounded-lg bg-white/10 hover:bg-white/20 py-1.5 flex items-center justify-center gap-1"><Download size={13} /> İndir</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* İçerik Geçmişi */}
      <div className={`max-w-5xl mx-auto px-5 pb-10 ${tab === "history" ? "" : "hidden"}`}>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5" data-testid="media-history-panel">
          <div className="flex items-center gap-2 mb-4">
            <History className="text-sky-400" size={18} />
            <span className="font-semibold text-lg">İçerik Geçmişi</span>
            <button onClick={() => { const nv = !favOnly; setFavOnly(nv); loadHistory(nv); }} data-testid="history-fav-filter"
              className={`ml-auto text-sm px-3 py-1.5 rounded-full border flex items-center gap-1.5 ${favOnly ? "bg-amber-500/15 border-amber-400/50 text-amber-200" : "border-white/15 text-white/60"}`}>
              <Star size={14} className={favOnly ? "fill-amber-300 text-amber-300" : ""} /> {favOnly ? "Favoriler" : "Tümü"}
            </button>
          </div>
          <div className="space-y-3">
            {history.length === 0 && <p className="text-white/40 text-sm py-6 text-center">{favOnly ? "Favori içerik yok." : "Henüz üretilmiş içerik yok."}</p>}
            {history.map((h) => (
              <div key={h.id} data-testid={`history-${h.id}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs bg-fuchsia-500/15 text-fuchsia-200 px-2 py-0.5 rounded-full">{h.platform_label}</span>
                  <span className="text-xs text-white/40">{(h.created_at || "").slice(0, 10)}</span>
                  <button onClick={() => toggleFav(h)} data-testid={`history-fav-${h.id}`} className="ml-auto text-white/50 hover:text-amber-300"><Star size={16} className={h.favorite ? "fill-amber-300 text-amber-300" : ""} /></button>
                  <button onClick={() => delHistory(h)} data-testid={`history-del-${h.id}`} className="text-red-400 hover:text-red-300"><Trash2 size={15} /></button>
                </div>
                <div className="space-y-2">
                  {(h.captions || []).map((c, i) => (
                    <div key={i} className="flex items-start justify-between gap-2 rounded-lg bg-white/[0.03] border border-white/10 p-2.5">
                      <p className="text-sm whitespace-pre-wrap flex-1">{c}</p>
                      <button onClick={() => copyText(c)} className="text-white/50 hover:text-white shrink-0"><Copy size={13} /></button>
                    </div>
                  ))}
                  {(h.hashtags || []).length > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="flex flex-wrap gap-1.5 flex-1">{h.hashtags.map((t, i) => <span key={i} className="text-xs bg-sky-500/15 text-sky-200 px-2 py-0.5 rounded-full">{t}</span>)}</div>
                      <button onClick={() => copyText(h.hashtags.join(" "))} className="text-white/50 hover:text-white shrink-0"><Copy size={13} /></button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
