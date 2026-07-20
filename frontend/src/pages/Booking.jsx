import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { toast } from "sonner";
import { Check, Clock, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SEO } from "@/components/SEO";

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const EVENT_TYPES = [
  { key: "wedding",          label: "Düğün Çekimi" },
  { key: "engagement_venue", label: "Nişan Evi" },
  { key: "engagement",       label: "Nişan Çekimi" },
  { key: "kina",             label: "Kına Gecesi" },
  { key: "nikah",            label: "Nikah" },
  { key: "birthday",         label: "Doğum Günü" },
  { key: "bride_party",      label: "Bride Party" },
  { key: "studio_portrait",  label: "Stüdyo Portre" },
  { key: "podcast",          label: "Podcast" },
  { key: "clip",             label: "Klip / Video" },
  { key: "other",            label: "Diğer" },
];

// Addons per event type (labels shown to customer; keys stored in DB)
export const EVENT_ADDONS = {
  wedding: [
    { key: "klip",             label: "Klip" },
    { key: "album",            label: "Albüm" },
    { key: "tablo",            label: "Tablo" },
    { key: "baski",            label: "Baskı" },
    { key: "dugun_hikayesi",   label: "Düğün Hikayesi" },
  ],
  engagement_venue: [
    { key: "ikramli",   label: "İkramlı" },
    { key: "ikramsiz",  label: "İkramsız" },
    { key: "fotografli",label: "Fotoğraflı" },
    { key: "klipli",    label: "Klipli" },
  ],
};

