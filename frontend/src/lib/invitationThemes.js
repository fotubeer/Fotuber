// Digital invitation themes + labels. Kept intentionally simple and elegant.
export const INVITATION_THEMES = {
  romantic: {
    name: "Romantik Gül",
    bg: "radial-gradient(1200px 600px at 50% -10%, #ffe4e6 0%, #fff1f2 40%, #fde7ea 100%)",
    panel: "rgba(255,255,255,0.72)",
    border: "rgba(225,29,72,0.18)",
    accent: "#e11d48",
    text: "#4c1d24",
    sub: "#8a5a63",
    heading: "'Georgia', 'Times New Roman', serif",
    dark: false,
  },
  midnight: {
    name: "Gece Mavisi",
    bg: "radial-gradient(1200px 600px at 50% -10%, #1e293b 0%, #111c34 45%, #0b1220 100%)",
    panel: "rgba(255,255,255,0.07)",
    border: "rgba(212,175,55,0.28)",
    accent: "#d4af37",
    text: "#eef1f7",
    sub: "#aeb6c9",
    heading: "'Georgia', 'Times New Roman', serif",
    dark: true,
  },
  botanic: {
    name: "Botanik Yeşil",
    bg: "radial-gradient(1200px 600px at 50% -10%, #e3efe1 0%, #f2f7f0 45%, #dcebd8 100%)",
    panel: "rgba(255,255,255,0.72)",
    border: "rgba(47,125,81,0.2)",
    accent: "#2f7d51",
    text: "#22402f",
    sub: "#5c745f",
    heading: "'Georgia', 'Times New Roman', serif",
    dark: false,
  },
  gold: {
    name: "Altın Zarafet",
    bg: "radial-gradient(1200px 600px at 50% -10%, #f3e9d6 0%, #fbf7ef 45%, #efe1c6 100%)",
    panel: "rgba(255,255,255,0.7)",
    border: "rgba(184,134,11,0.24)",
    accent: "#b8860b",
    text: "#4a3b1e",
    sub: "#8a7647",
    heading: "'Georgia', 'Times New Roman', serif",
    dark: false,
  },
};

export const EVENT_TYPE_LABELS = {
  dugun: "Düğün",
  nisan: "Nişan",
  kina: "Kına Gecesi",
  sunnet: "Sünnet",
  dogumgunu: "Doğum Günü",
  nikah: "Nikah",
  diger: "Özel Etkinlik",
};

export const getTheme = (code, primary) => {
  const t = INVITATION_THEMES[code] || INVITATION_THEMES.romantic;
  return primary ? { ...t, accent: primary } : t;
};
