import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Copy, ScanFace, LogOut } from "lucide-react";
import { studioApi, clearStudioToken } from "@/lib/studioApi";
import VesikalikWorkspace from "@/pages/VesikalikWorkspace";

// Studio-scoped Vesikalık workspace. Reuses the existing biometric editor
// (face detect, bg removal, print layout, Hızlı Baskı) but authenticates via the
// studio session cookie — no separate main-site membership needed.
export default function StudioVesikalik() {
  const navigate = useNavigate();
  const [acc, setAcc] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    studioApi.get("/studio/me")
      .then((r) => {
        const a = r.data?.account;
        if (!a?.modules?.vesikalik) {
          toast.error("Vesikalık modülü paketinizde bulunmuyor.");
          navigate("/studyo/panel");
          return;
        }
        setAcc(a);
      })
      .catch(() => navigate("/studyo"))
      .finally(() => setLoading(false));
  }, [navigate]);

  const logout = async () => {
    try { await studioApi.post("/studio/logout"); } catch {}
    clearStudioToken();
    navigate("/studyo");
  };

  const copyFtb = () => {
    navigator.clipboard?.writeText(acc.ftb_code).then(
      () => toast.success("Müşteri kodu kopyalandı"),
      () => {}
    );
  };

  if (loading) return <div className="min-h-screen grid place-items-center bg-neutral-950 text-white/60">Yükleniyor…</div>;
  if (!acc) return null;

  return (
    <div data-testid="studio-vesikalik" className="min-h-screen bg-slate-50">
      {/* Studio brand bar (panel-only; NOT printed on the photo output) */}
      <div className="sticky top-0 z-[50] flex items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-200 shadow-sm">
        <button data-testid="studio-vesikalik-back" onClick={() => navigate("/studyo/panel")}
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Panel
        </button>
        <div className="flex items-center gap-2 ml-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-300 to-amber-600 grid place-items-center">
            <ScanFace className="w-4 h-4 text-slate-900" />
          </div>
          <div className="leading-tight">
            <div className="text-[11px] text-slate-400">Stüdyo · Vesikalık</div>
            <div data-testid="studio-vesikalik-brand" className="text-sm font-semibold text-slate-800">{acc.brand_name || acc.firma_adi}</div>
          </div>
        </div>
        <button data-testid="studio-vesikalik-ftb" onClick={copyFtb}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-mono font-bold tracking-widest text-amber-700 hover:bg-amber-100">
          {acc.ftb_code} <Copy className="w-3 h-3 opacity-70" />
        </button>
        <button data-testid="studio-vesikalik-logout" onClick={logout}
          className="text-slate-400 hover:text-red-600" title="Çıkış">
          <LogOut className="w-4 h-4" />
        </button>
      </div>
      <VesikalikWorkspace />
    </div>
  );
}
