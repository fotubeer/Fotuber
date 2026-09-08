import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Toaster, toast } from "sonner";
import { Loader2, Lock, Eye, EyeOff, Heart, ShieldCheck, CheckCircle2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (pw.length < 6) { toast.error("Şifre en az 6 karakter olmalı"); return; }
    if (pw !== pw2) { toast.error("Şifreler eşleşmiyor"); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API}/member/reset-password`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: pw }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Bağlantı geçersiz");
      setDone(true);
      setTimeout(() => navigate("/davetiyelerim"), 2200);
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-[#0b0b12] text-white px-5" data-testid="reset-password-page">
      <Toaster position="top-center" richColors />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(70% 60% at 80% 0%, rgba(99,102,241,0.18), transparent 60%)" }} />
      <div className="relative w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-6">
          <span className="w-9 h-9 rounded-xl bg-white/10 grid place-items-center border border-white/15"><Heart className="w-4 h-4 text-rose-300" fill="currentColor" /></span>
          <span className="text-lg font-serif">fotuber</span>
        </div>

        {!token ? (
          <div className="text-center bg-white/5 border border-white/10 rounded-2xl p-6" data-testid="reset-no-token">
            <ShieldCheck className="w-8 h-8 text-white/30 mx-auto mb-3" />
            <h1 className="text-xl font-bold mb-1">Geçersiz bağlantı</h1>
            <p className="text-sm text-white/50 mb-5">Bağlantı eksik veya hatalı. Lütfen şifre sıfırlamayı yeniden başlatın.</p>
            <Link to="/davetiyelerim"><Button className="w-full bg-indigo-600 hover:bg-indigo-500">Girişe Dön</Button></Link>
          </div>
        ) : done ? (
          <div className="text-center bg-white/5 border border-white/10 rounded-2xl p-6" data-testid="reset-done">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
            <h1 className="text-xl font-bold mb-1">Şifreniz güncellendi</h1>
            <p className="text-sm text-white/50">Panele yönlendiriliyorsunuz…</p>
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-bold mb-1 text-center">Yeni şifre belirleyin</h1>
            <p className="text-sm text-white/50 mb-6 text-center">Davetiye panelinize erişmek için yeni bir şifre oluşturun.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-white/50 mb-1 block">Yeni şifre</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()} data-testid="reset-pw" placeholder="En az 6 karakter"
                    className="pl-9 pr-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 h-11" />
                  <button type="button" onClick={() => setShow((v) => !v)} data-testid="reset-toggle"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70">
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-white/50 mb-1 block">Yeni şifre (tekrar)</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input type={show ? "text" : "password"} value={pw2} onChange={(e) => setPw2(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()} data-testid="reset-pw2" placeholder="Şifreyi tekrar girin"
                    className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 h-11" />
                </div>
              </div>
            </div>
            <Button onClick={submit} disabled={busy} data-testid="reset-submit"
              className="w-full mt-5 h-11 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 font-semibold">
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Şifreyi Güncelle
            </Button>
            <Link to="/davetiyelerim" className="block text-center text-xs text-white/40 hover:text-white/70 mt-4">← Girişe dön</Link>
          </div>
        )}
      </div>
    </div>
  );
}
