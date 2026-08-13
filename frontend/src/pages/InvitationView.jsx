import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { toast, Toaster } from "sonner";
import { Loader2, Send, MessageCircleHeart, Check, X, HelpCircle, Volume2, VolumeX, Gift } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { Button } from "@/components/ui/button";
import InvitationPreview from "@/components/invitation/InvitationPreview";
import TemplateReveal from "@/components/invitation/TemplateReveal";
import PhotoWall from "@/components/invitation/PhotoWall";
import { EVENT_TYPE_LABELS } from "@/lib/invitationThemes";
import { resolveVisual } from "@/lib/invitationTemplates";
import { loadGoogleFont } from "@/lib/designFonts";

const API = process.env.REACT_APP_BACKEND_URL;

const reveal = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: [0.25, 1, 0.5, 1] } },
};

export default function InvitationView() {
  const { slug } = useParams();
  const guestToken = new URLSearchParams(window.location.search).get("g") || "";
  const [loading, setLoading] = useState(true);
  const [inv, setInv] = useState(null);
  const [error, setError] = useState(null);
  const [memories, setMemories] = useState([]);
  const [rsvp, setRsvp] = useState({ name: "", surname: "", choice: "yes", guest_count: 1, note: "", menu: "standard", needs_transfer: false, companions: [] });
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: rsvp.name, surname: rsvp.surname, note: rsvp.note, guest_count: rsvp.guest_count, rsvp_choice: rsvp.choice, attending: rsvp.choice === "yes", guest_token: guestToken, menu: rsvp.menu, needs_transfer: rsvp.needs_transfer, companions: rsvp.companions.filter((c) => (c.name || "").trim()) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Gönderilemedi");
      setRsvpDone(true);
      if (d.checkin_token) setCheckinToken(d.checkin_token);
      toast.success("Yanıtınız alındı, teşekkürler!");
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  // Optional custom font chosen in the wizard — overrides theme script/heading everywhere.
  useEffect(() => {
    if (inv?.font_family) { try { loadGoogleFont(inv.font_family); } catch { /* ignore */ } }
  }, [inv?.font_family]);

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

  const t = resolveVisual(inv);
  if (inv.font_family) {
    const fam = `'${inv.font_family}', serif`;
    t.script = fam; t.heading = fam;
  }
  const nameScale = inv.name_scale || 1;
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
        <TemplateReveal t={t} eventLabel={EVENT_TYPE_LABELS[inv.event_type] || "Davetiye"}
          welcomeText={inv.welcome_text || ""}
          coverUrl={inv.cover_image_id ? `${API}/api/invitations/cover/${inv.cover_image_id}` : ""}
          names={inv.person2 ? `${inv.person1} & ${inv.person2}` : inv.person1}
          initials={initials} onDone={() => setOpened(true)} />
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
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => setRsvp({ ...rsvp, choice: "yes" })}
                      className="py-2.5 rounded-full text-xs font-semibold flex flex-col items-center justify-center gap-1 transition"
                      style={{ background: rsvp.choice === "yes" ? t.accent : "transparent", color: rsvp.choice === "yes" ? (t.dark ? "#0b0b0b" : "#fff") : t.text, border: `1px solid ${t.border}` }}
                      data-testid="rsvp-yes"><Check className="w-4 h-4" /> Katılacağım</button>
                    <button onClick={() => setRsvp({ ...rsvp, choice: "no" })}
                      className="py-2.5 rounded-full text-xs font-semibold flex flex-col items-center justify-center gap-1 transition"
                      style={{ background: rsvp.choice === "no" ? t.accent : "transparent", color: rsvp.choice === "no" ? (t.dark ? "#0b0b0b" : "#fff") : t.text, border: `1px solid ${t.border}` }}
                      data-testid="rsvp-no"><X className="w-4 h-4" /> Katılmayacağım</button>
                    <button onClick={() => setRsvp({ ...rsvp, choice: "maybe" })}
                      className="py-2.5 rounded-full text-xs font-semibold flex flex-col items-center justify-center gap-1 transition"
                      style={{ background: rsvp.choice === "maybe" ? t.accent : "transparent", color: rsvp.choice === "maybe" ? (t.dark ? "#0b0b0b" : "#fff") : t.text, border: `1px solid ${t.border}` }}
                      data-testid="rsvp-maybe"><HelpCircle className="w-4 h-4" /> Emin Değilim</button>
                  </div>
                  {rsvp.choice === "yes" && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs" style={{ color: t.sub }}>Kaç kişi geleceksiniz?</label>
                        <input type="number" min={1} max={30} value={rsvp.guest_count}
                          onChange={(e) => {
                            const n = Math.max(1, Math.min(30, parseInt(e.target.value || "1")));
                            const comps = Array.from({ length: n - 1 }, (_, i) => rsvp.companions[i] || { name: "", menu: "standard" });
                            setRsvp({ ...rsvp, guest_count: n, companions: comps });
                          }}
                          className="w-full py-2 text-sm outline-none mt-1" style={inputStyle} data-testid="rsvp-count" />
                      </div>
                      <div>
                        <label className="text-xs" style={{ color: t.sub }}>Menü tercihiniz</label>
                        <select value={rsvp.menu} onChange={(e) => setRsvp({ ...rsvp, menu: e.target.value })}
                          className="w-full py-2 text-sm outline-none mt-1" style={inputStyle} data-testid="rsvp-menu">
                          <option value="standard">Standart Menü</option>
                          <option value="vegetarian">Vejetaryen Menü</option>
                          <option value="child">Çocuk Menüsü</option>
                        </select>
                      </div>
                      {rsvp.companions.map((c, i) => (
                        <div key={i} className="grid grid-cols-2 gap-2" data-testid={`rsvp-companion-${i}`}>
                          <input placeholder={`${i + 2}. kişi adı`} value={c.name}
                            onChange={(e) => { const cs = [...rsvp.companions]; cs[i] = { ...cs[i], name: e.target.value }; setRsvp({ ...rsvp, companions: cs }); }}
                            className="py-2 text-sm outline-none placeholder:opacity-50" style={inputStyle} data-testid={`rsvp-companion-name-${i}`} />
                          <select value={c.menu}
                            onChange={(e) => { const cs = [...rsvp.companions]; cs[i] = { ...cs[i], menu: e.target.value }; setRsvp({ ...rsvp, companions: cs }); }}
                            className="py-2 text-sm outline-none" style={inputStyle} data-testid={`rsvp-companion-menu-${i}`}>
                            <option value="standard">Standart</option>
                            <option value="vegetarian">Vejetaryen</option>
                            <option value="child">Çocuk</option>
                          </select>
                        </div>
                      ))}
                      <label className="flex items-center gap-2 text-sm" style={{ color: t.text }} data-testid="rsvp-transfer-label">
                        <input type="checkbox" checked={rsvp.needs_transfer} onChange={(e) => setRsvp({ ...rsvp, needs_transfer: e.target.checked })} data-testid="rsvp-transfer" />
                        Transfer / servis istiyorum
                      </label>
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

          {inv.venue_gift && (
            <div data-testid="venue-gift-badge" className="flex items-center justify-center gap-2 mx-auto w-fit rounded-full px-4 py-1.5 text-xs"
              style={{ background: t.dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", border: `1px solid ${t.border}`, color: t.sub, fontFamily: "'Montserrat', sans-serif" }}>
              <Gift className="w-3.5 h-3.5" style={{ color: t.accent }} />
              <span>Bu davetiye <b style={{ color: t.accent }}>{inv.venue_gift}</b> hediyesidir</span>
            </div>
          )}

          <div className="text-center text-xs pt-4" style={{ color: t.sub }}>
            <span style={{ fontFamily: t.script, fontSize: "1.4rem", color: t.accent }}>Fotuber</span>
            <div className="mt-1 tracking-[0.2em] uppercase" style={{ fontFamily: "'Montserrat', sans-serif" }}>ile hazırlanmıştır · fotuber.com.tr</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
