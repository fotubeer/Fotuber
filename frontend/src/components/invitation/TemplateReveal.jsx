import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX, ChevronsRight, Sparkles } from "lucide-react";
import FoilText from "@/components/invitation/FoilText";
import ParticleCanvas from "@/components/invitation/ParticleCanvas";
import useParallaxTilt from "@/hooks/useParallaxTilt";
import { createRevealSound } from "@/components/invitation/revealSound";

const EASE = [0.22, 1, 0.36, 1];

const SOUND_KEY = { envelope: "envelope", card: "ballroom", curtain: "minimal" };
const DUR = { envelope: 3400, card: 2600, curtain: 3000 };

// Subtle paper/linen/marble texture as layered CSS gradients (no image assets).
const textureBg = (kind, dark) => {
  if (kind === "linen")
    return "repeating-linear-gradient(90deg, rgba(0,0,0,0.035) 0 1px, transparent 1px 3px), repeating-linear-gradient(0deg, rgba(0,0,0,0.03) 0 1px, transparent 1px 3px), radial-gradient(120% 120% at 30% 20%, #fbf6ec, #efe4d0 60%, #e4d5ba)";
  if (kind === "marble")
    return "radial-gradient(60% 40% at 20% 15%, rgba(183,110,121,0.10), transparent 60%), radial-gradient(50% 50% at 80% 70%, rgba(150,130,110,0.10), transparent 60%), linear-gradient(135deg, #fdf7f3, #f3e7e1)";
  if (kind === "dark")
    return "radial-gradient(120% 120% at 30% 15%, rgba(255,255,255,0.05), rgba(255,255,255,0.01) 55%, transparent), linear-gradient(#141414, #0c0c0c)";
  if (kind === "matte")
    return "linear-gradient(#fbfbfa, #f1f1ef)";
  // cotton (default): soft grain
  return "radial-gradient(120% 120% at 30% 20%, #fdfaf4, #f4ecdf 60%, #ece0cd)";
};

