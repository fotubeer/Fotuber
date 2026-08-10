// Web-based one-click print. Opens a print window sized to the paper (mm)
// and triggers the browser print dialog. No native/Electron dependency.
export function printImageSheet(dataUrl, { widthMm, heightMm, title = "Baskı" } = {}) {
  if (!dataUrl) return false;
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return false;
  const pageSize =
    widthMm && heightMm
      ? `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }`
      : `@page { margin: 0; }`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title>
    <style>
      ${pageSize}
      html, body { margin: 0; padding: 0; background: #fff; }
      img { width: 100%; height: 100%; object-fit: contain; display: block; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>
    <img src="${dataUrl}" onload="setTimeout(function(){ window.focus(); window.print(); }, 200)" />
    <script>window.onafterprint = function(){ window.close(); };<\/script>
    </body></html>`);
  w.document.close();
  return true;
}

// Print multiple full-page sheets as a single multi-page print job.
export function printMultiSheet(sheetDataUrls, { widthMm, heightMm, title = "Baskı" } = {}) {
  const sheets = (sheetDataUrls || []).filter(Boolean);
  if (!sheets.length) return false;
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return false;
  const pageSize =
    widthMm && heightMm
      ? `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }`
      : `@page { margin: 0; }`;
  const imgs = sheets
    .map((u, i) => `<img class="sheet" src="${u}" data-i="${i}" />`)
    .join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title>
    <style>
      ${pageSize}
      html, body { margin: 0; padding: 0; background: #fff; }
      .sheet { width: 100%; height: 100vh; object-fit: contain; display: block; page-break-after: always; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>${imgs}
    <script>
      var imgs = document.images, loaded = 0;
      function done(){ loaded++; if (loaded >= imgs.length){ setTimeout(function(){ window.focus(); window.print(); }, 200); } }
      for (var i=0;i<imgs.length;i++){ if(imgs[i].complete) done(); else imgs[i].onload = imgs[i].onerror = done; }
      window.onafterprint = function(){ window.close(); };
    <\/script></body></html>`);
  w.document.close();
  return true;
}

// Tile a single processed photo `count` times onto one or more paper sheets.
// Returns a Promise<string[]> of sheet dataURLs. Adds extra sheets automatically.
export function tilePhotoToSheets(dataUrl, { photoWmm, photoHmm, count = 4, paperWmm = 100, paperHmm = 150, dpi = 300, gapMm = 1 } = {}) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const mmToPx = (mm) => Math.round((mm / 25.4) * dpi);
      const pw = mmToPx(paperWmm), ph = mmToPx(paperHmm);
      const cw = mmToPx(photoWmm), ch = mmToPx(photoHmm), gap = mmToPx(gapMm);
      const cols = Math.max(1, Math.floor((pw + gap) / (cw + gap)));
      const rows = Math.max(1, Math.floor((ph + gap) / (ch + gap)));
      const perSheet = cols * rows;
      const sheetsNeeded = Math.max(1, Math.ceil(count / perSheet));
      const out = [];
      let remaining = count;
      const marginX = Math.round((pw - (cols * cw + (cols - 1) * gap)) / 2);
      const marginY = Math.round((ph - (rows * ch + (rows - 1) * gap)) / 2);
      // source cover-crop rect to spec aspect
      const targetAR = cw / ch;
      const srcAR = img.width / img.height;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (srcAR > targetAR) { sw = img.height * targetAR; sx = (img.width - sw) / 2; }
      else { sh = img.width / targetAR; sy = (img.height - sh) / 2; }
      for (let s = 0; s < sheetsNeeded; s++) {
        const cv = document.createElement("canvas");
        cv.width = pw; cv.height = ph;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, pw, ph);
        const onThis = Math.min(perSheet, remaining);
        for (let k = 0; k < onThis; k++) {
          const r = Math.floor(k / cols), c = k % cols;
          const x = marginX + c * (cw + gap), y = marginY + r * (ch + gap);
          ctx.drawImage(img, sx, sy, sw, sh, x, y, cw, ch);
        }
        remaining -= onThis;
        out.push(cv.toDataURL("image/jpeg", 0.95));
      }
      resolve(out);
    };
    img.onerror = () => resolve([]);
    img.src = dataUrl;
  });
}
