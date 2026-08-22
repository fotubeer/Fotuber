import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CalendarCheck, Clock, Phone, CheckCircle2, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { SEO } from "@/components/SEO";

export default function PublicBooking() {
  const [cfg, setCfg] = useState({ kvkk_text: "", working_hours: { start: "09:00", end: "22:00" }, event_types: [] });
  const [form, setForm] = useState({ name: "", phone: "", email: "", event_type: "", date: "", time: "", note: "" });
  const [kvkk, setKvkk] = useState(false);
  const [comms, setComms] = useState(false);
  const [dayInfo, setDayInfo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { api.get("/appt-pro/public/settings").then(({ data }) => setCfg(data)).catch(() => {}); }, []);

  useEffect(() => {
    if (!form.date) { setDayInfo(null); return; }
    api.get(`/appt-pro/public/day-status?date=${form.date}`).then(({ data }) => setDayInfo(data)).catch(() => setDayInfo(null));
  }, [form.date]);

  const submit = async () => {
    if (!form.name || form.name.trim().length < 2) { toast.error("Ad soyad girin"); return; }
    if (!form.phone || form.phone.trim().length < 5) { toast.error("Telefon numarası girin"); return; }
    if (!kvkk) { toast.error("KVKK ve iletişim iznini onaylamalısınız"); return; }
    setSubmitting(true);
    try {
      await api.post("/appt-pro/public/requests", { ...form, kvkk_accepted: kvkk, comms_consent: comms });
      setDone(true);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSubmitting(false); }
  };

  const dayClosed = dayInfo?.closed;

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white flex items-center justify-center px-4">
        <SEO title="Randevu Talebi Alındı" description="Fotuber randevu talebiniz alındı." path="/randevu-al" />
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full text-center bg-white/5 border border-white/10 rounded-3xl p-10 backdrop-blur-xl" data-testid="booking-success">
          <CheckCircle2 className="mx-auto text-emerald-400 mb-4" size={64} />
          <h1 className="text-2xl font-bold mb-2">Talebiniz Alındı</h1>
          <p className="text-white/70 text-sm leading-relaxed">Randevu talebinizi aldık. Ekibimiz en kısa sürede sizinle iletişime geçerek detayları netleştirecektir. Teşekkür ederiz.</p>
          <Link to="/"><Button className="mt-6 bg-white text-slate-900 hover:bg-white/90 rounded-full px-6" data-testid="booking-home">Ana Sayfaya Dön</Button></Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white py-10 px-4">
      <SEO title="Randevu Al" description="Fotuber randevu talebi — bilgilerinizi bırakın, sizi arayalım." path="/randevu-al" />
      <div className="max-w-xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white mb-6" data-testid="booking-back"><ArrowLeft size={16} /> Ana Sayfa</Link>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-2 text-amber-300 text-xs font-semibold tracking-[0.25em] uppercase"><CalendarCheck size={15} /> Randevu</span>
            <h1 className="text-3xl sm:text-4xl font-bold mt-3" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Randevu Talebi Oluşturun</h1>
            <p className="text-white/60 text-sm mt-2">Bilgilerinizi bırakın, en uygun zaman için sizinle iletişime geçelim.</p>
            <p className="text-white/40 text-xs mt-1 inline-flex items-center gap-1"><Clock size={12} /> Çalışma saatleri: {cfg.working_hours?.start}–{cfg.working_hours?.end}</p>
          </div>

          <div className="bg-white text-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4" data-testid="booking-form">
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Ad Soyad *</Label><Input data-testid="bk-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Adınız Soyadınız" /></div>
              <div><Label>Telefon *</Label><Input data-testid="bk-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="05xx xxx xx xx" /></div>
              <div><Label>E-posta</Label><Input data-testid="bk-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="opsiyonel" /></div>
              <div><Label>Hizmet / Etkinlik</Label>
                <Select value={form.event_type} onValueChange={(v) => setForm({ ...form, event_type: v })}>
                  <SelectTrigger data-testid="bk-event"><SelectValue placeholder="Seçin" /></SelectTrigger>
                  <SelectContent>{(cfg.event_types || []).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Tercih Ettiğiniz Tarih</Label><Input type="date" data-testid="bk-date" min={new Date().toISOString().slice(0, 10)} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div><Label>Tercih Ettiğiniz Saat</Label><Input type="time" data-testid="bk-time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div>
            </div>

            {form.date && dayClosed && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2" data-testid="bk-day-closed">
                Seçtiğiniz tarih ({form.date}) müsait değildir. Lütfen başka bir gün seçin.
              </div>
            )}
            {form.date && !dayClosed && (dayInfo?.blocked_ranges || []).length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-2" data-testid="bk-day-ranges">
                Bu tarihte kapalı saat aralıkları: {dayInfo.blocked_ranges.map((r) => `${r.start}–${r.end}`).join(", ")}
              </div>
            )}

            <div><Label>Notunuz</Label><Textarea rows={3} data-testid="bk-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Etkinlik detayı, kişi sayısı, sorularınız…" /></div>

            <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 cursor-pointer">
              <Checkbox checked={kvkk} onCheckedChange={setKvkk} data-testid="bk-kvkk" className="mt-0.5" />
              <span className="text-xs text-slate-600 leading-relaxed">{cfg.kvkk_text}</span>
            </label>
            <label className="flex items-center gap-3 text-sm text-slate-600 cursor-pointer">
              <Checkbox checked={comms} onCheckedChange={setComms} data-testid="bk-comms" />
              Kampanya, indirim ve bilgilendirme iletileri almak istiyorum (opsiyonel).
            </label>

            <Button onClick={submit} disabled={submitting || dayClosed} className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-base rounded-xl gap-2" data-testid="bk-submit">
              <Phone size={17} /> {submitting ? "Gönderiliyor…" : "Randevu Talebi Gönder"}
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
