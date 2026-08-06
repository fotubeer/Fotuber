import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Flower2, Sparkles, Minus, Volume2, VolumeX, ChevronsRight } from "lucide-react";
import { createRevealSound } from "@/components/invitation/revealSound";

const EASE = [0.22, 1, 0.36, 1];
const rnd = (a, b) => a + Math.random() * (b - a);

// ── 4 signature opening experiences (selectable in the wizard) ──────────────
export const SIGNATURE_STYLES = [
  { key: "envelope", label: "Mühürlü Zarf",   desc: "Kâğıt dokusu, mum mührün kırılışı ve zarfın açılışı", swatch: ["#6d1616", "#c8a24a"], Icon: Mail },
  { key: "garden",   label: "Çiçekli Bahçe",  desc: "Zarif çiçek dansı ve yumuşak yaylı ezgi",             swatch: ["#5f7a54", "#e6a9bf"], Icon: Flower2 },
  { key: "ballroom", label: "Işıltılı Salon", desc: "Balo salonu ışıkları ve görkemli çıkış",              swatch: ["#171334", "#e6c260"], Icon: Sparkles },
  { key: "minimal",  label: "Modern Minimal", desc: "Sade ama güçlü tipografi ve zarif geçişler",          swatch: ["#101010", "#c9c9c9"], Icon: Minus },
];
export const resolveSignature = (key) => SIGNATURE_STYLES.find((s) => s.key === key)?.key || "envelope";

const DUR = { envelope: 3600, garden: 3400, ballroom: 3300, minimal: 2600 };
const BTN = {
  envelope: { bg: "#c8a24a", fg: "#3a1010", ring: "#c8a24a", hint: "#f0d6a8", cta: "Davetiye Aç" },
  garden:   { bg: "#5f7a54", fg: "#ffffff", ring: "#5f7a54", hint: "#4a6340", cta: "Davetiye Aç" },
  ballroom: { bg: "linear-gradient(90deg,#c8a24a,#e6c260)", fg: "#221a05", ring: "#e6c260", hint: "#e6c260", cta: "Davetiye Aç" },
  minimal:  { bg: "#ffffff", fg: "#0e0e0e", ring: "#ffffff88", hint: "#8a8a8a", cta: "Davetiye Aç" },
};

// Per-style customization presets (applied from invitation.reveal_opts).
export const ENV_THEMES = {
  bordo:    { bg: "radial-gradient(130% 120% at 50% 0%, #7d1f1f, #4a1111 55%, #2c0a0a)", flap: "linear-gradient(#a12e2e,#7d1f1f)", body: "linear-gradient(#8f2626,#6d1616)", seal: "radial-gradient(circle at 35% 30%, #b83b3b, #7a1414)", sealBorder: "#5c0f0f", ink: "#4a2020", label: "#9a6a2f" },
  lacivert: { bg: "radial-gradient(130% 120% at 50% 0%, #1e2a52, #131c39 55%, #0a0f22)", flap: "linear-gradient(#2c3c6e,#1e2a52)", body: "linear-gradient(#243257,#182346)", seal: "radial-gradient(circle at 35% 30%, #3a4f86, #1c264c)", sealBorder: "#141c3a", ink: "#1e2a52", label: "#6b78a6" },
  zumrut:   { bg: "radial-gradient(130% 120% at 50% 0%, #1c4a3a, #123528 55%, #0a1f18)", flap: "linear-gradient(#256b52,#1c4a3a)", body: "linear-gradient(#1f5a45,#154234)", seal: "radial-gradient(circle at 35% 30%, #2f8465, #124a37)", sealBorder: "#0e3527", ink: "#154234", label: "#5f9a80" },
  antrasit: { bg: "radial-gradient(130% 120% at 50% 0%, #33373d, #212327 55%, #121316)", flap: "linear-gradient(#3d434b,#2a2e34)", body: "linear-gradient(#33383f,#22262b)", seal: "radial-gradient(circle at 35% 30%, #565c66, #2a2e34)", sealBorder: "#1a1c20", ink: "#2a2e34", label: "#8a8f98" },
};
export const GARDEN_PAL = {
  blush:     ["#f4c6d5", "#e79bb4", "#f7e2a3", "#ffffff"],
  lavanta:   ["#d9c7ef", "#b89be0", "#efe0f7", "#ffffff"],
  seftali:   ["#f7c9a3", "#f0a877", "#fbe4c6", "#ffffff"],
  beyaz:     ["#ffffff", "#f0f0e6", "#eef3e6", "#f7e2a3"],
  gunbatimi: ["#f6a97c", "#e8748a", "#f7cf8f", "#ffffff"],
};
export const BALL_TONE = {
  gold:   { a: "#e6c260", ring: "#e6c260", grad: "linear-gradient(90deg,#c8a24a,#fff4cf,#e6c260)", spark: "#f4dd8f", sub: "#d8c07e" },
  gul:    { a: "#e6a9bf", ring: "#e6a9bf", grad: "linear-gradient(90deg,#b76e86,#ffe3ee,#e6a9bf)", spark: "#f6c9d8", sub: "#d8a7b6" },
  gumus:  { a: "#d7dee8", ring: "#d7dee8", grad: "linear-gradient(90deg,#8b93a3,#ffffff,#d7dee8)", spark: "#eef2f8", sub: "#aeb6c2" },
};