const Booking = () => {
  const { user } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [eventType, setEventType] = useState("");
  const [eventAddons, setEventAddons] = useState([]);
  const [extraServicesNote, setExtraServicesNote] = useState("");
  const [phone2, setPhone2] = useState("");
  const [date, setDate] = useState(new Date(new Date().getTime() + 86400000));
  const [slots, setSlots] = useState([]);
  const [time, setTime] = useState(null);
  const [notes, setNotes] = useState("");
  const [contractAccepted, setContractAccepted] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { api.get("/services").then((r) => setServices(r.data)); }, []);

  const dateStr = useMemo(() => isoDate(date), [date]);

  useEffect(() => {
    setTime(null);
    api.get("/availability", { params: { date: dateStr } })
      .then((r) => setSlots(r.data.slots))
      .catch(() => setSlots([]));
  }, [dateStr]);

  const currentAddons = EVENT_ADDONS[eventType] || [];

  const toggleAddon = (key) => {
    setEventAddons((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  // Reset addons when event type changes
  useEffect(() => { setEventAddons([]); }, [eventType]);

  const submit = async () => {
    if (!user) {
      toast.info("Randevu almak için önce giriş yapmalısınız.");
      navigate("/giris", { state: { from: "/randevu" } });
      return;
    }
    if (!selectedService) { toast.error("Bir hizmet seçin"); return; }
    if (!eventType) { toast.error("Etkinlik türünü seçin"); return; }
    if (!time) { toast.error("Bir saat seçin"); return; }
    if (!contractAccepted) { toast.error("Devam etmek için sözleşme maddelerini kabul etmelisiniz"); return; }
    setSubmitting(true);
    try {
      await api.post("/appointments", {
        service_id: selectedService.id,
        date: dateStr,
        time,
        notes,
        contract_accepted: true,
        event_type: eventType,
        event_addons: eventAddons,
        extra_services_note: extraServicesNote,
        phone_2: phone2,
      });
      toast.success("Randevu talebiniz alındı. Sözleşmeyi ıslak imza için sizi arayacağız.");
      navigate("/randevularim");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <SEO title="Randevu Al" description="Fotuber Studio online randevu — takvimden tarih ve saat seçin, hizmet paketinizi belirleyin, sözleşmeyi onaylayın." path="/randevu" />
      <div className="text-xs tracking-[0.3em] uppercase text-[#d4af37] mb-3">Randevu Al</div>
      <h1 className="hero-title text-4xl md:text-6xl mb-12">
        Tarihinizi ve saatinizi <em>seçin</em>.
      </h1>

      <div className="grid lg:grid-cols-12 gap-8">
        {/* Left: service + event + calendar */}
        <div className="lg:col-span-8 space-y-8">
          {/* Service selection (no prices shown publicly) */}
          <div>
            <div className="text-sm uppercase tracking-[0.25em] text-neutral-500 mb-4">1 · Hizmet</div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {services.map((s) => (
                <button
                  key={s.id}
                  data-testid={`booking-service-${s.id}`}
                  onClick={() => setSelectedService(s)}
                  className={`text-left rounded-2xl border p-5 transition-colors ${selectedService?.id === s.id ? "border-[#d4af37] bg-[#d4af37]/5" : "border-neutral-900 hover:border-neutral-700"}`}
                >
                  <div className="text-xs uppercase tracking-[0.2em] text-[#d4af37] mb-2 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {s.duration_hours} sa
                  </div>
                  <div className="font-serif text-xl mb-1">{s.name}</div>
                  {s.description && <div className="text-xs text-neutral-500 line-clamp-2">{s.description}</div>}
                </button>
              ))}
            </div>
          </div>

          {/* Event Type */}
          <div>
            <div className="text-sm uppercase tracking-[0.25em] text-neutral-500 mb-4">2 · Etkinlik Türü</div>
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map((et) => (
                <button
                  key={et.key}
                  type="button"
                  data-testid={`event-type-${et.key}`}
                  onClick={() => setEventType(et.key)}
                  className={`rounded-full border px-4 py-2 text-sm transition-colors ${eventType === et.key ? "border-[#d4af37] bg-[#d4af37]/10 text-[#d4af37]" : "border-neutral-800 text-neutral-300 hover:border-neutral-700"}`}
                >
                  {et.label}
                </button>
              ))}
            </div>

            {/* Addons for the selected event type */}
            {currentAddons.length > 0 && (
              <div className="mt-6 rounded-2xl border border-neutral-900 bg-neutral-950 p-5">
                <div className="text-xs uppercase tracking-[0.2em] text-neutral-400 mb-3">Paket seçenekleri (isteklerinizi işaretleyin)</div>
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {currentAddons.map((a) => (
                    <label
                      key={a.key}
                      data-testid={`event-addon-${a.key}`}
                      className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${eventAddons.includes(a.key) ? "border-[#d4af37] bg-[#d4af37]/5" : "border-neutral-800 hover:border-neutral-700"}`}
                    >
                      <Checkbox
                        checked={eventAddons.includes(a.key)}
                        onCheckedChange={() => toggleAddon(a.key)}
                        className="border-neutral-700 data-[state=checked]:bg-[#d4af37] data-[state=checked]:text-black data-[state=checked]:border-[#d4af37]"
                      />
                      <span className="text-sm">{a.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Extra services note */}
            {eventType && (
              <div className="mt-4">
                <Label className="text-xs text-neutral-400">Ekstra hizmet talebi (opsiyonel)</Label>
                <Textarea
                  data-testid="extra-services-note"
                  value={extraServicesNote}
                  onChange={(e) => setExtraServicesNote(e.target.value)}
                  placeholder="Beğendiğiniz özel bir istek varsa buraya yazın..."
                  className="bg-neutral-950 border-neutral-800 text-neutral-200 min-h-[80px] mt-1"
                />
              </div>
            )}
          </div>

          {/* Calendar */}
          <div>
            <div className="text-sm uppercase tracking-[0.25em] text-neutral-500 mb-4">3 · Tarih</div>
            <div className="rounded-2xl border border-neutral-900 bg-neutral-950 p-4 inline-block">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                data-testid="booking-calendar"
                className="text-neutral-200"
              />
            </div>
          </div>

          {/* Slots — 30-min intervals, 08:00 - 23:30 for public; booked ones are hidden */}
          <div>
            <div className="text-sm uppercase tracking-[0.25em] text-neutral-500 mb-4">4 · Saat (30 dk aralıklarla)</div>
            {slots.length === 0 ? (
              <div className="text-sm text-neutral-500">Bu tarih için uygun saat bulunmuyor. Lütfen başka bir gün seçin.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map((s) => (
                  <button
                    key={s.time}
                    data-testid={`slot-${s.time}`}
                    type="button"
                    onClick={() => setTime(s.time)}
                    className={`slot-pill ${time === s.time ? "slot-selected" : "slot-available"}`}
                  >
                    {s.time}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Alt bilgiler */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-neutral-400">2. Telefon (opsiyonel)</Label>
              <Input
                data-testid="booking-phone-2"
                value={phone2}
                onChange={(e) => setPhone2(e.target.value)}
                placeholder="Örn. eşiniz veya bir yakınınızın numarası"
                className="bg-neutral-950 border-neutral-800 text-neutral-200 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-neutral-400">Genel notlar (opsiyonel)</Label>
              <Input
                data-testid="booking-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Konsept, kişi sayısı vb."
                className="bg-neutral-950 border-neutral-800 text-neutral-200 mt-1"
              />
            </div>
          </div>

          {/* Sözleşme */}
          <div>
            <div className="text-sm uppercase tracking-[0.25em] text-neutral-500 mb-4 flex items-center gap-2">
              <FileText className="w-3.5 h-3.5" /> 5 · Sözleşme
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 overflow-hidden">
              <button
                type="button"
                data-testid="contract-toggle"
                onClick={() => setContractOpen((o) => !o)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-neutral-900 transition-colors"
              >
                <div>
                  <div className="text-sm font-medium">Hizmet Sözleşmesi Metnini Oku</div>
                  <div className="text-xs text-neutral-500 mt-0.5">Randevu oluşturmak için maddeleri kabul etmeniz gerekir.</div>
                </div>
                {contractOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <AnimatePresence>
                {contractOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div
                      data-testid="contract-text"
                      className="max-h-72 overflow-y-auto px-5 py-4 border-t border-neutral-800 text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed"
                    >
                      {settings?.contract_terms || "Sözleşme metni henüz tanımlanmadı."}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <label className="flex items-start gap-3 px-5 py-4 border-t border-neutral-800 cursor-pointer">
                <Checkbox
                  data-testid="contract-accept-checkbox"
                  checked={contractAccepted}
                  onCheckedChange={(v) => setContractAccepted(!!v)}
                  className="mt-0.5 border-neutral-700 data-[state=checked]:bg-[#d4af37] data-[state=checked]:text-black data-[state=checked]:border-[#d4af37]"
                />
                <span className="text-xs text-neutral-300 leading-relaxed">
                  <span className="text-[#d4af37]">*</span> Yukarıdaki <b>Hizmet Sözleşmesi</b> maddelerini
                  okudum, anladım ve kabul ediyorum. Ekibin sözleşmenin ıslak imzalı örneğini
                  tamamlamak üzere beni aramasını onaylıyorum.
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Right: summary — prices are hidden publicly */}
        <div className="lg:col-span-4">
          <div className="sticky top-24 glass rounded-2xl p-6">
            <div className="text-xs uppercase tracking-[0.3em] text-[#d4af37] mb-3">Özet</div>
            <div className="space-y-4 text-sm">
              <div>
                <div className="text-neutral-500">Hizmet</div>
                <div className="font-serif text-lg" data-testid="summary-service">{selectedService?.name || "—"}</div>
              </div>
              <div>
                <div className="text-neutral-500">Etkinlik</div>
                <div className="font-serif text-lg" data-testid="summary-event-type">
                  {EVENT_TYPES.find((et) => et.key === eventType)?.label || "—"}
                </div>
              </div>
              <div>
                <div className="text-neutral-500">Tarih</div>
                <div className="font-serif text-lg" data-testid="summary-date">{dateStr}</div>
              </div>
              <div>
                <div className="text-neutral-500">Saat</div>
                <div className="font-serif text-lg" data-testid="summary-time">{time || "—"}</div>
              </div>
              {eventAddons.length > 0 && (
                <div>
                  <div className="text-neutral-500">Paket seçimi</div>
                  <div className="text-sm text-neutral-200 mt-1" data-testid="summary-addons">
                    {eventAddons.map((k) => currentAddons.find((a) => a.key === k)?.label).filter(Boolean).join(", ")}
                  </div>
                </div>
              )}
            </div>

            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-6 p-4 rounded-lg bg-[#d4af37]/10 border border-[#d4af37]/30 text-xs text-neutral-300 leading-relaxed"
              >
                Talebiniz "Beklemede" statüsünde oluşturulur. Ekibimiz sizi arayarak fiyat, kapora ve tarihinizi kesinleştirir.
              </motion.div>
            </AnimatePresence>

            <Button
              data-testid="submit-booking-btn"
              onClick={submit}
              disabled={submitting || !contractAccepted}
              className="w-full mt-6 rounded-full bg-[#d4af37] hover:bg-[#b5952f] text-black h-11 disabled:opacity-50"
            >
              {submitting ? "Gönderiliyor..." : <><Check className="w-4 h-4 mr-2" /> Randevu Talebini Gönder</>}
            </Button>
            {!contractAccepted && (
              <p className="mt-2 text-xs text-[#d4af37]/80 text-center">
                Sözleşme maddelerini kabul edin
              </p>
            )}

            {!user && (
              <p className="mt-3 text-xs text-neutral-500 text-center">
                Devam etmek için <Link to="/giris" className="text-[#d4af37]">giriş yapın</Link> veya{" "}
                <Link to="/kayit" className="text-[#d4af37]">kayıt olun</Link>.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Booking;
