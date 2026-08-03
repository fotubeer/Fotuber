import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Eraser, Undo2, RotateCcw, Check, X } from "lucide-react";

// Manual eraser / paint-over tool for cleaning up leftover artifacts.
// The working canvas is downscaled to a max edge of MAX_EDGE so the tool
// stays responsive even for huge phone photos, and so pointer-to-pixel
// math stays predictable across viewports.
const MAX_EDGE = 1600;

const fitSize = (w, h) => {
  const m = Math.max(w, h);
  if (m <= MAX_EDGE) return { w, h, scale: 1 };
  const s = MAX_EDGE / m;
  return { w: Math.round(w * s), h: Math.round(h * s), scale: s };
};

const RetouchBrush = ({ open, onOpenChange, imageSrc, color = "#ffffff", onApply }) => {
  const canvasRef = useRef(null);
  const [brush, setBrush] = useState(28);           // brush diameter in CSS px
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 }); // canvas CSS px
  const [ready, setReady] = useState(false);
  const historyRef = useRef([]);
  const drawingRef = useRef(false);
  const HISTORY_MAX = 20;

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setReady(false);
      historyRef.current = [];
    }
  }, [open]);

  // Load source image, downscale, paint onto canvas
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
      // Pick a comfortable display size: fit inside 720×480 CSS px
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
    } catch (_) {
      // Cross-origin canvas would throw — data URLs are same-origin so this is safe.
    }
  };

  // Pointer helpers -----------------------------------------------------
  const pointerToCanvas = (ev) => {
    const cvs = canvasRef.current;
    const rect = cvs.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) / rect.width) * cvs.width,
      y: ((ev.clientY - rect.top) / rect.height) * cvs.height,
      scale: cvs.width / rect.width,
    };
  };

  const paintDot = (x, y, scale) => {
    const ctx = canvasRef.current.getContext("2d");
    const r = Math.max(1, (brush / 2) * scale);
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = color || "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const onPointerDown = (ev) => {
    if (!ready) return;
    ev.preventDefault();
    canvasRef.current.setPointerCapture(ev.pointerId);
    drawingRef.current = true;
    pushHistory();
    const p = pointerToCanvas(ev);
    paintDot(p.x, p.y, p.scale);
  };
  const onPointerMove = (ev) => {
    if (!drawingRef.current) return;
    const p = pointerToCanvas(ev);
    paintDot(p.x, p.y, p.scale);
  };
  const onPointerUp = (ev) => {
    if (canvasRef.current?.hasPointerCapture(ev.pointerId)) {
      canvasRef.current.releasePointerCapture(ev.pointerId);
    }
    drawingRef.current = false;
  };

  // Actions -------------------------------------------------------------
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
      cvs.width = fit.w;
      cvs.height = fit.h;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl" data-testid="retouch-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eraser className="w-4 h-4 text-indigo-600" /> Manuel Rötuş Fırçası
          </DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-[1fr_220px] gap-4">
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
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Fırça Boyutu</Label>
                <span className="text-xs text-slate-500 tabular-nums">{brush}px</span>
              </div>
              <Slider
                value={[brush]}
                min={4}
                max={120}
                step={2}
                onValueChange={(v) => setBrush(v[0])}
                data-testid="retouch-brush-size"
              />
              <div className="flex items-center justify-center mt-3 h-16">
                <div
                  className="rounded-full border border-slate-400"
                  style={{ width: brush, height: brush, backgroundColor: color }}
                />
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600 space-y-1">
              <div><b>İpucu:</b> Arka planda kalan saç, gölge veya kenar parçalarını fırçayla üzerine sürerek boyayarak temizleyebilirsin.</div>
              <div>Boya rengi: <span className="inline-block w-3 h-3 rounded-full border align-middle" style={{ backgroundColor: color }} /> {String(color).toUpperCase()}</div>
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
