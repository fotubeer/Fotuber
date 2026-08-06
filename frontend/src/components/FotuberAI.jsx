import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Camera, MessageCircle, ExternalLink, Loader2 } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useSettings } from "@/context/SettingsContext";
import { Link } from "react-router-dom";

const STORAGE_KEY = "fotuber_ai_session_v1";
const HISTORY_KEY = "fotuber_ai_history_v1";

const genSessionId = () => `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

// Turn internal path tokens inside assistant text into clickable Links
const INTERNAL_LINKS = {
  "/altin-saat": "Altın Saat Aracı",
  "/randevu": "Randevu Al",
  "/davetiye-olustur": "Davetiye Oluştur",
};
const renderAssistantContent = (text) => {
  const parts = String(text || "").split(/(\/altin-saat|\/davetiye-olustur|\/randevu)/g);
  return parts.map((p, i) =>
    INTERNAL_LINKS[p] ? (
      <Link
        key={i}
        to={p}
        className="inline-flex items-center gap-1 font-semibold text-[#d4af37] underline decoration-[#d4af37]/50 underline-offset-2 hover:decoration-[#d4af37]"
      >
        {INTERNAL_LINKS[p]} <ExternalLink className="w-3 h-3" />
      </Link>
    ) : (
      <span key={i}>{p}</span>
    )
  );
};

const CameraBot = ({ animated = true }) => (
  <motion.svg
    viewBox="0 0 100 100"
    className="w-full h-full"
    animate={animated ? { rotate: [0, -3, 3, 0] } : {}}
    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
  >
    <defs>
      <linearGradient id="body-grad" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#1a1a1a" />
        <stop offset="1" stopColor="#0a0a0a" />
      </linearGradient>
      <radialGradient id="eye-grad" cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#fff8d6" />
        <stop offset="0.35" stopColor="#d4af37" />
        <stop offset="1" stopColor="#3a2a08" />
      </radialGradient>
    </defs>
    {/* Body */}
    <rect x="14" y="30" width="72" height="52" rx="10" fill="url(#body-grad)" stroke="#d4af37" strokeWidth="1.5" />
    {/* Top viewfinder hump */}
    <path d="M32 30 L34 22 L66 22 L68 30 Z" fill="#0a0a0a" stroke="#d4af37" strokeWidth="1.2" />
    {/* Flash */}
    <rect x="22" y="34" width="10" height="6" rx="1.5" fill="#d4af37" opacity="0.9" />
    {/* Lens (eye) */}
    <circle cx="50" cy="58" r="18" fill="#000" stroke="#d4af37" strokeWidth="1.5" />
    {/* Blinking eyelid — collapses to a slit every few seconds */}
    <motion.g
      animate={animated ? { scaleY: [1, 1, 1, 1, 0.06, 1, 1, 1, 0.06, 1] } : {}}
      transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", times: [0, 0.15, 0.30, 0.45, 0.48, 0.51, 0.65, 0.80, 0.83, 0.86] }}
      style={{ transformOrigin: "50px 58px", transformBox: "fill-box" }}
    >
      <circle cx="50" cy="58" r="14" fill="url(#eye-grad)" />
      <motion.circle
        cx="50" cy="58" r="6" fill="#0a0a0a"
        animate={animated ? { cx: [50, 52, 48, 50], cy: [58, 57, 59, 58] } : {}}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      <circle cx="46" cy="54" r="2" fill="#fff" opacity="0.85" />
    </motion.g>
    {/* Recording light */}
    <motion.circle
      cx="76" cy="38" r="2.2" fill="#f43f5e"
      animate={animated ? { opacity: [0.4, 1, 0.4] } : {}}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
    />
    {/* Antenna */}
    <line x1="50" y1="22" x2="50" y2="14" stroke="#d4af37" strokeWidth="1.5" />
    <circle cx="50" cy="12" r="2.5" fill="#d4af37" />
  </motion.svg>
);

// SVG waving hand — device-independent, matches gold accent
const WavingHand = ({ className = "" }) => (
  <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="skin-grad" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#f5d3a3" />
        <stop offset="1" stopColor="#e2a870" />
      </linearGradient>
    </defs>
    {/* Sleeve cuff */}
    <path d="M18 50 L46 50 L48 60 L16 60 Z" fill="#d4af37" stroke="#0a0a0a" strokeWidth="1.4" />
    {/* Palm */}
    <path
      d="M22 22
         C 20 18, 24 14, 28 16
         L 30 26
         L 32 12
         C 32 8, 38 8, 38 12
         L 38 26
         L 40 10
         C 40 6, 46 6, 46 10
         L 46 28
         L 48 16
         C 48 12, 54 12, 54 16
         L 54 34
         C 54 44, 48 52, 40 52
         L 28 52
         C 22 52, 18 46, 18 40
         L 18 26
         C 18 22, 22 20, 22 22 Z"
      fill="url(#skin-grad)"
      stroke="#8a5a2a"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    {/* Palm crease highlight */}
    <path d="M28 38 Q34 46 44 40" fill="none" stroke="#c68a4d" strokeWidth="1" opacity="0.6" />
  </svg>
);

const FotuberAI = () => {
  const { settings } = useSettings();
  const enabled = settings?.ai_enabled !== false;
  const bubbleText = settings?.ai_bubble_text || "Fotuber yapay zekaya sor ve öğren";
  const welcome = settings?.ai_welcome_message || "Merhaba! Ben Fotuber Asistan. Nasıl yardımcı olabilirim?";
  const defaultCity = settings?.ai_default_city || "Çankırı";

  const [open, setOpen] = useState(false);
  const [bubbleVisible, setBubbleVisible] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState(() => {
    try {
      const raw = sessionStorage.getItem(HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && parsed.length) return parsed;
    } catch (_) {}
    return [{ role: "assistant", content: welcome, id: "welcome" }];
  });
  const [city, setCity] = useState(defaultCity);
  const [eventDate, setEventDate] = useState("");
  const [sessionId] = useState(() => {
    try {
      const existing = sessionStorage.getItem(STORAGE_KEY);
      if (existing) return existing;
    } catch (_) {}
    const nid = genSessionId();
    try { sessionStorage.setItem(STORAGE_KEY, nid); } catch (_) {}
    return nid;
  });
  const listRef = useRef(null);

  // Hide bubble after 12s so it doesn't distract
  useEffect(() => {
    const t = setTimeout(() => setBubbleVisible(false), 12000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-40))); } catch (_) {}
  }, [messages]);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [open, messages]);

  // Cross-navigation: other pages (e.g. Golden Hour) can open + prefill the assistant
  useEffect(() => {
    const handler = (e) => {
      const d = e.detail || {};
      if (d.city) setCity(d.city);
      if (d.date) setEventDate(d.date);
      setOpen(true);
      setBubbleVisible(false);
    };
    window.addEventListener("fotuber-ai-open", handler);
    return () => window.removeEventListener("fotuber-ai-open", handler);
  }, []);

  if (!enabled) return null;

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    const userMsg = { id: `u-${Date.now()}`, role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    try {
      const { data } = await api.post("/ai/chat", {
        session_id: sessionId,
        message: text,
        city: city || null,
        event_date: eventDate || null,
      });
      setMessages((m) => [...m, { id: `a-${Date.now()}`, role: "assistant", content: data.reply }]);
    } catch (e) {
      setMessages((m) => [...m, { id: `err-${Date.now()}`, role: "assistant", content: `Bir aksilik oldu: ${formatApiError(e)}. Lütfen biraz sonra tekrar deneyin.` }]);
    } finally { setSending(false); }
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // Simple event-type detection to prefill booking link
  const detectEventType = () => {
    const s = messages.map((m) => m.content).join(" ").toLowerCase();
    if (s.includes("düğün")) return "wedding";
    if (s.includes("nişan evi") || s.includes("nişanevi")) return "engagement_venue";
    if (s.includes("nişan")) return "engagement";
    if (s.includes("kına")) return "kina";
    if (s.includes("bride party") || s.includes("bekarlığa veda")) return "bride_party";
    if (s.includes("doğum günü")) return "birthday";
    if (s.includes("stüdyo") || s.includes("portre")) return "studio_portrait";
    return "";
  };
  const eventType = detectEventType();
  const bookingHref = `/randevu${eventType ? `?event_type=${eventType}` : ""}${eventDate ? `${eventType ? "&" : "?"}date=${eventDate}` : ""}`;

  return (
    <>
      {/* Floating button + bubble */}
      <AnimatePresence>
        {!open && (
          <motion.div
            key="fab"
            initial={{ opacity: 0, y: 40, scale: 0.6 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.6 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="fixed z-[60] right-4 sm:right-6 flex items-end gap-2 pointer-events-none"
            style={{ bottom: "11rem" }}
            data-testid="ai-fab-wrap"
          >
            {/* Speech bubble */}
            <AnimatePresence>
              {bubbleVisible && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                  className="pointer-events-auto relative max-w-[220px] rounded-2xl bg-white text-black px-4 py-3 text-xs sm:text-sm font-medium shadow-2xl border border-neutral-200"
                >
                  <div className="text-[10px] uppercase tracking-[0.25em] text-[#d4af37] mb-1">Fotuber Asistan</div>
                  {bubbleText}
                  <button
                    onClick={() => setBubbleVisible(false)}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-neutral-300 flex items-center justify-center hover:bg-neutral-100"
                    aria-label="Balonu kapat"
                    data-testid="ai-bubble-close"
                  >
                    <X className="w-3.5 h-3.5 text-neutral-500" />
                  </button>
                  {/* Little pulse dots */}
                  <motion.div
                    className="absolute -bottom-1 -right-1 flex gap-0.5"
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#d4af37]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#d4af37] opacity-70" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#d4af37] opacity-40" />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Robot camera button with jumping animation + waving hand peek */}
            <button
              onClick={() => { setOpen(true); setBubbleVisible(false); }}
              className="pointer-events-auto relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-black border border-[#d4af37]/60 hover:border-[#d4af37] shadow-[0_0_35px_rgba(212,175,55,0.35)] hover:shadow-[0_0_60px_rgba(212,175,55,0.55)] transition-shadow"
              data-testid="ai-open-btn"
              aria-label="Fotuber Asistan'ı aç"
            >
              {/* Jumping robot */}
              <motion.div
                animate={{
                  y: [0, -14, 0, -6, 0, 0, 0, 0, 0, 0],
                  scaleY: [1, 1, 0.92, 1, 1, 1, 1, 1, 1, 1],
                }}
                transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", times: [0, 0.08, 0.16, 0.22, 0.30, 0.40, 0.55, 0.70, 0.85, 1] }}
                className="w-full h-full p-1"
              >
                <CameraBot />
              </motion.div>

              {/* Waving hand SVG — device-independent (peeks from left every ~5s) */}
              <motion.div
                initial={{ opacity: 0, x: 0, rotate: 0 }}
                animate={{
                  opacity: [0, 0, 1, 1, 1, 1, 0, 0],
                  x:       [0, 0, -22, -22, -22, -22, -8, 0],
                  rotate:  [0, 0, -22, 16, -22, 16, 0, 0],
                }}
                transition={{
                  duration: 5.2,
                  repeat: Infinity,
                  repeatDelay: 3,
                  times: [0, 0.15, 0.25, 0.40, 0.55, 0.70, 0.85, 1],
                  ease: "easeInOut",
                }}
                style={{ transformOrigin: "80% 90%" }}
                className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none w-8 h-8 sm:w-10 sm:h-10 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]"
                aria-hidden="true"
              >
                <WavingHand className="w-full h-full" />
              </motion.div>

              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-black">
                <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="fixed z-[60] right-3 left-3 sm:left-auto sm:right-6 bottom-3 sm:bottom-6 w-auto sm:w-[420px] max-h-[85vh] bg-neutral-950 border border-neutral-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
            data-testid="ai-panel"
          >
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-neutral-800 bg-gradient-to-r from-neutral-950 via-black to-neutral-950">
              <div className="w-11 h-11 shrink-0 bg-black border border-[#d4af37]/50 rounded-xl p-1">
                <CameraBot />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white font-serif text-lg leading-tight">Fotuber Asistan</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Çevrimiçi
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 flex items-center justify-center transition-colors"
                data-testid="ai-close-btn"
                aria-label="Kapat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Context row: city + date */}
            <div className="grid grid-cols-2 gap-2 px-3 pt-3">
              <div>
                <label className="text-[9px] uppercase tracking-[0.2em] text-neutral-500 block mb-1">Şehir</label>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder={defaultCity}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-neutral-600 focus:border-[#d4af37]/50 focus:outline-none"
                  data-testid="ai-city-input"
                />
              </div>
              <div>
                <label className="text-[9px] uppercase tracking-[0.2em] text-neutral-500 block mb-1">Etkinlik Tarihi</label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-white focus:border-[#d4af37]/50 focus:outline-none"
                  data-testid="ai-date-input"
                />
              </div>
            </div>

            {/* Messages */}
            <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[280px]" data-testid="ai-msg-list">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-[#d4af37] text-black rounded-br-sm"
                      : "bg-neutral-900 text-neutral-100 border border-neutral-800 rounded-bl-sm"
                  }`}>
                    {m.role === "assistant" && (
                      <div className="text-[9px] uppercase tracking-[0.2em] text-[#d4af37] mb-1 flex items-center gap-1">
                        <Camera className="w-2.5 h-2.5" /> Fotuber Asistan
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{m.role === "assistant" ? renderAssistantContent(m.content) : m.content}</div>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start" data-testid="ai-thinking">
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-neutral-400 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> düşünüyor...
                  </div>
                </div>
              )}
            </div>

            {/* Book CTA — shows once assistant has replied at least once */}
            {messages.length >= 3 && (
              <div className="px-4 pb-2">
                <Link to={bookingHref}>
                  <div className="rounded-xl bg-[#d4af37]/10 border border-[#d4af37]/40 hover:border-[#d4af37] px-3 py-2 flex items-center justify-between transition-colors group cursor-pointer">
                    <div className="text-xs text-neutral-200">
                      <div className="text-[#d4af37] font-medium">Şimdi randevu al</div>
                      <div className="text-[10px] text-neutral-500">Detayları yüz yüze konuşalım</div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-[#d4af37] group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </Link>
              </div>
            )}

            {/* Input */}
            <div className="border-t border-neutral-800 p-3 flex items-end gap-2 bg-neutral-950">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder="Bir soru sorun..."
                rows={1}
                className="flex-1 resize-none bg-neutral-900 border border-neutral-800 rounded-2xl px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-[#d4af37]/60 focus:outline-none max-h-32"
                data-testid="ai-input"
              />
              <button
                onClick={send}
                disabled={!input.trim() || sending}
                className="shrink-0 w-10 h-10 rounded-full bg-[#d4af37] hover:bg-[#b5952f] disabled:bg-neutral-800 disabled:text-neutral-600 text-black flex items-center justify-center transition-colors"
                data-testid="ai-send-btn"
                aria-label="Gönder"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default FotuberAI;
