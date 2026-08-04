// Foreground editing tools operating on a full-resolution image element.

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function dims(el) {
  return { w: el.naturalWidth || el.width, h: el.naturalHeight || el.height };
}

function ctxOf(el) {
  const { w, h } = dims(el);
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(el, 0, 0, w, h);
  return { c, ctx, w, h };
}

export function hexToRgb(hex) {
  const m = hex.replace("#", "");
  const n = parseInt(
    m.length === 3
      ? m
          .split("")
          .map((x) => x + x)
          .join("")
      : m,
    16,
  );
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: r * 255, g: g * 255, b: b * 255 };
}

function isSkin(r, g, b) {
  return r > 95 && g > 40 && b > 20 && r > g && r > b && r - g > 15;
}

// Recolor the garment (lower part of the frame) to a target color, keeping shading.
export async function recolorGarment(el, hexColor) {
  const { c, ctx, w, h } = ctxOf(el);
  const target = rgbToHsl(...Object.values(hexToRgb(hexColor)));
  const y0 = Math.floor(h * 0.55);
  const img = ctx.getImageData(0, 0, w, h);
  const p = img.data;
  const featherPx = h * 0.08;
  for (let y = y0; y < h; y++) {
    const fade = Math.min(1, (y - y0) / featherPx);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = p[i];
      const g = p[i + 1];
      const b = p[i + 2];
      if (isSkin(r, g, b)) continue;
      const src = rgbToHsl(r, g, b);
      const out = hslToRgb(target.h, Math.min(0.85, target.s), src.l);
      p[i] = r + (out.r - r) * fade;
      p[i + 1] = g + (out.g - g) * fade;
      p[i + 2] = b + (out.b - b) * fade;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

// Remove red-eye by desaturating strongly-red pixels in the upper face band.
export async function removeRedEye(el) {
  const { c, ctx, w, h } = ctxOf(el);
  const y0 = Math.floor(h * 0.18);
  const y1 = Math.floor(h * 0.58);
  const img = ctx.getImageData(0, 0, w, h);
  const p = img.data;
  let found = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = p[i];
      const g = p[i + 1];
      const b = p[i + 2];
      if (r > 70 && r > g * 1.5 && r > b * 1.4) {
        const v = Math.round(g * 0.55 + b * 0.45);
        p[i] = v;
        p[i + 1] = v;
        p[i + 2] = v;
        found++;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return { dataUrl: c.toDataURL("image/png"), found: found > 8 };
}

// Sharpen the eye band with a light unsharp (3x3) kernel.
export async function sharpenEyes(el) {
  const { c, ctx, w, h } = ctxOf(el);
  const y0 = Math.max(1, Math.floor(h * 0.2));
  const y1 = Math.min(h - 1, Math.floor(h * 0.55));
  const img = ctx.getImageData(0, 0, w, h);
  const src = img.data;
  const out = new Uint8ClampedArray(src);
  const amount = 0.7;
  for (let y = y0; y < y1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const center = src[i + ch];
        const sum =
          src[i - 4 + ch] +
          src[i + 4 + ch] +
          src[i - w * 4 + ch] +
          src[i + w * 4 + ch];
        const lap = center * 4 - sum; // high-pass
        out[i + ch] = center + amount * lap;
      }
    }
  }
  img.data.set(out);
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}
