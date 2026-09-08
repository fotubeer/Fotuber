import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Ban, Trash2, Lock, Calendar as CalendarIcon, User } from "lucide-react";

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const AdminCalendar = () => {
  const [date, setDate] = useState(new Date());
  const [slots, setSlots] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [approvedAppts, setApprovedAppts] = useState([]);
  const [monthApprovedMap, setMonthApprovedMap] = useState({}); // date -> count
  const [reason, setReason] = useState("");

  const dateStr = useMemo(() => isoDate(date), [date]);

  const loadSlots = () => {
    api.get("/availability", { params: { date: dateStr } }).then((r) => {
      const raw = r.data;
      setSlots(Array.isArray(raw?.slots) ? raw.slots : Array.isArray(raw) ? raw : []);
    }).catch(() => setSlots([]));
  };
  const loadBlocked = () => {
    api.get("/blocked-slots", { params: { date_from: dateStr } }).then((r) => {
      const raw = r.data;
      setBlocked(Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.results) ? raw.results : []);
    }).catch(() => setBlocked([]));
  };
  const loadApprovedForDate = () => {
    api.get("/appointments", { params: { status_filter: "approved", date_from: dateStr, date_to: dateStr } })
      .then((r) => setApprovedAppts(r.data))
      .catch(() => setApprovedAppts([]));
  };

  const loadApprovedMonth = () => {
    const y = date.getFullYear();
    const m = date.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    api.get("/appointments", { params: { status_filter: "approved", date_from: isoDate(first), date_to: isoDate(last) } })
      .then((r) => {
        const map = {};
        const list = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data?.results) ? r.data.results : [];
        list.forEach((a) => { map[a.date] = (map[a.date] || 0) + 1; });
        setMonthApprovedMap(map);
      })
      .catch(() => setMonthApprovedMap({}));
  };

  useEffect(() => { loadSlots(); loadBlocked(); loadApprovedForDate(); }, [dateStr]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadApprovedMonth(); }, [date.getFullYear(), date.getMonth()]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build a map of time -> approved appointment for quick lookup on chosen date
  const approvedByTime = useMemo(() => {
    const m = {};
    approvedAppts.forEach((a) => { m[a.time] = a; });
    return m;
  }, [approvedAppts]);

  const block = async (time) => {
    try {
      await api.post("/blocked-slots", { date: dateStr, time, reason });
      toast.success(`${time} kapatıldı`);
      loadSlots(); loadBlocked();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const unblock = async (id) => {
    try {
      await api.delete(`/blocked-slots/${id}`);
      toast.success("Kapatma kaldırıldı");
      loadSlots(); loadBlocked();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight" data-testid="admin-calendar-title">Takvim & Randevu Görünümü</h1>
        <p className="text-sm text-slate-500 mt-1">Günü seçin: onaylanmış randevular ve kapatılmış saatler burada listelenir.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-2"><CalendarIcon className="w-4 h-4 text-slate-500" /> Tarih Seç</CardTitle></CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => d && setDate(d)}
              data-testid="admin-calendar-picker"
              modifiers={{ hasAppt: (d) => !!monthApprovedMap[isoDate(d)] }}
              modifiersClassNames={{ hasAppt: "bg-emerald-100 text-emerald-800 font-semibold ring-1 ring-emerald-300" }}
            />
            <div className="text-xs text-slate-500 mt-3 flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded bg-emerald-100 ring-1 ring-emerald-300" /> Onaylı randevusu olan günler
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-slate-200">
          <CardHeader>
            <CardTitle className="text-base font-semibold">{dateStr} · Saatler (24 saat / 30 dk)</CardTitle>
          </CardHeader>
          <CardContent>
            {approvedAppts.length > 0 && (
              <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                <div className="text-xs font-semibold text-emerald-800 mb-2 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> Bu tarihte onaylanmış {approvedAppts.length} randevu
                </div>
                <ul className="space-y-1 text-sm">
                  {approvedAppts.sort((a,b) => a.time.localeCompare(b.time)).map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-emerald-900">
                      <span className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border border-emerald-200">{a.time}</span>
                      <User className="w-3 h-3" />
                      <span className="font-medium">{a.customer_name}</span>
                      <span className="text-emerald-700 text-xs">· {a.service_name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mb-4">
              <Label className="text-xs text-slate-500">Kapatma Nedeni (opsiyonel)</Label>
              <Input data-testid="block-reason" placeholder="Ör: Personel izinli" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {slots.map((s) => {
                const appt = approvedByTime[s.time];
                if (appt) {
                  return (
                    <div key={s.time} data-testid={`admin-slot-${s.time}`}
                      className="rounded-md border border-emerald-300 bg-emerald-100 text-emerald-900 px-2 py-2 text-center text-xs font-medium"
                      title={`${appt.customer_name} · ${appt.service_name}`}
                    >
                      <div className="font-mono text-sm">{s.time}</div>
                      <div className="text-[10px] truncate mt-0.5">{appt.customer_name}</div>
                    </div>
                  );
                }
                return (
                  <Button
                    key={s.time}
                    data-testid={`admin-slot-${s.time}`}
                    size="sm"
                    variant={s.status === "booked" ? "secondary" : "outline"}
                    disabled={s.status === "booked"}
                    onClick={() => block(s.time)}
                    className={s.status === "booked" ? "opacity-60" : ""}
                  >
                    {s.status === "booked" ? <Lock className="w-3 h-3 mr-1" /> : <Ban className="w-3 h-3 mr-1" />}
                    {s.time}
                  </Button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Yeşil hücreler onaylanmış randevuları temsil eder ve otomatik olarak bloke edilir. Boş saatleri kapatmak için üzerine tıklayın.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base font-semibold">Kapatılmış Saatler</CardTitle></CardHeader>
        <CardContent>
          {blocked.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">Bu tarihten sonra kapatılmış saat yok.</div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {blocked.map((b) => (
                <li key={b.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{b.date} · {b.time}</div>
                    {b.reason && <div className="text-xs text-slate-500">{b.reason}</div>}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => unblock(b.id)} data-testid={`unblock-btn-${b.id}`}>
                    <Trash2 className="w-3 h-3 mr-1" /> Kaldır
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminCalendar;
