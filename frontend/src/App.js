import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
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

const P = ({ children }) => <PublicLayout>{children}</PublicLayout>;

function App() {
  return (
    <div className="App">
      <BrowserRouter>
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
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireRole="admin">
                  <Navigate to="/admin/dashboard" replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/dashboard"
              element={<ProtectedRoute requireRole="admin"><AdminLayout><Dashboard /></AdminLayout></ProtectedRoute>}
            />
            <Route
              path="/admin/randevular"
              element={<ProtectedRoute requireRole="admin"><AdminLayout><AdminAppointments /></AdminLayout></ProtectedRoute>}
            />
            <Route
              path="/admin/takvim"
              element={<ProtectedRoute requireRole="admin"><AdminLayout><AdminCalendar /></AdminLayout></ProtectedRoute>}
            />
            <Route
              path="/admin/finans"
              element={<ProtectedRoute requireRole="admin"><AdminLayout><Finance /></AdminLayout></ProtectedRoute>}
            />
            <Route
              path="/admin/hizmetler"
              element={<ProtectedRoute requireRole="admin"><AdminLayout><AdminServices /></AdminLayout></ProtectedRoute>}
            />
            <Route
              path="/admin/personel"
              element={<ProtectedRoute requireRole="admin"><AdminLayout><Staff /></AdminLayout></ProtectedRoute>}
            />
            <Route
              path="/admin/galeri"
              element={<ProtectedRoute requireRole="admin"><AdminLayout><AdminGallery /></AdminLayout></ProtectedRoute>}
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
