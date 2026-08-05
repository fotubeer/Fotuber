import React, { useEffect, useState } from "react";
import { getTheme, EVENT_TYPE_LABELS } from "@/lib/invitationThemes";
import { CalendarDays, Clock, MapPin, Gift, Heart } from "lucide-react";

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
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLeft({ d, h, m, s, done: false });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dateStr, timeStr]);
  return left;
};

const CountBox = ({ v, label, t }) => (
  <div className="flex flex-col items-center">
    <div className="rounded-xl px-3 py-2 min-w-[58px] text-2xl font-bold tabular-nums"
      style={{ background: t.panel, border: `1px solid ${t.border}`, color: t.text }}>
      {String(v).padStart(2, "0")}
    </div>
    <span className="text-[11px] mt-1 tracking-wide" style={{ color: t.sub }}>{label}</span>
  </div>
);

// Presentational invitation card. Used both in the wizard preview and the guest page.
export const InvitationPreview = ({ data }) => {
  const t = getTheme(data.theme, data.primary_color);
  const cd = useCountdown(data.event_date, data.event_time);
  const sections = data.sections || {};
  const names = data.person2 ? `${data.person1} & ${data.person2}` : data.person1;
  const prettyDate = data.event_date
    ? new Date(`${data.event_date}T00:00:00`).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" })
    : "Tarih";
  const cover = data.cover_image_id ? `${API}/api/invitations/cover/${data.cover_image_id}` : null;

  return (
    <div className="w-full" style={{ background: t.bg, color: t.text }} data-testid="invitation-preview">
      <div className="max-w-xl mx-auto px-5 py-10">
        {/* Hero */}
        <div className="text-center">
          <div className="uppercase tracking-[0.4em] text-xs mb-4" style={{ color: t.accent }}>
            {EVENT_TYPE_LABELS[data.event_type] || "Davetiye"}
          </div>
          {cover && (
            <div className="mx-auto mb-6 w-40 h-40 rounded-full overflow-hidden shadow-lg" style={{ border: `3px solid ${t.accent}` }}>
              <img src={cover} alt="cover" className="w-full h-full object-cover" />
            </div>
          )}
          <Heart className="w-6 h-6 mx-auto mb-3" style={{ color: t.accent }} fill={t.accent} />
          <h1 className="text-4xl sm:text-5xl leading-tight mb-3" style={{ fontFamily: t.heading }}>
            {names || "İsimler"}
          </h1>
          {data.message && <p className="text-sm sm:text-base max-w-md mx-auto" style={{ color: t.sub }}>{data.message}</p>}
        </div>

        {/* Countdown */}
        {sections.countdown !== false && (
          <div className="mt-8 flex items-center justify-center gap-3">
            {cd.done
              ? <div className="text-lg" style={{ color: t.accent }}>Bugün büyük gün! 🎉</div>
              : <>
                  <CountBox v={cd.d} label="Gün" t={t} />
                  <CountBox v={cd.h} label="Saat" t={t} />
                  <CountBox v={cd.m} label="Dakika" t={t} />
                  <CountBox v={cd.s} label="Saniye" t={t} />
                </>}
          </div>
        )}

        {/* Details */}
        <div className="mt-8 rounded-2xl p-5 space-y-3" style={{ background: t.panel, border: `1px solid ${t.border}` }}>
          <div className="flex items-center gap-3">
            <CalendarDays className="w-5 h-5" style={{ color: t.accent }} />
            <span className="text-sm">{prettyDate}</span>
          </div>
          {data.event_time && (
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5" style={{ color: t.accent }} />
              <span className="text-sm">{data.event_time}</span>
            </div>
          )}
          {data.venue_name && (
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 mt-0.5" style={{ color: t.accent }} />
              <div className="text-sm">
                <div className="font-medium">{data.venue_name}</div>
                {data.venue_address && <div style={{ color: t.sub }}>{data.venue_address}</div>}
                {sections.map !== false && data.map_url && (
                  <a href={data.map_url} target="_blank" rel="noreferrer"
                    className="inline-block mt-2 text-xs font-semibold px-3 py-1.5 rounded-full"
                    style={{ background: t.accent, color: "#fff" }} data-testid="invitation-map-link">
                    Haritada Gör
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Gift (creator's IBAN) */}
        {sections.gift !== false && data.gift && data.gift.iban && (
          <div className="mt-5 rounded-2xl p-5" style={{ background: t.panel, border: `1px solid ${t.border}` }} data-testid="invitation-gift">
            <div className="flex items-center gap-2 mb-2" style={{ color: t.accent }}>
              <Gift className="w-5 h-5" /> <span className="font-semibold">Hediye / Takı</span>
            </div>
            <div className="text-sm space-y-1">
              {data.gift.full_name && <div><span style={{ color: t.sub }}>Alıcı: </span>{data.gift.full_name}</div>}
              {data.gift.bank_name && <div><span style={{ color: t.sub }}>Banka: </span>{data.gift.bank_name}</div>}
              <div className="font-mono tracking-wide select-all">{data.gift.iban}</div>
              {data.gift.note && <div style={{ color: t.sub }}>{data.gift.note}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InvitationPreview;
