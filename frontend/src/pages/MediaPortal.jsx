import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Aperture, LogOut, Upload, Download, Trash2, Image as ImageIcon, Building2, LogIn } from "lucide-react";

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
    </div>
  );
}
