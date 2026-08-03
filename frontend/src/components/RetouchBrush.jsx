import React, { useEffect, useRef, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Eraser, Undo2, RotateCcw, Check, X } from "lucide-react";

// Manual eraser / paint-over tool for cleaning up leftover artifacts after
// automatic background removal. Paints solid `color` circles onto a copy of
// the image and returns the new data URL when the operator hits "Uygula".
const RetouchBrush = ({ open, onOpenChange, imageSrc, color = "#ffffff", onApply }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [brush, setBrush] = useState(28);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [drawing, setDrawing] = useState(false);
  const historyRef = useRef([]); // stack of ImageData snapshots
  const HISTORY_MAX = 20;

  // Load the source image onto the canvas whenever the dialog opens
  useEffect(() => {
    if (!open || !imageSrc || !canvasRef.current) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const cvs = canvasRef.current;
      if (!cvs) return;
      cvs.width = img.width;
      cvs.height = img.height;
      const ctx = cvs.getContext("2d");
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      ctx.drawImage(img, 0, 0);
      historyRef.current = [];
      setImgSize({ w: img.width, h: img.height });
    };
    img.src = imageSrc;
  }, [open, imageSrc]);

  const pushHistory = useCallback(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    const snap = ctx.getImageData(0, 0, cvs.width, cvs.height);
    historyRef.current.push(snap);
    if (historyRef.current.length > HISTORY_MAX) historyRef.current.shift();
  }, []);

  // Convert a pointer event into canvas-pixel coordinates
  const toCanvasPoint = (ev) => {
    const cvs = canvasRef.current;
    const rect = cvs.getBoundingClientRect();
    const cx = ev.clientX - rect.left;
    const cy = ev.clientY - rect.top;
    return { x: (cx / rect.width) * cvs.width, y: (cy / rect.height) * cvs.height };
  };

  const paintDot = (x, y) => {
    const ctx = canvasRef.current.getContext("2d");
    // Scale brush size to source pixels (brush is in CSS px)
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = canvasRef.current.width / rect.width;
    const r = (brush / 2) * scale;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };

  const onPointerDown = (ev) => {
    ev.preventDefault();
    canvasRef.current.setPointerCapture(ev.pointerId);
    pushHistory();
    setDrawing(true);
    const { x, y } = toCanvasPoint(ev);
    paintDot(x, y);
  };
  const onPointerMove = (ev) => {
    if (!drawing) return;
    const { x, y } = toCanvasPoint(ev);
    paintDot(x, y);
  };
  const onPointerUp = (ev) => {
    if (canvasRef.current.hasPointerCapture(ev.pointerId)) {
      canvasRef.current.releasePointerCapture(ev.pointerId);
    }
    setDrawing(false);
  };

  const undo = () => {
    const snap = historyRef.current.pop();
    if (!snap) return;
    canvasRef.current.getContext("2d").putImageData(snap, 0, 0);
  };

  const resetAll = () => {
    const img = new Image();
    img.onload = () => {
      const cvs = canvasRef.current;
      cvs.getContext("2d").clearRect(0, 0, cvs.width, cvs.height);
      cvs.getContext("2d").drawImage(img, 0, 0);
      historyRef.current = [];
    };
    img.src = imageSrc;
  };

  const apply = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL("image/jpeg", 0.95);
    onApply?.(url);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl" data-testid="retouch-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eraser className="w-4 h-4 text-indigo-600" /> Manuel Rötuş Fırçası
          </DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-[1fr_220px] gap-4">
          <div ref={containerRef} className="bg-slate-100 rounded p-2 flex items-center justify-center overflow-auto min-h-[300px]">
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              className="max-w-full max-h-[60vh] touch-none cursor-crosshair shadow border border-white"
              style={{ imageRendering: "pixelated" }}
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
                <div className="rounded-full border border-slate-300 bg-white" style={{ width: brush, height: brush }} />
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600 space-y-1">
              <div><b>İpucu:</b> Arka planda kalan saç, gölge veya kenar parçalarını fırçayla üzerine sürerek temizleyebilirsin.</div>
              <div>Renk: <span className="inline-block w-3 h-3 rounded-full border align-middle" style={{ backgroundColor: color }} /> {color.toUpperCase()}</div>
              <div>Kaynak boyut: {imgSize.w}×{imgSize.h}px</div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={undo} data-testid="retouch-undo"><Undo2 className="w-3.5 h-3.5 mr-1" />Geri Al</Button>
              <Button variant="outline" onClick={resetAll} data-testid="retouch-reset"><RotateCcw className="w-3.5 h-3.5 mr-1" />Sıfırla</Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="retouch-cancel">
            <X className="w-4 h-4 mr-1" /> Vazgeç
          </Button>
          <Button onClick={apply} className="bg-emerald-600 hover:bg-emerald-700" data-testid="retouch-apply">
            <Check className="w-4 h-4 mr-1" /> Uygula
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RetouchBrush;
