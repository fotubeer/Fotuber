import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/context/AuthContext";
import { SettingsProvider } from "@/context/SettingsContext";
import { Toaster } from "@/components/ui/sonner";
import "@/App.css";

import PublicLayout from "@/components/PublicLayout";
import AdminLayout from "@/components/AdminLayout";
import StaffLayout from "@/components/StaffLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import Home from "@/pages/Home";
import Services from "@/pages/Services";
import About from "@/pages/About";
import Contact from "@/pages/Contact";
import Booking from "@/pages/Booking";
import Gallery from "@/pages/Gallery";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import StaffLogin from "@/pages/StaffLogin";
import MyAppointments from "@/pages/MyAppointments";
import StaffDaily from "@/pages/StaffDaily";

import Dashboard from "@/pages/admin/Dashboard";
import AdminAppointments from "@/pages/admin/Appointments";
import AdminCalendar from "@/pages/admin/CalendarBlock";
import Finance from "@/pages/admin/Finance";
import Staff from "@/pages/admin/Staff";
import AdminServices from "@/pages/admin/AdminServices";
import AdminGallery from "@/pages/admin/AdminGallery";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminTransactions from "@/pages/admin/AdminTransactions";
import AdminDiscountCodes from "@/pages/admin/AdminDiscountCodes";
import AdminFotuberMedya from "@/pages/admin/AdminFotuberMedya";
import AdminCashRegister from "@/pages/admin/AdminCashRegister";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminAlbums from "@/pages/admin/AdminAlbums";
import AdminAlbumDetail from "@/pages/admin/AdminAlbumDetail";
import AdminGuestEvents from "@/pages/admin/AdminGuestEvents";
import AdminProductOptions from "@/pages/admin/AdminProductOptions";
import AdminVenues from "@/pages/admin/AdminVenues";
import AdminIntroSettings from "@/pages/admin/AdminIntroSettings";
import AdminInstagramSlideshow from "@/pages/admin/AdminInstagramSlideshow";
import AdminAIAssistant from "@/pages/admin/AdminAIAssistant";
import AdminPassportPhoto from "@/pages/admin/AdminPassportPhoto";

import DiscountCode from "@/pages/DiscountCode";
import FotuberMedya from "@/pages/FotuberMedya";
import AlbumViewer from "@/pages/AlbumViewer";
import GuestUpload from "@/pages/GuestUpload";
import CoupleDownload from "@/pages/CoupleDownload";

const P = ({ children }) => <PublicLayout>{children}</PublicLayout>;
const AdminGuard = ({ children }) => (
  <ProtectedRoute requireRole="admin"><AdminLayout>{children}</AdminLayout></ProtectedRoute>
);
const StaffGuard = ({ children }) => (
  <ProtectedRoute requireRoles={["staff", "admin"]}><StaffLayout>{children}</StaffLayout></ProtectedRoute>
);

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <HelmetProvider>
          <SettingsProvider>
            <AuthProvider>
            <Routes>
              {/* Public */}
              <Route path="/" element={<P><Home /></P>} />
              <Route path="/hizmetler" element={<P><Services /></P>} />
              <Route path="/hakkimizda" element={<P><About /></P>} />
              <Route path="/iletisim" element={<P><Contact /></P>} />
              <Route path="/galeri" element={<P><Gallery /></P>} />
              <Route path="/randevu" element={<P><Booking /></P>} />
              <Route path="/indirim-kodu" element={<P><DiscountCode /></P>} />
              <Route path="/fotuber-medya" element={<P><FotuberMedya /></P>} />
              {/* Public photo selection album (auth required inside component) */}
              <Route path="/albumler/:token" element={<AlbumViewer />} />
              {/* Public guest upload via QR (auth required for uploads) */}
              <Route path="/etkinlik/:token" element={<GuestUpload />} />
              {/* Public venue QR — resolves to currently active event */}
              <Route path="/mekan/:venueToken" element={<GuestUpload />} />
              {/* Public download link for the couple */}
              <Route path="/paylas/:token" element={<CoupleDownload />} />
              <Route path="/giris" element={<P><Login /></P>} />
              <Route path="/kayit" element={<P><Register /></P>} />
              <Route path="/personel-girisi" element={<StaffLogin />} />

              <Route
                path="/randevularim"
                element={
                  <ProtectedRoute>
                    <P><MyAppointments /></P>
                  </ProtectedRoute>
                }
              />

              {/* Staff (limited role) — daily cash entry & register close */}
              <Route path="/personel/gunluk" element={<StaffGuard><StaffDaily /></StaffGuard>} />

              {/* Admin (protected, admin-only) */}
              <Route path="/admin" element={<AdminGuard><Navigate to="/admin/dashboard" replace /></AdminGuard>} />
              <Route path="/admin/dashboard" element={<AdminGuard><Dashboard /></AdminGuard>} />
              <Route path="/admin/randevular" element={<AdminGuard><AdminAppointments /></AdminGuard>} />
              <Route path="/admin/takvim" element={<AdminGuard><AdminCalendar /></AdminGuard>} />
              <Route path="/admin/finans" element={<AdminGuard><Finance /></AdminGuard>} />
              <Route path="/admin/nakit-akisi" element={<AdminGuard><AdminTransactions /></AdminGuard>} />
              <Route path="/admin/kasa-devir" element={<AdminGuard><AdminCashRegister /></AdminGuard>} />
              <Route path="/admin/hizmetler" element={<AdminGuard><AdminServices /></AdminGuard>} />
              <Route path="/admin/personel" element={<AdminGuard><Staff /></AdminGuard>} />
              <Route path="/admin/kullanicilar" element={<AdminGuard><AdminUsers /></AdminGuard>} />
              <Route path="/admin/galeri" element={<AdminGuard><AdminGallery /></AdminGuard>} />
              <Route path="/admin/ayarlar" element={<AdminGuard><AdminSettings /></AdminGuard>} />
              <Route path="/admin/indirim-kodlari" element={<AdminGuard><AdminDiscountCodes /></AdminGuard>} />
              <Route path="/admin/fotuber-medya" element={<AdminGuard><AdminFotuberMedya /></AdminGuard>} />
              <Route path="/admin/albumler" element={<AdminGuard><AdminAlbums /></AdminGuard>} />
              <Route path="/admin/albumler/:id" element={<AdminGuard><AdminAlbumDetail /></AdminGuard>} />
              <Route path="/admin/etkinlikler" element={<AdminGuard><AdminGuestEvents /></AdminGuard>} />
              <Route path="/admin/mekanlar" element={<AdminGuard><AdminVenues /></AdminGuard>} />
              <Route path="/admin/urun-secenekleri" element={<AdminGuard><AdminProductOptions /></AdminGuard>} />
              <Route path="/admin/animasyon-ayarlari" element={<AdminGuard><AdminIntroSettings /></AdminGuard>} />
              <Route path="/admin/instagram-slayt" element={<AdminGuard><AdminInstagramSlideshow /></AdminGuard>} />
              <Route path="/admin/fotuber-asistan" element={<AdminGuard><AdminAIAssistant /></AdminGuard>} />
              <Route path="/admin/vesikalik" element={<AdminGuard><AdminPassportPhoto /></AdminGuard>} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <Toaster position="top-right" richColors />
          </AuthProvider>
        </SettingsProvider>
        </HelmetProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
