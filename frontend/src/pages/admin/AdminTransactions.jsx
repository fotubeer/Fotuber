import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Plus, TrendingUp, TrendingDown, Wallet, CreditCard, Banknote, ArrowLeftRight,
  Pencil, Trash2, Lock,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, PieChart, Pie, Cell } from "recharts";
import { toast } from "sonner";

const METHOD_META = {
  cash: { label: "Nakit", icon: Banknote, color: "#10b981" },
  card: { label: "Kart", icon: CreditCard, color: "#2563eb" },
  transfer: { label: "Havale", icon: ArrowLeftRight, color: "#f59e0b" },
};

const today = () => new Date().toISOString().slice(0, 10);
const emptyTx = { kind: "income", amount: "", payment_method: "cash", category: "", description: "", date: today() };

const money = (n) => `₺${Number(n || 0).toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const StatBlock = ({ label, income, expense, net, testId }) => (
  <Card className="border-slate-200" data-testid={testId}>
    <CardContent className="p-5">
      <div className="text-xs uppercase tracking-wider text-slate-500 mb-3">{label}</div>
      <div className="text-3xl font-semibold" data-testid={`${testId}-net`}>{money(net)}</div>
      <div className="text-xs text-slate-500 mt-1">Net</div>
      <div className="flex items-center gap-4 mt-4 text-sm">
        <div className="flex items-center gap-1 text-emerald-600">
          <TrendingUp className="w-3.5 h-3.5" /> {money(income)}
        </div>
        <div className="flex items-center gap-1 text-red-600">
          <TrendingDown className="w-3.5 h-3.5" /> {money(expense)}
        </div>
      </div>
    </CardContent>
  </Card>
);

const MethodBreakdown = ({ data, testId }) => {
  const rows = Object.entries(data || {});
  const total = rows.reduce((a, [_, v]) => a + Math.abs(v), 0) || 1;
  return (
    <div className="space-y-2" data-testid={testId}>
      {rows.map(([k, v]) => {
        const meta = METHOD_META[k];
        const pct = (Math.abs(v) / total) * 100;
        return (
          <div key={k}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="flex items-center gap-2">
                <meta.icon className="w-3.5 h-3.5" style={{ color: meta.color }} /> {meta.label}
              </span>
              <span className="font-medium" style={{ color: v < 0 ? "#dc2626" : "#0f172a" }}>{money(v)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: meta.color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const AdminTransactions = () => {
  const [summary, setSummary] = useState(null);
  const [items, setItems] = useState([]);
  const [period, setPeriod] = useState("today");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadAll = async () => {
    const [s, i] = await Promise.all([
      api.get("/transactions/summary"),
      api.get("/transactions"),
    ]);
    setSummary(s.data);
    setItems(i.data);
  };
  useEffect(() => { loadAll().catch(() => {}); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...editing, amount: Number(editing.amount) };
      if (editing.id) await api.put(`/transactions/${editing.id}`, payload);
      else await api.post("/transactions", payload);
      toast.success("Kaydedildi");
      setEditing(null);
      loadAll();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Bu hareket silinsin mi?")) return;
    await api.delete(`/transactions/${id}`); loadAll(); toast.success("Silindi");
  };

  const seriesFor = () => {
    if (!summary) return [];
    if (period === "today") return summary.daily_series;
    if (period === "week") return summary.week_series.map((w) => ({ ...w, date: w.label }));
    return summary.month_series.map((m) => ({ ...m, date: m.label }));
  };

  const currentBucket = summary?.[period === "today" ? "today" : period === "week" ? "week" : "month"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3" data-testid="admin-transactions-title">
            Nakit Akışı
            <Badge variant="outline" className="text-xs bg-amber-50 border-amber-300 text-amber-700 gap-1">
              <Lock className="w-3 h-3" /> Sadece Yetkili Admin
            </Badge>
          </h1>
          <p className="text-sm text-slate-500 mt-1">Gelir/gider girişi ve nakit · kart · havale akışları.</p>
        </div>
        <Button data-testid="tx-add-btn" onClick={() => setEditing({ ...emptyTx })} className="bg-slate-900 hover:bg-slate-800">
          <Plus className="w-4 h-4 mr-2" /> Yeni Hareket
        </Button>
      </div>

      {/* Big stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatBlock label="Bugün" income={summary?.today.income} expense={summary?.today.expense} net={summary?.today.net} testId="stat-today" />
        <StatBlock label="Bu Hafta" income={summary?.week.income} expense={summary?.week.expense} net={summary?.week.net} testId="stat-week" />
        <StatBlock label="Bu Ay" income={summary?.month.income} expense={summary?.month.expense} net={summary?.month.net} testId="stat-month" />
      </div>

      <Tabs value={period} onValueChange={setPeriod}>
        <TabsList data-testid="tx-period-tabs">
          <TabsTrigger value="today" data-testid="tx-tab-daily">Günlük</TabsTrigger>
          <TabsTrigger value="week" data-testid="tx-tab-weekly">Haftalık</TabsTrigger>
          <TabsTrigger value="month" data-testid="tx-tab-monthly">Aylık</TabsTrigger>
        </TabsList>

        <TabsContent value={period} className="mt-4 grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 border-slate-200">
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                {period === "today" ? "Son 7 Gün" : period === "week" ? "Son 4 Hafta" : "Son 6 Ay"} — Gelir/Gider
              </CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={seriesFor()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip formatter={(v) => money(v)} />
                  <Legend />
                  <Bar dataKey="income" name="Gelir" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Gider" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Ödeme Yöntemi Dağılımı</CardTitle>
              <p className="text-xs text-slate-500 mt-1">Net (gelir − gider) tutar</p>
            </CardHeader>
            <CardContent>
              {currentBucket && <MethodBreakdown data={currentBucket.by_method} testId={`method-breakdown-${period}`} />}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Transaction list */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Son Hareketler</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tarih</TableHead>
                <TableHead>Tür</TableHead>
                <TableHead>Yöntem</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Açıklama</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
                <TableHead className="text-right">Aksiyon</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-500">Kayıt yok.</TableCell></TableRow>
              )}
              {items.map((t) => {
                const meta = METHOD_META[t.payment_method];
                return (
                  <TableRow key={t.id} data-testid={`tx-row-${t.id}`}>
                    <TableCell>{t.date}</TableCell>
                    <TableCell>
                      {t.kind === "income" ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">Gelir</Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-700 border-red-300">Gider</Badge>
                      )}
                    </TableCell>
                    <TableCell className="flex items-center gap-2">
                      <meta.icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
                      {meta.label}
                    </TableCell>
                    <TableCell>{t.category || "—"}</TableCell>
                    <TableCell className="text-slate-500 max-w-xs truncate">{t.description || "—"}</TableCell>
                    <TableCell className="text-right font-semibold" style={{ color: t.kind === "income" ? "#059669" : "#dc2626" }}>
                      {t.kind === "income" ? "+" : "−"}{money(t.amount)}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="outline" onClick={() => setEditing(t)} data-testid={`tx-edit-${t.id}`}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => remove(t.id)} data-testid={`tx-delete-${t.id}`}>
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

      {/* Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent data-testid="tx-dialog">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Hareket Düzenle" : "Yeni Gelir / Gider"}</DialogTitle>
            <DialogDescription>Kasa hareketini kaydedin — bu ekran yalnızca yetkili admin tarafından görülür.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Tür</Label>
                  <Select value={editing.kind} onValueChange={(v) => setEditing({ ...editing, kind: v })}>
                    <SelectTrigger data-testid="tx-kind"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income">Gelir</SelectItem>
                      <SelectItem value="expense">Gider</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Ödeme Yöntemi</Label>
                  <Select value={editing.payment_method} onValueChange={(v) => setEditing({ ...editing, payment_method: v })}>
                    <SelectTrigger data-testid="tx-method"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Nakit</SelectItem>
                      <SelectItem value="card">Kart</SelectItem>
                      <SelectItem value="transfer">Havale / EFT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Tutar (₺)</Label>
                  <Input data-testid="tx-amount" type="number" step="0.01" min="0.01" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Tarih</Label>
                  <Input data-testid="tx-date" type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Kategori (ör: Kapora, Kira, Malzeme, Maaş)</Label>
                <Input data-testid="tx-category" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Açıklama</Label>
                <Textarea data-testid="tx-description" rows={2} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Vazgeç</Button>
            <Button data-testid="tx-save-btn" onClick={save} disabled={saving} className="bg-slate-900 hover:bg-slate-800">
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTransactions;