export default function TemplateReveal({ t, names = "", initials = "♥", eventLabel = "Davetiye", welcomeText = "", onDone }) {
  const reveal = t?.reveal || "envelope";
  const [phase, setPhase] = useState("idle"); // idle | open
  const [gone, setGone] = useState(false);
  const [muted, setMuted] = useState(false);
  const sound = useRef(null);
  const timer = useRef(null);
  const { tilt, requestGyro, needsPermission, gyroActive } = useParallaxTilt({ max: 9 });

  useEffect(() => {
    sound.current = createRevealSound(SOUND_KEY[reveal] || "envelope");
    return () => { sound.current?.stop(); clearTimeout(timer.current); };
  }, [reveal]);

  const finish = () => {
    clearTimeout(timer.current);
    onDone?.();
    setTimeout(() => setGone(true), 620);
  };
  const openIt = () => {
    if (phase !== "idle") return;
    if (needsPermission && !gyroActive) requestGyro();
    setPhase("open");
    sound.current?.start();
    timer.current = setTimeout(finish, DUR[reveal] || 3200);
  };
  const toggleMute = (e) => { e?.stopPropagation(); const m = !muted; setMuted(m); sound.current?.setMuted(m); };

  const open = phase === "open";
  const accent = t?.accent || "#c8a24a";
  const foil = t?.foil;
  const dark = !!t?.dark;
  const welcome = welcomeText || t?.welcomeDefault || "Sizleri aramızda görmekten mutluluk duyarız";
  const tiltStyle = { transform: `perspective(1200px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`, transformStyle: "preserve-3d" };

  const Scene =
    reveal === "card" ? <CardScene {...{ t, open, names, initials, welcome, eventLabel, tiltStyle }} />
    : reveal === "curtain" ? <CurtainScene {...{ t, open, names, initials, welcome, eventLabel, tiltStyle }} />
    : <EnvelopeScene {...{ t, open, names, initials, welcome, eventLabel, tiltStyle }} />;

  return (
    <AnimatePresence>
      {!gone && (
        <motion.div className="fixed inset-0 z-[80] overflow-hidden select-none" data-testid="invitation-reveal"
          exit={{ opacity: 0 }} transition={{ duration: 0.6 }} onClick={() => !open && openIt()}
          style={{ background: t?.bg || "#0c0c0c" }}>
          <ParticleCanvas type={t?.particles} color={t?.particleColor || accent} density={open ? 1.15 : 0.7} />

          {Scene}

          <AnimatePresence>
            {!open && (
              <motion.div className="absolute inset-x-0 bottom-0 z-[92] flex flex-col items-center pb-12 pointer-events-none"
                exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.3 }}>
                <motion.button onClick={(e) => { e.stopPropagation(); openIt(); }} data-testid="reveal-open-btn"
                  className="pointer-events-auto inline-flex items-center gap-2 rounded-full px-9 h-14 text-base font-semibold tracking-wide"
                  style={{ background: foil ? `linear-gradient(90deg, ${foil[0]}, ${foil[2] || foil[1]})` : accent, color: dark ? "#0b0b0b" : "#fff", boxShadow: `0 14px 44px -10px ${accent}` }}
                  initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.7 }}
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Sparkles className="w-4 h-4" /> Davetiyeyi Aç
                </motion.button>
                <motion.div className="mt-4 text-[11px] tracking-[0.3em] uppercase" style={{ color: dark ? "#ffffffaa" : accent }}
                  initial={{ opacity: 0 }} animate={{ opacity: 0.8 }} transition={{ delay: 1 }}>
                  {needsPermission ? "3D efekt için dokunun" : "açmak için dokunun"}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {open && (
            <div className="absolute top-4 left-4 z-[95] flex items-center gap-2">
              <button onClick={toggleMute} data-testid="reveal-mute"
                className="w-10 h-10 rounded-full bg-black/35 text-white backdrop-blur grid place-items-center hover:bg-black/55 transition">
                {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <button onClick={(e) => { e.stopPropagation(); finish(); }} data-testid="reveal-skip"
                className="h-10 px-4 rounded-full bg-black/35 text-white backdrop-blur flex items-center gap-1 text-sm hover:bg-black/55 transition">
                Atla <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Shared card content (foil names + welcome) ─────────────────────────────
const CardBody = ({ t, names, initials, welcome, eventLabel, delay = 0 }) => {
  const accent = t?.accent || "#c8a24a";
  const foil = t?.foil;
  return (
    <div className="w-full flex flex-col items-center justify-center text-center px-8">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: delay + 0.1, duration: 0.7 }}
        className="text-[11px] tracking-[0.45em] uppercase mb-5" style={{ color: t?.sub, fontFamily: "'Montserrat', sans-serif" }}>
        {eventLabel}
      </motion.div>
      <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: delay + 0.2, duration: 0.6, ease: EASE }}
        className="mx-auto mb-5 w-16 h-16 rounded-full grid place-items-center"
        style={{ border: `1.5px solid ${accent}`, color: accent, fontFamily: t?.script, fontSize: "1.7rem" }}>
        {initials}
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 18, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ delay: delay + 0.35, duration: 0.9, ease: EASE }}>
        <FoilText as="div" colors={foil} fallback={accent}
          style={{ fontFamily: t?.script, fontSize: "clamp(2.4rem,9vw,4rem)", lineHeight: 1.05, color: foil ? undefined : accent }}>
          {names}
        </FoilText>
      </motion.div>
      <motion.div className="mx-auto my-5 h-px w-24" style={{ background: accent }}
        initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: delay + 0.5, duration: 0.7 }} />
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.6, duration: 0.8 }}
        className="text-xs tracking-[0.15em] max-w-xs" style={{ color: t?.sub, fontFamily: t?.heading }}>
        {welcome}
      </motion.div>
    </div>
  );
};

