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
import { Check, Clock, FileText, ChevronDown, ChevronUp, Phone, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SEO } from "@/components/SEO";

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Legacy exports kept so Admin pages that import { EVENT_TYPES, EVENT_ADDONS } keep working.
export const EVENT_TYPES = [
  { key: "wedding",          label: "Düğün Çekimi" },
  { key: "engagement_venue", label: "Nişan Evi" },
  { key: "engagement",       label: "Nişan Çekimi" },
  { key: "kina",             label: "Kına Gecesi" },
  { key: "nikah",            label: "Nikah" },
  { key: "birthday",         label: "Doğum Günü" },
  { key: "bride_party",      label: "Bride Party" },
  { key: "studio_portrait",  label: "Stüdyo Portre" },
  { key: "family",           label: "Aile Çekimi" },
  { key: "iris",             label: "İris Çekimi" },
  { key: "product",          label: "Ürün Çekimi" },
  { key: "podcast",          label: "Podcast" },
  { key: "clip",             label: "Klip / Video" },
  { key: "other",            label: "Diğer" },
];
export const EVENT_ADDONS = {
  wedding: [
    { key: "aktuel_kamera_usb_dahil",  label: "Aktüel Kamera Çekimi — USB Bellek Dahil (64GB)" },
    { key: "aktuel_kamera_usb_haric",  label: "Aktüel Kamera Çekimi — USB Hariç" },
    { key: "aktuel_foto_baskili",      label: "Aktüel Fotoğraf Çekimi — Baskılı" },
    { key: "aktuel_foto_baskisiz",     label: "Aktüel Fotoğraf Çekimi — Baskısız" },
    { key: "dis_cekim",                label: "Dış Çekim" },
    { key: "klip",                     label: "Klip" },
    { key: "dijital_teslim",           label: "Dijital Teslim" },
    { key: "dugun_hikayesi",           label: "Düğün Hikayesi (Hepsi Dahil)" },
  ],
  engagement_venue: [
    { key: "ikramli",    label: "İkramlı" },
    { key: "ikramsiz",   label: "İkramsız" },
    { key: "fotografli", label: "Fotoğraflı" },
    { key: "klipli",     label: "Klipli" },
  ],
  family:   [{ key: "baskili", label: "Baskılı" }, { key: "baskisiz", label: "Baskısız" }],
  birthday: [{ key: "studyoda", label: "Stüdyoda" }, { key: "farkli_mekan", label: "Farklı Mekanda" }],
};

// Detect service category by name → drives which addon flow to render.
const detectServiceKind = (name = "") => {
  const n = name.toLocaleLowerCase("tr");
  if (/iris/.test(n)) return "iris";
  if (/ürün|urun/.test(n)) return "product";
  if (/gelin.?al|konvoy/.test(n)) return "gelin_alma";
  if (/nişan.?ev|nisan.?ev/.test(n)) return "engagement_venue";
  if (/nişan|nisan/.test(n)) return "engagement";
  if (/aile/.test(n)) return "family";
  if (/doğum g|dogum g/.test(n)) return "birthday";
  if (/düğün|dugun/.test(n)) return "wedding";
  if (/portre/.test(n)) return "portrait";
  return "other";
};

// Common addon set for Düğün & Nişan (same structure — only "hikaye" label differs)
const buildWeddingLikeConfig = (hikayeKey, hikayeLabel) => ({
  groups: [
    {
      key: "aktuel_kamera",
      label: "Aktüel Kamera Çekimi",
      radio: true,
      options: [
        { key: "aktuel_kamera_usb_dahil", label: "USB Bellek Dahil (64GB)" },
        { key: "aktuel_kamera_usb_haric", label: "USB Hariç" },
      ],
    },
    {
      key: "aktuel_foto",
      label: "Aktüel Fotoğraf Çekimi",
      radio: true,
      options: [
        { key: "aktuel_foto_baskili",  label: "Baskılı" },
        { key: "aktuel_foto_baskisiz", label: "Baskısız" },
      ],
    },
  ],
  checkboxes: [
    { key: "dis_cekim",       label: "Dış Çekim" },
    { key: "klip",            label: "Klip" },
    { key: "drone",           label: "Drone Çekimi" },
    { key: "dijital_teslim",  label: "Dijital Teslim" },
  ],
  hikayeKey,
  hikayeLabel,
});

