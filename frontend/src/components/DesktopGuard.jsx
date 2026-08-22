import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export const isDesktopApp = () => !!(typeof window !== "undefined" && window.fotuberDesktop && window.fotuberDesktop.isDesktop);

// Masaüstü (Electron) uygulamasında navigasyonu YALNIZCA Stüdyo Paneli'ne kilitler.
// /studyo dışına çıkılırsa doğrudan stüdyo giriş/paneline geri döner.
export default function DesktopGuard() {
  const loc = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!isDesktopApp()) return;
    if (!loc.pathname.startsWith("/studyo")) {
      navigate("/studyo", { replace: true });
    }
  }, [loc.pathname, navigate]);
  return null;
}