// ─────────────────────────────────────────────────────────────────────────────
export default function InvitationReveal({ styleKey, eventType, names = "", initials = "♥", opts = {}, onDone }) {
  const key = resolveSignature(styleKey);
  const [phase, setPhase] = useState("idle"); // idle | open
  const [gone, setGone] = useState(false);
  const [muted, setMuted] = useState(false);
  const sound = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    sound.current = createRevealSound(key);
    return () => { sound.current?.stop(); clearTimeout(timer.current); };
  }, [key]);

  const finish = () => {
    clearTimeout(timer.current);
    onDone?.();
    setTimeout(() => setGone(true), 620);
  };

  const openIt = () => {
    if (phase !== "idle") return;
    setPhase("open");
    sound.current?.start();
    timer.current = setTimeout(finish, DUR[key]);
  };

  const toggleMute = (e) => { e?.stopPropagation(); const m = !muted; setMuted(m); sound.current?.setMuted(m); };
  const open = phase === "open";
  const b = BTN[key];
  const Scene = { envelope: EnvelopeScene, garden: GardenScene, ballroom: BallroomScene, minimal: MinimalScene }[key];

  return (
    <AnimatePresence>
      {!gone && (
        <motion.div className="fixed inset-0 z-[80] overflow-hidden select-none" data-testid="invitation-reveal"
          exit={{ opacity: 0 }} transition={{ duration: 0.6 }} onClick={() => !open && openIt()}>
          <Scene open={open} names={names} initials={initials} opts={opts || {}} />

          {/* Idle: "Davetiye Aç" button + hint (parent-level → always on top) */}
          <AnimatePresence>
            {!open && (
              <motion.div className="absolute inset-x-0 bottom-0 z-[92] flex flex-col items-center pb-14 pointer-events-none"
                exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.3 }}>
                <motion.button onClick={(e) => { e.stopPropagation(); openIt(); }} data-testid="reveal-open-btn"
                  className="pointer-events-auto inline-flex items-center gap-2 rounded-full px-9 h-14 text-base font-semibold tracking-wide"
                  style={{ background: b.bg, color: b.fg, boxShadow: `0 14px 44px -10px ${b.ring}` }}
                  initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.7 }}
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  {b.cta}
                </motion.button>
                <motion.div className="mt-4 text-[11px] tracking-[0.3em] uppercase" style={{ color: b.hint }}
                  initial={{ opacity: 0 }} animate={{ opacity: 0.75 }} transition={{ delay: 1 }}>
                  açmak için dokunun
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Controls — always visible after opening */}
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

