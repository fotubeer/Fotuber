import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Camera, Upload, Download, Trash2, ImageIcon, Printer, RotateCw, ZoomIn, ZoomOut, Sparkles, ScanFace, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PHOTO_SPECS, PAPER_SIZES, suggestPaper, COUNT_PRESETS } from "@/lib/passportSpecs";
import { detectBiometricCrop, loadFaceModels } from "@/lib/faceDetect";

// IndexedDB helpers for last-10 archive
const DB_NAME = "fotuber_vesikalik";
const STORE = "archive";
const openDb = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB_NAME, 1);
  r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: "id" }); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const idbPut = async (rec) => { const db = await openDb(); return new Promise((res, rej) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(rec); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); };
const idbAll = async () => { const db = await openDb(); return new Promise((res, rej) => { const tx = db.transaction(STORE, "readonly"); const req = tx.objectStore(STORE).getAll(); req.onsuccess = () => res(req.result || []); req.onerror = () => rej(req.error); }); };
const idbDel = async (id) => { const db = await openDb(); return new Promise((res, rej) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete(id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); };

// Auto-increment code helper
const nextCode = (prev) => {
  if (!prev) return "FTB00001";
  const m = prev.match(/^([A-Za-z]+)(\d+)$/);
  if (!m) return prev + "1";
  const n = String(parseInt(m[2], 10) + 1).padStart(m[2].length, "0");
  return m[1] + n;
};

const MM_PER_INCH = 25.4;
const DPI = 300; // print DPI
const mmToPx = (mm) => Math.round((mm / MM_PER_INCH) * DPI);

const AdminPassportPhoto = () => {
  const [specCode, setSpecCode] = useState("tr-bio");
  const [count, setCount] = useState(6);
  const [paperCode, setPaperCode] = useState(""); // auto if empty
  const [image, setImage] = useState(null); // {src, w, h, el}
  const [crop, setCrop] = useState({ cx: 0, cy: 0, w: 0 }); // pixel-space center + width
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [detecting, setDetecting] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);
  const [adj, setAdj] = useState({ brightness: 100, contrast: 100, saturation: 100, warmth: 0, sharpness: 0, retouch: false });
  const [cutColor, setCutColor] = useState("#000000");
  const [cutWidth, setCutWidth] = useState(0.5); // mm
  const [watermark, setWatermark] = useState(null); // dataUrl
  const [code, setCode] = useState(() => localStorage.getItem("fotuber_last_code") || "FTB00001");
  const [archive, setArchive] = useState([]);
  const [dragging, setDragging] = useState(false);
  const singleCanvasRef = useRef(null);
  const sheetCanvasRef = useRef(null);
  const wrapRef = useRef(null);

  const spec = useMemo(() => PHOTO_SPECS.find((s) => s.code === specCode), [specCode]);
  const layout = useMemo(() => suggestPaper(spec, count), [spec, count]);
  const paper = useMemo(() => (paperCode ? PAPER_SIZES.find((p) => p.code === paperCode) : layout.paper), [paperCode, layout]);

  useEffect(() => { idbAll().then(setArchive); }, []);
  // Warm up face-api models in the background so the first detection feels instant
  useEffect(() => { loadFaceModels().catch(() => {}); }, []);

  const cssFilter = () => {
    // warmth: -50..50 (kelvin proxy)
    const w = adj.warmth;
    const hueRotate = 0;
    return `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%) sepia(${Math.max(0, w) * 0.6}%) hue-rotate(${hueRotate}deg)`;
  };

  const onFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) { toast.error("Lütfen bir görsel dosya seçin"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        setImage({ src: reader.result, w: img.width, h: img.height, el: img });
        // Default crop: center of image, width = 70% of the shorter side (so it fits inside)
        const shortSide = Math.min(img.width, img.height);
        const defaultW = shortSide * 0.7;
        setCrop({ cx: img.width / 2, cy: img.height / 2, w: defaultW });
        setAutoDetected(false);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }, []);

  const runAutoDetect = useCallback(async () => {
    if (!image?.el || !spec) { toast.error("Önce fotoğraf yükleyin"); return; }
    setDetecting(true);
    try {
      const res = await detectBiometricCrop(image.el, spec);
      if (!res.ok) { toast.error(res.message || "Otomatik tespit başarısız"); return; }
      // Clamp inside image bounds
      const halfW = res.w / 2;
      const halfH = (res.w * spec.h / spec.w) / 2;
      const cx = Math.min(Math.max(res.cx, halfW), image.w - halfW);
      const cy = Math.min(Math.max(res.cy, halfH), image.h - halfH);
      setCrop({ cx, cy, w: res.w });
      setAutoDetected(true);
      toast.success("Yüz tespit edildi, çerçeveleme uygulandı");
    } catch (e) {
      toast.error("Model yüklenemedi. İnternet bağlantınızı kontrol edin.");
    } finally {
      setDetecting(false);
    }
  }, [image, spec]);

  // Auto-run detection once the image finishes loading (fire-and-forget)
  useEffect(() => {
    if (image?.el && !autoDetected) {
      runAutoDetect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  const onDrop = (e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0]); };

  // Draw the single cropped biometric photo to a canvas
  const drawSingle = useCallback(() => {
    if (!image || !singleCanvasRef.current || !spec || !crop.w) return null;
    const canvas = singleCanvasRef.current;
    const targetW = mmToPx(spec.w);
    const targetH = mmToPx(spec.h);
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    // Background
    ctx.fillStyle = spec.bg;
    ctx.fillRect(0, 0, targetW, targetH);
    // Pixel-space source rect from crop
    const cropW = crop.w;
    const cropH = crop.w * (spec.h / spec.w);
    const sx = crop.cx - cropW / 2;
    const sy = crop.cy - cropH / 2;
    ctx.save();
    ctx.filter = cssFilter();
    ctx.translate(targetW / 2, targetH / 2);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.translate(-targetW / 2, -targetH / 2);
    if (image.el) {
      ctx.drawImage(image.el, sx, sy, cropW, cropH, 0, 0, targetW, targetH);
    }
    ctx.restore();
    // Retouch (mild blur then overlay original for subtle skin smoothing)
    if (adj.retouch) {
      ctx.save();
      ctx.filter = "blur(2px)";
      ctx.globalAlpha = 0.4;
      ctx.drawImage(canvas, 0, 0);
      ctx.restore();
    }
    return canvas;
  }, [image, spec, crop, rotate, adj]);

  // Draw the print sheet
  const drawSheet = useCallback(async () => {
    if (!image || !sheetCanvasRef.current || !spec || !paper) return null;
    const canvas = sheetCanvasRef.current;
    const pw = mmToPx(paper.w);
    const ph = mmToPx(paper.h);
    canvas.width = pw;
    canvas.height = ph;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pw, ph);
    // Draw one photo into an offscreen canvas
    drawSingle();
    const single = singleCanvasRef.current;
    // Layout params (mm → px)
    const gap = mmToPx(3);
    const margin = mmToPx(5);
    const footer = mmToPx(8);
    // Determine cols/rows: try suggested; if paper overridden, fit
    let cols = layout.cols, rows = layout.rows;
    while (rows * cols < count) rows++;
    const cellW = mmToPx(spec.w);
    const cellH = mmToPx(spec.h);
    const startX = Math.max(margin, (pw - (cols * cellW + (cols - 1) * gap)) / 2);
    const startY = margin;
    let idx = 0;
    for (let r = 0; r < rows && idx < count; r++) {
      for (let c = 0; c < cols && idx < count; c++) {
        const x = startX + c * (cellW + gap);
        const y = startY + r * (cellH + gap);
        ctx.drawImage(single, x, y, cellW, cellH);
        idx++;
      }
    }
    // Cutting lines
    if (cutWidth > 0) {
      ctx.strokeStyle = cutColor;
      ctx.lineWidth = Math.max(1, mmToPx(cutWidth));
      ctx.setLineDash([mmToPx(2), mmToPx(1)]);
      for (let r = 0; r <= rows; r++) {
        const y = startY + r * (cellH + gap) - (r === 0 ? 0 : gap / 2);
        if (r > 0 && r < rows) { ctx.beginPath(); ctx.moveTo(startX - gap / 2, y); ctx.lineTo(startX + cols * cellW + (cols - 1) * gap + gap / 2, y); ctx.stroke(); }
      }
      for (let c = 0; c <= cols; c++) {
        const x = startX + c * (cellW + gap) - (c === 0 ? 0 : gap / 2);
        if (c > 0 && c < cols) { ctx.beginPath(); ctx.moveTo(x, startY - gap / 2); ctx.lineTo(x, startY + rows * cellH + (rows - 1) * gap + gap / 2); ctx.stroke(); }
      }
      ctx.setLineDash([]);
    }
    // Watermark strip at the bottom
    if (watermark) {
      const wmImg = new Image();
      await new Promise((res, rej) => { wmImg.onload = res; wmImg.onerror = rej; wmImg.src = watermark; });
      const stripY = ph - footer - mmToPx(2);
      const maxH = footer;
      const ratio = wmImg.width / wmImg.height;
      const wmH = maxH;
      const wmW = wmH * ratio;
      ctx.drawImage(wmImg, (pw - wmW) / 2, stripY, wmW, wmH);
    }
    // Code label
    ctx.fillStyle = "#666";
    ctx.font = `${mmToPx(2.5)}px sans-serif`;
    ctx.fillText(code, margin, ph - mmToPx(2));
    return canvas;
  }, [image, spec, paper, layout, count, cutColor, cutWidth, watermark, code, drawSingle]);

  // When spec changes, re-run auto detection so the aspect matches the new format
  useEffect(() => {
    if (image?.el && autoDetected) {
      runAutoDetect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specCode]);

  // Redraw whenever inputs change
  useEffect(() => { if (image) { drawSingle(); drawSheet(); } }, [image, spec, crop, rotate, adj, cutColor, cutWidth, watermark, count, paperCode, drawSingle, drawSheet]);

  const downloadCanvas = (canvas, filename) => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    }, "image/jpeg", 0.95);
  };

  const saveToArchive = async () => {
    if (!singleCanvasRef.current) return;
    const dataUrl = singleCanvasRef.current.toDataURL("image/jpeg", 0.7);
    const rec = { id: `${code}-${Date.now()}`, code, spec: spec.label, createdAt: Date.now(), thumb: dataUrl };
    const all = await idbAll();
    // Keep only latest 10
    if (all.length >= 10) {
      const sorted = all.sort((a, b) => a.createdAt - b.createdAt);
      for (let i = 0; i < all.length - 9; i++) await idbDel(sorted[i].id);
    }
    await idbPut(rec);
    setArchive(await idbAll());
  };

  const downloadSingle = async () => {
    if (!image) { toast.error("Önce fotoğraf yükleyin"); return; }
    downloadCanvas(singleCanvasRef.current, `${code}_tekli.jpg`);
    await saveToArchive();
    const next = nextCode(code);
    localStorage.setItem("fotuber_last_code", next);
    setCode(next);
  };

  const downloadSheet = async () => {
    if (!image) { toast.error("Önce fotoğraf yükleyin"); return; }
    await drawSheet();
    downloadCanvas(sheetCanvasRef.current, `${code}_baski_${count}li_${paper.code}.jpg`);
    await saveToArchive();
    const next = nextCode(code);
    localStorage.setItem("fotuber_last_code", next);
    setCode(next);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2" data-testid="admin-vesikalik-title">
            <Camera className="w-7 h-7 text-emerald-600" /> Fotuber Vesikalık
          </h1>
          <p className="text-sm text-slate-500 mt-1">Biyometrik + vesikalık fotoğraf üretici. Sürükle-bırak, otomatik ölçü, baskıya hazır çıktı.</p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Fotoğraf Kodu</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} className="w-40" data-testid="input-code" />
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        {/* Left: Upload + Preview */}
        <div className="lg:col-span-8 space-y-6">
          {/* Drop zone */}
          <Card className="border-slate-200">
            <CardContent className="p-0">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${dragging ? "border-emerald-500 bg-emerald-50" : "border-slate-300"}`}
                data-testid="dropzone"
              >
                <Upload className="w-10 h-10 mx-auto text-slate-400 mb-3" />
                <div className="text-sm text-slate-600 mb-2">Fotoğrafı buraya sürükleyin ya da</div>
                <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} className="hidden" id="vf" />
                <label htmlFor="vf">
                  <Button variant="outline" className="cursor-pointer" asChild><span>Dosya Seç</span></Button>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Preview */}
          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-base">Önizleme</CardTitle></CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <div className="text-xs text-slate-500 mb-2">Tekli — {spec?.label} ({spec?.w}×{spec?.h}mm)</div>
                  <div className="bg-slate-100 p-2 rounded flex items-center justify-center min-h-[200px]">
                    <canvas ref={singleCanvasRef} className="max-w-full max-h-[350px] shadow" style={{ filter: cssFilter() }} data-testid="canvas-single" />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-2">Baskı — {paper?.label} · {count} adet</div>
                  <div className="bg-slate-100 p-2 rounded flex items-center justify-center min-h-[200px]">
                    <canvas ref={sheetCanvasRef} className="max-w-full max-h-[350px] shadow" data-testid="canvas-sheet" />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 mt-6">
                <Button onClick={runAutoDetect} disabled={!image || detecting} variant="outline" className="border-emerald-600 text-emerald-700 hover:bg-emerald-50" data-testid="auto-detect-btn">
                  {detecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ScanFace className="w-4 h-4 mr-2" />}
                  {detecting ? "Yüz taranıyor..." : "Otomatik Yüz Tespiti"}
                </Button>
                <Button onClick={downloadSingle} className="bg-slate-900 hover:bg-slate-800" data-testid="download-single-btn"><Download className="w-4 h-4 mr-2" />Tekli İndir</Button>
                <Button onClick={downloadSheet} className="bg-emerald-600 hover:bg-emerald-700" data-testid="download-sheet-btn"><Printer className="w-4 h-4 mr-2" />Baskıya Hazır İndir</Button>
              </div>
              {autoDetected && (
                <div className="mt-3 text-xs text-emerald-700 bg-emerald-50 rounded px-3 py-2 inline-flex items-center gap-2" data-testid="detection-status">
                  <ScanFace className="w-3.5 h-3.5" /> Yüz tespiti uygulandı — ICAO uyumlu çerçeveleme
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Controls */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-base">Ölçü & Kağıt</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Ülke / Format</Label>
                <Select value={specCode} onValueChange={setSpecCode}>
                  <SelectTrigger data-testid="select-spec"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {PHOTO_SPECS.map((s) => <SelectItem key={s.code} value={s.code}>{s.label} ({s.w}×{s.h}mm)</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Adet</Label>
                  <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
                    <SelectTrigger data-testid="select-count"><SelectValue /></SelectTrigger>
                    <SelectContent>{COUNT_PRESETS.map((c) => <SelectItem key={c} value={String(c)}>{c}'lı</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Kağıt</Label>
                  <Select value={paperCode || "auto"} onValueChange={(v) => setPaperCode(v === "auto" ? "" : v)}>
                    <SelectTrigger data-testid="select-paper"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Otomatik ({layout.paper.label})</SelectItem>
                      {PAPER_SIZES.map((p) => <SelectItem key={p.code} value={p.code}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="text-xs text-emerald-700 bg-emerald-50 rounded p-2">
                {count} adet {spec?.w}×{spec?.h}mm için önerilen: <b>{layout.paper.label}</b> ({layout.cols}×{layout.rows})
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-4 h-4" />İnce Ayar</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                { k: "brightness", label: "Parlaklık", min: 50, max: 150 },
                { k: "contrast",   label: "Kontrast",  min: 50, max: 150 },
                { k: "saturation", label: "Doygunluk", min: 0,  max: 200 },
                { k: "warmth",     label: "Sıcaklık (Kelvin)", min: -50, max: 50 },
                { k: "sharpness",  label: "Keskinlik", min: 0,  max: 100 },
              ].map((s) => (
                <div key={s.k}>
                  <div className="flex justify-between text-xs"><span>{s.label}</span><span>{adj[s.k]}</span></div>
                  <input type="range" min={s.min} max={s.max} value={adj[s.k]} onChange={(e) => setAdj({ ...adj, [s.k]: Number(e.target.value) })} className="w-full" data-testid={`adj-${s.k}`} />
                </div>
              ))}
              <label className="flex items-center gap-3 pt-2">
                <Switch checked={adj.retouch} onCheckedChange={(v) => setAdj({ ...adj, retouch: v })} data-testid="switch-retouch" />
                <span className="text-sm">Rötuş (cilt yumuşatma)</span>
              </label>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-base">Kesim Çizgisi & Filigran</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Label className="text-xs">Renk</Label>
                <input type="color" value={cutColor} onChange={(e) => setCutColor(e.target.value)} className="w-10 h-8 rounded" data-testid="cut-color" />
                <Label className="text-xs">Kalınlık (mm)</Label>
                <Input type="number" step="0.1" min="0" max="3" value={cutWidth} onChange={(e) => setCutWidth(Number(e.target.value))} className="w-20" data-testid="cut-width" />
              </div>
              <div>
                <Label className="text-xs">Filigran PNG (4'lünün altına)</Label>
                <Input type="file" accept="image/png,image/jpeg" onChange={(e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  const r = new FileReader(); r.onload = () => setWatermark(r.result); r.readAsDataURL(f);
                }} data-testid="watermark-upload" />
                {watermark && (
                  <div className="mt-2 flex items-center gap-2">
                    <img src={watermark} alt="wm" className="h-10 border" />
                    <Button size="sm" variant="outline" onClick={() => setWatermark(null)}>Kaldır</Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Archive */}
          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-base">Son 10 Fotoğraf (Arşiv)</CardTitle></CardHeader>
            <CardContent>
              {archive.length === 0 ? (
                <div className="text-xs text-slate-500 py-4 text-center">Henüz kayıt yok. İndirdiğiniz her fotoğraf burada saklanır.</div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {archive.sort((a, b) => b.createdAt - a.createdAt).map((r) => (
                    <div key={r.id} className="relative group">
                      <a href={r.thumb} download={`${r.code}.jpg`} title={`${r.code} · ${r.spec}`}>
                        <img src={r.thumb} alt={r.code} className="w-full h-16 object-cover rounded border" />
                        <div className="text-[10px] text-center mt-1 truncate">{r.code}</div>
                      </a>
                      <button onClick={async () => { await idbDel(r.id); setArchive(await idbAll()); }} className="absolute top-1 right-1 bg-white/80 rounded p-0.5 opacity-0 group-hover:opacity-100"><Trash2 className="w-3 h-3 text-red-600" /></button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminPassportPhoto;