// Addon config per detected service kind
const SERVICE_ADDONS = {
  wedding:    buildWeddingLikeConfig("dugun_hikayesi", "Düğün Hikayesi (Hepsi Dahil — Aktüel + Klip + Dış Çekim + Drone)"),
  engagement: buildWeddingLikeConfig("nisan_hikayesi", "Nişan Hikayesi (Hepsi Dahil — Aktüel + Klip + Dış Çekim + Drone)"),
  gelin_alma: {
    groups: [
      { key: "gelin_alma_paket", label: "Gelin Alma + Konvoy Paket", radio: true, options: [
        { key: "kamera",                label: "Kamera" },
        { key: "kamera_foto",           label: "Kamera + Fotoğraf" },
        { key: "profesyonel_klip",      label: "Profesyonel Klip" },
        { key: "profesyonel_fotograf",  label: "Profesyonel Fotoğraf Çekimi" },
        { key: "drone",                 label: "Drone" },
      ]},
    ],
  },
  family: {
    groups: [
      { key: "teslimat", label: "Teslimat", radio: true, options: [
        { key: "baskili",  label: "Baskılı" },
        { key: "baskisiz", label: "Baskısız" },
      ]},
    ],
  },
  birthday: {
    groups: [
      { key: "mekan", label: "Çekim Mekanı", radio: true, options: [
        { key: "studyoda",     label: "Stüdyoda" },
        { key: "farkli_mekan", label: "Farklı Mekanda" },
      ]},
    ],
  },
  engagement_venue: {
    groups: [
      { key: "ikram", label: "İkram", radio: true, options: [
        { key: "ikramli",  label: "İkramlı" },
        { key: "ikramsiz", label: "İkramsız" },
      ]},
      { key: "kayit", label: "Görüntü Kaydı", radio: true, options: [
        { key: "fotografli", label: "Fotoğraflı" },
        { key: "klipli",     label: "Klipli" },
      ]},
    ],
  },
};

