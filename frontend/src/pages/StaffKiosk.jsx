import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_BASE, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Search, LogOut, MapPin, Delete, UserSquare2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SYMBOL_MAP, isTable } from "@/lib/venueSymbols";

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
    } catch (e2) { const m = formatApiError(e2); setErr(m); setLogin((l) => ({ ...l, pin: "" })); toast.error(m); }
  };
  const logout = () => { localStorage.removeItem(KEY); setMe(null); setPlan(null); };
  const openPlan = async (pid) => { const { data } = await staffApi.get(`/venue/staff/floorplans/${pid}`); setPlan(data.plan); setResults([]); setQ(""); setHit(null); };

  const search = async (val) => {
    setQ(val);
    if (!plan || val.trim().length < 2) { setResults([]); return; }
    try { const { data } = await staffApi.get(`/venue/staff/floorplans/${plan.id}/find`, { params: { q: val } }); setResults(data.results || []); }
    catch { setResults([]); }
  };
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
        <button onClick={logout} className="text-white/60 hover:text-white ml-2" data-testid="kiosk-logout"><LogOut size={18} /></button>
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
      </div>

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
