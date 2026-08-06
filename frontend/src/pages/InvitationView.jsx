import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { toast, Toaster } from "sonner";
import { Loader2, Send, MessageCircleHeart, Check, X, Volume2, VolumeX } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { Button } from "@/components/ui/button";
import InvitationPreview from "@/components/invitation/InvitationPreview";
import EnvelopeReveal from "@/components/invitation/EnvelopeReveal";
import PhotoWall from "@/components/invitation/PhotoWall";
import { getTheme } from "@/lib/invitationThemes";

const API = process.env.REACT_APP_BACKEND_URL;

const reveal = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: [0.25, 1, 0.5, 1] } },
};

export default function InvitationView() {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [inv, setInv] = useState(null);
  const [error, setError] = useState(null);
  const [memories, setMemories] = useState([]);
  const [rsvp, setRsvp] = useState({ name: "", surname: "", attending: true, guest_count: 1, note: "" });
  const [mem, setMem] = useState({ name: "", message: "" });
  const [rsvpDone, setRsvpDone] = useState(false);
  const [checkinToken, setCheckinToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);

  const loadMemories = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/invitations/public/${slug}/memories`);
      if (r.ok) { const d = await r.json(); setMemories(d.memories || []); }
    } catch (e) { /* ignore */ }
  }, [slug]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/api/invitations/public/${slug}`);
        if (r.status === 410) { setError("Bu davetiyenin süresi dolmuştur."); return; }
        if (!r.ok) { setError("Davetiye bulunamadı."); return; }
        setInv(await r.json());
        loadMemories();
      } catch (e) { setError("Davetiye yüklenemedi."); }
      finally { setLoading(false); }
    })();
  }, [slug, loadMemories]);

  // Try to start music once the guest opens the envelope
  useEffect(() => {
    if (opened && audioRef.current) {
      audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }, [opened]);

  const toggleMusic = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play().then(() => setPlaying(true)).catch(() => {}); }
    else { a.pause(); setPlaying(false); }
  };

  const submitRsvp = async () => {
    if (!rsvp.name.trim() || !rsvp.surname.trim()) { toast.error("Lütfen ad ve soyadınızı girin"); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/invitations/public/${slug}/rsvp`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rsvp),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Gönderilemedi");
      setRsvpDone(true);
      if (d.checkin_token) setCheckinToken(d.checkin_token);
      toast.success("Yanıtınız alındı, teşekkürler!");
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const submitMemory = async () => {
    if (!mem.name.trim() || !mem.message.trim()) { toast.error("İsim ve mesaj gerekli"); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/invitations/public/${slug}/memory`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mem),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Gönderilemedi");
      setMem({ name: "", message: "" });
      toast.success("Anınız duvara eklendi");
      loadMemories();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-950 text-white"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (error) return (
    <div className="min-h-screen grid place-items-center bg-slate-950 text-white text-center px-6">
      <div><div className="text-4xl mb-3" style={{ fontFamily: "'Great Vibes', cursive" }}>Fotuber</div><p className="text-slate-300">{error}</p></div>
    </div>
  );

  const t = getTheme(inv.theme, inv.primary_color);
  const sections = inv.sections || {};
  const music = sections.music !== false && (inv.music_url || inv.greeting_audio_id);
  const musicSrc = inv.music_url || (inv.greeting_audio_id ? `${API}/api/invitations/audio/${inv.greeting_audio_id}` : null);
  const initials = `${(inv.person1 || "").trim()[0] || ""}${(inv.person2 || "").trim()[0] || ""}`.toUpperCase() || "♥";

  // Paper-style input classes (bottom border only, transparent bg)
  const inputStyle = { background: "transparent", borderBottom: `1px solid ${t.accent}66`, color: t.text };

  return (
    <div className="min-h-screen relative" style={{ background: t.bg }} data-testid="invitation-view">
      <Toaster position="top-center" richColors />

      {music && musicSrc && <audio ref={audioRef} src={musicSrc} loop preload="auto" />}

      {!opened && (
        <EnvelopeReveal t={t} initials={initials} label="Davetiyeniz" onDone={() => setOpened(true)} />
      )}

      {/* Music FAB */}
      {opened && music && musicSrc && (
        <button onClick={toggleMusic} data-testid="music-fab"
          className="fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full grid place-items-center shadow-lg"
          style={{ background: t.accent, color: t.dark ? "#0b0b0b" : "#fff" }} aria-label="Müzik">
          {playing ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>
      )}

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: opened ? 1 : 0 }} transition={{ duration: 0.8 }}>
        <InvitationPreview data={inv} />

        <div className="relative z-10 max-w-xl mx-auto px-6 pb-20 space-y-6" style={{ color: t.text }}>
          {/* RSVP */}
          {sections.rsvp !== false && (
            <motion.div variants={reveal} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }}
              className="rounded-2xl p-7" style={{ background: t.panel, border: `1px solid ${t.border}`, backdropFilter: "blur(10px)" }} data-testid="rsvp-card">
              <h3 className="text-2xl mb-1 text-center" style={{ fontFamily: t.heading, color: t.accent }}>Katılım Durumu · LCV</h3>
              <p className="text-xs mb-5 text-center" style={{ color: t.sub, fontFamily: "'Montserrat', sans-serif" }}>Onaylamak için ad ve soyadınız gereklidir.</p>
              {rsvpDone ? (
                <div className="text-center py-3">
                  <div className="flex items-center justify-center gap-2 text-sm" style={{ color: t.accent }}>
                    <Check className="w-4 h-4" /> Yanıtınız kaydedildi. Teşekkür ederiz!
                  </div>
                  {checkinToken && (
                    <div className="mt-4" data-testid="guest-checkin-qr">
                      <div className="inline-block bg-white p-2.5 rounded-xl shadow-lg">
                        <QRCodeCanvas value={`${window.location.origin}/gecis/${checkinToken}`} size={140} data-testid="guest-qr" />
                      </div>
                      <div className="text-xs mt-3" style={{ color: t.sub }}>🎟️ Girişte bu QR kodu görevliye gösterin.</div>
                      <a href={`/gecis/${checkinToken}`} target="_blank" rel="noreferrer" className="text-xs underline mt-1 inline-block" style={{ color: t.accent }} data-testid="guest-pass-link">Giriş kartımı aç →</a>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <input placeholder="Ad *" value={rsvp.name} onChange={(e) => setRsvp({ ...rsvp, name: e.target.value })}
                      className="py-2 text-sm outline-none placeholder:opacity-50" style={inputStyle} data-testid="rsvp-name" />
                    <input placeholder="Soyad *" value={rsvp.surname} onChange={(e) => setRsvp({ ...rsvp, surname: e.target.value })}
                      className="py-2 text-sm outline-none placeholder:opacity-50" style={inputStyle} data-testid="rsvp-surname" />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setRsvp({ ...rsvp, attending: true })}
                      className="flex-1 py-2.5 rounded-full text-sm font-medium flex items-center justify-center gap-1 transition"
                      style={{ background: rsvp.attending ? t.accent : "transparent", color: rsvp.attending ? (t.dark ? "#0b0b0b" : "#fff") : t.text, border: `1px solid ${t.border}` }}
                      data-testid="rsvp-yes"><Check className="w-4 h-4" /> Geliyorum</button>
                    <button onClick={() => setRsvp({ ...rsvp, attending: false })}
                      className="flex-1 py-2.5 rounded-full text-sm font-medium flex items-center justify-center gap-1 transition"
                      style={{ background: !rsvp.attending ? t.accent : "transparent", color: !rsvp.attending ? (t.dark ? "#0b0b0b" : "#fff") : t.text, border: `1px solid ${t.border}` }}
                      data-testid="rsvp-no"><X className="w-4 h-4" /> Gelemiyorum</button>
                  </div>
                  {rsvp.attending && (
                    <div>
                      <label className="text-xs" style={{ color: t.sub }}>Kaç kişi geleceksiniz?</label>
                      <input type="number" min={1} value={rsvp.guest_count}
                        onChange={(e) => setRsvp({ ...rsvp, guest_count: Math.max(1, parseInt(e.target.value || "1")) })}
                        className="w-full py-2 text-sm outline-none mt-1" style={inputStyle} data-testid="rsvp-count" />
                    </div>
                  )}
                  <textarea placeholder="Not (isteğe bağlı)" value={rsvp.note} onChange={(e) => setRsvp({ ...rsvp, note: e.target.value })} rows={2}
                    className="w-full py-2 text-sm outline-none resize-none placeholder:opacity-50" style={inputStyle} data-testid="rsvp-note" />
                  <Button onClick={submitRsvp} disabled={busy} className="w-full rounded-full h-11" style={{ background: t.accent, color: t.dark ? "#0b0b0b" : "#fff" }} data-testid="rsvp-submit">
                    {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />} Yanıtı Gönder
                  </Button>
                </div>
              )}
            </motion.div>
          )}

          {/* Memory / wish wall */}
          {sections.memories !== false && (
            <motion.div variants={reveal} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }}
              className="rounded-2xl p-7" style={{ background: t.panel, border: `1px solid ${t.border}`, backdropFilter: "blur(10px)" }} data-testid="memory-card">
              <h3 className="text-2xl mb-4 flex items-center justify-center gap-2 text-center" style={{ fontFamily: t.heading, color: t.accent }}>
                <MessageCircleHeart className="w-5 h-5" /> Anı & Dilek Duvarı
              </h3>
              <div className="space-y-4">
                <input placeholder="Adınız" value={mem.name} onChange={(e) => setMem({ ...mem, name: e.target.value })}
                  className="w-full py-2 text-sm outline-none placeholder:opacity-50" style={inputStyle} data-testid="memory-name" />
                <textarea placeholder="Dileğinizi / anınızı yazın..." value={mem.message} onChange={(e) => setMem({ ...mem, message: e.target.value })} rows={3}
                  className="w-full py-2 text-sm outline-none resize-none placeholder:opacity-50" style={inputStyle} data-testid="memory-message" />
                <Button onClick={submitMemory} disabled={busy} variant="outline" className="w-full rounded-full h-11"
                  style={{ borderColor: t.accent, color: t.accent, background: "transparent" }} data-testid="memory-submit">
                  Duvara Ekle
                </Button>
              </div>
              {memories.length > 0 && (
                <div className="mt-6 space-y-3">
                  {memories.map((m, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                      className="rounded-xl p-4" style={{ background: t.dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)", border: `1px solid ${t.border}` }}>
                      <div className="text-lg" style={{ color: t.accent, fontFamily: t.script }}>{m.name}</div>
                      <div className="text-sm mt-0.5" style={{ color: t.text }}>{m.message}</div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Live photo wall (premium) */}
          {sections.photowall && <PhotoWall slug={slug} t={t} />}

          <div className="text-center text-xs pt-4" style={{ color: t.sub }}>
            <span style={{ fontFamily: t.script, fontSize: "1.4rem", color: t.accent }}>Fotuber</span>
            <div className="mt-1 tracking-[0.2em] uppercase" style={{ fontFamily: "'Montserrat', sans-serif" }}>ile hazırlanmıştır · fotuber.com.tr</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
