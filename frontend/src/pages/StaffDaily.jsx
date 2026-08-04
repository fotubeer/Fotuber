import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Plus, TrendingUp, TrendingDown, Wallet, Save, Info, ArrowRight, Lock } from "lucide-react";
import { toast } from "sonner";

const today = () => new Date().toISOString().slice(0, 10);
const money = (n) => `₺${Number(n || 0).toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const emptyTx = { kind: "income", amount: "", category: "", description: "", date: today(), payment_method: "cash" };

const StaffDaily = () => {
  const [day, setDay] = useState(null);
  const [entries, setEntries] = useState([]);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState({ opening_balance: "", closing_balance: "", notes: "" });
  const [closingSaving, setClosingSaving] = useState(false);

  const load = async () => {
    try {
      const d = today();
      const [reg, tx] = await Promise.all([
        api.get("/cash-register", { params: { date: d } }),
        api.get("/transactions"),
      ]);
      setDay(reg.data);
      setEntries(tx.data || []);
      const saved = reg.data?.saved;
      setClosing({
        opening_balance: saved?.opening_balance ?? reg.data.suggested_opening ?? 0,
        closing_balance: saved?.closing_balance ?? reg.data.expected_closing ?? 0,
        notes: saved?.notes ?? "",
      });
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };
  useEffect(() => { load(); }, []);

  const saveTx = async () => {
    setSaving(true);
    try {
      const payload = { ...editing, amount: Number(editing.amount), payment_method: "cash", date: today() };
      await api.post("/transactions", payload);
      toast.success("Nakit hareket eklendi");
      setEditing(null);
      await load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const saveClose = async () => {
    setClosingSaving(true);
    try {
      await api.post("/cash-register/close", {
        date: today(),
        opening_balance: Number(closing.opening_balance || 0),
        closing_balance: Number(closing.closing_balance || 0),
        notes: closing.notes || "",
      });
      toast.success("Kasa kapanışı kaydedildi. İyi geceler! 🌙");
      await load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setClosingSaving(false); }
  };

  const cashIn = day?.cash_in || 0;
  const cashOut = day?.cash_out || 0;
  const expected = (Number(closing.opening_balance) || 0) + cashIn - cashOut;
  const diff = (Number(closing.closing_balance) || 0) - expected;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight" data-testid="staff-daily-title">
            Bugün · {new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}
          </h1>
          <p className="text-sm text-slate-500 mt-1">Sadece bugünün nakit girişlerini görürsünüz. Gün sonunda kasayı kapatın.</p>
        </div>
        <Button
          data-testid="staff-add-entry-btn"
          onClick={() => setEditing({ ...emptyTx })}
          className="bg-slate-900 hover:bg-slate-800"
        >
          <Plus className="w-4 h-4 mr-2" /> Yeni Nakit Hareketi
        </Button>
      </div>

      {/* Kasa Devir */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Wallet className="w-4 h-4" /> Günlük Kasa Devri
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {day?.previous_date && (
            <div className="text-xs text-slate-500 bg-slate-100 rounded-lg px-3 py-2 inline-flex items-center gap-2">
              <Info className="w-3.5 h-3.5" />
              Önceki gün kapanışı ({day.previous_date}): <strong className="text-slate-800">{money(day.suggested_opening)}</strong> — bugünün açılışı olarak öneriliyor.
            </div>
          )}
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label className="text-sm font-semibold text-slate-900 mb-1 block">Sabah Kasa Açılış (₺)</Label>
              <Input
                data-testid="staff-opening-input"
                type="number"
                step="0.01"
                value={closing.opening_balance}
                onChange={(e) => setClosing({ ...closing, opening_balance: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-sm font-semibold text-slate-900 mb-1 block">
                Beklenen Kapanış (Otomatik)
              </Label>
              <div className="h-10 px-3 flex items-center rounded-md border border-slate-200 bg-slate-50 text-slate-700 font-medium" data-testid="staff-expected-value">
                {money(expected)}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Açılış + Nakit Gelir − Nakit Gider</p>
            </div>
            <div>
              <Label className="text-sm font-semibold text-slate-900 mb-1 block">Fiili Kasa Kapanış (₺)</Label>
              <Input
                data-testid="staff-closing-input"
                type="number"
                step="0.01"
                value={closing.closing_balance}
                onChange={(e) => setClosing({ ...closing, closing_balance: e.target.value })}
              />
              {Math.abs(diff) > 0.01 && (
                <p className={`text-[11px] mt-1 ${diff < 0 ? "text-red-600" : "text-emerald-600"}`}>
                  Fark: {money(diff)} {diff < 0 ? "(eksik)" : "(fazla)"}
                </p>
              )}
            </div>
          </div>
          <div>
            <Label className="text-sm font-semibold text-slate-900 mb-1 block">Not</Label>
            <Textarea
              data-testid="staff-close-notes"
              rows={2}
              placeholder="Örn: 200₺ eksik çıktı, kayıp fişler var vs."
              value={closing.notes}
              onChange={(e) => setClosing({ ...closing, notes: e.target.value })}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-1 text-emerald-600">
                <TrendingUp className="w-4 h-4" /> Bugün Nakit Gelir: <strong>{money(cashIn)}</strong>
              </div>
              <div className="flex items-center gap-1 text-red-600">
                <TrendingDown className="w-4 h-4" /> Bugün Nakit Gider: <strong>{money(cashOut)}</strong>
              </div>
            </div>
            <Button
              data-testid="staff-close-save-btn"
              onClick={saveClose}
              disabled={closingSaving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Save className="w-4 h-4 mr-2" /> {closingSaving ? "Kaydediliyor..." : (day?.saved ? "Güncelle" : "Kasayı Kapat & Devret")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Entries */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Bugünün Nakit Hareketleri</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Saat</TableHead>
                <TableHead>Tür</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Açıklama</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">Bugün kayıt yok — yukarıdan ekleyin.</TableCell></TableRow>
              )}
              {entries.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-xs text-slate-500">
                    {t.created_at ? new Date(t.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </TableCell>
                  <TableCell>
                    {t.kind === "income" ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">Gelir</Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-700 border-red-300">Gider</Badge>
                    )}
                  </TableCell>
                  <TableCell>{t.category || "—"}</TableCell>
                  <TableCell className="text-slate-500 max-w-xs truncate">{t.description || "—"}</TableCell>
                  <TableCell className="text-right font-semibold" style={{ color: t.kind === "income" ? "#059669" : "#dc2626" }}>
                    {t.kind === "income" ? "+" : "−"}{money(t.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="text-xs text-slate-500 flex items-center gap-1.5">
        <Lock className="w-3 h-3" /> Toplam ciro, tüm nakit akışı, kart ve havale hareketleri sadece yönetici (admin) tarafından görülebilir.
      </div>

      {/* Add entry dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent data-testid="staff-tx-dialog">
          <DialogHeader>
            <DialogTitle>Yeni Nakit Hareketi</DialogTitle>
            <DialogDescription>
              Sadece bugüne, sadece nakit girişleri yapılabilir. Kart ve havale hareketlerini admin girer.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-semibold text-slate-900 mb-1 block">Tür</Label>
                <Select value={editing.kind} onValueChange={(v) => setEditing({ ...editing, kind: v })}>
                  <SelectTrigger data-testid="staff-tx-kind"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Gelir (nakit)</SelectItem>
                    <SelectItem value="expense">Gider (nakit)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-semibold text-slate-900 mb-1 block">Tutar (₺)</Label>
                <Input
                  data-testid="staff-tx-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={editing.amount}
                  onChange={(e) => setEditing({ ...editing, amount: e.target.value })}
                  placeholder="0,00"
                />
              </div>
              <div>
                <Label className="text-sm font-semibold text-slate-900 mb-1 block">Kategori</Label>
                <Input
                  data-testid="staff-tx-category"
                  placeholder="Örn: Kapora, Baskı Satış, Kırtasiye"
                  value={editing.category}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-sm font-semibold text-slate-900 mb-1 block">Açıklama</Label>
                <Textarea
                  data-testid="staff-tx-description"
                  rows={2}
                  placeholder="Kısa açıklama (opsiyonel)"
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Vazgeç</Button>
            <Button data-testid="staff-tx-save-btn" onClick={saveTx} disabled={saving} className="bg-slate-900 hover:bg-slate-800">
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StaffDaily;
