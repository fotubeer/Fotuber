import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast, Toaster } from "sonner";
import { Download, Loader2, Heart, CircleDot, Flower2, Star, Moon, Minus, ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QRCodeCanvas } from "qrcode.react";
import { EVENT_TYPE_LABELS } from "@/lib/invitationThemes";
import { getMessagesFor } from "@/lib/invitationMessages";

const API = process.env.REACT_APP_BACKEND_URL;

const SIZES = [
  { key: "a5", label: "A5 (148×210mm)" },
  { key: "a6", label: "A6 (105×148mm)" },
  { key: "10x15", label: "10×15 cm" },
  { key: "dl", label: "DL (99×210mm)" },
];

const SIZE_RATIO = { a5: "148 / 210", a6: "105 / 148", "10x15": "100 / 150", dl: "99 / 210" };

const SYMBOLS = [
  { key: "heart", label: "Kalp", Icon: Heart },
  { key: "rings", label: "Yüzük", Icon: CircleDot },
  { key: "floral", label: "Çiçek", Icon: Flower2 },
  { key: "star", label: "Yıldız", Icon: Star },
  { key: "crescent", label: "Ay & Yıldız", Icon: Moon },
  { key: "none", label: "Yok", Icon: Minus },
];

const PALETTES = [
  { name: "Romantik", bg_color: "#FFF1F2", accent_color: "#D8A7B1", text_color: "#4A3B3C" },
  { name: "Altın", bg_color: "#FBF7EF", accent_color: "#C79A3B", text_color: "#3A362B" },
  { name: "Botanik", bg_color: "#F2F7F0", accent_color: "#7C9A82", text_color: "#2C3E35" },
  { name: "Mavi", bg_color: "#EFF6FF", accent_color: "#6E93B5", text_color: "#2A3644" },
  { name: "Mermer", bg_color: "#FDF6F2", accent_color: "#B76E79", text_color: "#4A2F33" },
  { name: "Noir", bg_color: "#0D0D0D", accent_color: "#D4AF37", text_color: "#F5EEDE" },
];

