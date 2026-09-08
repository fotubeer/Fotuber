import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Archive, Search, Download, QrCode, Trash2, Clock, Loader2, X, Copy, MessageCircle } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const BE = process.env.REACT_APP_BACKEND_URL;

const authHeaders = () => {
  const st = localStorage.getItem("fotuber_studio_token");
  return st ? { Authorization: `Bearer ${st}` } : {};
};
const jget = async (path) => {
  const r = await fetch(`${BE}${path}`, { credentials: "include", headers: authHeaders() });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Hata");
  return r.json();
};
const jsend = async (path, method) => {
  const r = await fetch(`${BE}${path}`, { method, credentials: "include", headers: authHeaders() });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Hata");
  return r.json();
};

const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" }); } catch { return "-"; } };

export const VesikalikArchive = () => {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [qrUrl, setQrUrl] = useState("");

  const load = useCallback(async (query = "") => {
    setLoading(true);
    try { const r = await jget(`/api/studio/vesikalik/archive?q=${encodeURIComponent(query)}`); setItems(r.items || []); }
    catch (e) { toast.error(e.message || "Arşiv yüklenemedi"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(""); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => load(q), 350); // debounce
    return () => clearTimeout(t);
  }, [q, load]);

  const reprint = async (it) => {
    // Saklanan yüksek çözünürlüklü dosyayı indir (yeniden baskı için).
    try {
      const r = await fetch(`${BE}/api/studio/vesikalik/archive/${it.id}/file`, { credentials: "include", headers: authHeaders() });
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${it.code || it.client_name || "fotograf"}.png`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("İndirilemedi"); }
  };

  const relink = async (it) => {
    try {
      const r = await jsend(`/api/studio/vesikalik/archive/${it.id}/relink`, "POST");
      setQrUrl(`${BE}${r.path}`);
      load(q);
    } catch (e) { toast.error(e.message || "QR bağlantısı alınamadı"); }
  };

  const del = async (it) => {
    if (!window.confirm(`${it.client_name || "Kayıt"} arşivden silinsin mi?`)) return;
    try { await jsend(`/api/studio/vesikalik/archive/${it.id}`, "DELETE"); load(q); } catch { toast.error("Silinemedi"); }
  };

  const normalizePhone = (p) => {
    let d = (p || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.startsWith("0")) d = d.slice(1);
    if (d.length === 10) d = "90" + d; // TR yerel 10 hane → +90
    return d;
  };
  const whatsapp = async (it) => {
    let url = "";
    try { const r = await jsend(`/api/studio/vesikalik/archive/${it.id}/relink`, "POST"); url = `${BE}${r.path}`; load(q); }
    catch { toast.error("Bağlantı alınamadı"); return; }
    const phone = normalizePhone(it.phone);
    const text = encodeURIComponent(`Merhaba${it.client_name ? " " + it.client_name : ""}, vesikalık fotoğrafınızı buradan indirebilirsiniz (24 saat geçerli): ${url}`);
    window.open(phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`, "_blank");
  };

  return (
    <div className="border border-slate-200 rounded-2xl bg-white" data-testid="vesikalik-archive">
      <div className="flex items-center gap-2 p-4 border-b border-slate-100">
        <div className="w-8 h-8 rounded-lg bg-emerald-600 grid place-items-center"><Archive className="w-4 h-4 text-white" /></div>
        <div className="flex-1">
          <div className="font-semibold text-slate-900 text-sm">Müşteri Arşivi (6 ay)</div>
          <div className="text-[11px] text-slate-400">Ad / telefon ile arayın, yeniden baskı veya QR alın.</div>
        </div>
      </div>

      <div className="p-4">
        <div className="relative mb-3">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad, telefon veya kod ara…" className="h-9 pl-8 text-sm" data-testid="archive-search" />
        </div>

        {loading ? (
          <div className="py-6 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
        ) : items.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400" data-testid="archive-empty">{q ? "Sonuç bulunamadı." : "Henüz arşiv kaydı yok. QR ile teslim ettikçe burada listelenir."}</div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto" data-testid="archive-list">
            {items.map((it) => (
              <div key={it.id} data-testid={`archive-item-${it.id}`} className="flex items-center gap-3 rounded-xl border border-slate-100 p-2 hover:border-slate-200">
                <img src={`${BE}${it.thumb_url}`} alt="" className="w-10 h-12 object-cover rounded bg-slate-100" crossOrigin="anonymous" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 truncate">{it.client_name || "İsimsiz"}</div>
                  <div className="text-[11px] text-slate-400 truncate">{it.phone || "—"} · {it.spec_label || ""} · {fmtDate(it.created_at)}</div>
                  <div className={`text-[10px] inline-flex items-center gap-0.5 mt-0.5 ${it.link_expired ? "text-red-500" : "text-emerald-600"}`}><Clock className="w-2.5 h-2.5" /> {it.link_expired ? "QR süresi doldu" : "QR aktif"}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => reprint(it)} data-testid={`archive-reprint-${it.id}`} title="Yeniden baskı (indir)" className="p-1.5 rounded bg-slate-50 text-slate-600 hover:bg-slate-100"><Download className="w-3.5 h-3.5" /></button>
                  <button onClick={() => whatsapp(it)} data-testid={`archive-whatsapp-${it.id}`} title="WhatsApp ile gönder" className="p-1.5 rounded bg-green-50 text-green-600 hover:bg-green-100"><MessageCircle className="w-3.5 h-3.5" /></button>
                  <button onClick={() => relink(it)} data-testid={`archive-relink-${it.id}`} title="QR bağlantısı al (24s)" className="p-1.5 rounded bg-fuchsia-50 text-fuchsia-600 hover:bg-fuchsia-100"><QrCode className="w-3.5 h-3.5" /></button>
                  <button onClick={() => del(it)} data-testid={`archive-del-${it.id}`} title="Sil" className="p-1.5 rounded bg-red-50 text-red-500 hover:bg-red-100"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {qrUrl && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm grid place-items-center p-4" data-testid="archive-qr-modal" onClick={() => setQrUrl("")}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setQrUrl("")} data-testid="archive-qr-close" className="absolute top-3 right-3 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            <div className="text-xs font-semibold text-fuchsia-600">YENİ QR BAĞLANTISI</div>
            <h3 className="text-lg font-bold text-slate-900 mt-1">Müşteri Tekrar İndirebilir</h3>
            <div className="my-4 flex justify-center"><div className="p-3 bg-white rounded-xl border border-slate-200"><QRCodeCanvas value={qrUrl} size={200} level="M" includeMargin data-testid="archive-qr-canvas" /></div></div>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
              <span className="text-[11px] text-slate-600 truncate flex-1 text-left">{qrUrl}</span>
              <button onClick={() => { navigator.clipboard?.writeText(qrUrl); toast.success("Kopyalandı"); }} className="text-slate-500 hover:text-fuchsia-600 shrink-0"><Copy className="w-4 h-4" /></button>
            </div>
            <p className="text-[11px] text-amber-600 mt-3">⏱️ 24 saat geçerlidir.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default VesikalikArchive;
