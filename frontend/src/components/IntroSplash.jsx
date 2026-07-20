import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSettings } from "@/context/SettingsContext";
import { useAuth } from "@/context/AuthContext";
import { API_BASE } from "@/lib/api";

/**
 * Cinematic intro splash for Fotuber
 * Plays ONLY on the first visit within a browser session (per tab).
 *  - Same tab, SPA nav Home → x → Home:  no replay (module flag).
 *  - Same tab, F5/hard reload:            no replay (sessionStorage flag).
 *  - New tab / re-opening browser:        plays again (new session).
 *
 * If the user is logged in, greets them personally.
 * Sound: procedurally synthesised via Web Audio API — no external asset.
 */

const SESSION_KEY = "fotuber_intro_seen_v4";
let INTRO_ALREADY_PLAYED_THIS_TAB = false;

// Debug helper: append `?intro=1` (or `#intro`) to any URL to always play the intro,
// regardless of previous session state.
const isForcedIntro = () => {
  try {
    if (typeof window === "undefined") return false;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("intro") === "1") return true;
    if ((window.location.hash || "").toLowerCase().includes("intro")) return true;
  } catch (_) {}
  return false;
};

const hasSeenIntroThisSession = () => {
  if (isForcedIntro()) return false;
  if (INTRO_ALREADY_PLAYED_THIS_TAB) return true;
  try { return sessionStorage.getItem(SESSION_KEY) === "1"; } catch { return false; }
};

const markIntroSeen = () => {
  INTRO_ALREADY_PLAYED_THIS_TAB = true;
  try { sessionStorage.setItem(SESSION_KEY, "1"); } catch (_) {}
};

const useProceduralShutterSound = () => {
  const ctxRef = useRef(null);
  /**
   * Cinematic camera sequence:
   *   t=0.00  → mechanical SHUTTER click (sharp noise burst, band-pass filtered)
   *   t=0.25  → xenon FLASH burst (high-freq whine + bright top-end)
   *   t=0.25  → HEARTBEAT thump #1 (deep bass sine)
   *   t=0.55  → HEARTBEAT thump #2 (softer second beat)
   *   t=0.40  → mirror return thunk
   *
   * Call this ~250ms BEFORE the visible white flash appears
   * so the shutter click leads the visual, then flash+heartbeat
   * hit exactly when the screen turns white.
   */
  const play = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = ctxRef.current || new AudioCtx();
      ctxRef.current = ctx;
      // Try to resume in case the browser autoplay policy suspended the context on load.
      if (ctx.state === "suspended") {
        try { ctx.resume(); } catch (_) {}
      }
      const now = ctx.currentTime;

      // === 1) SHUTTER CLICK (t=0) — sharp mechanical percussion ===
      const clickBufSize = Math.floor(ctx.sampleRate * 0.09);
      const clickBuf = ctx.createBuffer(1, clickBufSize, ctx.sampleRate);
      const clickData = clickBuf.getChannelData(0);
      for (let i = 0; i < clickBufSize; i++) {
        clickData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / clickBufSize, 2);
      }
      const clickSrc = ctx.createBufferSource();
      clickSrc.buffer = clickBuf;
      const clickBp = ctx.createBiquadFilter();
      clickBp.type = "bandpass";
      clickBp.frequency.value = 1400;
      clickBp.Q.value = 0.7;
      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(1.1, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
      clickSrc.connect(clickBp).connect(clickGain).connect(ctx.destination);
      clickSrc.start(now);

      // === 2) FLASH BURST (t=0.25) — xenon whine + bright top-end sizzle ===
      const flashStart = now + 0.25;
      // High-freq whine sweep
      const whine = ctx.createOscillator();
      whine.type = "sine";
      whine.frequency.setValueAtTime(4200, flashStart);
      whine.frequency.exponentialRampToValueAtTime(1100, flashStart + 1.1);
      const whineGain = ctx.createGain();
      whineGain.gain.setValueAtTime(0.0001, flashStart);
      whineGain.gain.exponentialRampToValueAtTime(0.22, flashStart + 0.05);
      whineGain.gain.exponentialRampToValueAtTime(0.0001, flashStart + 1.2);
      whine.connect(whineGain).connect(ctx.destination);
      whine.start(flashStart);
      whine.stop(flashStart + 1.25);

      // White-noise sizzle at flash moment (electronic zap)
      const sizzleBufSize = Math.floor(ctx.sampleRate * 0.25);
      const sizzleBuf = ctx.createBuffer(1, sizzleBufSize, ctx.sampleRate);
      const sizzleData = sizzleBuf.getChannelData(0);
      for (let i = 0; i < sizzleBufSize; i++) {
        sizzleData[i] = (Math.random() * 2 - 1) * (1 - i / sizzleBufSize);
      }
      const sizzleSrc = ctx.createBufferSource();
      sizzleSrc.buffer = sizzleBuf;
      const sizzleHp = ctx.createBiquadFilter();
      sizzleHp.type = "highpass";
      sizzleHp.frequency.value = 3800;
      const sizzleGain = ctx.createGain();
      sizzleGain.gain.setValueAtTime(0.4, flashStart);
      sizzleGain.gain.exponentialRampToValueAtTime(0.001, flashStart + 0.3);
      sizzleSrc.connect(sizzleHp).connect(sizzleGain).connect(ctx.destination);
      sizzleSrc.start(flashStart);

      // === 3) HEARTBEAT (thump #1 at flash + thump #2 slightly later) ===
      const makeThump = (t, level = 0.7, dur = 0.35) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(90, t);
        osc.frequency.exponentialRampToValueAtTime(38, t + dur);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(level, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        // Sub-bass thump body (thicker feel)
        const subOsc = ctx.createOscillator();
        subOsc.type = "sine";
        subOsc.frequency.setValueAtTime(55, t);
        subOsc.frequency.exponentialRampToValueAtTime(28, t + dur);
        const subGain = ctx.createGain();
        subGain.gain.setValueAtTime(0.0001, t);
        subGain.gain.exponentialRampToValueAtTime(level * 0.9, t + 0.04);
        subGain.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.2);
        osc.connect(gain).connect(ctx.destination);
        subOsc.connect(subGain).connect(ctx.destination);
        osc.start(t);
        subOsc.start(t);
        osc.stop(t + dur + 0.05);
        subOsc.stop(t + dur * 1.2 + 0.05);
      };
      makeThump(flashStart, 0.85, 0.38);           // primary boom syncs with flash
      makeThump(flashStart + 0.32, 0.55, 0.30);    // second heartbeat pulse

      // === 4) Mirror return thunk (t=0.40) — mechanical settle ===
      const thunk = ctx.createOscillator();
      thunk.type = "square";
      thunk.frequency.setValueAtTime(150, now + 0.40);
      thunk.frequency.exponentialRampToValueAtTime(55, now + 0.55);
      const thunkGain = ctx.createGain();
      thunkGain.gain.setValueAtTime(0.35, now + 0.40);
      thunkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.56);
      thunk.connect(thunkGain).connect(ctx.destination);
      thunk.start(now + 0.40);
      thunk.stop(now + 0.58);
    } catch (_) { /* silent */ }
  };
  return play;
};

