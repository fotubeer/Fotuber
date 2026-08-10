import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import JSZip from "jszip";
import { Loader2, Upload, Sparkles, Trash2, Images, X, Download, FolderDown, Printer, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { api, formatApiError } from "@/lib/api";
import { PHOTO_SPECS } from "@/lib/passportSpecs";
import { printMultiSheet, tilePhotoToSheets } from "@/lib/printImage";

const BE = process.env.REACT_APP_BACKEND_URL;
const GARMENTS = [["shirt", "Gömlek"], ["tshirt", "Tişört"], ["polo", "Polo"], ["blouse", "Bluz"], ["blazer", "Ceket"]];
const COUNTS = [1, 2, 4, 6, 8];
const specByLabel = (label) => PHOTO_SPECS.find((p) => p.label === label);

const emptySlot = () => ({ file: null, preview: null, base64: null, gender: "male", garment: "shirt", color_name: "Lacivert", spec: "tr-bio", count: 4 });

export default function VesikalikTriple() {
  const [slots, setSlots] = useState([emptySlot(), emptySlot(), emptySlot()]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState([]);
  const [archive, setArchive] = useState([]);
  const [zipBusy, setZipBusy] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);

  const loadArchive = useCallback(async () => {
    try { setArchive((await api.get("/vesikalik/archive")).data); } catch {}
  }, []);
  useEffect(() => { loadArchive(); }, [loadArchive]);

  const setSlot = (i, patch) => setSlots((s) => s.map((x, idx) => idx === i ? { ...x, ...patch } : x));

  const pick = (i) => (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setSlot(i, { file: f, preview: reader.result, base64: reader.result });
    reader.readAsDataURL(f);
  };

  const process = async () => {
    const items = slots.filter((s) => s.base64).map((s) => {
      const spec = PHOTO_SPECS.find((p) => p.code === s.spec);
      return {
        image_base64: s.base64, gender: s.gender, garment: s.garment, color_name: s.color_name,
        photo_type: spec?.label || "", print_pref: `${s.count}'li`,
      };
    });
    if (items.length === 0) { toast.error("En az bir fotoğraf yükleyin"); return; }
    setBusy(true); setResults([]);
    try {
      const { data } = await api.post("/vesikalik/ai-edit-triple", { items, save_to_archive: true });
      setResults(data.results || []);
      toast.success(`${data.success}/${data.total} fotoğraf işlendi (paralel)`);
      loadArchive();
    } catch (e) {
      toast.error(formatApiError(e, "İşleme başarısız"));
    } finally { setBusy(false); }
  };

  const delArchive = async (id) => {
    await api.delete(`/vesikalik/archive/${id}`); loadArchive();
  };

  const dl = (dataUrl, name) => {
    const a = document.createElement("a"); a.href = dataUrl; a.download = name; a.click();
  };

  // Build tiled sheets for a processed result using its slot's spec + count
  const sheetsForResult = async (idx) => {
    const r = results[idx]; const s = slots[idx];
    if (!r?.ok) return [];
    const spec = PHOTO_SPECS.find((p) => p.code === s.spec) || PHOTO_SPECS[0];
    return tilePhotoToSheets(`data:${r.mime_type};base64,${r.image_base64}`, {
      photoWmm: spec.w, photoHmm: spec.h, count: s.count,
    });
  };

  // Batch print: one combined multi-page job with every person's sheets
  const printBatch = async () => {
    const ok = results.filter((r) => r?.ok);
    if (!ok.length) { toast.error("Baskıya hazır sonuç yok"); return; }
    setPrintBusy(true);
    try {
      let all = [];
      for (let i = 0; i < results.length; i++) {
        if (results[i]?.ok) all = all.concat(await sheetsForResult(i));
      }
      const done = printMultiSheet(all, { widthMm: 100, heightMm: 150, title: "Toplu Vesikalık Baskı" });
      if (!done) toast.error("Baskı penceresi açılamadı — açılır pencere iznini verin");
      else toast.success(`${all.length} sayfa baskıya hazırlandı`);
    } finally { setPrintBusy(false); }
  };

  // Per-person print: separate print dialog for a single result
  const printPerson = async (idx) => {
    setPrintBusy(true);
    try {
      const sheets = await sheetsForResult(idx);
      const done = printMultiSheet(sheets, { widthMm: 100, heightMm: 150, title: `Kişi ${idx + 1} Baskı` });
      if (!done) toast.error("Baskı penceresi açılamadı");
    } finally { setPrintBusy(false); }
  };

  // Reprint an archived photo (Tekrar Baskı)
  const reprintArchive = async (a) => {
    setPrintBusy(true);
    try {
      const res = await fetch(`${BE}${a.url}`, { credentials: "include" });
      const blob = await res.blob();
      const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      const spec = specByLabel(a.photo_type) || PHOTO_SPECS[0];
      const count = parseInt((a.print_pref || "4").replace(/\D/g, ""), 10) || 4;
      const sheets = await tilePhotoToSheets(dataUrl, { photoWmm: spec.w, photoHmm: spec.h, count });
      const done = printMultiSheet(sheets, { widthMm: 100, heightMm: 150, title: "Tekrar Baskı" });
      if (!done) toast.error("Baskı penceresi açılamadı");
    } catch (e) {
      toast.error("Tekrar baskı başarısız");
    } finally { setPrintBusy(false); }
  };

  const downloadArchiveZip = async () => {
    if (archive.length === 0) { toast.error("Arşiv boş"); return; }
    setZipBusy(true);
    try {
      const zip = new JSZip();
      let n = 1;
      for (const a of archive) {
        const res = await fetch(`${BE}${a.url}`, { credentials: "include" });
        const blob = await res.blob();
        zip.file(`vesikalik-arsiv-${String(n).padStart(2, "0")}.png`, blob);
        n += 1;
      }
      const out = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(out);
      const link = document.createElement("a");
      link.href = url; link.download = `firma-arsivi-${new Date().toISOString().slice(0, 10)}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`${archive.length} fotoğraf ZIP olarak indirildi`);
    } catch (e) {
      toast.error("ZIP indirme başarısız");
    } finally { setZipBusy(false); }
  };

  const anyResult = results.some((r) => r?.ok);

  return (
    <div data-testid="vesikalik-triple" className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <Sparkles className="text-amber-400" size={24} />
          <h1 className="text-2xl font-semibold">3'lü İşleme</h1>
        </div>
        <p className="text-sm text-slate-400 mb-6">3 fotoğrafı aynı anda, birbirinden bağımsız işleyin. Her fotoğraf için ayrı tür ve baskı adedi seçin. Sonuçlar firma arşivine otomatik kaydedilir (son 20).</p>

        <div className="grid sm:grid-cols-3 gap-4">
          {slots.map((s, i) => (
            <div key={i} data-testid={`vt-slot-${i}`} className="rounded-2xl border border-slate-800 bg-slate-900 p-3 space-y-2">
              <div className="aspect-[4/5] rounded-xl bg-slate-800/60 overflow-hidden grid place-items-center relative">
                {s.preview
                  ? <img src={s.preview} alt="" className="w-full h-full object-cover" />
                  : <span className="text-slate-500 text-xs">Fotoğraf {i + 1}</span>}
                {s.preview && <button data-testid={`vt-clear-${i}`} onClick={() => setSlot(i, emptySlot())} className="absolute top-1 right-1 bg-black/60 rounded-full p-1"><X size={13} /></button>}
              </div>
              <label className="block">
                <input data-testid={`vt-upload-${i}`} type="file" accept="image/*" hidden onChange={pick(i)} />
                <span className="flex items-center justify-center gap-1 text-xs py-2 rounded-lg bg-slate-800 hover:bg-slate-700 cursor-pointer"><Upload size={13} /> Yükle</span>
              </label>
              {/* Per-photo TYPE (format) + print count — independent per slot */}
              <div className="grid grid-cols-2 gap-1.5">
                <Select value={s.spec} onValueChange={(v) => setSlot(i, { spec: v })}>
                  <SelectTrigger data-testid={`vt-spec-${i}`} className="h-8 text-xs bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64">{PHOTO_SPECS.map((p) => <SelectItem key={p.code} value={p.code}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={String(s.count)} onValueChange={(v) => setSlot(i, { count: parseInt(v, 10) })}>
                  <SelectTrigger data-testid={`vt-count-${i}`} className="h-8 text-xs bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent>{COUNTS.map((c) => <SelectItem key={c} value={String(c)}>{c} adet</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <Select value={s.gender} onValueChange={(v) => setSlot(i, { gender: v })}>
                  <SelectTrigger data-testid={`vt-gender-${i}`} className="h-8 text-xs bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="male">Erkek</SelectItem><SelectItem value="female">Kadın</SelectItem></SelectContent>
                </Select>
                <Select value={s.garment} onValueChange={(v) => setSlot(i, { garment: v })}>
                  <SelectTrigger data-testid={`vt-garment-${i}`} className="h-8 text-xs bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent>{GARMENTS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Input data-testid={`vt-color-${i}`} value={s.color_name} onChange={(e) => setSlot(i, { color_name: e.target.value })} placeholder="Renk (örn. Lacivert)" className="h-8 text-xs bg-slate-800 border-slate-700" />
              {results[i] && (
                <div className={`rounded-lg overflow-hidden ${results[i].ok ? "" : "border border-red-500/40"}`}>
                  {results[i].ok
                    ? <div className="relative">
                        <img src={`data:${results[i].mime_type};base64,${results[i].image_base64}`} alt="sonuç" className="w-full" />
                        <div className="absolute bottom-1 right-1 flex gap-1">
                          <button data-testid={`vt-print-${i}`} title="Kişi bazlı baskı" onClick={() => printPerson(i)} className="bg-black/60 rounded-full p-1.5"><Printer size={13} /></button>
                          <button data-testid={`vt-dl-${i}`} onClick={() => dl(`data:${results[i].mime_type};base64,${results[i].image_base64}`, `vesikalik-${i + 1}.png`)} className="bg-black/60 rounded-full p-1.5"><Download size={13} /></button>
                        </div>
                      </div>
                    : <div className="text-[11px] text-red-300 p-2">Hata: {results[i].error}</div>}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button data-testid="vt-process-btn" onClick={process} disabled={busy}
            className="gap-2 bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold">
            {busy ? <><Loader2 size={18} className="animate-spin" /> İşleniyor…</> : <><Sparkles size={18} /> 3'ünü Aynı Anda İşle</>}
          </Button>
          {anyResult && (
            <Button data-testid="vt-batch-print-btn" onClick={printBatch} disabled={printBusy}
              className="gap-2 bg-blue-600 hover:bg-blue-700">
              {printBusy ? <><Loader2 size={18} className="animate-spin" /> Hazırlanıyor…</> : <><Printer size={18} /> Toplu Baskıya Hazırla</>}
            </Button>
          )}
        </div>

        {/* Firm archive */}
        <div className="mt-10">
          <div className="flex items-center gap-2 mb-3"><Images size={18} className="text-amber-400" /><h2 className="text-lg font-semibold">Firma Arşivi</h2><span className="text-xs text-slate-500">(son 20, firma geneli)</span>
            {archive.length > 0 && (
              <Button data-testid="vt-archive-zip-btn" onClick={downloadArchiveZip} disabled={zipBusy}
                size="sm" className="ml-auto gap-1.5 h-8 bg-slate-800 hover:bg-slate-700 text-slate-100">
                {zipBusy ? <><Loader2 size={14} className="animate-spin" /> Hazırlanıyor…</> : <><FolderDown size={14} /> Arşivi İndir (ZIP)</>}
              </Button>
            )}
          </div>
          {archive.length === 0 ? <p className="text-slate-500 text-sm">Arşiv boş.</p> : (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              {archive.map((a) => (
                <div key={a.id} data-testid={`vt-archive-${a.id}`} className="rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
                  <div className="relative group aspect-[4/5] bg-slate-800">
                    <img src={`${BE}${a.url}`} alt="" className="w-full h-full object-cover" />
                    <button data-testid={`vt-archive-del-${a.id}`} onClick={() => delArchive(a.id)} className="absolute top-1 right-1 bg-black/60 rounded-full p-1 opacity-0 group-hover:opacity-100"><Trash2 size={12} /></button>
                  </div>
                  <div className="p-2 space-y-1">
                    {a.photo_type && <div className="text-[10px] text-slate-300 truncate">{a.photo_type}{a.print_pref ? ` · ${a.print_pref}` : ""}</div>}
                    {a.staff_name && <div className="text-[10px] text-slate-500 flex items-center gap-1"><User size={9} /> {a.staff_name}</div>}
                    <Button data-testid={`vt-archive-reprint-${a.id}`} onClick={() => reprintArchive(a)} disabled={printBusy}
                      size="sm" className="w-full h-7 gap-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-100">
                      <Printer size={12} /> Tekrar Baskı
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
