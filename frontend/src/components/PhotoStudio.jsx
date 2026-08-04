import React, { useState } from "react";
import { Shirt, Eye, Sparkles, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "../components/ui/button";
import {
  recolorGarment,
  removeRedEye,
  sharpenEyes,
} from "../lib/photoTools";

const SWATCHES = [
  "#1e3a8a",
  "#0f172a",
  "#7f1d1d",
  "#14532d",
  "#4c1d95",
  "#78350f",
  "#334155",
  "#be185d",
];

export const PhotoStudio = ({ image, applyImage, originalSrc, loadImageFromSrc }) => {
  const [garmentColor, setGarmentColor] = useState("#1e3a8a");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);

  const disabled = !image?.el || !!busy;

  const doRecolor = async () => {
    if (!image?.el) return;
    setBusy("garment");
    setMsg(null);
    try {
      // BUG 3 FIX: recolorGarment call was missing; dataUrl is now produced here.
      const dataUrl = await recolorGarment(image.el, garmentColor);
      const im = await loadImageFromSrc(dataUrl);
      applyImage(im, { keepCrop: true });
      setMsg({ type: "ok", text: "Kıyafet rengi uygulandı." });
    } catch (e) {
      setMsg({ type: "err", text: "Renk değiştirme başarısız." });
    }
    setBusy("");
  };

  const doRedEye = async () => {
    if (!image?.el) return;
    setBusy("redeye");
    setMsg(null);
    try {
      const { dataUrl, found } = await removeRedEye(image.el);
      const im = await loadImageFromSrc(dataUrl);
      applyImage(im, { keepCrop: true }); // BUG 3 FIX: keepCrop prevents re-detect reset.
      setMsg(
        found
          ? { type: "ok", text: "Kırmızı göz giderildi." }
          : { type: "warn", text: "Kırmızı göz bulunamadı." },
      );
    } catch (e) {
      setMsg({ type: "err", text: "İşlem başarısız." });
    }
    setBusy("");
  };

  const doSharpen = async () => {
    if (!image?.el) return;
    setBusy("sharpen");
    setMsg(null);
    try {
      const dataUrl = await sharpenEyes(image.el);
      const im = await loadImageFromSrc(dataUrl);
      applyImage(im, { keepCrop: true }); // BUG 3 FIX: keepCrop prevents re-detect reset.
      setMsg({ type: "ok", text: "Gözler netleştirildi." });
    } catch (e) {
      setMsg({ type: "err", text: "İşlem başarısız." });
    }
    setBusy("");
  };

  const doRevert = async () => {
    if (!originalSrc) return;
    setBusy("revert");
    setMsg(null);
    try {
      const im = await loadImageFromSrc(originalSrc);
      applyImage(im, { keepCrop: true });
      setMsg({ type: "ok", text: "Orijinal fotoğrafa dönüldü." });
    } catch (e) {
      setMsg({ type: "err", text: "İşlem başarısız." });
    }
    setBusy("");
  };

  const msgColor =
    msg?.type === "ok"
      ? "text-emerald-400"
      : msg?.type === "warn"
        ? "text-amber-400"
        : "text-red-400";

  return (
    <div className="p-4 space-y-4" data-testid="photo-studio">
      <div className="flex items-center gap-2">
        <Shirt size={16} strokeWidth={1.5} className="text-cyan-400" />
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">
          Fotoğraf Stüdyosu
        </span>
      </div>

      {/* Garment recolor */}
      <div className="space-y-2">
        <p className="text-sm text-zinc-300">Kıyafet Rengi</p>
        <div className="flex flex-wrap gap-2">
          {SWATCHES.map((s) => (
            <button
              key={s}
              data-testid={`garment-swatch-${s.replace("#", "")}`}
              onClick={() => setGarmentColor(s)}
              className={`h-7 w-7 rounded-sm border transition-colors duration-150 ${
                garmentColor === s
                  ? "border-cyan-400 ring-1 ring-cyan-400"
                  : "border-zinc-700"
              }`}
              style={{ backgroundColor: s }}
              aria-label={`Kıyafet rengi ${s}`}
            />
          ))}
          <input
            type="color"
            data-testid="garment-color-input"
            value={garmentColor}
            onChange={(e) => setGarmentColor(e.target.value)}
            className="h-7 w-7 rounded-sm border border-zinc-700 bg-transparent p-0"
            aria-label="Özel kıyafet rengi"
          />
        </div>
        <Button
          data-testid="recolor-garment-btn"
          onClick={doRecolor}
          disabled={disabled}
          className="w-full bg-cyan-500 text-black hover:bg-cyan-400"
        >
          {busy === "garment" ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Shirt size={16} strokeWidth={1.5} />
          )}
          Rengi Değiştir
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          data-testid="red-eye-btn"
          onClick={doRedEye}
          disabled={disabled}
          variant="outline"
          className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
        >
          {busy === "redeye" ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Eye size={16} strokeWidth={1.5} />
          )}
          Kırmızı Göz Gider
        </Button>
        <Button
          data-testid="sharpen-eyes-btn"
          onClick={doSharpen}
          disabled={disabled}
          variant="outline"
          className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
        >
          {busy === "sharpen" ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Sparkles size={16} strokeWidth={1.5} />
          )}
          Gözleri Netleştir
        </Button>
      </div>

      <Button
        data-testid="revert-original-btn"
        onClick={doRevert}
        disabled={!originalSrc || !!busy}
        variant="ghost"
        className="w-full text-zinc-400 hover:text-zinc-100"
      >
        <RotateCcw size={16} strokeWidth={1.5} />
        Orijinale Dön
      </Button>

      {msg && (
        <p data-testid="studio-message" className={`text-xs ${msgColor}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
};

export default PhotoStudio;
