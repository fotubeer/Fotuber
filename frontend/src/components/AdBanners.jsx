import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE } from "@/lib/api";

const BE = process.env.REACT_APP_BACKEND_URL;

// Admin-managed clickable image/GIF ad banners. Mobile-friendly, rectangular.
export default function AdBanners({ placement, className = "", dark = false }) {
  const [banners, setBanners] = useState([]);
  const seen = React.useRef(new Set());

  useEffect(() => {
    axios.get(`${API_BASE}/ad-banners`, { params: { placement } })
      .then((r) => setBanners(r.data || []))
      .catch(() => setBanners([]));
  }, [placement]);

  const trackImpression = (id, el) => {
    if (!el || seen.current.has(id)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !seen.current.has(id)) {
          seen.current.add(id);
          axios.post(`${API_BASE}/ad-banners/${id}/impression`).catch(() => {});
          io.disconnect();
        }
      });
    }, { threshold: 0.5 });
    io.observe(el);
  };

  const onClick = (b) => {
    axios.post(`${API_BASE}/ad-banners/${b.id}/click`).catch(() => {});
    if (b.target_url) window.open(b.target_url, "_blank", "noopener");
  };

  if (banners.length === 0) return null;

  return (
    <div data-testid={`ad-banners-${placement}`} className={`w-full flex flex-col items-center gap-3 ${className}`}>
      {banners.map((b) => (
        <button key={b.id} data-testid={`ad-banner-${b.id}`} ref={(el) => trackImpression(b.id, el)} onClick={() => onClick(b)}
          className={`group block w-full ${b.orientation === "vertical" ? "max-w-[220px]" : "max-w-4xl"} ${b.target_url ? "cursor-pointer" : "cursor-default"}`}
          title={b.title || "Reklam"}>
          <span className="sr-only">{b.title || "Reklam"}</span>
          {b.media_type === "video" ? (
            <video src={`${BE}${b.image_url}`} muted loop playsInline autoPlay preload="metadata"
              className={`w-full h-auto rounded-xl border ${dark ? "border-white/10" : "border-slate-200"} shadow-sm transition-transform duration-300 group-hover:scale-[1.01]`} />
          ) : (
            <img src={`${BE}${b.image_url}`} alt={b.title || "Reklam"} loading="lazy"
              className={`w-full h-auto rounded-xl border ${dark ? "border-white/10" : "border-slate-200"} shadow-sm transition-transform duration-300 group-hover:scale-[1.01]`} />
          )}
          <span className={`block text-[10px] mt-1 ${dark ? "text-white/30" : "text-slate-400"}`}>Reklam</span>
        </button>
      ))}
    </div>
  );
}
