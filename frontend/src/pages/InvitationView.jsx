import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast, Toaster } from "sonner";
import { Loader2, Send, MessageCircleHeart, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import InvitationPreview from "@/components/invitation/InvitationPreview";
import { getTheme } from "@/lib/invitationThemes";

const API = process.env.REACT_APP_BACKEND_URL;

export default function InvitationView() {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [inv, setInv] = useState(null);
  const [error, setError] = useState(null);
  const [memories, setMemories] = useState([]);
  const [rsvp, setRsvp] = useState({ name: "", surname: "", attending: true, guest_count: 1, note: "" });
  const [mem, setMem] = useState({ name: "", message: "" });
  const [rsvpDone, setRsvpDone] = useState(false);
  const [busy, setBusy] = useState(false);

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
      toast.success("Anınız duvara eklendi 💛");
      loadMemories();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-950 text-white"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (error) return (
    <div className="min-h-screen grid place-items-center bg-slate-950 text-white text-center px-6">
      <div><div className="text-2xl mb-2">💌</div><p>{error}</p></div>
    </div>
  );

  const t = getTheme(inv.theme, inv.primary_color);
  const sections = inv.sections || {};

  return (
    <div className="min-h-screen" style={{ background: t.bg }} data-testid="invitation-view">
      <Toaster position="top-center" richColors />
      {sections.music !== false && inv.music_url && (
        <audio src={inv.music_url} autoPlay loop />
      )}
      <InvitationPreview data={inv} />

      <div className="max-w-xl mx-auto px-5 pb-16 space-y-6" style={{ color: t.text }}>
        {/* RSVP — name & surname required */}
        {sections.rsvp !== false && (
          <div className="rounded-2xl p-5" style={{ background: t.panel, border: `1px solid ${t.border}` }} data-testid="rsvp-card">
            <h3 className="text-lg font-semibold mb-1" style={{ fontFamily: t.heading }}>Katılım Durumu (LCV)</h3>
            <p className="text-xs mb-4" style={{ color: t.sub }}>Onaylamak için ad ve soyadınız gereklidir.</p>
            {rsvpDone ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: t.accent }}>
                <Check className="w-4 h-4" /> Yanıtınız kaydedildi. Teşekkür ederiz!
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="Ad *" value={rsvp.name} onChange={(e) => setRsvp({ ...rsvp, name: e.target.value })} data-testid="rsvp-name" />
                  <Input placeholder="Soyad *" value={rsvp.surname} onChange={(e) => setRsvp({ ...rsvp, surname: e.target.value })} data-testid="rsvp-surname" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setRsvp({ ...rsvp, attending: true })}
                    className="flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1"
                    style={{ background: rsvp.attending ? t.accent : "transparent", color: rsvp.attending ? "#fff" : t.text, border: `1px solid ${t.border}` }}
                    data-testid="rsvp-yes"><Check className="w-4 h-4" /> Geliyorum</button>
                  <button onClick={() => setRsvp({ ...rsvp, attending: false })}
                    className="flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1"
                    style={{ background: !rsvp.attending ? t.accent : "transparent", color: !rsvp.attending ? "#fff" : t.text, border: `1px solid ${t.border}` }}
                    data-testid="rsvp-no"><X className="w-4 h-4" /> Gelemiyorum</button>
                </div>
                {rsvp.attending && (
                  <div>
                    <label className="text-xs" style={{ color: t.sub }}>Kaç kişi geleceksiniz?</label>
                    <Input type="number" min={1} value={rsvp.guest_count}
                      onChange={(e) => setRsvp({ ...rsvp, guest_count: Math.max(1, parseInt(e.target.value || "1")) })} data-testid="rsvp-count" />
                  </div>
                )}
                <Textarea placeholder="Not (isteğe bağlı)" value={rsvp.note} onChange={(e) => setRsvp({ ...rsvp, note: e.target.value })} rows={2} data-testid="rsvp-note" />
                <Button onClick={submitRsvp} disabled={busy} className="w-full" style={{ background: t.accent, color: "#fff" }} data-testid="rsvp-submit">
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />} Yanıtı Gönder
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Memory / wish box */}
        {sections.memories !== false && (
          <div className="rounded-2xl p-5" style={{ background: t.panel, border: `1px solid ${t.border}` }} data-testid="memory-card">
            <h3 className="text-lg font-semibold mb-1 flex items-center gap-2" style={{ fontFamily: t.heading }}>
              <MessageCircleHeart className="w-5 h-5" style={{ color: t.accent }} /> Anı & Dilek Bırakın
            </h3>
            <div className="space-y-3 mt-3">
              <Input placeholder="Adınız" value={mem.name} onChange={(e) => setMem({ ...mem, name: e.target.value })} data-testid="memory-name" />
              <Textarea placeholder="Dileğinizi / anınızı yazın..." value={mem.message} onChange={(e) => setMem({ ...mem, message: e.target.value })} rows={3} data-testid="memory-message" />
              <Button onClick={submitMemory} disabled={busy} variant="outline" className="w-full" style={{ borderColor: t.accent, color: t.accent }} data-testid="memory-submit">
                Duvara Ekle
              </Button>
            </div>
            {memories.length > 0 && (
              <div className="mt-5 space-y-3">
                {memories.map((m, i) => (
                  <div key={i} className="rounded-xl p-3 text-sm" style={{ background: t.dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)" }}>
                    <div className="font-medium" style={{ color: t.accent }}>{m.name}</div>
                    <div style={{ color: t.text }}>{m.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="text-center text-xs pt-4" style={{ color: t.sub }}>Fotuber ile hazırlanmıştır · fotuber.com.tr</div>
      </div>
    </div>
  );
}