const CameraLens = () => (
  <motion.svg
    viewBox="0 0 200 200"
    className="w-40 h-40 md:w-56 md:h-56"
    initial={{ opacity: 0, scale: 0.4, rotate: -30 }}
    animate={{ opacity: 1, scale: 1, rotate: 0 }}
    transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
  >
    <defs>
      <radialGradient id="glass" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#f8e6a0" stopOpacity="0.9" />
        <stop offset="45%" stopColor="#a17c2b" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#050505" stopOpacity="1" />
      </radialGradient>
      <radialGradient id="reflect" cx="35%" cy="30%" r="20%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
    </defs>
    {/* Outer ring */}
    <circle cx="100" cy="100" r="94" fill="none" stroke="#d4af37" strokeWidth="2" opacity="0.7" />
    <circle cx="100" cy="100" r="86" fill="none" stroke="#7d641e" strokeWidth="6" />
    {/* Inner glass */}
    <circle cx="100" cy="100" r="72" fill="url(#glass)" />
    <circle cx="100" cy="100" r="72" fill="none" stroke="#d4af37" strokeWidth="1.2" opacity="0.55" />
    {/* Aperture blades — decorative */}
    {Array.from({ length: 8 }).map((_, i) => {
      const a = (i * 45 * Math.PI) / 180;
      const x1 = 100 + Math.cos(a) * 70;
      const y1 = 100 + Math.sin(a) * 70;
      const x2 = 100 + Math.cos(a + 0.35) * 30;
      const y2 = 100 + Math.sin(a + 0.35) * 30;
      return <path key={i} d={`M100 100 L${x1} ${y1} L${x2} ${y2} Z`} fill="#000" opacity="0.25" />;
    })}
    {/* Pupil */}
    <circle cx="100" cy="100" r="22" fill="#0b0b0b" stroke="#d4af37" strokeWidth="1" />
    <circle cx="88" cy="88" r="10" fill="url(#reflect)" />
  </motion.svg>
);

