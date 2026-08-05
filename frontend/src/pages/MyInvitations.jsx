import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast, Toaster } from "sonner";
import { Loader2, Plus, ExternalLink, BarChart3, Download, Trash2, Users, MessageCircleHeart, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { EVENT_TYPE_LABELS } from "@/lib/invitationThemes";

const API = process.env.REACT_APP_BACKEND_URL;
const api = (path, opts = {}) => fetch(`${API}/api${path}`, { credentials: "include", ...opts });

export default function MyInvitations() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [items, setItems] = useState([]);
  const [report, setReport] = useState(null);
  const [auth, setAuth] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const meRes = await api("/member/me");
      if (!meRes.ok) { setMe(null); setLoading(false); return; }
      const md = await meRes.json();
      if (md.user?.role !== "member") { setMe(null); setLoading(false); return; }
      setMe(md);
      const r = await api("/invitations");
      if (r.ok) { const d = await r.json(); setItems(d.invitations || []); }
    } catch (e) { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const login = async () => {
    setBusy(true);
    try {
      const r = await api("/member/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(auth) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Giriş başarısız");
      setLoading(true); await load();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const openReport = async (id) => {
    try {
      const r = await api(`/invitations/${id}/report`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Rapor alınamadı");
      setReport(d);
    } catch (e) { toast.error(e.message); }
  };

  const downloadCsv = async (id, slug) => {
    try {
      const r = await api(`/invitations/${id}/report.csv`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `davetiye_${slug}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error("İndirilemedi"); }
  };

  const remove = async (id) => {
    if (!window.confirm("Bu davetiye ve tüm yanıtları silinsin mi?")) return;
    try {
      const r = await api(`/invitations/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setItems((x) => x.filter((i) => i.id !== id));
      toast.success("Silindi");
    } catch (e) { toast.error("Silinemedi"); }
  };

  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-950 text-white"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  if (!me) return (
    <div className="min-h-screen grid place-items-center bg-slate-950 text-white px-4">
      <Toaster position="top-center" richColors />
      <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
        <h1 className="text-xl font-bold mb-1">Davetiyelerim</h1>
        <p className="text-sm text-slate-400 mb-4">Davetiyelerinizi görmek için giriş yapın.</p>
        <div className="space-y-2 text-left">
          <Input type="email" placeholder="E-posta" value={auth.email} onChange={(e) => setAuth({ ...auth, email: e.target.value })} data-testid="myinv-email" />
          <Input type="password" placeholder="Şifre" value={auth.password} onChange={(e) => setAuth({ ...auth, password: e.target.value })} data-testid="myinv-password" />
        </div>
        <Button onClick={login} disabled={busy} className="w-full mt-3 bg-indigo-600 hover:bg-indigo-700" data-testid="myinv-login">
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Giriş Yap
        </Button>
        <Link to="/davetiye-olustur" className="block mt-4 text-sm text-indigo-400" data-testid="myinv-create-link">+ Yeni Davetiye Oluştur</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 py-10 px-4">
      <Toaster position="top-center" richColors />
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Davetiyelerim</h1>
            <p className="text-sm text-slate-500">Yanıtları (LCV) ve anıları buradan takip edin.</p>
          </div>
          <Link to="/davetiye-olustur"><Button className="bg-indigo-600 hover:bg-indigo-700" data-testid="new-invitation-btn"><Plus className="w-4 h-4 mr-1" /> Yeni</Button></Link>
        </div>

        {items.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center text-slate-500 border border-slate-200">
            Henüz davetiyeniz yok. <Link to="/davetiye-olustur" className="text-indigo-600 font-medium">İlk davetiyenizi oluşturun →</Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {items.map((inv) => (
              <div key={inv.id} className="bg-white rounded-2xl border border-slate-200 p-5" data-testid={`inv-card-${inv.id}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <Badge variant="outline" className="mb-1">{EVENT_TYPE_LABELS[inv.event_type] || "Etkinlik"}</Badge>
                    <div className="text-lg font-semibold text-slate-900">{inv.person2 ? `${inv.person1} & ${inv.person2}` : inv.person1}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-1"><Calendar className="w-3 h-3" /> {inv.event_date}</div>
                  </div>
                  {inv.expired && <Badge className="bg-slate-200 text-slate-600">Süresi doldu</Badge>}
                </div>
                <div className="flex items-center gap-4 mt-3 text-sm">
                  <span className="flex items-center gap-1 text-emerald-600"><Users className="w-4 h-4" /> {inv.stats.rsvp_yes}/{inv.stats.rsvp_total}</span>
                  <span className="flex items-center gap-1 text-rose-500"><MessageCircleHeart className="w-4 h-4" /> {inv.stats.memories}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <a href={`/davetiye/${inv.slug}`} target="_blank" rel="noreferrer"><Button variant="outline" size="sm" className="w-full" data-testid={`inv-view-${inv.id}`}><ExternalLink className="w-4 h-4 mr-1" /> Aç</Button></a>
                  <Button variant="outline" size="sm" onClick={() => openReport(inv.id)} data-testid={`inv-report-${inv.id}`}><BarChart3 className="w-4 h-4 mr-1" /> Rapor</Button>
                  <Button variant="outline" size="sm" onClick={() => downloadCsv(inv.id, inv.slug)} data-testid={`inv-csv-${inv.id}`}><Download className="w-4 h-4 mr-1" /> CSV</Button>
                  <Button variant="outline" size="sm" className="text-rose-600 hover:bg-rose-50" onClick={() => remove(inv.id)} data-testid={`inv-delete-${inv.id}`}><Trash2 className="w-4 h-4 mr-1" /> Sil</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!report} onOpenChange={(o) => !o && setReport(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="report-dialog">
          {report && (<>
            <DialogHeader><DialogTitle>{report.invitation.person2 ? `${report.invitation.person1} & ${report.invitation.person2}` : report.invitation.person1} — Rapor</DialogTitle>
            <DialogDescription>Katılım yanıtları, kişi sayısı ve misafir anıları.</DialogDescription></DialogHeader>
            <div className="grid grid-cols-4 gap-2 text-center my-2">
              {[["Geliyor", report.stats.attending], ["Gelemiyor", report.stats.declined], ["Toplam Kişi", report.stats.total_guests], ["Anı", report.stats.memories]].map(([l, v]) => (
                <div key={l} className="rounded-lg border border-slate-200 p-2"><div className="text-xl font-bold">{v}</div><div className="text-[10px] text-slate-500">{l}</div></div>
              ))}
            </div>
            <div className="mt-3">
              <div className="text-sm font-semibold mb-1">Katılım Yanıtları</div>
              {report.rsvps.length === 0 ? <div className="text-xs text-slate-400">Henüz yanıt yok.</div> : (
                <div className="space-y-1">
                  {report.rsvps.map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-sm border-b border-slate-100 py-1">
                      <span>{r.name} {r.surname} {r.attending ? `(${r.guest_count} kişi)` : ""}</span>
                      <Badge className={r.attending ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}>{r.attending ? "Geliyor" : "Gelemiyor"}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-4">
              <div className="text-sm font-semibold mb-1">Anılar & Dilekler</div>
              {report.memories.length === 0 ? <div className="text-xs text-slate-400">Henüz anı yok.</div> : (
                <div className="space-y-2">
                  {report.memories.map((m) => (
                    <div key={m.id} className="rounded-lg bg-slate-50 p-2 text-sm"><b>{m.name}:</b> {m.message}</div>
                  ))}
                </div>
              )}
            </div>
          </>)}
        </DialogContent>
      </Dialog>
    </div>
  );
}
