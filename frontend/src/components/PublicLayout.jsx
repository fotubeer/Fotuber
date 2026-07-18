import React, { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Menu, X, Camera, Phone, LogOut, User, Instagram, Youtube, Facebook, Music2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/api";
import { instagramUrl, youtubeUrl, tiktokUrl, facebookUrl } from "@/lib/social";
import FloatingContact from "@/components/FloatingContact";

const navItems = [
  { to: "/", label: "Ana Sayfa" },
  { to: "/hizmetler", label: "Hizmetler" },
  { to: "/galeri", label: "Galeri" },
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
      <header className="sticky top-0 z-40 bg-neutral-950/70 backdrop-blur-xl border-b border-neutral-900">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <Link to="/" data-testid="logo-home" className="flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt={brand} className="w-10 h-10 rounded-full object-cover border border-[#d4af37]" />
            ) : (
              <span className="w-9 h-9 rounded-full border border-[#d4af37] flex items-center justify-center">
                <Camera className="w-4 h-4 text-[#d4af37]" strokeWidth={1.5} />
              </span>
            )}
            <div className="leading-none">
              <div className="font-serif text-2xl tracking-tight text-white">{brand}</div>
              <div className="text-[10px] tracking-[0.3em] text-neutral-500 uppercase">{tagline}</div>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-8">
            {navItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                data-testid={`nav-${n.to.replace('/', '') || 'home'}`}
                className={({ isActive }) =>
                  `text-sm tracking-wide link-underline ${isActive ? "text-[#d4af37]" : "text-neutral-300 hover:text-white"}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-3">
            <Link to="/randevu">
              <Button data-testid="cta-book-appointment" className="rounded-full bg-[#d4af37] text-black hover:bg-[#b5952f] px-6">
                Randevu Al
              </Button>
            </Link>
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
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Link to="/personel-girisi">
                <Button data-testid="staff-login-nav-btn" variant="outline" className="rounded-full border-neutral-700 bg-transparent text-neutral-300 hover:bg-neutral-800 hover:text-white">
                  Personel Girişi
                </Button>
              </Link>
            )}
          </div>

          <button
            data-testid="mobile-menu-toggle"
            className="lg:hidden text-white"
            onClick={() => setOpen((o) => !o)}
            aria-label="Menü"
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>

        {open && (
          <div className="lg:hidden border-t border-neutral-900 bg-neutral-950/95">
            <div className="px-6 py-4 flex flex-col gap-3">
              {navItems.map((n) => (
                <NavLink key={n.to} to={n.to} onClick={() => setOpen(false)} className="text-sm text-neutral-300 py-1">
                  {n.label}
                </NavLink>
              ))}
              <Link to="/randevu" onClick={() => setOpen(false)}>
                <Button className="w-full rounded-full bg-[#d4af37] text-black">Randevu Al</Button>
              </Link>
              {user ? (
                <Button
                  variant="ghost"
                  onClick={async () => { setOpen(false); await logout(); navigate("/"); }}
                  className="text-neutral-400"
                >Çıkış Yap</Button>
              ) : (
                <Link to="/personel-girisi" onClick={() => setOpen(false)}>
                  <Button variant="outline" className="w-full rounded-full border-neutral-700 bg-transparent text-neutral-200">
                    Personel Girişi
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
          <div className="max-w-7xl mx-auto px-6 py-6 text-xs text-neutral-500 flex justify-between">
            <span>© {new Date().getFullYear()} {settings?.business_name || "Fotuber"}. Tüm hakları saklıdır.</span>
            <span>fotuber.com.tr</span>
          </div>
        </div>
      </footer>

      <FloatingContact />
    </div>
  );
};

export default PublicLayout;
