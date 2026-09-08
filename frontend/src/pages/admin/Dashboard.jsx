import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CalendarClock, Wallet, Users, CheckCheck, Clock, XCircle, CalendarDays,
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import TrendRadarPanel from "@/components/admin/TrendRadarPanel";
import { useAuth } from "@/context/AuthContext";

const StatCard = ({ label, value, icon: Icon, tone = "slate", testId }) => (
  <Card className="border-slate-200 hover:shadow-md transition-shadow" data-testid={testId}>
    <CardContent className="p-6 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-${tone}-100 text-${tone}-700`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
        <div className="text-2xl font-semibold text-slate-900">{value}</div>
      </div>
    </CardContent>
  </Card>
);

const Dashboard = () => {
  const [s, setS] = useState(null);
  const [recent, setRecent] = useState([]);
  const { user } = useAuth();
  const canRadar = user?.role === "admin" || !!user?.can_trend_radar;

  useEffect(() => {
    api.get("/reports/summary").then((r) => setS(r.data));
    api.get("/appointments", { params: { status_filter: "pending" } })
      .then((r) => {
        const raw = r.data;
        const list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.results) ? raw.results : [];
        setRecent(list.slice(0, 6));
      }).catch(() => setRecent([]));
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight" data-testid="admin-dashboard-title">Genel Bakış</h1>
        <p className="text-sm text-slate-500 mt-1">Fotuber Studio operasyonel özet</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Bekleyen Randevular" value={s?.pending ?? "—"} icon={Clock} tone="amber" testId="stat-pending" />
        <StatCard label="Onaylanan Randevular" value={s?.approved ?? "—"} icon={CheckCheck} tone="emerald" testId="stat-approved" />
        <StatCard label="Bugün Onaylı" value={s?.today_approved ?? "—"} icon={CalendarClock} tone="blue" testId="stat-today" />
        <StatCard label="Aktif Personel" value={s?.staff_count ?? "—"} icon={Users} tone="slate" testId="stat-staff" />
      </div>

      {/* Sektör Radarı — premium executive panel (admin + yetkili personel) */}
      {canRadar && <TrendRadarPanel />}

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-slate-200">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center justify-between">
              <span>Son 7 Gün Ciro (₺)</span>
              <Badge variant="outline" className="text-xs">Onaylı ödemeler</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64" data-testid="revenue-chart">
            {s && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={s.revenue_series}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0f172a" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#0f172a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip formatter={(v) => `₺${Number(v).toLocaleString("tr-TR")}`} />
                  <Area type="monotone" dataKey="revenue" stroke="#0f172a" fill="url(#rev)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Finansal Özet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center"><Wallet className="w-4 h-4" /></div>
              <div>
                <div className="text-xs text-slate-500">Toplam Ciro</div>
                <div className="text-xl font-semibold" data-testid="stat-total-revenue">₺{Number(s?.total_revenue || 0).toLocaleString("tr-TR")}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center"><Wallet className="w-4 h-4" /></div>
              <div>
                <div className="text-xs text-slate-500">Toplam Kapora</div>
                <div className="text-xl font-semibold" data-testid="stat-total-deposits">₺{Number(s?.total_deposits || 0).toLocaleString("tr-TR")}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center"><XCircle className="w-4 h-4" /></div>
              <div>
                <div className="text-xs text-slate-500">İptal Randevular</div>
                <div className="text-xl font-semibold" data-testid="stat-cancelled">{s?.cancelled ?? "—"}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Bekleyen Randevu Talepleri</CardTitle>
          <Badge className="bg-amber-500 hover:bg-amber-500 text-white">{recent.length}</Badge>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <div className="text-sm text-slate-500 py-6 text-center">Bekleyen randevu yok.</div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {recent.map((a) => (
                <li key={a.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{a.customer_name} <span className="font-normal text-slate-500">· {a.service_name}</span></div>
                    <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                      <CalendarDays className="w-3 h-3" /> {a.date} {a.time} · {a.customer_phone}
                    </div>
                  </div>
                  <Badge className="bg-amber-100 text-amber-700 border border-amber-300">Beklemede</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
