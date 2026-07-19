import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { UploadCloud, Camera, Shield, Clock, Check, X, LogIn, HardDrive, Heart, Sparkles, Info } from "lucide-react";
import { toast } from "sonner";
import { SEO } from "@/components/SEO";

const EVENT_LABELS = {
  wedding: { label: "Düğün", accent: "Anlarınızı bizimle ölümsüzleştirin" },
  engagement: { label: "Nişan", accent: "Bu güzel günden kareler paylaşın" },
  henna: { label: "Kına Gecesi", accent: "Kına'nın her karesi çiftimizin hatırasına" },
  nikah: { label: "Nikah", accent: "Bu mutlu güne tanıklık ettiğiniz için teşekkürler" },
  birthday: { label: "Doğum Günü", accent: "Bu güzel günden anılar paylaşın" },
  other: { label: "Etkinlik", accent: "Anlarınızı bizimle paylaşın" },
};

const formatBytes = (n) => {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0; let x = n;
  while (x > 1024 && i < u.length - 1) { x /= 1024; i++; }
  return `${x.toFixed(1)} ${u[i]}`;
};

const GuestUpload = () => {
  const params = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();

  const isVenue = location.pathname.startsWith("/mekan/");
  const routeToken = isVenue ? params.venueToken : params.token;

  const [event, setEvent] = useState(null);      // resolved event info
  const [eventToken, setEventToken] = useState(null); // upload_token to hit the API
  const [venueName, setVenueName] = useState(null);
  const [usage, setUsage] = useState(null);
  const [kvkk, setKvkk] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [queue, setQueue] = useState([]);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeDismissedKey, setWelcomeDismissedKey] = useState(null);
  const inputRef = useRef();

  // Fetch event/venue info
  useEffect(() => {
    (async () => {
      try {
        if (isVenue) {
          const { data } = await api.get(`/venues/${routeToken}`);
          setVenueName(data.venue_name);
          if (data.active && data.upload_token) {
            setEvent({
              name: data.name,
              couple_names: data.couple_names,
              event_date: data.event_date,
              event_type: data.event_type,
              welcome_message: data.welcome_message,
              max_size_per_user_mb: data.max_size_per_user_mb,
              retention_days: data.retention_days,
              delete_at: data.delete_at,
              expired: false,
            });
            setEventToken(data.upload_token);
          } else {
            setEvent({ inactive: true, venue_name: data.venue_name, expired: data.expired });
          }
        } else {
          const { data } = await api.get(`/guest-events/${routeToken}`);
          setEvent(data);
          setEventToken(routeToken);
        }
      } catch (e) { toast.error(formatApiError(e)); }
    })();
  }, [routeToken, isVenue]);

  // On user login + event loaded → show animated welcome once per event
  useEffect(() => {
    if (!user || !event || !event.couple_names) return;
    const key = `fotuber_welcome_${eventToken}_${user.id}`;
    if (welcomeDismissedKey === key) return;
    if (sessionStorage.getItem(key)) return;
    setShowWelcome(true);
    setWelcomeDismissedKey(key);
    sessionStorage.setItem(key, "1");
    const t = setTimeout(() => setShowWelcome(false), 6000);
    return () => clearTimeout(t);
  }, [user, event, eventToken, welcomeDismissedKey]);

  // Load usage
  useEffect(() => {
    if (!user || !eventToken) return;
    api.get(`/guest-events/${eventToken}/my-usage`).then((r) => setUsage(r.data)).catch(() => {});
  }, [user, eventToken]);

  const goLogin = () => nav(`/kayit`, { state: { from: location.pathname } });

  const onSelectFiles = (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const newQ = Array.from(fileList).map((f) => ({ file: f, status: "pending" }));
    setQueue((q) => [...q, ...newQ]);
  };

  const uploadNext = async () => {
    if (!kvkk) { toast.error("Önce KVKK onayını işaretleyin"); return; }
    if (!user || !eventToken) { toast.error("Yükleme için giriş yapmalısınız"); return; }
    setUploading(true);
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status !== "pending") continue;
      setQueue((q) => q.map((it, idx) => idx === i ? { ...it, status: "uploading" } : it));
      try {
        const fd = new FormData();
        fd.append("file", queue[i].file);
        fd.append("kvkk_accepted", "true");
        const res = await api.post(`/guest-events/${eventToken}/upload`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 600000,
        });
        setQueue((q) => q.map((it, idx) => idx === i ? { ...it, status: "done" } : it));
        setUsage((u) => u ? { ...u, remaining_bytes: res.data.remaining, used_bytes: u.limit_bytes - res.data.remaining, used_files: u.used_files + 1 } : u);
      } catch (e) {
        setQueue((q) => q.map((it, idx) => idx === i ? { ...it, status: "error", error: formatApiError(e) } : it));
      }
    }
    setUploading(false);
    toast.success("Yükleme tamamlandı — teşekkürler! 🎉");
  };

  if (authLoading || !event) {
    return <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-500">Yükleniyor…</div>;
  }

  // Venue with no active event
  if (event.inactive) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-200 flex items-center justify-center px-6">
        <SEO title={venueName || "Mekan"} noIndex path={location.pathname} />
        <div className="max-w-md text-center">
          <Sparkles className="w-12 h-12 mx-auto mb-4 text-[#d4af37]" />
          <h1 className="hero-title text-3xl mb-3">{venueName || "Mekan"}</h1>
          <p className="text-sm text-neutral-400">Şu anda bu mekanda aktif bir etkinlik yok. Ekibimiz bir etkinlik atadığında bu QR canlı olacaktır.</p>
          <Link to="/" className="mt-6 inline-block text-[#d4af37] underline">Anasayfa</Link>
        </div>
      </div>
    );
  }

  if (event.expired) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-200 flex items-center justify-center px-6">
        <SEO title="Yükleme Kapalı" noIndex path={location.pathname} />
        <div className="max-w-md text-center">
          <Clock className="w-12 h-12 mx-auto mb-4 text-neutral-500" />
          <h1 className="hero-title text-3xl mb-3">Yükleme süresi doldu</h1>
          <p className="text-sm text-neutral-400">Bu etkinlik için yükleme süresi sona ermiştir. Detay için organizatörle iletişime geçin.</p>
          <Link to="/" className="mt-6 inline-block text-[#d4af37] underline">Anasayfa</Link>
        </div>
      </div>
    );
  }

  const evLabel = EVENT_LABELS[event.event_type] || EVENT_LABELS.other;
  const progress = usage ? Math.round((usage.used_bytes / usage.limit_bytes) * 100) : 0;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <SEO title={`Anılarınızı Paylaşın — ${event.couple_names || event.name}`} noIndex path={location.pathname} />

      {/* Animated Welcome */}
      <AnimatePresence>
        {showWelcome && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950 px-6"
            onClick={() => setShowWelcome(false)}
            data-testid="welcome-overlay"
          >
            <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_50%_30%,#d4af37_0%,transparent_60%)]" />
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.8, ease: "easeOut" }}
              className="relative text-center max-w-2xl"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
                className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 border border-[#d4af37]/40 bg-[#d4af37]/10 text-[#d4af37] text-xs tracking-[0.3em] uppercase mb-6"
              >
                <Heart className="w-3 h-3" /> {evLabel.label}
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, letterSpacing: "0.5em" }}
                animate={{ opacity: 1, letterSpacing: "-0.01em" }}
                transition={{ delay: 0.6, duration: 1.2 }}
                className="hero-title text-5xl md:text-7xl mb-4"
                style={{ fontFamily: "var(--fotuber-font-heading)" }}
              >
                <em className="not-italic">{event.couple_names || event.name}</em>
              </motion.h1>
              {event.event_date && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 1.0 }}
                  className="text-neutral-400 text-sm tracking-widest uppercase mb-6"
                >
                  {new Date(event.event_date).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
                </motion.div>
              )}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.4 }}
                className="text-neutral-300 text-lg italic font-serif"
                style={{ fontFamily: "var(--fotuber-font-heading)" }}
              >
                "{evLabel.accent}"
              </motion.p>
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2.0 }}
                onClick={() => setShowWelcome(false)}
                className="mt-10 px-8 py-3 rounded-full bg-[#d4af37] hover:bg-[#b5952f] text-black font-medium"
                data-testid="welcome-continue"
              >
                Fotoğraflarımı Yükleyeyim
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="border-b border-neutral-900">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-[#d4af37]" />
            <span className="font-serif text-lg" style={{ fontFamily: "var(--fotuber-font-heading)" }}>Fotuber</span>
          </Link>
          <Badge className="bg-[#d4af37] text-black">{evLabel.label} · Misafir Yükleme</Badge>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="text-xs tracking-[0.3em] uppercase text-[#d4af37] mb-3">Doğru yerdesiniz</div>
        <h1 className="hero-title text-4xl md:text-5xl mb-2" style={{ fontFamily: "var(--fotuber-font-heading)" }}>
          {event.couple_names || event.name}
        </h1>
        <div className="flex items-center gap-3 text-neutral-400 text-sm mb-6">
          <Badge variant="outline" className="border-neutral-700 text-neutral-300">{evLabel.label}</Badge>
          {event.event_date && <span>· {new Date(event.event_date).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}</span>}
          {venueName && <span>· 📍 {venueName}</span>}
        </div>
        {event.welcome_message && (
          <p className="mb-6 text-neutral-300 italic border-l-2 border-[#d4af37] pl-4">"{event.welcome_message}"</p>
        )}

        {/* Rules / Guidance */}
        <Card className="bg-neutral-900 border-neutral-800 text-neutral-200 mb-6">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-[#d4af37] mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <div className="font-semibold mb-1">Nasıl çalışır?</div>
                <ol className="text-xs text-neutral-400 space-y-1 list-decimal list-inside">
                  <li>Kısaca <b>ücretsiz kayıt</b> olun (KVKK onayı ile).</li>
                  <li>Foto ve videolarınızı seçip yükleyin — kişi başı <b>{event.max_size_per_user_mb} MB</b>'a kadar.</li>
                  <li>Yüklediğiniz kareler doğrudan <b>{event.couple_names || "çifte"}</b> ulaşır.</li>
                  <li>Dosyalar <b>{event.retention_days} gün</b> sonra sunucudan otomatik silinir.</li>
                </ol>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <HardDrive className="w-4 h-4 text-[#d4af37] mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <div className="font-semibold">Kişi başı yükleme limiti: {event.max_size_per_user_mb} MB</div>
                <div className="text-xs text-neutral-500">Video için yaklaşık {Math.floor(event.max_size_per_user_mb / 25)} dk HD kayda yeter — kısa videolar yükleyin.</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-[#d4af37] mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <div className="font-semibold">{event.retention_days} gün sonra otomatik silinir</div>
                <div className="text-xs text-neutral-500">Silinme tarihi: <b>{new Date(event.delete_at).toLocaleDateString("tr-TR")}</b>. Sonrasında dosyalar sunucudan tamamen silinir.</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="w-4 h-4 text-[#d4af37] mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <div className="font-semibold">KVKK: Verileriniz güvende</div>
                <div className="text-xs text-neutral-500">Yüklediğiniz medya yalnızca etkinliğin çifti ile paylaşılır. Üçüncü taraflarla asla paylaşılmaz.</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {!user ? (
          <Card className="bg-neutral-900 border-neutral-800">
            <CardContent className="pt-6 text-center space-y-4">
              <p className="text-neutral-300">Yükleme yapabilmek için önce hesap oluşturmanız gerekiyor. 30 saniye sürer.</p>
              <div className="flex justify-center gap-2">
                <Button onClick={goLogin} className="bg-[#d4af37] hover:bg-[#b5952f] text-black rounded-full" data-testid="guest-signup-btn">
                  <LogIn className="w-4 h-4 mr-2" /> Kayıt Ol / Giriş Yap
                </Button>
              </div>
              <p className="text-xs text-neutral-500">Zaten hesabınız varsa giriş yaptığınızda otomatik buraya dönersiniz.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {usage && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-neutral-400 mb-1">
                  <span>Kullanım</span>
                  <span>{formatBytes(usage.used_bytes)} / {formatBytes(usage.limit_bytes)} ({usage.used_files} dosya)</span>
                </div>
                <div className="h-2 bg-neutral-800 rounded overflow-hidden">
                  <div className="h-full bg-[#d4af37] transition-all" style={{ width: `${Math.min(100, progress)}%` }} />
                </div>
              </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer mb-4 p-4 rounded-lg border border-neutral-800 bg-neutral-950">
              <Checkbox
                checked={kvkk}
                onCheckedChange={(v) => setKvkk(!!v)}
                data-testid="kvkk-checkbox"
                className="mt-0.5 border-neutral-600 data-[state=checked]:bg-[#d4af37] data-[state=checked]:text-black data-[state=checked]:border-[#d4af37]"
              />
              <span className="text-xs text-neutral-300 leading-relaxed">
                <span className="text-[#d4af37]">*</span> Yüklediğim fotoğraf/videoların çift ile paylaşılmasını, <b>{event.retention_days} gün</b> sonra otomatik silinmesini kabul ediyorum. Kişisel verilerimin bu amaçla işlenmesine <b>KVKK</b> kapsamında onay veriyorum.
              </span>
            </label>

            <div
              className="border-2 border-dashed border-neutral-700 rounded-2xl p-8 text-center hover:border-[#d4af37]/60 transition-colors cursor-pointer"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); onSelectFiles(e.dataTransfer.files); }}
              data-testid="upload-dropzone"
            >
              <UploadCloud className="w-10 h-10 mx-auto mb-3 text-[#d4af37]" />
              <div className="font-serif text-xl mb-1" style={{ fontFamily: "var(--fotuber-font-heading)" }}>Fotoğraf & Video Yükle</div>
              <div className="text-xs text-neutral-500">Tıklayın veya sürükleyip bırakın · Kişi başı {event.max_size_per_user_mb} MB'a kadar</div>
              <input
                ref={inputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => onSelectFiles(e.target.files)}
                data-testid="upload-input"
              />
            </div>

            {queue.length > 0 && (
              <div className="mt-6 space-y-2">
                <div className="text-sm text-neutral-400 mb-2">Dosyalar ({queue.length})</div>
                {queue.map((q, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-neutral-900 border border-neutral-800" data-testid={`queue-item-${i}`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{q.file.name}</div>
                      <div className="text-xs text-neutral-500">{formatBytes(q.file.size)}</div>
                      {q.error && <div className="text-xs text-red-400 mt-1">{q.error}</div>}
                    </div>
                    <div>
                      {q.status === "pending" && <Badge className="bg-neutral-800 text-neutral-400">Sırada</Badge>}
                      {q.status === "uploading" && <Badge className="bg-[#d4af37] text-black">Yükleniyor...</Badge>}
                      {q.status === "done" && <Badge className="bg-emerald-600 text-white"><Check className="w-3 h-3 mr-1" /> Tamam</Badge>}
                      {q.status === "error" && <Badge className="bg-red-600 text-white"><X className="w-3 h-3 mr-1" /> Hata</Badge>}
                    </div>
                  </div>
                ))}
                <div className="flex justify-end pt-2">
                  <Button
                    onClick={uploadNext}
                    disabled={uploading || !kvkk || queue.every((q) => q.status !== "pending")}
                    className="rounded-full bg-[#d4af37] hover:bg-[#b5952f] text-black disabled:opacity-40"
                    data-testid="upload-start-btn"
                  >
                    {uploading ? "Yükleniyor..." : "Yüklemeyi Başlat"}
                  </Button>
                </div>
                <p className="text-xs text-neutral-500 text-center pt-2">
                  Yüklemeniz bittiğinde otomatik olarak çifte ulaşacak. Sayfayı kapatabilirsiniz.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default GuestUpload;
