// Passport / ID photo specifications and paper sizes for Fotuber Vesikalık tool
// All dimensions in mm. Photo aspect determines the crop shape.

export const PHOTO_SPECS = [
  // Turkey
  { code: "tr-bio", country: "TR", label: "Türkiye — Biyometrik", w: 50, h: 60, bg: "#ffffff", format: "biometric" },
  { code: "tr-vesikalik", country: "TR", label: "Türkiye — Vesikalık", w: 45, h: 60, bg: "#ffffff", format: "vesikalik" },
  { code: "tr-4x6", country: "TR", label: "Türkiye — Vesikalık 4×6", w: 40, h: 60, bg: "#ffffff", format: "vesikalik" },
  // Türkiye Askeri Kimlik — ICAO/biyometrik kırpma (kravat altından çerçeveleme).
  // 2.5×3.2 cm: hem baskı hem dijital (max 100 KB). 297×378 px: yalnızca dijital.
  { code: "tr-military", country: "TR", label: "Türkiye — Askeri Kimlik (2.5×3.2 cm)", w: 25, h: 32, bg: "#ffffff", format: "biometric", maxKb: 100, military: true },
  { code: "tr-military-digital", country: "TR", label: "Türkiye — Askeri Kimlik (297×378 px · dijital)", w: 25, h: 32, bg: "#ffffff", format: "biometric", digitalOnly: true, exactPx: { w: 297, h: 378 }, maxKb: 100, military: true },
  // USA
  { code: "us-passport", country: "US", label: "ABD — Pasaport 2×2\"", w: 51, h: 51, bg: "#ffffff", format: "biometric" },
  // Schengen / EU
  { code: "eu-bio", country: "EU", label: "Schengen / AB — Biyometrik", w: 35, h: 45, bg: "#f2f2f2", format: "biometric" },
  { code: "de-bio", country: "DE", label: "Almanya — Biyometrik", w: 35, h: 45, bg: "#f2f2f2", format: "biometric" },
  { code: "fr-bio", country: "FR", label: "Fransa — Biyometrik", w: 35, h: 45, bg: "#ffffff", format: "biometric" },
  { code: "it-bio", country: "IT", label: "İtalya — Biyometrik", w: 35, h: 40, bg: "#ffffff", format: "biometric" },
  { code: "es-bio", country: "ES", label: "İspanya — Biyometrik", w: 32, h: 26, bg: "#ffffff", format: "biometric" },
  { code: "nl-bio", country: "NL", label: "Hollanda — Biyometrik", w: 35, h: 45, bg: "#ffffff", format: "biometric" },
  { code: "gb-bio", country: "UK", label: "İngiltere — Biyometrik", w: 35, h: 45, bg: "#f2f2f2", format: "biometric" },
  { code: "pl-bio", country: "PL", label: "Polonya — Biyometrik", w: 35, h: 45, bg: "#ffffff", format: "biometric" },
  { code: "gr-bio", country: "GR", label: "Yunanistan — Biyometrik", w: 40, h: 60, bg: "#ffffff", format: "biometric" },
  // Middle East
  { code: "sa-bio", country: "SA", label: "Suudi Arabistan — Biyometrik", w: 40, h: 60, bg: "#ffffff", format: "biometric" },
  { code: "ae-bio", country: "AE", label: "BAE — Biyometrik", w: 43, h: 55, bg: "#ffffff", format: "biometric" },
  { code: "ir-bio", country: "IR", label: "İran — Biyometrik", w: 40, h: 60, bg: "#ffffff", format: "biometric" },
  { code: "eg-bio", country: "EG", label: "Mısır — Biyometrik", w: 40, h: 60, bg: "#ffffff", format: "biometric" },
  // Asia
  { code: "cn-bio", country: "CN", label: "Çin — Biyometrik", w: 33, h: 48, bg: "#ffffff", format: "biometric" },
  { code: "jp-bio", country: "JP", label: "Japonya — Biyometrik", w: 35, h: 45, bg: "#ffffff", format: "biometric" },
  { code: "kr-bio", country: "KR", label: "G. Kore — Biyometrik", w: 35, h: 45, bg: "#ffffff", format: "biometric" },
  { code: "in-bio", country: "IN", label: "Hindistan — Biyometrik", w: 51, h: 51, bg: "#ffffff", format: "biometric" },
  { code: "ru-bio", country: "RU", label: "Rusya — Biyometrik", w: 35, h: 45, bg: "#ffffff", format: "biometric" },
  // Americas
  { code: "ca-bio", country: "CA", label: "Kanada — Biyometrik", w: 50, h: 70, bg: "#ffffff", format: "biometric" },
  { code: "br-bio", country: "BR", label: "Brezilya — Biyometrik", w: 50, h: 70, bg: "#ffffff", format: "biometric" },
  { code: "mx-bio", country: "MX", label: "Meksika — Biyometrik", w: 35, h: 45, bg: "#ffffff", format: "biometric" },
  { code: "ar-bio", country: "AR", label: "Arjantin — Biyometrik", w: 40, h: 40, bg: "#ffffff", format: "biometric" },
  // Oceania & Africa
  { code: "au-bio", country: "AU", label: "Avustralya — Biyometrik", w: 35, h: 45, bg: "#f2f2f2", format: "biometric" },
  { code: "za-bio", country: "ZA", label: "G. Afrika — Biyometrik", w: 35, h: 45, bg: "#ffffff", format: "biometric" },
  { code: "ng-bio", country: "NG", label: "Nijerya — Biyometrik", w: 35, h: 45, bg: "#ffffff", format: "biometric" },
];

