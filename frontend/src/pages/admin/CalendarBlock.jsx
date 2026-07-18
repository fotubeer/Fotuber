import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Ban, Trash2 } from "lucide-react";

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
  const [reason, setReason] = useState("");

  const dateStr = useMemo(() => isoDate(date), [date]);

  const loadSlots = () => {
    api.get("/availability", { params: { date: dateStr } }).then((r) => setSlots(r.data.slots));
  };
  const loadBlocked = () => {
    api.get("/blocked-slots", { params: { date_from: dateStr } }).then((r) => setBlocked(r.data));
  };

  useEffect(() => { loadSlots(); loadBlocked(); }, [dateStr]);

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
        <h1 className="text-3xl font-semibold tracking-tight" data-testid="admin-calendar-title">Takvim & Manuel Kapatma</h1>
        <p className="text-sm text-slate-500 mt-1">Onaylanmamış zaman aralıklarını manuel olarak kapatın.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base font-semibold">Tarih Seç</CardTitle></CardHeader>
          <CardContent>
            <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} data-testid="admin-calendar-picker" />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-slate-200">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              {dateStr} · Saatler
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Label className="text-xs text-slate-500">Kapatma Nedeni (opsiyonel)</Label>
              <Input data-testid="block-reason" placeholder="Ör: Personel izinli" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
              {slots.map((s) => (
                <Button
                  key={s.time}
                  data-testid={`admin-slot-${s.time}`}
                  size="sm"
                  variant={s.status === "booked" ? "secondary" : "outline"}
                  disabled={s.status === "booked"}
                  onClick={() => block(s.time)}
                  className={s.status === "booked" ? "opacity-60" : ""}
                >
                  {s.status === "booked" ? "🔒 " : <Ban className="w-3 h-3 mr-1" />}
                  {s.time}
                </Button>
              ))}
            </div>
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
