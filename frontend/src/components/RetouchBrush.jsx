import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Eraser, Undo2, RotateCcw, Check, X, Wand2, Paintbrush, Pipette } from "lucide-react";

// Professional-grade retouch dialog.
//   - "Onarım" (spot heal) samples surrounding pixels and blends them over
//     the click location through a feathered mask — like a spot healing brush.
//   - "Boya" paints the solid `color` (used for cleaning leftover background).
// Working canvas is downscaled to MAX_EDGE for responsive brushes.
const MAX_EDGE = 1600;

const fitSize = (w, h) => {
  const m = Math.max(w, h);
  if (m <= MAX_EDGE) return { w, h };
  const s = MAX_EDGE / m;
  return { w: Math.round(w * s), h: Math.round(h * s) };
};

const RetouchBrush = ({ open, onOpenChange, imageSrc, color = "#ffffff", onApply }) => {
  const canvasRef = useRef(null);
  const [brush, setBrush] = useState(32);
  const [mode, setMode] = useState("heal"); // "heal" | "paint" | "pick"
  const [paintColor, setPaintColor] = useState(color);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const [ready, setReady] = useState(false);
  const historyRef = useRef([]);
  const drawingRef = useRef(false);
  const HISTORY_MAX = 20;

  // Sync paint color with the incoming default when the dialog is reopened
  useEffect(() => { setPaintColor(color); }, [color, open]);

  useEffect(() => {
    if (!open) { setReady(false); historyRef.current = []; }
  }, [open]);

  useEffect(() => {
    if (!open || !imageSrc) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const cvs = canvasRef.current;
      if (!cvs) return;
      const fit = fitSize(img.naturalWidth, img.naturalHeight);
      cvs.width = fit.w;
      cvs.height = fit.h;
      const ctx = cvs.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, fit.w, fit.h);
      ctx.drawImage(img, 0, 0, fit.w, fit.h);
      historyRef.current = [];
      const maxCssW = 720, maxCssH = 480;
      const s = Math.min(maxCssW / fit.w, maxCssH / fit.h, 1);
      setDisplaySize({ w: Math.round(fit.w * s), h: Math.round(fit.h * s) });
      setReady(true);
    };
    img.onerror = () => { if (!cancelled) setReady(false); };
    img.src = imageSrc;
    return () => { cancelled = true; };
  }, [open, imageSrc]);

  const pushHistory = () => {
    const cvs = canvasRef.current;
    if (!cvs || !ready) return;
    try {
      const ctx = cvs.getContext("2d");
      const snap = ctx.getImageData(0, 0, cvs.width, cvs.height);
      historyRef.current.push(snap);
      if (historyRef.current.length > HISTORY_MAX) historyRef.current.shift();
    } catch (_) { /* data URL is same-origin, but be safe */ }
  };

  const pointerToCanvas = (ev) => {
    const cvs = canvasRef.current;
    const rect = cvs.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) / rect.width) * cvs.width,
      y: ((ev.clientY - rect.top) / rect.height) * cvs.height,
      scale: cvs.width / rect.width,
    };
  };

  // --- Solid paint brush (used to clean leftover background) --------------
  const paintDot = (x, y, r) => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.save();
    ctx.fillStyle = paintColor || "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // --- Eyedropper: sample the pixel under the cursor ----------------------
  const pickColor = (x, y) => {
    const ctx = canvasRef.current.getContext("2d");
    const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
    const hex = "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
    setPaintColor(hex);
    // Auto-switch back to paint after picking so the operator can use the sample
    setMode("paint");
  };

  // --- Photoshop-style healing brush -------------------------------------
  //
  // Algorithm (per stroke point):
  //  1. Auto-source: try 12 candidate patches around the target and pick the
  //     one with the LOWEST color variance — this is the smoothest, cleanest
  //     nearby skin/fabric.
  //  2. Compute ring-annulus mean RGB for BOTH the source and target — this
  //     is each patch's "local color".
  //  3. For every pixel inside the brush circle transplant the source pixel
  //     but ADD the color offset (target_mean − source_mean). This carries
  //     the source's TEXTURE while inheriting the target's local TONE, so
  //     the patch fuses seamlessly instead of leaving a visible spot.
  //  4. Blend into the existing pixels through a feathered radial mask so
  //     there is no hard circle edge.
  //
  // This is the additive-transfer approximation of Poisson blending used by
  // most healing brushes in professional editors.
  const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

  const ringMean = (imgData, R, innerFrac, outerFrac) => {
    const { data, width: W, height: H } = imgData;
    const cx = W / 2, cy = H / 2;
    const rIn = R * innerFrac, rOut = R * outerFrac;
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let py = 0; py < H; py++) {
      const dy = py - cy;
      for (let px = 0; px < W; px++) {
        const dx = px - cx;
        const dr = Math.sqrt(dx * dx + dy * dy);
        if (dr >= rIn && dr <= rOut) {
          const i = (py * W + px) * 4;
          sr += data[i]; sg += data[i + 1]; sb += data[i + 2];
          n++;
        }
      }
    }
    if (!n) return { r: 128, g: 128, b: 128 };
    return { r: sr / n, g: sg / n, b: sb / n };
  };

  const patchVariance = (imgData) => {
    const { data } = imgData;
    const n = data.length / 4;
    let sr = 0, sg = 0, sb = 0;
    for (let i = 0; i < data.length; i += 4) { sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; }
    const mr = sr / n, mg = sg / n, mb = sb / n;
    let vr = 0, vg = 0, vb = 0;
    for (let i = 0; i < data.length; i += 4) {
      const dr = data[i] - mr, dg = data[i + 1] - mg, db = data[i + 2] - mb;
      vr += dr * dr; vg += dg * dg; vb += db * db;
    }
    return (vr + vg + vb) / (3 * n);
  };

  const spotHeal = (x, y, r) => {
    const cvs = canvasRef.current;
    const ctx = cvs.getContext("2d");
    const R = Math.max(6, Math.round(r));
    const D = R * 2;
    // Target must be fully inside the canvas
    if (x - R < 0 || y - R < 0 || x + R >= cvs.width || y + R >= cvs.height) return;

    // ---- 1) Pick the smoothest nearby source patch ----------------------
    let best = null;
    const dist = R * 2.4;
    for (let k = 0; k < 12; k++) {
      const angle = (k / 12) * Math.PI * 2;
      const sx = Math.round(x + Math.cos(angle) * dist);
      const sy = Math.round(y + Math.sin(angle) * dist);
      if (sx - R < 0 || sy - R < 0 || sx + R >= cvs.width || sy + R >= cvs.height) continue;
      // Sample a small central subregion for the variance check (cheap)
      const probe = ctx.getImageData(sx - R / 2, sy - R / 2, R, R);
      const v = patchVariance(probe);
      if (!best || v < best.v) best = { sx, sy, v };
    }
    if (!best) {
      // fall back to clamped position
      const sx = Math.min(Math.max(x + R * 1.5, R + 1), cvs.width - R - 1);
      const sy = Math.min(Math.max(y, R + 1), cvs.height - R - 1);
      best = { sx: Math.round(sx), sy: Math.round(sy) };
    }

    // ---- 2) Grab source + target patches + compute local means ----------
    const srcData = ctx.getImageData(best.sx - R, best.sy - R, D, D);
    const tgtData = ctx.getImageData(x - R, y - R, D, D);
    const srcMean = ringMean(srcData, R, 0.7, 1.0);
    const tgtMean = ringMean(tgtData, R, 0.7, 1.0);
    const oR = tgtMean.r - srcMean.r;
    const oG = tgtMean.g - srcMean.g;
    const oB = tgtMean.b - srcMean.b;

    // ---- 3+4) Per-pixel transplant with additive color transfer + mask --
    const out = ctx.createImageData(D, D);
    const sd = srcData.data, td = tgtData.data, od = out.data;
    for (let py = 0; py < D; py++) {
      const dy = py - R;
      for (let px = 0; px < D; px++) {
        const dx = px - R;
        const dr = Math.sqrt(dx * dx + dy * dy);
        const i = (py * D + px) * 4;
        if (dr > R) {
          od[i] = td[i]; od[i + 1] = td[i + 1]; od[i + 2] = td[i + 2]; od[i + 3] = 255;
          continue;
        }
        // Feathered radial mask: full inside 0.6R, fades linearly to 0 at R
        let m = 1;
        if (dr > R * 0.6) m = 1 - (dr - R * 0.6) / (R * 0.4);
        if (m < 0) m = 0;
        // Extra squared falloff for smoother blend
        m = m * m * (3 - 2 * m);

        const hR = sd[i] + oR;
        const hG = sd[i + 1] + oG;
        const hB = sd[i + 2] + oB;
        od[i]     = clamp255(td[i]     * (1 - m) + hR * m);
        od[i + 1] = clamp255(td[i + 1] * (1 - m) + hG * m);
        od[i + 2] = clamp255(td[i + 2] * (1 - m) + hB * m);
        od[i + 3] = 255;
      }
    }
    ctx.putImageData(out, x - R, y - R);
  };

  const applyStroke = (p) => {
    const rSrc = Math.max(2, (brush / 2) * p.scale);
    if (mode === "heal") spotHeal(p.x, p.y, rSrc);
    else if (mode === "pick") pickColor(p.x, p.y);
    else paintDot(p.x, p.y, rSrc);
  };

  const onPointerDown = (ev) => {
    if (!ready) return;
    ev.preventDefault();
    canvasRef.current.setPointerCapture(ev.pointerId);
    // Eyedropper doesn't modify pixels, so no history push and no drag
    if (mode !== "pick") {
      drawingRef.current = true;
      pushHistory();
    }
    applyStroke(pointerToCanvas(ev));
  };
  const onPointerMove = (ev) => {
    if (!drawingRef.current) return;
    applyStroke(pointerToCanvas(ev));
  };
  const onPointerUp = (ev) => {
    if (canvasRef.current?.hasPointerCapture(ev.pointerId)) {
      canvasRef.current.releasePointerCapture(ev.pointerId);
    }
    drawingRef.current = false;
  };

  const undo = () => {
    const snap = historyRef.current.pop();
    if (!snap || !canvasRef.current) return;
    canvasRef.current.getContext("2d").putImageData(snap, 0, 0);
  };

  const resetAll = () => {
    if (!imageSrc) return;
    setReady(false);
    const img = new Image();
    img.onload = () => {
      const cvs = canvasRef.current;
      if (!cvs) return;
      const fit = fitSize(img.naturalWidth, img.naturalHeight);
      cvs.width = fit.w; cvs.height = fit.h;
      const ctx = cvs.getContext("2d");
      ctx.clearRect(0, 0, fit.w, fit.h);
      ctx.drawImage(img, 0, 0, fit.w, fit.h);
      historyRef.current = [];
      setReady(true);
    };
    img.src = imageSrc;
  };

  const apply = () => {
    if (!canvasRef.current || !ready) return;
    const url = canvasRef.current.toDataURL("image/jpeg", 0.95);
    onApply?.(url);
    onOpenChange(false);
  };

  const modeTip = mode === "heal"
    ? "Sivilce, benek, iz gibi bozuklukların üzerine dokun. Fırça yakınından temiz doku örneği alıp yumuşak kenarla üstüne bindirir."
    : mode === "pick"
    ? "Fotoğraf üzerinde herhangi bir noktaya tıkla — o pikselin rengini boya rengi olarak alır ve otomatik Boya moduna geçer."
    : "Fırçayı sürükleyerek istediğin yeri seçili renkle boyar. Arka planda kalan saç/gölge temizliği için idealdir.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl" data-testid="retouch-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-indigo-600" /> Profesyonel Rötuş
          </DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-[1fr_240px] gap-4">
          <div className="bg-slate-100 rounded p-3 flex items-center justify-center min-h-[320px] relative">
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500" data-testid="retouch-loading">
                Fotoğraf yükleniyor…
              </div>
            )}
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              className={`touch-none shadow border border-white ${mode === "pick" ? "cursor-copy" : "cursor-crosshair"}`}
              style={{
                width: displaySize.w ? `${displaySize.w}px` : undefined,
                height: displaySize.h ? `${displaySize.h}px` : undefined,
                visibility: ready ? "visible" : "hidden",
                background: "#e5e7eb",
              }}
              data-testid="retouch-canvas"
            />
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-xs mb-1 block">Mod</Label>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg" data-testid="retouch-mode">
                <button
                  type="button"
                  onClick={() => setMode("heal")}
                  className={`flex items-center justify-center gap-1 py-2 text-xs rounded-md transition-colors ${mode === "heal" ? "bg-white shadow font-semibold text-indigo-700" : "text-slate-600"}`}
                  data-testid="retouch-mode-heal"
                >
                  <Wand2 className="w-3.5 h-3.5" /> Onarım
                </button>
                <button
                  type="button"
                  onClick={() => setMode("paint")}
                  className={`flex items-center justify-center gap-1 py-2 text-xs rounded-md transition-colors ${mode === "paint" ? "bg-white shadow font-semibold text-slate-900" : "text-slate-600"}`}
                  data-testid="retouch-mode-paint"
                >
                  <Paintbrush className="w-3.5 h-3.5" /> Boya
                </button>
                <button
                  type="button"
                  onClick={() => setMode("pick")}
                  className={`flex items-center justify-center gap-1 py-2 text-xs rounded-md transition-colors ${mode === "pick" ? "bg-white shadow font-semibold text-amber-700" : "text-slate-600"}`}
                  data-testid="retouch-mode-pick"
                >
                  <Pipette className="w-3.5 h-3.5" /> Emici
                </button>
              </div>
              {(mode === "paint" || mode === "pick") && (
                <div className="mt-2 flex items-center gap-2" data-testid="retouch-color-swatch">
                  <Label className="text-xs">Renk</Label>
                  <input
                    type="color"
                    value={paintColor}
                    onChange={(e) => setPaintColor(e.target.value)}
                    className="w-8 h-8 rounded border border-slate-300 cursor-pointer"
                    data-testid="retouch-color-input"
                  />
                  <span className="text-[11px] text-slate-500 tabular-nums">{paintColor.toUpperCase()}</span>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Fırça Boyutu</Label>
                <span className="text-xs text-slate-500 tabular-nums">{brush}px</span>
              </div>
              <Slider
                value={[brush]}
                min={6}
                max={140}
                step={2}
                onValueChange={(v) => setBrush(v[0])}
                data-testid="retouch-brush-size"
              />
              <div className="flex items-center justify-center mt-3 h-16">
                <div
                  className="rounded-full border"
                  style={{
                    width: brush,
                    height: brush,
                    backgroundColor: mode === "paint" ? paintColor : "transparent",
                    borderStyle: mode === "heal" ? "dashed" : mode === "pick" ? "dotted" : "solid",
                    borderWidth: 2,
                    borderColor: mode === "heal" ? "#6366f1" : mode === "pick" ? "#d97706" : "#94a3b8",
                  }}
                />
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600" data-testid="retouch-tip">
              {modeTip}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={undo} disabled={!ready} data-testid="retouch-undo"><Undo2 className="w-3.5 h-3.5 mr-1" />Geri Al</Button>
              <Button variant="outline" onClick={resetAll} disabled={!ready} data-testid="retouch-reset"><RotateCcw className="w-3.5 h-3.5 mr-1" />Sıfırla</Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="retouch-cancel">
            <X className="w-4 h-4 mr-1" /> Vazgeç
          </Button>
          <Button onClick={apply} disabled={!ready} className="bg-emerald-600 hover:bg-emerald-700" data-testid="retouch-apply">
            <Check className="w-4 h-4 mr-1" /> Uygula
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RetouchBrush;