const prettyDate = (d) => {
  if (!d) return "Tarih";
  try { return new Date(`${d}T00:00:00`).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" }); }
  catch { return d; }
};

const SymbolMark = ({ kind, color, size = 26 }) => {
  const found = SYMBOLS.find((s) => s.key === kind);
  if (!found || kind === "none") return null;
  const Icon = found.Icon;
  return <Icon style={{ color }} width={size} height={size} strokeWidth={1.6} />;
};

export default function PrintInvitation() {
  const [f, setF] = useState({
    person1: "", person2: "", event_type: "dugun", event_date: "", event_time: "",
    venue_name: "", venue_address: "", message: "", size: "a5", symbol: "heart",
    bg_color: "#FFF1F2", accent_color: "#D8A7B1", text_color: "#4A3B3C", qr_url: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const applyPalette = (p) => setF((prev) => ({ ...prev, bg_color: p.bg_color, accent_color: p.accent_color, text_color: p.text_color }));

  const names = useMemo(() => (f.person2 ? `${f.person1 || "İsim"} & ${f.person2}` : (f.person1 || "İsimler")), [f.person1, f.person2]);
  const dark = useMemo(() => {
    const c = f.bg_color.replace("#", ""); const n = parseInt(c.length === 3 ? c.split("").map((x) => x + x).join("") : c, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) < 110;
  }, [f.bg_color]);

  const download = async () => {
    if (!f.person1.trim()) { toast.error("En az bir isim girin"); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/invitations/print-pdf`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || "PDF oluşturulamadı"); }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `davetiye-${(f.person1 || "baski").toLowerCase()}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("PDF indirildi — baskıya hazır!");
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <Toaster position="top-center" richColors />
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
        <Link to="/" className="text-sm text-slate-600 flex items-center gap-1" data-testid="print-back-home"><ArrowLeft className="w-4 h-4" /> Ana Sayfa</Link>
        <Link to="/davetiye-olustur" className="text-sm text-indigo-600 flex items-center gap-1" data-testid="print-to-digital">
          <Sparkles className="w-4 h-4" /> Dijital Davetiye Oluştur
        </Link>
      </div>

      <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-0">
        {/* Form */}
        <div className="p-6 sm:p-10 bg-white min-h-screen overflow-y-auto text-slate-900">
          <div className="mb-6">
            <div className="text-xs uppercase tracking-widest text-rose-600 font-semibold">Fotuber · Baskıya Hazır Davetiye</div>
            <h1 className="text-3xl font-bold text-slate-900 mt-1">Baskı Davetiyesi Oluştur</h1>
            <p className="text-sm text-slate-500 mt-1">Bilgileri girin, rengi ve sembolü seçin, yüksek kaliteli baskıya hazır PDF'i ücretsiz indirin.</p>
          </div>

          <div className="space-y-5">
            <div>
              <Label>Etkinlik Türü</Label>
              <Select value={f.event_type} onValueChange={(v) => set("event_type", v)}>
                <SelectTrigger data-testid="print-event-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>1. İsim *</Label><Input value={f.person1} onChange={(e) => set("person1", e.target.value)} placeholder="Ahmet" data-testid="print-person1" /></div>
              <div><Label>2. İsim</Label><Input value={f.person2} onChange={(e) => set("person2", e.target.value)} placeholder="Yasemin" data-testid="print-person2" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tarih</Label><Input type="date" value={f.event_date} onChange={(e) => set("event_date", e.target.value)} data-testid="print-date" /></div>
              <div><Label>Saat</Label><Input type="time" value={f.event_time} onChange={(e) => set("event_time", e.target.value)} data-testid="print-time" /></div>
            </div>
            <div><Label>Mekân Adı</Label><Input value={f.venue_name} onChange={(e) => set("venue_name", e.target.value)} placeholder="Deniz Restoran" data-testid="print-venue" /></div>
            <div><Label>Adres</Label><Input value={f.venue_address} onChange={(e) => set("venue_address", e.target.value)} placeholder="İzmir" data-testid="print-address" /></div>
            <div>
              <Label>Davet Mesajı</Label>
              <Textarea value={f.message} onChange={(e) => set("message", e.target.value)} rows={3} placeholder="Kendiniz yazın ya da hazır bir metin seçin." data-testid="print-message" />
              <div className="flex flex-wrap gap-1.5 mt-2 max-h-24 overflow-y-auto">
                {getMessagesFor(f.event_type).slice(0, 12).map((m, i) => (
                  <button key={i} type="button" onClick={() => set("message", m)}
                    className="text-left text-[11px] px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50" data-testid={`print-preset-${i}`}>
                    {m.length > 50 ? m.slice(0, 50) + "…" : m}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Baskı Boyutu</Label>
              <Select value={f.size} onValueChange={(v) => set("size", v)}>
                <SelectTrigger data-testid="print-size"><SelectValue /></SelectTrigger>
                <SelectContent>{SIZES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div>
              <Label>Sembol</Label>
              <div className="grid grid-cols-6 gap-2 mt-1">
                {SYMBOLS.map(({ key, label, Icon }) => (
                  <button key={key} type="button" onClick={() => set("symbol", key)} title={label} data-testid={`print-symbol-${key}`}
                    className={`aspect-square rounded-lg border flex items-center justify-center ${f.symbol === key ? "border-rose-500 bg-rose-50" : "border-slate-200 hover:bg-slate-50"}`}>
                    <Icon className="w-5 h-5 text-slate-700" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Renk Teması</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {PALETTES.map((p) => (
                  <button key={p.name} type="button" onClick={() => applyPalette(p)} data-testid={`print-palette-${p.name}`}
                    className="px-3 py-1.5 rounded-full text-xs font-medium border flex items-center gap-2 border-slate-200 hover:border-slate-400">
                    <span className="w-3.5 h-3.5 rounded-full" style={{ background: p.accent_color, border: `1px solid ${p.text_color}33` }} />
                    {p.name}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div><Label className="text-xs">Arka Plan</Label><input type="color" value={f.bg_color} onChange={(e) => set("bg_color", e.target.value)} className="w-full h-9 rounded border border-slate-200" data-testid="print-bg-color" /></div>
                <div><Label className="text-xs">Vurgu</Label><input type="color" value={f.accent_color} onChange={(e) => set("accent_color", e.target.value)} className="w-full h-9 rounded border border-slate-200" data-testid="print-accent-color" /></div>
                <div><Label className="text-xs">Yazı</Label><input type="color" value={f.text_color} onChange={(e) => set("text_color", e.target.value)} className="w-full h-9 rounded border border-slate-200" data-testid="print-text-color" /></div>
              </div>
            </div>

            <div>
              <Label>Dijital Davetiye Bağlantısı (QR) <span className="text-slate-400 font-normal">— isteğe bağlı</span></Label>
              <Input value={f.qr_url} onChange={(e) => set("qr_url", e.target.value)} placeholder="https://fotuber.com.tr/davetiye/..." data-testid="print-qr-url" />
              <p className="text-[11px] text-slate-400 mt-1">Dijital davetiye linkinizi yapıştırın; baskıya QR eklenir, misafir okutunca LCV + foto duvarı açılır.</p>
            </div>

            <Button onClick={download} disabled={busy} className="w-full bg-rose-600 hover:bg-rose-700 h-12 text-base" data-testid="print-download-btn">
              {busy ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Download className="w-5 h-5 mr-2" />} Baskıya Hazır PDF İndir
            </Button>
            <p className="text-[11px] text-slate-500 text-center -mt-2">300 DPI · 3mm kesim payı · yazı tipleri gömülü · ücretsiz</p>
          </div>
        </div>

        {/* Live preview */}
        <div className="hidden lg:flex flex-col sticky top-0 h-screen items-center justify-center bg-slate-200 p-8">
          <div className="rounded-lg shadow-2xl relative overflow-hidden" data-testid="print-preview"
            style={{ background: f.bg_color, height: "min(76vh, 620px)", aspectRatio: SIZE_RATIO[f.size] || "148 / 210", transition: "aspect-ratio 0.3s ease" }}>
            <div className="absolute inset-4 border" style={{ borderColor: f.accent_color }} />
            <div className="absolute inset-5 border" style={{ borderColor: `${f.accent_color}66` }} />
            <div className="relative h-full flex flex-col items-center justify-center text-center px-8 py-10">
              <div className="mb-3"><SymbolMark kind={f.symbol} color={f.accent_color} /></div>
              <div className="uppercase tracking-[0.35em] text-[11px] font-semibold mb-4" style={{ color: f.accent_color, fontFamily: "'Cormorant Garamond', serif" }}>
                {(EVENT_TYPE_LABELS[f.event_type] || "Davet").toUpperCase()}
              </div>
              <div className="text-sm mb-3" style={{ color: f.text_color, fontFamily: "'Cormorant Garamond', serif" }}>Sizleri aramızda görmekten mutluluk duyarız</div>
              <div className="leading-none my-2" style={{ fontFamily: "'Great Vibes', cursive", color: f.accent_color, fontSize: "2.6rem" }}>{names}</div>
              <div className="flex items-center gap-2 my-3"><span className="h-px w-8" style={{ background: f.accent_color }} /><span className="w-1 h-1 rounded-full" style={{ background: f.accent_color }} /><span className="h-px w-8" style={{ background: f.accent_color }} /></div>
              <div className="uppercase tracking-[0.2em] text-sm" style={{ color: f.text_color, fontFamily: "'Cormorant Garamond', serif" }}>{prettyDate(f.event_date)}</div>
              {f.event_time && <div className="tracking-[0.2em] text-sm mt-1" style={{ color: f.text_color }}>{f.event_time}</div>}
              {f.venue_name && <div className="font-semibold mt-3" style={{ color: f.text_color, fontFamily: "'Cormorant Garamond', serif" }}>{f.venue_name}</div>}
              {f.venue_address && <div className="text-xs" style={{ color: f.text_color }}>{f.venue_address}</div>}
              {f.message && <div className="text-xs mt-3 max-w-[80%]" style={{ color: f.text_color, fontFamily: "'Cormorant Garamond', serif" }}>{f.message}</div>}
              {f.qr_url ? (
                <div className="mt-auto pt-4 flex flex-col items-center">
                  <div className="bg-white p-1.5 rounded"><QRCodeCanvas value={f.qr_url} size={54} /></div>
                  <div className="text-[8px] mt-1 tracking-wide" style={{ color: f.text_color }}>Dijital davetiye · okutun</div>
                </div>
              ) : (
                <div className="mt-auto pt-4"><SymbolMark kind={f.symbol} color={f.accent_color} size={20} /></div>
              )}
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-500 tracking-wide" data-testid="print-preview-size">Önizleme oranı: {SIZES.find((s) => s.key === f.size)?.label}</div>
        </div>
      </div>
    </div>
  );
}
