import React, { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, Undo2, Eye, Circle, Shirt, Loader2, SplitSquareHorizontal, Palette, Wand2, Droplet } from "lucide-react";
import { toast } from "sonner";
import { detectFaceRegions } from "@/lib/faceDetect";

const API = process.env.REACT_APP_BACKEND_URL;

const PALETTE = [
  { hex: "#0b0b0f", name: "Siyah" },
  { hex: "#ffffff", name: "Beyaz" },
  { hex: "#1e293b", name: "Lacivert" },
  { hex: "#475569", name: "Gri" },
  { hex: "#7c3aed", name: "Mor" },
  { hex: "#0369a1", name: "Mavi" },
  { hex: "#0891b2", name: "Turkuaz" },
  { hex: "#059669", name: "Yeşil" },
  { hex: "#eab308", name: "Sarı" },
  { hex: "#ea580c", name: "Turuncu" },
  { hex: "#dc2626", name: "Kırmızı" },
  { hex: "#db2777", name: "Pembe" },
  { hex: "#a16207", name: "Kahve" },
  { hex: "#78716c", name: "Taş" },
  { hex: "#e5e7eb", name: "Açık Gri" },
  { hex: "#fecaca", name: "Toz Pembe" },
];

const GARMENTS_M = [
  { code: "tshirt", label: "Tişört" },
  { code: "polo",   label: "Polo Yaka" },
  { code: "shirt",  label: "Gömlek" },
  { code: "blazer", label: "Ceket" },
];
const GARMENTS_F = [
  { code: "tshirt",          label: "Tişört" },
  { code: "blouse",          label: "Bluz" },
  { code: "collared_blouse", label: "Yakalı Bluz" },
  { code: "blazer",          label: "Ceket" },
];

const authHeaders = () => {
  const t = localStorage.getItem("token");
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// ---- HSL helpers ---------------------------------------------------------
const rgbToHsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h, s, l = (mx + mn) / 2;
  if (mx === mn) { h = 0; s = 0; }
  else {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    switch (mx) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h, s, l };
};
const hslToRgb = (h, s, l) => {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue2rgb(p, q, h + 1 / 3) * 255,
    g: hue2rgb(p, q, h) * 255,
    b: hue2rgb(p, q, h - 1 / 3) * 255,
  };
};

// Client-side garment RE-COLOR: preserves face/skin/background completely.
// Detects clothing pixels as "not-background AND not-skin AND below chin",
// then transfers only Hue+Saturation from the target while keeping the
// original Lightness — so fabric folds, shadows and highlights survive.
const recolorGarment = async (imgEl, targetHex) => {
  const regions = await detectFaceRegions(imgEl);
  if (!regions.ok) throw new Error(regions.message || "Yüz tespit edilemedi");
  const W = imgEl.naturalWidth || imgEl.width;
  const H = imgEl.naturalHeight || imgEl.height;
  const cvs = document.createElement("canvas");
  cvs.width = W; cvs.height = H;
  const ctx = cvs.getContext("2d");
  ctx.drawImage(imgEl, 0, 0);
  const data = ctx.getImageData(0, 0, W, H);

  // Background sample = mean of 4 corner 30×30 patches
  const sampleMean = (x, y, w, h) => {
    const p = ctx.getImageData(x, y, w, h).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < p.length; i += 4) { r += p[i]; g += p[i + 1]; b += p[i + 2]; n++; }
    return { r: r / n, g: g / n, b: b / n };
  };
  const bgSamples = [
    sampleMean(0, 0, 30, 30),
    sampleMean(W - 30, 0, 30, 30),
    sampleMean(0, H - 30, 30, 30),
    sampleMean(W - 30, H - 30, 30, 30),
  ];
  const bgR = bgSamples.reduce((s, p) => s + p.r, 0) / bgSamples.length;
  const bgG = bgSamples.reduce((s, p) => s + p.g, 0) / bgSamples.length;
  const bgB = bgSamples.reduce((s, p) => s + p.b, 0) / bgSamples.length;

  const box = regions.box;
  const chinY = box.y + box.height;
  // Skin tone reference from cheek area (below eyes, above chin)
  const cheekR = data.data[((Math.floor(box.y + box.height * 0.7)) * W + Math.floor(box.x + box.width * 0.25)) * 4];
  const cheekG = data.data[((Math.floor(box.y + box.height * 0.7)) * W + Math.floor(box.x + box.width * 0.25)) * 4 + 1];
  const cheekB = data.data[((Math.floor(box.y + box.height * 0.7)) * W + Math.floor(box.x + box.width * 0.25)) * 4 + 2];

  const target = { r: parseInt(targetHex.slice(1, 3), 16), g: parseInt(targetHex.slice(3, 5), 16), b: parseInt(targetHex.slice(5, 7), 16) };
  const t = rgbToHsl(target.r, target.g, target.b);

  const bgDist = (r, g, b) => Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
  const skinDist = (r, g, b) => Math.abs(r - cheekR) + Math.abs(g - cheekG) + Math.abs(b - cheekB);

  const d = data.data;
  // Everything above (chinY + neckGap) is off-limits (face/hair). Neck is
  // handled by the skin-tone exclusion below.
  const startY = Math.max(0, Math.floor(chinY + Math.min(H * 0.02, 20)));
  for (let y = startY; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (bgDist(r, g, b) < 55) continue;    // background — skip
      if (skinDist(r, g, b) < 55) continue;  // exposed neck skin — skip
      const src = rgbToHsl(r, g, b);
      // Keep original lightness; take hue + saturation from target
      const out = hslToRgb(t.h, t.s, src.l);
      d[i]     = out.r < 0 ? 0 : out.r > 255 ? 255 : out.r;
      d[i + 1] = out.g < 0 ? 0 : out.g > 255 ? 255 : out.g;
      d[i + 2] = out.b < 0 ? 0 : out.b > 255 ? 255 : out.b;
    }
  }
  ctx.putImageData(data, 0, 0);
  return cvs.toDataURL("image/jpeg", 0.95);
};

