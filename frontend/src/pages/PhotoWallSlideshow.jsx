import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Images, Loader2, Settings, X, Volume2, VolumeX } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;
const REFRESH_MS = 15000;
const SPEEDS = [{ label: "Yavaş", ms: 10000 }, { label: "Normal", ms: 6000 }, { label: "Hızlı", ms: 4000 }];

// Full-screen live photo-wall slideshow — meant to be projected on a screen at
// the event. Auto-advances, refreshes to pick up new guest photos, Ken-Burns zoom.
export default function PhotoWallSlideshow() {
  const { slug } = useParams();
  const [photos, setPhotos] = useState([]);
  const [idx, setIdx] = useState(0);
  const [inv, setInv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [speed, setSpeed] = useState(() => Number(localStorage.getItem("fw_speed")) || 6000);
  const [musicOn, setMusicOn] = useState(() => localStorage.getItem("fw_music") === "1");
  const [showSettings, setShowSettings] = useState(false);
  const idxRef = useRef(0);
  const audioRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/invitations/public/${slug}/photos`);
      if (r.ok) { const d = await r.json(); setPhotos((d.photos || []).slice().reverse()); }
    } catch (e) { /* ignore */ }
  }, [slug]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/api/invitations/public/${slug}`);
        if (r.ok) setInv(await r.json());
      } catch (e) { /* ignore */ }
      await load();
      setLoading(false);
    })();
    const ref = setInterval(load, REFRESH_MS);
    return () => clearInterval(ref);
  }, [slug, load]);

  useEffect(() => {
    if (photos.length === 0) return;
    const adv = setInterval(() => {
      idxRef.current = (idxRef.current + 1) % photos.length;
      setIdx(idxRef.current);
    }, speed);
    return () => clearInterval(adv);
  }, [photos.length, speed]);

  // Music control
  const musicSrc = inv ? (inv.music_url || (inv.greeting_audio_id ? `${API}/api/invitations/audio/${inv.greeting_audio_id}` : null)) : null;
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (musicOn) { a.play().catch(() => {}); } else { a.pause(); }
  }, [musicOn, musicSrc]);

  const chooseSpeed = (ms) => { setSpeed(ms); localStorage.setItem("fw_speed", String(ms)); };
  const toggleMusic = () => { setMusicOn((v) => { localStorage.setItem("fw_music", v ? "0" : "1"); return !v; }); };

  const names = inv ? (inv.person2 ? `${inv.person1} & ${inv.person2}` : inv.person1) : "";
  const current = photos[idx];

  if (loading) return <div className="fixed inset-0 grid place-items-center bg-black text-white"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="fixed inset-0 bg-black overflow-hidden" data-testid="photowall-slideshow">
      {photos.length === 0 ? (
        <div className="absolute inset-0 grid place-items-center text-center text-white/80 px-8">
          <div>
            <Images className="w-14 h-14 mx-auto mb-4 opacity-60" />
            <div className="text-3xl mb-2" style={{ fontFamily: "'Great Vibes', cursive" }}>{names}</div>
            <p className="text-lg">Misafirlerin fotoğrafları burada canlı akacak…</p>
            <p className="text-sm text-white/50 mt-2">Davetiyedeki “Fotoğraf Yükle” ile paylaşılan kareler otomatik görünür.</p>
          </div>
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          <motion.div
            key={current?.id}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1 }}
          >
            <motion.img
              src={`${API}/api/invitations/photo/${current.id}`}
              alt={current.uploader_name || "Anı"}
              className="w-full h-full object-contain"
              initial={{ scale: 1.04 }}
              animate={{ scale: 1.14 }}
              transition={{ duration: speed / 1000 + 1, ease: "linear" }}
            />
            {/* blurred backdrop fill */}
            <img src={`${API}/api/invitations/photo/${current.id}`} alt="" aria-hidden
              className="absolute inset-0 w-full h-full object-cover -z-10 opacity-40 blur-2xl scale-110" />
          </motion.div>
        </AnimatePresence>
      )}

      {/* Header / footer overlays */}
      <div className="absolute top-0 inset-x-0 p-6 bg-gradient-to-b from-black/70 to-transparent">
        <div className="text-center text-[#e9c96e]" style={{ fontFamily: "'Great Vibes', cursive", fontSize: "2rem" }}>{names}</div>
      </div>
      {current?.uploader_name && (
        <div className="absolute bottom-0 inset-x-0 p-6 bg-gradient-to-t from-black/70 to-transparent">
          <div className="text-center text-white/90 text-lg" style={{ fontFamily: "'Cormorant Garamond', serif" }}>📷 {current.uploader_name}</div>
        </div>
      )}
      {photos.length > 1 && (
        <div className="absolute bottom-3 right-4 text-white/50 text-xs">{idx + 1} / {photos.length}</div>
      )}

      {musicSrc && <audio ref={audioRef} src={musicSrc} loop preload="auto" />}

      <button onClick={() => setShowSettings((s) => !s)} className="absolute top-4 right-4 z-20 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur grid place-items-center text-white" data-testid="slideshow-settings-btn">
        <Settings className="w-5 h-5" />
      </button>

      {showSettings && (
        <div className="absolute top-16 right-4 z-20 w-60 rounded-2xl bg-black/80 backdrop-blur border border-white/10 p-4 text-white" data-testid="slideshow-settings-panel">
          <div className="flex items-center justify-between mb-3"><span className="text-sm font-semibold">Slayt Ayarları</span><button onClick={() => setShowSettings(false)}><X className="w-4 h-4" /></button></div>
          <div className="text-xs text-white/60 mb-1">Geçiş Hızı</div>
          <div className="grid grid-cols-3 gap-1 mb-4">
            {SPEEDS.map((s) => (
              <button key={s.ms} onClick={() => chooseSpeed(s.ms)} className={`py-1.5 rounded-lg text-xs transition ${speed === s.ms ? "bg-[#e9c96e] text-black font-semibold" : "bg-white/10 hover:bg-white/20"}`} data-testid={`slideshow-speed-${s.ms}`}>{s.label}</button>
            ))}
          </div>
          <button onClick={toggleMusic} disabled={!musicSrc} className={`w-full py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition ${musicOn ? "bg-[#e9c96e] text-black font-semibold" : "bg-white/10 hover:bg-white/20"} disabled:opacity-40`} data-testid="slideshow-music-toggle">
            {musicOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />} {musicSrc ? (musicOn ? "Müzik Açık" : "Müzik Kapalı") : "Müzik yok"}
          </button>
        </div>
      )}
    </div>
  );
}
