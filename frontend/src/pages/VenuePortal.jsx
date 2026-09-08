import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Building2, Mail, Lock, Phone, MapPin, Eye, EyeOff, ArrowRight, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { venueApi, setVenueToken } from "@/lib/venueApi";
import { formatApiError } from "@/lib/api";

export default function VenuePortal() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", salon_adi: "", phone: "", city: "", kvkk: false });

  useEffect(() => {
    venueApi.get("/venue/me").then(() => navigate("/salon/panel")).catch(() => {});
  }, [navigate]);

  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "register") {
        if (!form.kvkk) { toast.error("KVKK metnini onaylayın"); setBusy(false); return; }
        const { data } = await venueApi.post("/venue/register", {
          email: form.email, password: form.password, salon_adi: form.salon_adi,
          phone: form.phone, city: form.city, kvkk_consent: true,
        });
        setVenueToken(data.token);
        toast.success("Salon hesabınız oluşturuldu!");
      } else {
        const { data } = await venueApi.post("/venue/login", { email: form.email, password: form.password });
        setVenueToken(data.token);
        toast.success("Giriş başarılı");
      }
      navigate("/salon/panel");
    } catch (err) {
      toast.error(formatApiError(err, "İşlem başarısız"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="venue-portal" className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: "radial-gradient(1200px 600px at 20% -10%, #3a1b2a 0%, #140710 55%, #0a0407 100%)" }}>
      <div className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 rounded-full bg-rose-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 w-[28rem] h-[28rem] rounded-full bg-amber-500/10 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
        className="relative w-full max-w-md rounded-3xl border border-white/12 p-7 sm:p-9"
        style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
      >
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-300 to-rose-600 flex items-center justify-center shadow-lg shadow-rose-900/30">
            <Landmark className="text-neutral-900" size={26} />
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-white tracking-tight">Fotuber Salon Girişi</h1>
          <p className="mt-1 text-sm text-white/55">Düğün salonlarına özel · davet kodu üret, takip et</p>
        </div>

        <div className="mb-6 rounded-xl bg-white/5 p-3 text-center">
          <span className="text-sm font-medium text-white">Giriş Yap</span>
          <p className="mt-1 text-[11px] text-white/45">Salon hesapları Fotuber yönetimi tarafından açılır. Personel girişi için <Link to="/salon/kiosk" className="text-rose-300 hover:text-rose-200 underline">Personel Kiosk</Link>.</p>
        </div>

        <form onSubmit={submit} noValidate className="space-y-3.5">
          <Field icon={Mail}>
            <Input data-testid="venue-email" type="email" placeholder="E-posta" value={form.email}
              onChange={(e) => upd("email", e.target.value)} required className="pl-10 h-11 bg-white/5 border-white/15 text-white placeholder:text-white/40" />
          </Field>
          <Field icon={Lock}>
            <Input data-testid="venue-password" type={showPw ? "text" : "password"} placeholder="Şifre" value={form.password}
              onChange={(e) => upd("password", e.target.value)} required className="pl-10 pr-10 h-11 bg-white/5 border-white/15 text-white placeholder:text-white/40" />
            <button type="button" onClick={() => setShowPw((s) => !s)} data-testid="venue-toggle-pw"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white">
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </Field>
          <Button data-testid="venue-submit" type="submit" disabled={busy}
            className="w-full h-11 gap-2 bg-gradient-to-r from-rose-400 to-rose-600 text-white font-semibold hover:from-rose-300 hover:to-rose-500">
            {busy ? "..." : "Salon Paneline Giriş"} <ArrowRight size={18} />
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-white/40">
          <Link to="/" className="hover:text-white/70">← Fotuber ana sayfa</Link>
        </p>
      </motion.div>
    </div>
  );
}

function Field({ icon: Icon, children }) {
  return (
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
      {children}
    </div>
  );
}
