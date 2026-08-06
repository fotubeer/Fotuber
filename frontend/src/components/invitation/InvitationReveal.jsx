import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Hand, DoorOpen, Sparkles, PartyPopper, Heart, Flame, Flower2 } from "lucide-react";
import { PRINT_BG, EVENT_TYPE_LABELS } from "@/lib/invitationThemes";

const EASE = [0.76, 0, 0.24, 1];
const CINE = [0.22, 1, 0.36, 1];
// Cinematic-flow entrance: staggered blur-to-focus + slide-up (reel style), shared by ALL reveal styles.
const COVER_IN = { hidden: {}, show: { transition: { staggerChildren: 0.16, delayChildren: 0.12 } } };
const CINE_ITEM = {
  hidden: { opacity: 0, y: 32, filter: "blur(14px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.9, ease: CINE } },
};

// Reveal STYLE registry — each is a selectable opening animation.
export const REVEAL_STYLES = {
  doors:     { kind: "doors",    extra: "petals",    cta: "Kapıyı Aç",      hint: "Kapımız size açık",          Icon: DoorOpen,   label: "Kapı Açılışı" },
  curtain:   { kind: "curtain",  extra: "stars",     cta: "Perdeyi Aç",     hint: "Perde arkasındaki sürpriz",  Icon: Sparkles,   label: "Perde" },
  petals:    { kind: "veil",     extra: "petals",    cta: "Dokun ve Aç",    hint: "Güller sizin için düşüyor",  Icon: Flower2,    label: "Gül Yağmuru" },
  hearts:    { kind: "veil",     extra: "hearts",    cta: "Dokun ve Aç",    hint: "Kalpler sizin için",         Icon: Heart,      label: "Kalp Yağmuru" },
  veil:      { kind: "veil",     extra: "sparkle",   cta: "Dokun ve Aç",    hint: "Tülü aralayın",              Icon: Hand,       label: "Tül & Işıltı" },
  gold:      { kind: "veil",     extra: "gold",      cta: "Dokun ve Aç",    hint: "Altın bir davet",            Icon: Sparkles,   label: "Altın Işıltı" },
  balloons:  { kind: "balloons", extra: "confetti",  cta: "Balonları Uçur", hint: "Parti başlasın!",            Icon: PartyPopper, label: "Balonlar" },
  fireworks: { kind: "veil",     extra: "fireworks", cta: "Dokun ve Aç",    hint: "Kutlama zamanı",             Icon: Sparkles,   label: "Havai Fişek" },
  henna:     { kind: "henna",    extra: "gold",      cta: "Kınamıza Dokun", hint: "Kına gecemize buyurun",      Icon: Flame,      label: "Kına Eli & Mum" },
};

// 5-6 curated style options per event type (first = default)
export const REVEALS_BY_EVENT = {
  dugun:     ["doors", "petals", "hearts", "veil", "curtain", "gold"],
  nikah:     ["doors", "veil", "petals", "curtain", "gold", "hearts"],
  nisan:     ["hearts", "petals", "doors", "veil", "gold", "fireworks"],
  kina:      ["henna", "gold", "veil", "curtain", "petals", "fireworks"],
  sunnet:    ["curtain", "balloons", "fireworks", "doors", "gold", "veil"],
  dogumgunu: ["balloons", "fireworks", "hearts", "curtain", "gold", "veil"],
  nikah2:    ["doors"],
  diger:     ["veil", "gold", "petals", "hearts", "doors", "fireworks"],
};

export const eventStyleOptions = (eventType) => (REVEALS_BY_EVENT[eventType] || REVEALS_BY_EVENT.diger);
export const resolveStyle = (eventType, styleKey) => REVEAL_STYLES[styleKey] || REVEAL_STYLES[eventStyleOptions(eventType)[0]] || REVEAL_STYLES.veil;

const CONFETTI = ["#e11d48", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"];

const rnd = (a, b) => a + Math.random() * (b - a);

// Flickering henna candle
const Candle = ({ accent }) => (
  <div className="flex flex-col items-center" style={{ width: 16 }}>
    <motion.div style={{ width: 11, height: 17, borderRadius: "50% 50% 45% 45%", background: "radial-gradient(circle at 50% 25%, #fff6c2, #ffb347 55%, #ff7a18)", filter: "drop-shadow(0 0 10px #ffb347)" }}
      animate={{ scaleY: [1, 1.25, 0.9, 1.15, 1], opacity: [0.9, 1, 0.8, 1, 0.9], y: [0, -1, 0] }}
      transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }} />
    <div style={{ width: 7, height: 44, background: `linear-gradient(${accent}66, ${accent}22)`, borderRadius: 4, marginTop: -1 }} />
  </div>
);

