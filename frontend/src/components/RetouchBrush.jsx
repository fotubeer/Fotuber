import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Eraser, Undo2, RotateCcw, Check, X, Wand2, Paintbrush } from "lucide-react";

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
  const [mode, setMode] = useState("heal"); // "heal" | "paint"
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const [ready, setReady] = useState(false);
  const historyRef = useRef([]);
  const drawingRef = useRef(false);
  const HISTORY_MAX = 20;

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
    ctx.fillStyle = color || "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // --- Spot healing: sample nearby "clean" pixels, feathered blend --------
  const spotHeal = (x, y, r) => {
    const cvs = canvasRef.current;
    const ctx = cvs.getContext("2d");
    const R = Math.max(4, r);
    // Try 8 offset directions to find a source patch fully inside the image.
    const offsets = [
      [ R * 2.4, 0], [-R * 2.4, 0], [0, R * 2.4], [0, -R * 2.4],
      [ R * 1.8,  R * 1.8], [-R * 1.8,  R * 1.8],
      [ R * 1.8, -R * 1.8], [-R * 1.8, -R * 1.8],
    ];
    let src = null;
    for (const [dx, dy] of offsets) {
      const sx = x + dx, sy = y + dy;
      if (sx - R > 0 && sx + R < cvs.width && sy - R > 0 && sy + R < cvs.height) {
        src = { x: sx, y: sy }; break;
      }
    }
    if (!src) { // fall back to clamped inside-canvas point
      src = { x: Math.min(Math.max(x + R * 1.5, R + 1), cvs.width - R - 1),
              y: Math.min(Math.max(y, R + 1), cvs.height - R - 1) };
    }
    const D = R * 2;

    // Patch = pixels sampled from source location
    const patch = document.createElement("canvas");
    patch.width = D; patch.height = D;
    const pctx = patch.getContext("2d");
    pctx.drawImage(cvs, src.x - R, src.y - R, D, D, 0, 0, D, D);

    // Feathered radial mask (opaque center, transparent edge)
    const mask = document.createElement("canvas");
    mask.width = D; mask.height = D;
    const mctx = mask.getContext("2d");
    const g = mctx.createRadialGradient(R, R, R * 0.15, R, R, R);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(0.7, "rgba(0,0,0,0.85)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    mctx.fillStyle = g;
    mctx.fillRect(0, 0, D, D);

    // Apply mask to patch (destination-in keeps only where mask alpha > 0)
    pctx.globalCompositeOperation = "destination-in";
    pctx.drawImage(mask, 0, 0);

    // Composite patch on target — feathered so no hard circle edge
    ctx.drawImage(patch, x - R, y - R);
  };

  const applyStroke = (p) => {
    const rSrc = Math.max(2, (brush / 2) * p.scale);
    if (mode === "heal") spotHeal(p.x, p.y, rSrc);
    else paintDot(p.x, p.y, rSrc);
  };

  const onPointerDown = (ev) => {
    if (!ready) return;
    ev.preventDefault();
    canvasRef.current.setPointerCapture(ev.pointerId);
    drawingRef.current = true;
    pushHistory();
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
    : "Fırçayı sürükleyerek istediğin yeri düz beyaza boyar. Arka planda kalan saç/gölge temizliği için idealdir.";

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
              className="touch-none cursor-crosshair shadow border border-white"
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
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg" data-testid="retouch-mode">
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
              </div>
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
                  className="rounded-full border border-slate-400"
                  style={{
                    width: brush,
                    height: brush,
                    backgroundColor: mode === "paint" ? color : "transparent",
                    borderStyle: mode === "heal" ? "dashed" : "solid",
                    borderWidth: mode === "heal" ? 2 : 1,
                    borderColor: mode === "heal" ? "#6366f1" : "#94a3b8",
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
