import React, { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Check, Album, Frame, Sparkles, CheckCircle2, Camera, Clock, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { API_BASE } from "@/lib/api";

const BE = process.env.REACT_APP_BACKEND_URL;

export default function GallerySelect() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState({}); // photo_id -> {album,canvas,retouch}
  const [upsells, setUpsells] = useState({});
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);

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

  const toggle = (pid, kind, limit, current) => {
    const cur = sel[pid] || {};
    const turningOn = !cur[kind];
    if (turningOn && limit && current >= limit) { toast.error(`Bu kategori için limit ${limit}.`); return; }
    setSel((s) => ({ ...s, [pid]: { ...cur, [kind]: turningOn } }));
  };

  const submit = async () => {
    const selections = Object.entries(sel).filter(([, v]) => v.album || v.canvas || v.retouch)
      .map(([photo_id, v]) => ({ photo_id, album: !!v.album, canvas: !!v.canvas, retouch: !!v.retouch }));
    if (selections.length === 0) { toast.error("En az bir fotoğraf seçin"); return; }
    setSubmitting(true);
    try {
      const r = await axios.post(`${API_BASE}/gallery/public/${token}/select`, {
        selections, upsells: Object.keys(upsells).filter((k) => upsells[k]), note,
      });
      setDone(r.data.order_no);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gönderilemedi");
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="min-h-screen grid place-items-center bg-neutral-950 text-white/60">Yükleniyor…</div>;
  if (data === false) return <div className="min-h-screen grid place-items-center bg-neutral-950 text-white/60">Galeri bulunamadı.</div>;

  // Package-based link expiry / originals deletion
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

  if (done) return (
    <div data-testid="gs-success" className="min-h-screen grid place-items-center bg-neutral-950 text-white p-6 text-center">
      <div className="max-w-md w-full">
        <CheckCircle2 size={56} className="mx-auto text-emerald-400" />
        <h1 className="mt-4 text-2xl font-semibold">{done === "already" ? "Seçiminiz alındı" : "Seçiminiz alındı!"}</h1>
        {done !== "already" && <p className="mt-2 text-white/60">Sipariş No: <b className="text-amber-300">{done}</b></p>}
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

  const ev = data.event;
  return (
    <div data-testid="gallery-select-page" className="min-h-screen bg-neutral-950 text-white pb-32">
      <header className="sticky top-0 z-10 bg-neutral-950/90 backdrop-blur border-b border-white/10 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-300 to-amber-600 grid place-items-center"><Camera size={18} className="text-neutral-900" /></div>
          <div>
            <div className="font-semibold leading-tight">{ev.name}</div>
            <div className="text-xs text-white/50">{data.firma_adi} · Fotoğraflarınızı seçin</div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-5">
        <div className="flex flex-wrap gap-3 mb-4 text-xs">
          <Chip label="Albüm" cur={counts.a} lim={ev.album_limit} icon={Album} />
          <Chip label="Kanvas" cur={counts.c} lim={ev.canvas_limit} icon={Frame} />
          <Chip label="Retouch" cur={counts.r} lim={ev.retouch_limit} icon={Sparkles} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.photos.map((p) => {
            const s = sel[p.id] || {};
            return (
              <div key={p.id} data-testid={`gs-photo-${p.id}`} className="rounded-xl overflow-hidden bg-white/5 border border-white/10">
                <div className="aspect-square bg-black/40 relative">
                  {p.is_raw ? <div className="w-full h-full grid place-items-center text-xs text-white/40">{p.filename}</div>
                    : <img src={`${BE}${p.thumb || p.url}`} alt="" className="w-full h-full object-cover" />}
                  {data.watermark && !p.is_raw && (
                    <div data-testid={`gs-watermark-${p.id}`} className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
                      <span className="text-white/25 text-[11px] font-bold tracking-widest -rotate-45 whitespace-nowrap select-none">
                        {(data.firma_adi + " · ").repeat(4)}
                      </span>
                    </div>
                  )}
                  {data.allow_originals && !p.is_raw && (
                    <a data-testid={`gs-download-${p.id}`} href={`${BE}${p.url}`} target="_blank" rel="noreferrer" download
                      className="absolute top-1 right-1 bg-black/60 rounded-full p-1.5 text-white hover:bg-black/80" title="Orijinali indir">
                      <Download size={13} />
                    </a>
                  )}
                </div>
                <div className="flex text-[11px]">
                  <Toggle testid={`gs-toggle-album-${p.id}`} on={s.album} label="Albüm" onClick={() => toggle(p.id, "album", ev.album_limit, counts.a)} />
                  <Toggle testid={`gs-toggle-canvas-${p.id}`} on={s.canvas} label="Kanvas" onClick={() => toggle(p.id, "canvas", ev.canvas_limit, counts.c)} />
                  <Toggle testid={`gs-toggle-retouch-${p.id}`} on={s.retouch} label="Rötuş" onClick={() => toggle(p.id, "retouch", ev.retouch_limit, counts.r)} />
                </div>
              </div>
            );
          })}
        </div>

        {data.service_packs.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wide mb-3">Ek Hizmetler</h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {data.service_packs.map((p) => (
                <label key={p.id} data-testid={`gs-pack-${p.id}`} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer ${upsells[p.id] ? "border-amber-400 bg-amber-500/10" : "border-white/12 bg-white/5"}`}>
                  <input type="checkbox" checked={!!upsells[p.id]} onChange={(e) => setUpsells((u) => ({ ...u, [p.id]: e.target.checked }))} />
                  <div><div className="font-medium text-sm">{p.name}</div><div className="text-xs text-white/50">{p.description}</div></div>
                  <div className="ml-auto font-semibold text-amber-300">{p.price}₺</div>
                </label>
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
          <div className="text-xs text-white/60">Albüm {counts.a}{ev.album_limit ? `/${ev.album_limit}` : ""} · Kanvas {counts.c} · Rötuş {counts.r}</div>
          <Button data-testid="gs-submit" onClick={submit} disabled={submitting} className="ml-auto gap-1.5 bg-gradient-to-r from-amber-400 to-amber-600 text-neutral-900 font-semibold hover:from-amber-300 hover:to-amber-500">
            {submitting ? "Gönderiliyor…" : <>Seçimi Gönder <Check size={16} /></>}
          </Button>
        </div>
      </div>
    </div>
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
