import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, XCircle, Wallet, Phone, Bell, Send, FileText, Upload, UserPlus, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/api";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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
  const [messaging, setMessaging] = useState(null);
  const [sending, setSending] = useState(false);
  const [contract, setContract] = useState(null);  // {appt} for upload dialog
  const [contractFile, setContractFile] = useState(null);
  const [contractUploading, setContractUploading] = useState(false);
  const [walkin, setWalkin] = useState(null);  // walk-in creation dialog state
  const [walkinSaving, setWalkinSaving] = useState(false);
  const [services, setServices] = useState([]);

  useEffect(() => { api.get("/services").then((r) => setServices(r.data)); }, []);

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

  const sendReminder = async (id) => {
    try {
      const { data } = await api.post(`/appointments/${id}/send-reminder`);
      const sent = data.diagnostics?.sent?.length || 0;
      const skipped = data.diagnostics?.skipped || [];
      const errors = data.diagnostics?.errors || [];
      if (sent > 0) toast.success(`Hatırlatma gönderildi (${sent} kanal)`);
      else if (skipped.length) toast.warning(`Gönderilemedi: ${skipped.join(", ")}`);
      else if (errors.length) toast.error(errors.join(", "));
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const openMessage = (appt) => setMessaging({ appt, body: "", extra: "" });

  const doSendMessage = async () => {
    if (!messaging?.body?.trim()) { toast.error("Mesaj yazın"); return; }
    setSending(true);
    try {
      const { data } = await api.post(`/appointments/${messaging.appt.id}/send-message`, {
        body: messaging.body,
        to_customer: true,
        extra_numbers: messaging.extra || null,
      });
      const sent = data.diagnostics?.sent?.length || 0;
      const errs = data.diagnostics?.errors || [];
      if (sent > 0) toast.success(`Mesaj gönderildi (${sent} kanal)`);
      else if (errs.length) toast.error(errs.join(", "));
      else toast.warning("Hiçbir yere gönderilmedi (Twilio ayarlarınızı kontrol edin)");
      setMessaging(null);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSending(false); }
  };

  const uploadContract = async () => {
    if (!contractFile) { toast.error("Dosya seçin"); return; }
    setContractUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", contractFile);
      await api.post(`/appointments/${contract.appt.id}/contract`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Sözleşme yüklendi");
      setContract(null); setContractFile(null);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setContractUploading(false); }
  };

  const deleteContract = async (aid) => {
    if (!window.confirm("Yüklü sözleşme kaldırılsın mı?")) return;
    await api.delete(`/appointments/${aid}/contract`);
    toast.success("Sözleşme kaldırıldı");
    load();
  };

  const saveWalkin = async () => {
    if (!walkin.customer_name || !walkin.customer_phone || !walkin.service_id || !walkin.date || !walkin.time) {
      toast.error("Tüm zorunlu alanları doldurun");
      return;
    }
    setWalkinSaving(true);
    try {
      const payload = {
        ...walkin,
        deposit_amount: Number(walkin.deposit_amount || 0),
        paid_amount: Number(walkin.paid_amount || 0),
        total_amount: walkin.total_amount ? Number(walkin.total_amount) : null,
      };
      const { data } = await api.post("/appointments/walkin", payload);
      toast.success("Fiziki randevu oluşturuldu ve onaylandı.");
      // If they attached a file, upload it now
      if (walkin.file) {
        try {
          const fd = new FormData();
          fd.append("file", walkin.file);
          await api.post(`/appointments/${data.id}/contract`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        } catch (_) { toast.warning("Sözleşme dosyası yüklenemedi, randevuya sonra ekleyebilirsiniz."); }
      }
      setWalkin(null);
      setStatus("approved");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setWalkinSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="admin-appointments-title">Randevular</h1>
          <p className="text-sm text-slate-500 mt-1">Talepleri onaylayın, kapora ekleyin veya iptal edin.</p>
        </div>
        <Button
          data-testid="walkin-add-btn"
          onClick={() => setWalkin({
            customer_name: "", customer_phone: "", customer_email: "",
            service_id: services[0]?.id || "", date: new Date().toISOString().slice(0,10),
            time: "10:00", deposit_amount: "0", paid_amount: "0", total_amount: "",
            notes: "Fiziki randevu (yüzyüze imzalanmış sözleşme)", auto_approve: true, file: null,
          })}
          className="bg-slate-900 hover:bg-slate-800"
        >
          <UserPlus className="w-4 h-4 mr-2" /> Fiziki Randevu Ekle
        </Button>
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
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {a.customer_name}
                          {a.origin === "walkin" && (
                            <Badge variant="outline" className="text-[10px] bg-slate-100 border-slate-300">Fiziki</Badge>
                          )}
                          {a.origin === "online" && a.physical_contract_needed && !a.contract_file_id && (
                            <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300 gap-1" title="Fiziki sözleşme için müşteriyi aramalısınız">
                              📞 Aranacak
                            </Badge>
                          )}
                          {a.contract_file_id && (
                            <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300 gap-1">
                              <FileText className="w-3 h-3" /> Sözleşme var
                            </Badge>
                          )}
                        </div>
                      </TableCell>
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
                        {a.status === "approved" && (
                          <Button size="sm" variant="outline" data-testid={`remind-btn-${a.id}`} onClick={() => sendReminder(a.id)} title="Hatırlatma gönder">
                            <Bell className="w-3.5 h-3.5 mr-1" /> Hatırlat
                          </Button>
                        )}
                        <Button size="sm" variant="outline" data-testid={`msg-btn-${a.id}`} onClick={() => openMessage(a)} title="Özel mesaj gönder">
                          <Send className="w-3.5 h-3.5" />
                        </Button>
                        {a.contract_file_id ? (
                          <>
                            <a
                              href={`${API_BASE}/appointments/${a.id}/contract`}
                              target="_blank"
                              rel="noopener noreferrer"
                              data-testid={`view-contract-${a.id}`}
                              title="Yüklü sözleşmeyi görüntüle"
                            >
                              <Button size="sm" variant="outline">
                                <FileText className="w-3.5 h-3.5" />
                              </Button>
                            </a>
                          </>
                        ) : (
                          <Button size="sm" variant="outline" data-testid={`upload-contract-${a.id}`} onClick={() => { setContract({ appt: a }); setContractFile(null); }} title="Islak imzalı sözleşmeyi yükle">
                            <Upload className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {a.status === "cancelled" && (
                          <Button size="sm" variant="destructive" data-testid={`delete-btn-${a.id}`}
                            onClick={async () => {
                              if (!window.confirm("Bu randevu KALICI olarak silinsin mi? Geri alınamaz.")) return;
                              try {
                                await api.delete(`/appointments/${a.id}`);
                                toast.success("Randevu kalıcı olarak silindi.");
                                load();
                              } catch (e) { toast.error(formatApiError(e)); }
                            }}
                            title="Kalıcı olarak sil"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" /> Kalıcı Sil
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
      <Dialog open={!!messaging} onOpenChange={(o) => !o && setMessaging(null)}>
        <DialogContent data-testid="custom-message-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Send className="w-5 h-5 text-blue-600" /> Özel Mesaj Gönder</DialogTitle>
            <DialogDescription>
              Müşteriye SMS/WhatsApp üzerinden ek bilgi (konum, hazırlık, kıyafet vb.) gönderin.
              Şu değişkenleri kullanabilirsiniz: <code>{"{ad}"}</code> <code>{"{tarih}"}</code> <code>{"{saat}"}</code> <code>{"{adres}"}</code> <code>{"{harita_link}"}</code>
            </DialogDescription>
          </DialogHeader>
          {messaging && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg bg-slate-50 p-3">
                <div><b>{messaging.appt.customer_name}</b> · {messaging.appt.customer_phone}</div>
                <div className="text-slate-500">{messaging.appt.service_name} · {messaging.appt.date} {messaging.appt.time}</div>
              </div>
              <div>
                <Label className="text-xs">Mesaj Metni</Label>
                <Textarea
                  data-testid="custom-msg-body"
                  rows={5}
                  value={messaging.body}
                  onChange={(e) => setMessaging({ ...messaging, body: e.target.value })}
                  placeholder="Merhaba {ad}, hazırlığınızı bitirdiğinizde adresimize gelmeniz yeterli: {adres}. Yol tarifi: {harita_link}"
                />
              </div>
              <div>
                <Label className="text-xs">Ek Numaralar (opsiyonel, virgülle ayır)</Label>
                <Input
                  data-testid="custom-msg-extra"
                  value={messaging.extra}
                  onChange={(e) => setMessaging({ ...messaging, extra: e.target.value })}
                  placeholder="05011112233"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMessaging(null)}>Vazgeç</Button>
            <Button data-testid="custom-msg-send-btn" onClick={doSendMessage} disabled={sending} className="bg-blue-600 hover:bg-blue-700">
              {sending ? "Gönderiliyor..." : (<><Send className="w-4 h-4 mr-2" /> Gönder</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Textarea import at top of file */}

      {/* Sözleşme Yükleme Dialog */}
      <Dialog open={!!contract} onOpenChange={(o) => !o && setContract(null)}>
        <DialogContent data-testid="contract-upload-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-emerald-600" /> Islak İmzalı Sözleşmeyi Yükle</DialogTitle>
            <DialogDescription>
              Müşterinin elle imzaladığı sözleşmenin fotoğrafını çekin veya taratın, buraya yükleyin.
              PDF, PNG, JPG, WEBP kabul edilir.
            </DialogDescription>
          </DialogHeader>
          {contract && (
            <div className="space-y-3">
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <div><b>{contract.appt.customer_name}</b> · {contract.appt.customer_phone}</div>
                <div className="text-slate-500">{contract.appt.service_name} · {contract.appt.date} {contract.appt.time}</div>
              </div>
              <div>
                <Label className="text-xs">Sözleşme dosyası</Label>
                <Input
                  type="file"
                  data-testid="contract-file-input"
                  accept="image/*,application/pdf"
                  onChange={(e) => setContractFile(e.target.files?.[0] || null)}
                />
                {contractFile && (
                  <div className="text-xs text-slate-500 mt-1">
                    {contractFile.name} · {(contractFile.size / 1024).toFixed(0)} KB
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setContract(null)}>Vazgeç</Button>
            <Button data-testid="contract-upload-btn" onClick={uploadContract} disabled={contractUploading || !contractFile} className="bg-emerald-600 hover:bg-emerald-700">
              <Upload className="w-4 h-4 mr-2" /> {contractUploading ? "Yükleniyor..." : "Yükle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fiziki Randevu Oluştur Dialog */}
      <Dialog open={!!walkin} onOpenChange={(o) => !o && setWalkin(null)}>
        <DialogContent className="max-w-lg" data-testid="walkin-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5 text-slate-700" /> Fiziki Randevu Ekle</DialogTitle>
            <DialogDescription>
              Yüzyüze alınan randevuyu buraya kaydedin. Elle imzalanan sözleşmeyi hemen ekleyebilirsiniz.
            </DialogDescription>
          </DialogHeader>
          {walkin && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 md:col-span-1">
                <Label className="text-xs">Ad Soyad *</Label>
                <Input data-testid="walkin-name" value={walkin.customer_name} onChange={(e) => setWalkin({ ...walkin, customer_name: e.target.value })} />
              </div>
              <div className="col-span-2 md:col-span-1">
                <Label className="text-xs">Telefon *</Label>
                <Input data-testid="walkin-phone" value={walkin.customer_phone} onChange={(e) => setWalkin({ ...walkin, customer_phone: e.target.value })} placeholder="05011112233" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">E-posta (opsiyonel)</Label>
                <Input value={walkin.customer_email} onChange={(e) => setWalkin({ ...walkin, customer_email: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Hizmet *</Label>
                <Select value={walkin.service_id} onValueChange={(v) => setWalkin({ ...walkin, service_id: v })}>
                  <SelectTrigger data-testid="walkin-service"><SelectValue placeholder="Hizmet seçin" /></SelectTrigger>
                  <SelectContent>
                    {services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · ₺{Number(s.price).toLocaleString("tr-TR")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Tarih *</Label>
                <Input data-testid="walkin-date" type="date" value={walkin.date} onChange={(e) => setWalkin({ ...walkin, date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Saat *</Label>
                <Select value={walkin.time} onValueChange={(v) => setWalkin({ ...walkin, time: v })}>
                  <SelectTrigger data-testid="walkin-time"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({length: 11}).map((_, i) => {
                      const h = String(9 + i).padStart(2, "0") + ":00";
                      return <SelectItem key={h} value={h}>{h}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Alınan Kapora (₺)</Label>
                <Input type="number" value={walkin.deposit_amount} onChange={(e) => setWalkin({ ...walkin, deposit_amount: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Ödenen Toplam (₺)</Label>
                <Input type="number" value={walkin.paid_amount} onChange={(e) => setWalkin({ ...walkin, paid_amount: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Toplam Ücret (boş bırakırsanız hizmet fiyatı kullanılır)</Label>
                <Input type="number" value={walkin.total_amount} onChange={(e) => setWalkin({ ...walkin, total_amount: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">İmzalı Sözleşme (fotoğraf veya PDF)</Label>
                <Input
                  type="file"
                  data-testid="walkin-contract-file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setWalkin({ ...walkin, file: e.target.files?.[0] || null })}
                />
                {walkin.file && (
                  <div className="text-xs text-slate-500 mt-1">{walkin.file.name}</div>
                )}
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Notlar</Label>
                <Textarea rows={2} value={walkin.notes} onChange={(e) => setWalkin({ ...walkin, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setWalkin(null)}>Vazgeç</Button>
            <Button data-testid="walkin-save-btn" onClick={saveWalkin} disabled={walkinSaving} className="bg-slate-900 hover:bg-slate-800">
              {walkinSaving ? "Oluşturuluyor..." : "Onayla ve Ekle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminAppointments;
