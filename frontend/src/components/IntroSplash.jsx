import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSettings } from "@/context/SettingsContext";
import { API_BASE } from "@/lib/api";

/**
 * Cinematic intro splash for Fotuber
 * Sequence (~5.5s total):
 *  0.0s - dark bg + lens draws in at center
 *  1.3s - shutter click + flash burst (white overlay to 100% then decays)
 *  2.4s - “Bugün harika görünüyorsunuz.” fades in
 *  3.6s - line fades out
 *  4.0s - logo icon + wordmark (“Fotuber” bold + “Görsel Sanat” cursive) reveal
 *  5.4s - whole splash fades out and unmounts (site is visible under)
 *
 * Sound: procedurally synthesised via Web Audio API — no external asset.
 * A single tap/click anywhere also skips the splash instantly.
 */
const SESSION_KEY = "fotuber_intro_played_v1";

const useProceduralShutterSound = () => {
  const ctxRef = useRef(null);
  const play = () => {
    try {
      // Lazy create audio context after user interaction (or fallback for autoplay-tolerant browsers)
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = ctxRef.current || new AudioCtx();
      ctxRef.current = ctx;
      // Mechanical shutter click — short noise burst through a band-pass
      const now = ctx.currentTime;
      const bufferSize = Math.floor(ctx.sampleRate * 0.08);
      const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1200;
      bp.Q.value = 0.8;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.9, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      noise.connect(bp).connect(noiseGain).connect(ctx.destination);
      noise.start(now);
      // Flash whine — high frequency sine that decays
      const whine = ctx.createOscillator();
      whine.type = "sine";
      whine.frequency.setValueAtTime(3600, now + 0.06);
      whine.frequency.exponentialRampToValueAtTime(900, now + 0.9);
      const whineGain = ctx.createGain();
      whineGain.gain.setValueAtTime(0.0001, now + 0.06);
      whineGain.gain.exponentialRampToValueAtTime(0.18, now + 0.09);
      whineGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
      whine.connect(whineGain).connect(ctx.destination);
      whine.start(now + 0.06);
      whine.stop(now + 1.05);
      // Second thunk (mirror return)
      const thunk = ctx.createOscillator();
      thunk.type = "square";
      thunk.frequency.setValueAtTime(120, now + 0.15);
      thunk.frequency.exponentialRampToValueAtTime(60, now + 0.24);
      const thunkGain = ctx.createGain();
      thunkGain.gain.setValueAtTime(0.35, now + 0.15);
      thunkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      thunk.connect(thunkGain).connect(ctx.destination);
      thunk.start(now + 0.15);
      thunk.stop(now + 0.27);
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
    {/* Text “Fotuber” engraved on ring */}
    <text x="100" y="20" textAnchor="middle" fill="#d4af37" fontSize="8" letterSpacing="4" opacity="0.85">FOTUBER · f/1.4</text>
  </motion.svg>
);

const IntroSplash = () => {
  const { settings } = useSettings();
  const [visible, setVisible] = useState(() => {
    try { return sessionStorage.getItem(SESSION_KEY) !== "1"; } catch { return true; }
  });
  const [phase, setPhase] = useState("lens"); // lens -> flash -> line -> brand -> out
  const playSound = useProceduralShutterSound();

  const finish = () => {
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch (_) {}
    setPhase("out");
    setTimeout(() => setVisible(false), 900);
  };

  useEffect(() => {
    if (!visible) return;
    // lock body scroll during splash
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timers = [];
    timers.push(setTimeout(() => { setPhase("flash"); playSound(); }, 1250));
    timers.push(setTimeout(() => setPhase("line"),  2400));
    timers.push(setTimeout(() => setPhase("brand"), 3600));
    timers.push(setTimeout(finish, 5400));
    return () => {
      timers.forEach(clearTimeout);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  const logoUrl = settings?.logo_id ? `${API_BASE}/settings/logo/${settings.logo_id}` : null;

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
                initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0,  filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -12, filter: "blur(4px)" }}
                transition={{ duration: 1.0, ease: "easeOut" }}
                className="text-white text-2xl sm:text-3xl md:text-5xl font-light tracking-[0.18em] drop-shadow-[0_2px_20px_rgba(255,255,255,0.35)]"
                style={{ fontFamily: "'Cormorant Garamond', 'Times New Roman', serif" }}
              >
                Bugün harika görünüyorsunuz.
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
                transition={{ duration: 0.6 }}
                className="flex flex-col items-center gap-5 md:gap-7"
              >
                {/* Logo */}
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1,   opacity: 1 }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  className="w-16 h-16 md:w-24 md:h-24 rounded-full border-2 border-[#d4af37] flex items-center justify-center bg-black overflow-hidden shadow-[0_0_60px_rgba(212,175,55,0.35)]"
                >
                  {logoUrl ? (
                    <img src={logoUrl} alt="Fotuber logo" className="w-full h-full object-cover" />
                  ) : (
                    <svg viewBox="0 0 40 40" className="w-9 h-9 md:w-12 md:h-12 text-[#d4af37]" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <rect x="6" y="12" width="28" height="20" rx="3" />
                      <circle cx="20" cy="22" r="6" />
                      <path d="M14 12 l3 -4 h6 l3 4" />
                    </svg>
                  )}
                </motion.div>

                {/* Wordmark */}
                <div className="flex flex-col items-center leading-none">
                  <motion.div
                    initial={{ opacity: 0, y: 24, letterSpacing: "0.4em" }}
                    animate={{ opacity: 1, y: 0,  letterSpacing: "0.02em" }}
                    transition={{ duration: 0.9, ease: "easeOut", delay: 0.15 }}
                    className="text-white text-6xl sm:text-7xl md:text-9xl font-black drop-shadow-[0_4px_30px_rgba(255,255,255,0.15)]"
                    style={{ fontFamily: "'Manrope','Helvetica Neue',Arial,sans-serif", fontWeight: 900, letterSpacing: "-0.02em" }}
                  >
                    Fotuber
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 22, scale: 0.85 }}
                    animate={{ opacity: 1, y: 0,  scale: 1 }}
                    transition={{ duration: 1.1, ease: "easeOut", delay: 0.55 }}
                    className="mt-4 md:mt-5 text-[#d4af37] text-4xl sm:text-5xl md:text-7xl italic drop-shadow-[0_2px_18px_rgba(212,175,55,0.55)]"
                    style={{
                      fontFamily: "'Great Vibes','Pinyon Script','Dancing Script','Segoe Script','Brush Script MT',cursive",
                      lineHeight: 1.1,
                    }}
                  >
                    Görsel Sanat
                  </motion.div>
                </div>

                {/* Tiny sub-label */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.7 }}
                  transition={{ duration: 0.8, delay: 1.15 }}
                  className="mt-2 text-[10px] md:text-xs tracking-[0.4em] uppercase text-neutral-400"
                >
                  fotuber.com.tr
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Flash overlay — white burst */}
        <AnimatePresence>
          {phase === "flash" && (
            <motion.div
              key="flash-white"
              className="pointer-events-none absolute inset-0 bg-white"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0.85, 0.35, 0] }}
              transition={{ duration: 1.05, times: [0, 0.06, 0.22, 0.55, 1], ease: "easeOut" }}
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
