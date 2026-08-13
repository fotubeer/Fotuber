import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  LogOut, Plus, Copy, Trash2, Ticket, CheckCircle2, Clock, MessageCircle, Gift, Percent, Landmark,
  FileDown, Send, Users, ListChecks, Megaphone, ArrowLeft, QrCode, Printer, MapPin, KeyRound, UserPlus,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
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
          {[["codes", "Kodlar", Ticket], ["report", "Kullanım Raporu", ListChecks], ["personel", "Personel", Users], ["kroki", "Salon Krokileri", MapPin], ["campaign", "Toplu Kampanya", Megaphone], ["poster", "QR Afiş", QrCode]].map(([k, label, Icon]) => (
            <button key={k} data-testid={`venue-tab-${k}`}
              onClick={() => { setTab(k); if (k === "report") loadReport(); }}
              className={`px-4 h-9 rounded-lg text-sm font-medium flex items-center gap-1.5 ${tab === k ? "bg-white text-neutral-900" : "text-white/60 hover:text-white"}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {tab === "report" && <ReportView report={report} reload={loadReport} salon={acc?.salon_adi} />}
        {tab === "campaign" && <CampaignView salon={acc?.salon_adi} onDone={load} />}
        {tab === "poster" && <PosterView salon={acc?.salon_adi} city={acc?.city} />}
        {tab === "personel" && <StaffView />}
        {tab === "kroki" && <FloorPlansView navigate={navigate} />}

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

function PosterView({ salon, city }) {
  const target = `${INVITE_URL}/davetiye-olustur`;
  const [headline, setHeadline] = useState(salon || "Düğün Salonu");
  const [subtitle, setSubtitle] = useState("Dijital düğün davetiyenizi ücretsiz oluşturun");

  const printPoster = () => {
    const canvas = document.getElementById("venue-poster-qr");
    const qrData = canvas ? canvas.toDataURL("image/png") : "";
    const w = window.open("", "_blank", "width=900,height=1200");
    if (!w) { toast.error("Pop-up engellendi. İzin verin."); return; }
    w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>QR Afiş</title>
      <style>
        @page { size: A4 portrait; margin: 0; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { margin:0; font-family: 'Segoe UI', Arial, sans-serif; }
        .poster { width:210mm; height:297mm; padding:26mm 20mm; display:flex; flex-direction:column; align-items:center; justify-content:space-between; text-align:center;
          background:linear-gradient(160deg,#fff 0%,#fff5f7 55%,#ffe9ef 100%); color:#3a1b2a; }
        .brand { font-size:15pt; letter-spacing:3px; text-transform:uppercase; color:#b03a5b; font-weight:700; }
        .headline { font-size:34pt; font-weight:800; margin:6mm 0 3mm; line-height:1.1; }
        .subtitle { font-size:16pt; color:#6b4a55; max-width:150mm; }
        .qrwrap { background:#fff; border:2px solid #f0c9d4; border-radius:18px; padding:8mm; box-shadow:0 8px 30px rgba(176,58,91,0.15); }
        .qrwrap img { width:78mm; height:78mm; display:block; }
        .cta { font-size:18pt; font-weight:700; color:#b03a5b; margin-top:6mm; }
        .url { font-size:12pt; color:#6b4a55; margin-top:2mm; }
        .foot { font-size:11pt; color:#9a7b83; }
      </style></head><body>
      <div class="poster">
        <div>
          <div class="brand">${(headline || "").replace(/</g, "")}</div>
          <div class="headline">Kare kodu okutun 💍</div>
          <div class="subtitle">${(subtitle || "").replace(/</g, "")}</div>
        </div>
        <div class="qrwrap">${qrData ? `<img src="${qrData}" alt="QR"/>` : ""}</div>
        <div>
          <div class="cta">Telefonunuzun kamerasıyla okutun</div>
          <div class="url">${target}</div>
          <div class="foot" style="margin-top:10mm;">Fotuber ile hazırlanmıştır · fotuber.com.tr</div>
        </div>
      </div>
      <script>window.onload=function(){setTimeout(function(){window.print();},350);};</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <div data-testid="venue-poster" className="max-w-3xl">
      <div className="mb-4">
        <div className="font-semibold flex items-center gap-2"><QrCode size={16} className="text-rose-300" /> Yazdırılabilir QR Afiş</div>
        <div className="text-xs text-white/50 mt-0.5">Masalara koyabileceğiniz afiş. Kare kod çiftleri doğrudan davetiye oluşturma sayfasına götürür.</div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Controls */}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/50">Başlık (salon adı)</label>
            <Input data-testid="venue-poster-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} className="h-10 bg-white/5 border-white/15 text-white" />
          </div>
          <div>
            <label className="text-xs text-white/50">Alt metin</label>
            <Input data-testid="venue-poster-subtitle" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className="h-10 bg-white/5 border-white/15 text-white" />
          </div>
          <div className="text-[11px] text-white/40">Kare kod hedefi: {target}</div>
          <Button data-testid="venue-poster-print" onClick={printPoster} className="gap-1.5 bg-rose-500 hover:bg-rose-600 text-white font-semibold"><Printer size={15} /> Afişi Yazdır / PDF</Button>
        </div>

        {/* Live preview (mini poster) */}
        <div data-testid="venue-poster-preview" className="rounded-2xl overflow-hidden border border-white/12"
          style={{ background: "linear-gradient(160deg,#fff 0%,#fff5f7 55%,#ffe9ef 100%)", color: "#3a1b2a" }}>
          <div className="px-6 py-8 flex flex-col items-center text-center gap-3">
            <div className="text-[11px] tracking-[3px] uppercase font-bold text-rose-700">{headline}</div>
            <div className="text-2xl font-extrabold">Kare kodu okutun 💍</div>
            <div className="text-sm text-rose-900/70 max-w-[240px]">{subtitle}</div>
            <div className="bg-white rounded-2xl p-3 border-2 border-rose-100 shadow-lg">
              <QRCodeCanvas id="venue-poster-qr" value={target} size={150} includeMargin data-testid="venue-poster-qr-canvas" />
            </div>
            <div className="text-sm font-bold text-rose-700">Telefon kamerasıyla okutun</div>
            <div className="text-[10px] text-rose-900/50">Fotuber ile hazırlanmıştır · fotuber.com.tr</div>
          </div>
        </div>
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

// ── Staff management (venue admin) ──────────────────────────────────────────
const ROLE_LABELS = { fotografci: "Fotoğrafçı", garson_sefi: "Garson Şefi", muzisyen: "Müzisyen/Orkestra", salon_gorevlisi: "Salon Görevlisi", salon_muduru: "Salon Müdürü", sanatci: "Sanatçı", kameraman: "Kameraman", diger: "Diğer" };
function StaffView() {
  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState(Object.keys(ROLE_LABELS));
  const [kiosk, setKiosk] = useState("");
  const [form, setForm] = useState({ name: "", job_role: "salon_gorevlisi", pin: "" });
  const load = useCallback(async () => {
    try {
      const [s, k] = await Promise.all([venueApi.get("/venue/staff"), venueApi.get("/venue/kiosk-code")]);
      setStaff(s.data?.staff || []); setRoles(s.data?.roles || roles); setKiosk(k.data?.kiosk_code || "");
    } catch { /* ignore */ }
  }, []); // eslint-disable-line
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    if (!form.name || !/^\d{4,6}$/.test(form.pin)) { toast.error("Ad ve 4-6 haneli PIN girin"); return; }
    try { await venueApi.post("/venue/staff", form); toast.success("Personel eklendi"); setForm({ name: "", job_role: "salon_gorevlisi", pin: "" }); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const del = async (id) => { await venueApi.delete(`/venue/staff/${id}`); load(); };
  const toggle = async (s) => { await venueApi.patch(`/venue/staff/${s.id}`, { active: !s.active }); load(); };
  return (
    <div className="space-y-5" data-testid="venue-staff-view">
      <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-5">
        <div className="flex items-center gap-2 mb-1"><KeyRound size={16} className="text-amber-300" /><h3 className="font-semibold">Salon Kiosk Kodu</h3></div>
        <p className="text-xs text-white/50 mb-2">Personel, kapıdaki tablet/telefonda bu kod + kendi PIN'i ile <b>Personel Kiosk</b>'a giriş yapar.</p>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold tracking-[0.35em] bg-white/10 rounded-lg px-4 py-2" data-testid="venue-kiosk-code">{kiosk || "…"}</span>
          <a href="/salon/kiosk" target="_blank" rel="noreferrer" className="text-sm text-amber-300 hover:text-amber-200 underline">Kiosk sayfasını aç ↗</a>
        </div>
      </div>
      <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-5">
        <div className="flex items-center gap-2 mb-3"><UserPlus size={16} /><h3 className="font-semibold">Personel Ekle</h3></div>
        <div className="grid sm:grid-cols-4 gap-2">
          <Input data-testid="staff-name" placeholder="Ad Soyad" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-white/5 border-white/15 text-white" />
          <Select value={form.job_role} onValueChange={(v) => setForm({ ...form, job_role: v })}>
            <SelectTrigger data-testid="staff-role" className="bg-white/5 border-white/15 text-white"><SelectValue /></SelectTrigger>
            <SelectContent>{roles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r] || r}</SelectItem>)}</SelectContent>
          </Select>
          <Input data-testid="staff-pin" placeholder="PIN (4-6 hane)" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })} className="bg-white/5 border-white/15 text-white" />
          <Button data-testid="staff-add" onClick={add} className="bg-amber-500 hover:bg-amber-600 text-black">Ekle</Button>
        </div>
      </div>
      <div className="rounded-2xl border border-white/12 bg-white/[0.04] divide-y divide-white/5">
        {staff.length === 0 && <p className="text-sm text-white/40 p-5">Henüz personel yok.</p>}
        {staff.map((s) => (
          <div key={s.id} className="flex items-center gap-3 p-4" data-testid={`staff-row-${s.id}`}>
            <div className="flex-1"><div className="font-medium">{s.name}</div><div className="text-xs text-white/50">{ROLE_LABELS[s.job_role] || s.job_role} {!s.active && "· pasif"}</div></div>
            <Button size="sm" variant="outline" className="text-black" onClick={() => toggle(s)}>{s.active ? "Pasifleştir" : "Aktifleştir"}</Button>
            <Button size="sm" variant="outline" className="text-red-500" onClick={() => del(s.id)}><Trash2 size={14} /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Floor plans list (venue admin) ─────────────────────────────────────────
function FloorPlansView({ navigate }) {
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState({ name: "", area_type: "indoor" });
  const load = useCallback(() => venueApi.get("/venue/floorplans").then(({ data }) => setPlans(data.plans || [])).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  const create = async () => {
    try { const { data } = await venueApi.post("/venue/floorplans", { name: form.name || "Yeni Kroki", area_type: form.area_type }); navigate(`/salon/kroki/${data.plan.id}`); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const del = async (id) => { if (!window.confirm("Kroki silinsin mi?")) return; await venueApi.delete(`/venue/floorplans/${id}`); load(); };
  return (
    <div className="space-y-5" data-testid="venue-kroki-view">
      <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-5">
        <div className="flex items-center gap-2 mb-3"><MapPin size={16} /><h3 className="font-semibold">Yeni Kroki</h3></div>
        <div className="grid sm:grid-cols-3 gap-2">
          <Input data-testid="kroki-name" placeholder="Kroki adı (örn. Ana Salon)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-white/5 border-white/15 text-white" />
          <Select value={form.area_type} onValueChange={(v) => setForm({ ...form, area_type: v })}>
            <SelectTrigger data-testid="kroki-area" className="bg-white/5 border-white/15 text-white"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="indoor">🏛️ Kapalı Salon</SelectItem><SelectItem value="garden">🌳 Kır Bahçesi</SelectItem></SelectContent>
          </Select>
          <Button data-testid="kroki-create" onClick={create} className="bg-amber-500 hover:bg-amber-600 text-black">Oluştur & Çiz</Button>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {plans.length === 0 && <p className="text-sm text-white/40">Henüz kroki yok. Yukarıdan oluşturun.</p>}
        {plans.map((p) => (
          <div key={p.id} className="rounded-2xl border border-white/12 bg-white/[0.04] p-4" data-testid={`kroki-card-${p.id}`}>
            <div className="font-medium">{p.name}</div>
            <div className="text-xs text-white/50 mb-3">{p.area_type === "garden" ? "🌳 Kır Bahçesi" : "🏛️ Kapalı Salon"} · {p.element_count || 0} öğe</div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => navigate(`/salon/kroki/${p.id}`)} className="bg-white/10 hover:bg-white/20" data-testid={`kroki-open-${p.id}`}>Düzenle</Button>
              <Button size="sm" variant="outline" className="text-red-500" onClick={() => del(p.id)}><Trash2 size={14} /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
