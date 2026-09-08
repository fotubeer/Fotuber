import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { CalendarDays, Clock, Camera } from "lucide-react";
import PublicLayout from "@/components/PublicLayout";

const statusBadge = (s) => {
  if (s === "pending") return <Badge className="bg-amber-500/20 text-amber-500 border border-amber-500/30">Beklemede</Badge>;
  if (s === "approved") return <Badge className="bg-emerald-500/20 text-emerald-500 border border-emerald-500/30">Onaylandı</Badge>;
  if (s === "cancelled") return <Badge className="bg-red-500/20 text-red-500 border border-red-500/30">İptal</Badge>;
  return <Badge>{s}</Badge>;
};

const MyAppointments = () => {
  const { user } = useAuth();
  const [items, setItems] = useState([]);

  useEffect(() => {
    api.get("/appointments/me").then((r) => setItems(r.data)).catch(() => setItems([]));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-20">
      <div className="text-xs tracking-[0.3em] uppercase text-[#d4af37] mb-3">Merhaba {user?.name?.split(" ")[0]}</div>
      <h1 className="hero-title text-4xl md:text-6xl mb-10">Randevularım</h1>

      {items.length === 0 ? (
        <div className="border border-neutral-900 rounded-2xl p-10 text-center text-neutral-500">
          Henüz bir randevunuz yok.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((a) => (
            <div key={a.id} data-testid={`my-appt-${a.id}`} className="border border-neutral-900 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[#d4af37] mb-2">
                  <Camera className="w-3 h-3" /> {a.service_name}
                </div>
                <div className="font-serif text-2xl mb-1">{a.date} · {a.time}</div>
                <div className="text-sm text-neutral-500 flex items-center gap-3">
                  <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> {a.date}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {a.time}</span>
                </div>
                {a.notes && <div className="text-sm text-neutral-400 mt-2">{a.notes}</div>}
              </div>
              <div className="flex flex-col items-start md:items-end gap-2">
                {statusBadge(a.status)}
                <div className="text-2xl font-serif text-[#d4af37]">₺{Number(a.service_price || 0).toLocaleString("tr-TR")}</div>
                {a.deposit_amount > 0 && (
                  <div className="text-xs text-neutral-500">Alınan Kapora: ₺{Number(a.deposit_amount).toLocaleString("tr-TR")}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyAppointments;
