import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Megaphone, AlertTriangle, PartyPopper, Info, Send, Trash2, Mail, Users2,
  Search, Gift, Percent, CalendarPlus, MessageCircle, Activity, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { api, formatApiError } from "@/lib/api";

const TYPES = [
  { key: "critical", label: "Kritik / Uyarı", Icon: AlertTriangle, cls: "text-red-600" },
  { key: "update", label: "Güncelleme / Bakım", Icon: Info, cls: "text-orange-500" },
  { key: "celebration", label: "Kutlama / Bayram", Icon: PartyPopper, cls: "text-fuchsia-600" },
  { key: "general", label: "Genel", Icon: Megaphone, cls: "text-blue-600" },
];
const waLink = (phone, text) => {
  let d = (phone || "").replace(/\D/g, "");
  if (!d) return null;
  if (!d.startsWith("90")) d = d.startsWith("0") ? "90" + d.slice(1) : "90" + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
};

export default function AdminAnnouncements() {
  const [tab, setTab] = useState("announce");
  return (
    <div data-testid="admin-announcements" className="p-4 sm:p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-1">
        <Megaphone className="text-fuchsia-600" size={26} />
        <h1 className="text-2xl sm:text-3xl font-semibold">Merkezi Duyuru & Telafi</h1>
      </div>
      <p className="text-sm text-neutral-500 mb-5">Tüm Stüdyo Paneli kullanıcılarına duyuru yayınlayın, mağdur müşterilere FTB koduyla telafi tanımlayın.</p>
      <div className="flex gap-1 p-1 rounded-xl bg-neutral-100 w-fit mb-6">
        {[["announce", "Duyuru Yönetimi", Megaphone], ["activity", "Canlı Aktivite", Activity], ["comp", "FTB Telafi & Kupon", Gift]].map(([k, l, Icon]) => (
          <button key={k} data-testid={`aa-tab-${k}`} onClick={() => setTab(k)}
            className={`px-4 h-9 rounded-lg text-sm font-medium flex items-center gap-1.5 ${tab === k ? "bg-white shadow text-neutral-900" : "text-neutral-500"}`}>
            <Icon size={15} /> {l}
          </button>
        ))}
      </div>
      {tab === "announce" && <AnnounceTab />}
      {tab === "activity" && <ActivityTab />}
      {tab === "comp" && <CompensateTab />}
    </div>
  );
}

