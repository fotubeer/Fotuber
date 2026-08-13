import React from "react";
import FoilText from "@/components/invitation/FoilText";
import TemplateDecor from "@/components/invitation/TemplateDecor";
import { decorFor } from "@/lib/invitationTemplates";
import { ImageIcon } from "lucide-react";

// Lightweight, CANVAS-FREE mini rendering of a template — a real preview thumbnail
// for the catalog (50+ cards ⇒ no per-card particle engine, keeps it fast).
export default function TemplateThumb({ tpl, names = "Elif & Kaan", label = "Davetiye", height = 132 }) {
  if (!tpl) return null;
  const foil = tpl.foil;
  return (
    <div className="relative w-full overflow-hidden" style={{ height, background: tpl.bg }}>
      <TemplateDecor decor={decorFor(tpl)} accent={tpl.accent} animate={false} opacity={0.55} />
      {tpl.photo && (
        <div className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full grid place-items-center"
          style={{ background: `${tpl.accent}22`, border: `1px solid ${tpl.accent}66`, color: tpl.accent }}>
          <ImageIcon className="w-3.5 h-3.5" />
        </div>
      )}
      <div className="relative z-[5] h-full flex flex-col items-center justify-center text-center px-3">
        <div className="text-[7px] tracking-[0.4em] uppercase mb-1" style={{ color: tpl.sub, fontFamily: "'Montserrat', sans-serif" }}>{label}</div>
        {foil ? (
          <FoilText as="div" colors={foil} animate={false} style={{ fontFamily: tpl.script, fontSize: "1.35rem", lineHeight: 1.1 }}>{names}</FoilText>
        ) : (
          <div style={{ fontFamily: tpl.script, fontSize: "1.35rem", lineHeight: 1.1, color: tpl.accent }}>{names}</div>
        )}
        <div className="my-1.5 h-px w-10" style={{ background: tpl.accent, opacity: 0.6 }} />
        <div className="text-[7px] tracking-[0.3em] uppercase" style={{ color: tpl.sub, fontFamily: "'Montserrat', sans-serif" }}>31 ARALIK 2026</div>
      </div>
    </div>
  );
}
