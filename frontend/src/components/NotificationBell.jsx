import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

const POLL_INTERVAL = 30000; // 30s

export const NotificationBell = () => {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
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
    if (n.kind === "appointment_pending") nav("/admin/randevular");
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
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold flex items-center justify-center"
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
                <div className="text-sm font-medium">{n.title}</div>
                <div className="text-xs text-slate-500 truncate">{n.message}</div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {new Date(n.created_at).toLocaleString("tr-TR")}
                </div>
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
