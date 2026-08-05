import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, LogOut, ShieldCheck, Sparkles, Camera, KeyRound, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AdminPassportPhoto from "@/pages/admin/AdminPassportPhoto";

const API = process.env.REACT_APP_BACKEND_URL;

const api = (path, opts = {}) =>
  fetch(`${API}/api${path}`, { credentials: "include", ...opts });

export default function MemberVesikalik() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null); // { user, membership }
  const [tab, setTab] = useState("login");
  const [busy, setBusy] = useState(false);
  const [payWait, setPayWait] = useState(null); // { link, cid } while a payment is in progress
  const [form, setForm] = useState({ email: "", password: "", full_name: "", phone: "", company_name: "" });

  const fetchMe = useCallback(async () => {
    try {
      const res = await api("/member/me");
      if (res.ok) {
        const d = await res.json();
        if (d.user?.role === "member") { setMe(d); return; }
      }
      setMe(null);
    } catch (e) { setMe(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const upd = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submitAuth = async () => {
    const isReg = tab === "register";
    if (!form.email || !form.password) { toast.error("E-posta ve şifre gerekli"); return; }
    if (isReg && (!form.full_name || !form.phone)) { toast.error("Ad Soyad ve telefon gerekli"); return; }
    setBusy(true);
    try {
      const body = isReg
        ? { email: form.email, password: form.password, full_name: form.full_name, phone: form.phone, company_name: form.company_name }
        : { email: form.email, password: form.password };
      const res = await api(isReg ? "/member/register" : "/member/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.detail || "İşlem başarısız");
      setMe({ user: d.user, membership: d.membership });
      toast.success(isReg ? "Üyelik oluşturuldu — ilk ay ücretsiz!" : "Giriş başarılı");
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const pollPayment = useCallback((cid) => {
    let tries = 0;
    const iv = setInterval(async () => {
      tries++;
      try {
        const r = await api(`/payments/status/${cid}`);
        if (r.ok) {
          const s = await r.json();
          if (s.status === "paid") {
            clearInterval(iv);
            setPayWait(null);
            setMe((m) => ({ ...m, membership: s.membership }));
            toast.success("Ödeme başarılı — üyeliğiniz etkinleşti!");
          }
        }
      } catch (e) { /* keep polling */ }
      if (tries > 160) { clearInterval(iv); } // ~8 dk sonra durur
    }, 3000);
  }, []);

  const subscribe = async () => {
    setBusy(true);
    try {
      const res = await api("/payments/paytr/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "subscription", origin_url: window.location.origin }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.detail || "Ödeme başlatılamadı");
      const win = window.open(d.link, "_blank");
      if (!win) toast.error("Açılır pencere engellendi — aşağıdaki butondan ödeme sayfasını açın");
      setPayWait({ link: d.link, cid: d.callback_id });
      toast.info("Ödeme sayfası açıldı. Ödeme tamamlanınca üyeliğiniz otomatik etkinleşecek.");
      pollPayment(d.callback_id);
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    try { await api("/auth/logout", { method: "POST" }); } catch (e) { /* ignore */ }
    setMe(null);
    setForm({ email: "", password: "", full_name: "", phone: "", company_name: "" });
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-300">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  // Active member → render the editor with a floating membership badge.
  if (me && me.membership?.active) {
    const mem = me.membership;
    return (
      <div className="relative">
        <div className="fixed top-3 left-3 z-[60] flex items-center gap-2 rounded-full bg-white/90 backdrop-blur border border-slate-200 shadow px-3 py-1.5 text-xs" data-testid="member-bar">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span className="font-semibold text-slate-700">{me.user.company_name || me.user.name}</span>
          <span className={`px-2 py-0.5 rounded-full ${mem.status === "trial" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`} data-testid="member-status">
            {mem.status === "trial" ? "Deneme" : "Aktif"} · {String(mem.until).slice(0, 10)}
          </span>
          <button onClick={logout} className="ml-1 text-slate-500 hover:text-red-600" data-testid="member-logout" title="Çıkış">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <AdminPassportPhoto />
      </div>
    );
  }

  // Logged in but membership expired → subscription gate.
  if (me && !me.membership?.active) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-100 p-6">
        <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center" data-testid="subscribe-gate">
          <CreditCard className="w-10 h-10 mx-auto text-indigo-400" />
          <h1 className="text-2xl font-bold mt-4">Üyeliğiniz sona erdi</h1>
          <p className="text-slate-400 text-sm mt-2">
            Vesikalık aracını kullanmaya devam etmek için aboneliğinizi yenileyin.
          </p>
          <div className="my-6 rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-4">
            <div className="text-3xl font-extrabold">{me.membership.price}₺<span className="text-base font-medium text-slate-400">/ay</span></div>
            <div className="text-xs text-slate-400 mt-1">İlk ay ücretsiz — sonrasında aylık {me.membership.price}₺</div>
          </div>
          {payWait ? (
            <div className="space-y-3" data-testid="pay-waiting">
              <div className="flex items-center justify-center gap-2 text-sm text-indigo-300">
                <Loader2 className="w-4 h-4 animate-spin" /> Ödeme bekleniyor…
              </div>
              <p className="text-xs text-slate-400">Ödeme sayfası yeni sekmede açıldı. Tamamladığınızda üyeliğiniz otomatik etkinleşir.</p>
              <a href={payWait.link} target="_blank" rel="noreferrer" className="block">
                <Button variant="outline" className="w-full border-indigo-400 text-indigo-200 hover:bg-indigo-500/10" data-testid="pay-reopen-btn">Ödeme sayfasını tekrar aç</Button>
              </a>
              <button onClick={() => setPayWait(null)} className="text-xs text-slate-500 hover:text-slate-300" data-testid="pay-cancel-btn">İptal</button>
            </div>
          ) : (
            <Button onClick={subscribe} disabled={busy} className="w-full bg-indigo-600 hover:bg-indigo-700" data-testid="subscribe-btn">
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Abone Ol · {me.membership.price}₺/ay
            </Button>
          )}
          <button onClick={logout} className="mt-4 text-xs text-slate-500 hover:text-slate-300" data-testid="gate-logout">Çıkış yap</button>
        </div>
      </div>
    );
  }

  // Not logged in → auth (login / register).
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-950 text-slate-100">
      <div className="hidden lg:flex flex-col justify-center px-14 bg-gradient-to-br from-indigo-700 to-slate-900">
        <Camera className="w-12 h-12 text-white/90" />
        <h2 className="text-4xl font-black mt-6 leading-tight">Fotuber Vesikalık<br />Firma Paneli</h2>
        <p className="text-white/70 mt-4 max-w-sm">
          Biyometrik vesikalık üretimi, AI kıyafet & renk değiştirme, baskıya hazır şablon.
          Firmanız için ilk ay <b>ücretsiz</b>, sonrasında aylık 80₺.
        </p>
        <ul className="mt-6 space-y-2 text-white/80 text-sm">
          <li className="flex items-center gap-2"><Sparkles className="w-4 h-4" /> AI kıyafet/renk (kendi Gemini anahtarınız veya kredi)</li>
          <li className="flex items-center gap-2"><KeyRound className="w-4 h-4" /> Kendi Gemini hesabınızı bağlayın</li>
          <li className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Otomatik yüz tespiti & arka plan temizleme</li>
        </ul>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm" data-testid="member-auth">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-800 rounded-lg text-sm mb-6">
            <button onClick={() => setTab("login")} className={`py-2 rounded-md ${tab === "login" ? "bg-white text-slate-900 font-semibold" : "text-slate-300"}`} data-testid="tab-login">Giriş Yap</button>
            <button onClick={() => setTab("register")} className={`py-2 rounded-md ${tab === "register" ? "bg-white text-slate-900 font-semibold" : "text-slate-300"}`} data-testid="tab-register">Üye Ol</button>
          </div>

          <div className="space-y-3">
            {tab === "register" && (
              <>
                <div>
                  <Label className="text-xs text-slate-400">Ad Soyad</Label>
                  <Input value={form.full_name} onChange={upd("full_name")} className="bg-slate-900 border-slate-700" data-testid="reg-name" />
                </div>
                <div>
                  <Label className="text-xs text-slate-400">Telefon</Label>
                  <Input value={form.phone} onChange={upd("phone")} placeholder="05xx xxx xx xx" className="bg-slate-900 border-slate-700" data-testid="reg-phone" />
                </div>
                <div>
                  <Label className="text-xs text-slate-400">Firma Adı <span className="text-slate-600">(şahıs kullanımı için zorunlu değil)</span></Label>
                  <Input value={form.company_name} onChange={upd("company_name")} className="bg-slate-900 border-slate-700" data-testid="reg-company" />
                </div>
              </>
            )}
            <div>
              <Label className="text-xs text-slate-400">E-posta</Label>
              <Input type="email" value={form.email} onChange={upd("email")} className="bg-slate-900 border-slate-700" data-testid="auth-email" />
            </div>
            <div>
              <Label className="text-xs text-slate-400">Şifre</Label>
              <Input type="password" value={form.password} onChange={upd("password")} className="bg-slate-900 border-slate-700" data-testid="auth-password" />
            </div>
            <Button onClick={submitAuth} disabled={busy} className="w-full bg-indigo-600 hover:bg-indigo-700" data-testid="auth-submit">
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {tab === "register" ? "Üye Ol (İlk ay ücretsiz)" : "Giriş Yap"}
            </Button>
            <p className="text-[11px] text-slate-500 text-center">
              Admin/personel misiniz? <a href="/personel-girisi" className="text-indigo-400 underline">Personel girişi</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
