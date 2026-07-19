import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

const StaffLogin = () => {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await login(email, password);
      if (u.role !== "admin" && u.role !== "staff") {
        toast.error("Bu alan yalnızca personel içindir.");
        setBusy(false);
        return;
      }
      toast.success(u.role === "admin" ? "Yönetim paneline hoşgeldiniz." : "Personel paneline hoşgeldiniz.");
      nav(u.role === "admin" ? "/admin/dashboard" : "/personel/gunluk");
    } catch (err) {
      toast.error(formatApiError(err, "Giriş yapılamadı"));
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 border border-neutral-800 rounded-full px-4 py-2 text-xs text-neutral-400">
            <ShieldCheck className="w-3.5 h-3.5 text-[#d4af37]" /> Personel Erişim Alanı
          </div>
        </div>
        <div className="glass rounded-2xl p-8">
          <h1 className="font-serif text-3xl mb-2">Personel Girişi</h1>
          <p className="text-sm text-neutral-400 mb-8">Yetkili personel için özel giriş alanı.</p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label className="text-neutral-400 text-xs">Personel E-postası</Label>
              <Input data-testid="staff-login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="bg-neutral-950 border-neutral-800 text-neutral-100 mt-1" placeholder="admin@fotuber.com.tr" required />
            </div>
            <div>
              <Label className="text-neutral-400 text-xs">Şifre</Label>
              <Input data-testid="staff-login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="bg-neutral-950 border-neutral-800 text-neutral-100 mt-1" required />
            </div>
            <Button data-testid="staff-login-submit" type="submit" disabled={busy} className="w-full rounded-full bg-[#d4af37] text-black hover:bg-[#b5952f] h-11">
              {busy ? "Doğrulanıyor..." : "Panele Gir"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StaffLogin;
