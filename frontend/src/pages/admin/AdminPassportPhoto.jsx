import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Camera, Upload, Download, Trash2, ImageIcon, Printer, RotateCw, ZoomIn, ZoomOut, Sparkles, ScanFace, Loader2, Eraser, Paintbrush, Move, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { PHOTO_SPECS, PAPER_SIZES, suggestPaper, COUNT_PRESETS } from "@/lib/passportSpecs";
import { printImageSheet } from "@/lib/printImage";
import { loadCustomSpecs, saveCustomSpec, deleteCustomSpec, canvasToJpegMaxKb, exportExactPx, drawComboSheet } from "@/lib/passportLayout";
import { detectBiometricCrop, loadFaceModels } from "@/lib/faceDetect";
import { removeBackground, compositeOnColor } from "@/lib/bgRemove";
import RetouchBrush from "@/components/RetouchBrush";
import PhotoStudio from "@/components/PhotoStudio";

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

// BUG 2 fallback: build a foreground alpha mask by color-keying the plain
// background (sampled from the crop corners). Used when background removal is
// OFF so color adjustments still skip the (white) background.
const buildColorKeyMask = (el, sx, sy, cw, ch, tw, th, tol = 60) => {
  const c = document.createElement("canvas");
  c.width = tw; c.height = th;
  const cx = c.getContext("2d", { willReadFrequently: true });
  cx.drawImage(el, sx, sy, cw, ch, 0, 0, tw, th);
  let img;
  try { img = cx.getImageData(0, 0, tw, th); }
  catch (e) { cx.fillStyle = "#fff"; cx.fillRect(0, 0, tw, th); return c; }
  const p = img.data;
  // Sample the background from the TOP-LEFT and TOP-RIGHT corners only (a
  // passport crop always has headroom there). Using bottom corners would
  // sample the subject's shoulders/hair and poison the estimate. 5x5 patch
  // means make the sample robust to noise.
  const patchMean = (px, py) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let yy = Math.max(0, py - 2); yy <= Math.min(th - 1, py + 2); yy++) {
      for (let xx = Math.max(0, px - 2); xx <= Math.min(tw - 1, px + 2); xx++) {
        const i = (yy * tw + xx) * 4; r += p[i]; g += p[i + 1]; b += p[i + 2]; n++;
      }
    }
    return [r / n, g / n, b / n];
  };
  const cL = patchMean(3, 3);
  const cR = patchMean(tw - 4, 3);
  const br = (cL[0] + cR[0]) / 2;
  const bg = (cL[1] + cR[1]) / 2;
  const bb = (cL[2] + cR[2]) / 2;
  for (let i = 0; i < p.length; i += 4) {
    const dr = p[i] - br, dg = p[i + 1] - bg, db = p[i + 2] - bb;
    const fg = Math.sqrt(dr * dr + dg * dg + db * db) > tol ? 255 : 0;
    p[i] = 255; p[i + 1] = 255; p[i + 2] = 255; p[i + 3] = fg;
  }
  cx.putImageData(img, 0, 0);
  return c;
};

