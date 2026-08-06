import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast, Toaster } from "sonner";
import { Html5Qrcode } from "html5-qrcode";
import { Loader2, Camera, CameraOff, CheckCircle2, XCircle, UserCheck, ArrowLeft, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API = process.env.REACT_APP_BACKEND_URL;
const api = (path, opts = {}) => fetch(`${API}/api${path}`, { credentials: "include", ...opts });

const extractToken = (text) => {
  const m = String(text || "").match(/gecis\/([a-zA-Z0-9]+)/);
  if (m) return m[1];
  return String(text || "").trim();
};

// Host door check-in scanner. Owner opens the phone camera at the entrance,
// scans each guest's QR pass, and marks them arrived. Live counters.
export default function CheckinScanner() {
  const { iid } = useParams();
  const [authed, setAuthed] = useState(null); // null=loading, false=login, true
  const [auth, setAuth] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [inv, setInv] = useState(null);
  const [stats, setStats] = useState({ checked_in: 0, attending: 0 });
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [manual, setManual] = useState("");
  const scannerRef = useRef(null);
  const lastRef = useRef({ token: "", t: 0 });

  const loadReport = useCallback(async () => {
    const r = await api(`/invitations/${iid}/report`);
    if (r.status === 401 || r.status === 403) { setAuthed(false); return false; }
    if (r.ok) {
      const d = await r.json();
      setInv(d.invitation);
      setStats({ checked_in: d.stats.checked_in || 0, attending: d.stats.attending || 0 });
      setAuthed(true);
      return true;
    }
    setAuthed(false);
    return false;
  }, [iid]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const login = async () => {
    setBusy(true);
    try {
      const r = await api("/member/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(auth) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Giriş başarısız");
      await loadReport();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const doCheckin = useCallback(async (token) => {
    if (!token) return;
    const now = Date.now();
    if (token === lastRef.current.token && now - lastRef.current.t < 3500) return;
    lastRef.current = { token, t: now };
    try {
      const r = await api(`/invitations/checkin/${token}`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Geçersiz kod");
      setResult({ ok: true, already: d.already, name: `${d.name || ""} ${d.surname || ""}`.trim(), guest_count: d.guest_count });
      if (!d.already) setStats((s) => ({ ...s, checked_in: s.checked_in + 1 }));
    } catch (e) { setResult({ ok: false, msg: e.message }); }
  }, []);

  const startScan = async () => {
    try {
      const inst = new Html5Qrcode("qr-reader");
      scannerRef.current = inst;
      await inst.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 240, height: 240 } },
        (text) => doCheckin(extractToken(text)), () => {});
      setScanning(true);
    } catch (e) { toast.error("Kamera başlatılamadı. İzin verin veya elle kod girin."); }
  };

  const stopScan = useCallback(async () => {
    try { await scannerRef.current?.stop(); await scannerRef.current?.clear(); } catch (e) { /* noop */ }
    scannerRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => () => { stopScan(); }, [stopScan]);

  if (authed === null) return <div className="min-h-screen grid place-items-center bg-slate-950 text-white"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  if (authed === false) return (
    <div className="min-h-screen grid place-items-center bg-slate-950 text-white px-4">
      <Toaster position="top-center" richColors />
      <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
        <h1 className="text-xl font-bold mb-1">Kapıda Karşılama</h1>
        <p className="text-sm text-slate-400 mb-4">Bu davetiyenin sahibi olarak giriş yapın.</p>
        <div className="space-y-2 text-left">
          <Input type="email" placeholder="E-posta" value={auth.email} onChange={(e) => setAuth({ ...auth, email: e.target.value })} data-testid="scan-email" />
          <Input type="password" placeholder="Şifre" value={auth.password} onChange={(e) => setAuth({ ...auth, password: e.target.value })} data-testid="scan-password" />
        </div>
        <Button onClick={login} disabled={busy} className="w-full mt-3 bg-indigo-600 hover:bg-indigo-700" data-testid="scan-login">
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Giriş Yap
        </Button>
      </div>
    </div>
  );

  const names = inv ? (inv.person2 ? `${inv.person1} & ${inv.person2}` : inv.person1) : "";

  return (
    <div className="min-h-screen bg-slate-950 text-white" data-testid="checkin-scanner">
      <Toaster position="top-center" richColors />
      <div className="max-w-md mx-auto px-4 py-6">
        <Link to="/davetiyelerim" className="text-sm text-slate-400 flex items-center gap-1 mb-3"><ArrowLeft className="w-4 h-4" /> Davetiyelerim</Link>
        <div className="text-center mb-4">
          <div className="text-[#e9c96e]" style={{ fontFamily: "'Great Vibes', cursive", fontSize: "1.8rem" }}>{names}</div>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Kapıda Karşılama</div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-3 text-center">
            <div className="text-2xl font-bold text-emerald-400" data-testid="scan-checked-count">{stats.checked_in}</div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wide">Giriş Yaptı</div>
          </div>
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-3 text-center">
            <div className="text-2xl font-bold">{stats.attending}</div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wide">Beklenen (Geliyor)</div>
          </div>
        </div>

        <div id="qr-reader" className="rounded-2xl overflow-hidden bg-black mb-3 min-h-[60px]" />

        {!scanning ? (
          <Button onClick={startScan} className="w-full bg-emerald-600 hover:bg-emerald-700 h-12" data-testid="scan-start">
            <Camera className="w-5 h-5 mr-2" /> Kamerayı Aç & Tara
          </Button>
        ) : (
          <Button onClick={stopScan} variant="outline" className="w-full h-12 border-slate-700 text-white hover:bg-slate-800" data-testid="scan-stop">
            <CameraOff className="w-5 h-5 mr-2" /> Taramayı Durdur
          </Button>
        )}

        {/* Result banner */}
        {result && (
          <div className={`mt-4 rounded-2xl p-5 text-center ${result.ok ? (result.already ? "bg-amber-500/15 border border-amber-500/40" : "bg-emerald-500/15 border border-emerald-500/40") : "bg-rose-500/15 border border-rose-500/40"}`} data-testid="scan-result">
            {result.ok ? (
              <>
                {result.already
                  ? <UserCheck className="w-10 h-10 mx-auto text-amber-400" />
                  : <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400" />}
                <div className="text-lg font-bold mt-2">{result.name || "Misafir"}</div>
                <div className="text-sm text-slate-300">
                  {result.already ? "Zaten giriş yapmış" : "Hoş geldiniz! Giriş alındı"}
                  {result.guest_count > 1 ? ` · ${result.guest_count} kişi` : ""}
                </div>
              </>
            ) : (
              <><XCircle className="w-10 h-10 mx-auto text-rose-400" /><div className="text-sm mt-2 text-rose-200">{result.msg}</div></>
            )}
          </div>
        )}

        {/* Manual fallback */}
        <div className="mt-6 flex items-center gap-2">
          <Input placeholder="Kod ile giriş (elle)" value={manual} onChange={(e) => setManual(e.target.value)} className="bg-slate-900 border-slate-700 text-white" data-testid="scan-manual-input" />
          <Button onClick={() => { doCheckin(extractToken(manual)); setManual(""); }} variant="outline" className="border-slate-700 text-white hover:bg-slate-800" data-testid="scan-manual-submit"><ScanLine className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  );
}
