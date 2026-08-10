import React, { useState } from "react";
import { Camera, Layers } from "lucide-react";
import AdminPassportPhoto from "@/pages/admin/AdminPassportPhoto";
import VesikalikTriple from "@/pages/VesikalikTriple";

export default function VesikalikWorkspace() {
  const [mode, setMode] = useState("single");
  const [injected, setInjected] = useState(null); // {src, specCode, key}

  const handleFineTune = (src, specCode) => {
    setInjected({ src, specCode, key: Date.now() });
    setMode("single");
  };

  return (
    <div className="relative">
      <div
        data-testid="vesikalik-mode-switch"
        className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-1 rounded-full bg-white/90 backdrop-blur border border-slate-200 shadow-lg p-1 text-xs"
      >
        <button
          data-testid="vesikalik-mode-single"
          onClick={() => setMode("single")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
            mode === "single" ? "bg-slate-900 text-white font-semibold" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Camera className="w-3.5 h-3.5" /> Tekli
        </button>
        <button
          data-testid="vesikalik-mode-triple"
          onClick={() => setMode("triple")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
            mode === "triple" ? "bg-amber-500 text-slate-900 font-semibold" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> 3'lü İşleme
        </button>
      </div>
      {mode === "single"
        ? <AdminPassportPhoto injected={injected} />
        : <VesikalikTriple onFineTune={handleFineTune} />}
    </div>
  );
}
