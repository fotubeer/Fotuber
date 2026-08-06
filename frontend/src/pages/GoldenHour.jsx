import React, { useMemo, useState } from "react";
import * as SunCalc from "suncalc";
import { Sun, Sunrise, Sunset, Moon, Camera, MapPin, Navigation, CalendarDays } from "lucide-react";

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

const inTz = (d, tz) => {
  if (!d || isNaN(d)) return null;
  const parts = new Intl.DateTimeFormat("tr-TR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const h = +parts.find((p) => p.type === "hour").value;
  const m = +parts.find((p) => p.type === "minute").value;
  return { h: h === 24 ? 0 : h, m };
};
const fmt = (d, tz) => { const x = inTz(d, tz); return x ? String(x.h).padStart(2, "0") + ":" + String(x.m).padStart(2, "0") : "—"; };
const minsOfDay = (d, tz) => { const x = inTz(d, tz); return x ? x.h * 60 + x.m : null; };

export default function GoldenHour() {
  const [cityKey, setCityKey] = useState("istanbul");
  const [coords, setCoords] = useState(null); // {lat,lng,name} from geolocation
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [locBusy, setLocBusy] = useState(false);

  const place = coords || CITIES.find((c) => c.k === cityKey) || CITIES[0];
  const tz = coords ? undefined : "Europe/Istanbul";
  const date = useMemo(() => { const d = new Date(dateStr + "T12:00:00"); return isNaN(d) ? new Date() : d; }, [dateStr]);
  const t = useMemo(() => SunCalc.getTimes(date, place.lat, place.lng), [date, place]);

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

  return (
    <div className="min-h-screen bg-neutral-950 text-white" data-testid="golden-hour-page">
        {/* Hero */}
        <div className="relative overflow-hidden border-b border-neutral-900">
          <div className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 80% -10%, #e6a24a33, transparent 55%), radial-gradient(90% 80% at 10% 120%, #455a9e33, transparent 55%)" }} />
          <div className="relative max-w-5xl mx-auto px-6 py-16 text-center">
            <div className="inline-flex items-center gap-2 text-[#e6a24a] text-xs tracking-[0.35em] uppercase mb-3"><Camera className="w-4 h-4" /> Fotuber Işık Aracı</div>
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl">Altın Saat & Gün Batımı</h1>
            <p className="text-neutral-400 mt-4 max-w-2xl mx-auto">Çekiminizi mükemmel ışıkta planlayın. Şehir ve tarih seçin; altın saat, mavi saat ve gün batımı saatlerini anında görün.</p>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-6 py-10">
          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <div className="flex-1">
              <label className="text-xs text-neutral-500 flex items-center gap-1 mb-1"><MapPin className="w-3.5 h-3.5" /> Şehir</label>
              <select value={coords ? "__loc" : cityKey}
                onChange={(e) => { if (e.target.value === "__loc") return; setCoords(null); setCityKey(e.target.value); }}
                data-testid="gh-city"
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#e6a24a]">
                {coords && <option value="__loc">📍 Konumum</option>}
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

          <div className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 text-sm text-neutral-400">
            <p><b className="text-white">İpucu:</b> Dış mekan düğün, nişan ve çift çekimleri için <b className="text-[#e6a24a]">Akşam Altın Saat</b> (gün batımından hemen önce) en sıcak ve en zarif ışığı verir. Hemen ardından gelen <b className="text-[#5b6aa8]">Mavi Saat</b> ise sinematik gökyüzü tonları için idealdir.</p>
            <p className="mt-3 text-neutral-500">{place.n} · {new Date(date).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
        </div>
      </div>
  );
}
