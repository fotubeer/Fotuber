import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Info, PartyPopper, Megaphone, X } from "lucide-react";
import { studioApi } from "@/lib/studioApi";

const STYLE = {
  critical: { bar: "bg-red-600", ring: "border-red-400", Icon: AlertTriangle, pulse: true },
  update: { bar: "bg-orange-500", ring: "border-orange-300", Icon: Info, pulse: true },
  celebration: { bar: "bg-fuchsia-600", ring: "border-fuchsia-300", Icon: PartyPopper, pulse: false },
  general: { bar: "bg-blue-600", ring: "border-blue-300", Icon: Megaphone, pulse: false },
};

// Confetti-ish dots for celebration modal
function Confetti() {
  const bits = Array.from({ length: 24 });
  const cols = ["#f472b6", "#facc15", "#34d399", "#60a5fa", "#c084fc"];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      {bits.map((_, i) => (
        <motion.span key={i}
          initial={{ y: -20, x: (i * 37) % 320, opacity: 0 }}
          animate={{ y: 340, opacity: [0, 1, 1, 0], rotate: 360 }}
          transition={{ duration: 2.2 + (i % 5) * 0.3, repeat: Infinity, delay: (i % 6) * 0.2 }}
          style={{ position: "absolute", width: 8, height: 8, borderRadius: 2, background: cols[i % cols.length] }} />
      ))}
    </div>
  );
}

export default function StudioAnnouncements() {
  const [items, setItems] = useState([]);
  const [celebration, setCelebration] = useState(null);

  const load = useCallback(async () => {
    try {
      const rows = (await studioApi.get("/studio/announcements")).data?.announcements || [];
      setItems(rows.filter((r) => r.type !== "celebration"));
      const celeb = rows.find((r) => r.type === "celebration" && !r.acked);
      if (celeb) setCelebration(celeb);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 25000); return () => clearInterval(t); }, [load]);

  const ack = async (a, isCeleb) => {
    try { await studioApi.post(`/studio/announcements/${a.id}/ack`); } catch { /* ignore */ }
    if (isCeleb) setCelebration(null);
    else setItems((cur) => cur.filter((x) => x.id !== a.id || x.sticky));
    load();
  };

  return (
    <>
      {/* Top banners (critical / update / general) */}
      <div data-testid="studio-announcements" className="space-y-2">
        <AnimatePresence>
          {items.map((a) => {
            const s = STYLE[a.type] || STYLE.general;
            return (
              <motion.div key={a.id} data-testid={`studio-ann-${a.id}`}
                initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className={`rounded-xl text-white px-4 py-3 flex items-start gap-3 ${s.bar} ${s.pulse ? "animate-pulse" : ""}`}>
                <s.Icon size={18} className="mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{a.title}</div>
                  <div className="text-xs text-white/90 mt-0.5">{a.message}</div>
                </div>
                {a.dismissible && (
                  <button data-testid={`studio-ann-dismiss-${a.id}`} onClick={() => ack(a, false)}
                    className="text-white/80 hover:text-white text-xs font-medium flex items-center gap-1 shrink-0">
                    <X size={14} /> {a.sticky ? "Okudum" : "Kapat"}
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Celebration modal */}
      <AnimatePresence>
        {celebration && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" data-testid="studio-celebration">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md rounded-2xl bg-gradient-to-br from-fuchsia-600 via-purple-600 to-indigo-600 p-6 text-white text-center overflow-hidden">
              <Confetti />
              <PartyPopper size={40} className="mx-auto mb-3 relative" />
              <div className="text-xl font-bold relative">{celebration.title}</div>
              <p className="text-sm text-white/90 mt-2 relative">{celebration.message}</p>
              <button data-testid="studio-celebration-close" onClick={() => ack(celebration, true)}
                className="relative mt-5 px-5 h-10 rounded-full bg-white text-purple-700 font-semibold">
                Teşekkürler!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
