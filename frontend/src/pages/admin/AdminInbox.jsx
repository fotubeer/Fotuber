import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, RefreshCw, Reply, Send, Loader2, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { api, formatApiError } from "@/lib/api";

const emailOf = (from) => { const m = (from || "").match(/<(.+?)>/); return m ? m[1] : (from || "").trim(); };

export default function AdminInbox() {
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [account, setAccount] = useState("");
  const [open, setOpen] = useState(null); // message being viewed
  const [reply, setReply] = useState({ to: "", subject: "", body: "" });
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true); setErr("");
    try {
      const { data } = await api.get("/admin/inbox?limit=25");
      setMsgs(data.messages || []); setAccount(data.account || "");
    } catch (e) { setErr(formatApiError(e, "Gmail bağlantısı kurulamadı")); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openMsg = (m) => { setOpen(m); setReply({ to: emailOf(m.from), subject: m.subject, body: "" }); };

  const sendReply = async () => {
    if (!reply.body.trim()) { toast.error("Yanıt metni gerekli"); return; }
    setSending(true);
    try { await api.post("/admin/inbox/reply", reply); toast.success("Yanıt gönderildi"); setOpen(null); }
    catch (e) { toast.error(formatApiError(e, "Gönderilemedi")); }
    finally { setSending(false); }
  };

  return (
    <div data-testid="admin-inbox" className="p-4 sm:p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <Inbox className="text-rose-600" size={26} />
          <h1 className="text-2xl sm:text-3xl font-semibold">Gmail Gelen Kutusu</h1>
        </div>
        <Button data-testid="inbox-refresh" size="sm" variant="outline" onClick={load} className="gap-1"><RefreshCw size={14} /> Yenile</Button>
      </div>
      <p className="text-sm text-neutral-500 mb-5">{account ? `${account} kutusundaki` : "Gelen"} son destek/hata e-postaları — panelden yanıtlayın.</p>

      {loading ? (
        <div className="text-neutral-400 flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Yükleniyor…</div>
      ) : err ? (
        <div data-testid="inbox-error" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm">{err}</div>
      ) : msgs.length === 0 ? (
        <div className="rounded-xl border p-8 text-center text-neutral-400">Gelen kutusu boş.</div>
      ) : (
        <div className="rounded-xl border divide-y" data-testid="inbox-list">
          {msgs.map((m) => (
            <button key={m.uid} data-testid={`inbox-msg-${m.uid}`} onClick={() => openMsg(m)}
              className="w-full text-left px-4 py-3 hover:bg-neutral-50 flex items-start gap-3">
              <Mail size={16} className="text-neutral-400 mt-1 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">{m.from}</span>
                  <span className="text-[11px] text-neutral-400 shrink-0">{(m.date || "").slice(0, 25)}</span>
                </div>
                <div className="text-sm text-neutral-800 truncate">{m.subject}</div>
                <div className="text-xs text-neutral-500 truncate">{m.snippet}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent data-testid="inbox-detail" className="max-w-lg">
          <DialogHeader><DialogTitle className="text-base">{open?.subject}</DialogTitle></DialogHeader>
          {open && (
            <div className="space-y-3">
              <div className="text-xs text-neutral-500">Gönderen: {open.from}</div>
              <div className="rounded-lg bg-neutral-50 border p-3 text-sm whitespace-pre-wrap max-h-52 overflow-y-auto">{open.body || open.snippet}</div>
              <div className="border-t pt-3 space-y-2">
                <div className="text-sm font-medium flex items-center gap-1.5"><Reply size={15} /> Yanıtla</div>
                <Input data-testid="inbox-reply-to" value={reply.to} onChange={(e) => setReply({ ...reply, to: e.target.value })} placeholder="Alıcı" />
                <Input data-testid="inbox-reply-subject" value={reply.subject} onChange={(e) => setReply({ ...reply, subject: e.target.value })} placeholder="Konu" />
                <Textarea data-testid="inbox-reply-body" rows={5} value={reply.body} onChange={(e) => setReply({ ...reply, body: e.target.value })} placeholder="Yanıtınız…" />
                <Button data-testid="inbox-reply-send" onClick={sendReply} disabled={sending} className="gap-1.5 bg-rose-600 hover:bg-rose-700">
                  {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Gönder
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
