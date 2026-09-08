// Shared "automatic vesikalık" pipeline used by both the single editor and
// the 3'lü (triple) panel. Runs the exact operations the single panel applies
// automatically on upload: (1) background removal → solid studio background,
// (2) biometric face detection + crop framing → final photo at the spec size.
import { removeBackground, compositeOnColor } from "@/lib/bgRemove";
import { detectBiometricCrop } from "@/lib/faceDetect";

const MM_PER_INCH = 25.4;
const DPI = 300;
const mmToPx = (mm) => Math.round((mm / MM_PER_INCH) * DPI);

const loadImg = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

// input: File | Blob | data-URL string. spec: PHOTO_SPECS entry {w,h,bg,format}.
// opts: { removeBg = true, onProgress }
// Returns { dataUrl, detected } where dataUrl is a formatted passport photo.
export const autoProcessPassport = async (input, spec, opts = {}) => {
  const { removeBg = true, onProgress } = opts;
  const bgColor = spec?.bg || "#ffffff";

  let baseImg;
  if (removeBg) {
    const blob = await removeBackground(input, onProgress);
    const { dataUrl } = await compositeOnColor(blob, bgColor);
    baseImg = await loadImg(dataUrl);
  } else {
    const src = typeof input === "string" ? input : URL.createObjectURL(input);
    baseImg = await loadImg(src);
  }

  const iw = baseImg.naturalWidth || baseImg.width;
  const ih = baseImg.naturalHeight || baseImg.height;

  // Biometric crop framing (falls back to a centered 70% crop on failure).
  let crop = null;
  let detected = false;
  try {
    const res = await detectBiometricCrop(baseImg, spec);
    if (res.ok) {
      const halfW = res.w / 2;
      const halfH = (res.w * spec.h / spec.w) / 2;
      const cx = Math.min(Math.max(res.cx, halfW), iw - halfW);
      const cy = Math.min(Math.max(res.cy, halfH), ih - halfH);
      crop = { cx, cy, w: res.w };
      detected = true;
    }
  } catch (e) {
    /* fall through to default crop */
  }
  if (!crop) {
    const shortSide = Math.min(iw, ih);
    crop = { cx: iw / 2, cy: ih / 2, w: shortSide * 0.85 };
  }

  const targetW = mmToPx(spec.w);
  const targetH = mmToPx(spec.h);
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, targetW, targetH);

  const cropW = Math.min(crop.w, iw);
  const cropH = Math.min(crop.w * (spec.h / spec.w), ih);
  let sx = crop.cx - cropW / 2;
  let sy = crop.cy - cropH / 2;
  sx = Math.min(Math.max(0, sx), Math.max(0, iw - cropW));
  sy = Math.min(Math.max(0, sy), Math.max(0, ih - cropH));
  ctx.drawImage(baseImg, sx, sy, cropW, cropH, 0, 0, targetW, targetH);

  return { dataUrl: canvas.toDataURL("image/jpeg", 0.95), detected };
};
