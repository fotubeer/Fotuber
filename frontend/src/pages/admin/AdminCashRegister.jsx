import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Save, Wallet, ArrowRight, Lock } from "lucide-react";
import { toast } from "sonner";

const today = () => new Date().toISOString().slice(0, 10);
const money = (n) => `₺${Number(n || 0).toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const AdminCashRegister = () => {
  const [dateStr, setDateStr] = useState(today());
  const [day, setDay] = useState(null);
  const [close, setClose] = useState({ opening_balance: "", closing_balance: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);

  const loadDay = async (d) => {
    try {
      const [reg, hist] = await Promise.all([
        api.get("/cash-register", { params: { date: d } }),
        api.get("/cash-register/history"),
      ]);
      setDay(reg.data);
      setHistory(hist.data);
      const s = reg.data?.saved;
      setClose({
        opening_balance: s?.opening_balance ?? reg.data.suggested_opening ?? 0,
        closing_balance: s?.closing_balance ?? reg.data.expected_closing ?? 0,
        notes: s?.notes ?? "",
      });
    } catch (e) { toast.error(formatApiError(e)); }
  };

  useEffect(() => { loadDay(dateStr); }, [dateStr]);

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/cash-register/close", {
        date: dateStr,
        opening_balance: Number(close.opening_balance || 0),
        closing_balance: Number(close.closing_balance || 0),
        notes: close.notes || "",
      });
      toast.success("Kasa kaydı güncellendi");
      loadDay(dateStr);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const expected = (Number(close.opening_balance) || 0) + (day?.cash_in || 0) - (day?.cash_out || 0);
  const diff = (Number(close.closing_balance) || 0) - expected;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3" data-testid="admin-cash-register-title">
          Kasa Devir Defteri
          <Badge variant="outline" className="text-xs bg-amber-50 border-amber-300 text-amber-700 gap-1">
            <Lock className="w-3 h-3" /> Sadece Yönetici
          </Badge>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Günlük kasa açılış/kapanışını takip edin. Bir günün kapanış tutarı, ertesi günün otomatik açılış önerisi olur.
        </p>
      </div>

      {/* Date + Day view */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Wallet className="w-4 h-4" /> Gün Görünümü
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs">Tarih</Label>
              <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} data-testid="cash-register-date-input" />
            </div>
            <div>
              <Label className="text-xs">Nakit Gelir</Label>
              <div className="h-10 px-3 flex items-center rounded-md border border-slate-200 bg-emerald-50 text-emerald-700 font-medium">
                {money(day?.cash_in)}
              </div>
            </div>
            <div>
              <Label className="text-xs">Nakit Gider</Label>
              <div className="h-10 px-3 flex items-center rounded-md border border-slate-200 bg-red-50 text-red-700 font-medium">
                {money(day?.cash_out)}
              </div>
            </div>
            <div>
              <Label className="text-xs">Net Gün</Label>
              <div className="h-10 px-3 flex items-center rounded-md border border-slate-200 bg-slate-50 text-slate-900 font-semibold">
                {money((day?.cash_in || 0) - (day?.cash_out || 0))}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label className="text-sm font-semibold text-slate-900 mb-1 block">Açılış (₺)</Label>
              <Input type="number" step="0.01" value={close.opening_balance} onChange={(e) => setClose({ ...close, opening_balance: e.target.value })} data-testid="cash-register-opening" />
              {day?.previous_date && (
                <p className="text-[11px] text-slate-500 mt-1">Önceki gün ({day.previous_date}) kapanışı: {money(day.suggested_opening)}</p>
              )}
            </div>
            <div>
              <Label className="text-sm font-semibold text-slate-900 mb-1 block">Beklenen Kapanış</Label>
              <div className="h-10 px-3 flex items-center rounded-md border border-slate-200 bg-slate-50 text-slate-800 font-medium">
                {money(expected)}
              </div>
            </div>
            <div>
              <Label className="text-sm font-semibold text-slate-900 mb-1 block">Fiili Kapanış (₺)</Label>
              <Input type="number" step="0.01" value={close.closing_balance} onChange={(e) => setClose({ ...close, closing_balance: e.target.value })} data-testid="cash-register-closing" />
              {Math.abs(diff) > 0.01 && (
                <p className={`text-[11px] mt-1 ${diff < 0 ? "text-red-600" : "text-emerald-600"}`}>
                  Fark: {money(diff)} {diff < 0 ? "(eksik)" : "(fazla)"}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label className="text-sm font-semibold text-slate-900 mb-1 block">Not</Label>
            <Textarea rows={2} value={close.notes} onChange={(e) => setClose({ ...close, notes: e.target.value })} placeholder="Örn: X müşteriden alınan kapora, taşıma vs." data-testid="cash-register-notes" />
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving} data-testid="cash-register-save-btn" className="bg-slate-900 hover:bg-slate-800">
              <Save className="w-4 h-4 mr-2" /> {saving ? "Kaydediliyor..." : "Kaydet / Güncelle"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Geçmiş Kayıtlar (son 90 gün)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tarih</TableHead>
                <TableHead className="text-right">Açılış</TableHead>
                <TableHead className="text-right">Kapanış</TableHead>
                <TableHead className="text-right">Devir</TableHead>
                <TableHead>Kaydeden</TableHead>
                <TableHead>Not</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">Henüz kasa devir kaydı yok.</TableCell></TableRow>
              )}
              {history.map((h) => (
                <TableRow key={h.id} data-testid={`cash-register-row-${h.date}`}>
                  <TableCell className="font-medium">{h.date}</TableCell>
                  <TableCell className="text-right">{money(h.opening_balance)}</TableCell>
                  <TableCell className="text-right font-semibold">{money(h.closing_balance)}</TableCell>
                  <TableCell className="text-right text-slate-500 flex items-center justify-end gap-1">
                    <ArrowRight className="w-3 h-3" /> {money(h.closing_balance)}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">{h.updated_by_name || "—"}</TableCell>
                  <TableCell className="text-xs text-slate-500 max-w-xs truncate">{h.notes || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminCashRegister;
