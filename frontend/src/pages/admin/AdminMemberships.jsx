import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BadgeCheck, Download, Search, Building2, User, CalendarCheck, KeyRound, Sparkles, CreditCard, Mail } from "lucide-react";
import { toast } from "sonner";

const GROUPS = [
  { key: "trial", label: "Deneme", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  { key: "monthly", label: "Aylık", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  { key: "yearly", label: "Yıllık", cls: "bg-indigo-100 text-indigo-800 border-indigo-300" },
  { key: "expired", label: "Süresi Dolan", cls: "bg-slate-100 text-slate-600 border-slate-300" },
];

const fmtDate = (s) => (s ? String(s).slice(0, 10) : "—");

const AdminMemberships = () => {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState(null);
  const [emailStatus, setEmailStatus] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/admin/memberships");
      setData(data);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const loadEmail = async () => {
    try { const { data } = await api.get("/admin/email-status"); setEmailStatus(data); } catch (e) { /* ignore */ }
  };
  useEffect(() => { load(); loadEmail(); }, []);

  const sendTestEmail = async () => {
    try {
      const { data } = await api.post("/admin/email-test", {});
      toast.success(`Test e-postası gönderildi: ${data.to}`);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const sendReminders = async () => {
    try {
      const { data } = await api.post("/admin/send-reminders", {});
      toast.success(`Hatırlatma taraması tamam: ${data.sent} e-posta gönderildi (${data.checked} üye tarandı)`);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const rows = useMemo(() => {
    if (!data) return [];
    const base = tab === "all" ? data.members : (data.groups[tab] || []);
    const s = q.trim().toLowerCase();
    if (!s) return base;
    return base.filter((m) =>
      [m.name, m.email, m.phone, m.company_name].filter(Boolean).some((v) => String(v).toLowerCase().includes(s))
    );
  }, [data, tab, q]);

  const downloadCsv = async (kind, filename) => {
    try {
      const res = await api.get(`/admin/export?kind=${kind}`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      toast.success("İndirme başladı");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const groupBadge = (m) => {
    const key = m.status === "trial" ? "trial" : m.status === "active" ? (m.plan === "yearly" ? "yearly" : "monthly") : "expired";
    const g = GROUPS.find((x) => x.key === key);
    return <Badge className={`${g.cls} gap-1`}>{g.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2" data-testid="admin-memberships-title">
            <BadgeCheck className="w-6 h-6 text-indigo-600" /> Üyelikler
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Üyelik yapan herkes üyelik türüne göre gruplanır. Her üyenin bilgileri, satın alımları,
            randevu durumu ve kullandığı özellikler raporlanır.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => downloadCsv("contacts", "fotuber_kisiler.csv")} data-testid="export-contacts-btn">
            <Download className="w-4 h-4 mr-2" /> İletişim Bilgileri
          </Button>
          <Button onClick={() => downloadCsv("memberships", "fotuber_uyelikler.csv")} className="bg-indigo-600 hover:bg-indigo-700" data-testid="export-detailed-btn">
            <Download className="w-4 h-4 mr-2" /> Detaylı Rapor
          </Button>
        </div>
      </div>

      <Card className="border-slate-200">
        <CardContent className="py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Mail className="w-4 h-4 text-slate-500" />
            {emailStatus?.configured
              ? <span className="text-slate-600">E-posta aktif · Gönderen: <b>{emailStatus.sender}</b></span>
              : <span className="text-amber-600">E-posta yapılandırılmamış (GMAIL_USER / GMAIL_APP_PASSWORD gerekli)</span>}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={!emailStatus?.configured} onClick={sendTestEmail} data-testid="email-test-btn">Test E-postası</Button>
            <Button size="sm" variant="outline" disabled={!emailStatus?.configured} onClick={sendReminders} data-testid="send-reminders-btn">Hatırlatmaları Gönder</Button>
          </div>
        </CardContent>
      </Card>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[{ key: "total", label: "Toplam" }, ...GROUPS].map((g) => (
            <Card key={g.key} className="border-slate-200">
              <CardContent className="py-4">
                <div className="text-2xl font-extrabold text-slate-800">{data.counts[g.key] ?? 0}</div>
                <div className="text-xs text-slate-500">{g.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-slate-200">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <CardTitle className="text-base font-semibold">Üye Listesi</CardTitle>
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad, e-posta, telefon, firma ara" className="pl-8" data-testid="memberships-search" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs value={tab} onValueChange={setTab}>
            <div className="px-4 pt-2">
              <TabsList>
                <TabsTrigger value="all" data-testid="tab-all">Tümü</TabsTrigger>
                {GROUPS.map((g) => <TabsTrigger key={g.key} value={g.key} data-testid={`tab-${g.key}`}>{g.label}</TabsTrigger>)}
              </TabsList>
            </div>
            <TabsContent value={tab} className="mt-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Üye</TableHead>
                    <TableHead>İletişim</TableHead>
                    <TableHead>Tür</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>Bitiş</TableHead>
                    <TableHead>Kredi</TableHead>
                    <TableHead>Harcama</TableHead>
                    <TableHead>Randevu</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-500">Kayıt yok.</TableCell></TableRow>
                  )}
                  {rows.map((m) => (
                    <TableRow key={m.id} data-testid={`membership-row-${m.id}`}>
                      <TableCell>
                        <div className="font-medium flex items-center gap-1.5">
                          {m.account_type === "firma" ? <Building2 className="w-3.5 h-3.5 text-slate-400" /> : <User className="w-3.5 h-3.5 text-slate-400" />}
                          {m.name}
                        </div>
                        {m.company_name && <div className="text-xs text-slate-500">{m.company_name}</div>}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        <div>{m.email}</div>
                        <div className="text-xs text-slate-400">{m.phone}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{m.account_type === "firma" ? "Firma" : "Şahıs"}</Badge></TableCell>
                      <TableCell>{groupBadge(m)}</TableCell>
                      <TableCell className="text-sm text-slate-600">{fmtDate(m.paid_until || m.trial_end)}</TableCell>
                      <TableCell className="text-sm">{m.ai_credits}</TableCell>
                      <TableCell className="text-sm font-medium">{m.total_spent}₺</TableCell>
                      <TableCell>
                        {m.has_appointment
                          ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1"><CalendarCheck className="w-3 h-3" />{m.appointment_count}</Badge>
                          : <span className="text-xs text-slate-400">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setDetail(m)} data-testid={`membership-detail-${m.id}`}>Detay</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg" data-testid="membership-detail-dialog">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detail.account_type === "firma" ? <Building2 className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  {detail.name} {groupBadge(detail)}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <Info label="E-posta" value={detail.email} />
                  <Info label="Telefon" value={detail.phone} />
                  <Info label="Firma" value={detail.company_name || "—"} />
                  <Info label="Hesap Türü" value={detail.account_type === "firma" ? "Firma" : "Şahıs"} />
                  <Info label="Kayıt" value={fmtDate(detail.created_at)} />
                  <Info label="Son Aktiflik" value={fmtDate(detail.last_active)} />
                  <Info label="Üyelik Bitiş" value={fmtDate(detail.paid_until || detail.trial_end)} />
                  <Info label="Deneme Kullanıldı" value={detail.trial_used_before ? "Evet" : "Hayır"} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Stat icon={CreditCard} label="Toplam Harcama" value={`${detail.total_spent}₺`} />
                  <Stat icon={Sparkles} label="AI Kredi" value={detail.ai_credits} />
                  <Stat icon={CalendarCheck} label="Randevu" value={detail.appointment_count} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Abonelik" value={detail.subscription_count} />
                  <Stat label="Kredi Yükleme" value={detail.credit_topup_count} />
                  <Stat label="Alınan Kredi" value={detail.credits_purchased} />
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1 flex items-center gap-1"><KeyRound className="w-3 h-3" /> Kullandığı Özellikler</div>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.own_gemini_key && <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">Kendi Gemini Anahtarı</Badge>}
                    {(detail.features_labels || []).length === 0 && !detail.own_gemini_key
                      ? <span className="text-xs text-slate-400">Henüz özellik kullanılmadı</span>
                      : (detail.features_labels || []).map((f) => <Badge key={f} variant="outline">{f}</Badge>)}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Info = ({ label, value }) => (
  <div>
    <div className="text-[11px] text-slate-400">{label}</div>
    <div className="text-slate-800 break-words">{value || "—"}</div>
  </div>
);

const Stat = ({ icon: Icon, label, value }) => (
  <div className="rounded-lg border border-slate-200 p-2 text-center">
    <div className="text-lg font-bold text-slate-800 flex items-center justify-center gap-1">{Icon && <Icon className="w-3.5 h-3.5 text-slate-400" />}{value}</div>
    <div className="text-[10px] text-slate-500">{label}</div>
  </div>
);

export default AdminMemberships;
