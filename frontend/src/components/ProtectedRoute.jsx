import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export const ProtectedRoute = ({ children, requireRole }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-500">
        <div className="animate-pulse">Yükleniyor...</div>
      </div>
    );
  }
  if (!user) {
    const dest = requireRole === "admin" ? "/personel-girisi" : "/giris";
    return <Navigate to={dest} state={{ from: location.pathname }} replace />;
  }
  if (requireRole && user.role !== requireRole) {
    return <Navigate to="/" replace />;
  }
  return children;
};
