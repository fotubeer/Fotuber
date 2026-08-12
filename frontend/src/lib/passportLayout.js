// Faz 1 — Dinamik kağıt dizilim (AutoLayout Matrix) + dijital dışa aktarma yardımcıları.
// Mevcut tekli/sheet çizimini BOZMAZ; kombin baskı ve dijital indirme için ek araçlardır.

const MM_PER_INCH = 25.4;
export const mmToPxDpi = (mm, dpi = 300) => Math.round((mm / MM_PER_INCH) * dpi);

// Bir kağıda birden fazla farklı ebatta fotoğrafı (aynı kişi) dizen basit raf
// (shelf / next-fit) paketleme. items: [{ spec, count }]. Dönen: hücre listesi (mm).
export function packLayout(items, paper, { marginMm = 3, gapMm = 1 } = {}) {
  const areaW = paper.w - marginMm * 2;
  const areaH = paper.h - marginMm * 2;
  // Hücreleri aç (her spec × count kadar). Yükseklik azalan sırada paketleme daha sıkı olur.
  const cells = [];
  items.forEach((it) => {
    for (let k = 0; k < it.count; k++) cells.push({ spec: it.spec, w: it.spec.w, h: it.spec.h });
  });
  cells.sort((a, b) => b.h - a.h || b.w - a.w);

  const placed = [];
  let x = 0, y = 0, rowH = 0;
  let fits = true;
  for (const c of cells) {
    if (x + c.w > areaW + 0.01) { // yeni rafa geç
      x = 0;
      y += rowH + gapMm;
      rowH = 0;
    }
    if (y + c.h > areaH + 0.01) { fits = false; } // kağıttan taşıyor (yine de yerleştir)
    placed.push({ spec: c.spec, xmm: marginMm + x, ymm: marginMm + y, wmm: c.w, hmm: c.h });
    x += c.w + gapMm;
    rowH = Math.max(rowH, c.h);
  }
  const usedHmm = marginMm + y + rowH;
  return { cells: placed, fits, usedHmm };
}

// Bir görsel kaynağını (HTMLCanvasElement/Image) hedef en-boy oranına göre
// kapak-kırpma (cover) ile hedef px boyutuna çizip döndürür.
export function coverCropToCanvas(src, targetWpx, targetHpx) {
  const cv = document.createElement("canvas");
  cv.width = targetWpx; cv.height = targetHpx;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, targetWpx, targetHpx);
  const sw = src.width || src.naturalWidth;
  const sh = src.height || src.naturalHeight;
  const targetAR = targetWpx / targetHpx;
  const srcAR = sw / sh;
  let sx = 0, sy = 0, cw = sw, ch = sh;
  if (srcAR > targetAR) { cw = sh * targetAR; sx = (sw - cw) / 2; }
  else { ch = sw / targetAR; sy = (sh - ch) / 2; }
  ctx.drawImage(src, sx, sy, cw, ch, 0, 0, targetWpx, targetHpx);
  return cv;
}

// Kombin baskı sayfasını çizer. sourceCanvas = bitmiş tekli foto (kaynak).
export function drawComboSheet(sheetCanvas, sourceCanvas, items, paper, opts = {}) {
  const { marginMm = 3, gapMm = 1, dpi = 300, cutMarks = true, cutColor = "#9ca3af", cutWidthMm = 0.5, cutStyle = "dashed", code = "" } = opts;
  if (!sourceCanvas) return null;
  const pw = mmToPxDpi(paper.w, dpi), ph = mmToPxDpi(paper.h, dpi);
  sheetCanvas.width = pw; sheetCanvas.height = ph;
  const ctx = sheetCanvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, pw, ph);

  const { cells } = packLayout(items, paper, { marginMm, gapMm });
  cells.forEach((cell) => {
    const cw = mmToPxDpi(cell.wmm, dpi), ch = mmToPxDpi(cell.hmm, dpi);
    const cx = mmToPxDpi(cell.xmm, dpi), cy = mmToPxDpi(cell.ymm, dpi);
    const cropped = coverCropToCanvas(sourceCanvas, cw, ch);
    ctx.drawImage(cropped, cx, cy);
    if (cutMarks && cutWidthMm > 0) {
      ctx.save();
      ctx.strokeStyle = cutColor;
      ctx.lineWidth = Math.max(1, mmToPxDpi(cutWidthMm, dpi));
      ctx.setLineDash(cutStyle === "solid" ? [] : [mmToPxDpi(1.5, dpi), mmToPxDpi(1, dpi)]);
      ctx.strokeRect(cx, cy, cw, ch);
      ctx.restore();
    }
  });

  if (code) {
    ctx.fillStyle = "#666";
    ctx.font = `${mmToPxDpi(2.5, dpi)}px sans-serif`;
    ctx.fillText(code, mmToPxDpi(2, dpi), ph - mmToPxDpi(2, dpi));
  }
  return sheetCanvas;
}

// Canvas'ı JPEG olarak, boyutu maxKb altına inene kadar kaliteyi düşürerek dışa aktarır.
export function canvasToJpegMaxKb(canvas, maxKb = 100) {
  const sizeKb = (u) => Math.ceil(((u.length - (u.indexOf(",") + 1)) * 3) / 4 / 1024);
  let q = 0.92;
  let url = canvas.toDataURL("image/jpeg", q);
  while (sizeKb(url) > maxKb && q > 0.25) { q -= 0.07; url = canvas.toDataURL("image/jpeg", q); }
  return url;
}

// Bir kaynağı (dataUrl/canvas) tam olarak istenen piksel boyutuna (exactPx) getirip
// maxKb altında JPEG dataUrl döndürür (dijital indirme için).
export function exportExactPx(sourceCanvas, exactPx, maxKb = 100) {
  const cv = coverCropToCanvas(sourceCanvas, exactPx.w, exactPx.h);
  return canvasToJpegMaxKb(cv, maxKb);
}

// Özel ebatlar (fotoğrafçı tanımlı) — tarayıcıda saklanır.
const CUSTOM_KEY = "fotuber_custom_specs";
export function loadCustomSpecs() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]"); } catch { return []; }
}
export function saveCustomSpec(spec) {
  const list = loadCustomSpecs().filter((s) => s.code !== spec.code);
  list.push(spec);
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
  return list;
}
export function deleteCustomSpec(code) {
  const list = loadCustomSpecs().filter((s) => s.code !== code);
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
  return list;
}
