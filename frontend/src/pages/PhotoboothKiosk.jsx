import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeCanvas } from "qrcode.react";
import { Aperture, Camera, Check, Printer, QrCode, RotateCcw, Lock, X } from "lucide-react";
import { api, API_BASE, formatApiError } from "@/lib/api";
import { toast } from "sonner";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "AI Filtre" taslağı: gerçek AI yok — canvas filtreleri (sonra AI ile değiştirilecek).
const FILTERS = [
  { key: "none", label: "Orijinal", css: "none" },
  { key: "bw", label: "Siyah-Beyaz", css: "grayscale(1) contrast(1.05)" },
  { key: "warm", label: "Sıcak", css: "sepia(0.35) saturate(1.3) brightness(1.03)" },
  { key: "vintage", label: "Retro", css: "sepia(0.55) contrast(1.1) brightness(0.96)" },
  { key: "cool", label: "Soğuk", css: "saturate(1.1) hue-rotate(-12deg) brightness(1.02)" },
];

const loadImg = (src) => new Promise((res, rej) => {
  const im = new Image();
  im.onload = () => res(im);
  im.onerror = rej;
  im.src = src;
});

// Layout başına kaç kare kullanılır.
const shotsForLayout = (layout) => (layout === "strip4" || layout === "grid4" ? 4 : 1);

