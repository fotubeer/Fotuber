import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Upload,
  ImageDown,
  Printer,
  Wand2,
  Eraser,
  SunMedium,
  Contrast,
  Thermometer,
  Loader2,
  Brush,
  ScanFace,
  RotateCcw,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Slider } from "../../components/ui/slider";
import { Input } from "../../components/ui/input";
import { PhotoStudio } from "../../components/PhotoStudio";
import { detectFace, cropFromFace } from "../../lib/faceDetect";
import { compositeOnColor } from "../../lib/bgRemove";
import { drawSingle, drawSheet } from "../../lib/render";
import { getSpec, sheetLayout, PHOTO_SIZES, mmToPx } from "../../lib/passport";

const SAMPLES = ["/sample1.jpg", "/sample2.jpg"];

const BG_COLORS = ["#ffffff", "#f1f5f9", "#dbeafe", "#e0f2fe", "#ede9fe"];

const DEFAULT_ADJ = { brightness: 1, contrast: 1, temp: 0 };

function download(filename, canvas) {
  const a = document.createElement("a");
  a.download = filename;
  a.href = canvas.toDataURL("image/jpeg", 0.95);
  a.click();
}

function retouchAt(ctx, cx, cy, r) {
  const x0 = Math.max(0, Math.floor(cx - r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const x1 = Math.min(ctx.canvas.width, Math.ceil(cx + r));
  const y1 = Math.min(ctx.canvas.height, Math.ceil(cy + r));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return;
  const img = ctx.getImageData(x0, y0, w, h);
  const p = img.data;
  const src = new Uint8ClampedArray(p);
  const rad = 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x0 + x - cx;
      const dy = y0 + y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > r) continue;
      let ar = 0,
        ag = 0,
        ab = 0,
        n = 0;
      for (let ky = -rad; ky <= rad; ky++) {
        for (let kx = -rad; kx <= rad; kx++) {
          const nx = x + kx;
          const ny = y + ky;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = (ny * w + nx) * 4;
          ar += src[j];
          ag += src[j + 1];
          ab += src[j + 2];
          n++;
        }
      }
      const i = (y * w + x) * 4;
      const blend = (1 - dist / r) * 0.8;
      p[i] += (ar / n - p[i]) * blend;
      p[i + 1] += (ag / n - p[i + 1]) * blend;
      p[i + 2] += (ab / n - p[i + 2]) * blend;
    }
  }
  ctx.putImageData(img, x0, y0);
}

