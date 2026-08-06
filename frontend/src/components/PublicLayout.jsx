import React, { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Menu, X, Camera, Phone, LogOut, User, Instagram, Youtube, Facebook, Music2, ShieldCheck, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/api";
import { instagramUrl, youtubeUrl, tiktokUrl, facebookUrl } from "@/lib/social";
import FloatingContact from "@/components/FloatingContact";

const navItems = [
  { to: "/", label: "Ana Sayfa" },
  { to: "/hizmetler", label: "Hizmetler" },
  { to: "/fotuber-medya", label: "Fotuber Medya" },
  { to: "/galeri", label: "Galeri" },
  { to: "/vesikalik", label: "Vesikalık", accent: true },
  { to: "/davetiye-olustur", label: "Davetiye", accent: true },
  { to: "/baskiya-hazir-davetiye", label: "Baskı Davetiye", accent: true },
  { to: "/indirim-kodu", label: "İndirim Kodu", accent: true },
  { to: "/hakkimizda", label: "Hakkımızda" },
  { to: "/iletisim", label: "İletişim" },
];

const formatPhone = (raw) => {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  // remove leading 90 for display
  const local = digits.startsWith("90") ? digits.slice(2) : digits.startsWith("0") ? digits.slice(1) : digits;
  if (local.length !== 10) return raw;
  return `0(${local.slice(0, 3)}) ${local.slice(3, 6)} ${local.slice(6, 8)} ${local.slice(8, 10)}`;
};

export const PublicLayout = ({ children }) => {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const logoUrl = settings?.logo_id ? `${API_BASE}/settings/logo/${settings.logo_id}` : null;
  const brand = (settings?.business_name || "fotuber").toLowerCase();
  const tagline = settings?.tagline || "Studio · fotuber.com.tr";

  return (
    <div className="theme-public bg-background text-foreground min-h-screen font-body flex flex-col">
      <header className="sticky top-0 z-50 w-full bg-[#050505]/85 backdrop-blur-2xl border-b border-white/5 transition-colors duration-300">
        <div className="max-w-[1920px] mx-auto flex items-center justify-between px-4 lg:px-6 xl:px-10 py-3 xl:py-4">
          <Link to="/" data-testid="logo-home" className="flex items-center gap-3 min-w-max">
            {logoUrl ? (
              <img src={logoUrl} alt={brand} className="w-10 h-10 xl:w-12 xl:h-12 rounded-full object-cover border border-[#d4af37]" />
            ) : (
              <span className="w-10 h-10 xl:w-12 xl:h-12 rounded-full border border-[#d4af37] flex items-center justify-center">
                <Camera className="w-4 h-4 xl:w-5 xl:h-5 text-[#d4af37]" strokeWidth={1.5} />
              </span>
            )}
            <div className="leading-none">
              <div className="font-serif text-2xl xl:text-3xl tracking-tight text-white">{brand}</div>
              <div className="text-[9px] xl:text-[10px] tracking-[0.3em] xl:tracking-[0.4em] text-[#d4af37] uppercase mt-1">{tagline}</div>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center justify-center flex-1 mx-2 lg:gap-2.5 xl:gap-5 2xl:gap-7">
            {navItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                data-testid={`nav-${n.to.replace('/', '') || 'home'}`}
                className={({ isActive }) =>
                  `relative whitespace-nowrap text-[11.5px] xl:text-[13px] 2xl:text-[14px] font-medium tracking-tight lg:tracking-normal transition-colors after:content-[''] after:absolute after:w-full after:scale-x-0 after:h-[1px] after:-bottom-1.5 after:left-0 after:bg-[#d4af37] after:origin-center hover:after:scale-x-100 after:transition-transform after:duration-300 after:ease-out ${
                    isActive
                      ? "text-[#d4af37] after:scale-x-100"
                      : (n.accent ? "text-[#d4af37] hover:text-[#e8ca58] drop-shadow-[0_0_8px_rgba(212,175,55,0.3)]" : "text-neutral-300 hover:text-white")
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-2 xl:gap-3 w-auto min-w-max">
            <Link to="/randevu">
              <Button data-testid="cta-book-appointment" className="rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-5 xl:px-6 shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] transition-shadow duration-300">
                Randevu Al
              </Button>
            </Link>
            {user && user.role === "admin" && (
              <Link to="/admin/dashboard">
                <Button
                  data-testid="navbar-admin-panel-btn"
                  className="rounded-full bg-slate-900 hover:bg-slate-800 text-white gap-2"
                >
                  <LayoutDashboard className="w-4 h-4" /> Yönetim Paneli
                </Button>
              </Link>
            )}
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-neutral-400" data-testid="navbar-user-name">
                  <User className="w-3.5 h-3.5 inline mr-1" strokeWidth={1.5} />
                  {user.name}
                </span>
                <Button
                  data-testid="navbar-logout-btn"
                  variant="ghost"
                  onClick={async () => { await logout(); navigate("/"); }}
                  className="text-neutral-400 hover:text-white h-9 px-3"
                  title="Çıkış Yap"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Link to="/personel-girisi">
                <Button data-testid="staff-login-nav-btn" variant="outline" className="rounded-full border-neutral-700 bg-transparent text-neutral-300 hover:bg-neutral-800 hover:text-white gap-2">
                  <ShieldCheck className="w-4 h-4" /> Personel Girişi
                </Button>
              </Link>
            )}
          </div>

          {/* Persistent mobile access to admin/staff area (right next to hamburger) */}
          <div className="lg:hidden flex items-center gap-2">
            {user && user.role === "admin" ? (
              <Link to="/admin/dashboard" data-testid="mobile-admin-panel-btn" title="Yönetim Paneli">
                <span className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center border border-slate-700">
                  <LayoutDashboard className="w-4 h-4" />
                </span>
              </Link>
            ) : !user ? (
              <Link to="/personel-girisi" data-testid="mobile-staff-login-btn" title="Personel Girişi">
                <span className="w-9 h-9 rounded-full border border-[#d4af37] text-[#d4af37] flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </span>
              </Link>
            ) : null}
            <button
              data-testid="mobile-menu-toggle"
              className="text-white"
              onClick={() => setOpen((o) => !o)}
              aria-label="Menü"
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>

        {open && (
          <div className="lg:hidden border-t border-white/5 bg-[#050505]/95 backdrop-blur-3xl">
            <div className="px-6 py-4 flex flex-col gap-3">
              {navItems.map((n) => (
                <NavLink key={n.to} to={n.to} onClick={() => setOpen(false)} className="text-sm text-neutral-300 py-1">
                  {n.label}
                </NavLink>
              ))}
              <Link to="/randevu" onClick={() => setOpen(false)}>
                <Button className="w-full rounded-full bg-emerald-500 hover:bg-emerald-600 text-black font-semibold">Randevu Al</Button>
              </Link>
              {user && user.role === "admin" && (
                <Link to="/admin/dashboard" onClick={() => setOpen(false)}>
                  <Button className="w-full rounded-full bg-slate-900 hover:bg-slate-800 text-white gap-2">
                    <LayoutDashboard className="w-4 h-4" /> Yönetim Paneli
                  </Button>
                </Link>
              )}
              {user ? (
                <Button
                  variant="ghost"
                  onClick={async () => { setOpen(false); await logout(); navigate("/"); }}
                  className="text-neutral-400"
                >Çıkış Yap</Button>
              ) : (
                <Link to="/personel-girisi" onClick={() => setOpen(false)}>
                  <Button variant="outline" className="w-full rounded-full border-neutral-700 bg-transparent text-neutral-200 gap-2">
                    <ShieldCheck className="w-4 h-4" /> Personel Girişi
                  </Button>
                </Link>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-neutral-900 mt-24">
        <div className="max-w-7xl mx-auto px-6 py-14 grid md:grid-cols-4 gap-8">
          <div>
            <div className="font-serif text-3xl mb-3 lowercase">{brand}</div>
            <p className="text-sm text-neutral-500 max-w-xs">Duyguların ışıkla buluştuğu stüdyo. Fotoğraf, video ve prodüksiyon hizmetleri.</p>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-neutral-500 mb-4">Menü</div>
            <ul className="space-y-2 text-sm">
              {navItems.map((n) => (
                <li key={n.to}><Link to={n.to} className="text-neutral-300 hover:text-[#d4af37]">{n.label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-neutral-500 mb-4">İletişim</div>
            <ul className="space-y-2 text-sm text-neutral-300">
              {settings?.phone && <li className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> {formatPhone(settings.phone)}</li>}
              {settings?.email && <li>{settings.email}</li>}
              {settings?.address && <li>{settings.address}</li>}
            </ul>
            <div className="flex items-center gap-2 mt-4">
              {instagramUrl(settings?.instagram) && (
                <a href={instagramUrl(settings.instagram)} target="_blank" rel="noopener noreferrer" title="Instagram" className="w-8 h-8 rounded-full border border-neutral-800 flex items-center justify-center hover:border-[#d4af37] hover:text-[#d4af37]">
                  <Instagram className="w-3.5 h-3.5" />
                </a>
              )}
              {instagramUrl(settings?.instagram_secondary) && (
                <a href={instagramUrl(settings.instagram_secondary)} target="_blank" rel="noopener noreferrer" title="Instagram" className="w-8 h-8 rounded-full border border-neutral-800 flex items-center justify-center hover:border-[#d4af37] hover:text-[#d4af37]">
                  <Instagram className="w-3.5 h-3.5" />
                </a>
              )}
              {youtubeUrl(settings?.youtube) && (
                <a href={youtubeUrl(settings.youtube)} target="_blank" rel="noopener noreferrer" title="YouTube" className="w-8 h-8 rounded-full border border-neutral-800 flex items-center justify-center hover:border-[#d4af37] hover:text-[#d4af37]">
                  <Youtube className="w-3.5 h-3.5" />
                </a>
              )}
              {tiktokUrl(settings?.tiktok) && (
                <a href={tiktokUrl(settings.tiktok)} target="_blank" rel="noopener noreferrer" title="TikTok" className="w-8 h-8 rounded-full border border-neutral-800 flex items-center justify-center hover:border-[#d4af37] hover:text-[#d4af37]">
                  <Music2 className="w-3.5 h-3.5" />
                </a>
              )}
              {facebookUrl(settings?.facebook) && (
                <a href={facebookUrl(settings.facebook)} target="_blank" rel="noopener noreferrer" title="Facebook" className="w-8 h-8 rounded-full border border-neutral-800 flex items-center justify-center hover:border-[#d4af37] hover:text-[#d4af37]">
                  <Facebook className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-neutral-500 mb-4">Randevu</div>
            <Link to="/randevu">
              <Button className="rounded-full bg-[#d4af37] text-black hover:bg-[#b5952f] w-full">Şimdi Rezerve Et</Button>
            </Link>
          </div>
        </div>
        <div className="border-t border-neutral-900">
          <div className="max-w-7xl mx-auto px-6 py-6 text-xs text-neutral-500 flex flex-col md:flex-row justify-between gap-3">
            <span>© {new Date().getFullYear()} {settings?.business_name || "Fotuber"}. Tüm hakları saklıdır.</span>
            <div className="flex items-center gap-4">
              <span>fotuber.com.tr</span>
              <Link
                to="/personel-girisi"
                data-testid="footer-staff-login"
                className="flex items-center gap-1 text-neutral-500 hover:text-[#d4af37]"
              >
                <ShieldCheck className="w-3 h-3" /> Personel Girişi
              </Link>
            </div>
          </div>
        </div>
      </footer>

      <FloatingContact />
    </div>
  );
};

export default PublicLayout;
