import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  Check, Album, Frame, Sparkles, CheckCircle2, Camera, Clock, Download,
  X, ChevronLeft, ChevronRight, Maximize2, Tag,
  CreditCard, Landmark, Banknote, ExternalLink, Loader2, Copy, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { API_BASE } from "@/lib/api";

const BE = process.env.REACT_APP_BACKEND_URL;

export default function GallerySelect() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState({}); // photo_id -> {album,canvas,retouch, packs:{packId:true}}
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const [payFinished, setPayFinished] = useState(false);
  const [lightbox, setLightbox] = useState(-1); // index in data.photos

  useEffect(() => {
    axios.get(`${API_BASE}/gallery/public/${token}`)
      .then((r) => { setData(r.data); if (r.data.event.submitted) setDone("already"); })
      .catch(() => setData(false))
      .finally(() => setLoading(false));
  }, [token]);

  const counts = useMemo(() => {
    let a = 0, c = 0, r = 0;
    Object.values(sel).forEach((s) => { if (s.album) a++; if (s.canvas) c++; if (s.retouch) r++; });
    return { a, c, r };
  }, [sel]);

  // Per-pack assigned photo counts
  const packCounts = useMemo(() => {
    const m = {};
    Object.values(sel).forEach((s) => {
      Object.keys(s.packs || {}).forEach((pid) => { if (s.packs[pid]) m[pid] = (m[pid] || 0) + 1; });
    });
    return m;
  }, [sel]);

  const packs = data && data.service_packs ? data.service_packs : [];
  const assignedPacks = useMemo(() => packs
    .filter((p) => (packCounts[p.id] || 0) > 0)
    .map((p) => ({ ...p, qty: packCounts[p.id], total: (p.price || 0) * packCounts[p.id] })), [packs, packCounts]);
  const upsellTotal = useMemo(() => assignedPacks.reduce((t, p) => t + p.total, 0), [assignedPacks]);

  const toggle = (pid, kind, limit, current) => {
    const cur = sel[pid] || {};
    const turningOn = !cur[kind];
    if (turningOn && limit && current >= limit) { toast.error(`Bu kategori için limit ${limit}.`); return; }
    setSel((s) => ({ ...s, [pid]: { ...cur, [kind]: turningOn } }));
  };

  const togglePack = (pid, pack) => {
    const cur = sel[pid] || {};
    const curPacks = cur.packs || {};
    const turningOn = !curPacks[pack.id];
    const already = packCounts[pack.id] || 0;
    if (turningOn && pack.max_qty && already >= pack.max_qty) {
      toast.error(`${pack.name} için en fazla ${pack.max_qty} fotoğraf seçebilirsiniz.`); return;
    }
    setSel((s) => ({ ...s, [pid]: { ...cur, packs: { ...curPacks, [pack.id]: turningOn } } }));
  };

  const submit = async () => {
    const selections = Object.entries(sel)
      .map(([photo_id, v]) => ({
        photo_id, album: !!v.album, canvas: !!v.canvas, retouch: !!v.retouch,
        packs: Object.keys(v.packs || {}).filter((k) => v.packs[k]),
      }))
      .filter((v) => v.album || v.canvas || v.retouch || v.packs.length > 0);
    if (selections.length === 0) { toast.error("En az bir fotoğraf seçin"); return; }
    setSubmitting(true);
    try {
      const r = await axios.post(`${API_BASE}/gallery/public/${token}/select`, { selections, upsells: [], note });
      setDone(r.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gönderilemedi");
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="min-h-screen grid place-items-center bg-neutral-950 text-white/60">Yükleniyor…</div>;
  if (data === false) return <div className="min-h-screen grid place-items-center bg-neutral-950 text-white/60">Galeri bulunamadı.</div>;

  if (data.link_expired || data.originals_purged) return (
    <div data-testid="gs-expired" className="min-h-screen grid place-items-center bg-neutral-950 text-white p-6 text-center">
      <div>
        <Clock size={56} className="mx-auto text-amber-400" />
        <h1 className="mt-4 text-2xl font-semibold">Galeri süresi doldu</h1>
        <p className="mt-2 text-white/60 max-w-sm">{data.message || "Görüntüleme/indirme süresi sona erdi. Yeni erişim için fotoğrafçınızla iletişime geçin."}</p>
        <p className="mt-2 text-white/40">{data.firma_adi}</p>
      </div>
    </div>
  );

  const orderStatus = data.event?.order_status;
  const flow = data.order_flow || [];

  if (done) {
    const isObj = typeof done === "object" && done !== null;
    const orderNo = isObj ? done.order_no : null;
    const needsPay = isObj && done.needs_payment && (done.payment_methods || []).length > 0 && !payFinished;
    if (needsPay) return <PaymentStep token={token} order={done} firma={data.firma_adi} onDone={() => setPayFinished(true)} />;
    return (
    <div data-testid="gs-success" className="min-h-screen grid place-items-center bg-neutral-950 text-white p-6 text-center">
      <div className="max-w-md w-full">
        <CheckCircle2 size={56} className="mx-auto text-emerald-400" />
        <h1 className="mt-4 text-2xl font-semibold">Seçiminiz alındı!</h1>
        {orderNo && <p className="mt-2 text-white/60">Sipariş No: <b className="text-amber-300">{orderNo}</b></p>}
        {payFinished && <p className="mt-1 text-sm text-emerald-300">Ödeme bilginiz iletildi. Fotoğrafçı onayladığında bilgilendirileceksiniz.</p>}
        {isObj && done.needs_payment && (done.payment_methods || []).length === 0 && (
          <p className="mt-1 text-sm text-amber-300/80">Ek hizmet ücreti için fotoğrafçınız sizinle iletişime geçecek.</p>
        )}
        <p className="mt-2 text-white/50">{data.firma_adi} sizinle iletişime geçecek. Teşekkürler.</p>
        {flow.length > 0 && (
          <div data-testid="gs-order-status" className="mt-6 text-left">
            <div className="text-xs text-white/50 mb-3 text-center">Sipariş Durumu</div>
            <div className="space-y-2">
              {flow.map((f, i) => {
                const curIdx = flow.findIndex((x) => x.key === (orderStatus || "new"));
                const state = i < curIdx ? "done" : i === curIdx ? "current" : "todo";
                return (
                  <div key={f.key} data-testid={`gs-status-${f.key}`} className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full grid place-items-center text-[11px] ${state === "done" ? "bg-emerald-500 text-white" : state === "current" ? "bg-amber-500 text-neutral-900 font-bold" : "bg-white/10 text-white/40"}`}>
                      {state === "done" ? <Check size={13} /> : i + 1}
                    </div>
                    <span className={state === "current" ? "text-white font-medium" : "text-white/50"}>{f.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
    );
  }

  const ev = data.event;
  return (
    <div data-testid="gallery-select-page" className="min-h-screen bg-neutral-950 text-white pb-36">
      <header className="sticky top-0 z-10 bg-neutral-950/90 backdrop-blur border-b border-white/10 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-300 to-amber-600 grid place-items-center"><Camera size={18} className="text-neutral-900" /></div>
          <div>
            <div className="font-semibold leading-tight">{ev.name}</div>
            <div className="text-xs text-white/50">{data.firma_adi} · Fotoğrafa dokunarak büyütün ve hizmet atayın</div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-5">
        <div className="flex flex-wrap gap-3 mb-4 text-xs">
          <Chip label="Albüm" cur={counts.a} lim={ev.album_limit} icon={Album} />
          <Chip label="Kanvas" cur={counts.c} lim={ev.canvas_limit} icon={Frame} />
          <Chip label="Retouch" cur={counts.r} lim={ev.retouch_limit} icon={Sparkles} />
          {packs.length > 0 && <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/50"><Tag size={12} className="text-amber-300" /> Fotoğrafı büyütüp ek hizmet atayın</span>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.photos.map((p, idx) => {
            const s = sel[p.id] || {};
            const assignedPackCount = Object.values(s.packs || {}).filter(Boolean).length;
            return (
              <div key={p.id} data-testid={`gs-photo-${p.id}`} className="rounded-xl overflow-hidden bg-white/5 border border-white/10">
                <button type="button" onClick={() => setLightbox(idx)} data-testid={`gs-open-lightbox-${p.id}`}
                  className="aspect-square bg-black/40 relative w-full block group">
                  {p.is_raw ? <div className="w-full h-full grid place-items-center text-xs text-white/40">{p.filename}</div>
                    : <img src={`${BE}${p.thumb || p.url}`} alt="" className="w-full h-full object-cover" />}
                  {data.watermark && !p.is_raw && (
                    <div data-testid={`gs-watermark-${p.id}`} className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
                      <span className="text-white/25 text-[11px] font-bold tracking-widest -rotate-45 whitespace-nowrap select-none">
                        {(data.firma_adi + " · ").repeat(4)}
                      </span>
                    </div>
                  )}
                  <span className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <Maximize2 size={22} className="text-white drop-shadow" />
                  </span>
                  {p.filename && <span data-testid={`gs-code-${p.id}`} className="absolute bottom-1 left-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/60 text-amber-200 max-w-[90%] truncate">{p.filename}</span>}
                  {assignedPackCount > 0 && <span className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500 text-neutral-900 font-bold">{assignedPackCount} hizmet</span>}
                  {data.allow_originals && !p.is_raw && (
                    <a data-testid={`gs-download-${p.id}`} href={`${BE}${p.url}`} target="_blank" rel="noreferrer" download onClick={(e) => e.stopPropagation()}
                      className="absolute top-1 right-1 bg-black/60 rounded-full p-1.5 text-white hover:bg-black/80" title="Orijinali indir">
                      <Download size={13} />
                    </a>
                  )}
                </button>
                <div className="flex text-[11px]">
                  <Toggle testid={`gs-toggle-album-${p.id}`} on={s.album} label="Albüm" onClick={() => toggle(p.id, "album", ev.album_limit, counts.a)} />
                  <Toggle testid={`gs-toggle-canvas-${p.id}`} on={s.canvas} label="Kanvas" onClick={() => toggle(p.id, "canvas", ev.canvas_limit, counts.c)} />
                  <Toggle testid={`gs-toggle-retouch-${p.id}`} on={s.retouch} label="Rötuş" onClick={() => toggle(p.id, "retouch", ev.retouch_limit, counts.r)} />
                </div>
              </div>
            );
          })}
        </div>

        {assignedPacks.length > 0 && (
          <div data-testid="gs-assigned-summary" className="mt-8">
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wide mb-3">Seçilen Ek Hizmetler</h2>
            <div className="space-y-2">
              {assignedPacks.map((p) => (
                <div key={p.id} data-testid={`gs-assigned-${p.id}`} className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300">{p.kind || "Diğer"}</span>
                    <span className="font-medium text-sm">{p.name}</span>
                    <span className="ml-auto font-semibold text-amber-300">{p.qty} × {p.price}₺ = {p.total}₺</span>
                  </div>
                  <div className="text-[11px] text-white/50 mt-1 font-mono">
                    {data.photos.filter((ph) => (sel[ph.id]?.packs || {})[p.id]).map((ph) => ph.filename || ph.id).join(", ")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6">
          <label className="text-sm text-white/60">Notunuz (opsiyonel)</label>
          <Textarea data-testid="gs-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 bg-white/5 border-white/15 text-white" placeholder="Özel isteklerinizi yazabilirsiniz" />
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-neutral-950/95 backdrop-blur border-t border-white/10 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <div className="text-xs text-white/60">
            Albüm {counts.a}{ev.album_limit ? `/${ev.album_limit}` : ""} · Kanvas {counts.c} · Rötuş {counts.r}
            {upsellTotal > 0 && <span className="ml-2 text-amber-300 font-semibold">· Ek Hizmet: {upsellTotal}₺</span>}
          </div>
          <Button data-testid="gs-submit" onClick={submit} disabled={submitting} className="ml-auto gap-1.5 bg-gradient-to-r from-amber-400 to-amber-600 text-neutral-900 font-semibold hover:from-amber-300 hover:to-amber-500">
            {submitting ? "Gönderiliyor…" : <>Seçimi Gönder <Check size={16} /></>}
          </Button>
        </div>
      </div>

      {lightbox >= 0 && (
        <Lightbox
          photos={data.photos} index={lightbox} setIndex={setLightbox}
          onClose={() => setLightbox(-1)} data={data} sel={sel} ev={ev} counts={counts}
          packs={packs} packCounts={packCounts} toggle={toggle} togglePack={togglePack}
        />
      )}
    </div>
  );
}

function Lightbox({ photos, index, setIndex, onClose, data, sel, ev, counts, packs, packCounts, toggle, togglePack }) {
  const touchX = useRef(null);
  const p = photos[index];
  const s = sel[p.id] || {};

  const go = useCallback((dir) => {
    setIndex((i) => {
      const n = i + dir;
      if (n < 0) return photos.length - 1;
      if (n >= photos.length) return 0;
      return n;
    });
  }, [photos.length, setIndex]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    touchX.current = null;
  };

  return (
    <div data-testid="gs-lightbox" className="fixed inset-0 z-50 bg-black/95 flex flex-col" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="flex items-center gap-3 px-4 py-3 text-white">
        <span className="text-sm text-white/60">{index + 1} / {photos.length}</span>
        {p.filename && <span data-testid="gs-lightbox-code" className="font-mono text-sm px-2 py-0.5 rounded bg-white/10 text-amber-200">{p.filename}</span>}
        <button data-testid="gs-lightbox-close" onClick={onClose} className="ml-auto p-2 rounded-full bg-white/10 hover:bg-white/20"><X size={20} /></button>
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden px-2">
        <button data-testid="gs-lightbox-prev" onClick={() => go(-1)} className="absolute left-2 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"><ChevronLeft size={26} /></button>
        <div className="relative max-h-full max-w-full">
          {p.is_raw
            ? <div className="text-white/50 p-10">{p.filename} (RAW — önizlenemez)</div>
            : <img src={`${BE}${p.url || p.thumb}`} alt="" className="max-h-[62vh] max-w-full object-contain select-none" draggable={false} />}
          {data.watermark && !p.is_raw && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
              <span className="text-white/20 text-2xl font-bold tracking-widest -rotate-45 whitespace-nowrap select-none">
                {(data.firma_adi + " · ").repeat(3)}
              </span>
            </div>
          )}
        </div>
        <button data-testid="gs-lightbox-next" onClick={() => go(1)} className="absolute right-2 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"><ChevronRight size={26} /></button>
      </div>

      <div className="bg-neutral-950/95 border-t border-white/10 px-4 py-3 space-y-3 max-h-[38vh] overflow-y-auto">
        <div className="flex gap-2">
          <LbToggle testid={`gs-lb-album-${p.id}`} on={s.album} label="Albüm" icon={Album} onClick={() => toggle(p.id, "album", ev.album_limit, counts.a)} />
          <LbToggle testid={`gs-lb-canvas-${p.id}`} on={s.canvas} label="Kanvas" icon={Frame} onClick={() => toggle(p.id, "canvas", ev.canvas_limit, counts.c)} />
          <LbToggle testid={`gs-lb-retouch-${p.id}`} on={s.retouch} label="Rötuş" icon={Sparkles} onClick={() => toggle(p.id, "retouch", ev.retouch_limit, counts.r)} />
        </div>
        {packs.length > 0 && (
          <div>
            <div className="text-[11px] text-white/40 uppercase tracking-wide mb-1.5">Ek Hizmet Ata</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {packs.map((pk) => {
                const on = !!(s.packs || {})[pk.id];
                const used = packCounts[pk.id] || 0;
                return (
                  <button key={pk.id} data-testid={`gs-lb-pack-${pk.id}`} onClick={() => togglePack(p.id, pk)}
                    className={`text-left rounded-xl border p-2.5 transition-colors ${on ? "border-amber-400 bg-amber-500/15" : "border-white/12 bg-white/5 hover:bg-white/10"}`}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">{pk.kind || "Diğer"}</span>
                      {on && <Check size={13} className="text-amber-300 ml-auto" />}
                    </div>
                    <div className="text-sm font-medium mt-1 text-white truncate">{pk.name}</div>
                    <div className="text-xs text-amber-300 font-semibold">{pk.price > 0 ? `+${pk.price}₺` : "Ücretsiz"}
                      {pk.max_qty ? <span className="text-white/40 font-normal"> · {used}/{pk.max_qty}</span> : null}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LbToggle({ testid, on, label, icon: Icon, onClick }) {
  return (
    <button data-testid={testid} onClick={onClick}
      className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-sm font-medium border transition-colors ${on ? "bg-amber-500 text-neutral-900 border-amber-500" : "text-white/70 border-white/12 bg-white/5 hover:bg-white/10"}`}>
      <Icon size={15} /> {label} {on && <Check size={14} />}
    </button>
  );
}

function Chip({ label, cur, lim, icon: Icon }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
      <Icon size={13} className="text-amber-300" /> {label}: <b>{cur}{lim ? `/${lim}` : ""}</b>
    </span>
  );
}

function Toggle({ testid, on, label, onClick }) {
  return (
    <button data-testid={testid} onClick={onClick}
      className={`flex-1 py-2 flex items-center justify-center gap-1 border-t border-white/10 transition-colors ${on ? "bg-amber-500 text-neutral-900 font-semibold" : "text-white/60 hover:bg-white/5"}`}>
      {on && <Check size={11} />} {label}
    </button>
  );
}

const PAY_ICON = { paytr: CreditCard, iyzico: CreditCard, odeal: CreditCard, link: ExternalLink, iban: Landmark, cash: Banknote };

function PaymentStep({ token, order, firma, onDone }) {
  const [stage, setStage] = useState("choose"); // choose | auto | manual_link | manual_info
  const [picked, setPicked] = useState(null);
  const [info, setInfo] = useState({});
  const [busy, setBusy] = useState(false);

  const pick = async (m) => {
    setBusy(true); setPicked(m);
    try {
      const r = await axios.post(`${API_BASE}/gallery/public/${token}/orders/${order.order_id}/pay`, { method_id: m.id });
      const d = r.data;
      if (d.paid) { onDone(); return; }
      if (d.auto && d.redirect_url) { window.open(d.redirect_url, "_blank", "noopener"); setStage("auto"); }
      else if (m.provider === "link" && d.redirect_url) { window.open(d.redirect_url, "_blank", "noopener"); setStage("manual_link"); }
      else { setInfo(d.info || m.info || {}); setStage("manual_info"); }
    } catch (e) { toast.error(e?.response?.data?.detail || "Ödeme başlatılamadı"); setPicked(null); }
    finally { setBusy(false); }
  };

  const markPaid = async () => {
    setBusy(true);
    try { await axios.post(`${API_BASE}/gallery/public/${token}/orders/${order.order_id}/mark-paid`); onDone(); }
    catch { toast.error("İşlem başarısız"); } finally { setBusy(false); }
  };

  const checkStatus = async () => {
    setBusy(true);
    try {
      const r = await axios.get(`${API_BASE}/gallery/public/${token}/orders/${order.order_id}/status`);
      if (r.data.payment_status === "paid") { toast.success("Ödemeniz alındı!"); onDone(); }
      else toast.info("Ödeme henüz görünmüyor. Tamamladıysanız birkaç dakika sonra tekrar deneyin.");
    } catch { toast.error("Kontrol edilemedi"); } finally { setBusy(false); }
  };

  const copyIban = async () => { try { await navigator.clipboard.writeText((info.iban || "").replace(/\s/g, "")); toast.success("IBAN kopyalandı"); } catch { /* noop */ } };

  return (
    <div data-testid="gs-payment-step" className="min-h-screen bg-neutral-950 text-white p-6">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <CheckCircle2 size={44} className="mx-auto text-emerald-400" />
          <h1 className="mt-3 text-xl font-semibold">Seçiminiz alındı — Ödeme</h1>
          <p className="mt-1 text-sm text-white/50">Sipariş No: <b className="text-amber-300">{order.order_no}</b></p>
          <p className="mt-1 text-2xl font-bold text-amber-300">{order.upsell_total}₺</p>
          <p className="text-xs text-white/40">Ek hizmet tutarı · {firma}</p>
        </div>

        {stage === "choose" && (
          <div className="space-y-2" data-testid="gs-pay-methods">
            <div className="text-xs text-white/50 mb-1">Ödeme yöntemini seçin</div>
            {(order.payment_methods || []).map((m) => {
              const Icon = PAY_ICON[m.provider] || CreditCard;
              return (
                <button key={m.id} data-testid={`gs-pay-method-${m.id}`} disabled={busy} onClick={() => pick(m)}
                  className="w-full flex items-center gap-3 rounded-xl border border-white/12 bg-white/5 hover:bg-white/10 p-4 text-left transition-colors disabled:opacity-50">
                  <span className="w-9 h-9 rounded-lg bg-amber-500/15 grid place-items-center"><Icon size={18} className="text-amber-300" /></span>
                  <span className="font-medium">{m.label}</span>
                  {m.auto && <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">Kart ile</span>}
                </button>
              );
            })}
            <button data-testid="gs-pay-later" onClick={onDone} className="w-full text-center text-xs text-white/40 hover:text-white/70 mt-3 py-2">Daha sonra ödeyeceğim</button>
          </div>
        )}

        {stage === "auto" && (
          <div className="text-center space-y-4" data-testid="gs-pay-auto">
            <p className="text-sm text-white/70">Ödeme sayfası yeni sekmede açıldı. Kart ödemenizi orada tamamlayın.</p>
            <p className="text-xs text-white/40">Açılmadıysa açılır pencere izni verin.</p>
            <Button data-testid="gs-pay-check" onClick={checkStatus} disabled={busy} className="w-full gap-1.5 bg-amber-500 hover:bg-amber-600 text-neutral-900 font-semibold">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Ödememi Kontrol Et
            </Button>
            <button onClick={() => setStage("choose")} className="text-xs text-white/40 hover:text-white/70 inline-flex items-center gap-1"><ArrowLeft size={12} /> Yöntemi değiştir</button>
          </div>
        )}

        {stage === "manual_link" && (
          <div className="text-center space-y-4" data-testid="gs-pay-manual-link">
            <p className="text-sm text-white/70">Ödeme sayfası yeni sekmede açıldı. Ödemenizi tamamladıktan sonra aşağıdaki butona basın.</p>
            <Button data-testid="gs-pay-mark-paid" onClick={markPaid} disabled={busy} className="w-full gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-neutral-900 font-semibold">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Ödedim
            </Button>
            <button onClick={() => setStage("choose")} className="text-xs text-white/40 hover:text-white/70 inline-flex items-center gap-1"><ArrowLeft size={12} /> Yöntemi değiştir</button>
          </div>
        )}

        {stage === "manual_info" && (
          <div className="space-y-4" data-testid="gs-pay-manual-info">
            {picked?.provider === "iban" ? (
              <div className="rounded-xl border border-white/12 bg-white/5 p-4 space-y-2">
                <div className="text-xs text-white/50">Aşağıdaki hesaba havale/EFT yapın:</div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-amber-200 break-all">{info.iban}</span>
                  <button onClick={copyIban} className="p-1.5 rounded bg-white/10 hover:bg-white/20"><Copy size={13} /></button>
                </div>
                {info.holder && <div className="text-sm">Alıcı: <b>{info.holder}</b></div>}
                {info.bank && <div className="text-sm text-white/60">Banka: {info.bank}</div>}
                <div className="text-xs text-amber-300/80">Açıklamaya sipariş no yazın: {order.order_no}</div>
              </div>
            ) : (
              <div className="rounded-xl border border-white/12 bg-white/5 p-4 text-sm text-white/70">
                Ödemeyi teslimatta elden yapacaksınız. Onaya göndermek için aşağıdaki butona basın.
              </div>
            )}
            <Button data-testid="gs-pay-mark-paid" onClick={markPaid} disabled={busy} className="w-full gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-neutral-900 font-semibold">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {picked?.provider === "iban" ? "Havaleyi Yaptım" : "Onaya Gönder"}
            </Button>
            <button onClick={() => setStage("choose")} className="w-full text-center text-xs text-white/40 hover:text-white/70 inline-flex items-center justify-center gap-1"><ArrowLeft size={12} /> Yöntemi değiştir</button>
          </div>
        )}
      </div>
    </div>
  );
}
