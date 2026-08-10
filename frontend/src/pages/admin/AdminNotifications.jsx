import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Bell, AlertTriangle, CheckCheck, Send, Loader2, Check, Building2 } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const FILTERS = [
  ["all", "Tümü"],
  ["critical", "Kritik"],
  ["general", "Genel"],
];

export default function AdminNotifications() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: "", message: "", severity: "general", firma_adi: "" });
  const [sending, setSending] = useState(false);
  const nav = useNavigate();

  const load = useCallback(async () => {
    try {
      const params = { limit: 60 };
      if (filter !== "all") params.severity = filter;
      const { data } = await api.get("/notifications", { params });
      setItems(data.items || []);
    } catch (e) {
      toast.error(formatApiError(e, "Bildirimler yüklenemedi"));
    } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const markAll = async () => {
    await api.post("/notifications/mark-read");
    load();
    toast.success("Tümü okundu işaretlendi");
  };

  const markOne = async (id) => {
    await api.post("/notifications/mark-read", null, { params: { notification_id: id } });
    load();
  };

  const send = async () => {
    if (!form.title.trim()) { toast.error("Başlık gerekli"); return; }
    setSending(true);
    try {
      await api.post("/notifications", form);
      toast.success("Bildirim oluşturuldu");
      setForm({ title: "", message: "", severity: "general", firma_adi: "" });
      load();
    } catch (e) {
      toast.error(formatApiError(e, "Gönderilemedi"));
    } finally { setSending(false); }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6" data-testid="admin-notifications">
      <div className="flex items-center gap-3 mb-1">
        <Bell className="w-6 h-6 text-slate-700" />
        <h1 className="text-2xl font-bold text-slate-900" data-testid="admin-notif-title">Merkezi Bildirimler</h1>
      </div>
      <p className="text-sm text-slate-500 mb-6">Kritik ve genel bildirimleri canlı olarak takip edin. {"{firma_adi}"} etiketi ilgili firmanın adıyla değiştirilir.</p>

      {/* Compose */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 mb-6 shadow-sm" data-testid="notif-compose">
        <div className="flex items-center gap-2 mb-3 text-slate-800 font-semibold"><Send className="w-4 h-4" /> Yeni Bildirim Oluştur</div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Input data-testid="notif-title-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Başlık" className="sm:col-span-2" />
          <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
            <SelectTrigger data-testid="notif-severity-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="general">Genel</SelectItem>
              <SelectItem value="critical">Kritik</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 mt-3">
          <div className="sm:col-span-2">
            <Textarea data-testid="notif-message-input" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Mesaj (isteğe bağlı) — {firma_adi} etiketi kullanabilirsiniz" rows={2} />
          </div>
          <div className="relative">
            <Building2 className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
            <Input data-testid="notif-firma-input" value={form.firma_adi} onChange={(e) => setForm({ ...form, firma_adi: e.target.value })}
              placeholder="Firma adı (etiket)" className="pl-8" />
          </div>
        </div>
        <Button data-testid="notif-send-btn" onClick={send} disabled={sending}
          className="mt-3 gap-2 bg-slate-900 hover:bg-slate-800">
          {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Gönderiliyor…</> : <><Send className="w-4 h-4" /> Oluştur</>}
        </Button>
      </div>

      {/* Filters + mark all */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {FILTERS.map(([k, label]) => (
          <button key={k} data-testid={`notif-filter-${k}`} onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}>{label}</button>
        ))}
        <Button variant="outline" size="sm" onClick={markAll} data-testid="notif-mark-all" className="ml-auto gap-1.5">
          <CheckCheck className="w-4 h-4" /> Tümünü okundu işaretle
        </Button>
      </div>

      {/* List */}
      <div className="space-y-2" data-testid="notif-list">
        {loading ? (
          <div className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-slate-400" data-testid="notif-empty">Bildirim yok.</div>
        ) : items.map((n) => (
          <div key={n.id} data-testid={`notif-row-${n.id}`}
            className={`rounded-xl border p-4 flex items-start gap-3 ${n.read ? "border-slate-200 bg-white" : "border-blue-200 bg-blue-50/40"}`}>
            <div className={`mt-0.5 shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${n.severity === "critical" ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-500"}`}>
              {n.severity === "critical" ? <AlertTriangle className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {n.severity === "critical" && <span className="rounded-full bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5">KRİTİK</span>}
                {n.firma_adi && <span data-testid={`notif-firma-tag-${n.id}`} className="rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold px-2 py-0.5 inline-flex items-center gap-1"><Building2 className="w-2.5 h-2.5" />{n.firma_adi}</span>}
                <span className="font-semibold text-slate-900 text-sm">{n.title}</span>
              </div>
              {n.message && <div className="text-sm text-slate-600 mt-0.5">{n.message}</div>}
              <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400">
                <span>{new Date(n.created_at).toLocaleString("tr-TR")}</span>
                {n.read ? (
                  <span data-testid={`notif-read-${n.id}`} className="inline-flex items-center gap-1 text-emerald-600"><Check className="w-3 h-3" /> Okundu{n.read_by ? ` · ${n.read_by}` : ""}{n.read_at ? ` · ${new Date(n.read_at).toLocaleString("tr-TR")}` : ""}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-blue-600 font-medium">Yeni</span>
                )}
                {n.link && <button onClick={() => nav(n.link)} className="text-slate-500 hover:text-slate-900 underline">Git →</button>}
              </div>
            </div>
            {!n.read && (
              <Button variant="ghost" size="sm" onClick={() => markOne(n.id)} data-testid={`notif-read-btn-${n.id}`} className="shrink-0 gap-1 text-xs">
                <Check className="w-3.5 h-3.5" /> Okundu
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