async function composePhoto({ shots, template, slogan, logoUrl, filterCss }) {
  const layout = template?.layout || "single";
  const accent = template?.accent || "#111827";
  const need = shotsForLayout(layout);
  const use = [];
  for (let i = 0; i < need; i++) use.push(shots[i % shots.length]);
  const imgs = await Promise.all(use.map(loadImg));
  let logoImg = null;
  if (logoUrl) { try { logoImg = await loadImg(logoUrl); } catch { /* ignore */ } }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const footer = 150;
  const pad = 22;

  const drawCover = (im, x, y, w, h) => {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const r = Math.max(w / im.width, h / im.height);
    const dw = im.width * r, dh = im.height * r;
    ctx.filter = filterCss || "none";
    ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.restore();
  };

  const drawFooter = (w, y, h) => {
    ctx.filter = "none";
    ctx.fillStyle = accent;
    ctx.fillRect(0, y, w, h);
    if (logoImg) {
      const lh = h * 0.5, lw = lh * (logoImg.width / logoImg.height);
      ctx.drawImage(logoImg, w / 2 - lw / 2, y + h * 0.16, lw, lh);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = `600 ${Math.round(h * 0.18)}px Manrope, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(slogan || "Fotuber Photobooth", w / 2, y + h * 0.82);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 ${Math.round(h * 0.34)}px Manrope, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(slogan || "Fotuber Photobooth", w / 2, y + h * 0.62);
    }
  };

  if (layout === "strip4") {
    const pw = 520, ph = 390, gap = 12;
    canvas.width = pw + pad * 2;
    canvas.height = pad + 4 * (ph + gap) + footer;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    imgs.forEach((im, i) => drawCover(im, pad, pad + i * (ph + gap), pw, ph));
    drawFooter(canvas.width, canvas.height - footer, footer);
  } else if (layout === "grid4") {
    const pw = 430, ph = 323, gap = 12;
    canvas.width = pad * 2 + pw * 2 + gap;
    canvas.height = pad * 2 + ph * 2 + gap + footer - pad;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    imgs.forEach((im, i) => {
      const cx = pad + (i % 2) * (pw + gap);
      const cy = pad + Math.floor(i / 2) * (ph + gap);
      drawCover(im, cx, cy, pw, ph);
    });
    drawFooter(canvas.width, canvas.height - footer, footer);
  } else if (layout === "polaroid") {
    const pw = 640, ph = 640;
    canvas.width = pw + pad * 3;
    canvas.height = pad * 2 + ph + 200;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawCover(imgs[0], pad * 1.5, pad * 1.5, pw, ph);
    ctx.filter = "none";
    ctx.fillStyle = accent;
    ctx.font = "700 44px 'Great Vibes', cursive";
    ctx.textAlign = "center";
    ctx.fillText(slogan || "Fotuber", canvas.width / 2, canvas.height - 55);
  } else {
    // postcard / single
    const pw = 900, ph = 600;
    canvas.width = pw + pad * 2;
    canvas.height = pad + ph + footer;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawCover(imgs[0], pad, pad, pw, ph);
    drawFooter(canvas.width, canvas.height - footer, footer);
  }

  return new Promise((res) => canvas.toBlob((b) => res(b), "image/png", 0.95));
}

export default function PhotoboothKiosk() {
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [stage, setStage] = useState("idle"); // idle|countdown|filter|frame|package|processing|done
  const [count, setCount] = useState(0);
  const [shots, setShots] = useState([]);
  const [filter, setFilter] = useState(FILTERS[0]);
  const [tpl, setTpl] = useState(null);
  const [result, setResult] = useState(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const shotsRef = useRef([]);

  useEffect(() => {
    api.get("/photobooth/config")
      .then(({ data }) => setConfig(data))
      .catch((e) => { if (e?.response?.status === 401) navigate("/personel-girisi"); });
    return () => { if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop()); };
  }, [navigate]);

  const enterFullscreen = () => {
    try { document.documentElement.requestFullscreen?.(); } catch { /* ignore */ }
  };

  const ensureStream = useCallback(async () => {
    if (streamRef.current) return true;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 1280, height: 720 }, audio: false });
      streamRef.current = s;
      if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play().catch(() => {}); }
      return true;
    } catch {
      toast.error("Kameraya erişilemedi. İzin verin veya bir kamera bağlayın.");
      return false;
    }
  }, []);

  const capture = () => {
    const v = videoRef.current;
    if (!v) return null;
    const c = document.createElement("canvas");
    c.width = v.videoWidth || 1280; c.height = v.videoHeight || 720;
    const ctx = c.getContext("2d");
    // ayna görüntüsü (selfie) düzelt
    ctx.translate(c.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.9);
  };

  const startSession = async () => {
    enterFullscreen();
    const ok = await ensureStream();
    if (!ok) return;
    shotsRef.current = [];
    setShots([]);
    const total = 4;
    const cd = config?.settings?.countdown_seconds || 3;
    setStage("countdown");
    for (let n = 0; n < total; n++) {
      for (let s = cd; s >= 1; s--) { setCount(s); await sleep(900); }
      setCount(0); // flash
      await sleep(220);
      const shot = capture();
      if (shot) { shotsRef.current = [...shotsRef.current, shot]; setShots([...shotsRef.current]); }
      await sleep(500);
    }
    setStage("filter");
  };

  const finish = async (pkg) => {
    setStage("processing");
    try {
      const blob = await composePhoto({
        shots: shotsRef.current, template: tpl,
        slogan: config?.settings?.brand_slogan, logoUrl: config?.settings?.brand_logo_url,
        filterCss: filter.css,
      });
      const fd = new FormData();
      fd.append("image", blob, "photo.png");
      fd.append("template_id", tpl?.id || "");
      fd.append("package_id", pkg?.id || "");
      const { data } = await api.post("/photobooth/capture", fd);
      setResult({ token: data.qr_token, path: data.gallery_path, url: window.location.origin + data.gallery_path });
      setStage("done");
    } catch (e) {
      toast.error(formatApiError(e, "Bir hata oluştu"));
      setStage("package");
    }
  };

  const reset = () => {
    shotsRef.current = []; setShots([]); setResult(null); setTpl(null); setFilter(FILTERS[0]); setStage("idle");
  };

  const tryExit = async () => {
    try {
      const { data } = await api.post("/photobooth/verify-exit-pin", { pin });
      if (data.ok) {
        try { document.exitFullscreen?.(); } catch { /* ignore */ }
        if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
        navigate("/admin/photobooth");
      } else { toast.error("PIN hatalı"); }
    } catch { toast.error("PIN doğrulanamadı"); }
    setPin("");
  };

  const templates = config?.templates || [];
  const packages = config?.packages || [];
  const composePreviewShots = shots.length ? shots : [];

  return (
    <div data-testid="photobooth-kiosk" onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-0 z-[9999] overflow-hidden text-white select-none"
      style={{ background: "radial-gradient(1200px 700px at 50% -10%, #1a1030 0%, #0a0713 55%, #05040a 100%)" }}>

      {/* Gizli admin çıkış (sol üst köşe, düşük opaklık) */}
      <button data-testid="pb-exit-btn" onClick={() => setPinOpen(true)}
        className="absolute top-0 left-0 w-16 h-16 opacity-[0.06] hover:opacity-30 z-50" aria-label="admin-exit">
        <Lock size={18} className="m-auto" />
      </button>

      {/* Marka üst şerit */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 text-white/70">
        {config?.settings?.brand_logo_url
          ? <img src={config.settings.brand_logo_url} alt="logo" className="h-8" />
          : <Aperture size={22} className="text-fuchsia-300" />}
        <span className="text-lg font-semibold tracking-tight">{config?.settings?.brand_slogan || "Fotuber Photobooth"}</span>
      </div>

      {/* Video her zaman hazır (gizli değil, önizleme için stage'lerde gösterilir) */}
      <video ref={videoRef} playsInline muted className="hidden" />

      <AnimatePresence mode="wait">
        {stage === "idle" && (
          <motion.div key="idle" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-8">
            <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 2.2 }}
              className="w-40 h-40 rounded-full bg-gradient-to-br from-fuchsia-400 to-indigo-600 flex items-center justify-center shadow-2xl shadow-fuchsia-900/40">
              <Camera size={64} className="text-white" />
            </motion.div>
            <div className="text-center">
              <h1 className="text-5xl font-black tracking-tight">Hazır mısın?</h1>
              <p className="mt-3 text-white/60 text-lg">Başlamak için dokun · 4 kare çekeceğiz</p>
            </div>
            <button data-testid="pb-start-btn" onClick={startSession}
              className="px-14 py-5 rounded-full bg-white text-neutral-900 text-2xl font-bold hover:scale-105 transition-transform">
              BAŞLA
            </button>
          </motion.div>
        )}

        {stage === "countdown" && (
          <motion.div key="cd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center">
            <video autoPlay playsInline muted ref={(el) => { if (el && streamRef.current) el.srcObject = streamRef.current; }}
              className="absolute inset-0 w-full h-full object-cover opacity-90" style={{ transform: "scaleX(-1)" }} />
            <div className="absolute inset-0 bg-black/25" />
            {count > 0 ? (
              <motion.div key={count} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="relative text-[16rem] font-black text-white drop-shadow-2xl" data-testid="pb-countdown">{count}</motion.div>
            ) : (
              <motion.div key="flash" initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} transition={{ duration: 0.4 }}
                className="absolute inset-0 bg-white" />
            )}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2" data-testid="pb-shot-dots">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`w-3 h-3 rounded-full ${i < shots.length ? "bg-fuchsia-400" : "bg-white/30"}`} />
              ))}
            </div>
          </motion.div>
        )}

        {stage === "filter" && (
          <motion.div key="filter" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-8 p-8">
            <h2 className="text-3xl font-bold">Filtre Seç</h2>
            <div className="grid grid-cols-5 gap-4 max-w-4xl">
              {FILTERS.map((f) => (
                <button key={f.key} data-testid={`pb-filter-${f.key}`} onClick={() => setFilter(f)}
                  className={`rounded-2xl overflow-hidden border-2 transition ${filter.key === f.key ? "border-fuchsia-400 scale-105" : "border-white/15"}`}>
                  {composePreviewShots[0]
                    ? <img src={composePreviewShots[0]} alt={f.label} className="w-full h-28 object-cover" style={{ filter: f.css }} />
                    : <div className="w-full h-28 bg-white/10" />}
                  <div className="py-2 text-sm bg-black/40">{f.label}</div>
                </button>
              ))}
            </div>
            <button data-testid="pb-filter-next" onClick={() => setStage("frame")}
              className="px-10 py-4 rounded-full bg-fuchsia-500 hover:bg-fuchsia-400 text-white text-lg font-bold">Devam Et →</button>
          </motion.div>
        )}

        {stage === "frame" && (
          <motion.div key="frame" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-8">
            <h2 className="text-3xl font-bold">Çerçeve Seç</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-4 max-w-5xl">
              {templates.map((t) => (
                <button key={t.id} data-testid={`pb-frame-${t.id}`}
                  onClick={() => { setTpl(t); setStage("package"); }}
                  className={`rounded-2xl p-4 border-2 transition hover:scale-105 ${tpl?.id === t.id ? "border-fuchsia-400" : "border-white/15"}`}
                  style={{ background: "rgba(255,255,255,0.05)" }}>
                  <div className="mx-auto mb-2 rounded-lg" style={{ width: 54, height: 70, background: t.accent }} />
                  <div className="text-xs font-medium">{t.name}</div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {stage === "package" && (
          <motion.div key="pkg" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-8">
            <h2 className="text-3xl font-bold">Paket Seç</h2>
            <div className="grid sm:grid-cols-3 gap-5 max-w-3xl w-full">
              {packages.map((p) => (
                <button key={p.id} data-testid={`pb-pkg-${p.id}`} onClick={() => finish(p)}
                  className="rounded-3xl p-7 border-2 border-white/15 hover:border-fuchsia-400 hover:scale-105 transition text-center"
                  style={{ background: "rgba(255,255,255,0.05)" }}>
                  <div className="text-lg font-semibold mb-2">{p.name}</div>
                  <div className="text-4xl font-black text-fuchsia-300">{p.price}₺</div>
                  <div className="mt-3 text-sm text-white/60">
                    {p.prints > 0 ? `${p.prints} Baskı` : "Baskı yok"} · {p.includes_qr ? "QR dahil" : "QR yok"}
                  </div>
                </button>
              ))}
            </div>
            <p className="text-white/40 text-sm">Taslak: ödeme adımı şimdilik atlandı (PayTR POS entegrasyonu sonra).</p>
          </motion.div>
        )}

        {stage === "processing" && (
          <motion.div key="proc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-6">
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}>
              <Aperture size={72} className="text-fuchsia-300" />
            </motion.div>
            <p className="text-xl text-white/70">Fotoğrafın hazırlanıyor…</p>
          </motion.div>
        )}

        {stage === "done" && result && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-8" data-testid="pb-done">
            <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center"><Check size={36} /></div>
            <h2 className="text-3xl font-bold">Hazır! 🎉</h2>
            <div className="flex flex-col sm:flex-row items-center gap-8">
              <img src={`${API_BASE}/photobooth/photo/${result.token}`} alt="sonuç"
                className="max-h-[46vh] rounded-xl shadow-2xl bg-white" data-testid="pb-result-img" />
              <div className="bg-white p-5 rounded-2xl text-center">
                <QRCodeCanvas value={result.url} size={190} data-testid="pb-qr" />
                <p className="mt-3 text-neutral-800 text-sm font-medium flex items-center gap-1 justify-center"><QrCode size={15} /> Telefonla okut & indir</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button data-testid="pb-print-btn" onClick={() => toast.info("Yazıcı entegrasyonu taslak aşamasında (sonra)")}
                className="px-8 py-4 rounded-full bg-white/10 hover:bg-white/20 text-lg font-semibold flex items-center gap-2"><Printer size={18} /> Yazdır</button>
              <button data-testid="pb-again-btn" onClick={reset}
                className="px-8 py-4 rounded-full bg-fuchsia-500 hover:bg-fuchsia-400 text-lg font-bold flex items-center gap-2"><RotateCcw size={18} /> Yeni Çekim</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin çıkış PIN modalı */}
      {pinOpen && (
        <div className="absolute inset-0 z-[10000] bg-black/70 flex items-center justify-center" data-testid="pb-pin-modal">
          <div className="bg-neutral-900 border border-white/15 rounded-2xl p-6 w-80">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2"><Lock size={16} /> Yönetici Çıkışı</h3>
              <button onClick={() => { setPinOpen(false); setPin(""); }} className="text-white/50"><X size={18} /></button>
            </div>
            <input data-testid="pb-pin-input" type="password" inputMode="numeric" value={pin} autoFocus
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && tryExit()}
              placeholder="PIN" className="w-full h-12 text-center text-2xl tracking-widest rounded-xl bg-white/5 border border-white/15 outline-none" />
            <button data-testid="pb-pin-submit" onClick={tryExit}
              className="mt-4 w-full h-11 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 font-semibold">Çık</button>
          </div>
        </div>
      )}
    </div>
  );
}
