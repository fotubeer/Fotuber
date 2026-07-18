import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { toast } from "sonner";
import { Phone, MessageCircle, Info, Check, Clock, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const Booking = () => {
  const { user } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
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

  const submit = async () => {
    if (!user) {
      toast.info("Randevu almak için önce giriş yapmalısınız.");
      navigate("/giris", { state: { from: "/randevu" } });
      return;
    }
    if (!selectedService) { toast.error("Bir hizmet seçin"); return; }
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
      });
      toast.success("Randevu talebiniz alındı. Sözleşmeyi ıslak imza için sizi arayacağız.");
      navigate("/randevularim");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const wa = "905010002523";

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <div className="text-xs tracking-[0.3em] uppercase text-[#d4af37] mb-3">Randevu Al</div>
      <h1 className="hero-title text-4xl md:text-6xl mb-12">
        Tarihinizi ve saatinizi <em>seçin</em>.
      </h1>

      <div className="grid lg:grid-cols-12 gap-8">
        {/* Left: service + calendar */}
        <div className="lg:col-span-8 space-y-8">
          {/* Service selection */}
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
                  <div className="text-sm text-neutral-400">₺{Number(s.price).toLocaleString("tr-TR")}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Calendar */}
          <div>
            <div className="text-sm uppercase tracking-[0.25em] text-neutral-500 mb-4">2 · Tarih</div>
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

          {/* Slots */}
          <div>
            <div className="text-sm uppercase tracking-[0.25em] text-neutral-500 mb-4">3 · Saat</div>
            <div className="flex flex-wrap gap-3">
              {slots.map((s) => (
                <button
                  key={s.time}
                  data-testid={`slot-${s.time}`}
                  disabled={s.status === "booked"}
                  onClick={() => s.status === "available" && setTime(s.time)}
                  className={`slot-pill ${
                    s.status === "booked"
                      ? "slot-booked"
                      : time === s.time ? "slot-selected" : "slot-available"
                  }`}
                >
                  {s.time}
                </button>
              ))}
            </div>

            {slots.some((s) => s.status === "booked") && (
              <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
                <div className="flex items-start gap-3">
                  <Info className="w-4 h-4 text-[#d4af37] mt-1 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-neutral-300 mb-3">
                      Bu saatte acil bir hizmete mi ihtiyacınız var? Lütfen bizimle iletişime geçin.
                    </p>
                    <div className="flex gap-3">
                      <a href={`tel:+${wa}`}><Button size="sm" className="rounded-full bg-[#d4af37] text-black" data-testid="urgent-phone-btn"><Phone className="w-3 h-3 mr-1" />Ara</Button></a>
                      <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"><Button size="sm" className="rounded-full bg-[#25D366] text-white" data-testid="urgent-whatsapp-btn"><MessageCircle className="w-3 h-3 mr-1" />WhatsApp</Button></a>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="text-sm uppercase tracking-[0.25em] text-neutral-500 mb-4">4 · Notlar (opsiyonel)</div>
            <Textarea
              data-testid="booking-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Konsept, katılımcı sayısı, özel istekler..."
              className="bg-neutral-950 border-neutral-800 text-neutral-200 min-h-[100px]"
            />
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

        {/* Right: summary */}
        <div className="lg:col-span-4">
          <div className="sticky top-24 glass rounded-2xl p-6">
            <div className="text-xs uppercase tracking-[0.3em] text-[#d4af37] mb-3">Özet</div>
            <div className="space-y-4 text-sm">
              <div>
                <div className="text-neutral-500">Hizmet</div>
                <div className="font-serif text-lg" data-testid="summary-service">{selectedService?.name || "—"}</div>
              </div>
              <div>
                <div className="text-neutral-500">Tarih</div>
                <div className="font-serif text-lg" data-testid="summary-date">{dateStr}</div>
              </div>
              <div>
                <div className="text-neutral-500">Saat</div>
                <div className="font-serif text-lg" data-testid="summary-time">{time || "—"}</div>
              </div>
              <div>
                <div className="text-neutral-500">Ücret</div>
                <div className="font-serif text-2xl text-[#d4af37]" data-testid="summary-price">
                  {selectedService ? `₺${Number(selectedService.price).toLocaleString("tr-TR")}` : "—"}
                </div>
              </div>
            </div>

            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-6 p-4 rounded-lg bg-[#d4af37]/10 border border-[#d4af37]/30 text-xs text-neutral-300 leading-relaxed"
              >
                Talebiniz "Beklemede" statüsünde oluşturulur. Ekibimiz sizi arayarak kapora
                sonrası tarihinizi kesinleştirir.
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