// ══ 1) MÜHÜRLÜ ZARF ══════════════════════════════════════════════════════════
function EnvelopeScene({ open, names, initials, opts = {} }) {
  const th = ENV_THEMES[opts.wax] || ENV_THEMES.bordo;
  const gold = opts.gold || "#c8a24a";
  const sealText = (opts.seal || initials || "♥").slice(0, 3);
  const paper = "radial-gradient(120% 120% at 30% 20%, #fbf6ec, #efe4d0 60%, #e4d5ba)";
  return (
    <div className="absolute inset-0 grid place-items-center px-6" style={{ background: th.bg }}>
      <div className="absolute inset-0 opacity-[0.15]" style={{ backgroundImage: "radial-gradient(#000 0.5px, transparent 0.5px)", backgroundSize: "4px 4px" }} />

      <motion.div className="absolute z-20 rounded-md overflow-hidden"
        style={{ width: "min(88vw, 460px)", background: paper, boxShadow: "0 40px 80px -20px rgba(0,0,0,.6)", border: "1px solid #d8c39a" }}
        initial={{ height: 150, y: 60, opacity: 0 }}
        animate={open ? { height: "min(78vh,640px)", y: 0, opacity: 1 } : { height: 150, y: 60, opacity: 0 }}
        transition={{ height: { delay: 1.2, duration: 1.3, ease: EASE }, y: { delay: 1.0, duration: 1.2, ease: EASE }, opacity: { delay: 1.0, duration: 0.5 } }}>
        <div className="h-full w-full flex flex-col items-center justify-center text-center px-8">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: open ? 1 : 0 }} transition={{ delay: 1.9, duration: 0.8 }}>
            <div className="text-[11px] tracking-[0.45em] uppercase mb-5" style={{ color: th.label }}>Davetlisiniz</div>
            <div className="mx-auto mb-5 w-14 h-14 rounded-full grid place-items-center" style={{ border: `1.5px solid ${gold}`, color: th.ink, fontFamily: "'Cardo', serif", fontSize: "1.4rem" }}>{sealText}</div>
            <div style={{ fontFamily: "'Cardo', serif", color: th.ink, fontSize: "clamp(2rem,7vw,3.2rem)", lineHeight: 1.1 }}>{names}</div>
            <div className="mx-auto my-5 h-px w-24" style={{ background: gold }} />
            <div className="text-xs tracking-[0.3em] uppercase" style={{ color: th.label }}>sizi aramızda görmekten mutluluk duyarız</div>
          </motion.div>
        </div>
      </motion.div>

      <div className="relative z-30" style={{ width: "min(88vw, 460px)", height: 300, perspective: 1400 }}>
        <motion.div className="absolute inset-x-0 bottom-0"
          style={{ height: 200, background: th.body, boxShadow: "inset 0 8px 30px rgba(0,0,0,.35)", borderRadius: "0 0 8px 8px" }}
          animate={open ? { y: 220, opacity: 0 } : { y: 0, opacity: 1 }} transition={{ delay: open ? 1.5 : 0, duration: 1, ease: EASE }}>
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, transparent 49.5%, rgba(0,0,0,.18) 50%), linear-gradient(-135deg, transparent 49.5%, rgba(0,0,0,.18) 50%)" }} />
        </motion.div>
        <motion.div className="absolute inset-x-0 top-0 origin-top z-40"
          style={{ height: 150, background: th.flap, clipPath: "polygon(0 0, 100% 0, 50% 100%)", transformStyle: "preserve-3d" }}
          animate={open ? { rotateX: 175 } : { rotateX: 0, x: [0, -3, 3, -2, 0] }}
          transition={open ? { delay: 0.9, duration: 0.9, ease: EASE } : { x: { delay: 0.4, duration: 0.5 } }} />
        <motion.div className="absolute left-1/2 top-[118px] -translate-x-1/2 z-50 rounded-full grid place-items-center"
          style={{ width: 66, height: 66, background: th.seal, boxShadow: "0 6px 14px rgba(0,0,0,.4)", color: "#f2d9a0", fontFamily: "'Cardo', serif", fontSize: "1.3rem", border: `2px solid ${th.sealBorder}` }}
          animate={open ? { scale: [1, 1.15, 0], rotate: [0, -8, 14], opacity: [1, 1, 0] } : { scale: [1, 1.04, 1] }}
          transition={open ? { delay: 0.55, duration: 0.6, ease: "easeIn" } : { duration: 2.4, repeat: Infinity }}>
          {sealText}
        </motion.div>
      </div>
    </div>
  );
}