// Stylized henna (mehndi) hand with the couple's initials in the palm
const HennaHand = ({ accent, dark, initials }) => (
  <div className="relative mx-auto" style={{ width: 132, height: 156 }}>
    <svg viewBox="0 0 100 120" width="132" height="156" aria-hidden>
      <g fill={accent}>
        <rect x="30" y="54" width="40" height="48" rx="18" />
        <rect x="32" y="16" width="8" height="44" rx="4" />
        <rect x="44" y="8" width="8" height="52" rx="4" />
        <rect x="56" y="14" width="8" height="48" rx="4" />
        <rect x="68" y="24" width="8" height="40" rx="4" />
        <rect x="16" y="58" width="8" height="28" rx="4" transform="rotate(-32 20 72)" />
      </g>
      <g fill="none" stroke={dark ? "#0d0d0d" : "#fff"} strokeWidth="1.6" opacity="0.55">
        <circle cx="50" cy="80" r="11" />
        <circle cx="50" cy="80" r="5" />
        <circle cx="36" cy="20" r="2.4" /><circle cx="48" cy="12" r="2.4" /><circle cx="60" cy="18" r="2.4" /><circle cx="72" cy="28" r="2.4" />
        <path d="M50 63 q6 8 0 16 q-6 -8 0 -16" />
      </g>
    </svg>
    <div className="absolute inset-0 grid place-items-center" style={{ paddingTop: 44 }}>
      <span style={{ fontFamily: "'Great Vibes', cursive", color: dark ? "#0d0d0d" : "#fff", fontSize: "1.5rem" }}>{initials}</span>
    </div>
  </div>
);

// Flourish (falling petals / gold / stars / confetti / sparkle)
const Flourish = ({ type, accent, boost }) => {
  const n = boost ? 46 : 16;
  const items = useMemo(() => Array.from({ length: n }, () => ({
    left: rnd(0, 100), size: rnd(8, 20), delay: rnd(0, boost ? 0.6 : 5),
    dur: rnd(3.5, 7), drift: rnd(-70, 70), rot: rnd(0, 360),
    color: type === "confetti" ? CONFETTI[Math.floor(rnd(0, CONFETTI.length))] : accent,
  })), [n, type, accent, boost]);

  const shape = (it) => {
    if (type === "petals") return <svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M12 1.5C6.5 6 3.5 11.5 12 22.5C20.5 11.5 17.5 6 12 1.5Z" fill={it.color} /></svg>;
    if (type === "stars") return <svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M12 2l2.4 6.9H21l-5.3 4 2 6.6L12 15.6 6.3 19.5l2-6.6L3 8.9h6.6z" fill={it.color} /></svg>;
    if (type === "confetti") return <div style={{ width: "100%", height: "60%", background: it.color, borderRadius: 2 }} />;
    // gold / sparkle => glowing dot
    return <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: it.color, filter: `drop-shadow(0 0 ${it.size}px ${it.color})` }} />;
  };

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-30" aria-hidden>
      {items.map((it, i) => (
        <motion.div key={i} className="absolute" style={{ left: `${it.left}%`, top: 0, width: it.size, height: it.size }}
          initial={{ y: "-12vh", opacity: 0, rotate: it.rot }}
          animate={{ y: "115vh", x: [0, it.drift, -it.drift * 0.5, 0], rotate: it.rot + 360, opacity: [0, 1, 1, 0] }}
          transition={{ duration: it.dur, delay: it.delay, repeat: Infinity, ease: "linear" }}>
          {shape(it)}
        </motion.div>
      ))}
    </div>
  );
};

