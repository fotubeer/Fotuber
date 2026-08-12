import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Shirt, Upload, Check, X, Trash2, Pencil, Loader2, Clock, Download, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BE = process.env.REACT_APP_BACKEND_URL;
const CHUNK = 512 * 1024;

const authHeaders = () => {
  const st = localStorage.getItem("fotuber_studio_token");
  return st ? { Authorization: `Bearer ${st}` } : {};
};
const jget = async (path) => {
  const r = await fetch(`${BE}${path}`, { credentials: "include", headers: authHeaders() });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Hata");
  return r.json();
};
const jsend = async (path, method, body) => {
  const r = await fetch(`${BE}${path}`, {
    method, credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Hata");
  return r.json();
};

// Chunked upload of a File → returns upload_id.
async function uploadFileChunked(file, kind, onProgress) {
  const total = Math.max(1, Math.ceil(file.size / CHUNK));
  const initFd = new FormData();
  initFd.append("kind", kind);
  initFd.append("filename", file.name);
  initFd.append("total_chunks", String(total));
  const initR = await fetch(`${BE}/api/studio/uniforms/upload-init`, { method: "POST", credentials: "include", headers: authHeaders(), body: initFd });
  if (!initR.ok) throw new Error("Yükleme başlatılamadı");
  const { upload_id } = await initR.json();
  for (let i = 0; i < total; i++) {
    const blob = file.slice(i * CHUNK, (i + 1) * CHUNK);
    const fd = new FormData();
    fd.append("index", String(i));
    fd.append("chunk", blob, file.name);
    const cr = await fetch(`${BE}/api/studio/uniforms/upload-chunk/${upload_id}`, { method: "POST", credentials: "include", headers: authHeaders(), body: fd });
    if (!cr.ok) throw new Error("Parça yüklenemedi");
    onProgress && onProgress(Math.round(((i + 1) / total) * 100));
  }
  const comp = await fetch(`${BE}/api/studio/uniforms/upload-complete/${upload_id}`, { method: "POST", credentials: "include", headers: authHeaders() });
  if (!comp.ok) throw new Error("Yükleme tamamlanamadı");
  return upload_id;
}

export const UniformLibrary = ({ onApplyUniform, applyingUniform }) => {
  const [items, setItems] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [openForm, setOpenForm] = useState(false);
  const [name, setName] = useState("");
  const [pngFile, setPngFile] = useState(null);
  const [psdFile, setPsdFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(0);

  const load = useCallback(async () => {
    try { const r = await jget("/api/studio/uniforms"); setItems(r.items || []); setIsAdmin(!!r.is_admin); } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!name.trim()) { toast.error("Üniforma adı girin"); return; }
    if (!pngFile) { toast.error("PNG dosyası (saydam üniforma) gerekli"); return; }
    setBusy(true); setProg(0);
    try {
      const pngId = await uploadFileChunked(pngFile, "png", setProg);
      let psdId = null;
      if (psdFile) psdId = await uploadFileChunked(psdFile, "psd", setProg);
      const res = await jsend("/api/studio/uniforms", "POST", { name: name.trim(), png_upload_id: pngId, psd_upload_id: psdId });
      toast.success(res.pending ? "Üniforma gönderildi — admin onayı bekleniyor" : "Üniforma yayınlandı");
      setName(""); setPngFile(null); setPsdFile(null); setOpenForm(false);
      load();
    } catch (e) { toast.error(e.message || "Yükleme başarısız"); }
    finally { setBusy(false); setProg(0); }
  };

  const doAction = async (id, action) => {
    try {
      if (action === "approve") await jsend(`/api/studio/uniforms/${id}/approve`, "POST");
      if (action === "reject") await jsend(`/api/studio/uniforms/${id}/reject`, "POST");
      if (action === "delete") { if (!window.confirm("Üniforma silinsin mi?")) return; await jsend(`/api/studio/uniforms/${id}`, "DELETE"); }
      if (action === "rename") {
        const nn = window.prompt("Yeni ad:");
        if (!nn) return;
        await jsend(`/api/studio/uniforms/${id}`, "PATCH", { name: nn });
      }
      load();
    } catch (e) { toast.error(e.message || "İşlem başarısız"); }
  };

  const pending = items.filter((i) => i.status === "pending");
  const approved = items.filter((i) => i.status === "approved");

  const Card = ({ u }) => (
    <div data-testid={`uniform-card-${u.id}`} className="rounded-xl border border-slate-200 bg-white overflow-hidden group">
      <div className="aspect-[3/4] bg-[conic-gradient(at_50%_50%,#f1f5f9_25%,#e2e8f0_0_50%,#f1f5f9_0_75%,#e2e8f0_0)] bg-[length:16px_16px] grid place-items-center relative">
        <img src={`${BE}${u.png_url}`} alt={u.name} className="max-h-full max-w-full object-contain" crossOrigin="anonymous" />
        {u.status === "pending" && <span className="absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500 text-white font-semibold flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" /> Onay bekliyor</span>}
        {u.status === "rejected" && <span className="absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded-full bg-red-500 text-white font-semibold">Reddedildi</span>}
      </div>
      <div className="p-2">
        <div className="text-xs font-medium text-slate-800 truncate" title={u.name}>{u.name}</div>
        <div className="text-[10px] text-slate-400 truncate">{u.uploader_name}</div>
        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
          {u.status === "approved" && onApplyUniform && (
            <button data-testid={`uniform-apply-${u.id}`} onClick={() => onApplyUniform(u.id)} disabled={applyingUniform === u.id}
              className="text-[10px] inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-fuchsia-600 text-white hover:bg-fuchsia-700 disabled:opacity-60">
              {applyingUniform === u.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Sparkles className="w-2.5 h-2.5" />} AI Giydir
            </button>
          )}
          {u.has_psd && (
            <a href={`${BE}${u.psd_url}`} data-testid={`uniform-psd-${u.id}`} className="text-[10px] inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200"><Download className="w-2.5 h-2.5" /> PSD</a>
          )}
          {isAdmin && (
            <>
              {u.status !== "approved" && <button data-testid={`uniform-approve-${u.id}`} onClick={() => doAction(u.id, "approve")} title="Onayla" className="p-1 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100"><Check className="w-3 h-3" /></button>}
              {u.status === "pending" && <button data-testid={`uniform-reject-${u.id}`} onClick={() => doAction(u.id, "reject")} title="Reddet" className="p-1 rounded bg-amber-50 text-amber-600 hover:bg-amber-100"><X className="w-3 h-3" /></button>}
              <button data-testid={`uniform-rename-${u.id}`} onClick={() => doAction(u.id, "rename")} title="Adı düzenle" className="p-1 rounded bg-slate-50 text-slate-500 hover:bg-slate-100"><Pencil className="w-3 h-3" /></button>
              <button data-testid={`uniform-delete-${u.id}`} onClick={() => doAction(u.id, "delete")} title="Sil" className="p-1 rounded bg-red-50 text-red-500 hover:bg-red-100"><Trash2 className="w-3 h-3" /></button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="border border-slate-200 rounded-2xl bg-white" data-testid="uniform-library">
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-900 grid place-items-center"><Shirt className="w-4 h-4 text-white" /></div>
          <div>
            <div className="font-semibold text-slate-900 text-sm">Askeri Kıyafet Kütüphanesi</div>
            <div className="text-[11px] text-slate-400">{approved.length} yayında{isAdmin && pending.length ? ` · ${pending.length} onay bekliyor` : ""}</div>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpenForm((v) => !v)} data-testid="uniform-toggle-form" className="gap-1 text-xs">
          <Upload className="w-3.5 h-3.5" /> Yeni {openForm ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </Button>
      </div>

      {openForm && (
        <div className="p-4 border-b border-slate-100 bg-slate-50/60 space-y-2" data-testid="uniform-form">
          <p className="text-[11px] text-slate-500">
            {isAdmin ? "Yüklediğiniz üniforma anında yayınlanır." : "Yüklediğiniz üniforma admin onayından sonra tüm panellerde görünür."} PNG saydam arka planlı olmalı; PSD isteğe bağlıdır (Photoshop için).
          </p>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Üniforma adı (örn. Piyade Er)" className="h-9 text-sm" data-testid="uniform-name" />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              <span className="block text-slate-500 mb-1">PNG (zorunlu)</span>
              <input type="file" accept="image/png" onChange={(e) => setPngFile(e.target.files?.[0] || null)} data-testid="uniform-png" className="text-[11px]" />
              {pngFile && <span className="block text-[10px] text-emerald-600 mt-0.5 truncate">{pngFile.name}</span>}
            </label>
            <label className="text-xs">
              <span className="block text-slate-500 mb-1">PSD (opsiyonel)</span>
              <input type="file" accept=".psd,image/vnd.adobe.photoshop" onChange={(e) => setPsdFile(e.target.files?.[0] || null)} data-testid="uniform-psd-input" className="text-[11px]" />
              {psdFile && <span className="block text-[10px] text-emerald-600 mt-0.5 truncate">{psdFile.name}</span>}
            </label>
          </div>
          <Button onClick={submit} disabled={busy} className="w-full h-9 bg-slate-900 hover:bg-slate-800 gap-2" data-testid="uniform-submit">
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor %{prog}</> : <><Upload className="w-4 h-4" /> Yükle</>}
          </Button>
        </div>
      )}

      <div className="p-4">
        {items.length === 0 ? (
          <div className="text-center text-xs text-slate-400 py-6" data-testid="uniform-empty">Henüz üniforma yok. İlk üniformayı yükleyin.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid="uniform-grid">
            {[...pending, ...approved, ...items.filter((i) => i.status === "rejected")].map((u) => <Card key={u.id} u={u} />)}
          </div>
        )}
      </div>
    </div>
  );
};

export default UniformLibrary;
