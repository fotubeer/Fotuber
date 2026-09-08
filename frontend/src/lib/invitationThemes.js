// Digital invitation themes. 4 free + 4 premium. Each has explicit text colors
// so nothing ever renders as white-on-white. `motif` drives the animated
// decorative background layer (see InvitationMotifs.jsx).
export const INVITATION_THEMES = {
  // ---- FREE ----
  romantic: {
    name: "Romantik Gül", premium: false, motif: "rose_petals",
    bg: "radial-gradient(1200px 600px at 50% -10%, #ffe4e6 0%, #fff1f2 40%, #fde7ea 100%)",
    panel: "rgba(255,255,255,0.72)", border: "rgba(225,29,72,0.18)",
    accent: "#e11d48", text: "#4c1d24", sub: "#8a5a63",
    heading: "'Cormorant Garamond', serif", script: "'Great Vibes', cursive", dark: false,
  },
  botanic: {
    name: "Botanik Yeşil", premium: false, motif: "drifting_leaves",
    bg: "radial-gradient(1200px 600px at 50% -10%, #e3efe1 0%, #f2f7f0 45%, #dcebd8 100%)",
    panel: "rgba(255,255,255,0.72)", border: "rgba(47,125,81,0.2)",
    accent: "#2f7d51", text: "#22402f", sub: "#5c745f",
    heading: "'Cormorant Garamond', serif", script: "'Great Vibes', cursive", dark: false,
  },
  gold: {
    name: "Altın Zarafet", premium: false, motif: "gold_dust",
    bg: "radial-gradient(1200px 600px at 50% -10%, #f3e9d6 0%, #fbf7ef 45%, #efe1c6 100%)",
    panel: "rgba(255,255,255,0.7)", border: "rgba(184,134,11,0.24)",
    accent: "#b8860b", text: "#4a3b1e", sub: "#8a7647",
    heading: "'Cormorant Garamond', serif", script: "'Great Vibes', cursive", dark: false,
  },
  sky: {
    name: "Gökyüzü Mavi", premium: false, motif: "soft_clouds",
    bg: "radial-gradient(1200px 600px at 50% -10%, #dbeafe 0%, #eff6ff 45%, #e0ecff 100%)",
    panel: "rgba(255,255,255,0.74)", border: "rgba(37,99,235,0.18)",
    accent: "#2563eb", text: "#1e293b", sub: "#5b6b86",
    heading: "'Cormorant Garamond', serif", script: "'Great Vibes', cursive", dark: false,
  },
  // ---- PREMIUM ----
  noir: {
    name: "Noir Lüks", premium: true, motif: "gold_shimmer_particles",
    bg: "radial-gradient(1200px 600px at 50% -10%, #1a1a1a 0%, #0d0d0d 45%, #000000 100%)",
    panel: "rgba(255,255,255,0.06)", border: "rgba(212,175,55,0.35)",
    accent: "#d4af37", text: "#f5eede", sub: "#c9bd9a",
    heading: "'Cormorant Garamond', serif", script: "'Great Vibes', cursive", dark: true,
  },
  royal: {
    name: "Kraliyet Moru", premium: true, motif: "stardust_bokeh",
    bg: "radial-gradient(1200px 600px at 50% -10%, #3b1258 0%, #2a0d43 45%, #190826 100%)",
    panel: "rgba(255,255,255,0.07)", border: "rgba(233,201,110,0.35)",
    accent: "#e9c96e", text: "#f4ecff", sub: "#c8b6dd",
    heading: "'Cormorant Garamond', serif", script: "'Great Vibes', cursive", dark: true,
  },
  ocean: {
    name: "Okyanus Zümrüt", premium: true, motif: "water_caustics",
    bg: "radial-gradient(1200px 600px at 50% -10%, #063b3a 0%, #052a2b 45%, #041e1f 100%)",
    panel: "rgba(255,255,255,0.07)", border: "rgba(94,234,212,0.3)",
    accent: "#5eead4", text: "#e8fbf7", sub: "#a7d8cf",
    heading: "'Cormorant Garamond', serif", script: "'Great Vibes', cursive", dark: true,
  },
  marble: {
    name: "Mermer Roz-Altın", premium: true, motif: "marble_veins",
    bg: "radial-gradient(1200px 600px at 50% -10%, #f7e7e3 0%, #fdf6f2 45%, #f2dcd6 100%)",
    panel: "rgba(255,255,255,0.78)", border: "rgba(183,110,121,0.3)",
    accent: "#b76e79", text: "#4a2f33", sub: "#8a6a6f",
    heading: "'Cormorant Garamond', serif", script: "'Great Vibes', cursive", dark: false,
  },
};

export const FREE_THEMES = Object.keys(INVITATION_THEMES).filter((k) => !INVITATION_THEMES[k].premium);
export const PREMIUM_THEMES = Object.keys(INVITATION_THEMES).filter((k) => INVITATION_THEMES[k].premium);

export const EVENT_TYPE_LABELS = {
  dugun: "Düğün", nisan: "Nişan", kina: "Kına Gecesi", sunnet: "Sünnet",
  dogumgunu: "Doğum Günü", nikah: "Nikah", diger: "Özel Etkinlik",
};

export const getTheme = (code, primary) => {
  const t = INVITATION_THEMES[code] || INVITATION_THEMES.romantic;
  return primary ? { ...t, accent: primary } : t;
};

// Solid background colors for print-ready PDF (theme bg is a gradient, unusable for print).
export const PRINT_BG = {
  romantic: "#FFF1F2", botanic: "#F2F7F0", gold: "#FBF7EF", sky: "#EFF6FF",
  noir: "#0D0D0D", royal: "#190826", ocean: "#041E1F", marble: "#FDF6F2",
};

export const printColors = (code) => {
  const t = INVITATION_THEMES[code] || INVITATION_THEMES.romantic;
  return { bg_color: PRINT_BG[code] || "#FFF7F0", accent_color: t.accent, text_color: t.text };
};
