import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE } from "@/lib/api";
import { Monitor, Apple, Download, Copy, Check, ChevronDown, Info } from "lucide-react";

const MAC_XATTR = 'xattr -cr "/Applications/Fotuber Stüdyo.app"';

function MacHelp() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(MAC_XATTR); setCopied(true); setTimeout(() => setCopied(false), 1800); };
  return (
    <div className="mt-3" data-testid="mac-help">
      <button onClick={() => setOpen((o) => !o)} data-testid="mac-help-toggle"
        className="inline-flex items-center gap-1.5 text-[11px] text-white/55 hover:text-white/80 transition-colors">
        <Info size={13} className="text-amber-300" /> macOS ilk açılışta uyarı verirse ne yapmalı?
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-white/12 bg-black/25 p-3 text-[11px] text-white/60 leading-relaxed space-y-2">
          <p><b className="text-white/80">1.</b> İndirdiğiniz uygulamayı <b>Uygulamalar (Applications)</b> klasörüne sürükleyin.</p>
          <p><b className="text-white/80">2.</b> Uygulamaya <b>sağ tıklayın → Aç</b>, çıkan pencerede tekrar <b>Aç</b> deyin.</p>
          <p><b className="text-white/80">3.</b> Hâlâ "hasarlı" veya "geliştirici doğrulanamadı" derse, <b>Terminal</b>'i açıp aşağıdaki komutu yapıştırıp Enter'a basın, sonra tekrar açın:</p>
          <div className="flex items-center gap-2 rounded-lg bg-black/40 border border-white/10 px-2.5 py-2 font-mono text-[10.5px] text-amber-200">
            <code className="flex-1 break-all">{MAC_XATTR}</code>
            <button onClick={copy} data-testid="mac-xattr-copy" className="shrink-0 text-white/60 hover:text-white transition-colors">
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          </div>
          <p className="text-white/40">Bu uyarı, uygulamanın Apple Developer hesabıyla imzalanmamasından kaynaklanır; güvenlidir.</p>
        </div>
      )}
    </div>
  );
}

// Studio-facing desktop app download buttons (Windows .exe + macOS .dmg).
// Admin configures the URLs at /admin/masaustu. Hidden if no URLs are set.
export default function DesktopDownloadButtons({ className = "", compact = false }) {
  const [d, setD] = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE}/desktop-downloads`).then((r) => setD(r.data)).catch(() => setD(null));
  }, []);

  if (!d || (!d.windows_url && !d.mac_url)) return null;

  if (compact) {
    return (
      <div data-testid="desktop-download" className={`rounded-xl border border-white/12 bg-white/[0.04] p-3 ${className}`}>
        <div className="flex items-center justify-center gap-1.5 mb-2 text-xs text-white/50">
          <Download size={13} className="text-amber-300" /> Masaüstü uygulaması{d.version ? ` · v${d.version}` : ""}
        </div>
        <div className="flex gap-2">
          {d.windows_url && (
            <a data-testid="desktop-download-windows" href={d.windows_url} target="_blank" rel="noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-medium px-3 py-2 transition-colors">
              <Monitor size={14} /> Windows
            </a>
          )}
          {d.mac_url && (
            <a data-testid="desktop-download-mac" href={d.mac_url} target="_blank" rel="noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-medium px-3 py-2 transition-colors">
              <Apple size={14} /> macOS
            </a>
          )}
        </div>
        {d.mac_url && <MacHelp />}
      </div>
    );
  }

  return (
    <div data-testid="desktop-download" className={`rounded-2xl border border-white/12 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5 ${className}`}>
      <div className="flex items-center gap-2 mb-1">
        <Download size={16} className="text-amber-300" />
        <h3 className="font-semibold">Masaüstü Uygulaması</h3>
        {d.version && <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/50">v{d.version}</span>}
      </div>
      <p className="text-xs text-white/50 mb-4">Stüdyo Panelini bilgisayarınızda uygulama olarak kullanın. Oturumunuz açık kalır.</p>
      <div className="flex flex-wrap gap-3">
        {d.windows_url && (
          <a data-testid="desktop-download-windows" href={d.windows_url} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-white text-neutral-900 font-semibold px-4 py-2.5 text-sm hover:bg-white/90 transition-colors">
            <Monitor size={16} /> Windows için indir
          </a>
        )}
        {d.mac_url && (
          <a data-testid="desktop-download-mac" href={d.mac_url} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-white/10 text-white font-semibold px-4 py-2.5 text-sm hover:bg-white/15 border border-white/15 transition-colors">
            <Apple size={16} /> macOS için indir
          </a>
        )}
      </div>
      {d.mac_url && <MacHelp />}
    </div>
  );
}