// ══ 3D TEXTURED ENVELOPE ═════════════════════════════════════════════════════
function EnvelopeScene({ t, open, names, initials, welcome, eventLabel, tiltStyle }) {
  const accent = t?.accent || "#c8a24a";
  const wax = t?.wax || "#7a1414";
  const seal = (initials || "♥").slice(0, 3);
  const paper = textureBg(t?.texture || "cotton", t?.dark);
  const flap = `linear-gradient(150deg, ${accent}cc, ${accent}88)`;
  const bodyG = `linear-gradient(${accent}aa, ${accent}66)`;
  return (
    <div className="absolute inset-0 grid place-items-center px-6" style={tiltStyle}>
      {/* Letter card that rises out */}
      <motion.div className="absolute z-20 rounded-md overflow-hidden"
        style={{ width: "min(88vw, 460px)", background: paper, boxShadow: "0 40px 90px -22px rgba(0,0,0,.65)", border: `1px solid ${accent}55` }}
        initial={{ height: 150, y: 70, opacity: 0 }}
        animate={open ? { height: "min(76vh,640px)", y: 0, opacity: 1 } : { height: 150, y: 70, opacity: 0 }}
        transition={{ height: { delay: 1.15, duration: 1.25, ease: EASE }, y: { delay: 0.95, duration: 1.2, ease: EASE }, opacity: { delay: 0.95, duration: 0.5 } }}>
        <div className="h-full w-full grid place-items-center" style={{ color: t?.text }}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: open ? 1 : 0 }} transition={{ delay: 1.85, duration: 0.8 }} className="w-full">
            <CardBody t={t} names={names} initials={initials} welcome={welcome} eventLabel={eventLabel} delay={1.85} />
          </motion.div>
        </div>
      </motion.div>

      {/* Envelope */}
      <div className="relative z-30" style={{ width: "min(88vw, 460px)", height: 300, perspective: 1400 }}>
        <motion.div className="absolute inset-x-0 bottom-0"
          style={{ height: 200, background: bodyG, boxShadow: "inset 0 8px 30px rgba(0,0,0,.35)", borderRadius: "0 0 10px 10px" }}
          animate={open ? { y: 230, opacity: 0 } : { y: 0, opacity: 1 }} transition={{ delay: open ? 1.5 : 0, duration: 1, ease: EASE }}>
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, transparent 49.5%, rgba(0,0,0,.16) 50%), linear-gradient(-135deg, transparent 49.5%, rgba(0,0,0,.16) 50%)" }} />
        </motion.div>
        <motion.div className="absolute inset-x-0 top-0 origin-top z-40"
          style={{ height: 150, background: flap, clipPath: "polygon(0 0, 100% 0, 50% 100%)", transformStyle: "preserve-3d", boxShadow: "0 6px 16px rgba(0,0,0,.3)" }}
          animate={open ? { rotateX: 178 } : { rotateX: 0, x: [0, -3, 3, -2, 0] }}
          transition={open ? { delay: 0.85, duration: 0.95, ease: EASE } : { x: { delay: 0.4, duration: 0.5 } }} />
        {/* Wax seal breaks + light flare */}
        <motion.div className="absolute left-1/2 top-[116px] -translate-x-1/2 z-50 rounded-full grid place-items-center"
          style={{ width: 66, height: 66, background: `radial-gradient(circle at 35% 30%, ${wax}, ${wax}bb)`, boxShadow: "0 6px 14px rgba(0,0,0,.45)", color: "#f2d9a0", fontFamily: "'Cardo', serif", fontSize: "1.3rem", border: `2px solid ${wax}` }}
          animate={open ? { scale: [1, 1.16, 0], rotate: [0, -8, 16], opacity: [1, 1, 0] } : { scale: [1, 1.05, 1] }}
          transition={open ? { delay: 0.5, duration: 0.6, ease: "easeIn" } : { duration: 2.4, repeat: Infinity }}>
          {seal}
        </motion.div>
        <motion.div className="absolute left-1/2 top-[149px] -translate-x-1/2 z-40 rounded-full"
          style={{ width: 60, height: 60, background: "radial-gradient(circle, #fff7dd, transparent 70%)" }}
          initial={{ scale: 0, opacity: 0 }} animate={open ? { scale: [0, 8], opacity: [0.9, 0] } : { scale: 0, opacity: 0 }}
          transition={{ delay: 0.55, duration: 0.9, ease: "easeOut" }} />
      </div>
    </div>
  );
}

