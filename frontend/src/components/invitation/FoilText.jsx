import React from "react";
import { motion } from "framer-motion";

// Realistic metallic FOIL text — an animated light sweep across a 3-stop gradient,
// clipped to the glyphs (background-clip: text). Optionally reacts to 3D tilt so
// the highlight shifts as the phone/mouse moves. Falls back to solid `fallback`.
export default function FoilText({
  as = "span",
  children,
  colors,
  fallback = "#c8a24a",
  tiltRy = 0,
  className = "",
  style = {},
  animate = true,
}) {
  const Tag = motion[as] || motion.span;
  if (!colors || colors.length < 2) {
    const Plain = as;
    return <Plain className={className} style={{ color: fallback, ...style }}>{children}</Plain>;
  }
  const [a, b, c = a] = colors;
  const base = {
    backgroundImage: `linear-gradient(100deg, ${a} 0%, ${a} 20%, ${b} 45%, ${b} 55%, ${c} 80%, ${c} 100%)`,
    backgroundSize: "260% auto",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent",
    backgroundPositionX: `${50 - tiltRy * 3}%`,
    filter: `drop-shadow(0 1px 0 rgba(0,0,0,0.25)) drop-shadow(0 0 14px ${b}44)`,
    ...style,
  };
  return (
    <Tag
      className={className}
      style={base}
      animate={animate ? { backgroundPositionX: ["0%", "260%"] } : undefined}
      transition={animate ? { duration: 7, repeat: Infinity, ease: "linear" } : undefined}
    >
      {children}
    </Tag>
  );
}
