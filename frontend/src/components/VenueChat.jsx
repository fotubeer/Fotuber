import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pin, PinOff, Send, Trash2, MessageSquare } from "lucide-react";

// Venue team chat used by both the manager panel (venueApi) and the staff kiosk
// (staffApi). Manager can pin/unpin/delete. Pinned messages float to the top.
export default function VenueChat({ client, base, isManager, className = "" }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  const load = useCallback(async () => {
    try { const { data } = await client.get(`${base}/chat`); setMsgs(data.messages || []); } catch { /* ignore */ }
  }, [client, base]);

  useEffect(() => { load(); const iv = setInterval(load, 8000); return () => clearInterval(iv); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try { await client.post(`${base}/chat`, { text: text.trim() }); setText(""); await load(); }
    catch { /* ignore */ } finally { setSending(false); }
  };
  const pin = async (m) => { await client.post(`/venue/chat/${m.id}/pin`, { pinned: !m.pinned }); load(); };
  const del = async (m) => { await client.delete(`/venue/chat/${m.id}`); load(); };

  const pinned = msgs.filter((m) => m.pinned);
  const normal = msgs.filter((m) => !m.pinned);

  const Bubble = ({ m }) => (
    <div className={`flex ${m.author_type === (isManager ? "manager" : "staff") ? "justify-end" : "justify-start"}`} data-testid={`chat-msg-${m.id}`}>
      <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.author_type === "manager" ? "bg-amber-500/20 border border-amber-400/30" : "bg-white/10 border border-white/10"}`}>
        <div className="flex items-center gap-1.5 text-[10px] text-white/50 mb-0.5">
          <span className="font-medium">{m.author_name}{m.author_type === "manager" ? " (Yönetici)" : ""}</span>
          {isManager && (
            <>
              <button onClick={() => pin(m)} className="ml-1 hover:text-amber-300" title="Başa sabitle" data-testid={`chat-pin-${m.id}`}>
                {m.pinned ? <PinOff size={11} /> : <Pin size={11} />}
              </button>
              <button onClick={() => del(m)} className="hover:text-red-300" data-testid={`chat-del-${m.id}`}><Trash2 size={11} /></button>
            </>
          )}
        </div>
        <div className="text-white/90 whitespace-pre-wrap break-words">{m.text}</div>
      </div>
    </div>
  );

  return (
    <div className={`flex flex-col ${className}`} data-testid="venue-chat">
      <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-white/80"><MessageSquare size={15} /> Salon Ekip Sohbeti</div>
      {pinned.length > 0 && (
        <div className="mb-2 rounded-xl border border-amber-400/30 bg-amber-500/10 p-2 space-y-1.5" data-testid="chat-pinned">
          <div className="text-[10px] uppercase tracking-wider text-amber-300 flex items-center gap-1"><Pin size={11} /> Sabitlenenler</div>
          {pinned.map((m) => (
            <div key={m.id} className="text-sm text-amber-50 flex items-start justify-between gap-2">
              <span><b className="text-[11px] text-amber-200/80">{m.author_name}:</b> {m.text}</span>
              {isManager && <button onClick={() => pin(m)} className="text-amber-300 shrink-0"><PinOff size={12} /></button>}
            </div>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-[180px] max-h-[46vh] overflow-y-auto space-y-2 rounded-xl bg-black/20 p-3">
        {normal.length === 0 && pinned.length === 0 && <p className="text-center text-white/30 text-xs py-6">Henüz mesaj yok. İlk mesajı gönderin.</p>}
        {normal.map((m) => <Bubble key={m.id} m={m} />)}
        <div ref={endRef} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Mesaj yaz…" data-testid="chat-input"
          className="flex-1 rounded-xl bg-white/10 border border-white/15 px-3 py-2.5 text-sm outline-none focus:border-amber-400" />
        <button onClick={send} disabled={sending} data-testid="chat-send"
          className="w-11 h-11 grid place-items-center rounded-xl bg-amber-500 text-black disabled:opacity-50"><Send size={17} /></button>
      </div>
    </div>
  );
}
