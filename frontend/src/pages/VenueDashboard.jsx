import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  LogOut, Plus, Copy, Trash2, Ticket, CheckCircle2, Clock, MessageCircle, Gift, Percent, Landmark,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { venueApi, clearVenueToken } from "@/lib/venueApi";
import { formatApiError } from "@/lib/api";

const INVITE_URL = (typeof window !== "undefined") ? window.location.origin : "";
const fmtDate = (iso) => { if (!iso) return "—"; try { return new Date(iso).toLocaleDateString("tr-TR"); } catch { return "—"; } };

export default function VenueDashboard() {
  const navigate = useNavigate();
  const [acc, setAcc] = useState(null);
  const [codes, setCodes] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ count: 1, code_type: "free", discount_percent: 20, couple_name: "", note: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([
        venueApi.get("/venue/codes"),
        venueApi.get("/venue/stats"),
      ]);
      setCodes(c.data?.codes || []);
      setStats(s.data);
    } catch (e) {
      if (e?.response?.status === 401) navigate("/salon");
    }
  }, [navigate]);

  useEffect(() => {
    venueApi.get("/venue/me")
      .then((r) => { setAcc(r.data?.account); return load(); })
      .catch(() => navigate("/salon"))
      .finally(() => setLoading(false));
  }, [navigate, load]);

  const logout = async () => {
    try { await venueApi.post("/venue/logout"); } catch { /* ignore */ }
    clearVenueToken();
    navigate("/salon");
  };

  const generate = async () => {
    setBusy(true);
    try {
      const body = {
        count: parseInt(form.count, 10) || 1,
        code_type: form.code_type,
        discount_percent: form.code_type === "discount" ? (parseInt(form.discount_percent, 10) || 0) : 0,
        couple_name: form.couple_name, note: form.note,
      };
      const { data } = await venueApi.post("/venue/codes", body);
      toast.success(`${data.created.length} kod üretildi`);
      setForm({ ...form, couple_name: "", note: "" });
      await load();
    } catch (e) { toast.error(formatApiError(e, "Üretilemedi")); }
    finally { setBusy(false); }
  };

  const copyCode = (code) => {
    navigator.clipboard?.writeText(code).then(
      () => toast.success("Kod kopyalandı"),
      () => toast.error("Kopyalanamadı"),
    );
  };

  const shareWa = (c) => {
    const label = c.code_type === "free" ? "ÜCRETSİZ premium dijital davetiye" : `%${c.discount_percent} indirimli dijital davetiye`;
    const msg = `Merhaba! Salonumuzda düğününüz için hediye: ${label}. \n\nDavet kodunuz: ${c.code}\n\n${INVITE_URL}/davetiye-olustur adresinden davetiyenizi oluşturup son adımda bu kodu girin. — ${acc?.salon_adi || "Salon"}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const del = async (c) => {
    if (!window.confirm(`${c.code} silinsin mi?`)) return;
    try { await venueApi.delete(`/venue/codes/${c.id}`); toast.success("Silindi"); await load(); }
    catch (e) { toast.error(formatApiError(e, "Silinemedi")); }
  };

  if (loading) return <div className="min-h-screen bg-[#0a0407] text-white/60 grid place-items-center">Yükleniyor…</div>;

  return (
    <div data-testid="venue-dashboard" className="min-h-screen text-white"
      style={{ background: "radial-gradient(900px 500px at 80% -10%, #3a1b2a 0%, #140710 60%, #0a0407 100%)" }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-rose-300 to-rose-600 flex items-center justify-center">
            <Landmark className="text-neutral-900" size={22} />
          </div>
          <div>
            <div className="font-semibold text-lg" data-testid="venue-name">{acc?.salon_adi}</div>
            <div className="text-xs text-white/50">{acc?.city || "Salon Paneli"} · {acc?.email}</div>
          </div>
          <Button data-testid="venue-logout" size="sm" variant="outline" onClick={logout}
            className="ml-auto gap-1.5 bg-transparent border-white/15 text-white hover:bg-white/10"><LogOut size={15} /> Çıkış</Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Stat icon={Ticket} label="Toplam Kod" value={stats?.total ?? 0} testid="venue-stat-total" />
          <Stat icon={Clock} label="Kullanılabilir" value={stats?.active ?? 0} testid="venue-stat-active" />
          <Stat icon={CheckCircle2} label="Kullanılan" value={stats?.used ?? 0} testid="venue-stat-used" />
          <Stat icon={Gift} label="Ücretsiz Verilen" value={stats?.free_used ?? 0} testid="venue-stat-free" />
        </div>

        {/* Generator */}
        <div className="rounded-2xl border border-white/12 bg-white/5 p-4 mb-6" data-testid="venue-generator">
          <div className="font-semibold mb-3 flex items-center gap-2"><Plus size={16} className="text-rose-300" /> Davet Kodu Üret</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div>
              <label className="text-xs text-white/50">Kod türü</label>
              <Select value={form.code_type} onValueChange={(v) => setForm({ ...form, code_type: v })}>
                <SelectTrigger data-testid="venue-code-type" className="h-10 bg-white/5 border-white/15 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Ücretsiz davetiye</SelectItem>
                  <SelectItem value="discount">İndirim (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.code_type === "discount" && (
              <div>
                <label className="text-xs text-white/50">İndirim %</label>
                <Input data-testid="venue-discount-pct" type="number" value={form.discount_percent}
                  onChange={(e) => setForm({ ...form, discount_percent: e.target.value })} className="h-10 bg-white/5 border-white/15 text-white" />
              </div>
            )}
            <div>
              <label className="text-xs text-white/50">Adet</label>
              <Input data-testid="venue-count" type="number" min={1} max={100} value={form.count}
                onChange={(e) => setForm({ ...form, count: e.target.value })} className="h-10 bg-white/5 border-white/15 text-white" />
            </div>
            <div>
              <label className="text-xs text-white/50">Çift adı (opsiyonel)</label>
              <Input data-testid="venue-couple" value={form.couple_name} placeholder="Ayşe & Mehmet"
                onChange={(e) => setForm({ ...form, couple_name: e.target.value })} className="h-10 bg-white/5 border-white/15 text-white" />
            </div>
            <Button data-testid="venue-generate" onClick={generate} disabled={busy}
              className="h-10 gap-1.5 bg-rose-500 hover:bg-rose-600 text-white font-semibold"><Plus size={15} /> Üret</Button>
          </div>
        </div>

        {/* Codes list */}
        {codes.length === 0 ? (
          <p className="text-white/40">Henüz davet kodu üretmediniz.</p>
        ) : (
          <div className="space-y-2" data-testid="venue-codes-list">
            {codes.map((c) => (
              <div key={c.id} data-testid={`venue-code-${c.id}`}
                className={`rounded-xl border p-3.5 flex flex-wrap items-center gap-3 ${c.status === "used" ? "border-white/8 bg-white/[0.03] opacity-80" : "border-rose-400/25 bg-rose-500/5"}`}>
                <div className="flex items-center gap-2">
                  {c.code_type === "free" ? <Gift size={16} className="text-emerald-300" /> : <Percent size={16} className="text-amber-300" />}
                  <span className="font-mono font-semibold tracking-wide">{c.code}</span>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.code_type === "free" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
                  {c.code_type === "free" ? "Ücretsiz" : `%${c.discount_percent} indirim`}
                </span>
                {c.status === "used"
                  ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">Kullanıldı · {fmtDate(c.used_at)}</span>
                  : <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">Aktif</span>}
                {c.couple_name && <span className="text-xs text-white/50">{c.couple_name}</span>}
                <div className="ml-auto flex items-center gap-1.5">
                  <Button data-testid={`venue-copy-${c.id}`} size="sm" variant="ghost" onClick={() => copyCode(c.code)} className="h-8 text-white/70 hover:bg-white/10"><Copy size={14} /></Button>
                  {c.status !== "used" && (
                    <>
                      <Button data-testid={`venue-wa-${c.id}`} size="sm" onClick={() => shareWa(c)} className="h-8 gap-1 bg-emerald-500 hover:bg-emerald-600 text-white"><MessageCircle size={14} /> Paylaş</Button>
                      <Button data-testid={`venue-del-${c.id}`} size="sm" variant="ghost" onClick={() => del(c)} className="h-8 text-red-300 hover:bg-red-500/10"><Trash2 size={14} /></Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, testid }) {
  return (
    <div data-testid={testid} className="rounded-2xl border border-white/12 bg-white/5 p-4">
      <div className="flex items-center gap-2 text-white/50 text-xs"><Icon size={14} /> {label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
