import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE } from "@/lib/api";
import { Monitor, Apple, Download } from "lucide-react";

// Windows ayarlı değilse kullanılacak varsayılan indirme (butonlar kaybolmasın).
const DEFAULT_WIN_URL = "https://github.com/fotubeer/Fotuber/releases/download/desktop-latest/fotuber-studio-1.0.0-x64.exe";

// Studio-facing desktop app download buttons.
// Windows aktif; macOS şimdilik "Yakında". Admin URL'leri /admin/masaustu'nden ayarlar.
export default function DesktopDownloadButtons({ className = "", compact = false }) {
  const [d, setD] = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE}/desktop-downloads`).then((r) => setD(r.data)).catch(() => setD(null));
  }, []);

  // Windows indirmesi ayarlanmamışsa varsayılan GitHub release'ini kullan (butonlar asla kaybolmasın).
  const winUrl = (d && d.windows_url) || DEFAULT_WIN_URL;
  const version = (d && d.version) || "1.0.0";

  if (compact) {
    return (
      <div data-testid="desktop-download" className={`rounded-xl border border-white/12 bg-white/[0.04] p-3 ${className}`}>
        <div className="flex items-center justify-center gap-1.5 mb-2 text-xs text-white/50">
          <Download size={13} className="text-amber-300" /> Masaüstü uygulaması · v{version}
        </div>
        <div className="flex gap-2">
          <a data-testid="desktop-download-windows" href={winUrl} target="_blank" rel="noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-medium px-3 py-2 transition-colors">
            <Monitor size={14} /> Windows
          </a>
          <span data-testid="desktop-download-mac-soon"
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/5 border border-white/10 text-white/40 text-xs font-medium px-3 py-2 cursor-not-allowed">
            <Apple size={14} /> macOS · Yakında
          </span>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="desktop-download" className={`rounded-2xl border border-white/12 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5 ${className}`}>
      <div className="flex items-center gap-2 mb-1">
        <Download size={16} className="text-amber-300" />
        <h3 className="font-semibold">Masaüstü Uygulaması</h3>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/50">v{version}</span>
      </div>
      <p className="text-xs text-white/50 mb-4">Stüdyo Panelini bilgisayarınızda uygulama olarak kullanın. Oturumunuz açık kalır.</p>
      <div className="flex flex-wrap items-center gap-3">
        <a data-testid="desktop-download-windows" href={winUrl} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-white text-neutral-900 font-semibold px-4 py-2.5 text-sm hover:bg-white/90 transition-colors">
          <Monitor size={16} /> Windows için indir
        </a>
        <span data-testid="desktop-download-mac-soon"
          className="inline-flex items-center gap-2 rounded-xl bg-white/5 text-white/45 font-semibold px-4 py-2.5 text-sm border border-white/10 cursor-not-allowed">
          <Apple size={16} /> macOS · Yakında
        </span>
      </div>
    </div>
  );
}
