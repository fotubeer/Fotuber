import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, CheckCheck, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

const POLL_INTERVAL = 20000; // 20s

export const NotificationBell = () => {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [criticalUnread, setCriticalUnread] = useState(0);
  const lastUnreadIdRef = useRef(null);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  const load = async (isInitial = false) => {
    try {
      const { data } = await api.get("/notifications", { params: { limit: 25 } });
      const newestUnread = data.items.find((i) => !i.read);
      if (
        !isInitial &&
        newestUnread &&
        newestUnread.id !== lastUnreadIdRef.current &&
        data.unread_count > unread
      ) {
        toast(newestUnread.title, { description: newestUnread.message });
      }
      if (newestUnread) lastUnreadIdRef.current = newestUnread.id;
      setItems(data.items);
      setUnread(data.unread_count);
      setCriticalUnread(data.critical_unread || 0);
    } catch (_) {}
  };

  useEffect(() => {
    load(true);
    const t = setInterval(() => load(false), POLL_INTERVAL);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markAll = async () => {
    await api.post("/notifications/mark-read");
    load(true);
  };

  const goTo = async (n) => {
    await api.post("/notifications/mark-read", null, { params: { notification_id: n.id } });
    setOpen(false);
    if (n.link) nav(n.link);
    else if (n.kind === "appointment_pending") nav("/admin/randevular");
    load(true);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          data-testid="notification-bell"
          className="relative w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-700"
          aria-label="Bildirimler"
        >
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <span
              data-testid="notification-badge"
              className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-semibold flex items-center justify-center ${criticalUnread > 0 ? "bg-red-600 animate-pulse" : "bg-slate-500"}`}
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" data-testid="notification-popover">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="font-semibold text-sm">Bildirimler</div>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={markAll} data-testid="mark-all-read-btn">
              <CheckCheck className="w-3.5 h-3.5 mr-1" /> Tümünü okundu işaretle
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">Henüz bildirim yok.</div>
          )}
          {items.map((n) => (
            <button
              key={n.id}
              data-testid={`notification-item-${n.id}`}
              onClick={() => goTo(n)}
              className={`w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 flex items-start gap-3 ${!n.read ? "bg-blue-50/50" : ""}`}
            >
              {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-600 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {n.severity === "critical" && (
                    <span data-testid="notif-severity-critical" className="inline-flex items-center gap-0.5 rounded-full bg-red-100 text-red-700 text-[9px] font-bold px-1.5 py-0.5">
                      <AlertTriangle className="w-2.5 h-2.5" /> KRİTİK
                    </span>
                  )}
                  <div className="text-sm font-medium truncate">{n.title}</div>
                </div>
                <div className="text-xs text-slate-500 truncate">{n.message}</div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {new Date(n.created_at).toLocaleString("tr-TR")}
                </div>
              </div>
            </button>
          ))}
        </div>
        <Link to="/admin/bildirimler" onClick={() => setOpen(false)} data-testid="notif-view-all"
          className="block text-center text-xs font-medium text-blue-600 hover:bg-slate-50 py-2.5 border-t border-slate-200">
          Tümünü Gör
        </Link>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