function AnnounceTab() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ type: "update", title: "", message: "", dismissible: true, sticky: false, starts_at: "", ends_at: "" });
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState({});

  const load = async () => {
    try { setList((await api.get("/admin/announcements")).data.announcements || []); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.title.trim() || !form.message.trim()) { toast.error("Başlık ve mesaj gerekli"); return; }
    setBusy(true);
    try {
      const body = { ...form, starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null, ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null, active: true };
      await api.post("/admin/announcements", body);
      toast.success("Duyuru yayınlandı");
      setForm({ type: "update", title: "", message: "", dismissible: true, sticky: false, starts_at: "", ends_at: "" });
      load();
    } catch (e) { toast.error(formatApiError(e)); } finally { setBusy(false); }
  };

  const toggle = async (a) => {
    try { await api.put(`/admin/announcements/${a.id}`, { ...a, active: !a.active }); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const del = async (a) => {
    if (!window.confirm("Duyuru silinsin mi?")) return;
    try { await api.delete(`/admin/announcements/${a.id}`); toast.success("Silindi"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const loadStats = async (a) => {
    try {
      const r = await api.get(`/admin/announcements/${a.id}/stats`);
      setStats((s) => ({ ...s, [a.id]: r.data }));
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const sendMail = async (a) => {
    if (!window.confirm("Bu duyuru tüm üyelere e-posta olarak gönderilsin mi?")) return;
    try { const r = await api.post(`/admin/announcements/${a.id}/email`); toast.success(`${r.data.sent}/${r.data.total} e-posta gönderildi`); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Composer */}
      <div className="rounded-xl border p-4 space-y-3 h-fit" data-testid="aa-composer">
        <div className="font-semibold">Yeni Duyuru</div>
        <div>
          <label className="text-xs text-neutral-500">Tip</label>
          <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
            <SelectTrigger data-testid="aa-type" className="h-10"><SelectValue /></SelectTrigger>
            <SelectContent>{TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Input data-testid="aa-title" placeholder="Başlık" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Textarea data-testid="aa-message" rows={4} placeholder="Mesaj — {firma_adi} ve {musteri_kodu} otomatik doldurulur" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs text-neutral-500">Başlangıç (ops.)</label><Input data-testid="aa-start" type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></div>
          <div><label className="text-xs text-neutral-500">Bitiş (ops.)</label><Input data-testid="aa-end" type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></div>
        </div>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5"><input data-testid="aa-dismissible" type="checkbox" checked={form.dismissible} onChange={(e) => setForm({ ...form, dismissible: e.target.checked })} /> Kapatılabilir</label>
          <label className="flex items-center gap-1.5"><input data-testid="aa-sticky" type="checkbox" checked={form.sticky} onChange={(e) => setForm({ ...form, sticky: e.target.checked })} /> Üst barda sabit kalsın</label>
        </div>
        <Button data-testid="aa-publish" onClick={create} disabled={busy} className="gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-700"><Send size={15} /> Yayınla</Button>
      </div>

      {/* List */}
      <div className="space-y-2" data-testid="aa-list">
        {list.length === 0 ? <p className="text-neutral-400">Henüz duyuru yok.</p> : list.map((a) => {
          const T = TYPES.find((t) => t.key === a.type) || TYPES[3];
          const s = stats[a.id];
          return (
            <div key={a.id} data-testid={`aa-item-${a.id}`} className={`rounded-xl border p-3 ${a.active ? "" : "opacity-50"}`}>
              <div className="flex items-center gap-2">
                <T.Icon size={16} className={T.cls} />
                <span className="font-semibold text-sm">{a.title}</span>
                {a.sticky && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200">Sabit</span>}
                {a.email_sent && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">E-posta ✓</span>}
              </div>
              <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{a.message}</p>
              {s && <p className="text-xs mt-1 text-neutral-600 flex items-center gap-1"><Users2 size={12} /> {s.acked}/{s.total_members} okudu · {s.not_acked_count} bekliyor</p>}
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Button data-testid={`aa-stats-${a.id}`} size="sm" variant="outline" onClick={() => loadStats(a)} className="h-8 gap-1"><Users2 size={13} /> Okundu Bilgisi</Button>
                <Button data-testid={`aa-email-${a.id}`} size="sm" variant="outline" onClick={() => sendMail(a)} className="h-8 gap-1"><Mail size={13} /> E-posta Gönder</Button>
                <Button data-testid={`aa-toggle-${a.id}`} size="sm" variant="outline" onClick={() => toggle(a)} className="h-8">{a.active ? "Pasifleştir" : "Aktifleştir"}</Button>
                <Button data-testid={`aa-del-${a.id}`} size="sm" variant="ghost" onClick={() => del(a)} className="h-8 text-red-600"><Trash2 size={13} /></Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityTab() {
  const [rows, setRows] = useState([]);
  const load = async () => {
    try { setRows((await api.get("/admin/studio/activity")).data.accounts || []); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, []);
  return (
    <div data-testid="aa-activity">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-neutral-500">Kim ne durumda — kritik işlemde müşteriye tek tık WhatsApp bildirin.</p>
        <Button size="sm" variant="outline" onClick={load} className="gap-1"><RefreshCw size={14} /> Yenile</Button>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500 text-xs"><tr>{["Firma", "FTB", "Plan", "Durum", "Son Görülme", ""].map((h) => <th key={h} className="text-left px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} data-testid={`aa-act-${a.id}`} className="border-t">
                <td className="px-3 py-2 whitespace-nowrap">{a.firma_adi}</td>
                <td className="px-3 py-2 font-mono text-xs">{a.ftb_code}</td>
                <td className="px-3 py-2">{a.plan_name}</td>
                <td className="px-3 py-2"><span className={`text-[10px] px-1.5 py-0.5 rounded ${a.active ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}`}>{a.status}</span></td>
                <td className="px-3 py-2 text-neutral-500 text-xs whitespace-nowrap">{a.last_seen ? new Date(a.last_seen).toLocaleString("tr-TR") : "—"}</td>
                <td className="px-3 py-2">
                  {a.phone && <a data-testid={`aa-wa-${a.id}`} href={waLink(a.phone, `Merhaba ${a.firma_adi}, sisteminizde kritik bir güncelleme yapılacaktır. Lütfen işlemlerinizi kaydedin.`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium"><MessageCircle size={13} /> WhatsApp</a>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompensateTab() {
  const [ftb, setFtb] = useState("");
  const [acc, setAcc] = useState(null);
  const [action, setAction] = useState("extend");
  const [f, setF] = useState({ days: 0, months: 0, discount_pct: 20, extra_events: 0, extra_ai: 0, note: "" });

  const lookup = async () => {
    try { const r = await api.get(`/admin/studio/lookup?ftb=${encodeURIComponent(ftb.trim())}`); setAcc(r.data.account); }
    catch (e) { setAcc(null); toast.error(formatApiError(e, "Bulunamadı")); }
  };
  const apply = async () => {
    try {
      const body = { ftb_code: ftb.trim(), action, ...f, discount_pct: parseInt(f.discount_pct, 10) || 0, days: parseInt(f.days, 10) || 0, months: parseInt(f.months, 10) || 0, extra_events: parseInt(f.extra_events, 10) || 0, extra_ai: parseInt(f.extra_ai, 10) || 0 };
      const r = await api.post("/admin/studio/compensate", body);
      toast.success(r.data.label);
      setAcc(r.data.account);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="max-w-xl space-y-4" data-testid="aa-compensate">
      <div className="flex gap-2">
        <Input data-testid="aa-ftb-input" placeholder="FTB-XXXXX" value={ftb} onChange={(e) => setFtb(e.target.value.toUpperCase())} />
        <Button data-testid="aa-ftb-lookup" onClick={lookup} className="gap-1"><Search size={15} /> Bul</Button>
      </div>
      {acc && (
        <>
          <div className="rounded-xl border p-4 bg-neutral-50" data-testid="aa-acc-card">
            <div className="font-semibold">{acc.firma_adi} <span className="font-mono text-xs text-neutral-400">{acc.ftb_code}</span></div>
            <div className="text-sm text-neutral-500 mt-1">{acc.email} · {acc.phone || "telefon yok"}</div>
            <div className="text-sm mt-2 flex flex-wrap gap-3">
              <span>Plan: <b>{acc.plan_name}</b></span>
              <span>Durum: <b>{acc.status}</b> ({acc.days_left} gün)</span>
              <span>AI: <b>{acc.ai_credits}</b></span>
              <span>Bonus etkinlik: <b>{acc.bonus_events}</b></span>
              <span>Kupon: <b>%{acc.coupon_pct}</b></span>
            </div>
          </div>

          <div className="rounded-xl border p-4 space-y-3">
            <div className="flex gap-1 p-1 rounded-lg bg-neutral-100 w-fit">
              {[["extend", "Süre Uzat", CalendarPlus], ["coupon", "İndirim Kuponu", Percent], ["quota", "Kota Yükle", Gift]].map(([k, l, Icon]) => (
                <button key={k} data-testid={`aa-comp-${k}`} onClick={() => setAction(k)} className={`px-3 h-8 rounded-md text-sm flex items-center gap-1 ${action === k ? "bg-white shadow" : "text-neutral-500"}`}><Icon size={14} /> {l}</button>
              ))}
            </div>
            {action === "extend" && (
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-neutral-500">Gün</label><Input data-testid="aa-days" type="number" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></div>
                <div><label className="text-xs text-neutral-500">Ay</label><Input data-testid="aa-months" type="number" value={f.months} onChange={(e) => setF({ ...f, months: e.target.value })} /></div>
              </div>
            )}
            {action === "coupon" && (
              <div>
                <label className="text-xs text-neutral-500">İndirim</label>
                <Select value={String(f.discount_pct)} onValueChange={(v) => setF({ ...f, discount_pct: v })}>
                  <SelectTrigger data-testid="aa-coupon-pct" className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>{[10, 20, 50, 100].map((p) => <SelectItem key={p} value={String(p)}>%{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {action === "quota" && (
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-neutral-500">Ek Etkinlik</label><Input data-testid="aa-extra-events" type="number" value={f.extra_events} onChange={(e) => setF({ ...f, extra_events: e.target.value })} /></div>
                <div><label className="text-xs text-neutral-500">Ek AI Hakkı</label><Input data-testid="aa-extra-ai" type="number" value={f.extra_ai} onChange={(e) => setF({ ...f, extra_ai: e.target.value })} /></div>
              </div>
            )}
            <Input data-testid="aa-note" placeholder="Not (opsiyonel)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
            <Button data-testid="aa-apply" onClick={apply} className="gap-1 bg-neutral-900 hover:bg-neutral-800"><Gift size={15} /> Telafiyi Uygula</Button>
          </div>
        </>
      )}
    </div>
  );
}
