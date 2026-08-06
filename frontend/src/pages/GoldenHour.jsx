import React, { useEffect, useMemo, useRef, useState } from "react";
import * as SunCalc from "suncalc";
import { Link } from "react-router-dom";
import {
  Sun, Sunrise, Sunset, Moon, Camera, MapPin, Navigation, CalendarDays,
  Cloud, CloudRain, CloudSnow, CloudSun, CloudFog, CloudLightning, Droplets,
  Sparkles, Bot, Heart, ArrowRight, Thermometer, Sun as SunIcon, Search, Loader2,
} from "lucide-react";
import { useSettings } from "@/context/SettingsContext";

// Compact list of major Turkish cities (lat, lng). "Konumumu Kullan" covers the rest.
const CITIES = [
  { k: "istanbul", n: "İstanbul", lat: 41.0082, lng: 28.9784 },
  { k: "ankara", n: "Ankara", lat: 39.9334, lng: 32.8597 },
  { k: "izmir", n: "İzmir", lat: 38.4237, lng: 27.1428 },
  { k: "bursa", n: "Bursa", lat: 40.1826, lng: 29.0669 },
  { k: "antalya", n: "Antalya", lat: 36.8969, lng: 30.7133 },
  { k: "adana", n: "Adana", lat: 37.0000, lng: 35.3213 },
  { k: "konya", n: "Konya", lat: 37.8714, lng: 32.4846 },
  { k: "gaziantep", n: "Gaziantep", lat: 37.0662, lng: 37.3833 },
  { k: "mersin", n: "Mersin", lat: 36.8121, lng: 34.6415 },
  { k: "kayseri", n: "Kayseri", lat: 38.7312, lng: 35.4787 },
  { k: "eskisehir", n: "Eskişehir", lat: 39.7767, lng: 30.5206 },
  { k: "diyarbakir", n: "Diyarbakır", lat: 37.9144, lng: 40.2306 },
  { k: "samsun", n: "Samsun", lat: 41.2867, lng: 36.33 },
  { k: "denizli", n: "Denizli", lat: 37.7765, lng: 29.0864 },
  { k: "trabzon", n: "Trabzon", lat: 41.0027, lng: 39.7168 },
  { k: "mugla", n: "Muğla", lat: 37.2153, lng: 28.3636 },
  { k: "aydin", n: "Aydın", lat: 37.848, lng: 27.8456 },
  { k: "balikesir", n: "Balıkesir", lat: 39.6484, lng: 27.8826 },
  { k: "malatya", n: "Malatya", lat: 38.3552, lng: 38.3095 },
  { k: "erzurum", n: "Erzurum", lat: 39.9, lng: 41.27 },
  { k: "sanliurfa", n: "Şanlıurfa", lat: 37.1591, lng: 38.7969 },
  { k: "van", n: "Van", lat: 38.4891, lng: 43.4089 },
  { k: "canakkale", n: "Çanakkale", lat: 40.1553, lng: 26.4142 },
  { k: "bodrum", n: "Bodrum", lat: 37.0344, lng: 27.4305 },
  { k: "cesme", n: "Çeşme", lat: 38.3225, lng: 26.3033 },
  { k: "kapadokya", n: "Kapadokya (Nevşehir)", lat: 38.6431, lng: 34.8289 },
];

