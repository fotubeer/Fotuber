import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, Coins, Camera } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/api";

export const StaffLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const logoUrl = settings?.logo_id ? `${API_BASE}/settings/logo/${settings.logo_id}` : null;

  React.useEffect(() => {
    document.body.classList.add("admin");
    return () => document.body.classList.remove("admin");
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-admin">
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 sticky top-0 z-30">
        <Link to="/personel/gunluk" className="flex items-center gap-2" data-testid="staff-logo-home">
          {logoUrl ? (
            <img src={logoUrl} alt={settings?.business_name || "Fotuber"} className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <span className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center">
              <Camera className="w-4 h-4 text-[#d4af37]" strokeWidth={2} />
            </span>
          )}
          <div className="leading-none">
            <div className="text-base font-semibold tracking-tight lowercase">{settings?.business_name || "fotuber"}</div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-slate-500">Personel Paneli</div>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <div className="hidden md:block text-right leading-tight">
            <div className="text-sm font-semibold" data-testid="staff-user-name">{user?.name}</div>
            <div className="text-xs text-slate-500">Personel</div>
          </div>
          <Button
            data-testid="staff-logout-btn"
            onClick={async () => { await logout(); navigate("/personel-girisi"); }}
            variant="outline"
            size="sm"
          >
            <LogOut className="w-4 h-4 mr-1.5" /> Çıkış
          </Button>
        </div>
      </header>
      <main className="max-w-4xl mx-auto p-4 md:p-8">
        <div className="mb-6 flex items-center gap-2 text-xs text-slate-500">
          <Coins className="w-3.5 h-3.5" /> Günlük Nakit Girişi & Kasa Devri
        </div>
        {children}
      </main>
    </div>
  );
};

export default StaffLayout;
