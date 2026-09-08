import React from "react";
import { motion } from "framer-motion";

// Per-template SVG decorative identity. Line-draw (pathLength) reveals give a
// hand-drawn feel. `oriental` is the animated mandala/paisley motif used for Kına.
// pointer-events-none, sits above the particle canvas, below the content.
const draw = (delay = 0, dur = 1.6) => ({
  initial: { pathLength: 0, opacity: 0 },
  animate: { pathLength: 1, opacity: 1 },
  transition: { pathLength: { delay, duration: dur, ease: "easeInOut" }, opacity: { delay, duration: 0.4 } },
});

// A corner ornament placed & rotated at each of the 4 corners.
const Corner = ({ accent, children, sw = 1.4 }) => (
  <>
    {[
      { t: "translate(6,6)" },
      { t: "translate(94,6) scale(-1,1)" },
      { t: "translate(6,134) scale(1,-1)" },
      { t: "translate(94,134) scale(-1,-1)" },
    ].map((c, i) => (
      <g key={i} transform={c.t} stroke={accent} strokeWidth={sw} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke">
        {children}
      </g>
    ))}
  </>
);

export default function TemplateDecor({ decor = "minimal_frame", accent = "#c8a24a", animate = true, opacity = 0.5, className = "" }) {
  const P = animate ? motion.path : "path";
  const dp = (d, delay, dur) => (animate ? { d, ...draw(delay, dur) } : { d });
  return (
    <svg className={`pointer-events-none absolute inset-0 w-full h-full ${className}`} viewBox="0 0 100 140" preserveAspectRatio="none" style={{ opacity }} aria-hidden>
      {decor === "minimal_frame" && (
        <P {...dp("M6 6 H94 V134 H6 Z", 0.2, 1.8)} stroke={accent} strokeWidth="0.6" fill="none" vectorEffect="non-scaling-stroke" />
      )}

      {decor === "art_deco" && (
        <Corner accent={accent} sw={1.2}>
          <path d="M0 22 L0 0 L22 0" />
          <path d="M4 16 L4 4 L16 4" />
          <path d="M2 26 L2 26" />
          <circle cx="8" cy="8" r="1.6" />
        </Corner>
      )}

      {decor === "geo_corners" && (
        <Corner accent={accent} sw={1.4}>
          <path d="M0 18 L0 0 L18 0" />
          <path d="M0 9 L9 0" />
        </Corner>
      )}

      {decor === "floral_corner" && (
        <Corner accent={accent} sw={1}>
          <path d="M0 26 C10 24 18 16 22 4" />
          <path d="M6 20 C6 20 12 18 12 12" />
          <path d="M12 12 C16 12 18 8 18 8" />
          <circle cx="22" cy="4" r="1.4" fill={accent} stroke="none" />
          <circle cx="6" cy="20" r="1.1" fill={accent} stroke="none" />
        </Corner>
      )}

      {decor === "confetti_frame" && (
        <Corner accent={accent} sw={1}>
          <circle cx="6" cy="6" r="1.4" fill={accent} stroke="none" />
          <circle cx="14" cy="7" r="1" fill={accent} stroke="none" />
          <circle cx="7" cy="15" r="1" fill={accent} stroke="none" />
          <path d="M18 5 l3 -1" />
          <path d="M5 19 l-1 3" />
        </Corner>
      )}

      {decor === "star_frame" && (
        <Corner accent={accent} sw={1.1}>
          <path d="M8 3 L9 7 L13 7.5 L9.8 10 L11 14 L8 11.6 L5 14 L6.2 10 L3 7.5 L7 7 Z" />
          <circle cx="16" cy="16" r="0.9" fill={accent} stroke="none" />
        </Corner>
      )}

      {decor === "oriental" && <Oriental accent={accent} animate={animate} />}
    </svg>
  );
}

// Animated oriental medallion (mandala/paisley) — draws itself in for Kına.
function Oriental({ accent, animate }) {
  const P = animate ? motion.path : "path";
  const dp = (d, delay, dur = 2) => (animate ? { d, ...draw(delay, dur) } : { d });
  const petals = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <g transform="translate(50,70)" stroke={accent} fill="none" strokeWidth="0.7" strokeLinecap="round" vectorEffect="non-scaling-stroke">
      <motion.g animate={animate ? { rotate: 360 } : undefined} transition={animate ? { duration: 90, repeat: Infinity, ease: "linear" } : undefined}>
        {petals.map((a, i) => (
          <P key={i} {...dp("M0 -8 C6 -18 6 -30 0 -40 C-6 -30 -6 -18 0 -8 Z", 0.3 + i * 0.08, 1.4)} transform={`rotate(${a})`} />
        ))}
        {petals.map((a, i) => (
          <P key={"i" + i} {...dp("M0 -6 C3 -12 3 -20 0 -26 C-3 -20 -3 -12 0 -6 Z", 0.6 + i * 0.06, 1.2)} transform={`rotate(${a + 22.5})`} />
        ))}
      </motion.g>
      <P {...dp("M-14 0 A14 14 0 1 0 14 0 A14 14 0 1 0 -14 0", 0.2, 1.6)} />
      <P {...dp("M-6 0 A6 6 0 1 0 6 0 A6 6 0 1 0 -6 0", 0.9, 1.2)} />
      <circle cx="0" cy="0" r="1.6" fill={accent} stroke="none" />
    </g>
  );
}