// ══ 2) ÇİÇEKLİ BAHÇE ═════════════════════════════════════════════════════════
function GardenScene({ open, names, initials, opts = {} }) {
  const pal = GARDEN_PAL[opts.palette] || GARDEN_PAL.blush;
  const petals = useMemo(() => Array.from({ length: 16 }, () => ({
    left: rnd(0, 100), size: rnd(14, 30), delay: rnd(0, 1.6), dur: rnd(5, 9), rot: rnd(0, 360),
    c: pal[Math.floor(rnd(0, pal.length))],
  })), [pal]);
  const blooms = useMemo(() => Array.from({ length: 10 }, (_, i) => ({
    x: rnd(-46, 46), y: rnd(-40, 40), s: rnd(0.5, 1.1), delay: 1 + i * 0.12, c: pal[i % pal.length],
  })), [pal]);
  return (
    <div className="absolute inset-0 grid place-items-center px-6 overflow-hidden"
      style={{ background: "radial-gradient(120% 120% at 50% 15%, #f3f0e4, #dbe6cf 55%, #b9ccac)" }}>
      <div className="pointer-events-none absolute inset-0">
        {petals.map((p, i) => (
          <motion.div key={i} className="absolute" style={{ left: `${p.left}%`, top: -30, width: p.size, height: p.size * 0.7, background: p.c, borderRadius: "60% 40% 60% 40%" }}
            initial={{ y: -40, opacity: 0, rotate: p.rot }}
            animate={{ y: "112vh", x: [0, 24, -18, 0], rotate: p.rot + 220, opacity: [0, 0.9, 0.9, 0] }}
            transition={{ delay: p.delay, duration: p.dur, repeat: Infinity, ease: "linear" }} />
        ))}
      </div>

      <div className="relative grid place-items-center" style={{ width: 300, height: 300 }}>
        {blooms.map((bl, i) => (
          <motion.div key={i} className="absolute" style={{ width: 40, height: 40 }}
            initial={{ scale: 0, x: 0, y: 0, opacity: 0 }}
            animate={open ? { scale: bl.s, x: bl.x, y: bl.y, opacity: 1, rotate: 360 } : { scale: 0, opacity: 0 }}
            transition={{ delay: bl.delay, duration: 1.1, ease: EASE }}>
            <Blossom color={bl.c} />
          </motion.div>
        ))}
        <motion.div className="relative z-10 text-center" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8 }}>
          <div className="mx-auto w-16 h-16 rounded-full grid place-items-center mb-2"
            style={{ background: "rgba(255,255,255,.7)", border: "1.5px solid #5f7a54", color: "#4a6340", fontFamily: "'Great Vibes', cursive", fontSize: "2rem" }}>{initials}</div>
        </motion.div>
      </div>

      <motion.div className="absolute z-10 text-center px-8" style={{ top: "58%" }}
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: open ? 1 : 0, y: open ? 0 : 24 }} transition={{ delay: 1.6, duration: 1, ease: EASE }}>
        <div style={{ fontFamily: "'Great Vibes', cursive", color: "#3f5a37", fontSize: "clamp(2.6rem,10vw,4.2rem)", lineHeight: 1 }}>{names}</div>
        <div className="mt-3 text-xs tracking-[0.35em] uppercase" style={{ color: "#7d9070" }}>bahçemize davetlisiniz</div>
      </motion.div>
    </div>
  );
}
const Blossom = ({ color }) => (
  <svg viewBox="0 0 40 40" width="40" height="40">
    {[0, 72, 144, 216, 288].map((a) => (
      <ellipse key={a} cx="20" cy="9" rx="6.5" ry="10" fill={color} opacity="0.92" transform={`rotate(${a} 20 20)`} />
    ))}
    <circle cx="20" cy="20" r="5" fill="#f7e2a3" />
  </svg>
);

