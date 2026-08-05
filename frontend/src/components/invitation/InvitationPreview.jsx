import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getTheme, EVENT_TYPE_LABELS } from "@/lib/invitationThemes";
import { CalendarDays, Clock, MapPin, Gift } from "lucide-react";
import InvitationMotifs from "@/components/invitation/InvitationMotifs";

const API = process.env.REACT_APP_BACKEND_URL;

const useCountdown = (dateStr, timeStr) => {
  const [left, setLeft] = useState({ d: 0, h: 0, m: 0, s: 0, done: false });
  useEffect(() => {
    if (!dateStr) return;
    const target = new Date(`${dateStr}T${timeStr || "12:00"}:00`).getTime();
    const tick = () => {
      const diff = target - Date.now();
      if (isNaN(target)) return;
      if (diff <= 0) { setLeft({ d: 0, h: 0, m: 0, s: 0, done: true }); return; }
      setLeft({
        d: Math.floor(diff / 86400000),
        h: Math.floor((diff % 86400000) / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
        done: false,
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dateStr, timeStr]);
  return left;
};

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.16, delayChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: [0.25, 1, 0.5, 1] } },
};

const CountBox = ({ v, label, t }) => (
  <div className="flex flex-col items-center">
    <div
      className="rounded-xl px-3 py-2.5 min-w-[62px] text-3xl tabular-nums"
      style={{
        background: t.dark ? "rgba(255,255,255,0.08)" : t.panel,
        border: `1px solid ${t.border}`,
        color: t.text,
        fontFamily: t.heading,
        backdropFilter: "blur(8px)",
        boxShadow: t.dark ? `0 8px 24px -12px ${t.accent}55` : "0 8px 20px -14px rgba(0,0,0,0.25)",
      }}
    >
      {String(v).padStart(2, "0")}
    </div>
    <span className="text-[10px] mt-1.5 tracking-[0.2em] uppercase" style={{ color: t.sub, fontFamily: "'Montserrat', sans-serif" }}>
      {label}
    </span>
  </div>
);

// Premium animated invitation card. Used in wizard preview + guest page.
export const InvitationPreview = ({ data }) => {
  const t = getTheme(data.theme, data.primary_color);
  const cd = useCountdown(data.event_date, data.event_time);
  const sections = data.sections || {};
  const names = data.person2 ? `${data.person1} & ${data.person2}` : data.person1;
  const prettyDate = data.event_date
    ? new Date(`${data.event_date}T00:00:00`).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" })
    : "Tarih";
  const cover = data.cover_image_id ? `${API}/api/invitations/cover/${data.cover_image_id}` : null;

  const shimmer = t.premium;

  return (
    <div className="relative w-full overflow-hidden" style={{ background: t.bg, color: t.text }} data-testid="invitation-preview">
      <InvitationMotifs t={t} />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 max-w-xl mx-auto px-6 pt-16 pb-12"
      >
        {/* Hero */}
        <div className="text-center min-h-[70vh] flex flex-col items-center justify-center">
          <motion.div variants={item} className="uppercase tracking-[0.45em] text-[11px] mb-6" style={{ color: t.accent, fontFamily: "'Montserrat', sans-serif" }}>
            {EVENT_TYPE_LABELS[data.event_type] || "Davetiye"}
          </motion.div>

          {cover && (
            <motion.div variants={item} className="mx-auto mb-8 w-44 h-44 rounded-full overflow-hidden"
              style={{ border: `2px solid ${t.accent}`, boxShadow: `0 0 0 8px ${t.accent}1a, 0 20px 50px -20px ${t.accent}66` }}>
              <img src={cover} alt="cover" className="w-full h-full object-cover" />
            </motion.div>
          )}

          <motion.div variants={item} className="text-sm mb-1" style={{ color: t.sub, fontFamily: t.heading, letterSpacing: "0.05em" }}>
            Sizleri aramızda görmekten mutluluk duyarız
          </motion.div>

          {shimmer ? (
            <motion.h1
              variants={item}
              className="leading-none mb-4"
              style={{
                fontFamily: t.script,
                fontSize: "clamp(3rem, 12vw, 5.5rem)",
                backgroundImage: `linear-gradient(100deg, ${t.accent} 0%, #ffffff 45%, ${t.accent} 90%)`,
                backgroundSize: "220% auto",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
              animate={{ backgroundPositionX: ["0%", "220%"] }}
              transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
            >
              {names || "İsimler"}
            </motion.h1>
          ) : (
            <motion.h1 variants={item} className="leading-none mb-4"
              style={{ fontFamily: t.script, fontSize: "clamp(3rem, 12vw, 5.5rem)", color: t.accent }}>
              {names || "İsimler"}
            </motion.h1>
          )}

          <motion.div variants={item} className="flex items-center justify-center gap-3 my-4">
            <span className="h-px w-10" style={{ background: t.accent, opacity: 0.5 }} />
            <span className="text-xs tracking-[0.3em] uppercase" style={{ color: t.sub, fontFamily: "'Montserrat', sans-serif" }}>{prettyDate}</span>
            <span className="h-px w-10" style={{ background: t.accent, opacity: 0.5 }} />
          </motion.div>

          {data.message && (
            <motion.p variants={item} className="text-base sm:text-lg max-w-md mx-auto mt-3 italic"
              style={{ color: t.sub, fontFamily: t.heading, lineHeight: 1.7 }}>
              “{data.message}”
            </motion.p>
          )}
        </div>

        {/* Countdown */}
        {sections.countdown !== false && (
          <motion.div variants={item} className="mt-4 mb-10">
            <div className="text-center text-[11px] tracking-[0.3em] uppercase mb-4" style={{ color: t.sub, fontFamily: "'Montserrat', sans-serif" }}>
              {cd.done ? "" : "Büyük güne kalan"}
            </div>
            <div className="flex items-center justify-center gap-3">
              {cd.done
                ? <div className="text-2xl" style={{ color: t.accent, fontFamily: t.script }}>Bugün büyük gün!</div>
                : <>
                    <CountBox v={cd.d} label="Gün" t={t} />
                    <CountBox v={cd.h} label="Saat" t={t} />
                    <CountBox v={cd.m} label="Dakika" t={t} />
                    <CountBox v={cd.s} label="Saniye" t={t} />
                  </>}
            </div>
          </motion.div>
        )}

        {/* Details — arch top card */}
        <motion.div variants={item} className="mt-8 rounded-[2rem] rounded-t-[6rem] p-8 space-y-4"
          style={{ background: t.panel, border: `1px solid ${t.border}`, backdropFilter: "blur(10px)", boxShadow: t.dark ? `0 30px 60px -30px ${t.accent}44` : "0 24px 50px -30px rgba(0,0,0,0.3)" }}>
          <div className="text-center mb-2">
            <div className="mx-auto w-10 h-10 rounded-full grid place-items-center mb-2" style={{ border: `1px solid ${t.accent}` }}>
              <CalendarDays className="w-5 h-5" style={{ color: t.accent }} />
            </div>
            <div className="text-xs tracking-[0.25em] uppercase" style={{ color: t.sub, fontFamily: "'Montserrat', sans-serif" }}>Tören Detayları</div>
          </div>
          <div className="flex items-center justify-center gap-3">
            <CalendarDays className="w-4 h-4" style={{ color: t.accent }} />
            <span className="text-base" style={{ fontFamily: t.heading }}>{prettyDate}</span>
          </div>
          {data.event_time && (
            <div className="flex items-center justify-center gap-3">
              <Clock className="w-4 h-4" style={{ color: t.accent }} />
              <span className="text-base" style={{ fontFamily: t.heading }}>{data.event_time}</span>
            </div>
          )}
          {data.venue_name && (
            <div className="text-center pt-1">
              <div className="flex items-center justify-center gap-2 mb-1">
                <MapPin className="w-4 h-4" style={{ color: t.accent }} />
                <span className="font-medium text-base" style={{ fontFamily: t.heading }}>{data.venue_name}</span>
              </div>
              {data.venue_address && <div className="text-sm" style={{ color: t.sub }}>{data.venue_address}</div>}
              {sections.map !== false && data.map_url && (
                <a href={data.map_url} target="_blank" rel="noreferrer"
                  className="inline-block mt-3 text-xs font-semibold px-5 py-2 rounded-full tracking-wide"
                  style={{ background: t.accent, color: t.dark ? "#0b0b0b" : "#fff" }} data-testid="invitation-map-link">
                  Haritada Gör
                </a>
              )}
            </div>
          )}
        </motion.div>

        {/* Gift (creator's IBAN) */}
        {sections.gift !== false && data.gift && data.gift.iban && (
          <motion.div variants={item} className="mt-6 rounded-2xl p-6"
            style={{ background: t.panel, border: `1px solid ${t.border}`, backdropFilter: "blur(10px)" }} data-testid="invitation-gift">
            <div className="flex items-center justify-center gap-2 mb-3" style={{ color: t.accent }}>
              <Gift className="w-5 h-5" /> <span className="font-medium tracking-wide" style={{ fontFamily: t.heading, fontSize: "1.15rem" }}>Hediye & Takı</span>
            </div>
            <div className="text-sm space-y-1.5 text-center">
              {data.gift.full_name && <div><span style={{ color: t.sub }}>Alıcı: </span>{data.gift.full_name}</div>}
              {data.gift.bank_name && <div><span style={{ color: t.sub }}>Banka: </span>{data.gift.bank_name}</div>}
              <div className="font-mono tracking-wide select-all text-base" style={{ color: t.text }}>{data.gift.iban}</div>
              {data.gift.note && <div style={{ color: t.sub }}>{data.gift.note}</div>}
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export default InvitationPreview;
