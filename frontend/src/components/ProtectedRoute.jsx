import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export const ProtectedRoute = ({ children, requireRole, requireRoles }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  const allowedRoles = requireRoles || (requireRole ? [requireRole] : null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-500">
        <div className="animate-pulse">Yükleniyor...</div>
      </div>
    );
  }
  if (!user) {
    const needsStaff = allowedRoles && allowedRoles.some((r) => r === "admin" || r === "staff");
    const dest = needsStaff ? "/personel-girisi" : "/giris";
    return <Navigate to={dest} state={{ from: location.pathname }} replace />;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Staff trying to access admin page → send them to staff page. Others → home.
    if (user.role === "staff") return <Navigate to="/personel/gunluk" replace />;
    return <Navigate to="/" replace />;
  }
  return children;
};