const AdminPassportPhoto = ({ injected } = {}) => {
  const [specCode, setSpecCode] = useState("tr-bio");
  const [count, setCount] = useState(6);
  const [paperCode, setPaperCode] = useState(""); // auto if empty
  const [image, setImage] = useState(null); // {src, w, h, el}
  const [crop, setCrop] = useState({ cx: 0, cy: 0, w: 0 }); // pixel-space center + width
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [detecting, setDetecting] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);
  const [autoBg, setAutoBg] = useState(true);
  const [bgProcessing, setBgProcessing] = useState(false);
  const [bgProgress, setBgProgress] = useState(0);
  const [bgRemoved, setBgRemoved] = useState(false);
  const [originalImage, setOriginalImage] = useState(null); // {src, w, h, el} of the raw upload
  const [fgMask, setFgMask] = useState(null); // foreground alpha mask (HTMLImageElement) from bg removal
  const [retouchOpen, setRetouchOpen] = useState(false);
  // Baskı dizilimi ve filigran
  const [photoGap, setPhotoGap] = useState(0); // mm gap between photos on sheet
  const [wmPos, setWmPos] = useState("bc"); // 3x3 grid: tl tc tr ml mc mr bl bc br
  const [wmAlign, setWmAlign] = useState("center"); // per-photo watermark: left | center | right
  const [wmScale, setWmScale] = useState(14); // % of photo height
  const [wmOpacity, setWmOpacity] = useState(85); // 0-100
  const [wmNudge, setWmNudge] = useState({ x: 0, y: 0 }); // mm offset inside the white strip
  const [sheetOffset, setSheetOffset] = useState({ x: 0, y: 0 }); // mm manual offset
  const [adj, setAdj] = useState({ brightness: 100, contrast: 100, saturation: 100, warmth: 0, sharpness: 0, retouch: false, retouchIntensity: 60 });
  const [cutColor, setCutColor] = useState("#9ca3af"); // thin gray dashed cut lines
  const [cutWidth, setCutWidth] = useState(0.5); // mm
  const [cutStyle, setCutStyle] = useState("dashed"); // "dashed" | "solid"
  const [watermark, setWatermark] = useState(null); // dataUrl
  const [code, setCode] = useState(() => localStorage.getItem("fotuber_last_code") || "FTB00001");
  const [archive, setArchive] = useState([]);
  const [dragging, setDragging] = useState(false);
  const singleCanvasRef = useRef(null);
  const sheetCanvasRef = useRef(null);
  const wrapRef = useRef(null);

  const [customSpecs, setCustomSpecs] = useState(() => loadCustomSpecs());
  const [customForm, setCustomForm] = useState({ label: "", w: "", h: "", dpi: 300 });
  const [layoutMode, setLayoutMode] = useState("standart"); // standart | kombin
  const [comboItems, setComboItems] = useState([]); // [{specCode, count}]
  const [sheetMargin, setSheetMargin] = useState(3); // mm — kombin kenar boşluğu
  const allSpecs = useMemo(() => [...PHOTO_SPECS, ...customSpecs], [customSpecs]);
  const spec = useMemo(() => allSpecs.find((s) => s.code === specCode) || PHOTO_SPECS[0], [allSpecs, specCode]);
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

  const loadImageFromSrc = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ src, w: img.width, h: img.height, el: img });
    img.onerror = reject;
    img.src = src;
  });

  const applyImage = useCallback((imgObj, opts = {}) => {
    setImage(imgObj);
    if (!opts.keepCrop) {
      const shortSide = Math.min(imgObj.w, imgObj.h);
      setCrop({ cx: imgObj.w / 2, cy: imgObj.h / 2, w: shortSide * 0.7 });
      setAutoDetected(false);
    } else if (imgObj.w && imgObj.h) {
      // If dimensions changed but caller wants to keep the crop, rescale it
      setCrop((c) => {
        // Only rescale if we have a previous image to compare against
        // Otherwise keep the passed crop untouched
        return c;
      });
    }
  }, []);

  const runBackgroundRemoval = useCallback(async (rawFile, bgColor = "#ffffff") => {
    setBgProcessing(true);
    setBgProgress(0);
    try {
      const blob = await removeBackground(rawFile, (p) => setBgProgress(p));
      // BUG 2: keep the transparent PNG (foreground alpha) as a mask so color
      // adjustments can be limited to the person only.
      const maskUrl = URL.createObjectURL(blob);
      const maskImg = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = maskUrl; });
      setFgMask(maskImg);
      const { dataUrl } = await compositeOnColor(blob, bgColor);
      const processed = await loadImageFromSrc(dataUrl);
      applyImage(processed);
      setBgRemoved(true);
      URL.revokeObjectURL(maskUrl);
      toast.success("Arka plan temizlendi, beyaz arka plan uygulandı");
    } catch (e) {
      console.error(e);
      toast.error("Arka plan temizlenemedi. Orijinal fotoğraf kullanılıyor.");
    } finally {
      setBgProcessing(false);
    }
  }, [applyImage]);

  const onFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith("image/")) { toast.error("Lütfen bir görsel dosya seçin"); return; }
    setBgRemoved(false);
    setFgMask(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const raw = await loadImageFromSrc(reader.result);
      setOriginalImage(raw);
      applyImage(raw);
      if (autoBg) {
        // fire and forget — spec.bg is used as the paint color
        runBackgroundRemoval(file, spec?.bg || "#ffffff");
      }
    };
    reader.readAsDataURL(file);
  }, [autoBg, spec, applyImage, runBackgroundRemoval]);

  const revertBackground = useCallback(() => {
    if (!originalImage) return;
    applyImage(originalImage);
    setBgRemoved(false);
    setFgMask(null);
    toast.info("Orijinal fotoğrafa dönüldü");
  }, [originalImage, applyImage]);

  const removeBgNow = useCallback(async () => {
    if (!originalImage) { toast.error("Önce fotoğraf yükleyin"); return; }
    // Convert data URL → blob so imgly can process it
    const resp = await fetch(originalImage.src);
    const blob = await resp.blob();
    await runBackgroundRemoval(blob, spec?.bg || "#ffffff");
  }, [originalImage, spec, runBackgroundRemoval]);

  // Injected image from the 3'lü panel "İnce Ayar" → load it for fine-tuning.
  // The image is already background-removed + framed, so we skip bg removal
  // and let the existing auto-detect effect re-frame it.
  useEffect(() => {
    if (!injected?.src) return;
    let cancelled = false;
    (async () => {
      try {
        if (injected.specCode) setSpecCode(injected.specCode);
        setBgRemoved(false);
        setFgMask(null);
        const raw = await loadImageFromSrc(injected.src);
        if (cancelled) return;
        setOriginalImage(raw);
        setImage(raw);
        // The injected photo is ALREADY background-removed + framed to the spec
        // aspect. Fit it fully into the frame (contain) instead of re-cropping to
        // 70% — this prevents the face/photo overflowing the target frame.
        const tSpec = injected.specCode ? PHOTO_SPECS.find((s) => s.code === injected.specCode) : spec;
        const ar = tSpec ? tSpec.h / tSpec.w : raw.h / raw.w; // height/width of target
        let cw = raw.w;
        let ch = cw * ar;
        if (ch > raw.h) { ch = raw.h; cw = ch / ar; }
        setCrop({ cx: raw.w / 2, cy: raw.h / 2, w: cw });
        setZoom(1);
        setRotate(0);
        setAutoDetected(true);
        toast.success("Fotoğraf tekli editöre yüklendi — ince ayar yapabilirsiniz");
      } catch (e) {
        toast.error("Fotoğraf yüklenemedi");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injected?.key]);


  const applyRetouch = useCallback(async (dataUrl) => {
    try {
      const updated = await loadImageFromSrc(dataUrl);
      if (!updated?.el || !updated.w) { toast.error("Rötuş uygulanamadı"); return; }
      // Retouch dialog downscales huge photos to MAX_EDGE=1600. If the returned
      // image is a different size, rescale the crop rect to the new dimensions
      // so it stays inside the image (otherwise the preview goes blank).
      setImage((prev) => {
        if (prev && prev.w && (prev.w !== updated.w || prev.h !== updated.h)) {
          const sx = updated.w / prev.w;
          const sy = updated.h / prev.h;
          setCrop((c) => ({ cx: c.cx * sx, cy: c.cy * sy, w: c.w * sx }));
        }
        return updated;
      });
      // The retouched image is a flat photo (no alpha) and the dialog may have
      // resized it, so the earlier background-removal alpha mask no longer lines
      // up. Drop it so color adjustments use the color-key fallback and the
      // base image always renders (prevents the blank/white preview).
      setFgMask(null);
      toast.success("Rötuş uygulandı");
    } catch (e) {
      toast.error("Rötuş uygulanamadı");
    }
  }, []);

  // ---------- Pointer drag: pan the crop on the Tekli preview -------------
  const singleDragRef = useRef(null);
  const onSinglePointerDown = (ev) => {
    if (!image) return;
    ev.preventDefault();
    singleCanvasRef.current.setPointerCapture(ev.pointerId);
    singleDragRef.current = { startX: ev.clientX, startY: ev.clientY, startCx: crop.cx, startCy: crop.cy };
  };
  const onSinglePointerMove = (ev) => {
    const d = singleDragRef.current;
    if (!d || !image || !spec) return;
    const rect = singleCanvasRef.current.getBoundingClientRect();
    // Convert pointer delta from CSS px → source-image px
    const targetW = mmToPx(spec.w);
    const dispScale = rect.width / targetW; // display px per source px
    const sourceScale = crop.w / targetW;   // source px per target output px
    // If user drags right in display, the visible content moves right, so
    // crop.cx should DECREASE by the equivalent source-image distance.
    const dxSrc = ((ev.clientX - d.startX) / dispScale) * sourceScale;
    const dySrc = ((ev.clientY - d.startY) / dispScale) * sourceScale;
    const halfW = crop.w / 2;
    const halfH = (crop.w * spec.h / spec.w) / 2;
    const cx = Math.min(Math.max(d.startCx - dxSrc, halfW), image.w - halfW);
    const cy = Math.min(Math.max(d.startCy - dySrc, halfH), image.h - halfH);
    setCrop((c) => ({ ...c, cx, cy }));
  };
  const onSinglePointerUp = (ev) => {
    if (singleCanvasRef.current?.hasPointerCapture(ev.pointerId)) {
      singleCanvasRef.current.releasePointerCapture(ev.pointerId);
    }
    singleDragRef.current = null;
  };

  // ---------- Pointer drag: nudge the entire block on the Baskı preview ----
  const sheetDragRef = useRef(null);
  const onSheetPointerDown = (ev) => {
    if (!image || !paper) return;
    ev.preventDefault();
    sheetCanvasRef.current.setPointerCapture(ev.pointerId);
    sheetDragRef.current = { startX: ev.clientX, startY: ev.clientY, startOx: sheetOffset.x, startOy: sheetOffset.y };
  };
  const onSheetPointerMove = (ev) => {
    const d = sheetDragRef.current;
    if (!d || !paper) return;
    const rect = sheetCanvasRef.current.getBoundingClientRect();
    // Convert CSS pixel delta into mm on the paper
    const mmPerCssX = paper.w / rect.width;
    const mmPerCssY = paper.h / rect.height;
    const dx = (ev.clientX - d.startX) * mmPerCssX;
    const dy = (ev.clientY - d.startY) * mmPerCssY;
    setSheetOffset({ x: Math.round((d.startOx + dx) * 10) / 10, y: Math.round((d.startOy + dy) * 10) / 10 });
  };
  const onSheetPointerUp = (ev) => {
    if (sheetCanvasRef.current?.hasPointerCapture(ev.pointerId)) {
      sheetCanvasRef.current.releasePointerCapture(ev.pointerId);
    }
    sheetDragRef.current = null;
  };

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
    // Pixel-space source rect from crop, HARD-CLAMPED inside the image so a
    // stale/rescaled crop (e.g. right after a downscaled retouch) can never
    // point off-canvas and render a blank/white photo.
    const iw = (image.el && (image.el.naturalWidth || image.el.width)) || image.w;
    const ih = (image.el && (image.el.naturalHeight || image.el.height)) || image.h;
    const cropW = Math.min(crop.w, iw);
    const cropH = Math.min(crop.w * (spec.h / spec.w), ih);
    let sx = crop.cx - cropW / 2;
    let sy = crop.cy - cropH / 2;
    sx = Math.min(Math.max(0, sx), Math.max(0, iw - cropW));
    sy = Math.min(Math.max(0, sy), Math.max(0, ih - cropH));
    if (image.el) {
      // BUG 2: color adjustments (brightness/contrast/saturation/warmth) must
      // affect ONLY the foreground person, never the background. Draw an
      // unfiltered base first, then overlay a filtered copy clipped to the
      // foreground mask (bg-removal alpha, or a color-key fallback).
      const applyRot = (c2) => {
        c2.translate(targetW / 2, targetH / 2);
        c2.rotate((rotate * Math.PI) / 180);
        c2.translate(-targetW / 2, -targetH / 2);
      };
      // 1) Unfiltered base — background stays exactly as-is.
      ctx.save();
      applyRot(ctx);
      ctx.drawImage(image.el, sx, sy, cropW, cropH, 0, 0, targetW, targetH);
      ctx.restore();

      // 2) Filtered foreground layer on an offscreen canvas. Guarded so any
      // failure here can NEVER blank the preview — the unfiltered base above
      // has already been drawn.
      try {
        const off = document.createElement("canvas");
        off.width = targetW; off.height = targetH;
        const octx = off.getContext("2d");
        octx.save();
        octx.filter = cssFilter();
        applyRot(octx);
        octx.drawImage(image.el, sx, sy, cropW, cropH, 0, 0, targetW, targetH);
        octx.restore();
        octx.filter = "none";

        // 3) Clip the filtered layer to the foreground only.
        octx.globalCompositeOperation = "destination-in";
        if (fgMask && fgMask.width && image.w) {
          const rx = fgMask.width / image.w;
          const ry = fgMask.height / image.h;
          octx.save();
          applyRot(octx);
          octx.drawImage(fgMask, sx * rx, sy * ry, cropW * rx, cropH * ry, 0, 0, targetW, targetH);
          octx.restore();
        } else {
          const ck = buildColorKeyMask(image.el, sx, sy, cropW, cropH, targetW, targetH);
          octx.drawImage(ck, 0, 0, targetW, targetH);
        }
        octx.globalCompositeOperation = "source-over";

        // 4) Composite the masked, filtered foreground over the base.
        ctx.drawImage(off, 0, 0);
      } catch (e) {
        // Base image already visible; skip the foreground-only overlay.
      }
    }
    // Skin retouch — luminance-diff edge-preserving smoother (surface-blur
    // family). Small luminance deviations (blemishes, fine lines, under-eye
    // circles, minor unevenness) are pulled towards the local LF colour;
    // large deviations (eyes, lips, hair, eyebrows) pass through untouched.
    // Because attenuation is driven by LUMINANCE only and applied UNIFORMLY
    // across R/G/B, hue and saturation are mathematically preserved. The
    // per-pixel LF (heavy blur) also preserves the local average colour so
    // overall brightness/tone doesn't shift — no makeup/filter look.
    if (adj.retouch) {
      const intensity = Math.min(1, Math.max(0.1, (adj.retouchIntensity ?? 60) / 100));
      const W = targetW, H = targetH;

      // Snapshot the pre-smoothing pixels
      const orig = ctx.getImageData(0, 0, W, H);

      // Build LF (heavy blur) into an offscreen canvas
      const lf = document.createElement("canvas");
      lf.width = W; lf.height = H;
      const lctx = lf.getContext("2d");
      const blurPx = Math.max(4, Math.round(W * (0.012 + 0.02 * intensity)));
      if ("filter" in lctx) {
        lctx.filter = `blur(${blurPx}px)`;
        lctx.drawImage(canvas, 0, 0);
        lctx.filter = "none";
      } else {
        const scale = 0.22;
        const tw = Math.max(4, Math.round(W * scale));
        const th = Math.max(4, Math.round(H * scale));
        const tmp = document.createElement("canvas");
        tmp.width = tw; tmp.height = th;
        const tctx = tmp.getContext("2d");
        tctx.imageSmoothingEnabled = true;
        tctx.imageSmoothingQuality = "high";
        tctx.drawImage(canvas, 0, 0, tw, th);
        lctx.imageSmoothingEnabled = true;
        lctx.imageSmoothingQuality = "high";
        lctx.drawImage(tmp, 0, 0, tw, th, 0, 0, W, H);
      }
      const lfData = lctx.getImageData(0, 0, W, H);

      // Thresholds (in luminance units, 0-255). Deviations under `lo` are
      // considered "skin texture / blemishes" — attenuate. Deviations above
      // `hi` are "features" — leave alone. Between the two we smoothstep so
      // there's no hard cutoff (which would create posterization).
      const lo = 4 + 2  * (1 - intensity);   // ~4-6
      const hi = 22 + 8 * (1 - intensity);   // ~22-30
      const clamp255 = (v) => v < 0 ? 0 : v > 255 ? 255 : v | 0;

      const od = orig.data, ld = lfData.data;
      for (let i = 0; i < od.length; i += 4) {
        const oR = od[i], oG = od[i + 1], oB = od[i + 2];
        const lR = ld[i], lG = ld[i + 1], lB = ld[i + 2];
        // Rec.601 luminance is fine here — we only need a relative edge signal
        const oL = 0.299 * oR + 0.587 * oG + 0.114 * oB;
        const lL = 0.299 * lR + 0.587 * lG + 0.114 * lB;
        const absDiff = oL > lL ? oL - lL : lL - oL;
        // strength=0 → replace with LF (blemish erased). strength=1 → keep original (feature preserved).
        let strength;
        if (absDiff <= lo) strength = 0;
        else if (absDiff >= hi) strength = 1;
        else {
          const t = (absDiff - lo) / (hi - lo);
          strength = t * t * (3 - 2 * t);
        }
        // Uniform strength across R/G/B → hue/saturation of the smoothed
        // value equals hue/saturation of the LF (which comes from surrounding
        // skin), so no colour cast.
        const nR = lR + (oR - lR) * strength;
        const nG = lG + (oG - lG) * strength;
        const nB = lB + (oB - lB) * strength;
        // Global intensity slider blends the smoothed pixel back with the
        // original, so operators can dial the strength from subtle to strong.
        od[i]     = clamp255(oR * (1 - intensity) + nR * intensity);
        od[i + 1] = clamp255(oG * (1 - intensity) + nG * intensity);
        od[i + 2] = clamp255(oB * (1 - intensity) + nB * intensity);
      }
      ctx.putImageData(orig, 0, 0);
    }
    return canvas;
  }, [image, spec, crop, rotate, adj, fgMask]);

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
    drawSingle();
    const single = singleCanvasRef.current;
    const gap = mmToPx(photoGap);
    let cols = layout.cols, rows = layout.rows;
    while (rows * cols < count) rows++;
    const cellW = mmToPx(spec.w);
    const cellH = mmToPx(spec.h);

    // Optional PNG watermark — drawn once PER photo (as many watermarks as
    // there are photos), positioned at the bottom of each cell and aligned
    // left / center / right (user selectable).
    let wmImg = null;
    if (watermark) {
      wmImg = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = watermark; });
    }
    const hasWm = !!wmImg;

    // When a watermark is present, open a 1 cm WHITE strip BELOW each photo
    // (taken from the paper area — the photo itself is NOT cropped) and place
    // the watermark there. The cut line falls under the watermark strip.
    const wmStrip = hasWm ? mmToPx(10) : 0;
    const cellTotalH = cellH + wmStrip;

    const blockW = cols * cellW + (cols - 1) * gap;
    const blockH = rows * cellTotalH + (rows - 1) * gap;
    // True centering — allow overflow into the paper's bleed area on both sides.
    // `sheetOffset` lets the operator nudge the block with the mouse.
    const startX = (pw - blockW) / 2 + mmToPx(sheetOffset.x);
    const startY = (ph - blockH) / 2 + mmToPx(sheetOffset.y);
    const colX = (c) => startX + c * (cellW + gap);
    const rowY = (r) => startY + r * (cellTotalH + gap);

    // Watermark drawn INSIDE the white strip (never over the photo). Position is
    // aligned left/center/right + movable up/down/left/right via wmNudge (mm).
    const drawWm = (x, y) => {
      if (!hasWm) return;
      const ratio = wmImg.width / wmImg.height;
      const marg = mmToPx(1.5);
      const availH = Math.max(1, wmStrip - marg * 2);
      const f = Math.max(0.3, Math.min(1, (wmScale - 4) / 36 * 0.7 + 0.3));
      let wmH = availH * f;
      let wmW = wmH * ratio;
      const maxW = cellW - marg * 2;
      if (wmW > maxW) { wmW = maxW; wmH = wmW / ratio; }
      const stripTop = y + cellH;
      let wx = wmAlign === "left" ? x + marg
             : wmAlign === "right" ? x + cellW - wmW - marg
             : x + (cellW - wmW) / 2;
      wx += mmToPx(wmNudge.x);
      wx = Math.max(x, Math.min(x + cellW - wmW, wx));
      let wy = stripTop + (wmStrip - wmH) / 2 + mmToPx(wmNudge.y);
      const wyMin = stripTop + marg;
      const wyMax = stripTop + wmStrip - wmH - marg;
      wy = Math.max(wyMin, Math.min(Math.max(wyMin, wyMax), wy));
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, wmOpacity / 100));
      ctx.drawImage(wmImg, wx, wy, wmW, wmH);
      ctx.restore();
    };

    let idx = 0;
    for (let r = 0; r < rows && idx < count; r++) {
      for (let c = 0; c < cols && idx < count; c++) {
        const x = colX(c), y = rowY(r);
        ctx.drawImage(single, x, y, cellW, cellH);
        if (hasWm) {
          // white strip (from paper) below the photo
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(x, y + cellH, cellW, wmStrip);
          drawWm(x, y);
        }
        idx++;
      }
    }

    // Cutting lines — thin gray dashed (or solid) at every cell boundary
    // INCLUDING the outer edges. Horizontal lines fall UNDER the watermark strip.
    if (cutWidth > 0) {
      ctx.strokeStyle = cutColor;
      ctx.lineWidth = Math.max(1, mmToPx(cutWidth));
      ctx.setLineDash(cutStyle === "solid" ? [] : [mmToPx(2), mmToPx(1)]);
      const off = gap > 0 ? gap / 2 : 0;
      for (let c = 0; c <= cols; c++) {
        let x = startX + c * (cellW + gap);
        if (c > 0 && c < cols) x -= off;
        if (c === cols) x -= gap;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ph); ctx.stroke();
      }
      for (let r = 0; r <= rows; r++) {
        let y = startY + r * (cellTotalH + gap);
        if (r > 0 && r < rows) y -= off;
        if (r === rows) y -= gap;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(pw, y); ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Code label — small marker in the bottom bleed strip
    ctx.fillStyle = "#666";
    ctx.font = `${mmToPx(2.5)}px sans-serif`;
    ctx.fillText(code, mmToPx(2), ph - mmToPx(2));
    return canvas;
  }, [image, spec, paper, layout, count, cutColor, cutWidth, cutStyle, watermark, code, drawSingle, photoGap, sheetOffset, wmAlign, wmScale, wmOpacity, wmNudge]);

  // When spec changes, re-run auto detection so the aspect matches the new format
  useEffect(() => {
    if (image?.el && autoDetected) {
      runAutoDetect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specCode]);

  // Redraw whenever inputs change
  useEffect(() => { if (image) { drawSingle(); if (layoutMode === "standart") drawSheet(); } }, [image, spec, crop, rotate, adj, cutColor, cutWidth, cutStyle, watermark, count, paperCode, fgMask, drawSingle, drawSheet, layoutMode]);

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

  const quickPrint = async () => {
    if (!image) { toast.error("Önce fotoğraf yükleyin"); return; }
    if (spec?.digitalOnly) { toast.error("Bu ebat yalnızca dijital indirilebilir, baskıya girmez."); return; }
    await drawSheet();
    const dataUrl = sheetCanvasRef.current?.toDataURL("image/jpeg", 0.95);
    if (!dataUrl) { toast.error("Baskı verisi hazırlanamadı"); return; }
    const ok = printImageSheet(dataUrl, { widthMm: paper.w, heightMm: paper.h, title: `${code} · ${count}'li Baskı` });
    if (!ok) { toast.error("Baskı penceresi açılamadı — açılır pencere iznini verin"); return; }
    toast.success("Baskı penceresi açıldı");
  };

  // ---- Faz 1: Özel ebat (mm + DPI) ----------------------------------------
  const addCustomSpec = () => {
    const w = parseFloat(customForm.w), h = parseFloat(customForm.h), dpi = parseInt(customForm.dpi, 10) || 300;
    if (!(w > 0 && h > 0)) { toast.error("Geçerli en/boy (mm) girin"); return; }
    const label = (customForm.label || `Özel ${w}×${h}mm`).trim();
    const codeId = `custom-${Date.now()}`;
    const newSpec = { code: codeId, country: "ÖZEL", label: `${label} (${w}×${h}mm · ${dpi}dpi)`, w, h, bg: "#ffffff", format: "biometric", dpi, custom: true };
    setCustomSpecs(saveCustomSpec(newSpec));
    setCustomForm({ label: "", w: "", h: "", dpi: 300 });
    setSpecCode(codeId);
    toast.success("Özel ebat kaydedildi ve seçildi");
  };
  const removeCustomSpec = (codeId) => {
    setCustomSpecs(deleteCustomSpec(codeId));
    if (specCode === codeId) setSpecCode("tr-bio");
    toast.info("Özel ebat silindi");
  };

  // ---- Faz 1: Dijital indirme (tam px + max KB) ----------------------------
  const digitalDownload = async () => {
    if (!image || !singleCanvasRef.current) { toast.error("Önce fotoğraf yükleyin"); return; }
    drawSingle();
    const src = singleCanvasRef.current;
    let dataUrl;
    if (spec?.exactPx) dataUrl = exportExactPx(src, spec.exactPx, spec.maxKb || 100);
    else dataUrl = canvasToJpegMaxKb(src, spec?.maxKb || 200);
    const a = document.createElement("a");
    a.href = dataUrl; a.download = `${code}_dijital.jpg`; a.click();
    await saveToArchive();
    toast.success(spec?.exactPx ? `Dijital indirildi (${spec.exactPx.w}×${spec.exactPx.h}px)` : "Dijital indirildi");
  };

  // ---- Faz 1: Kombin (AutoLayout) baskı ------------------------------------
  const addComboItem = () => setComboItems((it) => [...it, { specCode: specCode, count: 1 }]);
  const updateComboItem = (i, patch) => setComboItems((it) => it.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const removeComboItem = (i) => setComboItems((it) => it.filter((_, idx) => idx !== i));

  const drawCombo = useCallback(() => {
    if (layoutMode !== "kombin" || !image || !sheetCanvasRef.current || !paper) return;
    if (!comboItems.length) return;
    drawSingle();
    const source = singleCanvasRef.current;
    if (!source) return;
    const items = comboItems
      .map((ci) => ({ spec: allSpecs.find((s) => s.code === ci.specCode), count: Math.max(1, ci.count | 0) }))
      .filter((x) => x.spec && !x.spec.digitalOnly);
    if (!items.length) return;
    drawComboSheet(sheetCanvasRef.current, source, items, paper, {
      marginMm: sheetMargin, gapMm: photoGap, dpi: 300,
      cutMarks: cutWidth > 0, cutColor, cutWidthMm: cutWidth, cutStyle, code,
    });
  }, [layoutMode, image, comboItems, paper, allSpecs, sheetMargin, photoGap, cutWidth, cutColor, cutStyle, code, drawSingle]);

  useEffect(() => { if (layoutMode === "kombin") drawCombo(); }, [layoutMode, drawCombo]);

  const printCombo = async () => {
    if (!image) { toast.error("Önce fotoğraf yükleyin"); return; }
    if (!comboItems.length) { toast.error("Dizilime en az bir ebat ekleyin"); return; }
    drawCombo();
    const dataUrl = sheetCanvasRef.current?.toDataURL("image/jpeg", 0.95);
    if (!dataUrl) { toast.error("Baskı verisi hazırlanamadı"); return; }
    const ok = printImageSheet(dataUrl, { widthMm: paper.w, heightMm: paper.h, title: `${code} · Kombin Baskı` });
    if (!ok) { toast.error("Baskı penceresi açılamadı"); return; }
    toast.success("Kombin baskı penceresi açıldı");
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
                <label className="mt-4 inline-flex items-center gap-2 text-xs text-slate-600 select-none cursor-pointer" data-testid="auto-bg-toggle-label">
                  <Switch checked={autoBg} onCheckedChange={setAutoBg} data-testid="auto-bg-toggle" />
                  <span>Yüklerken arka planı otomatik temizle (beyaz)</span>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Preview */}
          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-lg">Önizleme</CardTitle></CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <div className="text-xs text-slate-500 mb-2">Tekli — {spec?.label} ({spec?.w}×{spec?.h}mm) <span className="text-[10px] text-slate-400">· fare ile sürükleyebilirsin</span></div>
                  <div className="relative bg-slate-100 p-2 rounded flex items-center justify-center min-h-[200px]">
                    <canvas
                      ref={singleCanvasRef}
                      onPointerDown={onSinglePointerDown}
                      onPointerMove={onSinglePointerMove}
                      onPointerUp={onSinglePointerUp}
                      onPointerLeave={onSinglePointerUp}
                      className="max-w-full max-h-[350px] shadow touch-none cursor-move"
                      data-testid="canvas-single"
                    />
                    {bgProcessing && (
                      <div className="absolute inset-0 rounded bg-white/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-10" data-testid="bg-processing-overlay">
                        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                        <div className="text-sm font-medium text-slate-900">Arka plan temizleniyor…</div>
                        <div className="w-48 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                          <div className="h-full bg-emerald-500 transition-all duration-200" style={{ width: `${Math.round(bgProgress * 100)}%` }} data-testid="bg-processing-progress" />
                        </div>
                        <div className="text-[11px] text-slate-500">İlk kullanımda model indiriliyor (~40 MB, tarayıcıda önbelleklenir)</div>
                      </div>
                    )}
                  </div>
                  {bgRemoved && !bgProcessing && (
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className="text-emerald-700 bg-emerald-50 rounded px-2 py-1 inline-flex items-center gap-1" data-testid="bg-removed-badge">
                        <Eraser className="w-3.5 h-3.5" /> Arka plan temizlendi
                      </span>
                      <Button size="sm" variant="ghost" onClick={revertBackground} className="h-7 text-xs text-slate-600" data-testid="bg-revert-btn">Orijinale dön</Button>
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-2">Baskı — {paper?.label} · {count} adet <span className="text-[10px] text-slate-400">· fare ile kaydırabilirsin</span></div>
                  <div className="bg-slate-100 p-2 rounded flex items-center justify-center min-h-[200px]">
                    <canvas
                      ref={sheetCanvasRef}
                      onPointerDown={onSheetPointerDown}
                      onPointerMove={onSheetPointerMove}
                      onPointerUp={onSheetPointerUp}
                      onPointerLeave={onSheetPointerUp}
                      className="max-w-full max-h-[350px] shadow touch-none cursor-move"
                      data-testid="canvas-sheet"
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 mt-6">
                <Button onClick={runAutoDetect} disabled={!image || detecting || bgProcessing} variant="outline" className="border-emerald-600 text-emerald-700 hover:bg-emerald-50" data-testid="auto-detect-btn">
                  {detecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ScanFace className="w-4 h-4 mr-2" />}
                  {detecting ? "Yüz taranıyor..." : "Otomatik Yüz Tespiti"}
                </Button>
                <Button onClick={removeBgNow} disabled={!originalImage || bgProcessing} variant="outline" className="border-indigo-600 text-indigo-700 hover:bg-indigo-50" data-testid="bg-remove-btn">
                  {bgProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eraser className="w-4 h-4 mr-2" />}
                  {bgProcessing ? "İşleniyor..." : (bgRemoved ? "Tekrar Temizle" : "Arka Planı Temizle")}
                </Button>
                <Button onClick={() => setRetouchOpen(true)} disabled={!image || bgProcessing} variant="outline" className="border-fuchsia-600 text-fuchsia-700 hover:bg-fuchsia-50" data-testid="retouch-open-btn">
                  <Paintbrush className="w-4 h-4 mr-2" />Rötuş Fırçası
                </Button>
                <Button onClick={downloadSingle} disabled={bgProcessing} className="bg-slate-900 hover:bg-slate-800" data-testid="download-single-btn"><Download className="w-4 h-4 mr-2" />Tekli İndir</Button>
                <Button onClick={digitalDownload} disabled={bgProcessing || !image} className="bg-indigo-600 hover:bg-indigo-700" data-testid="digital-download-btn"><Download className="w-4 h-4 mr-2" />Dijital İndir{spec?.exactPx ? ` (${spec.exactPx.w}×${spec.exactPx.h}px)` : spec?.maxKb ? ` (≤${spec.maxKb}KB)` : ""}</Button>
                <Button onClick={downloadSheet} disabled={bgProcessing || spec?.digitalOnly} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40" data-testid="download-sheet-btn"><Printer className="w-4 h-4 mr-2" />Baskıya Hazır İndir</Button>
                <Button onClick={quickPrint} disabled={bgProcessing || spec?.digitalOnly} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40" data-testid="quick-print-btn"><Printer className="w-4 h-4 mr-2" />Hızlı Baskı</Button>
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
            <CardHeader><CardTitle className="text-lg">Ölçü & Kağıt</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Ülke / Format</Label>
                <Select value={specCode} onValueChange={setSpecCode}>
                  <SelectTrigger data-testid="select-spec"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {allSpecs.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}{s.custom ? "" : ` (${s.w}×${s.h}mm)`}</SelectItem>)}
                  </SelectContent>
                </Select>
                {spec?.digitalOnly && <div className="mt-1 text-[10px] text-indigo-700 bg-indigo-50 rounded px-2 py-1">Bu ebat yalnızca dijital indirilir, baskıya girmez.</div>}
                {spec?.custom && (
                  <button type="button" onClick={() => removeCustomSpec(spec.code)} data-testid="custom-spec-remove" className="mt-1 text-[10px] text-red-600 hover:underline">Bu özel ebatı sil</button>
                )}
              </div>

              {/* Özel ebat tanımlama (mm + DPI) */}
              <details className="rounded-lg border border-slate-200 bg-slate-50 p-2" data-testid="custom-spec-panel">
                <summary className="text-xs font-medium text-slate-700 cursor-pointer">+ Özel Ebat Tanımla (mm & DPI)</summary>
                <div className="mt-2 space-y-2">
                  <Input value={customForm.label} onChange={(e) => setCustomForm((f) => ({ ...f, label: e.target.value }))} placeholder="Ad (örn. Ehliyet)" className="h-8 text-xs" data-testid="custom-spec-label" />
                  <div className="grid grid-cols-3 gap-1.5">
                    <Input type="number" step="0.1" value={customForm.w} onChange={(e) => setCustomForm((f) => ({ ...f, w: e.target.value }))} placeholder="En mm" className="h-8 text-xs" data-testid="custom-spec-w" />
                    <Input type="number" step="0.1" value={customForm.h} onChange={(e) => setCustomForm((f) => ({ ...f, h: e.target.value }))} placeholder="Boy mm" className="h-8 text-xs" data-testid="custom-spec-h" />
                    <Input type="number" step="1" value={customForm.dpi} onChange={(e) => setCustomForm((f) => ({ ...f, dpi: e.target.value }))} placeholder="DPI" className="h-8 text-xs" data-testid="custom-spec-dpi" />
                  </div>
                  <Button size="sm" onClick={addCustomSpec} className="w-full h-8 bg-slate-900 hover:bg-slate-800 text-xs" data-testid="custom-spec-add">Ebatı Kaydet & Seç</Button>
                </div>
              </details>
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

              {/* Kağıt Dizilim Sihirbazı — Standart / Kombin */}
              <div className="pt-2 border-t border-slate-200">
                <Label className="text-xs flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Kağıt Dizilimi</Label>
                <div className="grid grid-cols-2 gap-1 mt-1 p-1 bg-slate-100 rounded-lg text-xs" data-testid="layout-mode-switch">
                  <button type="button" data-testid="layout-mode-standart" onClick={() => setLayoutMode("standart")}
                    className={`py-2 rounded-md transition-colors ${layoutMode === "standart" ? "bg-slate-900 text-white font-semibold" : "text-slate-600 hover:bg-slate-200"}`}>Standart</button>
                  <button type="button" data-testid="layout-mode-kombin" onClick={() => setLayoutMode("kombin")}
                    className={`py-2 rounded-md transition-colors ${layoutMode === "kombin" ? "bg-emerald-600 text-white font-semibold" : "text-slate-600 hover:bg-emerald-50"}`}>Kombin</button>
                </div>

                {layoutMode === "kombin" && (
                  <div className="mt-2 space-y-2" data-testid="combo-builder">
                    <p className="text-[10px] text-slate-500">Aynı kişinin fotoğrafını tek kağıda farklı ebatlarda dizin (örn. 2 Biyometrik + 2 Vesikalık).</p>
                    {comboItems.map((ci, i) => (
                      <div key={i} className="flex items-center gap-1.5" data-testid={`combo-item-${i}`}>
                        <Select value={ci.specCode} onValueChange={(v) => updateComboItem(i, { specCode: v })}>
                          <SelectTrigger data-testid={`combo-spec-${i}`} className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                          <SelectContent className="max-h-64">
                            {allSpecs.filter((s) => !s.digitalOnly).map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input type="number" min={1} max={20} value={ci.count} onChange={(e) => updateComboItem(i, { count: Math.max(1, Number(e.target.value) || 1) })} className="h-8 w-14 text-xs" data-testid={`combo-count-${i}`} />
                        <button type="button" onClick={() => removeComboItem(i)} data-testid={`combo-remove-${i}`} className="text-red-500 hover:bg-red-50 rounded p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={addComboItem} data-testid="combo-add" className="w-full h-8 text-xs">+ Ebat Ekle</Button>
                    <div>
                      <div className="flex items-center justify-between text-[11px] mb-1"><Label>Kenar boşluğu</Label><span className="text-slate-500">{sheetMargin} mm</span></div>
                      <input type="range" min={0} max={10} step={0.5} value={sheetMargin} onChange={(e) => setSheetMargin(Number(e.target.value))} className="w-full" data-testid="combo-margin" />
                    </div>
                    <Button onClick={printCombo} data-testid="combo-print-btn" className="w-full h-9 bg-blue-600 hover:bg-blue-700 gap-1.5"><Printer className="w-4 h-4" /> Kombin Baskı</Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Sparkles className="w-4 h-4" />İnce Ayar</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-base">
              {[
                { k: "brightness", label: "Parlaklık", min: 50, max: 150 },
                { k: "contrast",   label: "Kontrast",  min: 50, max: 150 },
                { k: "saturation", label: "Doygunluk", min: 0,  max: 200 },
                { k: "warmth",     label: "Sıcaklık (Kelvin)", min: -50, max: 50 },
                { k: "sharpness",  label: "Keskinlik", min: 0,  max: 100 },
              ].map((s) => (
                <div key={s.k}>
                  <div className="flex justify-between text-sm"><span className="font-medium">{s.label}</span><span className="tabular-nums text-slate-700">{adj[s.k]}</span></div>
                  <input type="range" min={s.min} max={s.max} value={adj[s.k]} onChange={(e) => setAdj({ ...adj, [s.k]: Number(e.target.value) })} className="w-full h-2 mt-1 cursor-pointer" data-testid={`adj-${s.k}`} />
                </div>
              ))}
              <label className="flex items-center gap-3 pt-2">
                <Switch checked={adj.retouch} onCheckedChange={(v) => setAdj({ ...adj, retouch: v })} data-testid="switch-retouch" />
                <span className="text-base font-medium">Rötuş (cilt yumuşatma)</span>
              </label>
              {adj.retouch && (
                <div className="pl-1" data-testid="retouch-intensity-wrap">
                  <div className="flex justify-between text-sm mb-1"><span className="font-medium">Yumuşatma Şiddeti</span><span className="tabular-nums text-slate-700">{adj.retouchIntensity}%</span></div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={adj.retouchIntensity}
                    onChange={(e) => setAdj({ ...adj, retouchIntensity: Number(e.target.value) })}
                    className="w-full h-2 rounded-full appearance-none cursor-pointer bg-red-100"
                    style={{ accentColor: "#dc2626" }}
                    data-testid="retouch-intensity"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-lg">Kesim Çizgisi & Filigran</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Label className="text-xs">Renk</Label>
                <input type="color" value={cutColor} onChange={(e) => setCutColor(e.target.value)} className="w-10 h-8 rounded" data-testid="cut-color" />
                <Label className="text-xs">Kalınlık (mm)</Label>
                <Input type="number" step="0.1" min="0" max="3" value={cutWidth} onChange={(e) => setCutWidth(Number(e.target.value))} className="w-20" data-testid="cut-width" />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <Label>Çizgi Stili</Label>
                  <span className="inline-flex items-center gap-2 text-slate-500">
                    <svg width="52" height="10" data-testid="cut-style-preview">
                      <line x1="1" y1="5" x2="51" y2="5" stroke={cutColor}
                        strokeWidth={Math.max(1, Math.round(cutWidth * 2))}
                        strokeDasharray={cutStyle === "solid" ? "none" : "6 3"} />
                    </svg>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg text-xs" data-testid="cut-style-switch">
                  <button
                    type="button"
                    onClick={() => setCutStyle("dashed")}
                    className={`py-2 rounded-md transition-colors ${cutStyle === "dashed" ? "bg-emerald-600 text-white shadow font-semibold" : "text-slate-600"}`}
                    data-testid="cut-style-dashed"
                  >
                    Kesikli
                  </button>
                  <button
                    type="button"
                    onClick={() => setCutStyle("solid")}
                    className={`py-2 rounded-md transition-colors ${cutStyle === "solid" ? "bg-emerald-600 text-white shadow font-semibold" : "text-slate-600"}`}
                    data-testid="cut-style-solid"
                  >
                    Düz
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[11px] text-slate-500">Hızlı renk:</span>
                  {["#9ca3af", "#000000", "#ffffff", "#dc2626", "#0369a1"].map((hc) => (
                    <button
                      key={hc}
                      type="button"
                      onClick={() => setCutColor(hc)}
                      className={`h-5 w-5 rounded border ${cutColor === hc ? "ring-2 ring-emerald-500 border-slate-900" : "border-slate-300"}`}
                      style={{ backgroundColor: hc }}
                      title={hc}
                      data-testid={`cut-color-${hc.substring(1)}`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <Label>Fotoğraflar arası boşluk</Label>
                  <span className="text-slate-500">{photoGap} mm</span>
                </div>
                <input type="range" min={0} max={5} step={0.5} value={photoGap} onChange={(e) => setPhotoGap(Number(e.target.value))} className="w-full" data-testid="photo-gap" />
              </div>

              <div>
                <Label className="text-xs">Filigran PNG (fotoğrafın ALTINDAKİ beyaz alana)</Label>
                <Input type="file" accept="image/png,image/jpeg" onChange={(e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  const r = new FileReader(); r.onload = () => setWatermark(r.result); r.readAsDataURL(f);
                }} data-testid="watermark-upload" />
                {watermark && (
                  <div className="mt-2 flex items-center gap-2">
                    <img src={watermark} alt="wm" className="h-10 border" />
                    <Button size="sm" variant="outline" onClick={() => { setWatermark(null); setWmNudge({ x: 0, y: 0 }); }} data-testid="watermark-remove">Kaldır</Button>
                  </div>
                )}
                {watermark && (
                  <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">
                    Filigran seçildiğinde her fotoğrafın <b>altında 1 cm beyaz alan</b> açılır (fotoğraf kırpılmaz, alan kağıttan açılır) ve filigran oraya yerleştirilir. Kesim çizgisi filigranın altından geçer.
                  </p>
                )}
              </div>

              {watermark && (
                <>
                  <div>
                    <Label className="text-xs">Filigran Konumu (beyaz alan içinde)</Label>
                    <div className="grid grid-cols-3 gap-1 mt-1 p-1 bg-slate-100 rounded-lg text-xs" data-testid="wm-align-switch">
                      {[
                        { k: "left", label: "Sol" },
                        { k: "center", label: "Orta" },
                        { k: "right", label: "Sağ" },
                      ].map((o) => (
                        <button
                          key={o.k}
                          type="button"
                          onClick={() => setWmAlign(o.k)}
                          className={`py-2 rounded-md transition-colors ${wmAlign === o.k ? "bg-emerald-600 text-white shadow font-semibold" : "text-slate-600 hover:bg-emerald-50"}`}
                          data-testid={`wm-align-${o.k}`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Fine movement inside the white strip — up/down/left/right/center */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <Label className="flex items-center gap-1"><Move className="w-3 h-3" /> Filigran İnce Konum</Label>
                      <span className="text-slate-500">{wmNudge.x}·{wmNudge.y} mm</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 w-32 mx-auto">
                      <span />
                      <button type="button" data-testid="wm-move-up" onClick={() => setWmNudge((n) => ({ ...n, y: Math.round((n.y - 0.5) * 10) / 10 }))} className="py-1.5 rounded-md bg-slate-100 hover:bg-emerald-50 text-slate-700 grid place-items-center"><ChevronUp className="w-4 h-4" /></button>
                      <span />
                      <button type="button" data-testid="wm-move-left" onClick={() => setWmNudge((n) => ({ ...n, x: Math.round((n.x - 0.5) * 10) / 10 }))} className="py-1.5 rounded-md bg-slate-100 hover:bg-emerald-50 text-slate-700 grid place-items-center"><ChevronLeft className="w-4 h-4" /></button>
                      <button type="button" data-testid="wm-move-center" onClick={() => { setWmAlign("center"); setWmNudge({ x: 0, y: 0 }); }} className="py-1.5 rounded-md bg-slate-100 hover:bg-emerald-50 text-slate-700 grid place-items-center text-[10px] font-semibold">Orta</button>
                      <button type="button" data-testid="wm-move-right" onClick={() => setWmNudge((n) => ({ ...n, x: Math.round((n.x + 0.5) * 10) / 10 }))} className="py-1.5 rounded-md bg-slate-100 hover:bg-emerald-50 text-slate-700 grid place-items-center"><ChevronRight className="w-4 h-4" /></button>
                      <span />
                      <button type="button" data-testid="wm-move-down" onClick={() => setWmNudge((n) => ({ ...n, y: Math.round((n.y + 0.5) * 10) / 10 }))} className="py-1.5 rounded-md bg-slate-100 hover:bg-emerald-50 text-slate-700 grid place-items-center"><ChevronDown className="w-4 h-4" /></button>
                      <span />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <Label>Filigran Boyutu</Label>
                      <span className="text-slate-500">{wmScale}%</span>
                    </div>
                    <input type="range" min={4} max={40} step={1} value={wmScale} onChange={(e) => setWmScale(Number(e.target.value))} className="w-full" data-testid="wm-scale" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <Label>Filigran Şeffaflığı</Label>
                      <span className="text-slate-500">{wmOpacity}%</span>
                    </div>
                    <input type="range" min={20} max={100} step={5} value={wmOpacity} onChange={(e) => setWmOpacity(Number(e.target.value))} className="w-full" data-testid="wm-opacity" />
                  </div>
                </>
              )}

              <div className="pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between text-xs mb-1">
                  <Label className="flex items-center gap-1"><Move className="w-3 h-3" />Manuel Konum (mm)</Label>
                  <Button size="sm" variant="ghost" onClick={() => setSheetOffset({ x: 0, y: 0 })} className="h-6 text-[10px]" data-testid="sheet-offset-reset">Sıfırla</Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-slate-500">Yatay</Label>
                    <Input type="number" step="0.5" value={sheetOffset.x} onChange={(e) => setSheetOffset({ ...sheetOffset, x: Number(e.target.value) })} className="h-8 text-xs" data-testid="sheet-offset-x" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-500">Dikey</Label>
                    <Input type="number" step="0.5" value={sheetOffset.y} onChange={(e) => setSheetOffset({ ...sheetOffset, y: Number(e.target.value) })} className="h-8 text-xs" data-testid="sheet-offset-y" />
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">Baskı önizlemesini fare ile sürükleyerek de kaydırabilirsin.</div>
              </div>
            </CardContent>
          </Card>

          {/* Archive */}
          <PhotoStudio
            image={image}
            applyImage={applyImage}
            originalSrc={originalImage?.src}
            loadImageFromSrc={loadImageFromSrc}
          />

          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-lg">Son 10 Fotoğraf (Arşiv)</CardTitle></CardHeader>
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

      <RetouchBrush
        open={retouchOpen}
        onOpenChange={setRetouchOpen}
        imageSrc={image?.src}
        color={spec?.bg || "#ffffff"}
        onApply={applyRetouch}
      />
    </div>
  );
};

export default AdminPassportPhoto;

// (RetouchBrush dialog is rendered at the bottom of the component tree via the
// wrapper below to keep the JSX changes small.)