const Booking = () => {
  const { user } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [eventAddons, setEventAddons] = useState([]);
  const [radioChoices, setRadioChoices] = useState({}); // group key -> option key
  const [extraServicesNote, setExtraServicesNote] = useState("");
  const [phone2, setPhone2] = useState("");
  const [date, setDate] = useState(new Date(new Date().getTime() + 86400000));
  const [slots, setSlots] = useState([]);
  const [time, setTime] = useState(null);
  const [notes, setNotes] = useState("");
  const [contractAccepted, setContractAccepted] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { api.get("/services").then((r) => {
    const raw = r.data;
    setServices(Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.services) ? raw.services : Array.isArray(raw?.results) ? raw.results : []);
  }).catch(() => setServices([])); }, []);
  const dateStr = useMemo(() => isoDate(date), [date]);
  useEffect(() => {
    setTime(null);
    api.get("/availability", { params: { date: dateStr } })
      .then((r) => {
        const raw = r.data;
        setSlots(Array.isArray(raw?.slots) ? raw.slots : Array.isArray(raw) ? raw : []);
      })
      .catch(() => setSlots([]));
  }, [dateStr]);

  const kind = selectedService ? detectServiceKind(selectedService.name) : null;
  const config = SERVICE_ADDONS[kind];
  const hikayeSelected = !!(config?.hikayeKey && eventAddons.includes(config.hikayeKey));

  // Reset addons when service changes
  useEffect(() => { setEventAddons([]); setRadioChoices({}); }, [selectedService?.id]);

  const toggleCheckbox = (key) => {
    setEventAddons((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };
  const setRadio = (group, optionKey) => {
    setRadioChoices((prev) => ({ ...prev, [group.key]: optionKey }));
  };

  const buildAddonList = () => {
    // Collect radio choices + checkboxes
    const out = [];
    if (config?.groups) {
      config.groups.forEach((g) => {
        const v = radioChoices[g.key];
        if (v) out.push(v);
      });
    }
    out.push(...eventAddons);
    return Array.from(new Set(out));
  };

  const submit = async () => {
    if (!user) {
      toast.info("Randevu almak için önce giriş yapmalısınız.");
      navigate("/giris", { state: { from: "/randevu" } });
      return;
    }
    if (!selectedService) { toast.error("Bir hizmet seçin"); return; }
    if (kind === "product") {
      navigate("/iletisim");
      return;
    }
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
        event_type: kind,
        event_addons: buildAddonList(),
        extra_services_note: extraServicesNote,
        phone_2: phone2,
      });
      const successMsg = kind === "iris"
        ? "İris çekim talebiniz alındı. Temsilcimiz kısa süre içinde sizi arayacak."
        : "Randevu talebiniz alındı. Sözleşmeyi ıslak imza için sizi arayacağız.";
      toast.success(successMsg);
      navigate("/randevularim");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally { setSubmitting(false); }
  };

  const isProduct = kind === "product";
  const isIris    = kind === "iris";

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-950/30 via-neutral-950 to-black">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <SEO title="Randevu Al" description="Fotuber Studio online randevu — hizmetinizi seçin, tarih ve saat belirleyin." path="/randevu" />
        <div className="text-xs tracking-[0.3em] uppercase text-emerald-400 mb-3 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5" /> Randevu Al
        </div>
        <h1 className="text-4xl md:text-6xl font-serif leading-tight mb-4 text-white">
          Tarihinizi ve saatinizi <em className="text-emerald-400">seçin</em>.
        </h1>
        <p className="text-neutral-400 mb-10 max-w-2xl">
          Aşağıdan hizmetinizi seçin. Hizmete uygun paket seçenekleri hemen altında görünecek.
        </p>

        <div className="grid lg:grid-cols-12 gap-8">
          {/* Left: content */}
          <div className="lg:col-span-8 space-y-8">
            {/* Service selection */}
            <div>
              <div className="text-sm uppercase tracking-[0.25em] text-emerald-400 mb-4">1 · Hizmet</div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {services.map((s) => (
                  <button
                    key={s.id}
                    data-testid={`booking-service-${s.id}`}
                    onClick={() => setSelectedService(s)}
                    className={`text-left rounded-2xl border p-5 transition-colors ${selectedService?.id === s.id ? "border-emerald-400 bg-emerald-500/10" : "border-neutral-900 hover:border-neutral-700"}`}
                  >
                    <div className="text-xs uppercase tracking-[0.2em] text-emerald-400 mb-2 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {s.duration_hours} sa
                    </div>
                    <div className="font-serif text-xl mb-1 text-white">{s.name}</div>
                    {s.description && <div className="text-xs text-neutral-500 line-clamp-2">{s.description}</div>}
                  </button>
                ))}
              </div>
            </div>

            {/* Product: contact redirect */}
            {isProduct && (
              <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/5 p-6" data-testid="product-contact-notice">
                <div className="text-emerald-300 text-sm uppercase tracking-[0.25em] mb-2">Ürün Çekimi</div>
                <p className="text-white/90 mb-4">Ürün çekimleri için ihtiyaçlarınıza özel bir çözüm sunuyoruz. Lütfen doğrudan iletişime geçin.</p>
                <Link to="/iletisim">
                  <Button className="rounded-full bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"><Phone className="w-4 h-4 mr-2" /> İletişime Geç</Button>
                </Link>
              </div>
            )}

            {/* Iris: info + still allow booking */}
            {isIris && (
              <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/5 p-6" data-testid="iris-notice">
                <div className="text-emerald-300 text-sm uppercase tracking-[0.25em] mb-2">İris Çekimi</div>
                <p className="text-white/90">Randevu talebinizi oluşturduktan sonra <b>temsilcimiz sizi arayarak</b> teknik ve konseptsel tüm detayları planlayacaktır. Ek seçim yapmanıza gerek yok.</p>
              </div>
            )}

            {/* Addon flow — only when service has one */}
            {selectedService && !isProduct && !isIris && config && (
              <div>
                <div className="text-sm uppercase tracking-[0.25em] text-emerald-400 mb-4">2 · Paket Seçenekleri</div>

                {/* Düğün / Nişan Hikayesi — special exclusive package for wedding-like services */}
                {(kind === "wedding" || kind === "engagement") && config?.hikayeKey && (
                  <label
                    data-testid={`${kind}-hikaye`}
                    className={`flex items-start gap-3 rounded-2xl border p-4 cursor-pointer transition-colors mb-4 ${hikayeSelected ? "border-emerald-400 bg-emerald-500/10" : "border-neutral-800 hover:border-neutral-700"}`}
                  >
                    <Checkbox
                      checked={hikayeSelected}
                      onCheckedChange={() => toggleCheckbox(config.hikayeKey)}
                      className="mt-1 border-neutral-700 data-[state=checked]:bg-emerald-500 data-[state=checked]:text-black data-[state=checked]:border-emerald-500"
                    />
                    <div>
                      <div className="text-white font-medium">{config.hikayeLabel}</div>
                      <div className="text-xs text-neutral-500 mt-1">Bu paketi seçtiğinizde diğer seçeneklere gerek kalmaz — tümü dahildir.</div>
                    </div>
                  </label>
                )}

                {/* Radio groups (hide if wedding hikaye chosen) */}
                {!hikayeSelected && config.groups?.map((g) => (
                  <div key={g.key} className="rounded-2xl border border-neutral-900 bg-neutral-950 p-5 mb-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-neutral-400 mb-3">{g.label}</div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {g.options.map((opt) => {
                        const active = radioChoices[g.key] === opt.key;
                        return (
                          <button
                            type="button"
                            key={opt.key}
                            data-testid={`radio-${g.key}-${opt.key}`}
                            onClick={() => setRadio(g, opt.key)}
                            className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${active ? "border-emerald-400 bg-emerald-500/10 text-emerald-300" : "border-neutral-800 hover:border-neutral-700 text-neutral-200"}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`w-3.5 h-3.5 rounded-full border ${active ? "bg-emerald-400 border-emerald-400" : "border-neutral-600"}`} />
                              {opt.label}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Checkbox extras */}
                {!hikayeSelected && config.checkboxes && (
                  <div className="rounded-2xl border border-neutral-900 bg-neutral-950 p-5">
                    <div className="text-xs uppercase tracking-[0.2em] text-neutral-400 mb-3">Ek Seçenekler</div>
                    <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {config.checkboxes.map((a) => (
                        <label
                          key={a.key}
                          data-testid={`checkbox-${a.key}`}
                          className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${eventAddons.includes(a.key) ? "border-emerald-400 bg-emerald-500/10" : "border-neutral-800 hover:border-neutral-700"}`}
                        >
                          <Checkbox
                            checked={eventAddons.includes(a.key)}
                            onCheckedChange={() => toggleCheckbox(a.key)}
                            className="border-neutral-700 data-[state=checked]:bg-emerald-500 data-[state=checked]:text-black data-[state=checked]:border-emerald-500"
                          />
                          <span className="text-sm text-white">{a.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Extra services note (hidden for product) */}
            {selectedService && !isProduct && (
              <div>
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

            {/* Calendar + Slots (hidden for product) */}
            {selectedService && !isProduct && (
              <>
                <div>
                  <div className="text-sm uppercase tracking-[0.25em] text-emerald-400 mb-4">3 · Tarih</div>
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
                <div>
                  <div className="text-sm uppercase tracking-[0.25em] text-emerald-400 mb-4">4 · Saat</div>
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
                          className={`px-3.5 py-2 rounded-full text-sm border transition-colors ${time === s.time ? "border-emerald-400 bg-emerald-500 text-black font-semibold" : "border-neutral-800 text-neutral-300 hover:border-neutral-700"}`}
                        >
                          {s.time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Phone2 + notes */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-neutral-400">2. Telefon (opsiyonel)</Label>
                    <Input data-testid="booking-phone-2" value={phone2} onChange={(e) => setPhone2(e.target.value)} placeholder="Eş / aile numarası" className="bg-neutral-950 border-neutral-800 text-neutral-200 mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-neutral-400">Genel notlar (opsiyonel)</Label>
                    <Input data-testid="booking-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Konsept, kişi sayısı vb." className="bg-neutral-950 border-neutral-800 text-neutral-200 mt-1" />
                  </div>
                </div>

                {/* Contract */}
                <div>
                  <div className="text-sm uppercase tracking-[0.25em] text-emerald-400 mb-4 flex items-center gap-2">
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
                        <div className="text-sm font-medium text-white">Hizmet Sözleşmesi Metnini Oku</div>
                        <div className="text-xs text-neutral-500 mt-0.5">Randevu oluşturmak için maddeleri kabul etmeniz gerekir.</div>
                      </div>
                      {contractOpen ? <ChevronUp className="w-4 h-4 text-white" /> : <ChevronDown className="w-4 h-4 text-white" />}
                    </button>
                    <AnimatePresence>
                      {contractOpen && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                          <div data-testid="contract-text" className="max-h-72 overflow-y-auto px-5 py-4 border-t border-neutral-800 text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed">
                            {settings?.contract_terms || "Sözleşme metni henüz tanımlanmadı."}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <label className="flex items-start gap-3 px-5 py-4 border-t border-neutral-800 cursor-pointer">
                      <Checkbox data-testid="contract-accept-checkbox" checked={contractAccepted} onCheckedChange={(v) => setContractAccepted(!!v)} className="mt-0.5 border-neutral-700 data-[state=checked]:bg-emerald-500 data-[state=checked]:text-black data-[state=checked]:border-emerald-500" />
                      <span className="text-xs text-neutral-300 leading-relaxed">
                        <span className="text-emerald-400">*</span> Yukarıdaki <b>Hizmet Sözleşmesi</b> maddelerini okudum, anladım ve kabul ediyorum.
                      </span>
                    </label>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right: summary */}
          <div className="lg:col-span-4">
            <div className="sticky top-24 rounded-2xl p-6 border border-emerald-400/30 bg-gradient-to-br from-emerald-950/50 to-neutral-950 shadow-[0_0_60px_rgba(16,185,129,0.15)]">
              <div className="text-xs uppercase tracking-[0.3em] text-emerald-400 mb-3">Özet</div>
              <div className="space-y-4 text-sm">
                <div>
                  <div className="text-neutral-500">Hizmet</div>
                  <div className="font-serif text-lg text-white" data-testid="summary-service">{selectedService?.name || "—"}</div>
                </div>
                {!isProduct && !isIris && (
                  <>
                    <div>
                      <div className="text-neutral-500">Tarih</div>
                      <div className="font-serif text-lg text-white" data-testid="summary-date">{dateStr}</div>
                    </div>
                    <div>
                      <div className="text-neutral-500">Saat</div>
                      <div className="font-serif text-lg text-white" data-testid="summary-time">{time || "—"}</div>
                    </div>
                    {buildAddonList().length > 0 && (
                      <div>
                        <div className="text-neutral-500">Paket seçimi</div>
                        <div className="text-sm text-neutral-200 mt-1" data-testid="summary-addons">
                          {buildAddonList().length} adet seçili
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="mt-6 p-4 rounded-lg bg-emerald-500/10 border border-emerald-400/30 text-xs text-neutral-300 leading-relaxed">
                {isIris
                  ? "Talebiniz oluşturulduktan sonra temsilcimiz sizi arayarak detayları planlayacak."
                  : isProduct
                  ? "Ürün çekimi için doğrudan iletişime geçiniz."
                  : "Talebiniz \"Beklemede\" statüsünde oluşturulur. Ekibimiz sizi arayarak fiyat, kapora ve tarihinizi kesinleştirir."}
              </div>

              {!isProduct && (
                <Button
                  data-testid="submit-booking-btn"
                  onClick={submit}
                  disabled={submitting || (!isIris && !contractAccepted)}
                  className="w-full mt-6 rounded-full h-12 font-semibold bg-emerald-500 hover:bg-emerald-600 text-black disabled:opacity-50 shadow-[0_0_30px_rgba(16,185,129,0.35)] hover:shadow-[0_0_60px_rgba(16,185,129,0.6)] transition-all"
                >
                  {submitting ? "Gönderiliyor..." : <><Check className="w-4 h-4 mr-2" /> {isIris ? "Randevu Talebi Oluştur" : "Randevu Talebini Gönder"}</>}
                </Button>
              )}

              {!user && !isProduct && (
                <p className="mt-3 text-xs text-neutral-500 text-center">
                  Devam etmek için <Link to="/giris" className="text-emerald-400">giriş yapın</Link> veya{" "}
                  <Link to="/kayit" className="text-emerald-400">kayıt olun</Link>.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Booking;
