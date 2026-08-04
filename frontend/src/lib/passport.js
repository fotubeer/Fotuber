// Passport photo specs and unit helpers (client-side, 300 DPI print).
export const DPI = 300;

export const mmToPx = (mm) => Math.round((mm / 25.4) * DPI);

export const PHOTO_SIZES = {
  "50x60": { key: "50x60", label: "5×6 cm — Vesikalık", w: 50, h: 60 },
  "35x45": { key: "35x45", label: "3.5×4.5 cm — Biyometrik", w: 35, h: 45 },
};

// 10x15 cm photo paper (portrait).
export const PAPER = { w: 100, h: 150 };

export function getSpec(sizeKey, bg) {
  const s = PHOTO_SIZES[sizeKey] || PHOTO_SIZES["50x60"];
  return {
    ...s,
    pxW: mmToPx(s.w),
    pxH: mmToPx(s.h),
    aspect: s.w / s.h,
    bg,
  };
}

export function sheetLayout(spec, paper = PAPER) {
  const cols = Math.max(1, Math.floor(paper.w / spec.w));
  const rows = Math.max(1, Math.floor(paper.h / spec.h));
  return { cols, rows, pw: mmToPx(paper.w), ph: mmToPx(paper.h) };
}
