// ─────────────────────────────────────────────────────────────────────────────
// RICH TEMPLATE CATALOG — category-based, drives the realistic (video-free) engine.
// Each template is a drop-in "visual" object (same shape the preview/view expect)
// PLUS engine fields: foil colors, canvas particle type, texture and 3D reveal.
// ─────────────────────────────────────────────────────────────────────────────
import { getTheme } from "@/lib/invitationThemes";

// Categories shown in the wizard. eventType maps to backend INVITE_EVENT_TYPES.
export const INVITATION_CATEGORIES = [
  { key: "dugun", label: "Düğün", emoji: "💍", eventType: "dugun" },
  { key: "nisan", label: "Nişan", emoji: "🥂", eventType: "nisan" },
  { key: "kina", label: "Kına Gecesi", emoji: "🔴", eventType: "kina" },
  { key: "nikah", label: "Nikah", emoji: "📜", eventType: "nikah" },
  { key: "bride", label: "Bride to Be", emoji: "👰", eventType: "diger" },
  { key: "sunnet", label: "Sünnet Düğünü", emoji: "🎈", eventType: "sunnet" },
  { key: "kurumsal", label: "Kurumsal & Lansman", emoji: "🏢", eventType: "diger" },
];

// Pricing bridge: templates keep their own palette but map to an existing theme
// key so the SERVER-side pricing (premium vs free) stays unchanged.
export const priceThemeFor = (tpl) => (tpl && tpl.premium ? "noir" : "romantic");

const S = "'Great Vibes', cursive";
const CARDO = "'Cardo', serif";
const CORM = "'Cormorant Garamond', serif";
const PLAYFAIR = "'Playfair Display', serif";
const CINZEL = "'Cinzel', serif";
const MARCELLUS = "'Marcellus', serif";
const MONT = "'Montserrat', sans-serif";
const PARIS = "'Parisienne', cursive";
const TANGERINE = "'Tangerine', cursive";
const JOSEF = "'Josefin Sans', sans-serif";

const GOLD_FOIL = ["#8a6a1e", "#f6e6ad", "#c8a24a"];
const SILVER_FOIL = ["#7c8593", "#ffffff", "#c3ccd8"];
const ROSE_FOIL = ["#a65968", "#ffd9e3", "#c77e8d"];

// Reusable builder to keep entries short & consistent.
const T = (o) => ({
  premium: false,
  panel: o.dark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.72)",
  heading: CORM,
  script: S,
  foil: null,
  particleColor: o.accent,
  texture: o.dark ? "dark" : "cotton",
  reveal: "envelope",
  wax: o.accent,
  ...o,
});