// Manipulate the pixel data of a canvas rect: dampen red-channel bloom in
// eye area. This is the classic red-eye removal heuristic.
const removeRedEyeInRect = (canvas, rect) => {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const w = Math.min(canvas.width  - x, Math.ceil(rect.w));
  const h = Math.min(canvas.height - y, Math.ceil(rect.h));
  if (w <= 0 || h <= 0) return 0;
  const ctx = canvas.getContext("2d");
  const data = ctx.getImageData(x, y, w, h);
  const d = data.data;
  let touched = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    // A "red-eye" pixel is one where R strongly dominates G and B
    if (r > 100 && r > (g + b) * 0.9 && (r - Math.max(g, b)) > 30) {
      // Replace with a natural pupil colour: keep luminance, drop saturation
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const dark = Math.min(lum, 60);
      d[i] = dark; d[i + 1] = dark; d[i + 2] = dark;
      touched++;
    }
  }
  ctx.putImageData(data, x, y);
  return touched;
};

// Unsharp mask limited to a rectangular region — used to crispen eyes only
// without affecting the rest of the face.
const sharpenRect = (canvas, rect, amount = 0.9) => {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const w = Math.min(canvas.width  - x, Math.ceil(rect.w));
  const h = Math.min(canvas.height - y, Math.ceil(rect.h));
  if (w <= 0 || h <= 0) return;
  const ctx = canvas.getContext("2d");
  const src = ctx.getImageData(x, y, w, h);
  // Blurred copy for unsharp
  const off = document.createElement("canvas");
  off.width = w; off.height = h;
  const octx = off.getContext("2d");
  octx.putImageData(src, 0, 0);
  const blurred = document.createElement("canvas");
  blurred.width = w; blurred.height = h;
  const bctx = blurred.getContext("2d");
  if ("filter" in bctx) { bctx.filter = "blur(1.4px)"; bctx.drawImage(off, 0, 0); bctx.filter = "none"; }
  else { bctx.drawImage(off, 0, 0); }
  const bd = bctx.getImageData(0, 0, w, h).data;
  const sd = src.data;
  for (let i = 0; i < sd.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = sd[i + c] + (sd[i + c] - bd[i + c]) * amount;
      sd[i + c] = v < 0 ? 0 : v > 255 ? 255 : v | 0;
    }
  }
  ctx.putImageData(src, x, y);
};

