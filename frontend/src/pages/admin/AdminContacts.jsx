import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Contact, Download, Search, Building2, User, CalendarClock } from "lucide-react";
import { toast } from "sonner";

const fmtDate = (s) => (s ? String(s).slice(0, 10) : "—");

const AdminContacts = () => {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("members");
  const [q, setQ] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get("/admin/contacts");
      setData(data);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); }, []);

  const list = useMemo(() => {
    if (!data) return [];
    const base = data[tab] || [];
    const s = q.trim().toLowerCase();
    if (!s) return base;
    return base.filter((c) =>
      [c.name, c.email, c.phone, c.company_name].filter(Boolean).some((v) => String(v).toLowerCase().includes(s))
    );
  }, [data, tab, q]);

  const downloadCsv = async () => {
    try {
      const res = await api.get("/admin/export?kind=contacts", { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url; a.download = "fotuber_kisiler.csv"; a.click();
      URL.revokeObjectURL(url);
      toast.success("İndirme başladı");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const tabs = [
    { key: "members", label: "Üyeler", icon: Building2 },
    { key: "customers", label: "Müşteriler", icon: User },
    { key: "booking_contacts", label: "Randevu Kişileri", icon: CalendarClock },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2" data-testid="admin-contacts-title">
            <Contact className="w-6 h-6 text-slate-700" /> Kişiler
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Siteye firma, şahıs veya müşteri olarak bilgi bırakan herkes. Tüm iletişim bilgilerine buradan erişebilirsiniz.
          </p>
        </div>
        <Button variant="outline" onClick={downloadCsv} data-testid="contacts-export-btn">
          <Download className="w-4 h-4 mr-2" /> CSV İndir
        </Button>
      </div>

      {data && (
        <div className="grid grid-cols-3 gap-3">
          {tabs.map((t) => (
            <Card key={t.key} className="border-slate-200">
              <CardContent className="py-4">
                <div className="text-2xl font-extrabold text-slate-800">{data.counts[t.key] ?? 0}</div>
                <div className="text-xs text-slate-500">{t.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-slate-200">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <CardTitle className="text-base font-semibold">Kişi Listesi</CardTitle>
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara" className="pl-8" data-testid="contacts-search" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs value={tab} onValueChange={setTab}>
            <div className="px-4 pt-2">
              <TabsList>
                {tabs.map((t) => <TabsTrigger key={t.key} value={t.key} data-testid={`ctab-${t.key}`}>{t.label}</TabsTrigger>)}
              </TabsList>
            </div>
            <TabsContent value={tab} className="mt-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ad Soyad</TableHead>
                    <TableHead>E-posta</TableHead>
                    <TableHead>Telefon</TableHead>
                    {tab === "members" && <TableHead>Firma</TableHead>}
                    {tab === "members" && <TableHead>Durum</TableHead>}
                    {tab === "booking_contacts" && <TableHead>2. Telefon</TableHead>}
                    <TableHead>{tab === "booking_contacts" ? "Son Randevu" : "Kayıt"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">Kayıt yok.</TableCell></TableRow>
                  )}
                  {list.map((c, i) => (
                    <TableRow key={c.id || `${c.phone}-${i}`} data-testid="contact-row">
                      <TableCell className="font-medium">{c.name || "—"}</TableCell>
                      <TableCell className="text-slate-600">{c.email || "—"}</TableCell>
                      <TableCell className="text-slate-600">{c.phone || "—"}</TableCell>
                      {tab === "members" && <TableCell className="text-slate-600">{c.company_name || "—"}</TableCell>}
                      {tab === "members" && (
                        <TableCell>
                          <Badge variant="outline">{c.account_type === "firma" ? "Firma" : "Şahıs"} · {c.status}</Badge>
                        </TableCell>
                      )}
                      {tab === "booking_contacts" && <TableCell className="text-slate-600">{c.phone_2 || "—"}</TableCell>}
                      <TableCell className="text-slate-600">{fmtDate(c.last_date || c.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminContacts;