// City-specific recommended shooting spots (a) + generic fallback (b)
const SPOTS = {
  istanbul: ["Gülhane Parkı & Sarayburnu", "Emirgan Korusu", "Rumeli Hisarı sahili", "Kuzguncuk sokakları", "Kız Kulesi / Salacak sahili"],
  ankara: ["Seğmenler Parkı", "Kuğulu Park", "Beypazarı tarihi evleri", "Eymir Gölü", "Anıtkabir çevresi"],
  izmir: ["Kordon boyu", "Asansör / Karataş", "Kadifekale surları", "Şirince köyü", "Alsancak sokakları"],
  antalya: ["Kaleiçi & marina", "Düden Şelalesi", "Konyaaltı sahili", "Lara falezleri", "Karaalioğlu Parkı"],
  bursa: ["Cumalıkızık köyü", "Uludağ etekleri", "Yeşil Türbe çevresi", "Botanik Park", "Zafer Plaza terası"],
  mugla: ["Marmaris sahili", "Datça koyları", "Akyaka & Azmak", "Ölüdeniz manzarası", "eski Muğla evleri"],
  bodrum: ["Bodrum Kalesi", "Gümüşlük batık şehir", "yat limanı", "Yalıkavak marina", "beyaz taş sokaklar"],
  cesme: ["Çeşme Kalesi", "Alaçatı taş evleri", "yel değirmenleri", "Ilıca sahili", "marina günbatımı"],
  kapadokya: ["Göreme vadisi", "Uçhisar Kalesi", "Aşk Vadisi", "Paşabağ peri bacaları", "balon manzara tepesi"],
  trabzon: ["Uzungöl", "Boztepe manzarası", "Atatürk Köşkü bahçesi", "Sümela çevresi", "sahil boyu"],
};
const GENERIC_SPOTS = [
  "Şehir sahili / göl kenarı (gün batımı manzarası)",
  "Tarihi doku & eski taş sokaklar",
  "Şehir parkı, koru veya botanik bahçe",
  "Yüksek tepe / panoramik manzara noktası",
  "Doğa alanı, orman veya çayır (altın saat için ideal)",
];

// AI-generated golden/blue hour cover imagery
const COVERS = {
  hero: "https://static.prod-images.emergentagent.com/jobs/fc76a8ea-b91a-4ba1-bc47-0822af835ee4/images/bd6419db0e99de2e831e2a38bd305898d23335a98e04fd9dd756e8b96ba6f1fa.jpeg",
  blue: "https://static.prod-images.emergentagent.com/jobs/fc76a8ea-b91a-4ba1-bc47-0822af835ee4/images/fb9ab914e1d72b53d1e6c4531d667c8e978254968188a30409caae8905968462.jpeg",
  field: "https://static.prod-images.emergentagent.com/jobs/fc76a8ea-b91a-4ba1-bc47-0822af835ee4/images/69bc1389e304757509e743124ee74362676918a96fe8119851a2793551dc67eb.jpeg",
};
const WEEKDAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

// WMO weather code → Turkish label + icon
const wmo = (c) => {
  if (c == null) return { t: "—", I: Cloud, color: "#9ca3af" };
  if (c === 0) return { t: "Açık", I: SunIcon, color: "#e6b34a" };
  if (c <= 2) return { t: "Parçalı bulutlu", I: CloudSun, color: "#e6c06a" };
  if (c === 3) return { t: "Kapalı", I: Cloud, color: "#9ca3af" };
  if (c <= 48) return { t: "Sisli", I: CloudFog, color: "#a3a3a3" };
  if (c <= 57) return { t: "Çiseleme", I: CloudRain, color: "#6b8bd6" };
  if (c <= 67) return { t: "Yağmurlu", I: CloudRain, color: "#5b7fd6" };
  if (c <= 77) return { t: "Karlı", I: CloudSnow, color: "#a7c7ff" };
  if (c <= 82) return { t: "Sağanak yağış", I: CloudRain, color: "#4f74cf" };
  if (c <= 86) return { t: "Kar sağanağı", I: CloudSnow, color: "#a7c7ff" };
  return { t: "Gök gürültülü fırtına", I: CloudLightning, color: "#7c6ad0" };
};

