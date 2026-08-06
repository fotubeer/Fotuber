import React from "react";

// Per-style small customizations for the invitation opening (reveal_opts).
const WAX = [
  { k: "bordo", label: "Bordo", c: "#7d1f1f" },
  { k: "lacivert", label: "Lacivert", c: "#1e2a52" },
  { k: "zumrut", label: "Zümrüt", c: "#1c4a3a" },
  { k: "antrasit", label: "Antrasit", c: "#2a2e34" },
];
const GOLDS = ["#c8a24a", "#e6c260", "#d9a441", "#b8863b", "#cfa6a0"];
const PALETTES = [
  { k: "blush", label: "Pudra", cs: ["#f4c6d5", "#e79bb4"] },
  { k: "lavanta", label: "Lavanta", cs: ["#d9c7ef", "#b89be0"] },
  { k: "seftali", label: "Şeftali", cs: ["#f7c9a3", "#f0a877"] },
  { k: "beyaz", label: "Beyaz", cs: ["#ffffff", "#eef3e6"] },
  { k: "gunbatimi", label: "Gün Batımı", cs: ["#f6a97c", "#e8748a"] },
];
const TONES = [
  { k: "gold", label: "Altın", c: "#e6c260" },
  { k: "gul", label: "Gül", c: "#e6a9bf" },
  { k: "gumus", label: "Gümüş", c: "#d7dee8" },
];
const ACCENTS = ["#e5e5e5", "#d4af37", "#e6a9bf", "#8fb3a0", "#c98aa0"];

const Swatch = ({ active, color, onClick, title, testid }) => (
  <button type="button" onClick={onClick} title={title} data-testid={testid}
    className={`w-8 h-8 rounded-full border-2 transition ${active ? "border-indigo-500 ring-2 ring-indigo-200 scale-110" : "border-white shadow"}`}
    style={{ background: color }} />
);

const Chip = ({ active, label, onClick, testid, swatch }) => (
  <button type="button" onClick={onClick} data-testid={testid}
    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${active ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
    {swatch && <span className="w-3.5 h-3.5 rounded-full" style={{ background: `linear-gradient(135deg, ${swatch[0]}, ${swatch[1] || swatch[0]})` }} />}
    {label}
  </button>
);

export default function RevealOptions({ styleKey, opts, setOpt }) {
  return (
    <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-3" data-testid="reveal-options">
      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Bu açılışı kişiselleştir</div>

      {styleKey === "envelope" && (<>
        <div>
          <label className="text-xs text-slate-600 block mb-1">Mühür baş harfleri</label>
          <input value={opts.seal || ""} onChange={(e) => setOpt("seal", e.target.value.slice(0, 3))} maxLength={3}
            placeholder="örn. A&M" data-testid="opt-seal"
            className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-400" />
        </div>
        <div>
          <label className="text-xs text-slate-600 block mb-1.5">Mum mührü rengi</label>
          <div className="flex flex-wrap gap-2">
            {WAX.map((w) => <Swatch key={w.k} color={w.c} active={(opts.wax || "bordo") === w.k} onClick={() => setOpt("wax", w.k)} title={w.label} testid={`opt-wax-${w.k}`} />)}
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-600 block mb-1.5">Altın vurgu</label>
          <div className="flex flex-wrap gap-2">
            {GOLDS.map((c) => <Swatch key={c} color={c} active={(opts.gold || "#c8a24a") === c} onClick={() => setOpt("gold", c)} testid={`opt-gold-${c.replace("#", "")}`} />)}
          </div>
        </div>
      </>)}

      {styleKey === "garden" && (
        <div>
          <label className="text-xs text-slate-600 block mb-1.5">Çiçek paleti</label>
          <div className="flex flex-wrap gap-2">
            {PALETTES.map((p) => <Chip key={p.k} label={p.label} swatch={p.cs} active={(opts.palette || "blush") === p.k} onClick={() => setOpt("palette", p.k)} testid={`opt-palette-${p.k}`} />)}
          </div>
        </div>
      )}

      {styleKey === "ballroom" && (
        <div>
          <label className="text-xs text-slate-600 block mb-1.5">Işık & altın tonu</label>
          <div className="flex flex-wrap gap-2">
            {TONES.map((t) => <Chip key={t.k} label={t.label} swatch={[t.c]} active={(opts.tone || "gold") === t.k} onClick={() => setOpt("tone", t.k)} testid={`opt-tone-${t.k}`} />)}
          </div>
        </div>
      )}

      {styleKey === "minimal" && (<>
        <div>
          <label className="text-xs text-slate-600 block mb-1.5">Arka plan</label>
          <div className="flex gap-2">
            <Chip label="Koyu" active={(opts.bg || "dark") === "dark"} onClick={() => setOpt("bg", "dark")} testid="opt-bg-dark" />
            <Chip label="Açık" active={opts.bg === "light"} onClick={() => setOpt("bg", "light")} testid="opt-bg-light" />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-600 block mb-1.5">Vurgu rengi</label>
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((c) => <Swatch key={c} color={c} active={(opts.accent || "#e5e5e5") === c} onClick={() => setOpt("accent", c)} testid={`opt-accent-${c.replace("#", "")}`} />)}
          </div>
        </div>
      </>)}
    </div>
  );
}