// ══ CARD RISE (modern / botanic / corporate) ════════════════════════════════
function CardScene({ t, open, names, initials, welcome, eventLabel, tiltStyle }) {
  const accent = t?.accent || "#c8a24a";
  const paper = textureBg(t?.texture || "cotton", t?.dark);
  return (
    <div className="absolute inset-0 grid place-items-center px-6" style={tiltStyle}>
      <motion.div className="relative rounded-[1.6rem] overflow-hidden"
        style={{ width: "min(88vw, 440px)", background: paper, border: `1px solid ${accent}44`, boxShadow: `0 40px 90px -24px rgba(0,0,0,.6)`, color: t?.text }}
        initial={{ y: 80, opacity: 0, rotateX: 18, scale: 0.92 }}
        animate={open ? { y: 0, opacity: 1, rotateX: 0, scale: 1 } : { y: 60, opacity: 0.001 }}
        transition={{ duration: 1.1, ease: EASE }}>
        <div className="absolute top-0 inset-x-0 h-1.5" style={{ background: t?.foil ? `linear-gradient(90deg, ${t.foil[0]}, ${t.foil[1]}, ${t.foil[2] || t.foil[0]})` : accent }} />
        <motion.div className="absolute left-0 right-0 top-1/2 h-px" style={{ background: accent, opacity: 0.4 }}
          initial={{ scaleX: 0 }} animate={{ scaleX: open ? 1 : 0 }} transition={{ delay: 0.4, duration: 0.9, ease: EASE }} />
        <div className="py-16">
          {open && <CardBody t={t} names={names} initials={initials} welcome={welcome} eventLabel={eventLabel} delay={0.2} />}
        </div>
      </motion.div>
    </div>
  );
}

// ══ CURTAIN PART (kına / sünnet / party) ════════════════════════════════════
function CurtainScene({ t, open, names, initials, welcome, eventLabel, tiltStyle }) {
  const accent = t?.accent || "#c8a24a";
  const drape = `linear-gradient(90deg, ${accent}22, ${accent}55 40%, ${accent}22)`;
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ perspective: 1400 }}>
      <div className="absolute inset-0 grid place-items-center px-6" style={tiltStyle}>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: open ? 1 : 0, scale: open ? 1 : 0.9 }} transition={{ delay: 0.9, duration: 1, ease: EASE }}>
          {open && <CardBody t={t} names={names} initials={initials} welcome={welcome} eventLabel={eventLabel} delay={0.9} />}
        </motion.div>
      </div>
      {/* two drapes sweeping apart */}
      <motion.div className="absolute inset-y-0 left-0 z-40" style={{ width: "52%", background: drape, boxShadow: "inset -30px 0 60px rgba(0,0,0,.4)", backgroundSize: "22px 100%", backgroundImage: `repeating-linear-gradient(90deg, ${accent}33 0 8px, ${accent}11 8px 22px)` }}
        animate={open ? { x: "-102%" } : { x: 0 }} transition={{ delay: open ? 0.4 : 0, duration: 1.3, ease: EASE }} />
      <motion.div className="absolute inset-y-0 right-0 z-40" style={{ width: "52%", boxShadow: "inset 30px 0 60px rgba(0,0,0,.4)", backgroundImage: `repeating-linear-gradient(90deg, ${accent}11 0 8px, ${accent}33 8px 22px)` }}
        animate={open ? { x: "102%" } : { x: 0 }} transition={{ delay: open ? 0.4 : 0, duration: 1.3, ease: EASE }} />
    </div>
  );
}
