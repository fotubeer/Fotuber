import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { SettingsProvider } from "@/context/SettingsContext";
import { Toaster } from "@/components/ui/sonner";
import "@/App.css";

import PublicLayout from "@/components/PublicLayout";
import AdminLayout from "@/components/AdminLayout";
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

import Dashboard from "@/pages/admin/Dashboard";
import AdminAppointments from "@/pages/admin/Appointments";
import AdminCalendar from "@/pages/admin/CalendarBlock";
import Finance from "@/pages/admin/Finance";
import Staff from "@/pages/admin/Staff";
import AdminServices from "@/pages/admin/AdminServices";
import AdminGallery from "@/pages/admin/AdminGallery";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminTransactions from "@/pages/admin/AdminTransactions";

const P = ({ children }) => <PublicLayout>{children}</PublicLayout>;
const AdminGuard = ({ children }) => (
  <ProtectedRoute requireRole="admin"><AdminLayout>{children}</AdminLayout></ProtectedRoute>
);

function App() {
  return (
    <div className="App">
      <BrowserRouter>
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

              {/* Admin (protected, admin-only) */}
              <Route path="/admin" element={<AdminGuard><Navigate to="/admin/dashboard" replace /></AdminGuard>} />
              <Route path="/admin/dashboard" element={<AdminGuard><Dashboard /></AdminGuard>} />
              <Route path="/admin/randevular" element={<AdminGuard><AdminAppointments /></AdminGuard>} />
              <Route path="/admin/takvim" element={<AdminGuard><AdminCalendar /></AdminGuard>} />
              <Route path="/admin/finans" element={<AdminGuard><Finance /></AdminGuard>} />
              <Route path="/admin/nakit-akisi" element={<AdminGuard><AdminTransactions /></AdminGuard>} />
              <Route path="/admin/hizmetler" element={<AdminGuard><AdminServices /></AdminGuard>} />
              <Route path="/admin/personel" element={<AdminGuard><Staff /></AdminGuard>} />
              <Route path="/admin/galeri" element={<AdminGuard><AdminGallery /></AdminGuard>} />
              <Route path="/admin/ayarlar" element={<AdminGuard><AdminSettings /></AdminGuard>} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <Toaster position="top-right" richColors />
          </AuthProvider>
        </SettingsProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
