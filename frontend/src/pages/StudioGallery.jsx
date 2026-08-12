import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Upload, Trash2, Copy, Image as ImageIcon, Package, ClipboardList,
  FileDown, Link2, Loader2, AlertTriangle, X, Settings as SettingsIcon,
  BellRing, MessageCircle, MailCheck, Clock, ArrowUpCircle, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { studioApi } from "@/lib/studioApi";
import { API_BASE, formatApiError } from "@/lib/api";
import { TrDatePicker } from "@/components/TrDatePicker";

const BE = process.env.REACT_APP_BACKEND_URL;
const CHUNK = 512 * 1024;

// Dialog içinde sorunsuz çalışan gün/ay/yıl seçimi (native select).
const TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
function DateSelects({ value, onChange, testid }) {
  const [y, m, d] = (value || "").split("-");
  const now = new Date();
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 1 + i);
  const set = (part, val) => {
    const cur = { y: y || "", m: m || "", d: d || "" };
    cur[part] = val;
    if (cur.y && cur.m && cur.d) onChange(`${cur.y}-${String(cur.m).padStart(2, "0")}-${String(cur.d).padStart(2, "0")}`);
    else onChange(`${cur.y || ""}-${cur.m ? String(cur.m).padStart(2, "0") : ""}-${cur.d ? String(cur.d).padStart(2, "0") : ""}`);
  };
  const cls = "h-10 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm px-2";
  return (
    <div className="grid grid-cols-3 gap-2" data-testid={testid}>
      <select data-testid={`${testid}-day`} className={cls} value={d ? String(parseInt(d, 10)) : ""} onChange={(e) => set("d", e.target.value)}>
        <option value="">Gün</option>
        {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <select data-testid={`${testid}-month`} className={cls} value={m ? String(parseInt(m, 10)) : ""} onChange={(e) => set("m", e.target.value)}>
        <option value="">Ay</option>
        {TR_MONTHS.map((mn, i) => <option key={i} value={i + 1}>{mn}</option>)}
      </select>
      <select data-testid={`${testid}-year`} className={cls} value={y || ""} onChange={(e) => set("y", e.target.value)}>
        <option value="">Yıl</option>
        {years.map((yr) => <option key={yr} value={yr}>{yr}</option>)}
      </select>
    </div>
  );
}
const ORDER_STATUS = { new: "İnceleniyor", preparing: "Hazırlanıyor", printing: "Baskıda", shipping: "Kargoda", completed: "Tamamlandı",
  processing: "Hazırlanıyor", ready: "Baskıda", delivered: "Tamamlandı" };
const ORDER_STATUS_OPTIONS = { new: "İnceleniyor", preparing: "Hazırlanıyor", printing: "Baskıda", shipping: "Kargoda", completed: "Tamamlandı" };
const fmtDate = (iso) => { if (!iso) return "—"; try { return new Date(iso).toLocaleDateString("tr-TR"); } catch { return "—"; } };
const fmtDateTime = (iso) => { if (!iso) return "—"; try { return new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return "—"; } };

// Detect a 402 [UPGRADE] quota error and route the studio to the packages page.
export function makeQuotaHandler(navigate) {
  return (e) => {
    const status = e?.response?.status;
    const detail = e?.response?.data?.detail || "";
    if (status === 402 && typeof detail === "string" && detail.includes("[UPGRADE]")) {
      const msg = detail.replace("[UPGRADE]", "").trim();
      toast.error(msg || "Paket limitine ulaştınız.", {
        duration: 6000,
        action: { label: "Paketi Yükselt", onClick: () => navigate("/studyo/paketler") },
      });
      setTimeout(() => navigate("/studyo/paketler"), 1800);
      return true;
    }
    return false;
  };
}

