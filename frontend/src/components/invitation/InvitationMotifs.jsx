import React, { useMemo } from "react";
import { motion } from "framer-motion";

// Deterministic-ish particle generator (client-only render)
const build = (n, cfg) =>
  Array.from({ length: n }, () => ({
    left: Math.random() * 100,
    top: Math.random() * 100,
    size: cfg.min + Math.random() * (cfg.max - cfg.min),
    delay: Math.random() * cfg.dur,
    dur: cfg.dur * (0.65 + Math.random() * 0.7),
    drift: (Math.random() - 0.5) * (cfg.drift || 0),
    rot: Math.random() * 360,
    o: 0.35 + Math.random() * 0.5,
  }));

const PetalSVG = ({ color }) => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" style={{ display: "block" }}>
    <path d="M12 1.5C6.5 6 3.5 11.5 12 22.5C20.5 11.5 17.5 6 12 1.5Z" fill={color} />
    <path d="M12 3C12 9 12 16 12 21.5" stroke="rgba(255,255,255,0.35)" strokeWidth="0.5" fill="none" />
  </svg>
);

const LeafSVG = ({ color }) => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" style={{ display: "block" }}>
    <path d="M2.5 21.5C2 12.5 8.5 3.5 21.5 2.5C21 15.5 13.5 22 2.5 21.5Z" fill={color} />
    <path d="M4 20C9.5 14 15 8.5 20.5 3.5" stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" fill="none" />
  </svg>
);

// Falling elements (petals / leaves) that drift and sway from top to bottom
const Falling = ({ Shape, color, count = 14, size = { min: 9, max: 20 } }) => {
  const items = useMemo(() => build(count, { ...size, dur: 13, drift: 90 }), [count, size.min, size.max]);
  return items.map((p, i) => (
    <motion.div
      key={i}
      className="absolute"
      style={{ left: `${p.left}%`, top: 0, width: p.size, height: p.size, willChange: "transform" }}
      initial={{ y: "-12vh", opacity: 0, rotate: p.rot }}
      animate={{
        y: "112vh",
        x: [0, p.drift, -p.drift * 0.6, 0],
        rotate: p.rot + 320,
        opacity: [0, p.o, p.o, 0],
      }}
      transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: "linear" }}
    >
      <Shape color={color} />
    </motion.div>
  ));
};

// Glowing dust rising upward (gold / shimmer)
const Rising = ({ color, count = 20, glow = false }) => {
  const items = useMemo(() => build(count, { min: 2, max: 6, dur: 11, drift: 40 }), [count]);
  return items.map((p, i) => (
    <motion.div
      key={i}
      className="absolute rounded-full"
      style={{
        left: `${p.left}%`,
        bottom: 0,
        width: p.size,
        height: p.size,
        background: color,
        filter: glow ? `blur(0.5px) drop-shadow(0 0 ${p.size * 1.6}px ${color})` : "blur(0.4px)",
        willChange: "transform",
      }}
      initial={{ y: 0, opacity: 0 }}
      animate={{ y: "-108vh", x: [0, p.drift, -p.drift, 0], opacity: [0, p.o, p.o, 0] }}
      transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: "easeInOut" }}
    />
  ));
};

// Soft translating cloud/blur ellipses
const Clouds = ({ color }) => {
  const items = useMemo(() => build(5, { min: 180, max: 340, dur: 26, drift: 0 }), []);
  return items.map((p, i) => (
    <motion.div
      key={i}
      className="absolute rounded-full"
      style={{
        left: `${p.left}%`,
        top: `${10 + (i * 16)}%`,
        width: p.size,
        height: p.size * 0.55,
        background: color,
        opacity: 0.12,
        filter: "blur(40px)",
        willChange: "transform",
      }}
      animate={{ x: ["-8%", "12%", "-8%"] }}
      transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: "easeInOut" }}
    />
  ));
};

// Bokeh circles fading in and out (stardust)
const Bokeh = ({ color }) => {
  const items = useMemo(() => build(16, { min: 6, max: 26, dur: 6, drift: 0 }), []);
  return items.map((p, i) => (
    <motion.div
      key={i}
      className="absolute rounded-full"
      style={{
        left: `${p.left}%`,
        top: `${p.top}%`,
        width: p.size,
        height: p.size,
        background: color,
        filter: `blur(${p.size / 3}px)`,
        willChange: "opacity, transform",
      }}
      animate={{ opacity: [0, p.o * 0.7, 0], scale: [0.6, 1, 0.6] }}
      transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: "easeInOut" }}
    />
  ));
};

// Water caustics — swaying radial glows
const Caustics = ({ color }) => {
  const items = useMemo(() => build(6, { min: 200, max: 380, dur: 9, drift: 0 }), []);
  return items.map((p, i) => (
    <motion.div
      key={i}
      className="absolute rounded-full"
      style={{
        left: `${p.left}%`,
        top: `${p.top}%`,
        width: p.size,
        height: p.size,
        background: `radial-gradient(circle, ${color} 0%, transparent 65%)`,
        opacity: 0.14,
        filter: "blur(24px)",
        willChange: "transform",
      }}
      animate={{ x: ["-6%", "8%", "-6%"], scale: [1, 1.15, 1], opacity: [0.08, 0.2, 0.08] }}
      transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: "easeInOut" }}
    />
  ));
};

// Living marble veins — animated soft gradient sweep
const Marble = ({ color }) => (
  <>
    <motion.div
      className="absolute inset-0"
      style={{
        background: `conic-gradient(from 180deg at 50% 50%, transparent 0deg, ${color}22 90deg, transparent 180deg, ${color}18 270deg, transparent 360deg)`,
        filter: "blur(48px)",
        willChange: "transform",
      }}
      animate={{ rotate: [0, 360] }}
      transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
    />
    <motion.div
      className="absolute inset-0 opacity-40"
      style={{
        background: `repeating-linear-gradient(115deg, transparent 0 40px, ${color}10 40px 42px)`,
        willChange: "transform",
      }}
      animate={{ x: ["-2%", "2%", "-2%"] }}
      transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
    />
  </>
);

// Master motif switcher. Renders an absolute, pointer-events-none decorative layer.
export default function InvitationMotifs({ t }) {
  const accent = t.accent;
  let layer = null;
  switch (t.motif) {
    case "rose_petals":
      layer = <Falling Shape={PetalSVG} color={accent} count={16} />;
      break;
    case "drifting_leaves":
      layer = <Falling Shape={LeafSVG} color={accent} count={14} size={{ min: 12, max: 24 }} />;
      break;
    case "gold_dust":
      layer = <Rising color={accent} count={22} glow />;
      break;
    case "soft_clouds":
      layer = <Clouds color={accent} />;
      break;
    case "gold_shimmer_particles":
      layer = (
        <>
          <Rising color={accent} count={26} glow />
          <Bokeh color={accent} />
        </>
      );
      break;
    case "stardust_bokeh":
      layer = <Bokeh color={accent} />;
      break;
    case "water_caustics":
      layer = <Caustics color={accent} />;
      break;
    case "marble_veins":
      layer = <Marble color={accent} />;
      break;
    default:
      layer = null;
  }
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden data-testid="invitation-motif">
      {layer}
    </div>
  );
}