export const INVITATION_TEMPLATES = {
  // ═══════════ 💍 DÜĞÜN (10) ═══════════
  "wed-gold": T({ category: "dugun", name: "Lüks Gold Varak", premium: true,
    bg: "radial-gradient(1200px 700px at 50% -10%, #1c1710 0%, #100c07 45%, #060402 100%)",
    border: "rgba(200,162,74,0.4)", accent: "#c8a24a", text: "#f4ead0", sub: "#c8b48a",
    dark: true, heading: CINZEL, script: S, foil: GOLD_FOIL, particles: "gold_dust", particleColor: "#e6c260",
    texture: "linen", reveal: "envelope", wax: "#7a1414" }),
  "wed-botanic": T({ category: "dugun", name: "Minimalist Botanik",
    bg: "radial-gradient(1200px 600px at 50% -10%, #eef3ea 0%, #f6f8f3 45%, #e3ebdc 100%)",
    border: "rgba(96,122,84,0.24)", accent: "#5f7a54", text: "#2c3a26", sub: "#6a7d5f",
    heading: CORM, script: S, particles: "leaves", particleColor: "#7f9a70", texture: "cotton", reveal: "card" }),
  "wed-vintage": T({ category: "dugun", name: "Vintage Sepya",
    bg: "radial-gradient(1200px 600px at 50% -10%, #efe3cf 0%, #f6efe0 45%, #e6d6ba 100%)",
    border: "rgba(150,113,66,0.3)", accent: "#8a5a2b", text: "#4a3620", sub: "#8a7350",
    heading: PLAYFAIR, script: TANGERINE, particles: "gold_dust", particleColor: "#b98a4a", texture: "linen", reveal: "envelope", wax: "#6d4720" }),
  "wed-royal": T({ category: "dugun", name: "Royal Saray", premium: true,
    bg: "radial-gradient(1200px 700px at 50% -10%, #2a0f3f 0%, #1b0a2b 45%, #0f0518 100%)",
    border: "rgba(233,201,110,0.4)", accent: "#e9c96e", text: "#f4ecff", sub: "#cbb8df",
    dark: true, heading: CINZEL, script: S, foil: GOLD_FOIL, particles: "sparkle", particleColor: "#e9c96e",
    texture: "dark", reveal: "envelope", wax: "#5a2d86" }),
  "wed-boho": T({ category: "dugun", name: "Modern Bohem",
    bg: "radial-gradient(1200px 600px at 50% -10%, #f3e7dd 0%, #f9f1ea 45%, #ecd9c9 100%)",
    border: "rgba(180,120,90,0.28)", accent: "#b07a56", text: "#4d382b", sub: "#8a6b58",
    heading: MARCELLUS, script: PARIS, particles: "rose_petals", particleColor: "#d9a98a", texture: "cotton", reveal: "card" }),
  "wed-marble": T({ category: "dugun", name: "Mermer & Altın", premium: true,
    bg: "radial-gradient(1200px 600px at 50% -10%, #f7f2ee 0%, #fdf9f6 45%, #ede2da 100%)",
    border: "rgba(183,110,121,0.3)", accent: "#b07d5b", text: "#3f342c", sub: "#8a746a",
    heading: PLAYFAIR, script: S, foil: GOLD_FOIL, particles: "gold_dust", particleColor: "#c8a24a", texture: "marble", reveal: "envelope", wax: "#9a6a3f" }),
  "wed-blush": T({ category: "dugun", name: "Pudra Zarafet",
    bg: "radial-gradient(1200px 600px at 50% -10%, #fbeef1 0%, #fff6f8 45%, #f6dfe6 100%)",
    border: "rgba(200,120,140,0.24)", accent: "#c77e8d", text: "#4a2f36", sub: "#9a6f78",
    heading: CORM, script: PARIS, foil: ROSE_FOIL, particles: "rose_petals", particleColor: "#e6a9bf", texture: "cotton", reveal: "card" }),
  "wed-noir": T({ category: "dugun", name: "Noir Lüks", premium: true,
    bg: "radial-gradient(1200px 700px at 50% -10%, #17140f 0%, #0c0a07 45%, #050403 100%)",
    border: "rgba(212,175,55,0.36)", accent: "#d4af37", text: "#f5eede", sub: "#c9bd9a",
    dark: true, heading: MARCELLUS, script: S, foil: GOLD_FOIL, particles: "sparkle", particleColor: "#d4af37", texture: "dark", reveal: "envelope", wax: "#3a2a08" }),
  "wed-emerald": T({ category: "dugun", name: "Zümrüt Gece", premium: true,
    bg: "radial-gradient(1200px 700px at 50% -10%, #08322b 0%, #052220 45%, #03110f 100%)",
    border: "rgba(94,234,212,0.3)", accent: "#8fe3cf", text: "#e8fbf7", sub: "#a7d8cf",
    dark: true, heading: CINZEL, script: S, foil: ["#3f8f7c", "#d4fff4", "#5eead4"], particles: "gold_dust", particleColor: "#5eead4", texture: "dark", reveal: "envelope", wax: "#0e4a3a" }),
  "wed-sky": T({ category: "dugun", name: "Gökyüzü Ferah",
    bg: "radial-gradient(1200px 600px at 50% -10%, #e6effb 0%, #f3f8ff 45%, #dce9fb 100%)",
    border: "rgba(70,120,200,0.22)", accent: "#3f74c4", text: "#25324a", sub: "#607498",
    heading: CORM, script: S, particles: "bokeh", particleColor: "#8fb4e8", texture: "cotton", reveal: "card" }),

  // ═══════════ 🥂 NİŞAN (10) ═══════════
  "eng-pastel": T({ category: "nisan", name: "Pastel Çiçekli",
    bg: "radial-gradient(1200px 600px at 50% -10%, #fdeef2 0%, #fff7fa 45%, #f7e3ec 100%)",
    border: "rgba(210,130,160,0.24)", accent: "#cf6f92", text: "#4a2b37", sub: "#9a6d7c",
    heading: CORM, script: PARIS, particles: "rose_petals", particleColor: "#f0a9c4", texture: "cotton", reveal: "card" }),
  "eng-crystal": T({ category: "nisan", name: "Kristal Işıltı", premium: true,
    bg: "radial-gradient(1200px 700px at 50% -10%, #1a2036 0%, #101529 45%, #080b17 100%)",
    border: "rgba(200,214,240,0.34)", accent: "#cdd8f0", text: "#eef2ff", sub: "#b6c1de",
    dark: true, heading: MARCELLUS, script: S, foil: SILVER_FOIL, particles: "sparkle", particleColor: "#dfe7fb", texture: "dark", reveal: "envelope", wax: "#33406e" }),
  "eng-geo": T({ category: "nisan", name: "Modern Geometrik",
    bg: "radial-gradient(1200px 600px at 50% -10%, #f5f1ea 0%, #fbf8f2 45%, #ece3d4 100%)",
    border: "rgba(160,130,90,0.26)", accent: "#a9853f", text: "#3f342279", sub: "#8a744f",
    heading: JOSEF, script: S, foil: GOLD_FOIL, particles: "gold_dust", particleColor: "#c9a24a", texture: "linen", reveal: "card" }),
  "eng-elegant": T({ category: "nisan", name: "Elegant Roz-Altın", premium: true,
    bg: "radial-gradient(1200px 600px at 50% -10%, #f8ecec 0%, #fdf6f4 45%, #efdcd8 100%)",
    border: "rgba(190,120,120,0.3)", accent: "#c07d76", text: "#432f2c", sub: "#94706a",
    heading: PLAYFAIR, script: S, foil: ROSE_FOIL, particles: "rose_petals", particleColor: "#e6b3b0", texture: "marble", reveal: "envelope", wax: "#9a5c56" }),
  "eng-blush2": T({ category: "nisan", name: "Pudra & İnci",
    bg: "radial-gradient(1200px 600px at 50% -10%, #faeef0 0%, #fff7f9 45%, #f4e0e6 100%)",
    border: "rgba(200,140,155,0.24)", accent: "#c98595", text: "#472f36", sub: "#976f79",
    heading: CORM, script: PARIS, particles: "bokeh", particleColor: "#f2c9d6", texture: "cotton", reveal: "card" }),
  "eng-gold": T({ category: "nisan", name: "Altın Zarafet", premium: true,
    bg: "radial-gradient(1200px 700px at 50% -10%, #1a1610 0%, #100c07 45%, #060402 100%)",
    border: "rgba(200,162,74,0.36)", accent: "#d4af37", text: "#f4ead0", sub: "#c8b48a",
    dark: true, heading: CINZEL, script: S, foil: GOLD_FOIL, particles: "gold_dust", particleColor: "#e6c260", texture: "dark", reveal: "envelope", wax: "#5a3d12" }),
  "eng-lavender": T({ category: "nisan", name: "Lavanta Rüyası",
    bg: "radial-gradient(1200px 600px at 50% -10%, #efe9f8 0%, #f7f3fc 45%, #e4daf3 100%)",
    border: "rgba(150,120,200,0.24)", accent: "#8a6bc0", text: "#362a4a", sub: "#7a6a99",
    heading: CORM, script: PARIS, particles: "rose_petals", particleColor: "#c3aee6", texture: "cotton", reveal: "card" }),
  "eng-peach": T({ category: "nisan", name: "Şeftali Bahçe",
    bg: "radial-gradient(1200px 600px at 50% -10%, #fdece0 0%, #fff6ef 45%, #f7ddc9 100%)",
    border: "rgba(210,140,90,0.24)", accent: "#d68a52", text: "#4a3324", sub: "#9a7358",
    heading: MARCELLUS, script: S, particles: "leaves", particleColor: "#efb98a", texture: "cotton", reveal: "card" }),
  "eng-teal": T({ category: "nisan", name: "Petrol & Altın", premium: true,
    bg: "radial-gradient(1200px 700px at 50% -10%, #0c2b30 0%, #081d21 45%, #040f11 100%)",
    border: "rgba(94,214,200,0.3)", accent: "#e6c260", text: "#e8f7f5", sub: "#a7cfc9",
    dark: true, heading: CINZEL, script: S, foil: GOLD_FOIL, particles: "sparkle", particleColor: "#e6c260", texture: "dark", reveal: "envelope", wax: "#0e4a44" }),
  "eng-classic": T({ category: "nisan", name: "Klasik Fildişi",
    bg: "radial-gradient(1200px 600px at 50% -10%, #f6f1e6 0%, #fbf8f0 45%, #ece1cd 100%)",
    border: "rgba(160,140,100,0.26)", accent: "#a98a52", text: "#3e3524", sub: "#8a7a58",
    heading: PLAYFAIR, script: S, particles: "gold_dust", particleColor: "#c8a86a", texture: "linen", reveal: "envelope", wax: "#7a6438" }),

  // ═══════════ 🔴 KINA GECESİ (10) ═══════════
  "kina-bordo": T({ category: "kina", name: "Geleneksel Bordo-Altın", premium: true,
    bg: "radial-gradient(1200px 700px at 50% -10%, #4a0f12 0%, #33080b 45%, #1c0406 100%)",
    border: "rgba(230,180,90,0.4)", accent: "#e6b45a", text: "#fbe9cf", sub: "#d9b48a",
    dark: true, heading: CINZEL, script: S, foil: GOLD_FOIL, particles: "orient", particleColor: "#e6b45a", texture: "dark", reveal: "envelope", wax: "#7a1418" }),
  "kina-saray": T({ category: "kina", name: "Saray Motifli", premium: true,
    bg: "radial-gradient(1200px 700px at 50% -10%, #5a1220 0%, #3f0c17 45%, #24060d 100%)",
    border: "rgba(240,200,120,0.4)", accent: "#f0c878", text: "#fdeccf", sub: "#e0b98f",
    dark: true, heading: MARCELLUS, script: S, foil: GOLD_FOIL, particles: "orient", particleColor: "#f0c878", texture: "dark", reveal: "curtain", wax: "#7a1420" }),
  "kina-modern": T({ category: "kina", name: "Işıltılı Modern",
    bg: "radial-gradient(1200px 600px at 50% -10%, #7a1f2b 0%, #5a1520 45%, #3a0d15 100%)",
    border: "rgba(240,190,120,0.34)", accent: "#f0be78", text: "#fbe6d4", sub: "#e6b596",
    dark: true, heading: PLAYFAIR, script: S, foil: GOLD_FOIL, particles: "orient", particleColor: "#f0be78", texture: "dark", reveal: "curtain", wax: "#8a2230" }),
  "kina-henna": T({ category: "kina", name: "Kına Yakımı",
    bg: "radial-gradient(1200px 600px at 50% -10%, #6d1f16 0%, #4a140e 45%, #2c0a07 100%)",
    border: "rgba(230,160,90,0.34)", accent: "#e6a45a", text: "#fbe2cf", sub: "#d9a888",
    dark: true, heading: MARCELLUS, script: S, particles: "orient", particleColor: "#e6a45a", texture: "dark", reveal: "curtain", wax: "#7a2a16" }),
  "kina-rose": T({ category: "kina", name: "Gül & Kırmızı",
    bg: "radial-gradient(1200px 600px at 50% -10%, #7a1526 0%, #5a0f1c 45%, #380810 100%)",
    border: "rgba(240,180,120,0.3)", accent: "#f0b478", text: "#fbe0d6", sub: "#e0a894",
    dark: true, heading: CORM, script: PARIS, particles: "rose_petals", particleColor: "#e88a9a", texture: "dark", reveal: "curtain", wax: "#8a1a2a" }),
  "kina-anatolia": T({ category: "kina", name: "Anadolu Zarafeti", premium: true,
    bg: "radial-gradient(1200px 700px at 50% -10%, #46101a 0%, #300a12 45%, #1a050a 100%)",
    border: "rgba(230,190,110,0.4)", accent: "#e6be6e", text: "#fbe8ce", sub: "#d9b488",
    dark: true, heading: CINZEL, script: S, foil: GOLD_FOIL, particles: "orient", particleColor: "#e6be6e", texture: "dark", reveal: "envelope", wax: "#701420" }),
  "kina-copper": T({ category: "kina", name: "Bakır & Bal",
    bg: "radial-gradient(1200px 600px at 50% -10%, #5a2410 0%, #3f180a 45%, #240d05 100%)",
    border: "rgba(230,170,100,0.32)", accent: "#e6a45a", text: "#fbe4cf", sub: "#d9ab86",
    dark: true, heading: MARCELLUS, script: S, particles: "gold_dust", particleColor: "#e6a45a", texture: "dark", reveal: "curtain", wax: "#7a3418" }),
  "kina-plum": T({ category: "kina", name: "Mürdüm & Altın", premium: true,
    bg: "radial-gradient(1200px 700px at 50% -10%, #3a1030 0%, #280a22 45%, #150512 100%)",
    border: "rgba(230,190,110,0.36)", accent: "#e6be6e", text: "#f7e6f0", sub: "#d3b4c8",
    dark: true, heading: CINZEL, script: S, foil: GOLD_FOIL, particles: "orient", particleColor: "#e6be6e", texture: "dark", reveal: "envelope", wax: "#5a1a4a" }),
  "kina-ruby": T({ category: "kina", name: "Yakut Gecesi",
    bg: "radial-gradient(1200px 600px at 50% -10%, #6d1020 0%, #4a0a16 45%, #2a050c 100%)",
    border: "rgba(240,200,120,0.32)", accent: "#f0c878", text: "#fbe4d8", sub: "#e0aa98",
    dark: true, heading: PLAYFAIR, script: S, particles: "sparkle", particleColor: "#f0c878", texture: "dark", reveal: "curtain", wax: "#8a1424" }),
  "kina-terra": T({ category: "kina", name: "Toprak & Kına",
    bg: "radial-gradient(1200px 600px at 50% -10%, #63241a 0%, #451812 45%, #280d09 100%)",
    border: "rgba(230,170,100,0.3)", accent: "#e6a862", text: "#fbe3d2", sub: "#d9aa8a",
    dark: true, heading: MARCELLUS, script: S, particles: "orient", particleColor: "#e6a862", texture: "dark", reveal: "curtain", wax: "#7a3220" }),

  // ═══════════ 📜 NİKAH (5) ═══════════
  "nik-sade": T({ category: "nikah", name: "Sade Prestij",
    bg: "radial-gradient(1200px 600px at 50% -10%, #f6f4ef 0%, #fbfaf6 45%, #ebe7dd 100%)",
    border: "rgba(150,140,120,0.26)", accent: "#8a7a5a", text: "#3a3428", sub: "#847a64",
    heading: MARCELLUS, script: S, particles: "gold_dust", particleColor: "#b8a578", texture: "linen", reveal: "card" }),
  "nik-kaligrafi": T({ category: "nikah", name: "Kaligrafi Odaklı",
    bg: "radial-gradient(1200px 600px at 50% -10%, #f4f0e8 0%, #faf7f0 45%, #e8e0d0 100%)",
    border: "rgba(140,120,90,0.28)", accent: "#8a6a3a", text: "#382c1c", sub: "#7a6b50",
    heading: PLAYFAIR, script: TANGERINE, particles: "gold_dust", particleColor: "#c8a24a", texture: "cotton", reveal: "envelope", wax: "#6d4d24" }),
  "nik-resmi": T({ category: "nikah", name: "Resmi Elegant", premium: true,
    bg: "radial-gradient(1200px 700px at 50% -10%, #14161c 0%, #0d0f14 45%, #06070a 100%)",
    border: "rgba(200,162,74,0.34)", accent: "#c8a24a", text: "#f2ecdc", sub: "#c1b593",
    dark: true, heading: CINZEL, script: S, foil: GOLD_FOIL, particles: "gold_dust", particleColor: "#c8a24a", texture: "dark", reveal: "envelope", wax: "#3a2c0a" }),
  "nik-ivory": T({ category: "nikah", name: "Fildişi Klasik",
    bg: "radial-gradient(1200px 600px at 50% -10%, #f7f2e8 0%, #fdf9f1 45%, #ece2ce 100%)",
    border: "rgba(160,140,100,0.26)", accent: "#a2864e", text: "#3e3524", sub: "#897a58",
    heading: CORM, script: S, particles: "bokeh", particleColor: "#d8c48a", texture: "linen", reveal: "card" }),
  "nik-sage": T({ category: "nikah", name: "Adaçayı Yeşili",
    bg: "radial-gradient(1200px 600px at 50% -10%, #eef2ea 0%, #f6f8f3 45%, #e0e7d8 100%)",
    border: "rgba(110,130,100,0.26)", accent: "#6f855f", text: "#2f3a28", sub: "#6a7a60",
    heading: MARCELLUS, script: S, particles: "leaves", particleColor: "#8aa27a", texture: "cotton", reveal: "card" }),

  // ═══════════ 👰 BRIDE TO BE (5) ═══════════
  "bride-fun": T({ category: "bride", name: "Eğlenceli Pembe",
    bg: "radial-gradient(1200px 600px at 50% -10%, #ffe3ef 0%, #fff2f7 45%, #ffd0e2 100%)",
    border: "rgba(230,90,150,0.3)", accent: "#e0518c", text: "#4a1f36", sub: "#a65b81",
    heading: JOSEF, script: PARIS, particles: "confetti", particleColor: "#ff7fb0", texture: "cotton", reveal: "curtain" }),
  "bride-glam": T({ category: "bride", name: "Işıltılı Glam", premium: true,
    bg: "radial-gradient(1200px 700px at 50% -10%, #2a0f22 0%, #1c0a17 45%, #0f050c 100%)",
    border: "rgba(240,150,190,0.34)", accent: "#f090b8", text: "#fce6f1", sub: "#e0aac6",
    dark: true, heading: MARCELLUS, script: S, foil: ROSE_FOIL, particles: "sparkle", particleColor: "#f7b6d3", texture: "dark", reveal: "curtain", wax: "#7a2a5a" }),
  "bride-silver": T({ category: "bride", name: "Modern Gümüş", premium: true,
    bg: "radial-gradient(1200px 700px at 50% -10%, #1c2026 0%, #12151a 45%, #08090c 100%)",
    border: "rgba(200,214,230,0.34)", accent: "#cdd8e6", text: "#eef2f8", sub: "#b4c0ce",
    dark: true, heading: JOSEF, script: S, foil: SILVER_FOIL, particles: "confetti", particleColor: "#dfe7f2", texture: "dark", reveal: "curtain", wax: "#3a424e" }),
  "bride-rose": T({ category: "bride", name: "Roz Balonlar",
    bg: "radial-gradient(1200px 600px at 50% -10%, #ffe6ee 0%, #fff4f8 45%, #ffd4e2 100%)",
    border: "rgba(220,120,160,0.28)", accent: "#d87098", text: "#4a2537", sub: "#a66983",
    heading: JOSEF, script: PARIS, particles: "hearts", particleColor: "#f2a0c0", texture: "cotton", reveal: "curtain" }),
  "bride-champagne": T({ category: "bride", name: "Şampanya Partisi", premium: true,
    bg: "radial-gradient(1200px 700px at 50% -10%, #211a12 0%, #16110b 45%, #0a0705 100%)",
    border: "rgba(230,200,140,0.34)", accent: "#e6c88a", text: "#f7ecd8", sub: "#d3bf95",
    dark: true, heading: MARCELLUS, script: S, foil: GOLD_FOIL, particles: "confetti", particleColor: "#f0d59a", texture: "dark", reveal: "curtain", wax: "#5a4620" }),

  // ═══════════ 🎈 SÜNNET (5) ═══════════
  "sun-blue-gold": T({ category: "sunnet", name: "Mavi & Altın", premium: true,
    bg: "radial-gradient(1200px 700px at 50% -10%, #0f2444 0%, #0a1930 45%, #050e1c 100%)",
    border: "rgba(230,200,120,0.36)", accent: "#e6c878", text: "#eaf2ff", sub: "#a9c0e0",
    dark: true, heading: CINZEL, script: S, foil: GOLD_FOIL, particles: "confetti", particleColor: "#e6c878", texture: "dark", reveal: "curtain", wax: "#123a6d" }),
  "sun-joy": T({ category: "sunnet", name: "Neşeli Konsept",
    bg: "radial-gradient(1200px 600px at 50% -10%, #e3f0ff 0%, #f2f8ff 45%, #d2e6ff 100%)",
    border: "rgba(60,120,210,0.28)", accent: "#2f74d6", text: "#243a5a", sub: "#5c7aa6",
    heading: JOSEF, script: S, particles: "confetti", particleColor: "#4f9bf0", texture: "cotton", reveal: "curtain" }),
  "sun-prince": T({ category: "sunnet", name: "Küçük Prens", premium: true,
    bg: "radial-gradient(1200px 700px at 50% -10%, #12294a 0%, #0c1c34 45%, #06101f 100%)",
    border: "rgba(230,205,130,0.36)", accent: "#e6cd82", text: "#eef4ff", sub: "#adc2e2",
    dark: true, heading: MARCELLUS, script: S, foil: GOLD_FOIL, particles: "sparkle", particleColor: "#e6cd82", texture: "dark", reveal: "envelope", wax: "#173d70" }),
  "sun-star": T({ category: "sunnet", name: "Ay & Yıldız",
    bg: "radial-gradient(1200px 600px at 50% -10%, #16345f 0%, #0f2544 45%, #081729 100%)",
    border: "rgba(230,205,130,0.3)", accent: "#e6cd82", text: "#eaf2ff", sub: "#a9c0e0",
    dark: true, heading: CINZEL, script: S, particles: "sparkle", particleColor: "#e6cd82", texture: "dark", reveal: "curtain", wax: "#1a3d6d" }),
  "sun-turquoise": T({ category: "sunnet", name: "Turkuaz Şölen",
    bg: "radial-gradient(1200px 600px at 50% -10%, #0c3a3e 0%, #082a2d 45%, #041a1c 100%)",
    border: "rgba(120,220,210,0.3)", accent: "#5ed6c8", text: "#e6fbf8", sub: "#a2d6cf",
    dark: true, heading: JOSEF, script: S, particles: "confetti", particleColor: "#5ed6c8", texture: "dark", reveal: "curtain", wax: "#0e4a4a" }),

  // ═══════════ 🏢 KURUMSAL (5) ═══════════
  "corp-glass": T({ category: "kurumsal", name: "Glassmorphism", premium: true,
    bg: "radial-gradient(1200px 700px at 50% -10%, #10131a 0%, #0a0d12 45%, #05070a 100%)",
    border: "rgba(120,180,255,0.3)", accent: "#7cb4ff", text: "#eaf1ff", sub: "#a7bcdf",
    dark: true, heading: JOSEF, script: JOSEF, foil: SILVER_FOIL, particles: "bokeh", particleColor: "#7cb4ff", texture: "dark", reveal: "card", wax: "#1a2740" }),
  "corp-black-gold": T({ category: "kurumsal", name: "Metalik Siyah & Altın", premium: true,
    bg: "radial-gradient(1200px 700px at 50% -10%, #16130c 0%, #0d0b07 45%, #050403 100%)",
    border: "rgba(200,162,74,0.34)", accent: "#c8a24a", text: "#f2ecdc", sub: "#c1b593",
    dark: true, heading: CINZEL, script: JOSEF, foil: GOLD_FOIL, particles: "gold_dust", particleColor: "#c8a24a", texture: "dark", reveal: "card", wax: "#3a2c0a" }),
  "corp-minimal": T({ category: "kurumsal", name: "Minimal Prestij",
    bg: "radial-gradient(1200px 600px at 50% -10%, #f4f4f2 0%, #fbfbfa 45%, #e7e7e4 100%)",
    border: "rgba(30,30,30,0.16)", accent: "#1f1f1f", text: "#161616", sub: "#5c5c5c",
    heading: JOSEF, script: JOSEF, particles: "bokeh", particleColor: "#c9c9c9", texture: "matte", reveal: "card" }),
  "corp-tech": T({ category: "kurumsal", name: "Teknoloji Lansman", premium: true,
    bg: "radial-gradient(1200px 700px at 50% -10%, #0a1a24 0%, #061219 45%, #030a0e 100%)",
    border: "rgba(90,220,220,0.3)", accent: "#5ee0e0", text: "#e6fbfb", sub: "#a2d6d6",
    dark: true, heading: JOSEF, script: JOSEF, foil: ["#2f9a9a", "#d4ffff", "#5ee0e0"], particles: "sparkle", particleColor: "#5ee0e0", texture: "dark", reveal: "card", wax: "#0e3a3a" }),
  "corp-navy": T({ category: "kurumsal", name: "Kurumsal Lacivert",
    bg: "radial-gradient(1200px 600px at 50% -10%, #14203a 0%, #0e1729 45%, #070d18 100%)",
    border: "rgba(150,180,230,0.28)", accent: "#9ab4e6", text: "#eaf0fb", sub: "#aabbd8",
    dark: true, heading: MARCELLUS, script: JOSEF, particles: "bokeh", particleColor: "#9ab4e6", texture: "dark", reveal: "card", wax: "#1a2a4a" }),
};

