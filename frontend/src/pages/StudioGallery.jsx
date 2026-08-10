import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Upload, Trash2, Copy, Image as ImageIcon, Package, ClipboardList,
  FileDown, Link2, Loader2, AlertTriangle, X,
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

const BE = process.env.REACT_APP_BACKEND_URL;
const CHUNK = 512 * 1024;
const ORDER_STATUS = { new: "Yeni", processing: "Hazırlanıyor", ready: "Hazır", delivered: "Teslim" };

export default function StudioGallery() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("events");
  const [events, setEvents] = useState([]);
  const [active, setActive] = useState(null); // event detail
  const [packs, setPacks] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadEvents = useCallback(async () => {
    try { setEvents((await studioApi.get("/studio/gallery/events")).data); }
    catch (e) { if (e?.response?.status === 401) navigate("/studyo"); }
  }, [navigate]);
  const loadPacks = useCallback(async () => setPacks((await studioApi.get("/studio/gallery/service-packs")).data), []);
  const loadOrders = useCallback(async () => setOrders((await studioApi.get("/studio/gallery/orders")).data), []);

  useEffect(() => {
    studioApi.get("/studio/me").catch(() => navigate("/studyo"));
    Promise.all([loadEvents(), loadPacks(), loadOrders()]).finally(() => setLoading(false));
  }, [navigate, loadEvents, loadPacks, loadOrders]);

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
  };

  return (
    <div data-testid="studio-gallery-page" className="min-h-screen text-white"
      style={{ background: "radial-gradient(900px 500px at 80% -10%, #17233d 0%, #070b14 60%, #05070d 100%)" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button data-testid="sg-back" onClick={() => navigate("/studyo/panel")} className="p-2 rounded-lg bg-white/5 hover:bg-white/10"><ArrowLeft size={18} /></button>
          <h1 className="text-2xl font-semibold">Etkinlik Galerisi</h1>
        </div>

        <div className="flex gap-1 p-1 rounded-xl bg-white/5 w-fit mb-6">
          {[["events", "Etkinlikler", ImageIcon], ["packs", "Servis Paketleri", Package], ["orders", "Siparişler", ClipboardList]].map(([k, label, Icon]) => (
            <button key={k} data-testid={`sg-tab-${k}`} onClick={() => switchTab(k)}
              className={`px-4 h-9 rounded-lg text-sm font-medium flex items-center gap-1.5 ${tab === k ? "bg-white text-neutral-900" : "text-white/60 hover:text-white"}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {loading ? <p className="text-white/50">Yükleniyor…</p> : (
          <>
            {tab === "events" && !active && <EventsList events={events} onOpen={setActive} onCopy={copyLink} onCreated={loadEvents} onDeleted={loadEvents} />}
            {tab === "events" && active && <EventDetail eventId={active.id} onBack={() => { setActive(null); loadEvents(); }} onCopy={copyLink} />}
            {tab === "packs" && <PacksTab packs={packs} reload={loadPacks} />}
            {tab === "orders" && <OrdersTab orders={orders} reload={loadOrders} />}
          </>
        )}
      </div>
    </div>
  );
}

function EventsList({ events, onOpen, onCopy, onCreated, onDeleted }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", client_name: "", event_date: "", album_limit: 0, canvas_limit: 0, retouch_limit: 0 });
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!form.name.trim()) { toast.error("Etkinlik adı gerekli"); return; }
    setBusy(true);
    try {
      await studioApi.post("/studio/gallery/events", {
        ...form, album_limit: +form.album_limit || 0, canvas_limit: +form.canvas_limit || 0, retouch_limit: +form.retouch_limit || 0,
      });
      toast.success("Etkinlik oluşturuldu"); setOpen(false);
      setForm({ name: "", client_name: "", event_date: "", album_limit: 0, canvas_limit: 0, retouch_limit: 0 });
      onCreated();
    } catch (e) { toast.error(formatApiError(e, "Oluşturulamadı")); } finally { setBusy(false); }
  };
  const del = async (ev) => {
    if (!window.confirm(`"${ev.name}" ve tüm fotoğrafları silinsin mi?`)) return;
    await studioApi.delete(`/studio/gallery/events/${ev.id}`); toast.success("Silindi"); onDeleted();
  };

  return (
    <div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button data-testid="sg-new-event-btn" className="mb-4 gap-1.5 bg-amber-500 hover:bg-amber-600 text-neutral-900 font-semibold"><Plus size={16} /> Yeni Etkinlik</Button>
        </DialogTrigger>
        <DialogContent className="text-neutral-900">
          <DialogHeader><DialogTitle>Yeni Etkinlik</DialogTitle>
            <DialogDescription>Katı albüm/kanvas/retouch limitleri belirleyin (0 = sınırsız).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input data-testid="sg-event-name" placeholder="Etkinlik adı (örn. Ayşe & Mehmet Düğün)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input data-testid="sg-event-client" placeholder="Müşteri adı" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
            <Input data-testid="sg-event-date" type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <div><label className="text-xs text-neutral-500">Albüm limiti</label><Input data-testid="sg-event-albumlimit" type="number" value={form.album_limit} onChange={(e) => setForm({ ...form, album_limit: e.target.value })} /></div>
              <div><label className="text-xs text-neutral-500">Kanvas limiti</label><Input type="number" value={form.canvas_limit} onChange={(e) => setForm({ ...form, canvas_limit: e.target.value })} /></div>
              <div><label className="text-xs text-neutral-500">Retouch limiti</label><Input type="number" value={form.retouch_limit} onChange={(e) => setForm({ ...form, retouch_limit: e.target.value })} /></div>
            </div>
            <Button data-testid="sg-create-event-submit" onClick={create} disabled={busy} className="w-full bg-neutral-900 hover:bg-neutral-800">{busy ? "..." : "Oluştur"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {events.length === 0 ? <p className="text-white/40">Henüz etkinlik yok.</p> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {events.map((ev) => (
            <div key={ev.id} data-testid={`sg-event-card-${ev.id}`} className="rounded-2xl border border-white/12 bg-white/5 p-4">
              <div className="flex items-start justify-between">
                <div className="font-semibold">{ev.name}</div>
                {ev.submitted && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">Seçim geldi</span>}
              </div>
              <div className="text-xs text-white/50 mt-1">{ev.client_name || "-"} · {ev.photo_count} foto</div>
              <div className="text-xs text-white/40 mt-0.5">Albüm limiti: {ev.album_limit || "∞"}</div>
              <div className="flex gap-2 mt-3">
                <Button data-testid={`sg-open-${ev.id}`} size="sm" onClick={() => onOpen(ev)} className="gap-1 bg-white/10 hover:bg-white/20 text-white"><Upload size={13} /> Yönet</Button>
                <Button data-testid={`sg-copy-link-${ev.id}`} size="sm" variant="outline" onClick={() => onCopy(ev.share_token)} className="gap-1 bg-transparent border-white/15 text-white hover:bg-white/10"><Link2 size={13} /> Link</Button>
                <Button data-testid={`sg-del-event-${ev.id}`} size="sm" variant="ghost" onClick={() => del(ev)} className="ml-auto text-red-300 hover:text-red-200 hover:bg-red-500/10"><Trash2 size={14} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EventDetail({ eventId, onBack, onCopy }) {
  const [data, setData] = useState(null);
  const [uploads, setUploads] = useState([]); // {name, pct, raw}
  const fileRef = useRef(null);

  const load = useCallback(async () => setData((await studioApi.get(`/studio/gallery/events/${eventId}`)).data), [eventId]);
  useEffect(() => { load(); }, [load]);

  const uploadFile = async (file) => {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
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

  if (!data) return <p className="text-white/50">Yükleniyor…</p>;
  const ev = data.event;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button data-testid="sg-detail-back" onClick={onBack} className="p-2 rounded-lg bg-white/5 hover:bg-white/10"><ArrowLeft size={16} /></button>
        <div>
          <div className="font-semibold">{ev.name}</div>
          <div className="text-xs text-white/50">{ev.client_name || "-"} · {data.photos.length} foto · Albüm limiti {ev.album_limit || "∞"}</div>
        </div>
        <div className="ml-auto flex gap-2">
          <Button data-testid="sg-detail-copy" size="sm" variant="outline" onClick={() => onCopy(ev.share_token)} className="gap-1 bg-transparent border-white/15 text-white hover:bg-white/10"><Copy size={13} /> Müşteri Linki</Button>
          <Button data-testid="sg-upload-btn" size="sm" onClick={() => fileRef.current?.click()} className="gap-1 bg-amber-500 hover:bg-amber-600 text-neutral-900 font-semibold"><Upload size={14} /> Foto Yükle</Button>
          <input ref={fileRef} data-testid="sg-upload-input" type="file" accept="image/*,.cr2,.cr3,.nef,.arw,.dng,.raf,.orf,.rw2" multiple hidden onChange={onPick} />
        </div>
      </div>

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
              <button data-testid={`sg-del-photo-${p.id}`} onClick={() => delPhoto(p.id)} className="absolute top-1 right-1 bg-black/60 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PacksTab({ packs, reload }) {
  const [form, setForm] = useState({ name: "", price: "", description: "" });
  const create = async () => {
    if (!form.name.trim()) { toast.error("Paket adı gerekli"); return; }
    await studioApi.post("/studio/gallery/service-packs", { name: form.name, price: +form.price || 0, description: form.description, active: true });
    setForm({ name: "", price: "", description: "" }); toast.success("Paket eklendi"); reload();
  };
  const del = async (id) => { await studioApi.delete(`/studio/gallery/service-packs/${id}`); reload(); };
  return (
    <div className="max-w-2xl">
      <div className="rounded-xl border border-white/12 bg-white/5 p-4 mb-4 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[140px]"><label className="text-xs text-white/50">Paket adı</label><Input data-testid="sg-pack-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-white/5 border-white/15 text-white" /></div>
        <div className="w-28"><label className="text-xs text-white/50">Fiyat ₺</label><Input data-testid="sg-pack-price" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="bg-white/5 border-white/15 text-white" /></div>
        <div className="flex-1 min-w-[140px]"><label className="text-xs text-white/50">Açıklama</label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-white/5 border-white/15 text-white" /></div>
        <Button data-testid="sg-create-pack" onClick={create} className="gap-1 bg-amber-500 hover:bg-amber-600 text-neutral-900"><Plus size={15} /> Ekle</Button>
      </div>
      {packs.length === 0 ? <p className="text-white/40">Henüz upsell paketi yok.</p> : (
        <div className="space-y-2">
          {packs.map((p) => (
            <div key={p.id} data-testid={`sg-pack-${p.id}`} className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-center gap-3">
              <div><div className="font-medium">{p.name}</div><div className="text-xs text-white/50">{p.description}</div></div>
              <div className="ml-auto font-semibold text-amber-300">{p.price}₺</div>
              <Button size="sm" variant="ghost" onClick={() => del(p.id)} className="text-red-300 hover:bg-red-500/10"><Trash2 size={14} /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OrdersTab({ orders, reload }) {
  const setStatus = async (id, status) => { await studioApi.put(`/studio/gallery/orders/${id}/status`, { status }); toast.success("Durum güncellendi"); reload(); };
  const pdf = async (o) => {
    const res = await studioApi.get(`/studio/gallery/orders/${o.id}/pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data); const a = document.createElement("a"); a.href = url; a.download = `siparis-${o.order_no}.pdf`; a.click(); URL.revokeObjectURL(url);
  };
  return orders.length === 0 ? <p className="text-white/40">Henüz sipariş yok.</p> : (
    <div className="space-y-2">
      {orders.map((o) => (
        <div key={o.id} data-testid={`sg-order-${o.id}`} className="rounded-xl border border-white/12 bg-white/5 p-4 flex flex-wrap items-center gap-3">
          <div>
            <div className="font-semibold">{o.order_no} · {o.event_name}</div>
            <div className="text-xs text-white/50">{o.client_name || "-"} · Albüm {o.album_count} · Kanvas {o.canvas_count} · Retouch {o.retouch_count}{o.upsell_total ? ` · Upsell ${o.upsell_total}₺` : ""}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Select value={o.status} onValueChange={(v) => setStatus(o.id, v)}>
              <SelectTrigger data-testid={`sg-order-status-${o.id}`} className="h-8 w-36 bg-white/5 border-white/15 text-white text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(ORDER_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
            <Button data-testid={`sg-order-pdf-${o.id}`} size="sm" variant="outline" onClick={() => pdf(o)} className="gap-1 bg-transparent border-white/15 text-white hover:bg-white/10"><FileDown size={13} /> PDF</Button>
          </div>
        </div>
      ))}
    </div>
  );
}
