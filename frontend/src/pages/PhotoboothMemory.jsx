import React from "react";
import { useParams } from "react-router-dom";
import { Download, Aperture } from "lucide-react";
import { API_BASE } from "@/lib/api";

export default function PhotoboothMemory() {
  const { token } = useParams();
  const url = `${API_BASE}/photobooth/photo/${token}`;

  const download = () => {
    const a = document.createElement("a");
    a.href = url; a.download = `fotuber-${token}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  return (
    <div data-testid="pb-memory" className="min-h-screen text-white flex flex-col items-center justify-center p-5 gap-6"
      style={{ background: "radial-gradient(900px 500px at 50% -10%, #1a1030 0%, #0a0713 60%, #05040a 100%)" }}>
      <div className="flex items-center gap-2 text-white/70">
        <Aperture size={22} className="text-fuchsia-300" />
        <span className="text-lg font-semibold">Fotuber Photobooth</span>
      </div>
      <img src={url} alt="anı" data-testid="pb-memory-img"
        className="max-h-[70vh] max-w-full rounded-xl shadow-2xl bg-white"
        onError={(e) => { e.currentTarget.style.display = "none"; }} />
      <button data-testid="pb-memory-download" onClick={download}
        className="px-10 py-4 rounded-full bg-fuchsia-500 hover:bg-fuchsia-400 text-lg font-bold flex items-center gap-2">
        <Download size={18} /> Fotoğrafı İndir
      </button>
      <p className="text-white/40 text-sm text-center max-w-sm">Bu anıyı telefonuna kaydedebilir, sosyal medyada paylaşabilirsin.</p>
    </div>
  );
}
