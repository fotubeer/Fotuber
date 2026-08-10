import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Camera, Mail, Lock, Building2, Phone, Eye, EyeOff, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { studioApi, setStudioToken } from "@/lib/studioApi";
import { formatApiError } from "@/lib/api";

export default function StudioPortal() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", firma_adi: "", phone: "", kvkk: false });

  useEffect(() => {
    studioApi.get("/studio/me").then(() => navigate("/studyo/panel")).catch(() => {});
  }, [navigate]);

  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "register") {
        if (!form.kvkk) { toast.error("KVKK metnini onaylayın"); setBusy(false); return; }
        const { data } = await studioApi.post("/studio/register", {
          email: form.email, password: form.password, firma_adi: form.firma_adi,
          phone: form.phone, kvkk_consent: true,
        });
        setStudioToken(data.token);
        toast.success(`Hoş geldiniz! Müşteri kodunuz: ${data.account.ftb_code}`);
      } else {
        const { data } = await studioApi.post("/studio/login", { email: form.email, password: form.password });
        setStudioToken(data.token);
        toast.success("Giriş başarılı");
      }
      navigate("/studyo/panel");
    } catch (err) {
      toast.error(formatApiError(err, "İşlem başarısız"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="studio-portal" className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: "radial-gradient(1200px 600px at 20% -10%, #1b2a4a 0%, #070b14 55%, #05070d 100%)" }}>
      {/* ambient glow */}
      <div className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 w-[28rem] h-[28rem] rounded-full bg-sky-500/10 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
        className="relative w-full max-w-md rounded-3xl border border-white/12 p-7 sm:p-9"
        style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
      >
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-900/30">
            <Camera className="text-neutral-900" size={26} />
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-white tracking-tight">Fotuber Stüdyo Paneli</h1>
          <p className="mt-1 text-sm text-white/55">Vesikalık · Etkinlik Galerisi · Tasarım — tek panelde</p>
        </div>

        {/* mode switch */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/5 mb-6">
          {["login", "register"].map((m) => (
            <button key={m} data-testid={`studio-tab-${m}`} onClick={() => setMode(m)}
              className={`h-9 rounded-lg text-sm font-medium transition-colors ${
                mode === m ? "bg-white text-neutral-900" : "text-white/60 hover:text-white"}`}>
              {m === "login" ? "Giriş Yap" : "Kayıt Ol"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} noValidate className="space-y-3.5">
          {mode === "register" && (
            <Field icon={Building2}>
              <Input data-testid="studio-firma" placeholder="Firma / Stüdyo adı" value={form.firma_adi}
                onChange={(e) => upd("firma_adi", e.target.value)} required className="pl-10 h-11 bg-white/5 border-white/15 text-white placeholder:text-white/40" />
            </Field>
          )}
          <Field icon={Mail}>
            <Input data-testid="studio-email" type={mode === "register" ? "email" : "text"}
              placeholder={mode === "register" ? "E-posta" : "E-posta veya kullanıcı adı"} value={form.email}
              onChange={(e) => upd("email", e.target.value)} required className="pl-10 h-11 bg-white/5 border-white/15 text-white placeholder:text-white/40" />
          </Field>
          <Field icon={Lock}>
            <Input data-testid="studio-password" type={showPw ? "text" : "password"} placeholder="Şifre" value={form.password}
              onChange={(e) => upd("password", e.target.value)} required className="pl-10 pr-10 h-11 bg-white/5 border-white/15 text-white placeholder:text-white/40" />
            <button type="button" onClick={() => setShowPw((s) => !s)} data-testid="studio-toggle-pw"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white">
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </Field>
          {mode === "register" && (
            <>
              <Field icon={Phone}>
                <Input data-testid="studio-phone" placeholder="Telefon (opsiyonel)" value={form.phone}
                  onChange={(e) => upd("phone", e.target.value)} className="pl-10 h-11 bg-white/5 border-white/15 text-white placeholder:text-white/40" />
              </Field>
              <label className="flex items-start gap-2 text-xs text-white/60 leading-relaxed">
                <input data-testid="studio-kvkk" type="checkbox" checked={form.kvkk} onChange={(e) => upd("kvkk", e.target.checked)} className="mt-0.5" />
                KVKK aydınlatma metnini ve kullanım koşullarını okudum, onaylıyorum. 3 günlük ücretsiz deneme başlatılacak.
              </label>
            </>
          )}
          <Button data-testid="studio-submit" type="submit" disabled={busy}
            className="w-full h-11 gap-2 bg-gradient-to-r from-amber-400 to-amber-600 text-neutral-900 font-semibold hover:from-amber-300 hover:to-amber-500">
            {busy ? "..." : mode === "login" ? "Panele Giriş" : "3 Gün Ücretsiz Başla"} <ArrowRight size={18} />
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
