// Web-based one-click print. Renders the sheet into a hidden iframe (no popup
// blocker) sized to the paper (mm) and triggers the browser print dialog.
// Falls back to a popup window if the iframe path fails.
function buildPrintHtml(imgsHtml, { widthMm, heightMm, title, multi }) {
  const pageSize =
    widthMm && heightMm
      ? `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }`
      : `@page { margin: 0; }`;
  const imgCss = multi
    ? `.sheet { width: 100%; height: 100vh; object-fit: contain; display: block; page-break-after: always; }`
    : `img { width: 100%; height: 100%; object-fit: contain; display: block; }`;
  return `<!doctype html><html><head><meta charset="utf-8" /><title>${title || "Baskı"}</title>
    <style>
      ${pageSize}
      html, body { margin: 0; padding: 0; background: #fff; }
      ${imgCss}
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>${imgsHtml}</body></html>`;
}

function printViaIframe(html) {
  try {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) { iframe.remove(); return false; }
    doc.open();
    doc.write(html);
    doc.close();

    const cleanup = () => { setTimeout(() => { try { iframe.remove(); } catch {} }, 1000); };
    const fire = () => {
      const win = iframe.contentWindow;
      if (!win) { cleanup(); return; }
      try {
        win.focus();
        win.onafterprint = cleanup;
        win.print();
      } catch { cleanup(); }
    };

    // Wait for all images inside the iframe to load before printing.
    const imgs = doc.images;
    if (!imgs || imgs.length === 0) { setTimeout(fire, 200); return true; }
    let loaded = 0;
    const done = () => { loaded += 1; if (loaded >= imgs.length) setTimeout(fire, 200); };
    for (let i = 0; i < imgs.length; i++) {
      if (imgs[i].complete) done();
      else { imgs[i].onload = done; imgs[i].onerror = done; }
    }
    return true;
  } catch {
    return false;
  }
}

function printViaPopup(html) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return false;
  w.document.write(html + `<script>
      var imgs = document.images, loaded = 0;
      function go(){ setTimeout(function(){ window.focus(); window.print(); }, 200); }
      function done(){ loaded++; if (loaded >= imgs.length) go(); }
      if (!imgs.length) go();
      else for (var i=0;i<imgs.length;i++){ if(imgs[i].complete) done(); else imgs[i].onload = imgs[i].onerror = done; }
      window.onafterprint = function(){ window.close(); };
    <\/script>`);
  w.document.close();
  return true;
}

export function printImageSheet(dataUrl, { widthMm, heightMm, title = "Baskı" } = {}) {
  if (!dataUrl) return false;
  const html = buildPrintHtml(`<img src="${dataUrl}" />`, { widthMm, heightMm, title, multi: false });
  return printViaIframe(html) || printViaPopup(html);
}

// Print multiple full-page sheets as a single multi-page print job.
export function printMultiSheet(sheetDataUrls, { widthMm, heightMm, title = "Baskı" } = {}) {
  const sheets = (sheetDataUrls || []).filter(Boolean);
  if (!sheets.length) return false;
  const imgs = sheets.map((u, i) => `<img class="sheet" src="${u}" data-i="${i}" />`).join("");
  const html = buildPrintHtml(imgs, { widthMm, heightMm, title, multi: true });
  return printViaIframe(html) || printViaPopup(html);
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
