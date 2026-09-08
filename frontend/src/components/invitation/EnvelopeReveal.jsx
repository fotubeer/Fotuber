import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const EASE = [0.76, 0, 0.24, 1];

// Cinematic digital envelope reveal. Plays once, then calls onDone.
// Tap anywhere to skip. Colors adapt to the active theme.
export default function EnvelopeReveal({ t, initials = "♥", label = "Davetiyeniz", onDone }) {
  const [stage, setStage] = useState(0); // 0 = sealed/loader, 1 = opening, 2 = leaving
  const [gone, setGone] = useState(false);

  const finish = () => {
    setStage(2);
    setTimeout(() => { setGone(true); onDone?.(); }, 700);
  };

  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 1250);   // start opening
    const t2 = setTimeout(() => finish(), 3600);       // auto complete
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accent = t.accent;
  const flapDark = t.dark;

  return (
    <AnimatePresence>
      {!gone && (
        <motion.div
          className="fixed inset-0 z-[70] grid place-items-center overflow-hidden"
          style={{ background: t.bg }}
          initial={{ opacity: 1 }}
          animate={{ opacity: stage === 2 ? 0 : 1 }}
          transition={{ duration: 0.6 }}
          onClick={finish}
          data-testid="envelope-reveal"
        >
          {/* Envelope */}
          <div className="relative" style={{ perspective: 1200 }}>
            <motion.div
              initial={{ y: 0, scale: 1, opacity: 1 }}
              animate={stage === 2 ? { y: -40, scale: 1.08, opacity: 0 } : { y: 0, opacity: 1 }}
              transition={{ duration: 0.7, ease: EASE }}
              className="relative"
              style={{ width: "min(78vw, 340px)", height: "min(52vw, 226px)" }}
            >
              {/* Body */}
              <div
                className="absolute inset-0 rounded-lg overflow-hidden"
                style={{
                  background: flapDark
                    ? "linear-gradient(160deg, #1c1c1c, #0b0b0b)"
                    : `linear-gradient(160deg, ${accent}22, ${accent}0d)`,
                  border: `1px solid ${accent}55`,
                  boxShadow: `0 30px 80px -20px ${accent}44`,
                }}
              >
                {/* Diagonal fold lines */}
                <div className="absolute inset-0" style={{
                  background: `linear-gradient(135deg, transparent 49.6%, ${accent}22 49.8%, ${accent}22 50.2%, transparent 50.4%),
                               linear-gradient(-135deg, transparent 49.6%, ${accent}22 49.8%, ${accent}22 50.2%, transparent 50.4%)`,
                }} />
              </div>

              {/* Card sliding out */}
              <motion.div
                className="absolute left-1/2 -translate-x-1/2 rounded-md grid place-items-center text-center px-4"
                style={{
                  width: "82%", height: "128%", bottom: "6%",
                  background: flapDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.9)",
                  backdropFilter: "blur(6px)",
                  border: `1px solid ${accent}44`,
                  boxShadow: `0 20px 60px -12px ${accent}55`,
                  zIndex: 5,
                }}
                initial={{ y: 0, opacity: 0 }}
                animate={stage >= 1 ? { y: "-58%", opacity: 1 } : { y: 0, opacity: 0 }}
                transition={{ delay: 0.55, duration: 1.1, ease: EASE }}
              >
                <div>
                  <div className="text-[10px] uppercase tracking-[0.35em] mb-2" style={{ color: t.sub, fontFamily: "'Montserrat', sans-serif" }}>
                    {label}
                  </div>
                  <div style={{ fontFamily: "'Great Vibes', cursive", color: accent, fontSize: "2.6rem", lineHeight: 1 }}>
                    {initials}
                  </div>
                  <div className="mx-auto mt-2 h-px w-10" style={{ background: accent }} />
                </div>
              </motion.div>

              {/* Top flap (rotates open) */}
              <motion.div
                className="absolute left-0 top-0 origin-top"
                style={{
                  width: 0, height: 0,
                  borderLeft: "min(39vw, 170px) solid transparent",
                  borderRight: "min(39vw, 170px) solid transparent",
                  borderTop: `min(28vw, 118px) solid ${flapDark ? "#161616" : accent}`,
                  transformStyle: "preserve-3d",
                  zIndex: 10,
                  filter: `drop-shadow(0 2px 6px ${accent}55)`,
                }}
                initial={{ rotateX: 0 }}
                animate={{ rotateX: stage >= 1 ? 180 : 0, zIndex: stage >= 1 ? 1 : 10 }}
                transition={{ duration: 1.0, ease: EASE }}
              />

              {/* Wax seal / monogram (pulses while sealed) */}
              <motion.div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full grid place-items-center"
                style={{
                  width: 62, height: 62, zIndex: 20,
                  background: `radial-gradient(circle at 35% 30%, ${accent}, ${accent}bb)`,
                  boxShadow: `0 6px 20px ${accent}88, inset 0 2px 6px rgba(255,255,255,0.35)`,
                  color: flapDark ? "#0b0b0b" : "#fff",
                  fontFamily: "'Great Vibes', cursive",
                  fontSize: "1.5rem",
                }}
                animate={stage === 0 ? { scale: [1, 1.09, 1] } : { scale: 0, opacity: 0 }}
                transition={stage === 0 ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.35 }}
              >
                {initials}
              </motion.div>
            </motion.div>

            {/* Caption */}
            <motion.div
              className="text-center mt-6"
              animate={{ opacity: stage === 0 ? 1 : 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className="text-xs tracking-[0.3em] uppercase" style={{ color: t.sub, fontFamily: "'Montserrat', sans-serif" }}>
                Davetiyeniz hazırlanıyor…
              </div>
              <div className="text-[10px] mt-2 opacity-70" style={{ color: t.sub }}>Açmak için dokunun</div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
