import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_BASE, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Search, LogOut, MapPin, Delete, UserSquare2, Bell, Clock, X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SYMBOL_MAP, isTable } from "@/lib/venueSymbols";
import VenueChat from "@/components/VenueChat";

const KEY = "fotuber_venue_staff_token";
const staffApi = axios.create({ baseURL: API_BASE, withCredentials: true });
staffApi.interceptors.request.use((c) => { const t = localStorage.getItem(KEY); if (t) c.headers.Authorization = `Bearer ${t}`; return c; });

export default function StaffKiosk() {
  const [me, setMe] = useState(null);
  const [checking, setChecking] = useState(true);
  const [login, setLogin] = useState({ kiosk_code: "", pin: "" });
  const [plans, setPlans] = useState([]);
  const [plan, setPlan] = useState(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [hit, setHit] = useState(null);
  const [err, setErr] = useState("");
  const [alert, setAlert] = useState(null);
  const alerted = useRef(new Set());
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    staffApi.get("/venue/staff/me").then(({ data }) => setMe(data.staff)).catch(() => {}).finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    if (!me) return;
    staffApi.get("/venue/staff/floorplans").then(({ data }) => { setPlans(data.plans || []); if (data.plans?.[0]) openPlan(data.plans[0].id); }).catch(() => {});
    // eslint-disable-next-line
  }, [me]);

  const doLogin = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      const { data } = await staffApi.post("/venue/staff/login", { kiosk_code: login.kiosk_code.trim().toUpperCase(), pin: login.pin.trim() });
      localStorage.setItem(KEY, data.token); setMe(data.staff); toast.success(`Hoş geldin ${data.staff.name}`);
      try { if (Notification && Notification.permission === "default") Notification.requestPermission(); } catch { /* ignore */ }
    } catch (e2) { const m = formatApiError(e2); setErr(m); setLogin((l) => ({ ...l, pin: "" })); toast.error(m); }
  };
  const logout = () => { localStorage.removeItem(KEY); setMe(null); setPlan(null); };
  const openPlan = async (pid) => { const { data } = await staffApi.get(`/venue/staff/floorplans/${pid}`); setPlan(data.plan); setResults([]); setQ(""); setHit(null); alerted.current = new Set(); };

  const search = async (val) => {
    setQ(val);
    if (!plan || val.trim().length < 2) { setResults([]); return; }
    try { const { data } = await staffApi.get(`/venue/floorplans/${plan.id}/find`, { params: { q: val } }); setResults(data.results || []); }
    catch { setResults([]); }
  };

  // Run-of-show alert engine (polling + sound + popup + browser notification).
  const beep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.type = "sine"; o.frequency.value = 880;
      g.gain.setValueAtTime(0.001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
      o.start(); o.stop(ctx.currentTime + 0.95);
    } catch { /* ignore */ }
  };
  const fireAlert = (it, diff) => {
    setAlert({ ...it, diff }); beep();
    try { if (Notification && Notification.permission === "granted") new Notification("⚠️ Akış Uyarısı", { body: `${diff <= 0 ? "ŞİMDİ" : diff + " dk içinde"}: ${it.title}` }); } catch { /* ignore */ }
  };
  useEffect(() => {
    if (!plan || !me) return;
    const check = () => {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      (plan.timeline || []).forEach((it) => {
        if (!it.time) return;
        const [h, m] = it.time.split(":").map(Number);
        const diff = (h * 60 + m) - nowMin;
        const roles = it.roles || [];
        const forMe = roles.length === 0 || roles.includes(me.job_role);
        if (forMe && diff >= 0 && diff <= 5 && !alerted.current.has(it.id)) { alerted.current.add(it.id); fireAlert(it, diff); }
      });
    };
    check();
    const iv = setInterval(check, 20000);
    return () => clearInterval(iv);
    // eslint-disable-next-line
  }, [plan, me]);
  const pad = (k) => setLogin((l) => ({ ...l, pin: (l.pin + k).slice(0, 6) }));

  if (checking) return <div className="min-h-screen grid place-items-center bg-slate-950 text-white">…</div>;

  if (!me) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-slate-950 to-indigo-950 text-white p-4" data-testid="kiosk-login">
        <form onSubmit={doLogin} className="w-full max-w-xs bg-white/[0.04] border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="text-center"><UserSquare2 className="mx-auto text-amber-300" size={34} /><h1 className="text-xl font-bold mt-2">Personel Kiosk</h1><p className="text-xs text-white/50">Salon kodu + PIN ile giriş</p></div>
          <input value={login.kiosk_code} onChange={(e) => setLogin({ ...login, kiosk_code: e.target.value })} placeholder="SALON KODU" data-testid="kiosk-code"
            className="w-full text-center tracking-[0.3em] uppercase rounded-lg bg-white/10 border border-white/15 px-3 py-3 outline-none focus:border-amber-400" />
          <input value={login.pin} readOnly placeholder="PIN" data-testid="kiosk-pin"
            className="w-full text-center tracking-[0.6em] text-2xl rounded-lg bg-white/10 border border-white/15 px-3 py-3 outline-none" />
          {err && <div className="text-center text-sm text-red-300 bg-red-500/10 border border-red-400/30 rounded-lg py-2" data-testid="kiosk-error">{err}</div>}
          <div className="grid grid-cols-3 gap-2">
            {[1,2,3,4,5,6,7,8,9].map((n) => <button type="button" key={n} onClick={() => pad(String(n))} className="py-3 rounded-lg bg-white/10 hover:bg-white/20 text-lg" data-testid={`kiosk-key-${n}`}>{n}</button>)}
            <button type="button" onClick={() => setLogin((l) => ({ ...l, pin: "" }))} className="py-3 rounded-lg bg-white/5"><Delete size={18} className="mx-auto" /></button>
            <button type="button" onClick={() => pad("0")} className="py-3 rounded-lg bg-white/10 hover:bg-white/20 text-lg">0</button>
            <button type="submit" data-testid="kiosk-login-btn" className="py-3 rounded-lg bg-amber-500 text-black font-semibold">Giriş</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col" data-testid="kiosk-home">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-slate-900/70">
        <UserSquare2 className="text-amber-300" size={20} />
        <div className="min-w-0"><div className="font-semibold truncate">{me.name}</div><div className="text-[11px] text-white/50">{me.venue_name}</div></div>
        <select value={plan?.id || ""} onChange={(e) => openPlan(e.target.value)} className="ml-auto rounded-lg bg-white/10 border border-white/15 px-2 py-1.5 text-sm" data-testid="kiosk-plan-select">
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={() => setChatOpen((o) => !o)} className="ml-2 relative text-white/60 hover:text-white" data-testid="kiosk-chat-toggle"><MessageSquare size={19} /></button>
        <button onClick={logout} className="text-white/60 hover:text-white ml-3" data-testid="kiosk-logout"><LogOut size={18} /></button>
      </div>

      <div className="p-4 max-w-xl w-full mx-auto">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
          <input value={q} onChange={(e) => search(e.target.value)} placeholder="Davetli adı ara (Hostes Modu)…" data-testid="kiosk-search"
            className="w-full rounded-xl bg-white/[0.06] border border-white/15 pl-10 pr-3 py-3 outline-none focus:border-amber-400 text-lg" />
        </div>
        <div className="mt-3 space-y-2">
          {results.map((r, i) => (
            <button key={i} onClick={() => setHit(r.element_id)} data-testid={`kiosk-result-${i}`}
              className="w-full flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-400/30 px-4 py-3 text-left hover:bg-emerald-500/20">
              <span className="font-medium">{r.guest}</span>
              <span className="flex items-center gap-1 text-emerald-200 text-sm"><MapPin size={15} /> {r.table_label}</span>
            </button>
          ))}
          {q.length >= 2 && results.length === 0 && <p className="text-center text-white/40 text-sm py-4">Bu isimde yerleştirilmiş davetli bulunamadı.</p>}
        </div>

        {/* Run of show timeline */}
        {(plan?.timeline || []).length > 0 && (
          <div className="mt-5" data-testid="kiosk-timeline">
            <div className="text-xs uppercase tracking-wider text-white/40 mb-2 flex items-center gap-1.5"><Clock size={13} /> Akış Programı</div>
            <div className="space-y-1.5">
              {(plan.timeline || []).slice().sort((a, b) => (a.time || "").localeCompare(b.time || "")).map((it) => {
                const mine = (it.roles || []).length === 0 || (it.roles || []).includes(me.job_role);
                return (
                  <div key={it.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 border ${mine ? "bg-amber-500/10 border-amber-400/25" : "bg-white/[0.03] border-white/10"}`}>
                    <span className="font-mono text-sm text-amber-200">{it.time}</span>
                    <span className="flex-1 text-sm">{it.title || "—"}</span>
                    {mine && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/25 text-amber-100">Görevin</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Chat drawer */}
      {chatOpen && (
        <div className="fixed inset-0 z-[80] flex justify-end" data-testid="kiosk-chat-drawer">
          <div className="flex-1 bg-black/40" onClick={() => setChatOpen(false)} />
          <div className="w-full max-w-md bg-slate-900 border-l border-white/10 p-4 flex flex-col">
            <div className="flex justify-end mb-1"><button onClick={() => setChatOpen(false)} className="text-white/50"><X size={18} /></button></div>
            <VenueChat client={staffApi} base="/venue/staff" isManager={false} className="flex-1" />
          </div>
        </div>
      )}

      {/* Alert popup */}
      {alert && (
        <div className="fixed inset-0 z-[90] bg-red-950/80 backdrop-blur grid place-items-center p-6" data-testid="kiosk-alert" onClick={() => setAlert(null)}>
          <div className="max-w-sm w-full text-center rounded-3xl bg-slate-900 border-2 border-amber-400 p-8 animate-pulse">
            <Bell className="mx-auto text-amber-300 mb-3" size={48} />
            <div className="text-amber-300 font-bold text-sm tracking-widest">⚠️ AKIŞ UYARISI</div>
            <div className="text-3xl font-black my-3">{alert.title}</div>
            <div className="text-lg text-white/80">{alert.diff <= 0 ? "ŞİMDİ BAŞLIYOR" : `${alert.diff} dakika içinde`} · saat {alert.time}</div>
            {alert.note && <div className="text-sm text-white/50 mt-2">{alert.note}</div>}
            <button onClick={() => setAlert(null)} className="mt-6 w-full py-3 rounded-xl bg-amber-500 text-black font-semibold" data-testid="kiosk-alert-ack">Anladım, Yerimi Alıyorum</button>
          </div>
        </div>
      )}

      {/* Read-only mini plan with highlight */}
      {plan && (
        <div className="flex-1 overflow-auto p-4">
          <div className="relative mx-auto rounded-xl border border-white/10" style={{ width: 960, height: 640, maxWidth: "100%", background: plan.area_type === "garden" ? "linear-gradient(#14321f,#0d2417)" : "linear-gradient(#1e293b,#0f172a)" }} data-testid="kiosk-plan">
            {(plan.elements || []).map((el) => {
              const s = SYMBOL_MAP[el.type] || {};
              const isHit = el.elId === hit;
              return (
                <div key={el.elId} className="absolute grid place-items-center" style={{ left: el.left, top: el.top, width: el.w, height: el.h, transform: `rotate(${el.rot}deg)`,
                  background: s.fill, borderRadius: s.shape === "circle" ? "9999px" : "8px",
                  boxShadow: isHit ? "0 0 0 4px #fbbf24, 0 0 30px #fbbf24" : "0 3px 8px rgba(0,0,0,.4)", zIndex: isHit ? 30 : 10,
                  animation: isHit ? "pulse 1s infinite" : "none" }}>
                  <span className="text-[9px] text-white/90 text-center leading-none px-1"><span className="block text-xs">{s.emoji}</span>{el.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
