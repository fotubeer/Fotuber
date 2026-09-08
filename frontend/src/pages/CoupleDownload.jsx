import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, formatApiError, API_BASE } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Camera, Download, Clock, HardDrive, Heart, Film, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { SEO } from "@/components/SEO";

const formatBytes = (n) => {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0; let x = n;
  while (x > 1024 && i < u.length - 1) { x /= 1024; i++; }
  return `${x.toFixed(1)} ${u[i]}`;
};

const CoupleDownload = () => {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/download/${token}`);
        setData(data);
      } catch (e) { setError(formatApiError(e)); }
    })();
  }, [token]);

  const downloadZip = async () => {
    setDownloading(true);
    try {
      toast.info("Tüm dosyalar hazırlanıyor... (Boyuta göre 1-5 dk sürebilir)");
      const res = await fetch(`${API_BASE}/download/${token}/zip`);
      if (!res.ok) throw new Error("İndirme başarısız");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disp = res.headers.get("content-disposition") || "";
      const m = /filename\*=UTF-8''([^;]+)/.exec(disp) || /filename="([^"]+)"/.exec(disp);
      a.download = m ? decodeURIComponent(m[1]) : "anilar.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(String(e)); }
    finally { setDownloading(false); }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-200 flex items-center justify-center px-6">
        <SEO title="İndirme" noIndex path={`/paylas/${token}`} />
        <div className="max-w-md text-center">
          <Clock className="w-12 h-12 mx-auto mb-4 text-neutral-500" />
          <h1 className="hero-title text-3xl mb-3">Bağlantı geçersiz</h1>
          <p className="text-sm text-neutral-400">{error}</p>
          <Link to="/" className="mt-6 inline-block text-[#d4af37] underline">Anasayfa</Link>
        </div>
      </div>
    );
  }

  if (!data) return <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-500">Yükleniyor…</div>;

  const daysLeft = data.expires_at
    ? Math.max(0, Math.ceil((new Date(data.expires_at) - new Date()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <SEO title={`Anılarınız — ${data.event.couple_names || data.event.name}`} noIndex path={`/paylas/${token}`} />

      <header className="border-b border-neutral-900">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-[#d4af37]" />
            <span className="font-serif text-lg" style={{ fontFamily: "var(--fotuber-font-heading)" }}>Fotuber</span>
          </Link>
          <Badge className="bg-[#d4af37] text-black">Özel Bağlantı — Sadece Sizin İçin</Badge>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 border border-[#d4af37]/40 bg-[#d4af37]/10 text-[#d4af37] text-xs tracking-[0.3em] uppercase mb-4">
            <Heart className="w-3 h-3" /> Misafir Anıları
          </div>
          <h1 className="hero-title text-5xl md:text-6xl mb-3" style={{ fontFamily: "var(--fotuber-font-heading)" }}>
            {data.event.couple_names || data.event.name}
          </h1>
          {data.event.event_date && (
            <div className="text-neutral-400 text-sm tracking-widest uppercase mb-2">
              {new Date(data.event.event_date).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
            </div>
          )}
          <p className="text-neutral-400 mt-4 max-w-2xl mx-auto">
            Etkinliğinize katılan misafirlerin sizinle paylaştığı tüm anlar burada. Aşağıdaki butonla tümünü tek ZIP olarak indirebilirsiniz.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <Card className="bg-neutral-900 border-neutral-800">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-semibold" data-testid="download-total-files">{data.total_files}</div>
              <div className="text-xs text-neutral-500 mt-1">Dosya</div>
            </CardContent>
          </Card>
          <Card className="bg-neutral-900 border-neutral-800">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-semibold" data-testid="download-total-size">{formatBytes(data.total_size)}</div>
              <div className="text-xs text-neutral-500 mt-1">Toplam Boyut</div>
            </CardContent>
          </Card>
          <Card className="bg-neutral-900 border-neutral-800">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-semibold text-[#d4af37]" data-testid="download-days-left">{daysLeft ?? "—"}</div>
              <div className="text-xs text-neutral-500 mt-1">Gün Kaldı</div>
            </CardContent>
          </Card>
        </div>

        {daysLeft !== null && daysLeft <= 2 && (
          <div className="mb-6 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs text-center">
            ⏰ Bu bağlantının süresi <b>{daysLeft} gün</b> içinde dolacak. Lütfen ZIP'i indirin ve saklayın.
          </div>
        )}

        {/* Download button */}
        <div className="text-center mb-10">
          {data.total_files === 0 ? (
            <div className="p-8 rounded-2xl border border-neutral-800 bg-neutral-900 text-neutral-400 text-sm">
              Henüz misafir yüklemesi yok.
            </div>
          ) : (
            <Button
              onClick={downloadZip}
              disabled={downloading}
              className="rounded-full bg-[#d4af37] hover:bg-[#b5952f] text-black px-10 py-6 text-lg font-medium"
              data-testid="download-zip-btn"
            >
              <Download className="w-5 h-5 mr-3" />
              {downloading ? "Hazırlanıyor..." : `Tüm Dosyaları ZIP Olarak İndir`}
            </Button>
          )}
        </div>

        {/* File list */}
        {data.files.length > 0 && (
          <Card className="bg-neutral-900 border-neutral-800">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-neutral-800 hover:bg-transparent">
                    <TableHead className="text-neutral-400">Yükleyen</TableHead>
                    <TableHead className="text-neutral-400">Dosya</TableHead>
                    <TableHead className="text-neutral-400">Tür</TableHead>
                    <TableHead className="text-neutral-400 text-right">Boyut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.files.map((f) => {
                    const isImage = (f.mime_type || "").startsWith("image");
                    const isVideo = (f.mime_type || "").startsWith("video");
                    return (
                      <TableRow key={f.id} className="border-neutral-800 hover:bg-neutral-800/40" data-testid={`file-row-${f.id}`}>
                        <TableCell className="text-sm">{f.user_name}</TableCell>
                        <TableCell className="text-xs text-neutral-400 max-w-xs truncate">{f.filename}</TableCell>
                        <TableCell>
                          {isImage && <Badge variant="outline" className="border-neutral-700 text-neutral-300"><ImageIcon className="w-3 h-3 mr-1" /> Foto</Badge>}
                          {isVideo && <Badge variant="outline" className="border-neutral-700 text-neutral-300"><Film className="w-3 h-3 mr-1" /> Video</Badge>}
                          {!isImage && !isVideo && <Badge variant="outline" className="border-neutral-700 text-neutral-300">Diğer</Badge>}
                        </TableCell>
                        <TableCell className="text-right text-sm">{formatBytes(f.size)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CoupleDownload;
