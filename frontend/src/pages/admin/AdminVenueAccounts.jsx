import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Building2, Plus, Trash2, KeyRound, Power } from "lucide-react";

export default function AdminVenueAccounts() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ email: "", password: "", salon_adi: "", phone: "", city: "" });
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/venue/admin/accounts").then(({ data }) => setRows(data.accounts || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.email || !form.password || !form.salon_adi) { toast.error("E-posta, şifre ve salon adı zorunlu"); return; }
    setBusy(true);
    try {
      await api.post("/venue/admin/accounts", form);
      toast.success("Salon hesabı oluşturuldu");
      setForm({ email: "", password: "", salon_adi: "", phone: "", city: "" });
      load();
    } catch (e) { toast.error(formatApiError(e)); } finally { setBusy(false); }
  };
  const toggle = async (r) => { await api.patch(`/venue/admin/accounts/${r.id}`, { active: !r.active }); load(); };
  const resetPw = async (r) => {
    const pw = prompt(`${r.salon_adi} için yeni şifre (min 6):`);
    if (!pw) return;
    try { await api.patch(`/venue/admin/accounts/${r.id}`, { password: pw }); toast.success("Şifre güncellendi"); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const del = async (r) => { if (!window.confirm(`${r.salon_adi} silinsin mi?`)) return; await api.delete(`/venue/admin/accounts/${r.id}`); load(); };

  return (
    <div className="space-y-6" data-testid="admin-venue-accounts">
      <div className="flex items-center gap-2">
        <Building2 className="text-indigo-600" />
        <h1 className="text-2xl font-bold">Salon Hesapları</h1>
      </div>
      <p className="text-sm text-slate-500 -mt-3">Düğün salonu panel hesapları yalnızca buradan açılır (self-register kapalıdır).</p>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Plus size={16} /> Yeni Salon Hesabı</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div><Label>Salon Adı *</Label><Input data-testid="va-salon" value={form.salon_adi} onChange={(e) => setForm({ ...form, salon_adi: e.target.value })} /></div>
          <div><Label>E-posta *</Label><Input data-testid="va-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>Şifre *</Label><Input data-testid="va-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          <div><Label>Telefon</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Şehir</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          <div className="flex items-end"><Button onClick={create} disabled={busy} data-testid="va-create" className="w-full bg-indigo-600 hover:bg-indigo-700">{busy ? "…" : "Oluştur"}</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Kayıtlı Salonlar ({rows.length})</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {rows.length === 0 && <p className="text-sm text-slate-400 py-4">Henüz salon yok.</p>}
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 py-3" data-testid={`va-row-${r.id}`}>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{r.salon_adi} {r.active ? <Badge className="ml-1 bg-emerald-100 text-emerald-700">Aktif</Badge> : <Badge className="ml-1 bg-slate-200 text-slate-600">Pasif</Badge>}</div>
                <div className="text-xs text-slate-500">{r.email} · {r.city || "—"} · {r.staff_count || 0} personel</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => toggle(r)} data-testid={`va-toggle-${r.id}`}><Power size={14} className="mr-1" />{r.active ? "Pasifleştir" : "Aktifleştir"}</Button>
              <Button size="sm" variant="outline" onClick={() => resetPw(r)}><KeyRound size={14} className="mr-1" />Şifre</Button>
              <Button size="sm" variant="outline" className="text-red-600" onClick={() => del(r)}><Trash2 size={14} /></Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