const inTz = (d, tz) => {
  if (!d || isNaN(d)) return null;
  const parts = new Intl.DateTimeFormat("tr-TR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const h = +parts.find((p) => p.type === "hour").value;
  const m = +parts.find((p) => p.type === "minute").value;
  return { h: h === 24 ? 0 : h, m };
};
const fmt = (d, tz) => { const x = inTz(d, tz); return x ? String(x.h).padStart(2, "0") + ":" + String(x.m).padStart(2, "0") : "—"; };
const minsOfDay = (d, tz) => { const x = inTz(d, tz); return x ? x.h * 60 + x.m : null; };

// WhatsApp brand logo (green circle + white glyph)
const WhatsAppLogo = ({ className = "" }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
    <circle cx="16" cy="16" r="16" fill="#25D366" />
    <path fill="#fff" d="M16 6.5c-5.24 0-9.5 4.26-9.5 9.5 0 1.67.44 3.29 1.27 4.72L6.5 25.5l4.94-1.29a9.46 9.46 0 004.56 1.16h.01c5.24 0 9.49-4.26 9.49-9.5 0-2.54-.99-4.92-2.78-6.71A9.42 9.42 0 0016 6.5zm0 17.03h-.01a7.87 7.87 0 01-4.01-1.1l-.29-.17-2.93.77.78-2.86-.19-.29a7.86 7.86 0 01-1.2-4.18c0-4.35 3.54-7.89 7.9-7.89 2.11 0 4.09.82 5.58 2.31a7.83 7.83 0 012.31 5.58c0 4.35-3.54 7.9-7.9 7.9z" />
    <path fill="#fff" d="M20.34 18.02c-.24-.12-1.4-.69-1.61-.77-.22-.08-.38-.12-.53.12-.16.24-.61.77-.75.93-.14.16-.28.18-.51.06-.24-.12-1-.37-1.9-1.17-.7-.63-1.18-1.4-1.32-1.63-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.53-1.29-.73-1.76-.19-.46-.39-.4-.53-.41-.14-.01-.3-.01-.46-.01-.16 0-.42.06-.63.3-.22.24-.83.81-.83 1.98 0 1.17.85 2.3.97 2.46.12.16 1.68 2.56 4.07 3.59.57.24 1.01.39 1.36.5.57.18 1.09.16 1.5.1.46-.07 1.4-.57 1.6-1.13.2-.55.2-1.02.14-1.13-.06-.11-.22-.17-.46-.29z" />
  </svg>
);

// Instagram brand logo (gradient rounded square)
const InstagramLogo = ({ className = "" }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
    <defs>
      <radialGradient id="ig-grad" cx="30%" cy="107%" r="150%">
        <stop offset="0" stopColor="#fdf497" />
        <stop offset="0.05" stopColor="#fdf497" />
        <stop offset="0.45" stopColor="#fd5949" />
        <stop offset="0.6" stopColor="#d6249f" />
        <stop offset="0.9" stopColor="#285AEB" />
      </radialGradient>
    </defs>
    <rect x="1" y="1" width="30" height="30" rx="8" fill="url(#ig-grad)" />
    <rect x="8.5" y="8.5" width="15" height="15" rx="5" fill="none" stroke="#fff" strokeWidth="2" />
    <circle cx="16" cy="16" r="4" fill="none" stroke="#fff" strokeWidth="2" />
    <circle cx="21" cy="11" r="1.4" fill="#fff" />
  </svg>
);

export default function GoldenHour() {
  const { settings } = useSettings();
  const [cityKey, setCityKey] = useState("istanbul");
  const [coords, setCoords] = useState(null); // {lat,lng,name} from geolocation
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [locBusy, setLocBusy] = useState(false);
  const [weather, setWeather] = useState(null);
  const [wxState, setWxState] = useState("idle"); // idle | loading | ok | none | error
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimer = useRef(null);

  const place = coords || CITIES.find((c) => c.k === cityKey) || CITIES[0];
  const tz = "Europe/Istanbul"; // App targets Turkey — always Istanbul tz
  const date = useMemo(() => { const d = new Date(dateStr + "T12:00:00"); return isNaN(d) ? new Date() : d; }, [dateStr]);
  const t = useMemo(() => SunCalc.getTimes(date, place.lat, place.lng), [date, place]);

  // Live province/district autocomplete via Open-Meteo geocoding (free, no key, all TR)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const u = new URL("https://geocoding-api.open-meteo.com/v1/search");
        u.searchParams.set("name", q);
        u.searchParams.set("count", "12");
        u.searchParams.set("language", "tr");
        const res = await fetch(u.toString());
        const j = await res.json();
        const rs = (j.results || []).filter((r) => r.country_code === "TR");
        setResults(rs);
        setShowResults(true);
      } catch (_) { setResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query]);

  const pickResult = (r) => {
    const label = r.admin1 && r.admin1 !== r.name ? `${r.name}, ${r.admin1}` : r.name;
    setCoords({ lat: r.latitude, lng: r.longitude, n: label });
    setQuery(label);
    setShowResults(false);
    setResults([]);
  };

  // Fetch weather directly from Open-Meteo (free, no key). Works for cities & geolocation coords.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setWxState("loading");
      try {
        const u = new URL("https://api.open-meteo.com/v1/forecast");
        u.searchParams.set("latitude", place.lat);
        u.searchParams.set("longitude", place.lng);
        u.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,uv_index_max,weather_code");
        u.searchParams.set("timezone", "Europe/Istanbul");
        u.searchParams.set("start_date", dateStr);
        u.searchParams.set("end_date", dateStr);
        const res = await fetch(u.toString());
        const j = await res.json();
        const d = j.daily;
        if (cancelled) return;
        if (!d || !d.time || !d.time.length) { setWeather(null); setWxState("none"); return; }
        setWeather({
          tMax: d.temperature_2m_max?.[0],
          tMin: d.temperature_2m_min?.[0],
          precip: d.precipitation_sum?.[0],
          precipProb: d.precipitation_probability_max?.[0],
          uv: d.uv_index_max?.[0],
          code: d.weather_code?.[0],
        });
        setWxState("ok");
      } catch (_) {
        if (!cancelled) { setWeather(null); setWxState("error"); }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [place.lat, place.lng, dateStr]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, n: "Konumum" }); setLocBusy(false); },
      () => { setLocBusy(false); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const blocks = [
    { key: "dawn", Icon: Moon, title: "Sabah Mavi Saat", time: `${fmt(t.dawn, tz)} – ${fmt(t.sunrise, tz)}`, note: "Yumuşak, serin ışık", color: "#5b6aa8", tip: false },
    { key: "sunrise", Icon: Sunrise, title: "Gün Doğumu", time: fmt(t.sunrise, tz), note: "Güneş ufukta", color: "#e6885a", tip: false },
    { key: "mgold", Icon: Sun, title: "Sabah Altın Saat", time: `${fmt(t.sunrise, tz)} – ${fmt(t.goldenHourEnd, tz)}`, note: "Sıcak, yumuşak ışık", color: "#e6b34a", tip: true },
    { key: "noon", Icon: Sun, title: "Öğle (Sert Işık)", time: fmt(t.solarNoon, tz), note: "Sert gölgeler — kaçının", color: "#c9c9c9", tip: false },
    { key: "egold", Icon: Sun, title: "Akşam Altın Saat", time: `${fmt(t.goldenHour, tz)} – ${fmt(t.sunset, tz)}`, note: "En iyi düğün ışığı ✨", color: "#e6a24a", tip: true },
    { key: "sunset", Icon: Sunset, title: "Gün Batımı", time: fmt(t.sunset, tz), note: "Güneş batıyor", color: "#d9603f", tip: false },
    { key: "dusk", Icon: Moon, title: "Akşam Mavi Saat", time: `${fmt(t.sunset, tz)} – ${fmt(t.dusk, tz)}`, note: "Sinematik gökyüzü", color: "#455a9e", tip: false },
  ];

  // Timeline segments (golden + blue) across 24h.
  const seg = (a, b, color) => {
    const s = minsOfDay(a, tz), e = minsOfDay(b, tz);
    if (s == null || e == null) return null;
    return { left: (s / 1440) * 100, width: Math.max(0.5, ((e - s) / 1440) * 100), color };
  };
  const segments = [
    seg(t.dawn, t.sunrise, "#5b6aa8"),
    seg(t.sunrise, t.goldenHourEnd, "#e6b34a"),
    seg(t.goldenHour, t.sunset, "#e6a24a"),
    seg(t.sunset, t.dusk, "#455a9e"),
  ].filter(Boolean);

  const spots = SPOTS[cityKey] && !coords ? SPOTS[cityKey] : GENERIC_SPOTS;
  const goldenWindow = `${fmt(t.goldenHour, tz)}–${fmt(t.sunset, tz)}`;
  const prettyDate = new Date(date).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });

  // Weekly light calendar — next 7 days from the selected date
  const week = useMemo(() => {
    const base = new Date(dateStr + "T12:00:00");
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const tt = SunCalc.getTimes(d, place.lat, place.lng);
      out.push({
        date: d,
        wd: WEEKDAYS[d.getDay()],
        dm: `${d.getDate()} ${MONTHS[d.getMonth()]}`,
        golden: `${fmt(tt.goldenHour, tz)}–${fmt(tt.sunset, tz)}`,
        sunset: fmt(tt.sunset, tz),
        blue: `${fmt(tt.sunset, tz)}–${fmt(tt.dusk, tz)}`,
        isSel: i === 0,
      });
    }
    return out;
  }, [dateStr, place, tz]);

  // Cross-navigation → open Fotuber AI Assistant with city + date prefilled (user writes the question)
  const askAssistant = () => {
    window.dispatchEvent(new CustomEvent("fotuber-ai-open", {
      detail: { city: place.n, date: dateStr, goldenTime: goldenWindow },
    }));
  };

  // Social links from settings
  const igRaw = (settings?.instagram || "").trim();
  const igUrl = igRaw ? (/^https?:\/\//i.test(igRaw) ? igRaw : `https://instagram.com/${igRaw.replace(/^@/, "")}`) : null;
  const waRaw = (settings?.whatsapp || settings?.phone || "").replace(/\D/g, "");
  const waNum = waRaw.startsWith("90") ? waRaw : waRaw.startsWith("0") ? `9${waRaw}` : waRaw;
  const waMsg = encodeURIComponent(`Merhaba, ${place.n} için ${prettyDate} tarihinde altın saat (${goldenWindow}) çekimi hakkında bilgi almak istiyorum.`);
  const waUrl = waNum ? `https://wa.me/${waNum}?text=${waMsg}` : null;

  const WxIcon = wmo(weather?.code).I;

  return (
    <div className="min-h-screen bg-neutral-950 text-white" data-testid="golden-hour-page">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-neutral-900">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${COVERS.hero})` }} />
        <div className="absolute inset-0 bg-neutral-950/72" />
        <div className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 80% -10%, #e6a24a33, transparent 55%), radial-gradient(90% 80% at 10% 120%, #455a9e33, transparent 55%)" }} />
        <div className="relative max-w-5xl mx-auto px-6 py-20 sm:py-24 text-center">
          <div className="inline-flex items-center gap-2 text-[#e6c06a] text-xs tracking-[0.35em] uppercase mb-3 drop-shadow"><Camera className="w-4 h-4" /> Fotuber Işık Aracı · Ücretsiz</div>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl drop-shadow-[0_2px_20px_rgba(0,0,0,0.6)]">Altın Saat & Gün Batımı</h1>
          <p className="text-neutral-200 mt-4 max-w-2xl mx-auto drop-shadow">Çekiminizi mükemmel ışıkta planlayın. Şehir ve tarih seçin; altın saat, mavi saat, gün batımı ve o günün hava durumunu anında görün.</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Search — all provinces & districts (Open-Meteo geocoding) */}
        <div className="relative mb-3" data-testid="gh-search-wrap">
          <label className="text-xs text-neutral-500 flex items-center gap-1 mb-1"><Search className="w-3.5 h-3.5" /> İl / İlçe Ara — Tüm Türkiye</label>
          <div className="relative">
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
              onFocus={() => { if (results.length) setShowResults(true); }}
              onBlur={() => setTimeout(() => setShowResults(false), 150)}
              placeholder="Örn: Kadıköy, Çankaya, Alaçatı, Uzungöl, Ürgüp…"
              data-testid="gh-search"
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-9 pr-9 py-2.5 text-sm outline-none focus:border-[#e6a24a]"
            />
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            {searching && <Loader2 className="w-4 h-4 text-neutral-500 absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />}
          </div>
          {showResults && results.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden shadow-2xl max-h-72 overflow-y-auto" data-testid="gh-search-results">
              {results.map((r, i) => (
                <button key={`${r.id}-${i}`} onMouseDown={() => pickResult(r)} data-testid={`gh-search-result-${i}`}
                  className="w-full text-left px-3 py-2.5 hover:bg-neutral-800 flex items-center justify-between border-b border-neutral-800/50 last:border-0">
                  <span className="text-sm">
                    {r.name}
                    {(r.admin1 && r.admin1 !== r.name) && <span className="text-neutral-500">, {r.admin1}</span>}
                    {(r.admin2 && r.admin2 !== r.admin1 && r.admin2 !== r.name) && <span className="text-neutral-600 text-xs"> · {r.admin2}</span>}
                  </span>
                  <MapPin className="w-3.5 h-3.5 text-[#e6a24a] shrink-0" />
                </button>
              ))}
            </div>
          )}
          {showResults && !searching && query.trim().length >= 2 && results.length === 0 && (
            <div className="absolute z-20 mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm text-neutral-500">Sonuç bulunamadı. Farklı bir yazım deneyin.</div>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="flex-1">
            <label className="text-xs text-neutral-500 flex items-center gap-1 mb-1"><MapPin className="w-3.5 h-3.5" /> Popüler Şehir</label>
            <select value={coords ? "__loc" : cityKey}
              onChange={(e) => { if (e.target.value === "__loc") return; setCoords(null); setQuery(""); setCityKey(e.target.value); }}
              data-testid="gh-city"
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#e6a24a]">
              {coords && <option value="__loc">📍 {place.n}</option>}
              {CITIES.map((c) => <option key={c.k} value={c.k}>{c.n}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-neutral-500 flex items-center gap-1 mb-1"><CalendarDays className="w-3.5 h-3.5" /> Tarih</label>
            <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} data-testid="gh-date"
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#e6a24a] [color-scheme:dark]" />
          </div>
          <div className="flex items-end">
            <button onClick={useMyLocation} disabled={locBusy} data-testid="gh-geolocate"
              className="w-full sm:w-auto h-[42px] px-4 rounded-lg bg-[#e6a24a] text-neutral-950 font-semibold flex items-center justify-center gap-2 hover:bg-[#f0b45f] transition">
              <Navigation className="w-4 h-4" /> {locBusy ? "Bulunuyor…" : "Konumumu Kullan"}
            </button>
          </div>
        </div>

        {/* Mini map — current selected location */}
        <div className="mb-8 rounded-2xl border border-neutral-800 overflow-hidden" data-testid="gh-map">
          <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-900/60">
            <div className="flex items-center gap-2 text-sm"><MapPin className="w-4 h-4 text-[#e6a24a]" /> <span className="font-medium">{place.n}</span></div>
            <a href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`} target="_blank" rel="noopener noreferrer"
              data-testid="gh-map-directions" className="text-xs text-[#e6a24a] hover:text-[#f0b45f] flex items-center gap-1">
              <Navigation className="w-3.5 h-3.5" /> Yol Tarifi
            </a>
          </div>
          <iframe
            title="Konum Haritası"
            data-testid="gh-map-frame"
            className="w-full h-64 border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${place.lng - 0.08}%2C${place.lat - 0.05}%2C${place.lng + 0.08}%2C${place.lat + 0.05}&layer=mapnik&marker=${place.lat}%2C${place.lng}`}
          />
        </div>

        {/* Weather strip */}
        <div className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4" data-testid="gh-weather">
          {wxState === "loading" && <div className="text-sm text-neutral-500">Hava durumu yükleniyor…</div>}
          {wxState === "none" && <div className="text-sm text-neutral-500">Bu tarih için hava tahmini mevcut değil (yalnızca ~16 gün içindeki tarihler).</div>}
          {wxState === "error" && <div className="text-sm text-neutral-500">Hava durumu şu an alınamadı.</div>}
          {wxState === "ok" && weather && (
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-xl grid place-items-center" style={{ background: `${wmo(weather.code).color}22`, color: wmo(weather.code).color }}><WxIcon className="w-6 h-6" /></span>
                <div>
                  <div className="text-sm font-medium">{wmo(weather.code).t}</div>
                  <div className="text-xs text-neutral-500">{place.n} · {prettyDate}</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-sm"><Thermometer className="w-4 h-4 text-[#e6885a]" /> {Math.round(weather.tMax)}° / {Math.round(weather.tMin)}°</div>
              <div className="flex items-center gap-1.5 text-sm"><Droplets className="w-4 h-4 text-[#5b7fd6]" /> Yağış {weather.precipProb != null ? `%${weather.precipProb}` : `${weather.precip ?? 0} mm`}</div>
              <div className="flex items-center gap-1.5 text-sm"><Sun className="w-4 h-4 text-[#e6b34a]" /> UV {weather.uv != null ? Math.round(weather.uv) : "—"}</div>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="mb-8">
          <div className="flex justify-between text-[10px] text-neutral-600 mb-1"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
          <div className="relative h-3 rounded-full bg-neutral-900 overflow-hidden" data-testid="gh-timeline">
            {segments.map((s, i) => (
              <div key={i} className="absolute top-0 bottom-0" style={{ left: `${s.left}%`, width: `${s.width}%`, background: s.color }} />
            ))}
          </div>
        </div>

        {/* Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="gh-results">
          {blocks.map((b) => {
            const Icon = b.Icon;
            return (
              <div key={b.key} className={`rounded-2xl border p-4 ${b.tip ? "border-[#e6a24a]/50 bg-[#e6a24a]/5" : "border-neutral-800 bg-neutral-900/50"}`} data-testid={`gh-block-${b.key}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-9 h-9 rounded-lg grid place-items-center" style={{ background: `${b.color}22`, color: b.color }}><Icon className="w-5 h-5" /></span>
                  <div className="text-sm font-medium">{b.title}{b.tip && <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#e6a24a] text-neutral-950">ÖNERİLEN</span>}</div>
                </div>
                <div className="text-2xl font-serif">{b.time}</div>
                <div className="text-xs text-neutral-500 mt-1">{b.note}</div>
              </div>
            );
          })}
        </div>

        {/* Weekly light calendar */}
        <div className="mt-8 rounded-2xl border border-neutral-800 overflow-hidden" data-testid="gh-week">
          <div className="relative h-28 sm:h-32">
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${COVERS.field})` }} />
            <div className="absolute inset-0 bg-gradient-to-r from-neutral-950/90 via-neutral-950/60 to-neutral-950/30" />
            <div className="relative h-full flex flex-col justify-center px-5">
              <div className="inline-flex items-center gap-2 text-[#e6c06a] text-[10px] tracking-[0.3em] uppercase mb-1"><CalendarDays className="w-3.5 h-3.5" /> 7 Günlük Işık Takvimi</div>
              <div className="font-serif text-xl sm:text-2xl">{place.n} · Önümüzdeki 7 Gün</div>
            </div>
          </div>
          <div className="p-3 bg-neutral-900/40">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {week.map((w, i) => (
                <button key={i} onClick={() => setDateStr(w.date.toISOString().slice(0, 10))} data-testid={`gh-week-${i}`}
                  className={`text-left rounded-xl border p-3 transition ${w.isSel ? "border-[#e6a24a] bg-[#e6a24a]/10" : "border-neutral-800 bg-neutral-950/40 hover:border-neutral-700"}`}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-neutral-300">{w.wd}</span>
                    <span className="text-[10px] text-neutral-500">{w.dm}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-[#e6a24a]"><Sun className="w-3 h-3" /> <span className="text-sm font-medium">{w.golden}</span></div>
                  <div className="mt-0.5 flex items-center gap-1 text-neutral-400"><Sunset className="w-3 h-3" /> <span className="text-xs">{w.sunset}</span></div>
                  <div className="mt-0.5 flex items-center gap-1 text-[#7c8fd0]"><Moon className="w-3 h-3" /> <span className="text-[11px]">{w.blue}</span></div>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-neutral-500 px-1">Bir güne dokunarak o günün detaylarını yukarıda görebilirsiniz. <span className="text-[#e6a24a]">Altın saat</span> · Gün batımı · <span className="text-[#7c8fd0]">Mavi saat</span></p>
          </div>
        </div>

        {/* Recommended shooting spots */}
        <div className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5" data-testid="gh-spots">
          <div className="flex items-center gap-2 mb-3 text-[#e6a24a]"><MapPin className="w-4 h-4" /> <span className="text-sm font-semibold tracking-wide">{place.n} · Önerilen Çekim Mekanları</span></div>
          <ul className="grid sm:grid-cols-2 gap-2">
            {spots.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-neutral-300" data-testid={`gh-spot-${i}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-[#e6a24a] shrink-0" /> {s}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-neutral-500">Akşam altın saatte (<b className="text-[#e6a24a]">{goldenWindow}</b>) bu mekanlarda ışık en zarif haliyle olur.</p>
        </div>

        <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 text-sm text-neutral-400">
          <p><b className="text-white">İpucu:</b> Dış mekan düğün, nişan ve çift çekimleri için <b className="text-[#e6a24a]">Akşam Altın Saat</b> (gün batımından hemen önce) en sıcak ve en zarif ışığı verir. Hemen ardından gelen <b className="text-[#5b6aa8]">Mavi Saat</b> ise sinematik gökyüzü tonları için idealdir.</p>
        </div>

        {/* Action funnel */}
        <div className="mt-10 rounded-3xl border border-[#e6a24a]/30 bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 p-6 sm:p-8" data-testid="gh-cta">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[#e6a24a] mb-2"><Sparkles className="w-4 h-4" /> Sıradaki Adım</div>
            <h3 className="font-serif text-2xl sm:text-3xl">Bu ışıkta çekiminizi planlayalım</h3>
            <p className="text-neutral-400 mt-2 text-sm max-w-xl mx-auto">Kıyafet ve mekan için asistana danışın, randevu alın veya davetiyenizi hazırlayın.</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <button onClick={askAssistant} data-testid="gh-cta-assistant"
              className="rounded-2xl border border-[#d4af37]/40 bg-[#d4af37]/10 hover:bg-[#d4af37]/20 hover:border-[#d4af37] transition p-4 flex flex-col items-start gap-2 text-left">
              <span className="w-10 h-10 rounded-xl bg-[#d4af37]/20 grid place-items-center text-[#e6c06a]"><Bot className="w-5 h-5" /></span>
              <div className="font-semibold">Asistana Sor</div>
              <div className="text-xs text-neutral-400">Bu ışık ve mekana göre kıyafet & poz önerisi al</div>
            </button>

            <Link to="/randevu" data-testid="gh-cta-booking"
              className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 hover:border-emerald-500 transition p-4 flex flex-col items-start gap-2 text-left">
              <span className="w-10 h-10 rounded-xl bg-emerald-500/20 grid place-items-center text-emerald-400"><CalendarDays className="w-5 h-5" /></span>
              <div className="font-semibold flex items-center gap-1">Randevu Al <ArrowRight className="w-3.5 h-3.5" /></div>
              <div className="text-xs text-neutral-400">Altın saatinizi takvimden hemen ayırtın</div>
            </Link>

            <Link to="/davetiye-olustur" data-testid="gh-cta-invitation"
              className="rounded-2xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 hover:border-rose-500 transition p-4 flex flex-col items-start gap-2 text-left">
              <span className="w-10 h-10 rounded-xl bg-rose-500/20 grid place-items-center text-rose-400"><Heart className="w-5 h-5" fill="currentColor" /></span>
              <div className="font-semibold flex items-center gap-1">Davetiye Oluştur <ArrowRight className="w-3.5 h-3.5" /></div>
              <div className="text-xs text-neutral-400">Özel gününüz için dijital davetiye hazırlayın</div>
            </Link>
          </div>

          {/* Social */}
          {(igUrl || waUrl) && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              {waUrl && (
                <a href={waUrl} target="_blank" rel="noopener noreferrer" data-testid="gh-whatsapp"
                  className="inline-flex items-center gap-2 rounded-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold px-5 h-11 transition shadow-[0_0_20px_rgba(37,211,102,0.35)]">
                  <WhatsAppLogo className="w-6 h-6" /> WhatsApp'tan Yaz
                </a>
              )}
              {igUrl && (
                <a href={igUrl} target="_blank" rel="noopener noreferrer" data-testid="gh-instagram"
                  className="inline-flex items-center gap-2 rounded-full bg-neutral-900 border border-neutral-700 hover:border-transparent text-white font-semibold px-5 h-11 transition"
                  style={{ backgroundImage: "linear-gradient(90deg, rgba(214,36,159,0.12), rgba(40,90,235,0.12))" }}>
                  <InstagramLogo className="w-6 h-6" /> Instagram'da İncele
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
