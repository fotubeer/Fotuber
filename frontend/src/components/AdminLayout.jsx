import React, { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, CalendarDays, CalendarClock, Users, Wallet,
  ImageIcon, Camera, LogOut, Menu, X, Package, Settings, Coins, Ticket, Film, KeyRound, ArrowLeftRight,
  Images, QrCode, Frame, MapPin, Instagram,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/api";
import { NotificationBell } from "@/components/NotificationBell";

const items = [
  { to: "/admin/dashboard", label: "Genel Bakış", icon: LayoutDashboard },
  { to: "/admin/randevular", label: "Randevular", icon: CalendarDays },
  { to: "/admin/takvim", label: "Takvim & Kapatma", icon: CalendarClock },
  { to: "/admin/albumler", label: "Fotoğraf Seçim Albümleri", icon: Images },
  { to: "/admin/mekanlar", label: "Mekanlar (Sabit QR)", icon: MapPin },
  { to: "/admin/etkinlikler", label: "Etkinlikler & Yükleme Linkleri", icon: QrCode },
  { to: "/admin/urun-secenekleri", label: "Tablo & Albüm Modelleri", icon: Frame },
  { to: "/admin/finans", label: "Finans", icon: Wallet },
  { to: "/admin/nakit-akisi", label: "Nakit Akışı", icon: Coins, ownerOnly: true },
  { to: "/admin/kasa-devir", label: "Kasa Devir Defteri", icon: ArrowLeftRight, ownerOnly: true },
  { to: "/admin/hizmetler", label: "Hizmetler", icon: Package },
  { to: "/admin/galeri", label: "Galeri", icon: ImageIcon },
  { to: "/admin/fotuber-medya", label: "Fotuber Medya", icon: Film },
  { to: "/admin/indirim-kodlari", label: "İndirim Kodları", icon: Ticket },
  { to: "/admin/personel", label: "Personel Listesi", icon: Users },
  { to: "/admin/kullanicilar", label: "Personel Hesapları", icon: KeyRound, ownerOnly: true },
  { to: "/admin/ayarlar", label: "Site Ayarları", icon: Settings, ownerOnly: true },
  { to: "/admin/animasyon-ayarlari", label: "Açılış Animasyonu", icon: Film, ownerOnly: true },
  { to: "/admin/instagram-slayt", label: "Instagram Slayt", icon: Instagram, ownerOnly: true },
];

export const AdminLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const logoUrl = settings?.logo_id ? `${API_BASE}/settings/logo/${settings.logo_id}` : null;

  React.useEffect(() => { document.body.classList.add("admin"); return () => document.body.classList.remove("admin"); }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-admin flex">
      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 transform transition-transform ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        <div className="h-16 border-b border-slate-200 flex items-center px-6">
          <Link to="/admin/dashboard" className="flex items-center gap-2" data-testid="admin-logo-home">
            {logoUrl ? (
              <img src={logoUrl} alt={settings?.business_name || "Logo"} className="w-9 h-9 rounded-full object-cover" />
            ) : (
              <span className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center">
                <Camera className="w-4 h-4 text-[#d4af37]" strokeWidth={2} />
              </span>
            )}
            <div className="leading-none">
              <div className="text-lg font-semibold tracking-tight lowercase">{settings?.business_name || "fotuber"}</div>
              <div className="text-[10px] tracking-[0.2em] uppercase text-slate-500">Yönetim Paneli</div>
            </div>
          </Link>
        </div>
        <nav className="p-3 flex flex-col gap-1">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              data-testid={`admin-nav-${it.to.split("/").pop()}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`
              }
              onClick={() => setOpen(false)}
            >
              <it.icon className="w-4 h-4" />
              {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-0 w-full p-4 border-t border-slate-200">
          <div className="mb-3">
            <div className="text-sm font-semibold" data-testid="admin-user-name">{user?.name}</div>
            <div className="text-xs text-slate-500">{user?.email}</div>
          </div>
          <Button
            data-testid="admin-logout-btn"
            onClick={async () => { await logout(); navigate("/personel-girisi"); }}
            variant="outline"
            className="w-full"
          >
            <LogOut className="w-4 h-4 mr-2" /> Çıkış Yap
          </Button>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6">
          <button className="lg:hidden" onClick={() => setOpen((o) => !o)}>
            {open ? <X /> : <Menu />}
          </button>
          <div className="text-sm text-slate-500 hidden lg:block">
            Fotuber Yönetim Paneli · <span className="text-slate-900">{user?.role === "admin" ? "Yönetici" : "Personel"}</span>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <Link to="/" target="_blank" className="text-xs text-slate-500 hover:text-slate-900 hidden md:inline">Siteyi Görüntüle ↗</Link>
          </div>
        </header>
        <main className="flex-1 p-6 lg:p-8 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
};

export default AdminLayout;
