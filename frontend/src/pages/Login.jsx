import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Camera } from "lucide-react";

const Login = () => {
  const { login } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await login(email, password);
      if (u.role === "admin") { toast.info("Yönetici olarak giriş yaptınız."); nav("/admin/dashboard"); }
      else { toast.success("Giriş başarılı"); nav(from); }
    } catch (err) {
      toast.error(formatApiError(err, "Giriş yapılamadı"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 justify-center mb-8">
          <span className="w-10 h-10 rounded-full border border-[#d4af37] flex items-center justify-center">
            <Camera className="w-4 h-4 text-[#d4af37]" strokeWidth={1.5} />
          </span>
          <span className="font-serif text-3xl">fotuber</span>
        </div>
        <div className="glass rounded-2xl p-8">
          <h1 className="font-serif text-3xl mb-1">Giriş Yap</h1>
          <p className="text-sm text-neutral-400 mb-6">Randevularınıza erişmek için giriş yapın.</p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label className="text-neutral-400 text-xs">E-posta</Label>
              <Input data-testid="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="bg-neutral-950 border-neutral-800 text-neutral-100 mt-1" required />
            </div>
            <div>
              <Label className="text-neutral-400 text-xs">Şifre</Label>
              <Input data-testid="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="bg-neutral-950 border-neutral-800 text-neutral-100 mt-1" required />
            </div>
            <Button data-testid="login-submit-btn" type="submit" disabled={busy} className="w-full rounded-full bg-[#d4af37] text-black hover:bg-[#b5952f] h-11">
              {busy ? "Giriş yapılıyor..." : "Giriş Yap"}
            </Button>
          </form>
          <div className="mt-6 text-sm text-neutral-400 text-center">
            Hesabınız yok mu? <Link to="/kayit" data-testid="link-to-register" className="text-[#d4af37] link-underline">Kayıt olun</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
