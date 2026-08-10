import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  LogOut, Plus, Copy, Trash2, Ticket, CheckCircle2, Clock, MessageCircle, Gift, Percent, Landmark,
  FileDown, Send, Users, ListChecks, Megaphone, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { venueApi, clearVenueToken } from "@/lib/venueApi";
import { formatApiError } from "@/lib/api";

const INVITE_URL = (typeof window !== "undefined") ? window.location.origin : "";
const fmtDate = (iso) => { if (!iso) return "—"; try { return new Date(iso).toLocaleDateString("tr-TR"); } catch { return "—"; } };
const fmtDateTime = (iso) => { if (!iso) return "—"; try { return new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return "—"; } };

// Normalize a Turkish phone number to international wa.me format (90XXXXXXXXXX).
function normalizePhone(raw) {
  let d = (raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("90")) return d;
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) return "90" + d;
  return d;
}

export default function VenueDashboard() {
  const navigate = useNavigate();
  const [acc, setAcc] = useState(null);
  const [codes, setCodes] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ count: 1, code_type: "free", discount_percent: 20, couple_name: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("codes"); // codes | report | campaign
  const [report, setReport] = useState([]);

  const loadReport = useCallback(async () => {
    try { setReport((await venueApi.get("/venue/report")).data?.report || []); }
    catch { /* ignore */ }
  }, []);

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

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-white/5 w-fit mb-6">
          {[["codes", "Kodlar", Ticket], ["report", "Kullanım Raporu", ListChecks], ["campaign", "Toplu Kampanya", Megaphone]].map(([k, label, Icon]) => (
            <button key={k} data-testid={`venue-tab-${k}`}
              onClick={() => { setTab(k); if (k === "report") loadReport(); }}
              className={`px-4 h-9 rounded-lg text-sm font-medium flex items-center gap-1.5 ${tab === k ? "bg-white text-neutral-900" : "text-white/60 hover:text-white"}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {tab === "report" && <ReportView report={report} reload={loadReport} salon={acc?.salon_adi} />}
        {tab === "campaign" && <CampaignView salon={acc?.salon_adi} onDone={load} />}

        {tab === "codes" && <>
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
        </>}
      </div>
    </div>
  );
}

function ReportView({ report, reload, salon }) {
  const exportCsv = () => {
    const header = ["Kod", "Tür", "İndirim%", "Çift", "Kullanım Tarihi", "Etkinlik Tarihi", "Davetiye Linki", "Not"];
    const rows = report.map((r) => [
      r.code, r.code_type === "free" ? "Ücretsiz" : "İndirim", r.code_type === "free" ? 100 : r.discount_percent,
      r.couple_name || "", fmtDateTime(r.used_at), r.event_date || "",
      r.invitation_slug ? `${INVITE_URL}/davetiye/${r.invitation_slug}` : "", (r.note || "").replace(/[\n\r,]/g, " "),
    ]);
    const csv = "\uFEFF" + [header, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `salon-kod-raporu-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <div data-testid="venue-report">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-semibold flex items-center gap-2"><ListChecks size={16} className="text-rose-300" /> Kod Kullanım Raporu</div>
          <div className="text-xs text-white/50 mt-0.5">Hangi çiftin hangi kodu ne zaman kullandığını görün.</div>
        </div>
        <div className="flex gap-2">
          <Button data-testid="venue-report-refresh" size="sm" variant="outline" onClick={reload} className="bg-transparent border-white/15 text-white hover:bg-white/10">Yenile</Button>
          <Button data-testid="venue-report-csv" size="sm" onClick={exportCsv} disabled={report.length === 0} className="gap-1 bg-white text-neutral-900 hover:bg-white/90"><FileDown size={14} /> CSV İndir</Button>
        </div>
      </div>
      {report.length === 0 ? (
        <div className="rounded-2xl border border-white/12 bg-white/5 p-8 text-center text-white/40">Henüz kullanılan kod yok.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/12">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-white/50 text-xs">
              <tr>
                {["Kod", "Tür", "Çift", "Kullanım", "Etkinlik", "Davetiye"].map((h) => <th key={h} className="text-left font-medium px-3 py-2 whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {report.map((r) => (
                <tr key={r.id} data-testid={`venue-report-row-${r.id}`} className="border-t border-white/8">
                  <td className="px-3 py-2 font-mono whitespace-nowrap">{r.code}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.code_type === "free" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
                      {r.code_type === "free" ? "Ücretsiz" : `%${r.discount_percent}`}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.couple_name || "—"}</td>
                  <td className="px-3 py-2 text-white/60 whitespace-nowrap">{fmtDateTime(r.used_at)}</td>
                  <td className="px-3 py-2 text-white/60 whitespace-nowrap">{r.event_date ? fmtDate(r.event_date) : "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.invitation_slug
                      ? <a href={`${INVITE_URL}/davetiye/${r.invitation_slug}`} target="_blank" rel="noreferrer" className="text-sky-300 hover:text-sky-200 underline">Görüntüle</a>
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CampaignView({ salon, onDone }) {
  const [codeType, setCodeType] = useState("free");
  const [discount, setDiscount] = useState(20);
  const [raw, setRaw] = useState("");
  const [msgTpl, setMsgTpl] = useState(
    `Merhaba! ${salon || "Salonumuz"} olarak düğününüz için hediyemiz: dijital davetiyeniz {teklif}. \n\nDavet kodunuz: {kod}\n\nDavetiyenizi oluşturmak için: {link}/davetiye-olustur (son adımda kodu girin).`
  );
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState([]); // [{name, phone, code, code_type, discount}]

  const parseRows = () => {
    return raw.split(/[\n;]+/).map((line) => {
      const parts = line.split(/[,\t]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length === 0) return null;
      // "Name, Phone" or just "Phone"
      let name = "", phone = "";
      if (parts.length >= 2) { name = parts[0]; phone = parts[1]; }
      else { phone = parts[0]; }
      const norm = normalizePhone(phone);
      if (!norm) return null;
      return { name, phone: norm };
    }).filter(Boolean);
  };

  const buildMsg = (code, offer) =>
    msgTpl.replace(/\{kod\}/g, code).replace(/\{link\}/g, INVITE_URL)
      .replace(/\{teklif\}/g, offer);

  const generate = async () => {
    const rows = parseRows();
    if (rows.length === 0) { toast.error("Geçerli telefon numarası girin"); return; }
    if (rows.length > 100) { toast.error("Tek seferde en fazla 100 numara"); return; }
    setBusy(true);
    try {
      const out = [];
      for (const r of rows) {
        const { data } = await venueApi.post("/venue/codes", {
          count: 1, code_type: codeType,
          discount_percent: codeType === "discount" ? (parseInt(discount, 10) || 0) : 0,
          couple_name: r.name, note: "Toplu kampanya",
        });
        const c = data.created[0];
        out.push({ ...r, code: c.code, code_type: c.code_type, discount: c.discount_percent });
      }
      setPrepared(out);
      toast.success(`${out.length} kod üretildi. Şimdi WhatsApp ile gönderebilirsiniz.`);
      onDone && onDone();
    } catch (e) { toast.error(formatApiError(e, "Üretilemedi")); }
    finally { setBusy(false); }
  };

  const offerText = codeType === "free" ? "ÜCRETSİZ" : `%${discount} indirimli`;
  const sendOne = (p) => {
    const msg = buildMsg(p.code, p.code_type === "free" ? "ÜCRETSİZ" : `%${p.discount} indirimli`);
    window.open(`https://wa.me/${p.phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };
  const sendAll = () => {
    if (prepared.length === 0) return;
    toast.info("Numaralar sırayla açılıyor. Pop-up engelleyiciye izin verin.");
    prepared.forEach((p, i) => setTimeout(() => sendOne(p), i * 800));
  };

  return (
    <div data-testid="venue-campaign" className="max-w-3xl">
      <div className="mb-4">
        <div className="font-semibold flex items-center gap-2"><Megaphone size={16} className="text-rose-300" /> Toplu WhatsApp Kampanyası</div>
        <div className="text-xs text-white/50 mt-0.5">Her çift için tek kullanımlık kod üretilir ve <b>kendi WhatsApp numaranızdan</b> gönderilir (ek panel/ücret yok).</div>
      </div>

      <div className="rounded-2xl border border-white/12 bg-white/5 p-4 space-y-3">
        <div className="grid sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="text-xs text-white/50">Kod türü</label>
            <Select value={codeType} onValueChange={setCodeType}>
              <SelectTrigger data-testid="venue-camp-type" className="h-10 bg-white/5 border-white/15 text-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Ücretsiz davetiye</SelectItem>
                <SelectItem value="discount">İndirim (%)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {codeType === "discount" && (
            <div>
              <label className="text-xs text-white/50">İndirim %</label>
              <Input data-testid="venue-camp-discount" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} className="h-10 bg-white/5 border-white/15 text-white" />
            </div>
          )}
        </div>
        <div>
          <label className="text-xs text-white/50">Numaralar (her satıra bir tane · "İsim, Telefon" ya da sadece telefon)</label>
          <Textarea data-testid="venue-camp-numbers" rows={5} value={raw} onChange={(e) => setRaw(e.target.value)}
            placeholder={"Ayşe & Mehmet, 0532 111 22 33\nZeynep & Ali, 05334445566\n05061112233"}
            className="bg-white/5 border-white/15 text-white placeholder:text-white/30" />
        </div>
        <div>
          <label className="text-xs text-white/50">Mesaj şablonu ({"{kod}"}, {"{link}"}, {"{teklif}"} otomatik doldurulur)</label>
          <Textarea data-testid="venue-camp-message" rows={4} value={msgTpl} onChange={(e) => setMsgTpl(e.target.value)}
            className="bg-white/5 border-white/15 text-white" />
        </div>
        <Button data-testid="venue-camp-generate" onClick={generate} disabled={busy}
          className="gap-1.5 bg-rose-500 hover:bg-rose-600 text-white font-semibold"><Plus size={15} /> {busy ? "Üretiliyor…" : "Kodları Üret ve Hazırla"}</Button>
      </div>

      {prepared.length > 0 && (
        <div className="mt-5" data-testid="venue-camp-prepared">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-white/70">{prepared.length} kod hazır · teklif: <b>{offerText}</b></div>
            <Button data-testid="venue-camp-send-all" size="sm" onClick={sendAll} className="gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white"><Send size={14} /> Tümünü Sırayla Aç</Button>
          </div>
          <div className="space-y-2">
            {prepared.map((p, i) => (
              <div key={i} data-testid={`venue-camp-row-${i}`} className="rounded-xl border border-white/10 bg-white/5 p-3 flex flex-wrap items-center gap-3">
                <Users size={15} className="text-white/40" />
                <span className="text-sm">{p.name || "—"}</span>
                <span className="text-xs text-white/50">+{p.phone}</span>
                <span className="font-mono text-xs text-rose-200">{p.code}</span>
                <Button data-testid={`venue-camp-send-${i}`} size="sm" onClick={() => sendOne(p)} className="ml-auto gap-1 bg-emerald-500 hover:bg-emerald-600 text-white h-8"><MessageCircle size={13} /> Gönder</Button>
              </div>
            ))}
          </div>
        </div>
      )}
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