const IntroSplash = () => {
  const { settings } = useSettings();
  const { user, loading: authLoading } = useAuth();
  const [visible, setVisible] = useState(() => !hasSeenIntroThisSession());
  const [phase, setPhase] = useState("lens"); // lens -> flash -> line -> brand -> out
  const playSound = useProceduralShutterSound();

  const finish = () => {
    markIntroSeen();
    setPhase("out");
    setTimeout(() => setVisible(false), 900);
  };

  // Start the animation timeline only after auth has resolved,
  // so we know whether to personalise the greeting.
  useEffect(() => {
    if (!visible || authLoading) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Total timeline ≈ 13.5s — sound is fired 250ms BEFORE the visible flash
    // so the shutter click leads, then flash whine + heartbeat sync with the white burst.
    // sound:  1.15s (shutter click)
    // lens:   0.0s → 1.4s
    // flash:  1.4s   (sound whine + heartbeat land here as the screen turns white)
    // line:   2.9s → 6.9s   (~4.0s reading time)
    // brand:  7.0s → 13.5s  (~6.5s — cursive 'Görsel Sanat' fully in by ~8.9s, then held ~4.6s)
    // out:    13.5s (0.9s fade-out)
    const timers = [];
    timers.push(setTimeout(() => { playSound(); }, 1150));        // shutter click lands 250ms early
    timers.push(setTimeout(() => setPhase("flash"), 1400));       // visual white burst
    timers.push(setTimeout(() => setPhase("line"),  2900));
    timers.push(setTimeout(() => setPhase("brand"), 7000));
    timers.push(setTimeout(finish, 13500));
    return () => {
      timers.forEach(clearTimeout);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, authLoading]);

  if (!visible) return null;

  const logoUrl = settings?.logo_id ? `${API_BASE}/settings/logo/${settings.logo_id}` : null;
  const firstName = (user?.name || "").trim().split(/\s+/)[0] || "";
  const greetingLine = firstName
    ? `Bugün harika görünüyorsunuz, ${firstName}.`
    : "Bugün harika görünüyorsunuz.";

  return (
    <AnimatePresence>
      <motion.div
        key="fotuber-intro"
        data-testid="fotuber-intro-splash"
        className="fixed inset-0 z-[9999] bg-black overflow-hidden select-none cursor-pointer"
        initial={{ opacity: 1 }}
        animate={{ opacity: phase === "out" ? 0 : 1 }}
        transition={{ duration: 0.9, ease: "easeInOut" }}
        onClick={finish}
        aria-label="Fotuber giriş animasyonu"
      >
        {/* Subtle vignette + noise */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(60,42,10,0.35),rgba(0,0,0,0.98)_70%)]" />
        <div className="absolute inset-0 bg-grain opacity-30 pointer-events-none" />

        {/* Skip hint */}
        <button
          onClick={(e) => { e.stopPropagation(); finish(); }}
          className="absolute top-5 right-5 md:top-6 md:right-8 text-[10px] md:text-xs uppercase tracking-[0.35em] text-neutral-500 hover:text-[#d4af37] transition-colors"
          data-testid="intro-skip-btn"
        >
          Atla →
        </button>

        {/* Center stage */}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          {/* PHASE: lens */}
          <AnimatePresence>
            {(phase === "lens" || phase === "flash") && (
              <motion.div
                key="lens"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 1.4 }}
                transition={{ duration: 0.7 }}
              >
                <CameraLens />
              </motion.div>
            )}
          </AnimatePresence>

          {/* PHASE: line */}
          <AnimatePresence>
            {phase === "line" && (
              <motion.div
                key="line"
                initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0,  filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -14, filter: "blur(6px)" }}
                transition={{ duration: 1.4, ease: "easeOut" }}
                className="text-white text-2xl sm:text-3xl md:text-5xl font-light tracking-[0.18em] drop-shadow-[0_2px_20px_rgba(255,255,255,0.35)]"
                style={{ fontFamily: "'Cormorant Garamond', 'Times New Roman', serif" }}
              >
                {greetingLine}
              </motion.div>
            )}
          </AnimatePresence>

          {/* PHASE: brand */}
          <AnimatePresence>
            {phase === "brand" && (
              <motion.div
                key="brand"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8 }}
                className="flex flex-col items-center gap-6 md:gap-8"
              >
                {/* Logo — customer's uploaded logo displayed die-cut on the dark stage.
                    'mixBlendMode: screen' turns any pure-black background of the source PNG transparent
                    (perfect for logos with dark or transparent backgrounds). If the source is a
                    transparent-background PNG, it renders natively; if it has a solid dark bg, that bg is
                    removed by the blend. No circular frame — the logo shows in its native shape. */}
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1,   opacity: 1 }}
                  transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                  className="relative flex items-center justify-center"
                >
                  {/* Soft ambient glow behind the logo (no visible frame) */}
                  <div className="absolute inset-0 blur-3xl bg-[#d4af37]/25 rounded-full" />
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Fotuber logo"
                      className="relative w-48 h-48 sm:w-56 sm:h-56 md:w-72 md:h-72 object-contain drop-shadow-[0_0_45px_rgba(255,255,255,0.45)]"
                      style={{ mixBlendMode: "screen" }}
                    />
                  ) : (
                    <svg viewBox="0 0 40 40" className="relative w-40 h-40 md:w-56 md:h-56 text-white" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <rect x="6" y="12" width="28" height="20" rx="3" />
                      <circle cx="20" cy="22" r="6" />
                      <path d="M14 12 l3 -4 h6 l3 4" />
                    </svg>
                  )}
                </motion.div>

                {/* Wordmark — extra padding-right so the cursive 't' flourish never clips at any viewport */}
                <div className="flex flex-col items-center leading-none pr-2 md:pr-4 max-w-[95vw]">
                  <motion.div
                    initial={{ opacity: 0, y: 26, letterSpacing: "0.4em" }}
                    animate={{ opacity: 1, y: 0,  letterSpacing: "0.02em" }}
                    transition={{ duration: 1.0, ease: "easeOut", delay: 0.4 }}
                    className="text-white text-6xl sm:text-7xl md:text-9xl font-black drop-shadow-[0_4px_30px_rgba(255,255,255,0.15)]"
                    style={{ fontFamily: "'Manrope','Helvetica Neue',Arial,sans-serif", fontWeight: 900, letterSpacing: "-0.02em" }}
                  >
                    Fotuber
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 22, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0,  scale: 1 }}
                    transition={{ duration: 1.0, ease: "easeOut", delay: 0.9 }}
                    className="mt-4 md:mt-5 text-[#d4af37] text-4xl sm:text-5xl md:text-7xl italic drop-shadow-[0_2px_18px_rgba(212,175,55,0.6)] whitespace-nowrap pr-4 md:pr-8"
                    style={{
                      fontFamily: "'Great Vibes','Pinyon Script','Dancing Script','Segoe Script','Brush Script MT',cursive",
                      lineHeight: 1.25,
                    }}
                  >
                    Görsel Sanat
                  </motion.div>
                </div>

                {/* Tiny sub-label */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.75 }}
                  transition={{ duration: 1.0, delay: 1.6 }}
                  className="mt-2 text-[10px] md:text-xs tracking-[0.4em] uppercase text-neutral-400"
                >
                  fotuber.com.tr
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Flash overlay — massive white burst that whitens the whole environment before the reveal */}
        <AnimatePresence>
          {phase === "flash" && (
            <motion.div
              key="flash-white"
              className="pointer-events-none absolute inset-0 bg-white"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 1, 0.9, 0.55, 0.18, 0] }}
              transition={{ duration: 1.5, times: [0, 0.06, 0.22, 0.35, 0.55, 0.8, 1], ease: "easeOut" }}
            />
          )}
        </AnimatePresence>

        {/* Additional soft-bloom layer to keep the whole scene bright a moment longer */}
        <AnimatePresence>
          {phase === "flash" && (
            <motion.div
              key="flash-bloom"
              className="pointer-events-none absolute inset-0"
              style={{ background: "radial-gradient(ellipse at center, rgba(255,255,255,0.85), rgba(255,255,255,0.4) 45%, rgba(255,255,255,0) 75%)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0.7, 0.3, 0] }}
              transition={{ duration: 1.8, times: [0, 0.1, 0.35, 0.65, 1], ease: "easeOut" }}
            />
          )}
        </AnimatePresence>

        {/* Radial flash ring */}
        <AnimatePresence>
          {phase === "flash" && (
            <motion.div
              key="flash-ring"
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#fff8d6]"
              style={{ width: 40, height: 40 }}
              initial={{ opacity: 0.9, scale: 0.2 }}
              animate={{ opacity: 0, scale: 30 }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
};

export default IntroSplash;
