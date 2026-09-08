// Architectural symbol library for the Floor Plan Builder (drag & drop).
// Each symbol: emoji glyph + default size + shape + fill. Rendered as positioned divs.
export const SYMBOL_GROUPS = [
  {
    key: "mimari", label: "🏛️ Mimari",
    items: [
      { type: "kolon_round", label: "Kolon", emoji: "⚪", w: 46, h: 46, shape: "circle", fill: "#9ca3af" },
      { type: "kolon_square", label: "Kare Kolon", emoji: "⬛", w: 46, h: 46, shape: "rect", fill: "#9ca3af" },
      { type: "duvar", label: "Duvar", emoji: "🧱", w: 160, h: 16, shape: "rect", fill: "#6b7280" },
      { type: "cam", label: "Cam Kenar", emoji: "🪟", w: 160, h: 14, shape: "rect", fill: "#7dd3fc" },
      { type: "kapi", label: "Kapı", emoji: "🚪", w: 54, h: 30, shape: "rect", fill: "#b45309" },
      { type: "hazirlik", label: "Hazırlık Odası", emoji: "💄", w: 120, h: 90, shape: "rect", fill: "#f9a8d4" },
    ],
  },
  {
    key: "sahne", label: "🎭 Sahne & Eğlence",
    items: [
      { type: "sahne", label: "Sahne", emoji: "🎤", w: 200, h: 90, shape: "rect", fill: "#7c3aed" },
      { type: "pist", label: "Dans Pisti", emoji: "🕺", w: 160, h: 160, shape: "rect", fill: "#4b5563" },
      { type: "dj", label: "DJ Kabini", emoji: "🎧", w: 90, h: 60, shape: "rect", fill: "#1f2937" },
      { type: "nikah_masasi", label: "Nikah Masası", emoji: "💍", w: 130, h: 60, shape: "rect", fill: "#d97706" },
      { type: "kiosk", label: "Photobooth/Kiosk", emoji: "📸", w: 80, h: 80, shape: "rect", fill: "#0ea5e9" },
    ],
  },
  {
    key: "peyzaj", label: "🌳 Açık Alan & Peyzaj",
    items: [
      { type: "agac", label: "Ağaç", emoji: "🌳", w: 60, h: 60, shape: "circle", fill: "#16a34a" },
      { type: "havuz", label: "Süs Havuzu", emoji: "⛲", w: 140, h: 90, shape: "circle", fill: "#38bdf8" },
      { type: "cit", label: "Bahçe Çiti", emoji: "🪵", w: 180, h: 12, shape: "rect", fill: "#92400e" },
      { type: "yol_hali", label: "Kırmızı Halı", emoji: "🟥", w: 60, h: 200, shape: "rect", fill: "#dc2626" },
      { type: "isik", label: "Işıklandırma", emoji: "💡", w: 160, h: 10, shape: "rect", fill: "#fde047" },
      { type: "sus", label: "Peyzaj Süsü", emoji: "🌸", w: 44, h: 44, shape: "circle", fill: "#f472b6" },
    ],
  },
  {
    key: "oturma", label: "🪑 Oturma & Servis",
    items: [
      { type: "masa_yuvarlak", label: "Yuvarlak Masa", emoji: "🍽️", w: 80, h: 80, shape: "circle", fill: "#0d9488", table: true, seats: 8 },
      { type: "masa_kare", label: "Kare Masa", emoji: "🍴", w: 74, h: 74, shape: "rect", fill: "#0d9488", table: true, seats: 6 },
      { type: "bistro", label: "Bistro Masa", emoji: "🍷", w: 44, h: 44, shape: "circle", fill: "#0f766e", table: true, seats: 4 },
      { type: "servis_banko", label: "Servis Bankosu", emoji: "🧑‍🍳", w: 130, h: 40, shape: "rect", fill: "#374151" },
      { type: "mutfak_kapi", label: "Mutfak Kapısı", emoji: "🍳", w: 60, h: 26, shape: "rect", fill: "#57534e" },
    ],
  },
];

export const SYMBOL_MAP = SYMBOL_GROUPS.reduce((m, g) => {
  g.items.forEach((it) => { m[it.type] = it; });
  return m;
}, {});

export const isTable = (type) => !!(SYMBOL_MAP[type] && SYMBOL_MAP[type].table);
