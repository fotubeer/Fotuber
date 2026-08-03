// Passport / ID photo specifications and paper sizes for Fotuber Vesikalık tool
// All dimensions in mm. Photo aspect determines the crop shape.

export const PHOTO_SPECS = [
  // Turkey
  { code: "tr-bio", country: "TR", label: "Türkiye — Biyometrik", w: 50, h: 60, bg: "#ffffff", format: "biometric" },
  { code: "tr-vesikalik", country: "TR", label: "Türkiye — Vesikalık", w: 45, h: 60, bg: "#ffffff", format: "vesikalik" },
  { code: "tr-4x6", country: "TR", label: "Türkiye — Vesikalık 4×6", w: 40, h: 60, bg: "#ffffff", format: "vesikalik" },
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

// Best-fit paper size for a given photo count and photo dimensions
export const suggestPaper = (photo, count) => {
  const gap = 3;    // 3mm gap between photos
  const margin = 5; // 5mm outer margin
  const footer = 8; // 8mm footer for watermark
  for (const p of PAPER_SIZES) {
    for (const cols of [1, 2, 3, 4, 5, 6]) {
      const rows = Math.ceil(count / cols);
      const totalW = margin * 2 + cols * photo.w + (cols - 1) * gap;
      const totalH = margin * 2 + rows * photo.h + (rows - 1) * gap + footer;
      const totalW2 = margin * 2 + cols * photo.h + (cols - 1) * gap; // landscape try
      const totalH2 = margin * 2 + rows * photo.w + (rows - 1) * gap + footer;
      if ((totalW <= p.w && totalH <= p.h) || (totalW2 <= p.w && totalH2 <= p.h)) {
        return { paper: p, cols, rows };
      }
    }
  }
  return { paper: PAPER_SIZES[PAPER_SIZES.length - 1], cols: 3, rows: Math.ceil(count / 3) };
};

// Preset counts
export const COUNT_PRESETS = [4, 6, 8, 10, 12, 16, 20];
