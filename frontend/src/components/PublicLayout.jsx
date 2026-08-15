import React, { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Menu, X, Camera, Phone, LogOut, User, Instagram, Youtube, Facebook, Music2, ShieldCheck, LayoutDashboard, Heart, IdCard, ChevronDown, BarChart3, Landmark, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { API_BASE } from "@/lib/api";
import { instagramUrl, youtubeUrl, tiktokUrl, facebookUrl } from "@/lib/social";
import FloatingContact from "@/components/FloatingContact";
import FotuberAI from "@/components/FotuberAI";

const navItems = [
  { to: "/", label: "Ana Sayfa" },
  { to: "/hizmetler", label: "Hizmetler" },
  { to: "/fotuber-medya", label: "Fotuber Medya" },
  { to: "/galeri", label: "Galeri" },
  { to: "/altin-saat", label: "Altın Saat", accent: true, promo: true },
  { to: "/tasarim-studyosu", label: "Tasarım Stüdyosu", accent: true, promo: true },
  { to: "/indirim-kodu", label: "İndirim Kodu", accent: true, promo: true },
  { to: "/hakkimizda", label: "Hakkımızda" },
  { to: "/iletisim", label: "İletişim" },
];
const preItems = navItems.filter((n) => !n.promo && ["/", "/hizmetler", "/fotuber-medya", "/galeri"].includes(n.to));
const promoItems = navItems.filter((n) => n.promo);
const postItems = navItems.filter((n) => !n.promo && ["/hakkimizda", "/iletisim"].includes(n.to));

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

          <nav className="hidden lg:flex items-center justify-center flex-1 mx-2 min-w-0 lg:gap-2 xl:gap-3 2xl:gap-5">
            {preItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                data-testid={`nav-${n.to.replace('/', '') || 'home'}`}
                className={({ isActive }) =>
                  `relative whitespace-nowrap shrink-0 text-[11.5px] xl:text-[13px] 2xl:text-[14px] font-medium tracking-tight lg:tracking-normal transition-colors after:content-[''] after:absolute after:w-full after:scale-x-0 after:h-[1px] after:-bottom-1.5 after:left-0 after:bg-[#d4af37] after:origin-center hover:after:scale-x-100 after:transition-transform after:duration-300 after:ease-out ${
                    isActive ? "text-[#d4af37] after:scale-x-100" : "text-neutral-300 hover:text-white"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button data-testid="nav-firsatlar" type="button" className="relative whitespace-nowrap shrink-0 flex items-center gap-1 text-[11.5px] xl:text-[13px] 2xl:text-[14px] font-medium text-[#d4af37] hover:text-[#e8ca58] drop-shadow-[0_0_8px_rgba(212,175,55,0.3)] cursor-pointer">
                  Fırsatlar <ChevronDown className="w-3 h-3 opacity-80" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-52">
                {promoItems.map((p) => (
                  <DropdownMenuItem key={p.to} onClick={() => navigate(p.to)} data-testid={`nav-promo-${p.to.replace('/', '')}`} className="gap-2 cursor-pointer text-[#8a6d0f] font-medium">
                    <Sparkles className="w-4 h-4 text-[#d4af37]" /> {p.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {postItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                data-testid={`nav-${n.to.replace('/', '') || 'home'}`}
                className={({ isActive }) =>
                  `relative whitespace-nowrap shrink-0 text-[11.5px] xl:text-[13px] 2xl:text-[14px] font-medium tracking-tight lg:tracking-normal transition-colors after:content-[''] after:absolute after:w-full after:scale-x-0 after:h-[1px] after:-bottom-1.5 after:left-0 after:bg-[#d4af37] after:origin-center hover:after:scale-x-100 after:transition-transform after:duration-300 after:ease-out ${
                    isActive ? "text-[#d4af37] after:scale-x-100" : "text-neutral-300 hover:text-white"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-1.5 xl:gap-2 shrink-0 min-w-max">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <motion.button
                  data-testid="cta-davetiye"
                  type="button"
                  className="rounded-full bg-gradient-to-r from-rose-500 to-pink-500 text-white font-semibold px-3 xl:px-4 h-9 xl:h-10 flex items-center gap-1.5 text-xs xl:text-sm shadow-[0_0_18px_rgba(244,63,94,0.4)] cursor-pointer whitespace-nowrap"
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Heart className="w-4 h-4" fill="currentColor" /> Davetiye <ChevronDown className="w-3.5 h-3.5 opacity-80" />
                </motion.button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem onClick={() => navigate("/davetiye-olustur")} data-testid="menu-create-invitation" className="gap-2 cursor-pointer">
                  <Heart className="w-4 h-4 text-rose-500" fill="currentColor" /> Davetiye Oluştur
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/davetiyelerim")} data-testid="menu-my-invitations" className="gap-2 cursor-pointer">
                  <BarChart3 className="w-4 h-4 text-indigo-500" /> Davetiyelerim (LCV Takip)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Link to="/randevu">
              <Button data-testid="cta-book-appointment" className="rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 xl:px-4 shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] transition-shadow duration-300 whitespace-nowrap">
                Randevu Al
              </Button>
            </Link>
            {/* Secondary panels/logins consolidated into one compact menu so the
                main nav (Hakkımızda, Hizmetler, İletişim…) always fits. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button data-testid="cta-panels-menu" variant="outline" className="rounded-full border-neutral-700 bg-transparent text-neutral-200 hover:bg-neutral-800 hover:text-white font-semibold px-3 xl:px-4 gap-1.5 whitespace-nowrap">
                  <IdCard className="w-4 h-4" /> Paneller <ChevronDown className="w-3.5 h-3.5 opacity-80" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => navigate("/studyo")} data-testid="menu-studio-panel" className="gap-2 cursor-pointer">
                  <IdCard className="w-4 h-4 text-blue-600" /> Stüdyo Paneli
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/salon")} data-testid="menu-salon" className="gap-2 cursor-pointer">
                  <Landmark className="w-4 h-4 text-rose-500" /> Salon Girişi
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/medya")} data-testid="menu-media" className="gap-2 cursor-pointer">
                  <Camera className="w-4 h-4 text-sky-500" /> Fotuber Medya (Firma)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/photobooth-panel")} data-testid="menu-booth" className="gap-2 cursor-pointer">
                  <Camera className="w-4 h-4 text-fuchsia-500" /> Photobooth Paneli (Firma)
                </DropdownMenuItem>
                {(!user || user.role === "member") && (
                  <DropdownMenuItem onClick={() => navigate("/personel-girisi")} data-testid="menu-staff-login" className="gap-2 cursor-pointer">
                    <ShieldCheck className="w-4 h-4 text-[#d4af37]" /> Personel Girişi
                  </DropdownMenuItem>
                )}
                {user && user.role === "admin" && (
                  <DropdownMenuItem onClick={() => navigate("/admin/dashboard")} data-testid="menu-admin-panel" className="gap-2 cursor-pointer">
                    <LayoutDashboard className="w-4 h-4 text-slate-700" /> Yönetim Paneli
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {user ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-neutral-400 whitespace-nowrap hidden 2xl:inline max-w-[140px] truncate align-bottom" data-testid="navbar-user-name">
                  <User className="w-3.5 h-3.5 inline mr-1" strokeWidth={1.5} />
                  {user.name}{user.role === "member" ? " (Üye)" : ""}
                </span>
                <Button
                  data-testid="navbar-logout-btn"
                  variant="ghost"
                  onClick={async () => { await logout(); navigate("/"); }}
                  className="text-neutral-300 hover:text-white h-9 px-2 2xl:px-3 gap-1.5 whitespace-nowrap"
                  title={`Çıkış Yap${user.name ? " — " + user.name : ""}`}
                >
                  <LogOut className="w-4 h-4" /> <span className="hidden 2xl:inline">Çıkış</span>
                </Button>
              </div>
            ) : null}
          </div>

          {/* Persistent mobile access to admin/staff area (right next to hamburger) */}
          <div className="lg:hidden flex items-center gap-2">
            {user && user.role === "admin" ? (
              <Link to="/admin/dashboard" data-testid="mobile-admin-panel-btn" title="Yönetim Paneli">
                <span className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center border border-slate-700">
                  <LayoutDashboard className="w-4 h-4" />
                </span>
              </Link>
            ) : (!user || user.role === "member") ? (
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
              <Link to="/davetiye-olustur" onClick={() => setOpen(false)}>
                <Button data-testid="m-cta-davetiye" className="w-full rounded-full bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-semibold gap-1.5">
                  <Heart className="w-4 h-4" fill="currentColor" /> Davetiye Oluştur
                </Button>
              </Link>
              <Link to="/davetiyelerim" onClick={() => setOpen(false)}>
                <Button data-testid="m-cta-my-invitations" variant="outline" className="w-full rounded-full border-indigo-400/40 bg-transparent text-indigo-300 hover:bg-indigo-500/10 font-semibold gap-1.5">
                  <BarChart3 className="w-4 h-4" /> Davetiyelerim (LCV Takip)
                </Button>
              </Link>
              <Link to="/studyo" onClick={() => setOpen(false)}>
                <Button data-testid="m-cta-vesikalik-panel" className="w-full rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold gap-1.5">
                  <IdCard className="w-4 h-4" /> Stüdyo Paneli
                </Button>
              </Link>
              <Link to="/salon" onClick={() => setOpen(false)}>
                <Button data-testid="m-cta-salon" variant="outline" className="w-full rounded-full border-rose-400/40 bg-transparent text-rose-300 hover:bg-rose-500/10 font-semibold gap-1.5">
                  <Landmark className="w-4 h-4" /> Salon Girişi
                </Button>
              </Link>
              <Link to="/medya" onClick={() => setOpen(false)}>
                <Button data-testid="m-cta-media" variant="outline" className="w-full rounded-full border-sky-400/40 bg-transparent text-sky-300 hover:bg-sky-500/10 font-semibold gap-1.5">
                  <Camera className="w-4 h-4" /> Fotuber Medya (Firma)
                </Button>
              </Link>
              <Link to="/photobooth-panel" onClick={() => setOpen(false)}>
                <Button data-testid="m-cta-booth" variant="outline" className="w-full rounded-full border-fuchsia-400/40 bg-transparent text-fuchsia-300 hover:bg-fuchsia-500/10 font-semibold gap-1.5">
                  <Camera className="w-4 h-4" /> Photobooth Paneli (Firma)
                </Button>
              </Link>
              {user && user.role === "admin" && (
                <Link to="/admin/dashboard" onClick={() => setOpen(false)}>
                  <Button className="w-full rounded-full bg-slate-900 hover:bg-slate-800 text-white gap-2">
                    <LayoutDashboard className="w-4 h-4" /> Yönetim Paneli
                  </Button>
                </Link>
              )}
              {user && (
                <Button
                  data-testid="m-logout-btn"
                  variant="ghost"
                  onClick={async () => { setOpen(false); await logout(); navigate("/"); }}
                  className="text-neutral-300 gap-2"
                ><LogOut className="w-4 h-4" /> Çıkış Yap{user.role === "member" ? " (Üye)" : ""}</Button>
              )}
              {(!user || user.role === "member") && (
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
              <li><Link to="/studyo" className="text-blue-400 hover:text-blue-300">Stüdyo Paneli</Link></li>
              <li><Link to="/salon" className="text-rose-300 hover:text-rose-200" data-testid="footer-salon-login">Salon Girişi</Link></li>
              <li><Link to="/medya" className="text-sky-300 hover:text-sky-200" data-testid="footer-media-login">Fotuber Medya (Firma)</Link></li>
              <li><Link to="/davetiye-olustur" className="text-rose-400 hover:text-rose-300">Davetiye Oluştur</Link></li>
              <li><Link to="/altin-saat" className="text-[#e6a24a] hover:text-[#f0b45f]">Altın Saat Hesaplayıcı</Link></li>
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
      <FotuberAI />
    </div>
  );
};

export default PublicLayout;