// Vertical-split before/after comparison dialog
const CompareDialog = ({ open, onOpenChange, beforeSrc, afterSrc }) => {
  const [pos, setPos] = useState(50);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl" data-testid="compare-dialog">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><SplitSquareHorizontal className="w-4 h-4" />Önce / Sonra</DialogTitle></DialogHeader>
        <div className="relative select-none rounded overflow-hidden bg-slate-900" style={{ userSelect: "none" }}>
          <img src={beforeSrc} alt="before" className="block max-h-[70vh] w-auto mx-auto" data-testid="compare-before" />
          <div className="absolute top-0 bottom-0 left-0 overflow-hidden" style={{ width: `${pos}%` }}>
            <img src={afterSrc} alt="after" className="block max-h-[70vh] w-auto mx-auto absolute top-0 left-0" style={{ height: "100%" }} data-testid="compare-after" />
          </div>
          <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow" style={{ left: `${pos}%`, transform: "translateX(-50%)" }} />
          <input
            type="range" min={0} max={100} step={1} value={pos}
            onChange={(e) => setPos(Number(e.target.value))}
            className="absolute inset-x-4 bottom-3 w-[calc(100%-2rem)]"
            style={{ accentColor: "#dc2626" }}
            data-testid="compare-slider"
          />
          <div className="absolute top-2 left-3 text-[11px] text-white/90 bg-black/40 rounded px-2 py-0.5">Sonra</div>
          <div className="absolute top-2 right-3 text-[11px] text-white/90 bg-black/40 rounded px-2 py-0.5">Önce</div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Main studio panel — placed alongside AdminPassportPhoto's existing cards.
//
// Props:
//   image        current image {src, w, h, el}
//   applyImage   (imgObj) => void  — swaps the working image
//   originalSrc  the untouched upload for the compare view
//
// Undo stack tracks image.src snapshots; every AI/pixel edit pushes one before mutating.
const PhotoStudio = ({ image, applyImage, originalSrc, loadImageFromSrc }) => {
  const [gender, setGender] = useState("male");
  const [garment, setGarment] = useState("shirt");
  const [collar, setCollar] = useState("collar");
  const [color, setColor] = useState("#1e293b");
  const [colorName, setColorName] = useState("Lacivert");
  const [mode, setMode] = useState("recolor"); // "recolor" | "ai"
  const [aiBusy, setAiBusy] = useState(false);
  const [recolorBusy, setRecolorBusy] = useState(false);
  const [redEyeBusy, setRedEyeBusy] = useState(false);
  const [sharpenBusy, setSharpenBusy] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const undoRef = useRef([]);

  useEffect(() => {
    setGarment((g) => (gender === "female" && (g === "polo" || g === "shirt")) ? "blouse"
                    : (gender === "male"   && (g === "blouse" || g === "collared_blouse")) ? "shirt"
                    : g);
  }, [gender]);

  const pushUndo = () => {
    if (image?.src) {
      undoRef.current.push(image.src);
      if (undoRef.current.length > 20) undoRef.current.shift();
    }
  };

  const undo = async () => {
    const prev = undoRef.current.pop();
    if (!prev) { toast.info("Geri alınacak adım yok"); return; }
    const im = await loadImageFromSrc(prev);
    applyImage(im);
    toast.success("Son işlem geri alındı");
  };

  const doRecolor = async () => {
    if (!image?.el) { toast.error("Önce fotoğraf yükleyin"); return; }
    setRecolorBusy(true);
    try {
      pushUndo();
      const dataUrl = await recolorGarment(image.el, color);
      const im = await loadImageFromSrc(dataUrl);
      applyImage(im);
      toast.success(`Rengi ${colorName || color} yapıldı`);
    } catch (e) {
      toast.error(e.message || "Renk değiştirme başarısız");
      undoRef.current.pop();
    } finally { setRecolorBusy(false); }
  };

  const doAiEdit = async () => {
    if (!image?.src) { toast.error("Önce fotoğraf yükleyin"); return; }
    setAiBusy(true);
    try {
      pushUndo();
      const res = await fetch(`${API}/api/vesikalik/ai-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          image_base64: image.src,
          gender, garment, collar, color, color_name: colorName,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "AI hata verdi");
      }
      const data = await res.json();
      const dataUrl = `data:${data.mime_type};base64,${data.image_base64}`;
      const im = await loadImageFromSrc(dataUrl);
      applyImage(im);
      toast.success("Kıyafet değiştirildi");
    } catch (e) {
      toast.error(e.message || "AI hata verdi");
      undoRef.current.pop(); // rollback the pushed snapshot since no change happened
    } finally {
      setAiBusy(false);
    }
  };

  const doRedEye = async () => {
    if (!image?.el) { toast.error("Önce fotoğraf yükleyin"); return; }
    setRedEyeBusy(true);
    try {
      pushUndo();
      const cvs = document.createElement("canvas");
      cvs.width = image.w; cvs.height = image.h;
      cvs.getContext("2d").drawImage(image.el, 0, 0);
      const r = await detectFaceRegions(image.el);
      if (!r.ok) { toast.error(r.message || "Göz tespit edilemedi"); undoRef.current.pop(); return; }
      const n1 = removeRedEyeInRect(cvs, r.leftEye);
      const n2 = removeRedEyeInRect(cvs, r.rightEye);
      const im = await loadImageFromSrc(cvs.toDataURL("image/jpeg", 0.95));
      applyImage(im);
      toast.success(n1 + n2 > 0 ? `Kırmızı göz temizlendi (${n1 + n2} piksel)` : "Kırmızı göz bulunamadı");
    } catch (e) {
      toast.error("Kırmızı göz işlemi başarısız");
      undoRef.current.pop();
    } finally { setRedEyeBusy(false); }
  };

  const doSharpen = async () => {
    if (!image?.el) { toast.error("Önce fotoğraf yükleyin"); return; }
    setSharpenBusy(true);
    try {
      pushUndo();
      const cvs = document.createElement("canvas");
      cvs.width = image.w; cvs.height = image.h;
      cvs.getContext("2d").drawImage(image.el, 0, 0);
      const r = await detectFaceRegions(image.el);
      if (!r.ok) { toast.error(r.message || "Göz tespit edilemedi"); undoRef.current.pop(); return; }
      sharpenRect(cvs, r.leftEye, 0.9);
      sharpenRect(cvs, r.rightEye, 0.9);
      const im = await loadImageFromSrc(cvs.toDataURL("image/jpeg", 0.95));
      applyImage(im);
      toast.success("Gözler netleştirildi");
    } catch (e) {
      toast.error("Netleştirme başarısız");
      undoRef.current.pop();
    } finally { setSharpenBusy(false); }
  };

  const currentGarments = gender === "male" ? GARMENTS_M : GARMENTS_F;

  return (
    <>
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" /> Profesyonel Stüdyo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode toggle */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2"><Shirt className="w-3.5 h-3.5" /> Kıyafet Modu</Label>
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg text-xs" data-testid="studio-mode-switch">
              <button
                type="button"
                onClick={() => setMode("recolor")}
                className={`flex items-center justify-center gap-1 py-2 rounded-md transition-colors ${mode === "recolor" ? "bg-emerald-600 text-white shadow font-semibold" : "text-slate-600"}`}
                data-testid="studio-mode-recolor"
              >
                <Droplet className="w-3.5 h-3.5" /> Renk (ücretsiz)
              </button>
              <button
                type="button"
                onClick={() => setMode("ai")}
                className={`flex items-center justify-center gap-1 py-2 rounded-md transition-colors ${mode === "ai" ? "bg-indigo-600 text-white shadow font-semibold" : "text-slate-600"}`}
                data-testid="studio-mode-ai"
              >
                <Wand2 className="w-3.5 h-3.5" /> AI Kıyafet
              </button>
            </div>
            <div className={`text-[11px] rounded px-2 py-1 border ${mode === "recolor" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-indigo-50 border-indigo-200 text-indigo-800"}`} data-testid="studio-mode-tip">
              {mode === "recolor"
                ? "🟢 Sadece renk değişir — kanvas maskeleme, AI yok, ücretsiz. Yüz/cilt/arka plan korunur."
                : "🟣 Kıyafetin tamamı AI ile değişir. \"Kıyafeti Değiştir\" butonuna bastığında çalışır."}
            </div>
          </div>

          {/* AI Garment Editor (visible only in AI mode) */}
          {mode === "ai" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg text-xs">
              <button type="button" onClick={() => setGender("male")}   className={`py-2 rounded-md ${gender==="male"   ? "bg-white shadow font-semibold" : "text-slate-600"}`} data-testid="studio-gender-male">Erkek</button>
              <button type="button" onClick={() => setGender("female")} className={`py-2 rounded-md ${gender==="female" ? "bg-white shadow font-semibold" : "text-slate-600"}`} data-testid="studio-gender-female">Kadın</button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {currentGarments.map((g) => (
                <button
                  key={g.code}
                  type="button"
                  onClick={() => setGarment(g.code)}
                  className={`py-2 px-2 border rounded-md ${garment===g.code ? "border-emerald-600 bg-emerald-50 text-emerald-700 font-medium" : "border-slate-300 text-slate-600"}`}
                  data-testid={`studio-garment-${g.code}`}
                >{g.label}</button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg text-[11px]">
              <button type="button" onClick={() => setCollar("collar")}    className={`py-1.5 rounded-md ${collar==="collar"    ? "bg-white shadow font-semibold" : "text-slate-600"}`} data-testid="studio-collar-yes">Yakalı</button>
              <button type="button" onClick={() => setCollar("no_collar")} className={`py-1.5 rounded-md ${collar==="no_collar" ? "bg-white shadow font-semibold" : "text-slate-600"}`} data-testid="studio-collar-no">Yakasız</button>
              <button type="button" onClick={() => setCollar("none")}      className={`py-1.5 rounded-md ${collar==="none"      ? "bg-white shadow font-semibold" : "text-slate-600"}`} data-testid="studio-collar-none">Fark Etmez</button>
            </div>
          </div>
          )}

          {/* Color palette (common to both modes) */}
          <div>
              <Label className="text-xs flex items-center gap-2"><Palette className="w-3 h-3" /> Renk Paleti</Label>
              <div className="grid grid-cols-8 gap-1 mt-1" data-testid="studio-palette">
                {PALETTE.map((p) => (
                  <button
                    key={p.hex}
                    type="button"
                    onClick={() => { setColor(p.hex); setColorName(p.name); }}
                    className={`h-6 w-6 rounded border-2 ${color===p.hex ? "border-slate-900 ring-2 ring-emerald-500" : "border-white"}`}
                    style={{ backgroundColor: p.hex }}
                    title={p.name}
                    data-testid={`studio-color-${p.hex.substring(1)}`}
                  />
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Label className="text-[11px] text-slate-500">Serbest</Label>
                <input type="color" value={color} onChange={(e) => { setColor(e.target.value); setColorName(""); }} className="w-8 h-8 rounded border border-slate-300" data-testid="studio-color-picker" />
                <Input type="text" placeholder="Renk adı (ops.)" value={colorName} onChange={(e) => setColorName(e.target.value)} className="h-8 text-xs" data-testid="studio-color-name" />
              </div>
            </div>

            {mode === "recolor" ? (
              <Button onClick={doRecolor} disabled={recolorBusy || !image} className="w-full bg-emerald-600 hover:bg-emerald-700" data-testid="studio-recolor-apply">
                {recolorBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Droplet className="w-4 h-4 mr-2" />}
                {recolorBusy ? "İşleniyor..." : "Rengi Değiştir"}
              </Button>
            ) : (
              <Button onClick={doAiEdit} disabled={aiBusy || !image} className="w-full bg-indigo-600 hover:bg-indigo-700" data-testid="studio-ai-apply">
                {aiBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                {aiBusy ? "AI çalışıyor..." : "Kıyafeti Değiştir (AI)"}
              </Button>
            )}
            <div className="text-[10px] text-slate-500 leading-tight">
              {mode === "recolor"
                ? "Kanvas: yüz altındaki kıyafet piksellerine sadece hue+saturation transfer, luminance korunur — kumaş kıvrımları ve gölgeler değişmez."
                : "AI: Gemini Nano Banana. Yüz/saç/arka plan korunur. Her uygulama ~5-15 sn sürer."}
            </div>

          <div className="border-t border-slate-200 pt-3 space-y-2">
            <Label className="text-sm font-medium">Yüz Ayrıntıları</Label>
            <Button onClick={doRedEye} disabled={redEyeBusy || !image} variant="outline" className="w-full border-rose-400 text-rose-700 hover:bg-rose-50" data-testid="studio-redeye">
              {redEyeBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Circle className="w-4 h-4 mr-2" />}
              Kırmızı Göz Gider
            </Button>
            <Button onClick={doSharpen} disabled={sharpenBusy || !image} variant="outline" className="w-full border-sky-400 text-sky-700 hover:bg-sky-50" data-testid="studio-sharpen">
              {sharpenBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
              Gözleri Netleştir
            </Button>
          </div>

          <div className="border-t border-slate-200 pt-3 grid grid-cols-2 gap-2">
            <Button onClick={undo} variant="outline" data-testid="studio-undo"><Undo2 className="w-4 h-4 mr-2" />Geri Al</Button>
            <Button onClick={() => setCompareOpen(true)} disabled={!originalSrc || !image} variant="outline" data-testid="studio-compare"><SplitSquareHorizontal className="w-4 h-4 mr-2" />Önce/Sonra</Button>
          </div>
        </CardContent>
      </Card>

      <CompareDialog
        open={compareOpen}
        onOpenChange={setCompareOpen}
        beforeSrc={originalSrc}
        afterSrc={image?.src}
      />
    </>
  );
};

export default PhotoStudio;
