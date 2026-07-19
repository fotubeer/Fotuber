import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, formatApiError, API_BASE } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { UploadCloud, Camera, Shield, Clock, Check, X, LogIn, HardDrive } from "lucide-react";
import { toast } from "sonner";
import { SEO } from "@/components/SEO";

const formatBytes = (n) => {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0; let x = n;
  while (x > 1024 && i < u.length - 1) { x /= 1024; i++; }
  return `${x.toFixed(1)} ${u[i]}`;
};

const GuestUpload = () => {
  const { token } = useParams();
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [event, setEvent] = useState(null);
  const [usage, setUsage] = useState(null);
  const [kvkk, setKvkk] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [queue, setQueue] = useState([]); // {file, status: 'pending'|'uploading'|'done'|'error', error?}
  const inputRef = useRef();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/guest-events/${token}`);
        setEvent(data);
      } catch (e) { toast.error(formatApiError(e)); }
    })();
  }, [token]);

  useEffect(() => {
    if (!user || !event) return;
    api.get(`/guest-events/${token}/my-usage`).then((r) => setUsage(r.data)).catch(() => {});
  }, [user, event, token]);

  const goLogin = () => nav(`/kayit`, { state: { from: `/etkinlik/${token}` } });

  const onSelectFiles = (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const newQ = Array.from(fileList).map((f) => ({ file: f, status: "pending" }));
    setQueue((q) => [...q, ...newQ]);
  };

  const uploadNext = async () => {
    if (!kvkk) { toast.error("Önce KVKK onayını işaretleyin"); return; }
    if (!user) { toast.error("Yükleme için giriş yapmalısınız"); return; }
    const pending = queue.filter((q) => q.status === "pending");
    if (pending.length === 0) return;
    setUploading(true);
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status !== "pending") continue;
      setQueue((q) => q.map((it, idx) => idx === i ? { ...it, status: "uploading" } : it));
      try {
        const fd = new FormData();
        fd.append("file", queue[i].file);
        fd.append("kvkk_accepted", "true");
        const res = await api.post(`/guest-events/${token}/upload`, fd, {
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
    toast.success("Yükleme tamamlandı!");
  };

  if (authLoading || !event) {
    return <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-500">Yükleniyor…</div>;
  }

  if (event.expired) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-200 flex items-center justify-center px-6">
        <SEO title="Yükleme Kapalı" noIndex path={`/etkinlik/${token}`} />
        <div className="max-w-md text-center">
          <Clock className="w-12 h-12 mx-auto mb-4 text-neutral-500" />
          <h1 className="hero-title text-3xl mb-3">Yükleme süresi doldu</h1>
          <p className="text-sm text-neutral-400">Bu etkinlik için yükleme süresi sona ermiştir. Detay için organizatörle iletişime geçin.</p>
          <Link to="/" className="mt-6 inline-block text-[#d4af37] underline">Anasayfa</Link>
        </div>
      </div>
    );
  }

  const progress = usage ? Math.round((usage.used_bytes / usage.limit_bytes) * 100) : 0;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <SEO title={`Fotoğraflarınızı Yükleyin — ${event.name}`} noIndex path={`/etkinlik/${token}`} />

      <header className="border-b border-neutral-900">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-[#d4af37]" />
            <span className="font-serif text-lg">Fotuber</span>
          </Link>
          <Badge className="bg-[#d4af37] text-black">Misafir Yükleme</Badge>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="text-xs tracking-[0.3em] uppercase text-[#d4af37] mb-3">Anlarınızı çift ile paylaşın</div>
        <h1 className="hero-title text-4xl md:text-5xl mb-4">{event.name}</h1>
        {event.couple_names && <p className="text-neutral-300 mb-1">{event.couple_names}</p>}
        {event.event_date && <p className="text-neutral-500 mb-4">{event.event_date}</p>}
        {event.welcome_message && (
          <p className="mb-6 text-neutral-300 italic border-l-2 border-[#d4af37] pl-4">"{event.welcome_message}"</p>
        )}

        {/* Rules */}
        <Card className="bg-neutral-900 border-neutral-800 text-neutral-200 mb-6">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-start gap-3">
              <HardDrive className="w-4 h-4 text-[#d4af37] mt-0.5" />
              <div className="text-sm">
                <div className="font-semibold">Kişi başı yükleme limiti: {event.max_size_per_user_mb} MB</div>
                <div className="text-xs text-neutral-500">Foto ve videolarınızı bu limite kadar yükleyebilirsiniz.</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-[#d4af37] mt-0.5" />
              <div className="text-sm">
                <div className="font-semibold">Yüklemeler {event.retention_days} gün sonra otomatik silinir</div>
                <div className="text-xs text-neutral-500">Silinme tarihi: {new Date(event.delete_at).toLocaleDateString("tr-TR")}. Bu süre sonrası dosyalar sunucudan tamamen silinir.</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="w-4 h-4 text-[#d4af37] mt-0.5" />
              <div className="text-sm">
                <div className="font-semibold">KVKK: Verileriniz güvende</div>
                <div className="text-xs text-neutral-500">Yüklediğiniz medya yalnızca etkinliğin çifti ile paylaşılır. 3. taraflarla paylaşılmaz.</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {!user ? (
          <Card className="bg-neutral-900 border-neutral-800">
            <CardContent className="pt-6 text-center space-y-4">
              <p className="text-neutral-300">Yükleme yapabilmek için önce bir hesap oluşturmanız gerekiyor.</p>
              <div className="flex justify-center gap-2">
                <Button onClick={goLogin} className="bg-[#d4af37] hover:bg-[#b5952f] text-black rounded-full" data-testid="guest-signup-btn">
                  <LogIn className="w-4 h-4 mr-2" /> Kayıt Ol / Giriş Yap
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Usage indicator */}
            {usage && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-neutral-400 mb-1">
                  <span>Kullanım</span>
                  <span>{formatBytes(usage.used_bytes)} / {formatBytes(usage.limit_bytes)} ({usage.used_files} dosya)</span>
                </div>
                <div className="h-2 bg-neutral-800 rounded overflow-hidden">
                  <div className="h-full bg-[#d4af37]" style={{ width: `${Math.min(100, progress)}%` }} />
                </div>
              </div>
            )}

            {/* KVKK */}
            <label className="flex items-start gap-3 cursor-pointer mb-4 p-4 rounded-lg border border-neutral-800 bg-neutral-950">
              <Checkbox
                checked={kvkk}
                onCheckedChange={(v) => setKvkk(!!v)}
                data-testid="kvkk-checkbox"
                className="mt-0.5 border-neutral-600 data-[state=checked]:bg-[#d4af37] data-[state=checked]:text-black data-[state=checked]:border-[#d4af37]"
              />
              <span className="text-xs text-neutral-300 leading-relaxed">
                <span className="text-[#d4af37]">*</span> Yüklediğim fotoğraf/videoların çift ile paylaşılmasını, {event.retention_days} gün sonra otomatik silinmesini kabul ediyorum. Kişisel verilerimin bu amaçla işlenmesine <b>KVKK</b> kapsamında onay veriyorum.
              </span>
            </label>

            {/* Upload area */}
            <div
              className="border-2 border-dashed border-neutral-700 rounded-2xl p-8 text-center hover:border-[#d4af37]/60 transition-colors cursor-pointer"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); onSelectFiles(e.dataTransfer.files); }}
              data-testid="upload-dropzone"
            >
              <UploadCloud className="w-10 h-10 mx-auto mb-3 text-[#d4af37]" />
              <div className="font-serif text-xl mb-1">Fotoğraf & Video Yükle</div>
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

            {/* Queue */}
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
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default GuestUpload;
