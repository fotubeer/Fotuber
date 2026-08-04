// Lightweight face detection: native FaceDetector -> skin-tone heuristic -> center fallback.

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function dims(el) {
  return {
    w: el.naturalWidth || el.width,
    h: el.naturalHeight || el.height,
  };
}

function isSkin(r, g, b) {
  return (
    r > 95 &&
    g > 40 &&
    b > 20 &&
    r > g &&
    r > b &&
    r - g > 15 &&
    Math.max(r, g, b) - Math.min(r, g, b) > 15
  );
}

function skinToneFace(el) {
  const { w, h } = dims(el);
  const cw = 140;
  const ch = Math.max(1, Math.round((cw * h) / w));
  const c = makeCanvas(cw, ch);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  try {
    ctx.drawImage(el, 0, 0, cw, ch);
  } catch (e) {
    return null;
  }
  let data;
  try {
    data = ctx.getImageData(0, 0, cw, ch).data;
  } catch (e) {
    return null;
  }
  // Focus on the upper-central region where a head is expected.
  const x0 = Math.floor(cw * 0.12);
  const x1 = Math.ceil(cw * 0.88);
  const y0 = 0;
  const y1 = Math.ceil(ch * 0.7);
  let minX = cw,
    minY = ch,
    maxX = 0,
    maxY = 0,
    count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * cw + x) * 4;
      if (isSkin(data[i], data[i + 1], data[i + 2])) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        count++;
      }
    }
  }
  if (count < cw * ch * 0.01) return null;
  const sx = w / cw;
  const sy = h / ch;
  return {
    x: minX * sx,
    y: minY * sy,
    w: (maxX - minX) * sx,
    h: (maxY - minY) * sy,
  };
}

export async function detectFace(el) {
  const { w, h } = dims(el);
  try {
    if (typeof window !== "undefined" && "FaceDetector" in window) {
      const fd = new window.FaceDetector({
        fastMode: true,
        maxDetectedFaces: 1,
      });
      const faces = await fd.detect(el);
      if (faces && faces.length) {
        const b = faces[0].boundingBox;
        return {
          x: b.x,
          y: b.y,
          w: b.width,
          h: b.height,
          source: "native",
        };
      }
    }
  } catch (e) {
    /* fall through */
  }
  const box = skinToneFace(el);
  if (box && box.w > 0 && box.h > 0) return { ...box, source: "heuristic" };
  const fw = w * 0.5;
  const fh = h * 0.5;
  return { x: (w - fw) / 2, y: h * 0.14, w: fw, h: fh, source: "fallback" };
}

// Build a passport crop (fractions of the image) from a face box.
export function cropFromFace(box, el, aspect) {
  const { w, h } = dims(el);
  const faceCx = box.x + box.w / 2;
  let cropH = box.h / 0.6; // face ≈ 60% of the frame height
  let cropW = cropH * aspect;
  if (cropW < box.w * 1.5) {
    cropW = box.w * 1.5;
    cropH = cropW / aspect;
  }
  cropW = Math.min(cropW, w);
  cropH = Math.min(cropH, h);
  let cropX = faceCx - cropW / 2;
  let cropY = box.y - cropH * 0.22; // headroom above the head
  cropX = Math.max(0, Math.min(cropX, w - cropW));
  cropY = Math.max(0, Math.min(cropY, h - cropH));
  return {
    fx: cropX / w,
    fy: cropY / h,
    fw: cropW / w,
    fh: cropH / h,
  };
}
