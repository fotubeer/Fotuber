import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { Wallet, TrendingUp, PiggyBank } from "lucide-react";

const Finance = () => {
  const [s, setS] = useState(null);
  const [appts, setAppts] = useState([]);

  useEffect(() => {
    api.get("/reports/summary").then((r) => setS(r.data));
    api.get("/appointments", { params: { status_filter: "approved" } }).then((r) => setAppts(r.data));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight" data-testid="admin-finance-title">Finans & Ciro</h1>
        <p className="text-sm text-slate-500 mt-1">Kapora, ödenen tutarlar ve cirolar.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="border-slate-200">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center"><TrendingUp className="w-5 h-5" /></div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Toplam Ciro</div>
              <div className="text-2xl font-semibold">₺{Number(s?.total_revenue || 0).toLocaleString("tr-TR")}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center"><PiggyBank className="w-5 h-5" /></div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Toplam Kapora</div>
              <div className="text-2xl font-semibold">₺{Number(s?.total_deposits || 0).toLocaleString("tr-TR")}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center"><Wallet className="w-5 h-5" /></div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Onaylı Randevu</div>
              <div className="text-2xl font-semibold">{s?.approved ?? "—"}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base font-semibold">Son 7 Gün Ciro Dağılımı</CardTitle></CardHeader>
        <CardContent className="h-72">
          {s && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.revenue_series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip formatter={(v) => `₺${Number(v).toLocaleString("tr-TR")}`} />
                <Legend />
                <Bar dataKey="revenue" name="Ciro" fill="#0f172a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base font-semibold">Onaylı Randevu Hareketleri</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tarih</TableHead>
                <TableHead>Müşteri</TableHead>
                <TableHead>Hizmet</TableHead>
                <TableHead>Kapora</TableHead>
                <TableHead>Ödenen</TableHead>
                <TableHead>Toplam</TableHead>
                <TableHead>Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.date} {a.time}</TableCell>
                  <TableCell>{a.customer_name}</TableCell>
                  <TableCell>{a.service_name}</TableCell>
                  <TableCell>₺{Number(a.deposit_amount || 0).toLocaleString("tr-TR")}</TableCell>
                  <TableCell>₺{Number(a.paid_amount || 0).toLocaleString("tr-TR")}</TableCell>
                  <TableCell className="font-semibold">₺{Number(a.total_amount || 0).toLocaleString("tr-TR")}</TableCell>
                  <TableCell><Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">Onaylandı</Badge></TableCell>
                </TableRow>
              ))}
              {appts.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-slate-500 py-8">Kayıt yok.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Finance;