export default function InvitationReveal({ t, themeKey, eventType, styleKey, names, initials = "♥", onDone }) {
  const cfg = resolveStyle(eventType, styleKey);
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);
  const accent = t.accent;
  const solid = PRINT_BG[themeKey] || (t.dark ? "#0d0d10" : "#fbf7f2");

  const doorGrad = t.dark
    ? `linear-gradient(100deg, #1c1c22, #0c0c10)`
    : `linear-gradient(100deg, ${solid}, ${accent}22)`;

  const dur = cfg.kind === "balloons" ? 2.0 : (cfg.kind === "veil" ? 1.1 : 1.6);

  const trigger = () => {
    if (open) return;
    setOpen(true);
    onDone?.(); // reveal parent content behind
    setTimeout(() => setGone(true), dur * 1000);
  };

  const panelBorder = `1px solid ${accent}55`;
  const balloonColors = ["#e11d48", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", accent];
  const balloons = useMemo(() => Array.from({ length: 11 }, (_, i) => ({
    left: rnd(4, 92), size: rnd(42, 74), color: balloonColors[i % balloonColors.length], delay: rnd(0, 0.5), sway: rnd(-24, 24),
  })), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatePresence>
      {!gone && (
        <motion.div className="fixed inset-0 z-[70]" style={{ perspective: 1600, background: "transparent" }}
          exit={{ opacity: 0 }} transition={{ duration: 0.4 }} onClick={trigger} data-testid="invitation-reveal">

          {/* ---- Opaque cover layers ---- */}
          {cfg.kind === "doors" && (
            <>
              <motion.div className="absolute inset-y-0 left-0 w-1/2 origin-left" data-testid="reveal-door-left"
                style={{ background: doorGrad, borderRight: panelBorder, boxShadow: `inset -30px 0 60px -30px ${accent}55` }}
                animate={{ rotateY: open ? -112 : 0 }} transition={{ duration: dur, ease: EASE }}>
                <div className="absolute top-1/2 right-4 -translate-y-1/2 w-3 h-3 rounded-full" style={{ background: accent }} />
                <div className="absolute inset-6 rounded-lg" style={{ border: `1px solid ${accent}33` }} />
              </motion.div>
              <motion.div className="absolute inset-y-0 right-0 w-1/2 origin-right" data-testid="reveal-door-right"
                style={{ background: doorGrad, borderLeft: panelBorder, boxShadow: `inset 30px 0 60px -30px ${accent}55` }}
                animate={{ rotateY: open ? 112 : 0 }} transition={{ duration: dur, ease: EASE }}>
                <div className="absolute top-1/2 left-4 -translate-y-1/2 w-3 h-3 rounded-full" style={{ background: accent }} />
                <div className="absolute inset-6 rounded-lg" style={{ border: `1px solid ${accent}33` }} />
              </motion.div>
            </>
          )}

          {cfg.kind === "curtain" && (
            <>
              <motion.div className="absolute inset-y-0 left-0 w-1/2" style={{ background: doorGrad, borderRight: panelBorder }}
                animate={{ x: open ? "-100%" : "0%" }} transition={{ duration: dur, ease: EASE }} data-testid="reveal-curtain-left" />
              <motion.div className="absolute inset-y-0 right-0 w-1/2" style={{ background: doorGrad, borderLeft: panelBorder }}
                animate={{ x: open ? "100%" : "0%" }} transition={{ duration: dur, ease: EASE }} data-testid="reveal-curtain-right" />
            </>
          )}

          {(cfg.kind === "veil" || cfg.kind === "balloons" || cfg.kind === "henna") && (
            <motion.div className="absolute inset-0 overflow-hidden" style={{ background: t.bg }}
              animate={{ opacity: open ? 0 : 1 }} transition={{ duration: dur * 0.8, ease: "easeOut" }} data-testid="reveal-veil">
              {cfg.kind === "balloons" && balloons.map((b, i) => (
                <motion.div key={i} className="absolute bottom-[-90px]" style={{ left: `${b.left}%`, width: b.size }}
                  animate={open
                    ? { y: "-125vh", x: [0, b.sway, 0] }
                    : { y: [0, -18, 0] }}
                  transition={open ? { duration: dur, delay: b.delay, ease: "easeIn" } : { duration: 3 + i * 0.2, repeat: Infinity, ease: "easeInOut" }}>
                  <div style={{ width: b.size, height: b.size * 1.2, background: `radial-gradient(circle at 35% 30%, #ffffffaa, ${b.color})`, borderRadius: "50%" }} />
                  <div style={{ width: 1, height: 60, background: `${b.color}88`, margin: "0 auto" }} />
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* ---- Falling flourish ---- */}
          <Flourish type={cfg.extra} accent={accent} boost={open} />

          {/* ---- Interactive cover content ---- */}
          <AnimatePresence>
            {!open && (
              <motion.div className="absolute inset-0 z-40 flex flex-col items-center justify-center text-center px-8"
                exit={{ opacity: 0, scale: 1.18, filter: "blur(22px)" }} transition={{ duration: 0.65, ease: CINE }}>
                <motion.div variants={COVER_IN} initial="hidden" animate="show">
                  <motion.div variants={CINE_ITEM} className="uppercase tracking-[0.4em] text-[11px] mb-4" style={{ color: accent, fontFamily: "'Montserrat', sans-serif" }}>{cfg.label}</motion.div>
                  <motion.div variants={CINE_ITEM} className="leading-none mb-2" style={{ fontFamily: t.script, color: accent, fontSize: "clamp(2.6rem, 11vw, 4.5rem)" }}>
                    <motion.span className="inline-block" animate={{ scale: [1, 1.035, 1] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}>{names}</motion.span>
                  </motion.div>
                  <motion.div variants={CINE_ITEM} className="text-sm mb-8" style={{ color: t.sub, fontFamily: t.heading }}>{cfg.hint}</motion.div>

                  {/* Pulsing medallion OR henna hand + candles */}
                  <motion.div variants={CINE_ITEM}>
                  {cfg.kind === "henna" ? (
                    <div className="mb-8" data-testid="reveal-henna">
                      <HennaHand accent={accent} dark={t.dark} initials={initials} />
                      <div className="flex items-end justify-center gap-10 -mt-2">
                        <Candle accent={accent} />
                        <Candle accent={accent} />
                      </div>
                    </div>
                  ) : (
                    <motion.div className="mx-auto mb-8 rounded-full grid place-items-center relative"
                      style={{ width: 92, height: 92, background: `radial-gradient(circle at 35% 30%, ${accent}, ${accent}bb)`, color: t.dark ? "#0b0b0b" : "#fff", fontFamily: t.script, fontSize: "2.1rem", boxShadow: `0 0 0 8px ${accent}22` }}
                      animate={{ boxShadow: [`0 0 0 8px ${accent}22`, `0 0 0 18px ${accent}00`] }}
                      transition={{ duration: 1.8, repeat: Infinity }}>
                      {initials}
                    </motion.div>
                  )}
                  </motion.div>

                  <motion.div variants={CINE_ITEM}>
                  <motion.button onClick={(e) => { e.stopPropagation(); trigger(); }} data-testid="reveal-open-btn"
                    className="inline-flex items-center gap-2 rounded-full px-8 h-14 text-base font-semibold"
                    style={{ background: accent, color: t.dark ? "#0b0b0b" : "#fff", boxShadow: `0 10px 40px -10px ${accent}` }}
                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }}
                    animate={{ y: [0, -6, 0] }} transition={{ y: { duration: 1.6, repeat: Infinity, ease: "easeInOut" } }}>
                    <cfg.Icon className="w-5 h-5" /> {cfg.cta}
                  </motion.button>
                  </motion.div>
                  <motion.div variants={CINE_ITEM} className="text-[11px] mt-4 opacity-70" style={{ color: t.sub }}>açmak için dokunun</motion.div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