export const getTemplate = (id) => INVITATION_TEMPLATES[id] || null;

export const templatesByCategory = (catKey) =>
  Object.entries(INVITATION_TEMPLATES)
    .filter(([, t]) => t.category === catKey)
    .map(([id, t]) => ({ id, ...t }));

// Single source of truth for the visual object used by preview / view / reveal.
// Prefers a rich template; falls back to the legacy 8-theme system.
export const resolveVisual = (data) => {
  const tpl = data && data.template ? INVITATION_TEMPLATES[data.template] : null;
  if (tpl) {
    const v = { ...tpl };
    if (data.primary_color) v.accent = data.primary_color;
    if (data.font_family) { const fam = `'${data.font_family}', serif`; v.script = fam; v.heading = fam; }
    return v;
  }
  // Legacy fallback: map old themes → engine defaults so they still get particles.
  const t = getTheme(data && data.theme, data && data.primary_color);
  const motifParticle = {
    rose_petals: "rose_petals", drifting_leaves: "leaves", gold_dust: "gold_dust",
    soft_clouds: "bokeh", gold_shimmer_particles: "sparkle", stardust_bokeh: "bokeh",
    water_caustics: "bokeh", marble_veins: "gold_dust",
  };
  return {
    ...t,
    foil: t.premium ? GOLD_FOIL : null,
    particles: motifParticle[t.motif] || (t.dark ? "sparkle" : "gold_dust"),
    particleColor: t.accent,
    texture: t.dark ? "dark" : "cotton",
    reveal: data && data.reveal_style === "minimal" ? "card" : "envelope",
    wax: t.accent,
  };
};