// Paper sizes (portrait mm)
export const PAPER_SIZES = [
  { code: "10x15", label: "10 × 15 cm", w: 100, h: 150 },
  { code: "13x18", label: "13 × 18 cm", w: 130, h: 180 },
  { code: "15x21", label: "15 × 21 cm", w: 150, h: 210 },
  { code: "20x30", label: "20 × 30 cm", w: 200, h: 300 },
  { code: "30x40", label: "30 × 40 cm", w: 300, h: 400 },
];

// Best-fit paper size for a given photo count and photo dimensions.
// Photo labs print edge-to-edge with slight bleed, so we allow a 2mm tolerance
// against the nominal paper size and use zero margin / gap for the fit check —
// this is what makes 4 × biometric (50×60mm) fit tightly on a 10×15 print.
export const suggestPaper = (photo, count) => {
  const bleedTol = 2; // paper labs give ~1–2mm bleed
  // Try each paper from smallest to largest; for the same paper try layouts
  // that come closest to 2×2 style arrangements first (better looking prints).
  const layoutsFor = (n) => {
    const opts = [];
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      opts.push({ cols, rows });
    }
    // Prefer the most square-ish layout (smallest |cols-rows|), then fewer cols
    return opts.sort((a, b) => Math.abs(a.cols - a.rows) - Math.abs(b.cols - b.rows) || a.cols - b.cols);
  };
  const fits = (cols, rows, pw, ph) => {
    const w1 = cols * photo.w, h1 = rows * photo.h;
    const w2 = cols * photo.h, h2 = rows * photo.w;
    return (w1 <= pw + bleedTol && h1 <= ph + bleedTol) ||
           (w2 <= pw + bleedTol && h2 <= ph + bleedTol);
  };
  for (const p of PAPER_SIZES) {
    for (const { cols, rows } of layoutsFor(count)) {
      if (fits(cols, rows, p.w, p.h)) return { paper: p, cols, rows };
    }
  }
  return { paper: PAPER_SIZES[PAPER_SIZES.length - 1], cols: Math.ceil(Math.sqrt(count)), rows: Math.ceil(count / Math.ceil(Math.sqrt(count))) };
};

// Preset counts
export const COUNT_PRESETS = [4, 6, 8, 10, 12, 16, 20];