export default function StudioGallery() {
  const navigate = useNavigate();
  const onQuota = useCallback(makeQuotaHandler(navigate), [navigate]);
  const [tab, setTab] = useState("events");
  const [events, setEvents] = useState([]);
  const [active, setActive] = useState(null); // event detail
  const [packs, setPacks] = useState([]);
  const [orders, setOrders] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [isOwner, setIsOwner] = useState(true);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadReminders = useCallback(async () => {
    try { setReminders((await studioApi.get("/studio/gallery/reminders")).data?.reminders || []); }
    catch { /* silent */ }
  }, []);

  const loadEvents = useCallback(async () => {
    try { setEvents((await studioApi.get("/studio/gallery/events")).data); }
    catch (e) { if (e?.response?.status === 401) navigate("/studyo"); }
  }, [navigate]);
  const loadPacks = useCallback(async () => setPacks((await studioApi.get("/studio/gallery/service-packs")).data), []);
  const loadOrders = useCallback(async () => setOrders((await studioApi.get("/studio/gallery/orders")).data), []);

  useEffect(() => {
    studioApi.get("/studio/me")
      .then((r) => setIsOwner(r.data?.account?.current_user?.is_owner !== false))
      .catch(() => navigate("/studyo"));
    studioApi.get("/studio/employees").then((r) => setEmployees(r.data?.employees || [])).catch(() => {});
    Promise.all([loadEvents(), loadPacks(), loadOrders(), loadReminders()]).finally(() => setLoading(false));
  }, [navigate, loadEvents, loadPacks, loadOrders, loadReminders]);

  const copyLink = async (token) => {
    const link = `${window.location.origin}/galeri/${token}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Müşteri seçim linki kopyalandı");
    } catch {
      toast.success(`Link: ${link}`);
    }
  };

  const switchTab = (k) => {
    setTab(k); setActive(null);
    if (k === "events") loadEvents();
    else if (k === "packs") loadPacks();
    else if (k === "orders") loadOrders();
    else if (k === "reminders") loadReminders();
  };

  return (
    <div data-testid="studio-gallery-page" className="min-h-screen text-white"
      style={{ background: "radial-gradient(900px 500px at 80% -10%, #17233d 0%, #070b14 60%, #05070d 100%)" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button data-testid="sg-back" onClick={() => navigate("/studyo/panel")} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"><ArrowLeft size={18} /></button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 grid place-items-center shadow-lg shadow-amber-500/20">
              <ImageIcon size={20} className="text-neutral-900" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold leading-tight">Etkinlik Galerisi</h1>
              <p className="text-xs text-white/45">Fotoğraf yükleyin, müşteri seçim linki paylaşın, siparişleri yönetin.</p>
            </div>
          </div>
        </div>

        <div className="flex gap-1 p-1 rounded-2xl bg-white/[0.04] border border-white/10 w-full sm:w-fit mb-6 overflow-x-auto no-scrollbar">
          {[["events", "Etkinlikler", ImageIcon], ["packs", "Servis Paketleri", Package], ["orders", "Siparişler", ClipboardList], ["reminders", "Hatırlatmalar", BellRing], ["settings", "Ayarlar", SettingsIcon]].map(([k, label, Icon]) => (
            <button key={k} data-testid={`sg-tab-${k}`} onClick={() => switchTab(k)}
              className={`px-4 h-9 rounded-xl text-sm font-medium flex items-center gap-1.5 relative whitespace-nowrap transition-colors ${tab === k ? "bg-white text-neutral-900 shadow-sm" : "text-white/55 hover:text-white hover:bg-white/5"}`}>
              <Icon size={15} /> {label}
              {k === "reminders" && reminders.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{reminders.length}</span>
              )}
            </button>
          ))}
        </div>

        {loading ? <p className="text-white/50">Yükleniyor…</p> : (
          <>
            {tab === "events" && !active && <EventsList events={events} onOpen={setActive} onCopy={copyLink} onCreated={loadEvents} onDeleted={loadEvents} onQuota={onQuota} />}
            {tab === "events" && active && <EventDetail eventId={active.id} onBack={() => { setActive(null); loadEvents(); }} onCopy={copyLink} onQuota={onQuota} />}
            {tab === "packs" && <PacksTab packs={packs} reload={loadPacks} />}
            {tab === "orders" && <OrdersTab orders={orders} reload={loadOrders} employees={employees} isOwner={isOwner} />}
            {tab === "reminders" && <RemindersTab reminders={reminders} reload={loadReminders} />}
            {tab === "settings" && <SettingsTab />}
          </>
        )}
      </div>
    </div>
  );
}

function EventsList({ events, onOpen, onCopy, onCreated, onDeleted, onQuota }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", client_name: "", client_phone: "", client_email: "", event_date: "", album_limit: 0, canvas_limit: 0, retouch_limit: 0 });
  const [busy, setBusy] = useState(false);

  const onExtend = async (ev) => {
    if (!window.confirm(`"${ev.name}" için müşteri linki yenilensin mi?\n\nNot: Bu, orijinal dosya silinme tarihini uzatmaz; link en fazla o tarihe kadar geçerli olur.`)) return;
    try {
      const { data } = await studioApi.post(`/studio/gallery/events/${ev.id}/extend-link`);
      toast.success(data.note || "Link yenilendi");
      onDeleted();
    } catch (e) { toast.error(formatApiError(e, "Yenilenemedi")); }
  };

  const create = async () => {
    if (!form.name.trim()) { toast.error("Etkinlik adı gerekli"); return; }
    setBusy(true);
    try {
      await studioApi.post("/studio/gallery/events", {
        ...form, album_limit: +form.album_limit || 0, canvas_limit: +form.canvas_limit || 0, retouch_limit: +form.retouch_limit || 0,
      });
      toast.success("Etkinlik oluşturuldu"); setOpen(false);
      setForm({ name: "", client_name: "", client_phone: "", client_email: "", event_date: "", album_limit: 0, canvas_limit: 0, retouch_limit: 0 });
      onCreated();
    } catch (e) { if (!(onQuota && onQuota(e))) toast.error(formatApiError(e, "Oluşturulamadı")); } finally { setBusy(false); }
  };
  const del = async (ev) => {
    if (!window.confirm(`"${ev.name}" ve tüm fotoğrafları silinsin mi?`)) return;
    await studioApi.delete(`/studio/gallery/events/${ev.id}`); toast.success("Silindi"); onDeleted();
  };

  return (
    <div>
      <Dialog open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-white/50">{events.length > 0 ? `${events.length} etkinlik` : ""}</div>
          <DialogTrigger asChild>
            <Button data-testid="sg-new-event-btn" className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-neutral-900 font-semibold rounded-xl"><Plus size={16} /> Yeni Etkinlik</Button>
          </DialogTrigger>
        </div>
        <DialogContent className="text-neutral-900">
          <DialogHeader><DialogTitle>Yeni Etkinlik</DialogTitle>
            <DialogDescription>Katı albüm/kanvas/retouch limitleri belirleyin (0 = sınırsız).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input data-testid="sg-event-name" placeholder="Etkinlik adı (örn. Ayşe & Mehmet Düğün)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input data-testid="sg-event-client" placeholder="Müşteri adı" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
            <Input data-testid="sg-event-phone" placeholder="Müşteri telefonu (WhatsApp hatırlatma için · örn. 0532...)" value={form.client_phone} onChange={(e) => setForm({ ...form, client_phone: e.target.value })} />
            <Input data-testid="sg-event-email" type="email" placeholder="Müşteri e-postası (süre bitiş bildirimi için)" value={form.client_email} onChange={(e) => setForm({ ...form, client_email: e.target.value })} />
            <div>
              <label className="text-xs text-neutral-500">Etkinlik tarihi</label>
              <DateSelects testid="sg-event-date" value={form.event_date} onChange={(v) => setForm({ ...form, event_date: v })} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="text-xs text-neutral-500">Albüm limiti</label><Input data-testid="sg-event-albumlimit" type="number" value={form.album_limit} onChange={(e) => setForm({ ...form, album_limit: e.target.value })} /></div>
              <div><label className="text-xs text-neutral-500">Kanvas limiti</label><Input type="number" value={form.canvas_limit} onChange={(e) => setForm({ ...form, canvas_limit: e.target.value })} /></div>
              <div><label className="text-xs text-neutral-500">Retouch limiti</label><Input type="number" value={form.retouch_limit} onChange={(e) => setForm({ ...form, retouch_limit: e.target.value })} /></div>
            </div>
            <Button data-testid="sg-create-event-submit" onClick={create} disabled={busy} className="w-full bg-neutral-900 hover:bg-neutral-800">{busy ? "..." : "Oluştur"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {events.length === 0 ? (
        <div data-testid="sg-events-empty" className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/5 grid place-items-center mx-auto mb-3"><ImageIcon size={26} className="text-white/40" /></div>
          <div className="font-medium text-white/80">Henüz etkinlik yok</div>
          <p className="text-sm text-white/40 mt-1 max-w-xs mx-auto">İlk etkinliğinizi oluşturun, fotoğraf yükleyin ve müşterinize seçim linki gönderin.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {events.map((ev) => (
            <div key={ev.id} data-testid={`sg-event-card-${ev.id}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 hover:border-white/20 hover:bg-white/[0.06] transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold leading-tight">{ev.name}</div>
                {ev.submitted && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-medium">Seçim geldi</span>}
              </div>
              <div className="text-xs text-white/50 mt-1">{ev.client_name || "Müşteri belirtilmedi"}</div>

              <div className="flex flex-wrap gap-1.5 mt-3">
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-white/5 text-white/70"><ImageIcon size={11} /> {ev.photo_count} foto</span>
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-white/5 text-white/70"><Package size={11} /> Albüm {ev.album_limit || "∞"}</span>
                <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg ${ev.link_expired ? "bg-red-500/15 text-red-300" : "bg-white/5 text-white/70"}`}>
                  <Clock size={11} /> {ev.link_expired ? "Link doldu" : fmtDate(ev.link_expires_at)}
                </span>
              </div>

              <div className="text-[11px] text-white/35 mt-2">
                Orijinal silinme: {fmtDate(ev.originals_delete_at)}{ev.originals_purged && " · silindi"}{ev.extra_link_used && " · link yenilendi"}
              </div>

              <div className="flex gap-2 mt-3 pt-3 border-t border-white/10 flex-wrap">
                <Button data-testid={`sg-open-${ev.id}`} size="sm" onClick={() => onOpen(ev)} className="gap-1 bg-white/10 hover:bg-white/20 text-white rounded-lg"><Upload size={13} /> Yönet</Button>
                <Button data-testid={`sg-copy-link-${ev.id}`} size="sm" variant="outline" onClick={() => onCopy(ev.share_token)} className="gap-1 bg-transparent border-white/15 text-white hover:bg-white/10 rounded-lg"><Link2 size={13} /> Link</Button>
                {!ev.originals_purged && (
                  <Button data-testid={`sg-extend-${ev.id}`} size="sm" variant="outline" onClick={() => onExtend(ev)} className="gap-1 bg-transparent border-amber-400/30 text-amber-200 hover:bg-amber-500/10 rounded-lg"><Link2 size={13} /> Link Yenile</Button>
                )}
                <Button data-testid={`sg-del-event-${ev.id}`} size="sm" variant="ghost" onClick={() => del(ev)} className="ml-auto text-red-300 hover:text-red-200 hover:bg-red-500/10 rounded-lg"><Trash2 size={14} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EventDetail({ eventId, onBack, onCopy, onQuota }) {
  const [data, setData] = useState(null);
  const [uploads, setUploads] = useState([]); // {name, pct, raw}
  const fileRef = useRef(null);

  const load = useCallback(async () => setData((await studioApi.get(`/studio/gallery/events/${eventId}`)).data), [eventId]);
  useEffect(() => { load(); }, [load]);

  const RAW_EXTS = ["cr2", "cr3", "nef", "arw", "dng", "raf", "orf", "rw2", "sr2", "pef", "raw"];
  const [rawWarned, setRawWarned] = useState(false);

  const uploadFile = async (file) => {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (RAW_EXTS.includes(ext) && !rawWarned) {
      setRawWarned(true);
      toast.warning("Müşteriye RAW fotoğraf göndermeniz yükleme ve indirme sürelerini uzatacaktır. Önerilen fotoğraf tipi JPG formatıdır.", { duration: 7000 });
    }
    const total = Math.max(1, Math.ceil(file.size / CHUNK));
    const key = `${file.name}-${Date.now()}`;
    setUploads((u) => [...u, { key, name: file.name, pct: 0, raw: false }]);
    try {
      const init = (await studioApi.post(`/studio/gallery/events/${eventId}/upload-init`, (() => {
        const fd = new FormData(); fd.append("filename", file.name); fd.append("size", file.size); fd.append("total_chunks", total); return fd;
      })())).data;
      if (init.is_raw) setUploads((u) => u.map((x) => x.key === key ? { ...x, raw: true } : x));
      for (let i = 0; i < total; i++) {
        const blob = file.slice(i * CHUNK, (i + 1) * CHUNK);
        const fd = new FormData(); fd.append("index", i); fd.append("chunk", blob, "chunk");
        await studioApi.post(`/studio/gallery/upload-chunk/${init.upload_id}`, fd);
        setUploads((u) => u.map((x) => x.key === key ? { ...x, pct: Math.round(((i + 1) / total) * 100) } : x));
      }
      await studioApi.post(`/studio/gallery/upload-complete/${init.upload_id}`);
      setUploads((u) => u.filter((x) => x.key !== key));
      await load();
    } catch (e) {
      if (onQuota && onQuota(e)) {
        setUploads((u) => u.filter((x) => x.key !== key));
        return;
      }
      toast.error(`${file.name}: ${formatApiError(e, "yüklenemedi")}`);
      setUploads((u) => u.filter((x) => x.key !== key));
    }
  };

  const onPick = async (e) => {
    const files = Array.from(e.target.files || []); e.target.value = "";
    for (const f of files) await uploadFile(f);
    toast.success("Yükleme tamamlandı");
  };

  const delPhoto = async (pid) => {
    await studioApi.delete(`/studio/gallery/photos/${pid}`); await load();
  };

  const [zipping, setZipping] = useState(false);
  const downloadZip = async () => {
    setZipping(true);
    try {
      const res = await studioApi.get(`/studio/gallery/events/${eventId}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a"); a.href = url;
      a.download = `${(data?.event?.name || "etkinlik")}-orijinaller.zip`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(formatApiError(e, "İndirilemedi")); }
    finally { setZipping(false); }
  };

  if (!data) return <p className="text-white/50">Yükleniyor…</p>;
  const ev = data.event;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button data-testid="sg-detail-back" onClick={onBack} className="p-2 rounded-lg bg-white/5 hover:bg-white/10"><ArrowLeft size={16} /></button>
        <div>
          <div className="font-semibold">{ev.name}</div>
          <div className="text-xs text-white/50">{ev.client_name || "-"} · {data.photos.length} foto · Albüm limiti {ev.album_limit || "∞"}{ev.originals_purged ? " · orijinaller silindi" : ""}</div>
        </div>
        <div className="ml-auto flex gap-2 flex-wrap">
          <Button data-testid="sg-detail-copy" size="sm" variant="outline" onClick={() => onCopy(ev.share_token)} className="gap-1 bg-transparent border-white/15 text-white hover:bg-white/10"><Copy size={13} /> Müşteri Linki</Button>
          {!ev.originals_purged && data.photos.length > 0 && (
            <Button data-testid="sg-download-zip" size="sm" variant="outline" onClick={downloadZip} disabled={zipping} className="gap-1 bg-transparent border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/10">
              {zipping ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />} Orijinalleri İndir (ZIP)
            </Button>
          )}
          {!ev.originals_purged && (
            <>
              <Button data-testid="sg-upload-btn" size="sm" onClick={() => fileRef.current?.click()} className="gap-1 bg-amber-500 hover:bg-amber-600 text-neutral-900 font-semibold"><Upload size={14} /> Foto Yükle</Button>
              <input ref={fileRef} data-testid="sg-upload-input" type="file" accept="image/*,.cr2,.cr3,.nef,.arw,.dng,.raf,.orf,.rw2" multiple hidden onChange={onPick} />
            </>
          )}
        </div>
      </div>

      {ev.originals_purged && (
        <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          Bu etkinliğin orijinal (yüksek çözünürlüklü) dosyaları silme süresi dolduğu için kaldırıldı. Önizlemeler ve fotoğraf kodları kayıt amacıyla saklanıyor.
        </div>
      )}

      {uploads.length > 0 && (
        <div className="space-y-2 mb-4">
          {uploads.map((u) => (
            <div key={u.key} className="rounded-lg bg-white/5 p-2 text-xs">
              <div className="flex items-center gap-2">
                <Loader2 size={13} className="animate-spin" /> {u.name}
                {u.raw && <span className="flex items-center gap-1 text-amber-300"><AlertTriangle size={12} /> RAW</span>}
                <span className="ml-auto">%{u.pct}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 mt-1 overflow-hidden"><div className="h-full bg-amber-500" style={{ width: `${u.pct}%` }} /></div>
            </div>
          ))}
        </div>
      )}

      {data.photos.length === 0 ? <p className="text-white/40">Henüz fotoğraf yüklenmedi.</p> : (
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
          {data.photos.map((p) => (
            <div key={p.id} data-testid={`sg-photo-${p.id}`} className="relative group aspect-square rounded-lg overflow-hidden bg-white/5">
              {p.is_raw ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-[10px] text-amber-300 gap-1"><AlertTriangle size={18} /> RAW<span className="text-white/40 px-1 truncate w-full text-center">{p.filename}</span></div>
              ) : (
                <img src={`${BE}${p.thumb || p.url}`} alt={p.filename} className="w-full h-full object-cover" />
              )}
              {p.filename && <span className="absolute bottom-0 inset-x-0 text-[9px] font-mono px-1 py-0.5 bg-black/60 text-amber-200 truncate">{p.filename}</span>}
              {p.original_purged && <span className="absolute top-1 left-1 text-[9px] px-1 py-0.5 rounded bg-amber-500/80 text-neutral-900 font-semibold">Silindi</span>}
              {!p.original_purged && p.url && !p.is_raw && (
                <a data-testid={`sg-photo-orig-${p.id}`} href={`${BE}${p.url}`} target="_blank" rel="noreferrer" download title="Orijinali indir"
                  className="absolute top-1 left-1 bg-black/60 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity text-white hover:bg-black/80"><Download size={11} /></a>
              )}
              <button data-testid={`sg-del-photo-${p.id}`} onClick={() => delPhoto(p.id)} className="absolute top-1 right-1 bg-black/60 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PacksTab({ packs, reload }) {
  const KINDS = ["Baskı", "Çerçeve", "Ahşap Tablo", "Cam Tablo", "Albüm", "Kanvas", "Retouch", "Diğer"];
  const [form, setForm] = useState({ name: "", price: "", description: "", kind: "Baskı", max_qty: "" });
  const create = async () => {
    if (!form.name.trim()) { toast.error("Hizmet adı gerekli"); return; }
    await studioApi.post("/studio/gallery/service-packs", { name: form.name, price: +form.price || 0, description: form.description, kind: form.kind, max_qty: +form.max_qty || 0, active: true });
    setForm({ name: "", price: "", description: "", kind: "Baskı", max_qty: "" }); toast.success("Hizmet eklendi"); reload();
  };
  const del = async (id) => { await studioApi.delete(`/studio/gallery/service-packs/${id}`); reload(); };
  const inputCls = "bg-white/5 border-white/15 text-white";
  return (
    <div className="max-w-2xl">
      <p className="text-xs text-white/45 mb-2">Müşteriye sunacağınız hizmetleri tanımlayın (Baskı, Çerçeve, Ahşap/Cam Tablo…). Ekstra ücret ve adet limiti belirleyebilirsiniz.</p>
      <div className="rounded-xl border border-white/12 bg-white/5 p-4 mb-4 flex flex-wrap items-end gap-2">
        <div className="w-36"><label className="text-xs text-white/50">Tür</label>
          <select data-testid="sg-pack-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="w-full h-10 rounded-md bg-white/5 border border-white/15 text-white text-sm px-2">
            {KINDS.map((k) => <option key={k} value={k} className="bg-neutral-900">{k}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[130px]"><label className="text-xs text-white/50">Hizmet adı</label><Input data-testid="sg-pack-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} /></div>
        <div className="w-24"><label className="text-xs text-white/50">Ekstra ₺</label><Input data-testid="sg-pack-price" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={inputCls} /></div>
        <div className="w-24"><label className="text-xs text-white/50">Adet limiti</label><Input data-testid="sg-pack-limit" type="number" value={form.max_qty} onChange={(e) => setForm({ ...form, max_qty: e.target.value })} placeholder="0=∞" className={inputCls} /></div>
        <Button data-testid="sg-create-pack" onClick={create} className="gap-1 bg-amber-500 hover:bg-amber-600 text-neutral-900"><Plus size={15} /> Ekle</Button>
      </div>
      {packs.length === 0 ? (
        <div data-testid="sg-packs-empty" className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/5 grid place-items-center mx-auto mb-2"><Package size={22} className="text-white/40" /></div>
          <div className="text-sm text-white/50">Henüz hizmet yok. Yukarıdan ekleyin.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {packs.map((p) => (
            <div key={p.id} data-testid={`sg-pack-${p.id}`} className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-center gap-3">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 shrink-0">{p.kind || "Diğer"}</span>
              <div className="min-w-0"><div className="font-medium truncate">{p.name}</div><div className="text-xs text-white/50 truncate">{p.description}{p.max_qty ? ` · maks ${p.max_qty} adet` : " · sınırsız"}</div></div>
              <div className="ml-auto font-semibold text-amber-300 shrink-0">{p.price > 0 ? `+${p.price}₺` : "Ücretsiz"}</div>
              <Button size="sm" variant="ghost" onClick={() => del(p.id)} className="text-red-300 hover:bg-red-500/10"><Trash2 size={14} /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OrdersTab({ orders, reload, employees, isOwner }) {
  const setStatus = async (id, status) => { await studioApi.put(`/studio/gallery/orders/${id}/status`, { status }); toast.success("Durum güncellendi"); reload(); };
  const assign = async (id, employee_id) => { await studioApi.put(`/studio/gallery/orders/${id}/assign`, { employee_id: employee_id === "none" ? null : employee_id }); toast.success("Personel atandı"); reload(); };
  const pdf = async (o) => {
    const res = await studioApi.get(`/studio/gallery/orders/${o.id}/pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data); const a = document.createElement("a"); a.href = url; a.download = `siparis-${o.order_no}.pdf`; a.click(); URL.revokeObjectURL(url);
  };
  return orders.length === 0 ? (
    <div data-testid="sg-orders-empty" className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-white/5 grid place-items-center mx-auto mb-3"><ClipboardList size={26} className="text-white/40" /></div>
      <div className="font-medium text-white/80">Henüz sipariş yok</div>
      <p className="text-sm text-white/40 mt-1">Müşteriniz seçim yaptığında siparişler burada görünür.</p>
    </div>
  ) : (
    <div className="space-y-2">
      {orders.map((o) => (
        <div key={o.id} data-testid={`sg-order-${o.id}`} className="rounded-xl border border-white/12 bg-white/5 p-4 flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <div className="font-semibold">{o.order_no} · {o.event_name}</div>
            <div className="text-xs text-white/50">{o.client_name || "-"} · Albüm {o.album_count} · Kanvas {o.canvas_count} · Retouch {o.retouch_count}{o.upsell_total ? ` · Ek Hizmet ${o.upsell_total}₺` : ""}</div>
            {o.assigned_name && <div className="text-[11px] text-amber-200 mt-0.5">Sorumlu: {o.assigned_name}</div>}
            <OrderCodes o={o} />
          </div>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {isOwner && (
              <Select value={o.assigned_to || "none"} onValueChange={(v) => assign(o.id, v)}>
                <SelectTrigger data-testid={`sg-order-assign-${o.id}`} className="h-8 w-40 bg-white/5 border-white/15 text-white text-xs"><SelectValue placeholder="Personel ata" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Atanmadı</SelectItem>
                  {(employees || []).map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={ORDER_STATUS_OPTIONS[o.status] ? o.status : "new"} onValueChange={(v) => setStatus(o.id, v)}>
              <SelectTrigger data-testid={`sg-order-status-${o.id}`} className="h-8 w-36 bg-white/5 border-white/15 text-white text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(ORDER_STATUS_OPTIONS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
            <Button data-testid={`sg-order-pdf-${o.id}`} size="sm" variant="outline" onClick={() => pdf(o)} className="gap-1 bg-transparent border-white/15 text-white hover:bg-white/10"><FileDown size={13} /> PDF</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function OrderCodes({ o }) {
  const groups = [];
  if (o.album_codes?.length) groups.push(["Albüm", o.album_codes]);
  if (o.canvas_codes?.length) groups.push(["Kanvas", o.canvas_codes]);
  if (o.retouch_codes?.length) groups.push(["Rötuş", o.retouch_codes]);
  const packs = o.pack_details || [];
  if (groups.length === 0 && packs.length === 0) return null;
  return (
    <div data-testid={`sg-order-codes-${o.id}`} className="mt-2 space-y-1">
      {groups.map(([label, codes]) => (
        <div key={label} className="text-[11px] text-white/55">
          <span className="text-white/40">{label}:</span> <span className="font-mono text-amber-200/80">{codes.join(", ")}</span>
        </div>
      ))}
      {packs.map((d) => (
        <div key={d.id} className="text-[11px] text-white/55">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 mr-1">{d.kind}</span>
          <span className="text-white/70">{d.name}</span> · {d.qty} adet · {Number(d.total).toFixed(0)}₺
          {d.codes?.length ? <span className="font-mono text-amber-200/80"> — {d.codes.join(", ")}</span> : null}
        </div>
      ))}
    </div>
  );
}

function RemindersTab({ reminders, reload }) {
  const openWa = (r) => {
    if (r.whatsapp_url) { window.open(r.whatsapp_url, "_blank"); return; }
    if (r.whatsapp_message) {
      navigator.clipboard?.writeText(r.whatsapp_message).then(
        () => toast.success("Numara yok — mesaj panoya kopyalandı"),
        () => toast.error("Müşteri telefonu kayıtlı değil"),
      );
    } else { toast.error("Müşteri telefonu kayıtlı değil"); }
  };
  return (
    <div data-testid="sg-reminders" className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-semibold flex items-center gap-2"><BellRing size={16} className="text-amber-300" /> Süre Bitiş Hatırlatmaları</div>
          <div className="text-xs text-white/50 mt-0.5">İndirme/silinme süresine 24 saatten az kalan etkinlikler. Müşteriye e-posta otomatik gider; WhatsApp ile tek tıkla hatırlatın.</div>
        </div>
        <Button data-testid="sg-reminders-refresh" size="sm" variant="outline" onClick={reload} className="bg-transparent border-white/15 text-white hover:bg-white/10">Yenile</Button>
      </div>
      {reminders.length === 0 ? (
        <div className="rounded-2xl border border-white/12 bg-white/5 p-8 text-center text-white/40">
          <Clock size={26} className="mx-auto mb-2 opacity-60" />
          Şu an yaklaşan süre bitişi yok.
        </div>
      ) : (
        <div className="space-y-2">
          {reminders.map((r) => (
            <div key={r.id} data-testid={`sg-reminder-${r.id}`}
              className={`rounded-2xl border p-4 ${r.overdue ? "border-red-500/40 bg-red-500/10" : "border-amber-400/25 bg-amber-500/5"}`}>
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <div className="font-semibold flex items-center gap-2">
                    {r.name}
                    {r.overdue
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/30 text-red-200">Süresi doldu</span>
                      : <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-200">24 saatten az</span>}
                  </div>
                  <div className="text-xs text-white/60 mt-1">{r.client_name || "Müşteri"} {r.client_phone ? `· ${r.client_phone}` : ""}</div>
                  <div className="text-[11px] text-white/45 mt-0.5 flex items-center gap-1"><Clock size={11} /> Silinme: {fmtDateTime(r.originals_delete_at)}</div>
                  <div className="text-[11px] mt-0.5 flex items-center gap-1">
                    <MailCheck size={11} className={r.reminder_sent ? "text-emerald-400" : "text-white/40"} />
                    {r.client_email
                      ? (r.reminder_sent ? <span className="text-emerald-300">E-posta gönderildi ({r.client_email})</span> : <span className="text-white/50">E-posta bekliyor ({r.client_email})</span>)
                      : <span className="text-white/40">E-posta kayıtlı değil</span>}
                  </div>
                </div>
                <Button data-testid={`sg-reminder-wa-${r.id}`} size="sm" onClick={() => openWa(r)}
                  className="gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold">
                  <MessageCircle size={14} /> WhatsApp ile Hatırlat
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsTab() {
  const [s, setS] = useState(null);
  useEffect(() => { studioApi.get("/studio/gallery/settings").then((r) => setS(r.data)).catch(() => {}); }, []);
  const save = async (patch) => {
    const next = { ...s, ...patch }; setS(next);
    try { await studioApi.put("/studio/gallery/settings", patch); toast.success("Ayar kaydedildi"); }
    catch (e) { toast.error(formatApiError(e, "Kaydedilemedi")); }
  };
  if (!s) return <p className="text-white/50">Yükleniyor…</p>;
  return (
    <div data-testid="sg-settings" className="max-w-lg space-y-3">
      <div className="rounded-xl border border-white/12 bg-white/5 p-4 flex items-center justify-between">
        <div>
          <div className="font-medium">Müşteri galerisinde filigran</div>
          <div className="text-xs text-white/50">{s.watermark_forced ? "Deneme sürümünde filigran zorunludur." : "Fotuber/firma filigranını aç/kapat."}</div>
        </div>
        <button data-testid="sg-set-watermark" disabled={s.watermark_forced} onClick={() => save({ watermark: !s.watermark })}
          className={`w-12 h-6 rounded-full transition-colors ${s.watermark ? "bg-emerald-500" : "bg-white/20"} ${s.watermark_forced ? "opacity-50" : ""}`}>
          <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${s.watermark ? "translate-x-6" : "translate-x-0.5"}`} />
        </button>
      </div>
      <div className="rounded-xl border border-white/12 bg-white/5 p-4 flex items-center justify-between">
        <div>
          <div className="font-medium">Orijinal dosya indirmeye izin ver</div>
          <div className="text-xs text-white/50">{s.watermark_forced ? "Deneme sürümünde kapalıdır." : "Müşteri yüksek çözünürlüklü orijinali indirebilsin."}</div>
        </div>
        <button data-testid="sg-set-originals" disabled={s.watermark_forced} onClick={() => save({ allow_originals: !s.allow_originals })}
          className={`w-12 h-6 rounded-full transition-colors ${s.allow_originals ? "bg-emerald-500" : "bg-white/20"} ${s.watermark_forced ? "opacity-50" : ""}`}>
          <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${s.allow_originals ? "translate-x-6" : "translate-x-0.5"}`} />
        </button>
      </div>
    </div>
  );
}
