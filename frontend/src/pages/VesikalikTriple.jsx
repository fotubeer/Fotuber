import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Upload, Sparkles, Trash2, Images, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { api, formatApiError } from "@/lib/api";

const BE = process.env.REACT_APP_BACKEND_URL;
const GARMENTS = [["shirt", "Gömlek"], ["tshirt", "Tişört"], ["polo", "Polo"], ["blouse", "Bluz"], ["blazer", "Ceket"]];

const emptySlot = () => ({ file: null, preview: null, base64: null, gender: "male", garment: "shirt", color_name: "Lacivert" });

export default function VesikalikTriple() {
  const [slots, setSlots] = useState([emptySlot(), emptySlot(), emptySlot()]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState([]);
  const [archive, setArchive] = useState([]);

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
    const items = slots.filter((s) => s.base64).map((s) => ({
      image_base64: s.base64, gender: s.gender, garment: s.garment, color_name: s.color_name,
    }));
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

  return (
    <div data-testid="vesikalik-triple" className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <Sparkles className="text-amber-400" size={24} />
          <h1 className="text-2xl font-semibold">3'lü İşleme</h1>
        </div>
        <p className="text-sm text-slate-400 mb-6">3 fotoğrafı aynı anda, birbirinden bağımsız işleyin. Sonuçlar firma arşivine otomatik kaydedilir (son 20).</p>

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
                        <button data-testid={`vt-dl-${i}`} onClick={() => dl(`data:${results[i].mime_type};base64,${results[i].image_base64}`, `vesikalik-${i + 1}.png`)} className="absolute bottom-1 right-1 bg-black/60 rounded-full p-1.5"><Download size={13} /></button>
                      </div>
                    : <div className="text-[11px] text-red-300 p-2">Hata: {results[i].error}</div>}
                </div>
              )}
            </div>
          ))}
        </div>

        <Button data-testid="vt-process-btn" onClick={process} disabled={busy}
          className="mt-4 gap-2 bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold">
          {busy ? <><Loader2 size={18} className="animate-spin" /> İşleniyor…</> : <><Sparkles size={18} /> 3'ünü Aynı Anda İşle</>}
        </Button>

        {/* Firm archive */}
        <div className="mt-10">
          <div className="flex items-center gap-2 mb-3"><Images size={18} className="text-amber-400" /><h2 className="text-lg font-semibold">Firma Arşivi</h2><span className="text-xs text-slate-500">(son 20)</span></div>
          {archive.length === 0 ? <p className="text-slate-500 text-sm">Arşiv boş.</p> : (
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-2">
              {archive.map((a) => (
                <div key={a.id} data-testid={`vt-archive-${a.id}`} className="relative group aspect-[4/5] rounded-lg overflow-hidden bg-slate-800">
                  <img src={`${BE}${a.url}`} alt="" className="w-full h-full object-cover" />
                  <button data-testid={`vt-archive-del-${a.id}`} onClick={() => delArchive(a.id)} className="absolute top-1 right-1 bg-black/60 rounded-full p-1 opacity-0 group-hover:opacity-100"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
