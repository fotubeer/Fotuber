import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, XCircle, Wallet, Phone } from "lucide-react";
import { toast } from "sonner";

const statusColor = {
  pending: "bg-amber-100 text-amber-700 border-amber-300",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-300",
  cancelled: "bg-red-100 text-red-700 border-red-300",
};
const statusLabel = { pending: "Beklemede", approved: "Onaylandı", cancelled: "İptal" };

const AdminAppointments = () => {
  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState([]);
  const [approving, setApproving] = useState(null);
  const [deposit, setDeposit] = useState("");
  const [paid, setPaid] = useState("");

  const load = () => {
    api.get("/appointments", { params: { status_filter: status } })
      .then((r) => setItems(r.data))
      .catch(() => setItems([]));
  };
  useEffect(load, [status]);

  const doApprove = async () => {
    try {
      await api.patch(`/appointments/${approving.id}`, {
        status: "approved",
        deposit_amount: deposit ? Number(deposit) : 0,
        paid_amount: paid ? Number(paid) : (deposit ? Number(deposit) : 0),
      });
      toast.success("Randevu onaylandı ve saat kapatıldı.");
      setApproving(null);
      setDeposit(""); setPaid("");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const cancel = async (id) => {
    if (!window.confirm("Randevu iptal edilsin mi?")) return;
    try {
      await api.patch(`/appointments/${id}`, { status: "cancelled" });
      toast.success("Randevu iptal edildi.");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight" data-testid="admin-appointments-title">Randevular</h1>
        <p className="text-sm text-slate-500 mt-1">Talepleri onaylayın, kapora ekleyin veya iptal edin.</p>
      </div>

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList data-testid="admin-appts-tabs">
          <TabsTrigger value="pending" data-testid="tab-pending">Bekleyenler</TabsTrigger>
          <TabsTrigger value="approved" data-testid="tab-approved">Onaylılar</TabsTrigger>
          <TabsTrigger value="cancelled" data-testid="tab-cancelled">İptaller</TabsTrigger>
        </TabsList>

        <TabsContent value={status}>
          <Card className="border-slate-200 mt-4">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Müşteri</TableHead>
                    <TableHead>Hizmet</TableHead>
                    <TableHead>Tarih / Saat</TableHead>
                    <TableHead>İletişim</TableHead>
                    <TableHead>Kapora</TableHead>
                    <TableHead>Ücret</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead className="text-right">Aksiyon</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-slate-500 py-10">Kayıt yok.</TableCell></TableRow>
                  )}
                  {items.map((a) => (
                    <TableRow key={a.id} data-testid={`admin-appt-row-${a.id}`}>
                      <TableCell className="font-medium">{a.customer_name}</TableCell>
                      <TableCell>{a.service_name}</TableCell>
                      <TableCell><span className="font-medium">{a.date}</span> · {a.time}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs"><Phone className="w-3 h-3" /> {a.customer_phone}</div>
                        <div className="text-xs text-slate-500">{a.customer_email}</div>
                      </TableCell>
                      <TableCell>₺{Number(a.deposit_amount || 0).toLocaleString("tr-TR")}</TableCell>
                      <TableCell>₺{Number(a.total_amount || 0).toLocaleString("tr-TR")}</TableCell>
                      <TableCell><Badge className={statusColor[a.status]}>{statusLabel[a.status]}</Badge></TableCell>
                      <TableCell className="text-right space-x-2">
                        {a.status !== "approved" && (
                          <Button size="sm" data-testid={`approve-btn-${a.id}`}
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => { setApproving(a); setDeposit(String(a.deposit_amount || 0)); setPaid(String(a.paid_amount || 0)); }}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Onayla
                          </Button>
                        )}
                        {a.status !== "cancelled" && (
                          <Button size="sm" variant="destructive" data-testid={`cancel-btn-${a.id}`} onClick={() => cancel(a.id)}>
                            <XCircle className="w-3.5 h-3.5 mr-1" /> İptal
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!approving} onOpenChange={(o) => !o && setApproving(null)}>
        <DialogContent data-testid="approve-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wallet className="w-5 h-5 text-emerald-600" /> Randevu Onayla</DialogTitle>
            <DialogDescription>
              Onayladığınızda bu saat diğer müşterilere kapalı hale gelecektir. Alınan
              kapora ve toplam ödenen tutarı girin.
            </DialogDescription>
          </DialogHeader>
          {approving && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg bg-slate-50 p-3">
                <div><b>{approving.customer_name}</b> · {approving.customer_phone}</div>
                <div className="text-slate-500">{approving.service_name} · {approving.date} {approving.time}</div>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Alınan Kapora (₺)</Label>
                <Input data-testid="approve-deposit" type="number" min="0" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-slate-500">Ödenmiş Toplam Tutar (₺)</Label>
                <Input data-testid="approve-paid" type="number" min="0" value={paid} onChange={(e) => setPaid(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproving(null)}>Vazgeç</Button>
            <Button data-testid="approve-confirm" className="bg-emerald-600 hover:bg-emerald-700" onClick={doApprove}>Onayla ve Kapat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminAppointments;
