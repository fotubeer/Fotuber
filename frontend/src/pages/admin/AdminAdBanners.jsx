import React, { useEffect, useRef, useState } from "react";
import { api, formatApiError, API_BASE } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Upload, Trash2, ExternalLink, Megaphone, MousePointerClick, Eye } from "lucide-react";
import { toast } from "sonner";

const PLACEMENTS = { home_footer: "Anasayfa (Alt / Footer)", studio_panel: "Stüdyo Paneli" };
const ORIENTATIONS = { horizontal: "Yatay (Dikdörtgen)", vertical: "Dikey" };
const SIZE_HINTS = {
  "home_footer|horizontal": "1200 × 300 px (yatay dikdörtgen, ~4:1). Mobilde ortalanıp küçülür.",
  "home_footer|vertical": "400 × 600 px (dikey, ~2:3).",
  "studio_panel|horizontal": "970 × 120 px (ince yatay şerit).",
  "studio_panel|vertical": "300 × 600 px (dikey).",
};

const SCHEDULE_BADGE = {
  live: ["Yayında", "bg-emerald-100 text-emerald-700"],
  scheduled: ["Zamanlandı", "bg-sky-100 text-sky-700"],
  expired: ["Süresi Doldu", "bg-slate-200 text-slate-500"],
  paused: ["Pasif", "bg-amber-100 text-amber-700"],
};
function ScheduleBadge({ status }) {
  const [label, cls] = SCHEDULE_BADGE[status] || SCHEDULE_BADGE.live;
  return <span data-testid={`ad-schedule-${status}`} className={`text-[10px] px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function StatCard({ label, value, testid, accent }) {
  return (
    <div data-testid={testid} className={`rounded-xl border p-4 ${accent ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${accent ? "text-amber-600" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}

export default function AdminAdBanners() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState({ title: "", target_url: "", placement: "home_footer", orientation: "horizontal", sort: 0, starts_at: "", ends_at: "" });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef();

  const load = () => {
    api.get("/admin/ad-banners").then((r) => {
      const raw = r.data;
      setItems(Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.banners) ? raw.banners : Array.isArray(raw?.results) ? raw.results : []);
    }).catch(() => setItems([]));
    api.get("/admin/ad-banners/stats").then((r) => setStats(r.data)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const upload = async () => {
    if (!file) { toast.error("Bir görsel/GIF/video seçin"); return; }
    if (form.starts_at && form.ends_at && form.ends_at < form.starts_at) { toast.error("Bitiş tarihi başlangıçtan önce olamaz"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("title", form.title);
      fd.append("target_url", form.target_url);
      fd.append("placement", form.placement);
      fd.append("orientation", form.orientation);
      fd.append("sort", String(form.sort || 0));
      fd.append("starts_at", form.starts_at || "");
      fd.append("ends_at", form.ends_at || "");
      fd.append("file", file);
      await api.post("/admin/ad-banners", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Reklam eklendi");
      setForm({ title: "", target_url: "", placement: form.placement, orientation: "horizontal", sort: 0, starts_at: "", ends_at: "" });
      setFile(null); if (inputRef.current) inputRef.current.value = "";
      load();
    } catch (e) { toast.error(formatApiError(e, "Yüklenemedi")); }
    finally { setUploading(false); }
  };

  const toggle = async (b) => {
    await api.put(`/admin/ad-banners/${b.id}`, { title: b.title, target_url: b.target_url, placement: b.placement, orientation: b.orientation, active: !b.active, sort: b.sort, starts_at: b.starts_at || "", ends_at: b.ends_at || "" });
    load();
  };
  const del = async (id) => { if (!window.confirm("Bu reklam silinsin mi?")) return; await api.delete(`/admin/ad-banners/${id}`); load(); };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight" data-testid="admin-ads-title">Reklam Alanları</h1>
        <p className="text-sm text-slate-500 mt-1">Anasayfa altına ve stüdyo paneline tıklanabilir görsel/GIF/video reklam banner'ları ekleyin. Mobil uyumludur.</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="ad-stats-panel">
          <StatCard label="Toplam Gösterim" value={stats.total_impressions.toLocaleString("tr-TR")} testid="ad-stat-impressions" />
          <StatCard label="Toplam Tıklama" value={stats.total_clicks.toLocaleString("tr-TR")} testid="ad-stat-clicks" />
          <StatCard label="Ortalama CTR" value={`%${stats.ctr}`} testid="ad-stat-ctr" accent />
          <StatCard label="Aktif / Toplam" value={`${stats.active_banners} / ${stats.total_banners}`} testid="ad-stat-active" />
        </div>
      )}

      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-2"><Upload className="w-4 h-4" /> Yeni Reklam Ekle</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-slate-500">Başlık (opsiyonel)</Label>
            <Input data-testid="ad-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="örn. Yaz Kampanyası" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Yönlendirme Linki (tıklanınca)</Label>
            <Input data-testid="ad-url" value={form.target_url} onChange={(e) => setForm({ ...form, target_url: e.target.value })} placeholder="https://..." className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Yerleşim</Label>
            <Select value={form.placement} onValueChange={(v) => setForm({ ...form, placement: v })}>
              <SelectTrigger data-testid="ad-placement" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(PLACEMENTS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-slate-500">Yön</Label>
            <Select value={form.orientation} onValueChange={(v) => setForm({ ...form, orientation: v })}>
              <SelectTrigger data-testid="ad-orientation" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(ORIENTATIONS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-slate-500">Sıra</Label>
            <Input data-testid="ad-sort" type="number" value={form.sort} onChange={(e) => setForm({ ...form, sort: +e.target.value || 0 })} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Görsel / GIF / Video</Label>
            <Input ref={inputRef} data-testid="ad-file" type="file" accept="image/*,video/*,.gif" onChange={(e) => setFile(e.target.files?.[0] || null)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Başlangıç Tarihi (opsiyonel)</Label>
            <Input data-testid="ad-starts-at" type="date" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Bitiş Tarihi (opsiyonel)</Label>
            <Input data-testid="ad-ends-at" type="date" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} className="mt-1" />
          </div>
          <div className="md:col-span-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800" data-testid="ad-size-hint">
            <b>Önerilen ölçü:</b> {SIZE_HINTS[`${form.placement}|${form.orientation}`] || "—"}<br />
            <span className="text-amber-700">Görsel/GIF: PNG, JPG, GIF (maks ~5 MB). Video: MP4 / WebM, önerilen ≤ 10 sn, sessiz — otomatik ve sessiz oynatılır.</span>
          </div>
          <div className="md:col-span-2">
            <Button data-testid="ad-upload-btn" onClick={upload} disabled={uploading} className="gap-1.5">
              <Upload className="w-4 h-4" /> {uploading ? "Yükleniyor…" : "Reklamı Ekle"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-slate-400">
            <Megaphone className="w-8 h-8 mx-auto mb-2" /> Henüz reklam eklenmedi.
          </div>
        ) : items.map((b) => (
          <Card key={b.id} data-testid={`ad-item-${b.id}`} className="border-slate-200">
            <CardContent className="flex flex-wrap items-center gap-4 p-4">
              {b.media_type === "video" ? (
                <video src={`${API_BASE.replace(/\/api$/, "")}${b.image_url}`} muted loop playsInline autoPlay
                  className={`rounded-lg border border-slate-200 object-cover ${b.orientation === "vertical" ? "w-16 h-28" : "w-40 h-16"}`} />
              ) : (
                <img src={`${API_BASE.replace(/\/api$/, "")}${b.image_url}`} alt={b.title} className={`rounded-lg border border-slate-200 object-cover ${b.orientation === "vertical" ? "w-16 h-28" : "w-40 h-16"}`} />
              )}
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-2">{b.title || "(başlıksız)"} <ScheduleBadge status={b.schedule_status} /></div>
                <div className="text-xs text-slate-500">{PLACEMENTS[b.placement]} · {ORIENTATIONS[b.orientation]} · {b.media_type === "video" ? "Video" : "Görsel"} · sıra {b.sort}</div>
                {(b.starts_at || b.ends_at) && (
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {b.starts_at ? `Başlangıç: ${b.starts_at}` : "Başlangıç: hemen"} · {b.ends_at ? `Bitiş: ${b.ends_at}` : "Bitiş: süresiz"}
                  </div>
                )}
                {b.target_url && <a href={b.target_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 inline-flex items-center gap-1 mt-0.5"><ExternalLink className="w-3 h-3" /> {b.target_url}</a>}
                <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-3">
                  <span className="inline-flex items-center gap-1"><Eye className="w-3 h-3" /> {(b.impressions || 0).toLocaleString("tr-TR")} gösterim</span>
                  <span className="inline-flex items-center gap-1"><MousePointerClick className="w-3 h-3" /> {(b.clicks || 0).toLocaleString("tr-TR")} tıklama</span>
                  <span className="inline-flex items-center gap-1 font-medium text-slate-600">CTR %{b.ctr || 0}</span>
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button data-testid={`ad-toggle-${b.id}`} onClick={() => toggle(b)} className={`text-xs px-3 h-8 rounded-lg ${b.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{b.active ? "Aktif" : "Pasif"}</button>
                <button data-testid={`ad-del-${b.id}`} onClick={() => del(b.id)} className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"><Trash2 className="w-4 h-4" /></button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