// ══ 3) IŞILTILI SALON ════════════════════════════════════════════════════════
function BallroomScene({ open, names, initials, opts = {} }) {
  const tn = BALL_TONE[opts.tone] || BALL_TONE.gold;
  const bokeh = useMemo(() => Array.from({ length: 26 }, () => ({
    left: rnd(0, 100), top: rnd(0, 100), size: rnd(4, 16), delay: rnd(0, 2), dur: rnd(2.5, 5),
  })), []);
  const sparks = useMemo(() => Array.from({ length: 30 }, () => ({
    left: rnd(20, 80), size: rnd(2, 6), delay: rnd(0.8, 2), dur: rnd(1.6, 3), x: rnd(-60, 60),
  })), []);
  return (
    <div className="absolute inset-0 grid place-items-center px-6 overflow-hidden"
      style={{ background: "radial-gradient(90% 90% at 50% 30%, #2a2350, #171334 55%, #0a0820)" }}>
      <div className="pointer-events-none absolute inset-0">
        {bokeh.map((bk, i) => (
          <motion.div key={i} className="absolute rounded-full" style={{ left: `${bk.left}%`, top: `${bk.top}%`, width: bk.size, height: bk.size, background: `radial-gradient(circle,#fff5cc,${tn.a})`, filter: "blur(1px)" }}
            animate={{ opacity: [0.15, 0.9, 0.15], scale: [0.8, 1.3, 0.8] }} transition={{ delay: bk.delay, duration: bk.dur, repeat: Infinity, ease: "easeInOut" }} />
        ))}
      </div>
      <motion.div className="absolute rounded-full" style={{ width: 40, height: 40, background: "radial-gradient(circle,#fff6d8,#e6c26000)" }}
        animate={open ? { scale: [1, 34], opacity: [0.9, 0] } : { scale: 1, opacity: 0 }} transition={{ delay: 0.4, duration: 1.6, ease: "easeOut" }} />
      {open && (
        <div className="pointer-events-none absolute inset-0">
          {sparks.map((s, i) => (
            <motion.div key={i} className="absolute rounded-full" style={{ left: `${s.left}%`, bottom: -10, width: s.size, height: s.size, background: tn.spark, boxShadow: `0 0 8px ${tn.a}` }}
              initial={{ y: 0, opacity: 0 }} animate={{ y: "-110vh", x: s.x, opacity: [0, 1, 0] }} transition={{ delay: s.delay, duration: s.dur, ease: "easeOut" }} />
          ))}
        </div>
      )}

      <motion.div className="relative z-10 text-center px-8"
        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: open ? 1 : 0, scale: open ? 1 : 0.9 }} transition={{ delay: 1.1, duration: 1.1, ease: EASE }}>
        <div className="mx-auto mb-4 w-16 h-16 rounded-full grid place-items-center"
          style={{ border: `1.5px solid ${tn.ring}`, color: tn.spark, fontFamily: "'Great Vibes', cursive", fontSize: "2rem", boxShadow: `0 0 30px ${tn.a}66` }}>{initials}</div>
        <motion.div style={{ fontFamily: "'Great Vibes', cursive", fontSize: "clamp(2.8rem,11vw,4.6rem)", lineHeight: 1, backgroundImage: tn.grad, backgroundSize: "200% 100%", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: `drop-shadow(0 2px 14px ${tn.a}66)` }}
          animate={{ backgroundPositionX: ["0%", "100%"] }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }}>
          {names}
        </motion.div>
        <div className="mt-4 text-xs tracking-[0.4em] uppercase" style={{ color: tn.sub }}>zarif bir gecenin başlangıcı</div>
      </motion.div>
    </div>
  );
}

// ══ 4) MODERN MİNİMAL ════════════════════════════════════════════════════════
function MinimalScene({ open, names, initials, opts = {} }) {
  const light = opts.bg === "light";
  const accent = opts.accent || (light ? "#111111" : "#e5e5e5");
  const bg = light ? "#f5f4f0" : "#0e0e0e";
  const ink = light ? "#111111" : "#ffffff";
  const sub = light ? "#6a6a6a" : "#9a9a9a";
  return (
    <div className="absolute inset-0 grid place-items-center px-8" style={{ background: bg }}>
      <motion.div className="absolute left-0 right-0 h-px" style={{ top: "50%", background: accent }}
        initial={{ scaleX: 0 }} animate={{ scaleX: open ? 1 : 0 }} transition={{ delay: 0.2, duration: 0.9, ease: EASE }} />
      <div className="relative z-10 text-center overflow-hidden">
        <motion.div className="text-[11px] tracking-[0.6em] uppercase mb-6" style={{ color: sub }}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: open ? 1 : 0, y: open ? 0 : 10 }} transition={{ delay: 0.9, duration: 0.7 }}>
          Davetlisiniz
        </motion.div>
        <div className="overflow-hidden">
          <motion.div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, color: ink, fontSize: "clamp(2rem,9vw,4rem)", letterSpacing: "-0.02em", lineHeight: 1.05, textTransform: "uppercase" }}
            initial={{ y: "110%" }} animate={{ y: open ? "0%" : "110%" }} transition={{ delay: 1.1, duration: 0.9, ease: EASE }}>
            {names}
          </motion.div>
        </div>
        <motion.div className="mx-auto mt-6 h-8 w-px" style={{ background: accent }}
          initial={{ scaleY: 0 }} animate={{ scaleY: open ? 1 : 0 }} transition={{ delay: 1.8, duration: 0.6 }} />
        <motion.div className="mt-6 text-xs tracking-[0.45em] uppercase" style={{ color: sub }}
          initial={{ opacity: 0 }} animate={{ opacity: open ? 1 : 0 }} transition={{ delay: 2, duration: 0.8 }}>
          {initials} · birlikteyiz
        </motion.div>
      </div>
    </div>
  );
}