export default function AdminPassportPhoto() {
  const [mode, setMode] = useState("edit"); // 'edit' | 'print'
  const [originalImage, setOriginalImage] = useState(null); // { el, src }
  const [image, setImage] = useState(null); // { el }
  const [crop, setCrop] = useState(null);
  const [autoDetected, setAutoDetected] = useState(false);
  const [detectMsg, setDetectMsg] = useState("");
  const [fgMask, setFgMask] = useState(null);
  const [bgColor, setBgColor] = useState("#ffffff");
  const [bgRemoved, setBgRemoved] = useState(false);
  const [adj, setAdj] = useState(DEFAULT_ADJ);
  const [sizeKey, setSizeKey] = useState("50x60");
  const [busy, setBusy] = useState("");
  const [retouchOn, setRetouchOn] = useState(false);
  const [brush, setBrush] = useState(28);
  const [wm, setWm] = useState({
    text: "FOTUBER",
    opacity: 0.5,
    size: 45,
    align: "center",
    color: "#64748b",
    gapPx: 0,
  });

  const canvasRef = useRef(null);
  const srcCanvasRef = useRef(document.createElement("canvas"));
  const lastImgRef = useRef(null);
  const fileInputRef = useRef(null);
  const drawing = useRef(false);

  const spec = getSpec(sizeKey, bgColor);
  const layout = sheetLayout(spec);
  const bandPx = mmToPx(4 + (wm.size / 100) * 10);

  const loadImageFromSrc = useCallback(
    (src) =>
      new Promise((resolve, reject) => {
        const im = new Image();
        im.crossOrigin = "anonymous";
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = src;
      }),
    [],
  );

  const applyImage = useCallback((el, opts = {}) => {
    setImage({ el });
    if (!opts.keepCrop) setAutoDetected(false);
  }, []);

  // Automatic face detection whenever a fresh base image is loaded.
  useEffect(() => {
    if (!image?.el || autoDetected) return;
    let cancelled = false;
    (async () => {
      setBusy("detect");
      setDetectMsg("Yüz tespit ediliyor…");
      const box = await detectFace(image.el);
      if (cancelled) return;
      const c = cropFromFace(box, image.el, spec.aspect);
      setCrop(c);
      setAutoDetected(true);
      setDetectMsg(
        box.source === "fallback"
          ? "Yüz bulunamadı — otomatik ortalandı."
          : "Yüz tespit edildi.",
      );
      setBusy("");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, autoDetected]);

  // Keep the working source canvas in sync with the current image element.
  const syncSrc = useCallback(() => {
    if (!image?.el || lastImgRef.current === image.el) return;
    const el = image.el;
    const c = srcCanvasRef.current;
    c.width = el.naturalWidth || el.width;
    c.height = el.naturalHeight || el.height;
    c.getContext("2d").drawImage(el, 0, 0);
    lastImgRef.current = el;
  }, [image]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image?.el || !crop) return;
    syncSrc();
    const src = srcCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (mode === "edit") {
      canvas.width = spec.pxW;
      canvas.height = spec.pxH;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawSingle(ctx, 0, 0, spec.pxW, spec.pxH, src, crop, adj, spec, fgMask);
    } else {
      canvas.width = layout.pw;
      canvas.height = layout.ph;
      drawSheet(ctx, layout, src, crop, adj, spec, fgMask, {
        ...wm,
        bandPx,
      });
    }
  }, [image, crop, adj, spec, fgMask, mode, layout, wm, bandPx, syncSrc]);

  useEffect(() => {
    render();
  }, [render]);

  const resetState = () => {
    setFgMask(null);
    setBgRemoved(false);
    setAdj(DEFAULT_ADJ);
    setRetouchOn(false);
    lastImgRef.current = null;
  };

  const handleFile = async (file) => {
    if (!file) return;
    setBusy("load");
    const reader = new FileReader();
    reader.onload = async () => {
      const el = await loadImageFromSrc(reader.result);
      resetState();
      setOriginalImage({ el, src: reader.result });
      applyImage(el);
      setBusy("");
    };
    reader.readAsDataURL(file);
  };

  const loadSample = async (idx) => {
    setBusy("load");
    try {
      const el = await loadImageFromSrc(SAMPLES[idx]);
      resetState();
      setOriginalImage({ el, src: SAMPLES[idx] });
      applyImage(el);
    } catch (e) {
      setDetectMsg("Örnek yüklenemedi.");
    }
    setBusy("");
  };

  const doRemoveBg = async () => {
    if (!image?.el) return;
    setBusy("bg");
    try {
      const { dataUrl, mask } = compositeOnColor(image.el, bgColor);
      const el = await loadImageFromSrc(dataUrl);
      setFgMask(mask);
      setBgRemoved(true);
      applyImage(el, { keepCrop: true });
    } catch (e) {
      setDetectMsg("Arka plan temizlenemedi.");
    }
    setBusy("");
  };

  const reDetect = async () => {
    if (!image?.el) return;
    setAutoDetected(false);
  };

  // When bg is already removed and color changes, re-composite.
  const changeBg = async (color) => {
    setBgColor(color);
    if (bgRemoved && originalImage?.el) {
      setBusy("bg");
      try {
        const { dataUrl, mask } = compositeOnColor(originalImage.el, color);
        const el = await loadImageFromSrc(dataUrl);
        setFgMask(mask);
        applyImage(el, { keepCrop: true });
      } catch (e) {
        /* ignore */
      }
      setBusy("");
    }
  };

  const doDownloadSingle = () => {
    const c = document.createElement("canvas");
    c.width = spec.pxW;
    c.height = spec.pxH;
    syncSrc();
    drawSingle(
      c.getContext("2d"),
      0,
      0,
      spec.pxW,
      spec.pxH,
      srcCanvasRef.current,
      crop,
      adj,
      spec,
      fgMask,
    );
    download("vesikalik.jpg", c);
  };

  const doDownloadSheet = () => {
    const c = document.createElement("canvas");
    c.width = layout.pw;
    c.height = layout.ph;
    syncSrc();
    drawSheet(
      c.getContext("2d"),
      layout,
      srcCanvasRef.current,
      crop,
      adj,
      spec,
      fgMask,
      { ...wm, bandPx },
    );
    download("baski-sablonu.jpg", c);
  };

  // Retouch brush handlers (edit mode only).
  const canvasPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy,
    };
  };

  const applyBrush = (e) => {
    if (!retouchOn || mode !== "edit" || !crop) return;
    const pt = canvasPoint(e);
    const src = srcCanvasRef.current;
    const iw = src.width;
    const ih = src.height;
    // canvas(target) coords -> source crop coords
    const sx = crop.fx * iw + (pt.x / spec.pxW) * crop.fw * iw;
    const sy = crop.fy * ih + (pt.y / spec.pxH) * crop.fh * ih;
    const rSrc = (brush / spec.pxW) * crop.fw * iw;
    retouchAt(src.getContext("2d", { willReadFrequently: true }), sx, sy, rSrc);
    render();
  };

  const onPointerDown = (e) => {
    if (!retouchOn || mode !== "edit") return;
    drawing.current = true;
    applyBrush(e);
  };
  const onPointerMove = (e) => {
    if (drawing.current) applyBrush(e);
  };
  const onPointerUp = async () => {
    if (!drawing.current) return;
    drawing.current = false;
    // Commit brushed pixels back to the image (keep framing & mask).
    const el = await loadImageFromSrc(srcCanvasRef.current.toDataURL("image/png"));
    lastImgRef.current = el; // avoid immediate re-sync overwrite
    applyImage(el, { keepCrop: true });
  };

  const hasImage = !!image?.el;

  return (
    <div
      className="h-screen w-full flex overflow-hidden bg-zinc-950 text-zinc-100 font-manrope"
      data-testid="passport-editor"
    >
      {/* Left toolbar */}
      <div className="w-16 flex-shrink-0 border-r border-zinc-800 bg-zinc-900 flex flex-col items-center py-4 gap-2 z-10">
        <div className="mb-2 h-8 w-8 rounded-sm bg-cyan-500 text-black grid place-items-center font-bold">
          F
        </div>
        <ToolIcon
          testid="mode-edit-btn"
          active={mode === "edit"}
          onClick={() => setMode("edit")}
          label="Düzenle"
          icon={<Wand2 size={20} strokeWidth={1.5} />}
        />
        <ToolIcon
          testid="mode-print-btn"
          active={mode === "print"}
          onClick={() => setMode("print")}
          label="Baskı"
          icon={<Printer size={20} strokeWidth={1.5} />}
        />
        <ToolIcon
          testid="retouch-toggle-btn"
          active={retouchOn}
          onClick={() => setRetouchOn((v) => !v)}
          label="Rötuş"
          icon={<Brush size={20} strokeWidth={1.5} />}
          disabled={!hasImage || mode !== "edit"}
        />
      </div>

      {/* Center stage */}
      <div className="flex-1 relative flex flex-col items-center justify-center overflow-hidden bg-black p-8">
        {!hasImage ? (
          <div className="text-center max-w-sm" data-testid="empty-state">
            <ScanFace
              size={48}
              strokeWidth={1.2}
              className="mx-auto text-zinc-600 mb-4"
            />
            <h1 className="text-2xl font-semibold tracking-tight">
              Vesikalık Editörü
            </h1>
            <p className="text-sm text-zinc-400 mt-2">
              Bir fotoğraf yükleyin; yüz otomatik tespit edilip
              çerçevelensin.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Button
                data-testid="upload-btn-empty"
                onClick={() => fileInputRef.current?.click()}
                className="bg-cyan-500 text-black hover:bg-cyan-400"
              >
                <Upload size={16} strokeWidth={1.5} />
                Fotoğraf Yükle
              </Button>
              <Button
                data-testid="load-sample-btn-empty"
                onClick={() => loadSample(0)}
                variant="outline"
                className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
              >
                Örnek Fotoğraf Kullan
              </Button>
            </div>
          </div>
        ) : (
          <>
            {busy && (
              <div
                className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-sm bg-zinc-900/90 border border-zinc-800 px-3 py-1.5 text-xs text-zinc-300"
                data-testid="busy-indicator"
              >
                <Loader2 size={14} className="animate-spin text-cyan-400" />
                İşleniyor…
              </div>
            )}
            <div
              className="relative shadow-2xl"
              style={{ maxHeight: "100%", maxWidth: "100%" }}
            >
              <canvas
                ref={canvasRef}
                data-testid="preview-canvas"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                className="block"
                style={{
                  maxHeight: "78vh",
                  maxWidth: "100%",
                  cursor:
                    retouchOn && mode === "edit" ? "crosshair" : "default",
                  imageRendering: "auto",
                }}
              />
            </div>
            {mode === "edit" && detectMsg && (
              <p
                data-testid="detect-message"
                className="mt-3 text-xs text-zinc-400 font-mono-j"
              >
                {detectMsg}
              </p>
            )}
          </>
        )}
      </div>

      {/* Right panel */}
      <div className="w-80 flex-shrink-0 border-l border-zinc-800 bg-zinc-900 flex flex-col overflow-y-auto z-10">
        <Section title="Kaynak">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            data-testid="file-input"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              data-testid="upload-btn"
              onClick={() => fileInputRef.current?.click()}
              className="bg-cyan-500 text-black hover:bg-cyan-400"
            >
              <Upload size={16} strokeWidth={1.5} />
              Yükle
            </Button>
            <Button
              data-testid="load-sample-btn"
              onClick={() => loadSample(0)}
              variant="outline"
              className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
            >
              Örnek
            </Button>
          </div>
          {hasImage && (
            <Button
              data-testid="redetect-btn"
              onClick={reDetect}
              variant="ghost"
              className="mt-2 w-full text-zinc-400 hover:text-zinc-100"
            >
              <ScanFace size={16} strokeWidth={1.5} />
              Yüzü Yeniden Tespit Et
            </Button>
          )}
        </Section>

        {hasImage && (
          <>
            <Section title="Boyut">
              <div className="grid grid-cols-2 gap-2">
                {Object.values(PHOTO_SIZES).map((s) => (
                  <button
                    key={s.key}
                    data-testid={`size-${s.key}`}
                    onClick={() => {
                      setSizeKey(s.key);
                      setAutoDetected(false);
                    }}
                    className={`rounded-sm border px-2 py-2 text-xs transition-colors duration-150 ${
                      sizeKey === s.key
                        ? "border-cyan-400 text-cyan-300"
                        : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Arka Plan">
              <div className="flex flex-wrap gap-2 mb-3">
                {BG_COLORS.map((c) => (
                  <button
                    key={c}
                    data-testid={`bg-color-${c.replace("#", "")}`}
                    onClick={() => changeBg(c)}
                    className={`h-7 w-7 rounded-sm border transition-colors duration-150 ${
                      bgColor === c
                        ? "border-cyan-400 ring-1 ring-cyan-400"
                        : "border-zinc-700"
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Arka plan ${c}`}
                  />
                ))}
              </div>
              <Button
                data-testid="remove-bg-btn"
                onClick={doRemoveBg}
                disabled={!!busy}
                className={`w-full ${
                  bgRemoved
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                    : "bg-cyan-500 text-black hover:bg-cyan-400"
                }`}
              >
                <Eraser size={16} strokeWidth={1.5} />
                {bgRemoved ? "Arka Plan Temizlendi" : "Arka Planı Sil"}
              </Button>
              {!bgRemoved && (
                <p className="mt-2 text-xs text-zinc-500">
                  Not: En doğru renk ayarı için önce arka planı temizleyin.
                </p>
              )}
            </Section>

            <Section title="Renk Ayarları">
              <SliderRow
                testid="brightness-slider"
                icon={<SunMedium size={16} strokeWidth={1.5} />}
                label="Parlaklık"
                value={adj.brightness}
                min={0.5}
                max={1.5}
                step={0.01}
                display={`${Math.round(adj.brightness * 100)}%`}
                onChange={(v) => setAdj((a) => ({ ...a, brightness: v }))}
              />
              <SliderRow
                testid="contrast-slider"
                icon={<Contrast size={16} strokeWidth={1.5} />}
                label="Kontrast"
                value={adj.contrast}
                min={0.5}
                max={1.5}
                step={0.01}
                display={`${Math.round(adj.contrast * 100)}%`}
                onChange={(v) => setAdj((a) => ({ ...a, contrast: v }))}
              />
              <SliderRow
                testid="temperature-slider"
                icon={<Thermometer size={16} strokeWidth={1.5} />}
                label="Sıcaklık"
                value={adj.temp}
                min={-100}
                max={100}
                step={1}
                display={`${adj.temp > 0 ? "+" : ""}${adj.temp}`}
                onChange={(v) => setAdj((a) => ({ ...a, temp: v }))}
              />
              <Button
                data-testid="reset-adj-btn"
                onClick={() => setAdj(DEFAULT_ADJ)}
                variant="ghost"
                className="mt-1 w-full text-zinc-400 hover:text-zinc-100"
              >
                <RotateCcw size={16} strokeWidth={1.5} />
                Ayarları Sıfırla
              </Button>
            </Section>

            {mode === "edit" && retouchOn && (
              <Section title="Rötuş Fırçası">
                <SliderRow
                  testid="brush-size-slider"
                  icon={<Brush size={16} strokeWidth={1.5} />}
                  label="Fırça Boyutu"
                  value={brush}
                  min={8}
                  max={80}
                  step={1}
                  display={`${brush}px`}
                  onChange={(v) => setBrush(v)}
                />
                <p className="text-xs text-zinc-500">
                  Önizleme üzerinde sürükleyerek pürüzsüzleştirin.
                </p>
              </Section>
            )}

            <div className="border-b border-zinc-800">
              <PhotoStudio
                image={image}
                applyImage={applyImage}
                originalSrc={originalImage?.src}
                loadImageFromSrc={loadImageFromSrc}
              />
            </div>

            {mode === "print" && (
              <Section title="Filigran & Baskı">
                <label className="text-xs text-zinc-400">Filigran Metni</label>
                <Input
                  data-testid="watermark-text-input"
                  value={wm.text}
                  onChange={(e) =>
                    setWm((w) => ({ ...w, text: e.target.value }))
                  }
                  className="mt-1 bg-zinc-950 border-zinc-700 text-zinc-100"
                />
                <SliderRow
                  testid="watermark-size-slider"
                  icon={<span className="text-xs font-mono-j">Aa</span>}
                  label="Filigran Boyutu"
                  value={wm.size}
                  min={0}
                  max={100}
                  step={1}
                  display={`${wm.size}%`}
                  onChange={(v) => setWm((w) => ({ ...w, size: v }))}
                />
                <SliderRow
                  testid="watermark-opacity-slider"
                  icon={<span className="text-xs font-mono-j">α</span>}
                  label="Filigran Opaklık"
                  value={wm.opacity}
                  min={0}
                  max={1}
                  step={0.01}
                  display={`${Math.round(wm.opacity * 100)}%`}
                  onChange={(v) => setWm((w) => ({ ...w, opacity: v }))}
                />
                <div className="flex gap-2 mt-2">
                  {["left", "center", "right"].map((al) => (
                    <button
                      key={al}
                      data-testid={`wm-align-${al}`}
                      onClick={() => setWm((w) => ({ ...w, align: al }))}
                      className={`flex-1 rounded-sm border py-1.5 text-xs transition-colors duration-150 ${
                        wm.align === al
                          ? "border-cyan-400 text-cyan-300"
                          : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      {al === "left" ? "Sol" : al === "right" ? "Sağ" : "Orta"}
                    </button>
                  ))}
                </div>
              </Section>
            )}

            <Section title="İndir">
              {mode === "edit" ? (
                <Button
                  data-testid="download-single-btn"
                  onClick={doDownloadSingle}
                  className="w-full bg-cyan-500 text-black hover:bg-cyan-400"
                >
                  <ImageDown size={16} strokeWidth={1.5} />
                  Vesikalık İndir
                </Button>
              ) : (
                <Button
                  data-testid="download-sheet-btn"
                  onClick={doDownloadSheet}
                  className="w-full bg-cyan-500 text-black hover:bg-cyan-400"
                >
                  <Printer size={16} strokeWidth={1.5} />
                  Baskı Şablonu İndir
                </Button>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

const ToolIcon = ({ testid, active, onClick, label, icon, disabled }) => (
  <button
    data-testid={testid}
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className={`h-11 w-11 rounded-sm grid place-items-center transition-colors duration-150 ${
      active
        ? "bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/40"
        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
    } ${disabled ? "opacity-30 cursor-not-allowed" : ""}`}
  >
    {icon}
  </button>
);

const Section = ({ title, children }) => (
  <div className="border-b border-zinc-800 p-4">
    <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400 mb-3">
      {title}
    </p>
    {children}
  </div>
);

const SliderRow = ({
  testid,
  icon,
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}) => (
  <div className="mb-3">
    <div className="flex items-center justify-between mb-1.5">
      <span className="flex items-center gap-2 text-sm text-zinc-300">
        <span className="text-zinc-500">{icon}</span>
        {label}
      </span>
      <span className="text-xs text-cyan-300 font-mono-j">{display}</span>
    </div>
    <Slider
      data-testid={testid}
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(v) => onChange(v[0])}
    />
  </div>
);
