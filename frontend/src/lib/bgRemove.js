// Background removal via edge flood-fill color keying.
// Produces a foreground alpha mask + a version composited onto a solid color.

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function dims(el) {
  return { w: el.naturalWidth || el.width, h: el.naturalHeight || el.height };
}

// Compute a foreground mask canvas (white+opaque = foreground, transparent = background).
// Background = region connected to the image edges within a color tolerance.
export function computeForegroundMask(el, opts = {}) {
  const tol = opts.tolerance ?? 46;
  const { w, h } = dims(el);
  const cw = Math.min(opts.maxSize ?? 420, w);
  const ch = Math.max(1, Math.round((cw * h) / w));
  const src = makeCanvas(cw, ch);
  const sctx = src.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(el, 0, 0, cw, ch);
  const img = sctx.getImageData(0, 0, cw, ch);
  const p = img.data;
  const N = cw * ch;

  // Reference background color from the four corners.
  const corners = [
    [0, 0],
    [cw - 1, 0],
    [0, ch - 1],
    [cw - 1, ch - 1],
  ];
  let br = 0,
    bg = 0,
    bb = 0;
  corners.forEach(([x, y]) => {
    const i = (y * cw + x) * 4;
    br += p[i];
    bg += p[i + 1];
    bb += p[i + 2];
  });
  br /= 4;
  bg /= 4;
  bb /= 4;

  const isBgColor = (i) => {
    const dr = p[i] - br;
    const dg = p[i + 1] - bg;
    const db = p[i + 2] - bb;
    return Math.sqrt(dr * dr + dg * dg + db * db) <= tol;
  };

  // Flood fill from every edge pixel that matches the background color.
  const bgFlag = new Uint8Array(N);
  const stack = [];
  const pushIf = (idx) => {
    if (!bgFlag[idx] && isBgColor(idx * 4)) {
      bgFlag[idx] = 1;
      stack.push(idx);
    }
  };
  for (let x = 0; x < cw; x++) {
    pushIf(x);
    pushIf((ch - 1) * cw + x);
  }
  for (let y = 0; y < ch; y++) {
    pushIf(y * cw);
    pushIf(y * cw + (cw - 1));
  }
  while (stack.length) {
    const idx = stack.pop();
    const x = idx % cw;
    const y = (idx / cw) | 0;
    if (x > 0) pushIf(idx - 1);
    if (x < cw - 1) pushIf(idx + 1);
    if (y > 0) pushIf(idx - cw);
    if (y < ch - 1) pushIf(idx + cw);
  }

  // Build the mask.
  const mask = makeCanvas(cw, ch);
  const mctx = mask.getContext("2d");
  const mData = mctx.createImageData(cw, ch);
  const md = mData.data;
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    const fg = bgFlag[i] ? 0 : 255;
    md[o] = 255;
    md[o + 1] = 255;
    md[o + 2] = 255;
    md[o + 3] = fg;
  }
  mctx.putImageData(mData, 0, 0);
  // Soften the edge slightly for a cleaner cutout.
  const soft = makeCanvas(cw, ch);
  const softCtx = soft.getContext("2d");
  softCtx.filter = "blur(0.6px)";
  softCtx.drawImage(mask, 0, 0);
  return soft;
}

// Composite the foreground onto a solid color.
// Returns { dataUrl, mask } where mask is the foreground alpha mask canvas.
export function compositeOnColor(el, color, opts = {}) {
  const { w, h } = dims(el);
  const maxSize = opts.maxSize ?? 1400;
  const scale = Math.min(1, maxSize / Math.max(w, h));
  const ow = Math.round(w * scale);
  const oh = Math.round(h * scale);

  const mask = computeForegroundMask(el, opts);

  const out = makeCanvas(ow, oh);
  const octx = out.getContext("2d");
  octx.fillStyle = color;
  octx.fillRect(0, 0, ow, oh);

  // Foreground cut-out: image clipped by the (upscaled) mask.
  const fg = makeCanvas(ow, oh);
  const fctx = fg.getContext("2d");
  fctx.drawImage(el, 0, 0, ow, oh);
  fctx.globalCompositeOperation = "destination-in";
  fctx.drawImage(mask, 0, 0, mask.width, mask.height, 0, 0, ow, oh);
  fctx.globalCompositeOperation = "source-over";

  octx.drawImage(fg, 0, 0);

  return { dataUrl: out.toDataURL("image/png"), mask };
}
