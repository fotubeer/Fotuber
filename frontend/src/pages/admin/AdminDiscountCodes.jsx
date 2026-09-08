import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ticket, CheckCheck, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";

const statusMeta = {
  issued: { label: "Aktif", cls: "bg-amber-100 text-amber-700 border-amber-300" },
  redeemed: { label: "Kullanıldı", cls: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  expired: { label: "Süresi Doldu", cls: "bg-slate-200 text-slate-700 border-slate-300" },
};

const AdminDiscountCodes = () => {
  const [status, setStatus] = useState("issued");
  const [items, setItems] = useState([]);
  const [redeeming, setRedeeming] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/discount-codes", { params: status ? { status_filter: status } : {} })
    .then((r) => setItems(r.data)).catch(() => setItems([]));
  useEffect(load, [status]);

  const redeem = async () => {
    setSaving(true);
    try {
      await api.post(`/discount-codes/${redeeming.id}/redeem`, { note });
      toast.success(`${redeeming.code} kodu kullanıldı olarak işaretlendi.`);
      setRedeeming(null); setNote("");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Bu kod silinsin mi?")) return;
    await api.delete(`/discount-codes/${id}`);
    load(); toast.success("Silindi");
  };

  const total = items.length;
  const active = items.filter((i) => i.status === "issued").length;
  const redeemed = items.filter((i) => i.status === "redeemed").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2" data-testid="admin-discount-title">
          <Ticket className="w-6 h-6 text-[#d4af37]" /> İndirim Kodları
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Sosyal medyada bizi takip eden ziyaretçilerin aldığı kodlar. Kod, müşteri stüdyoya bizzat
          geldiğinde "Kullanıldı" olarak işaretlenmelidir.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Toplam Kod</div>
            <div className="text-3xl font-semibold">{total}</div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-5">
            <div className="text-xs text-amber-700 uppercase tracking-wider mb-2">Aktif (Kullanılmayı Bekliyor)</div>
            <div className="text-3xl font-semibold text-amber-700">{active}</div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-5">
            <div className="text-xs text-emerald-700 uppercase tracking-wider mb-2">Kullanıldı (Stüdyoda)</div>
            <div className="text-3xl font-semibold text-emerald-700">{redeemed}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList>
          <TabsTrigger value="issued">Aktif</TabsTrigger>
          <TabsTrigger value="redeemed">Kullanıldı</TabsTrigger>
          <TabsTrigger value="expired">Süresi Dolmuş</TabsTrigger>
          <TabsTrigger value="">Tümü</TabsTrigger>
        </TabsList>
        <TabsContent value={status} className="mt-4">
          <Card className="border-slate-200">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kod</TableHead>
                    <TableHead>Ad</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead>Takip</TableHead>
                    <TableHead>%</TableHead>
                    <TableHead>Verildi</TableHead>
                    <TableHead>Son Geçerlilik</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead className="text-right">Aksiyon</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-500">Kayıt yok.</TableCell></TableRow>
                  )}
                  {items.map((c) => {
                    const meta = statusMeta[c.status] || { label: c.status, cls: "" };
                    return (
                      <TableRow key={c.id} data-testid={`code-row-${c.id}`}>
                        <TableCell className="font-mono font-semibold text-slate-900">{c.code}</TableCell>
                        <TableCell>{c.name}</TableCell>
                        <TableCell>{c.phone}</TableCell>
                        <TableCell className="text-xs text-slate-500">{(c.platforms_followed || []).join(", ")}</TableCell>
                        <TableCell>%{Math.round(c.discount_percent)}</TableCell>
                        <TableCell className="text-xs">{new Date(c.issued_at).toLocaleDateString("tr-TR")}</TableCell>
                        <TableCell className="text-xs">{c.expires_at ? new Date(c.expires_at).toLocaleDateString("tr-TR") : "—"}</TableCell>
                        <TableCell><Badge className={meta.cls}>{meta.label}</Badge></TableCell>
                        <TableCell className="text-right space-x-1">
                          {c.status === "issued" && (
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" data-testid={`redeem-btn-${c.id}`} onClick={() => setRedeeming(c)}>
                              <CheckCheck className="w-3.5 h-3.5 mr-1" /> Kullanıldı
                            </Button>
                          )}
                          <Button size="sm" variant="destructive" onClick={() => remove(c.id)} data-testid={`delete-code-${c.id}`}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!redeeming} onOpenChange={(o) => !o && setRedeeming(null)}>
        <DialogContent data-testid="redeem-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-emerald-600" /> Kodu Kullanıldı Olarak İşaretle</DialogTitle>
            <DialogDescription>
              Müşteri stüdyoya geldi ve indirimi kullandı. Onay verirseniz kod bir daha kullanılamaz.
            </DialogDescription>
          </DialogHeader>
          {redeeming && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="font-mono text-lg font-semibold">{redeeming.code}</div>
                <div>{redeeming.name} · {redeeming.phone}</div>
                <div className="text-slate-500">%{Math.round(redeeming.discount_percent)} indirim</div>
              </div>
              <div>
                <Label className="text-xs">Not (opsiyonel — hangi randevuda kullanıldı vb.)</Label>
                <Input data-testid="redeem-note" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRedeeming(null)}>Vazgeç</Button>
            <Button data-testid="redeem-confirm" onClick={redeem} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">Kullanıldı</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDiscountCodes;
