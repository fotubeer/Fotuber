// Canvas rendering for the single passport photo and the print sheet.

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function srcDims(src) {
  return { w: src.naturalWidth || src.width, h: src.naturalHeight || src.height };
}

export function cssFilter(adj) {
  return `brightness(${adj.brightness}) contrast(${adj.contrast})`;
}

// Warm/cool temperature tint applied within the (already foreground-scoped) layer.
function applyTempTint(ctx, temp, w, h) {
  if (!temp) return;
  const a = Math.min(0.4, (Math.abs(temp) / 100) * 0.4);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = temp > 0 ? "rgb(255,150,40)" : "rgb(40,140,255)";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// Fallback foreground mask by color-keying the plain background (corner sample).
function colorKeyMask(src, sx, sy, sw, sh, tol = 52) {
  const cw = 256;
  const ch = Math.max(1, Math.round((cw * sh) / sw));
  const c = makeCanvas(cw, ch);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, cw, ch);
  let img;
  try {
    img = ctx.getImageData(0, 0, cw, ch);
  } catch (e) {
    // Tainted canvas -> treat everything as foreground.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cw, ch);
    return c;
  }
  const p = img.data;
  const corners = [
    [2, 2],
    [cw - 3, 2],
    [2, ch - 3],
    [cw - 3, ch - 3],
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
  for (let i = 0; i < p.length; i += 4) {
    const dr = p[i] - br;
    const dg = p[i + 1] - bg;
    const db = p[i + 2] - bb;
    const fg = Math.sqrt(dr * dr + dg * dg + db * db) > tol ? 255 : 0;
    p[i] = 255;
    p[i + 1] = 255;
    p[i + 2] = 255;
    p[i + 3] = fg;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Draw one passport photo. Color adjustments affect ONLY the foreground.
export function drawSingle(ctx, dx, dy, tw, th, src, crop, adj, spec, fgMask) {
  const { w: iw, h: ih } = srcDims(src);
  const sx = crop.fx * iw;
  const sy = crop.fy * ih;
  const sw = crop.fw * iw;
  const sh = crop.fh * ih;

  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, tw, th);
  ctx.clip();

  // Solid background + unfiltered base (background stays untouched).
  ctx.fillStyle = spec.bg;
  ctx.fillRect(dx, dy, tw, th);
  ctx.drawImage(src, sx, sy, sw, sh, dx, dy, tw, th);

  const hasAdj = adj.brightness !== 1 || adj.contrast !== 1 || adj.temp !== 0;
  if (hasAdj) {
    const off = makeCanvas(tw, th);
    const octx = off.getContext("2d");
    octx.filter = cssFilter(adj);
    octx.drawImage(src, sx, sy, sw, sh, 0, 0, tw, th);
    octx.filter = "none";
    applyTempTint(octx, adj.temp, tw, th);

    // Clip the filtered layer to the foreground only.
    octx.globalCompositeOperation = "destination-in";
    if (fgMask) {
      const mw = fgMask.width;
      const mh = fgMask.height;
      octx.drawImage(
        fgMask,
        crop.fx * mw,
        crop.fy * mh,
        crop.fw * mw,
        crop.fh * mh,
        0,
        0,
        tw,
        th,
      );
    } else {
      const ck = colorKeyMask(src, sx, sy, sw, sh);
      octx.drawImage(ck, 0, 0, ck.width, ck.height, 0, 0, tw, th);
    }
    octx.globalCompositeOperation = "source-over";
    ctx.drawImage(off, dx, dy);
  }

  ctx.restore();
}

function drawWatermark(ctx, bx, by, bw, bh, wm) {
  if (!wm.text) return;
  ctx.save();
  ctx.globalAlpha = wm.opacity;
  ctx.fillStyle = wm.color || "#64748b";
  // Font size clamped so the watermark never exceeds the band height.
  const fs = Math.min(bh * 0.6, (bw * 1.6) / Math.max(6, wm.text.length));
  ctx.font = `600 ${fs}px Manrope, system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  let tx;
  if (wm.align === "left") {
    ctx.textAlign = "left";
    tx = bx + bh * 0.4;
  } else if (wm.align === "right") {
    ctx.textAlign = "right";
    tx = bx + bw - bh * 0.4;
  } else {
    ctx.textAlign = "center";
    tx = bx + bw / 2;
  }
  ctx.fillText(wm.text, tx, by + bh / 2);
  ctx.restore();
}

function drawCutLines(ctx, geo) {
  const {
    pw,
    ph,
    cols,
    rows,
    startX,
    startY,
    blockW,
    blockH,
    gap,
    bandPx,
    midRow,
  } = geo;
  ctx.save();
  ctx.strokeStyle = "rgba(150,150,150,0.9)";
  ctx.lineWidth = Math.max(1, Math.round(pw / 900));
  ctx.setLineDash([Math.round(pw / 90), Math.round(pw / 150)]);
  const off = gap > 0 ? gap / 2 : 0;

  // Vertical lines — every column boundary, edge to edge (top -> bottom of paper).
  for (let c = 0; c <= cols; c++) {
    let x = startX + c * (blockW + gap);
    if (c > 0 && c < cols) x -= off;
    if (c === cols) x -= gap;
    x = Math.round(x);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ph);
    ctx.stroke();
  }

  // Horizontal lines — every row boundary + the watermark band edges.
  const ys = new Set();
  for (let r = 0; r <= rows; r++) {
    let y = startY + r * (blockH + gap) + (r >= midRow ? bandPx : 0);
    if (r > 0 && r < rows) y -= off;
    if (r === rows) y -= gap;
    ys.add(Math.round(y));
  }
  const bandTop = startY + midRow * (blockH + gap);
  ys.add(Math.round(bandTop));
  ys.add(Math.round(bandTop + bandPx));
  ys.forEach((y) => {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(pw, y);
    ctx.stroke();
  });
  ctx.restore();
}

// Draw the full print sheet: grid of photos + single centered watermark band + edge-to-edge cut lines.
export function drawSheet(ctx, layout, src, crop, adj, spec, fgMask, wm) {
  const { cols, rows, pw, ph } = layout;
  const blockW = spec.pxW;
  const blockH = spec.pxH;
  const gap = wm.gapPx || 0;
  const bandPx = wm.bandPx;
  const contentW = cols * blockW + (cols - 1) * gap;
  const contentH = rows * blockH + (rows - 1) * gap + bandPx;
  const startX = (pw - contentW) / 2;
  const startY = (ph - contentH) / 2;
  const midRow = Math.floor(rows / 2);
  const rowY = (r) => startY + r * (blockH + gap) + (r >= midRow ? bandPx : 0);
  const colX = (c) => startX + c * (blockW + gap);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, pw, ph);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      drawSingle(ctx, colX(c), rowY(r), blockW, blockH, src, crop, adj, spec, fgMask);
    }
  }

  const bandTop = startY + midRow * (blockH + gap);
  drawWatermark(ctx, startX, bandTop, contentW, bandPx, wm);

  drawCutLines(ctx, {
    pw,
    ph,
    cols,
    rows,
    startX,
    startY,
    blockW,
    blockH,
    gap,
    bandPx,
    midRow,
  });
}
