import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, X, ZoomIn, Move } from "lucide-react";

// Lightweight drag-to-position + zoom cropper (mouse & touch). Outputs a JPEG blob
// at the requested aspect ratio. No external library.
export default function ImageCropper({ src, aspect = 3 / 4, frameW = 300, onCancel, onCrop, busy = false }) {
  const frameH = Math.round(frameW / aspect);
  const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef(null);
  const cover = useRef(1);

  useEffect(() => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      cover.current = Math.max(frameW / image.naturalWidth, frameH / image.naturalHeight);
      setImg(image);
      setZoom(1);
      setPos({ x: 0, y: 0 });
    };
    image.src = src;
  }, [src, frameW, frameH]);

  const dispScale = (img ? cover.current : 1) * zoom;
  const dispW = img ? img.naturalWidth * dispScale : frameW;
  const dispH = img ? img.naturalHeight * dispScale : frameH;
  const base = { x: (frameW - dispW) / 2, y: (frameH - dispH) / 2 };

  const clamp = useCallback((p) => {
    const minX = frameW - dispW, minY = frameH - dispH;
    return { x: Math.min(0 - base.x, Math.max(minX - base.x, p.x)), y: Math.min(0 - base.y, Math.max(minY - base.y, p.y)) };
    // note: pos is an offset added to the centered base
  }, [frameW, frameH, dispW, dispH, base.x, base.y]);

  useEffect(() => { setPos((p) => clamp(p)); }, [zoom, clamp]);

  const onDown = (e) => {
    const pt = e.touches ? e.touches[0] : e;
    drag.current = { sx: pt.clientX, sy: pt.clientY, ox: pos.x, oy: pos.y };
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const pt = e.touches ? e.touches[0] : e;
    setPos(clamp({ x: drag.current.ox + (pt.clientX - drag.current.sx), y: drag.current.oy + (pt.clientY - drag.current.sy) }));
  };
  const onUp = () => { drag.current = null; };
  const onWheel = (e) => { e.preventDefault(); setZoom((z) => Math.min(4, Math.max(1, z - e.deltaY * 0.0015))); };

  const confirm = () => {
    if (!img) return;
    const out = 3; // export multiplier
    const canvas = document.createElement("canvas");
    canvas.width = frameW * out; canvas.height = frameH * out;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const dx = (base.x + pos.x) * out, dy = (base.y + pos.y) * out;
    ctx.drawImage(img, dx, dy, dispW * out, dispH * out);
    canvas.toBlob((blob) => { if (blob) onCrop(blob); }, "image/jpeg", 0.92);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 grid place-items-center p-4" data-testid="cropper-modal" onMouseUp={onUp} onMouseMove={onMove} onMouseLeave={onUp}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-2xl p-4 w-full max-w-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-slate-800 text-sm">Fotoğrafı konumlandır</span>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600" data-testid="cropper-cancel"><X className="w-5 h-5" /></button>
        </div>
        <div className="text-[11px] text-slate-500 mb-3 flex items-center gap-1"><Move className="w-3.5 h-3.5" /> Sürükleyin, yakınlaştırın — çerçeve içinde kalan kısım kırpılır.</div>
        <div className="mx-auto rounded-xl overflow-hidden relative bg-slate-900 touch-none select-none cursor-move"
          style={{ width: frameW, height: frameH }}
          onMouseDown={onDown} onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp} onWheel={onWheel}>
          {img && (
            <img src={src} alt="crop" draggable={false} className="absolute top-0 left-0 max-w-none pointer-events-none"
              style={{ width: dispW, height: dispH, transform: `translate(${base.x + pos.x}px, ${base.y + pos.y}px)` }} />
          )}
          <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.5)", backgroundImage: "linear-gradient(rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px)", backgroundSize: `${frameW / 3}px ${frameH / 3}px` }} />
        </div>
        <div className="flex items-center gap-2 mt-4">
          <ZoomIn className="w-4 h-4 text-slate-500 shrink-0" />
          <input type="range" min="1" max="4" step="0.01" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} className="w-full accent-indigo-600" data-testid="cropper-zoom" />
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm">İptal</button>
          <button onClick={confirm} disabled={!img || busy} className="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-60" data-testid="cropper-confirm">
            <Check className="w-4 h-4" /> {busy ? "Yükleniyor..." : "Kullan"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
