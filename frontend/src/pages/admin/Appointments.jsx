import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CheckCircle2, XCircle, Wallet, Phone, Bell, Send, FileText, Upload, UserPlus, Trash2, Eye, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EVENT_TYPES, EVENT_ADDONS } from "@/pages/Booking";

const statusColor = {
  pending: "bg-amber-100 text-amber-700 border-amber-300",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-300",
  cancelled: "bg-red-100 text-red-700 border-red-300",
};
const statusLabel = { pending: "Beklemede", approved: "Onaylandı", cancelled: "İptal" };

const fmt = (n) => `₺${Number(n || 0).toLocaleString("tr-TR")}`;

// Admin sees 24h slots at 30-min intervals
const ADMIN_TIME_SLOTS = (() => {
  const out = [];
  for (let m = 0; m < 24 * 60; m += 30) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    out.push(`${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }
  return out;
})();

const AdminAppointments = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState([]);
  const [approving, setApproving] = useState(null);
  const [deposit, setDeposit] = useState("");
  const [paid, setPaid] = useState("");
  const [messaging, setMessaging] = useState(null);
  const [sending, setSending] = useState(false);
  const [contract, setContract] = useState(null);
  const [contractFile, setContractFile] = useState(null);
  const [contractUploading, setContractUploading] = useState(false);
  const [walkin, setWalkin] = useState(null);
  const [walkinSaving, setWalkinSaving] = useState(false);
  const [services, setServices] = useState([]);
  const [confirmAction, setConfirmAction] = useState(null);
  const [detail, setDetail] = useState(null);              // detail modal state
  const [detailSaving, setDetailSaving] = useState(false);
  const [newMidPayment, setNewMidPayment] = useState({ amount: "", date: new Date().toISOString().slice(0, 10), method: "cash", note: "" });

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

  const cancel = (id) => {
    setConfirmAction({
      type: "cancel", id,
      title: "Randevu iptal edilsin mi?",
      message: "Randevu 'İptaller' sekmesine taşınacak. Kayıt silinmeyecek — istediğinizde geri alabilirsiniz.",
      confirmLabel: "Evet, İptal Et",
      confirmClass: "bg-red-600 hover:bg-red-700",
    });
  };

  const hardDelete = (id) => {
    setConfirmAction({
      type: "delete", id,
      title: "Bu randevu KALICI olarak silinsin mi?",
      message: "Bu işlem geri alınamaz. Randevu veritabanından tamamen silinecek.",
      confirmLabel: "Evet, Kalıcı Sil",
      confirmClass: "bg-red-700 hover:bg-red-800",
    });
  };

  const runConfirmedAction = async () => {
    if (!confirmAction) return;
    try {
      if (confirmAction.type === "cancel") {
        await api.patch(`/appointments/${confirmAction.id}`, { status: "cancelled" });
        toast.success("Randevu iptal edildi.");
      } else if (confirmAction.type === "delete") {
        await api.delete(`/appointments/${confirmAction.id}`);
        toast.success("Randevu kalıcı olarak silindi.");
      } else if (confirmAction.type === "delete_midpayment") {
        const updated = await api.delete(`/appointments/${confirmAction.aid}/mid-payments/${confirmAction.pid}`);
        setDetail(updated.data);
        toast.success("Ara ödeme silindi.");
      }
      if (confirmAction.type !== "delete_midpayment") load();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setConfirmAction(null);
    }
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
      await api.post(`/appointments/${contract.appt.id}/contract`, fd);
      toast.success("Sözleşme yüklendi");
      setContract(null); setContractFile(null);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setContractUploading(false); }
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
      delete payload.file;
      const { data } = await api.post("/appointments/walkin", payload);
      toast.success("Fiziki randevu oluşturuldu ve onaylandı.");
      if (walkin.file) {
        try {
          const fd = new FormData();
          fd.append("file", walkin.file);
          await api.post(`/appointments/${data.id}/contract`, fd);
        } catch (_) { toast.warning("Sözleşme dosyası yüklenemedi, randevuya sonra ekleyebilirsiniz."); }
      }
      setWalkin(null);
      setStatus("approved");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setWalkinSaving(false); }
  };

  // --- Detail modal helpers ---
  const openDetail = async (a) => {
    try {
      const { data } = await api.get(`/appointments/${a.id}`);
      setDetail(data);
    } catch (e) {
      setDetail(a); // fallback to list snapshot
    }
  };

  const saveDetail = async () => {
    if (!detail) return;
    setDetailSaving(true);
    try {
      const patch = {
        customer_name: detail.customer_name,
        customer_phone: detail.customer_phone,
        customer_email: detail.customer_email || "",
        phone_2: detail.phone_2 || "",
        notes: detail.notes || "",
        admin_notes: detail.admin_notes || "",
        event_type: detail.event_type || "",
        event_addons: detail.event_addons || [],
        extra_services_note: detail.extra_services_note || "",
        date: detail.date,
        time: detail.time,
      };
      if (isAdmin) {
        patch.total_amount = Number(detail.total_amount || 0);
        patch.deposit_amount = Number(detail.deposit_amount || 0);
        patch.paid_amount = Number(detail.paid_amount || 0);
      }
      const { data } = await api.patch(`/appointments/${detail.id}`, patch);
      setDetail(data);
      toast.success("Randevu güncellendi.");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setDetailSaving(false); }
  };

  const addMidPayment = async () => {
    if (!isAdmin) return;
    const amt = Number(newMidPayment.amount || 0);
    if (amt <= 0) { toast.error("Geçerli bir tutar girin"); return; }
    try {
      const { data } = await api.post(`/appointments/${detail.id}/mid-payments`, {
        amount: amt,
        date: newMidPayment.date,
        method: newMidPayment.method,
        note: newMidPayment.note || "",
      });
      setDetail(data);
      setNewMidPayment({ amount: "", date: new Date().toISOString().slice(0, 10), method: "cash", note: "" });
      toast.success("Ara ödeme eklendi.");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const removeMidPayment = (aid, pid) => {
    setConfirmAction({
      type: "delete_midpayment", aid, pid,
      title: "Ara ödeme silinsin mi?",
      message: "Bu ara ödeme kaydı kalıcı olarak silinecek.",
      confirmLabel: "Evet, Sil",
      confirmClass: "bg-red-600 hover:bg-red-700",
    });
  };

  const toggleDetailAddon = (key) => {
    setDetail((d) => {
      const addons = new Set(d.event_addons || []);
      if (addons.has(key)) addons.delete(key); else addons.add(key);
      return { ...d, event_addons: Array.from(addons) };
    });
  };

  const eventTypeLabel = (k) => EVENT_TYPES.find((e) => e.key === k)?.label || "—";
  const addonLabel = (etype, key) => (EVENT_ADDONS[etype] || []).find((a) => a.key === key)?.label || key;

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
            customer_name: "", customer_phone: "", customer_email: "", phone_2: "",
            service_id: services[0]?.id || "", date: new Date().toISOString().slice(0, 10),
            time: "10:00", deposit_amount: "0", paid_amount: "0", total_amount: "",
            event_type: "", event_addons: [], extra_services_note: "", admin_notes: "",
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
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Müşteri</TableHead>
                    <TableHead>Etkinlik</TableHead>
                    <TableHead>Tarih / Saat</TableHead>
                    <TableHead>İletişim</TableHead>
                    {isAdmin && <TableHead>Toplam</TableHead>}
                    {isAdmin && <TableHead>Kapora</TableHead>}
                    {isAdmin && <TableHead>Kalan</TableHead>}
                    <TableHead>Durum</TableHead>
                    <TableHead className="text-right">Aksiyon</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 9 : 6} className="text-center text-slate-500 py-10">Kayıt yok.</TableCell>
                    </TableRow>
                  )}
                  {items.map((a) => (
                    <TableRow key={a.id} data-testid={`admin-appt-row-${a.id}`} className="cursor-pointer hover:bg-slate-50" onClick={() => openDetail(a)}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2 flex-wrap">
                          {a.customer_name}
                          {a.origin === "walkin" && (
                            <Badge variant="outline" className="text-[10px] bg-slate-100 border-slate-300">Fiziki</Badge>
                          )}
                          {a.origin === "online" && a.physical_contract_needed && !a.contract_file_id && (
                            <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300 gap-1" title="Fiziki sözleşme için müşteriyi aramalısınız">
                              Aranacak
                            </Badge>
                          )}
                          {a.contract_file_id && (
                            <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300 gap-1">
                              <FileText className="w-3 h-3" /> Sözleşme var
                            </Badge>
                          )}
                          {(a.admin_notes || a.notes) && (
                            <Badge className="text-[10px] bg-blue-100 text-blue-700 border-blue-300">Not</Badge>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">{a.service_name}</div>
                      </TableCell>
                      <TableCell>
                        {a.event_type ? (
                          <div>
                            <div className="text-sm">{eventTypeLabel(a.event_type)}</div>
                            {(a.event_addons?.length || 0) > 0 && (
                              <div className="text-xs text-slate-500 line-clamp-1">
                                {(a.event_addons || []).map((k) => addonLabel(a.event_type, k)).join(", ")}
                              </div>
                            )}
                          </div>
                        ) : <span className="text-slate-400 text-xs">—</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap"><span className="font-medium">{a.date}</span> · {a.time}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs"><Phone className="w-3 h-3" /> {a.customer_phone}</div>
                        {a.phone_2 && <div className="flex items-center gap-1 text-xs"><Phone className="w-3 h-3 text-slate-400" /> {a.phone_2}</div>}
                        <div className="text-xs text-slate-500">{a.customer_email}</div>
                      </TableCell>
                      {isAdmin && <TableCell className="whitespace-nowrap">{fmt(a.total_amount)}</TableCell>}
                      {isAdmin && <TableCell className="whitespace-nowrap">{fmt(a.paid_total ?? a.deposit_amount)}</TableCell>}
                      {isAdmin && (
                        <TableCell className="whitespace-nowrap">
                          <span className={Number(a.remaining_amount || 0) > 0 ? "text-red-600 font-medium" : "text-emerald-600 font-medium"}>
                            {fmt(a.remaining_amount ?? Math.max(0, Number(a.total_amount || 0) - Number(a.paid_amount || 0)))}
                          </span>
                        </TableCell>
                      )}
                      <TableCell><Badge className={statusColor[a.status]}>{statusLabel[a.status]}</Badge></TableCell>
                      <TableCell className="text-right space-x-1 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="outline" data-testid={`detail-btn-${a.id}`} onClick={() => openDetail(a)} title="Detay">
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
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
                            <Bell className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button size="sm" variant="outline" data-testid={`msg-btn-${a.id}`} onClick={() => openMessage(a)} title="Özel mesaj gönder">
                          <Send className="w-3.5 h-3.5" />
                        </Button>
                        {a.contract_file_id ? (
                          <a href={`${API_BASE}/appointments/${a.id}/contract`} target="_blank" rel="noopener noreferrer" data-testid={`view-contract-${a.id}`} title="Yüklü sözleşmeyi görüntüle">
                            <Button size="sm" variant="outline">
                              <FileText className="w-3.5 h-3.5" />
                            </Button>
                          </a>
                        ) : (
                          <Button size="sm" variant="outline" data-testid={`upload-contract-${a.id}`} onClick={() => { setContract({ appt: a }); setContractFile(null); }} title="Islak imzalı sözleşmeyi yükle">
                            <Upload className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {a.status === "cancelled" && (
                          <Button size="sm" variant="destructive" data-testid={`delete-btn-${a.id}`} onClick={() => hardDelete(a.id)} title="Kalıcı olarak sil">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {a.status !== "cancelled" && (
                          <Button size="sm" variant="destructive" data-testid={`cancel-btn-${a.id}`} onClick={() => cancel(a.id)}>
                            <XCircle className="w-3.5 h-3.5" />
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

      {/* Approve dialog */}
      <Dialog open={!!approving} onOpenChange={(o) => !o && setApproving(null)}>
        <DialogContent data-testid="approve-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wallet className="w-5 h-5 text-emerald-600" /> Randevu Onayla</DialogTitle>
            <DialogDescription>Onayladığınızda bu saat diğer müşterilere kapalı hale gelecektir.</DialogDescription>
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

      {/* Custom message dialog */}
      <Dialog open={!!messaging} onOpenChange={(o) => !o && setMessaging(null)}>
        <DialogContent data-testid="custom-message-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Send className="w-5 h-5 text-blue-600" /> Özel Mesaj Gönder</DialogTitle>
            <DialogDescription>Müşteriye SMS/WhatsApp üzerinden ek bilgi gönderin. Değişkenler: <code>{"{ad}"}</code> <code>{"{tarih}"}</code> <code>{"{saat}"}</code> <code>{"{adres}"}</code> <code>{"{harita_link}"}</code></DialogDescription>
          </DialogHeader>
          {messaging && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg bg-slate-50 p-3">
                <div><b>{messaging.appt.customer_name}</b> · {messaging.appt.customer_phone}</div>
                <div className="text-slate-500">{messaging.appt.service_name} · {messaging.appt.date} {messaging.appt.time}</div>
              </div>
              <div>
                <Label className="text-xs">Mesaj Metni</Label>
                <Textarea data-testid="custom-msg-body" rows={5} value={messaging.body} onChange={(e) => setMessaging({ ...messaging, body: e.target.value })} placeholder="Merhaba {ad}, hazırlığınızı bitirdiğinizde adresimize gelmeniz yeterli: {adres}. Yol tarifi: {harita_link}" />
              </div>
              <div>
                <Label className="text-xs">Ek Numaralar (opsiyonel, virgülle ayır)</Label>
                <Input data-testid="custom-msg-extra" value={messaging.extra} onChange={(e) => setMessaging({ ...messaging, extra: e.target.value })} placeholder="05011112233" />
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

      {/* Contract upload dialog */}
      <Dialog open={!!contract} onOpenChange={(o) => !o && setContract(null)}>
        <DialogContent data-testid="contract-upload-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-emerald-600" /> Islak İmzalı Sözleşmeyi Yükle</DialogTitle>
            <DialogDescription>PDF, PNG, JPG, WEBP kabul edilir.</DialogDescription>
          </DialogHeader>
          {contract && (
            <div className="space-y-3">
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <div><b>{contract.appt.customer_name}</b> · {contract.appt.customer_phone}</div>
                <div className="text-slate-500">{contract.appt.service_name} · {contract.appt.date} {contract.appt.time}</div>
              </div>
              <div>
                <Label className="text-xs">Sözleşme dosyası</Label>
                <Input type="file" data-testid="contract-file-input" accept="image/*,application/pdf" onChange={(e) => setContractFile(e.target.files?.[0] || null)} />
                {contractFile && <div className="text-xs text-slate-500 mt-1">{contractFile.name} · {(contractFile.size / 1024).toFixed(0)} KB</div>}
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

      {/* Walk-in dialog */}
      <Dialog open={!!walkin} onOpenChange={(o) => !o && setWalkin(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="walkin-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5 text-slate-700" /> Fiziki Randevu Ekle</DialogTitle>
            <DialogDescription>Yüzyüze alınan randevuyu buraya kaydedin.</DialogDescription>
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
              <div className="col-span-2 md:col-span-1">
                <Label className="text-xs">2. Telefon (opsiyonel)</Label>
                <Input value={walkin.phone_2} onChange={(e) => setWalkin({ ...walkin, phone_2: e.target.value })} placeholder="Eş / Aile" />
              </div>
              <div className="col-span-2 md:col-span-1">
                <Label className="text-xs">E-posta (opsiyonel)</Label>
                <Input value={walkin.customer_email} onChange={(e) => setWalkin({ ...walkin, customer_email: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Hizmet *</Label>
                <Select value={walkin.service_id} onValueChange={(v) => setWalkin({ ...walkin, service_id: v })}>
                  <SelectTrigger data-testid="walkin-service"><SelectValue placeholder="Hizmet seçin" /></SelectTrigger>
                  <SelectContent>
                    {services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {fmt(s.price)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Etkinlik Türü</Label>
                <Select value={walkin.event_type || ""} onValueChange={(v) => setWalkin({ ...walkin, event_type: v, event_addons: [] })}>
                  <SelectTrigger data-testid="walkin-event-type"><SelectValue placeholder="Etkinlik seçin" /></SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((et) => <SelectItem key={et.key} value={et.key}>{et.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {(EVENT_ADDONS[walkin.event_type] || []).length > 0 && (
                <div className="col-span-2 rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500 mb-2">Paket seçenekleri</div>
                  <div className="grid grid-cols-2 gap-2">
                    {EVENT_ADDONS[walkin.event_type].map((a) => (
                      <label key={a.key} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={(walkin.event_addons || []).includes(a.key)}
                          onCheckedChange={() => {
                            const cur = new Set(walkin.event_addons || []);
                            if (cur.has(a.key)) cur.delete(a.key); else cur.add(a.key);
                            setWalkin({ ...walkin, event_addons: Array.from(cur) });
                          }}
                        />
                        {a.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="col-span-2">
                <Label className="text-xs">Ekstra Hizmet Notu</Label>
                <Textarea rows={2} value={walkin.extra_services_note || ""} onChange={(e) => setWalkin({ ...walkin, extra_services_note: e.target.value })} placeholder="Ör: Bebeğe özel çekim, drone çekimi..." />
              </div>
              <div>
                <Label className="text-xs">Tarih *</Label>
                <Input data-testid="walkin-date" type="date" value={walkin.date} onChange={(e) => setWalkin({ ...walkin, date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Saat * (24 saat, 30 dk)</Label>
                <Select value={walkin.time} onValueChange={(v) => setWalkin({ ...walkin, time: v })}>
                  <SelectTrigger data-testid="walkin-time"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {ADMIN_TIME_SLOTS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {isAdmin && (
                <>
                  <div>
                    <Label className="text-xs">Alınan Kapora (₺)</Label>
                    <Input type="number" value={walkin.deposit_amount} onChange={(e) => setWalkin({ ...walkin, deposit_amount: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Ödenen Toplam (₺)</Label>
                    <Input type="number" value={walkin.paid_amount} onChange={(e) => setWalkin({ ...walkin, paid_amount: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Toplam Ücret (boş bırakılırsa hizmet fiyatı kullanılır)</Label>
                    <Input type="number" value={walkin.total_amount} onChange={(e) => setWalkin({ ...walkin, total_amount: e.target.value })} />
                  </div>
                </>
              )}
              <div className="col-span-2">
                <Label className="text-xs">İmzalı Sözleşme (fotoğraf veya PDF)</Label>
                <Input type="file" data-testid="walkin-contract-file" accept="image/*,application/pdf" onChange={(e) => setWalkin({ ...walkin, file: e.target.files?.[0] || null })} />
                {walkin.file && <div className="text-xs text-slate-500 mt-1">{walkin.file.name}</div>}
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Yönetici Notu</Label>
                <Textarea rows={2} value={walkin.admin_notes || ""} onChange={(e) => setWalkin({ ...walkin, admin_notes: e.target.value })} placeholder="İç notlar (müşteriye görünmez)" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Genel Notlar</Label>
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

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="appointment-detail-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-700" /> Randevu Detayı
            </DialogTitle>
            <DialogDescription>Notlar, ödemeler ve iletişim bilgilerini bu ekrandan yönetin.</DialogDescription>
          </DialogHeader>

          {detail && (
            <div className="space-y-6">
              {/* Customer info */}
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Ad Soyad</Label>
                  <Input data-testid="detail-name" value={detail.customer_name || ""} onChange={(e) => setDetail({ ...detail, customer_name: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Telefon</Label>
                  <Input data-testid="detail-phone" value={detail.customer_phone || ""} onChange={(e) => setDetail({ ...detail, customer_phone: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">2. Telefon</Label>
                  <Input data-testid="detail-phone-2" value={detail.phone_2 || ""} onChange={(e) => setDetail({ ...detail, phone_2: e.target.value })} placeholder="Eş / Aile" />
                </div>
                <div>
                  <Label className="text-xs">E-posta</Label>
                  <Input value={detail.customer_email || ""} onChange={(e) => setDetail({ ...detail, customer_email: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Tarih</Label>
                  <Input type="date" value={detail.date || ""} onChange={(e) => setDetail({ ...detail, date: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Saat (30 dk)</Label>
                  <Select value={detail.time || ""} onValueChange={(v) => setDetail({ ...detail, time: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {ADMIN_TIME_SLOTS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Event type + addons */}
              <div>
                <Label className="text-xs">Etkinlik Türü</Label>
                <Select value={detail.event_type || ""} onValueChange={(v) => setDetail({ ...detail, event_type: v, event_addons: [] })}>
                  <SelectTrigger data-testid="detail-event-type"><SelectValue placeholder="Etkinlik seçin" /></SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((et) => <SelectItem key={et.key} value={et.key}>{et.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {(EVENT_ADDONS[detail.event_type] || []).length > 0 && (
                  <div className="mt-3 rounded-lg border border-slate-200 p-3">
                    <div className="text-xs text-slate-500 mb-2">Paket seçenekleri</div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {EVENT_ADDONS[detail.event_type].map((a) => (
                        <label key={a.key} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            data-testid={`detail-addon-${a.key}`}
                            checked={(detail.event_addons || []).includes(a.key)}
                            onCheckedChange={() => toggleDetailAddon(a.key)}
                          />
                          {a.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Financials — admin only */}
              {isAdmin && (
                <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
                  <div className="text-sm font-semibold mb-3 flex items-center gap-2"><Wallet className="w-4 h-4 text-emerald-600" /> Finansal Özet</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Toplam Ücret (₺)</Label>
                      <Input data-testid="detail-total" type="number" value={detail.total_amount || 0} onChange={(e) => setDetail({ ...detail, total_amount: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Kapora (₺)</Label>
                      <Input data-testid="detail-deposit" type="number" value={detail.deposit_amount || 0} onChange={(e) => setDetail({ ...detail, deposit_amount: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Ödenen Toplam (₺)</Label>
                      <Input type="number" value={detail.paid_amount || 0} onChange={(e) => setDetail({ ...detail, paid_amount: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3 text-sm">
                    <div className="rounded-lg bg-white border border-slate-200 p-2">
                      <div className="text-xs text-slate-500">Toplam</div>
                      <div className="font-semibold">{fmt(detail.total_amount)}</div>
                    </div>
                    <div className="rounded-lg bg-white border border-slate-200 p-2">
                      <div className="text-xs text-slate-500">Ödenmiş</div>
                      <div className="font-semibold text-emerald-700">{fmt(detail.paid_total ?? Math.max(Number(detail.paid_amount || 0), Number(detail.deposit_amount || 0) + Number(detail.mid_payments_total || 0)))}</div>
                    </div>
                    <div className="rounded-lg bg-white border border-slate-200 p-2">
                      <div className="text-xs text-slate-500">Kalan</div>
                      <div className={`font-semibold ${Number(detail.remaining_amount || 0) > 0 ? "text-red-600" : "text-emerald-700"}`}>{fmt(detail.remaining_amount)}</div>
                    </div>
                  </div>

                  {/* Mid-payments — admin only */}
                  <div className="mt-5">
                    <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Ara Ödemeler</div>
                    <div className="space-y-2" data-testid="mid-payments-list">
                      {(detail.mid_payments || []).length === 0 && (
                        <div className="text-xs text-slate-500 py-2">Henüz ara ödeme yok.</div>
                      )}
                      {(detail.mid_payments || []).map((p) => (
                        <div key={p.id} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                          <div>
                            <div className="font-medium">{fmt(p.amount)} · {p.method === "cash" ? "Nakit" : p.method === "card" ? "Kart" : "Havale"}</div>
                            <div className="text-xs text-slate-500">{p.date}{p.note ? ` · ${p.note}` : ""}{p.created_by_name ? ` · ${p.created_by_name}` : ""}</div>
                          </div>
                          <Button size="sm" variant="destructive" onClick={() => removeMidPayment(detail.id, p.id)} data-testid={`remove-midpay-${p.id}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                      <div>
                        <Label className="text-xs">Tutar (₺) *</Label>
                        <Input data-testid="new-midpay-amount" type="number" value={newMidPayment.amount} onChange={(e) => setNewMidPayment({ ...newMidPayment, amount: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">Tarih</Label>
                        <Input type="date" value={newMidPayment.date} onChange={(e) => setNewMidPayment({ ...newMidPayment, date: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">Yöntem</Label>
                        <Select value={newMidPayment.method} onValueChange={(v) => setNewMidPayment({ ...newMidPayment, method: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cash">Nakit</SelectItem>
                            <SelectItem value="card">Kart</SelectItem>
                            <SelectItem value="transfer">Havale</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-end">
                        <Button data-testid="add-midpay-btn" onClick={addMidPayment} className="w-full bg-emerald-600 hover:bg-emerald-700">
                          <Plus className="w-3.5 h-3.5 mr-1" /> Ekle
                        </Button>
                      </div>
                      <div className="col-span-2 md:col-span-4">
                        <Label className="text-xs">Not (opsiyonel)</Label>
                        <Input value={newMidPayment.note} onChange={(e) => setNewMidPayment({ ...newMidPayment, note: e.target.value })} placeholder="Ör: 2. taksit" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Müşteri Notu</Label>
                  <Textarea rows={3} value={detail.notes || ""} onChange={(e) => setDetail({ ...detail, notes: e.target.value })} placeholder="Müşteriden gelen notlar" />
                </div>
                <div>
                  <Label className="text-xs">Yönetici Notu (iç)</Label>
                  <Textarea data-testid="detail-admin-notes" rows={3} value={detail.admin_notes || ""} onChange={(e) => setDetail({ ...detail, admin_notes: e.target.value })} placeholder="Müşteriye görünmeyen iç notlar" />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Ekstra Hizmet Notu</Label>
                  <Textarea rows={2} value={detail.extra_services_note || ""} onChange={(e) => setDetail({ ...detail, extra_services_note: e.target.value })} placeholder="Drone, ekstra fotoğrafçı vb." />
                </div>
              </div>

              <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-500">
                Hizmet: <b>{detail.service_name}</b> · Durum: <b>{statusLabel[detail.status] || detail.status}</b> · Oluşturma: {(detail.created_at || "").slice(0, 10)}
                {detail.origin && <> · Kanal: <b>{detail.origin === "walkin" ? "Fiziki" : "Online"}</b></>}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>Kapat</Button>
            <Button data-testid="detail-save-btn" onClick={saveDetail} disabled={detailSaving} className="bg-slate-900 hover:bg-slate-800">
              {detailSaving ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent data-testid="confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="confirm-cancel">Vazgeç</AlertDialogCancel>
            <AlertDialogAction data-testid="confirm-ok" onClick={runConfirmedAction} className={confirmAction?.confirmClass || "bg-slate-900 hover:bg-slate-800"}>
              {confirmAction?.confirmLabel || "Onayla"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminAppointments;
