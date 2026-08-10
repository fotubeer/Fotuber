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
