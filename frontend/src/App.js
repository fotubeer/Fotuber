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
import MemberVesikalik from "@/pages/MemberVesikalik";
import InvitationCreate from "@/pages/InvitationCreate";
import InvitationView from "@/pages/InvitationView";
import MyInvitations from "@/pages/MyInvitations";
import ResetPassword from "@/pages/ResetPassword";
import PrintInvitation from "@/pages/PrintInvitation";
import PhotoWallSlideshow from "@/pages/PhotoWallSlideshow";
import GuestPass from "@/pages/GuestPass";
import CheckinScanner from "@/pages/CheckinScanner";
import GoldenHour from "@/pages/GoldenHour";
import GuestImport from "@/pages/GuestImport";
import DesignStudio from "@/pages/DesignStudio";
import StudioPortal from "@/pages/StudioPortal";
import StudioDashboard from "@/pages/StudioDashboard";
import StudioVesikalik from "@/pages/StudioVesikalik";
import StudioTeam from "@/pages/StudioTeam";
import StudioPackages from "@/pages/StudioPackages";
import StudioGallery from "@/pages/StudioGallery";
import VenuePortal from "@/pages/VenuePortal";
import VenueDashboard from "@/pages/VenueDashboard";
import FloorPlanBuilder from "@/pages/FloorPlanBuilder";
import StaffKiosk from "@/pages/StaffKiosk";
import GallerySelect from "@/pages/GallerySelect";
import PhotoboothKiosk from "@/pages/PhotoboothKiosk";
import PhotoboothMemory from "@/pages/PhotoboothMemory";
import StudioChatWidget from "@/components/StudioChatWidget";

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
import AdminVenueAccounts from "@/pages/admin/AdminVenueAccounts";
import AdminIntroSettings from "@/pages/admin/AdminIntroSettings";
import AdminInstagramSlideshow from "@/pages/admin/AdminInstagramSlideshow";
import AdminAIAssistant from "@/pages/admin/AdminAIAssistant";
import VesikalikWorkspace from "@/pages/VesikalikWorkspace";
import AdminContacts from "@/pages/admin/AdminContacts";
import AdminMemberships from "@/pages/admin/AdminMemberships";
import AdminDesignRights from "@/pages/admin/AdminDesignRights";
import AdminNotifications from "@/pages/admin/AdminNotifications";
import AdminAdBanners from "@/pages/admin/AdminAdBanners";
import AdminDesktopApp from "@/pages/admin/AdminDesktopApp";
import AdminStudioPlans from "@/pages/admin/AdminStudioPlans";
import AdminMemoryWall from "@/pages/admin/AdminMemoryWall";
import AdminSitePricing from "@/pages/admin/AdminSitePricing";
import AdminAnnouncements from "@/pages/admin/AdminAnnouncements";
import AdminInbox from "@/pages/admin/AdminInbox";
import AdminPhotobooth from "@/pages/admin/AdminPhotobooth";

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
              <Route path="/altin-saat" element={<P><GoldenHour /></P>} />
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
              <Route path="/vesikalik" element={<MemberVesikalik />} />
              <Route path="/davetiye-olustur" element={<InvitationCreate />} />
              <Route path="/baskiya-hazir-davetiye" element={<PrintInvitation />} />
              <Route path="/davetiye/:slug" element={<InvitationView />} />
              <Route path="/davetiye/:slug/duvar" element={<PhotoWallSlideshow />} />
              <Route path="/davetiye/:iid/kapi" element={<CheckinScanner />} />
              <Route path="/davetiye/import/:token" element={<GuestImport />} />
              <Route path="/gecis/:token" element={<GuestPass />} />
              <Route path="/davetiyelerim" element={<MyInvitations />} />
              <Route path="/sifre-sifirla" element={<ResetPassword />} />
              <Route path="/tasarim-studyosu" element={<DesignStudio />} />
              <Route path="/studyo" element={<StudioPortal />} />
              <Route path="/studyo/panel" element={<StudioDashboard />} />
              <Route path="/studyo/vesikalik" element={<StudioVesikalik />} />
              <Route path="/studyo/ekip" element={<StudioTeam />} />
              <Route path="/studyo/paketler" element={<StudioPackages />} />
              <Route path="/studyo/galeri" element={<StudioGallery />} />
              <Route path="/galeri/:token" element={<GallerySelect />} />
              <Route path="/salon" element={<VenuePortal />} />
              <Route path="/salon/panel" element={<VenueDashboard />} />
              <Route path="/salon/kroki/:id" element={<FloorPlanBuilder />} />
              <Route path="/salon/kiosk" element={<StaffKiosk />} />
              <Route path="/anilarim/:token" element={<PhotoboothMemory />} />
              <Route path="/photobooth-kiosk" element={<ProtectedRoute requireRole="admin"><PhotoboothKiosk /></ProtectedRoute>} />

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
              <Route path="/admin/salon-hesaplari" element={<AdminGuard><AdminVenueAccounts /></AdminGuard>} />
              <Route path="/admin/urun-secenekleri" element={<AdminGuard><AdminProductOptions /></AdminGuard>} />
              <Route path="/admin/animasyon-ayarlari" element={<AdminGuard><AdminIntroSettings /></AdminGuard>} />
              <Route path="/admin/instagram-slayt" element={<AdminGuard><AdminInstagramSlideshow /></AdminGuard>} />
              <Route path="/admin/fotuber-asistan" element={<AdminGuard><AdminAIAssistant /></AdminGuard>} />
              <Route path="/admin/vesikalik" element={<AdminGuard><VesikalikWorkspace /></AdminGuard>} />
              <Route path="/admin/kisiler" element={<AdminGuard><AdminContacts /></AdminGuard>} />
              <Route path="/admin/uyelikler" element={<AdminGuard><AdminMemberships /></AdminGuard>} />
              <Route path="/admin/tasarim-haklari" element={<AdminGuard><AdminDesignRights /></AdminGuard>} />
              <Route path="/admin/studyo-fiyatlar" element={<AdminGuard><AdminStudioPlans /></AdminGuard>} />
              <Route path="/admin/ani-duvari" element={<AdminGuard><AdminMemoryWall /></AdminGuard>} />
              <Route path="/admin/genel-fiyatlar" element={<AdminGuard><AdminSitePricing /></AdminGuard>} />
              <Route path="/admin/duyurular" element={<AdminGuard><AdminAnnouncements /></AdminGuard>} />
              <Route path="/admin/gmail" element={<AdminGuard><AdminInbox /></AdminGuard>} />
              <Route path="/admin/bildirimler" element={<AdminGuard><AdminNotifications /></AdminGuard>} />
              <Route path="/admin/reklamlar" element={<AdminGuard><AdminAdBanners /></AdminGuard>} />
              <Route path="/admin/masaustu" element={<AdminGuard><AdminDesktopApp /></AdminGuard>} />
              <Route path="/admin/photobooth" element={<AdminGuard><AdminPhotobooth /></AdminGuard>} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <StudioChatWidget />
            <Toaster position="top-right" richColors />
          </AuthProvider>
        </SettingsProvider>
        </HelmetProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
