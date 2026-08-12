import React, { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { MessageCircle, X, Minus, Send, Paperclip, Image as ImageIcon, Mic, Smile, FileText, Square, Trash2 } from "lucide-react";
import { studioApi } from "@/lib/studioApi";

const BE = process.env.REACT_APP_BACKEND_URL;
const EMOJIS = ["😀","😂","😍","👍","🙏","🎉","❤️","🔥","👏","😢","😮","😎","🥳","💐","📸","✅","⏰","💬"];
let _actx = null;
const beep = () => { try { _actx = _actx || new (window.AudioContext || window.webkitAudioContext)(); const a = _actx; const o = a.createOscillator(); const g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 660; g.gain.value = 0.05; o.start(); o.stop(a.currentTime + 0.15); } catch {} };
const fmtSecs = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
// iOS Safari doesn't support audio/webm; pick the first supported mime.
const pickAudioMime = () => {
  const cands = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac", "audio/ogg"];
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  return cands.find((c) => MediaRecorder.isTypeSupported(c)) || "";
};
const mimeExt = (mime) => (mime.includes("mp4") || mime.includes("aac") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm");

export default function StudioChatWidget() {
  const loc = useLocation();
  const onStudio = loc.pathname.startsWith("/studyo");
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [text, setText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [preview, setPreview] = useState(null); // {url, file, secs}
  const lastCount = useRef(0);
  const recRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const canceledRef = useRef(false);
  const fileRef = useRef(null);
  const scrollRef = useRef(null);
  const bodyRef = useRef(null);

  const poll = useCallback(async () => {
    if (!localStorage.getItem("fotuber_studio_token") && !localStorage.getItem("fotuber_token")) { setEnabled(false); return; }
    try {
      const { data } = await studioApi.get("/studio/chat");
      setEnabled(!!data.enabled);
      if (!data.enabled) return;
      const list = data.messages || [];
      if (list.length > lastCount.current && lastCount.current > 0) {
        const latest = list[list.length - 1];
        beep();
        if (!open && "Notification" in window && Notification.permission === "granted") {
          new Notification(`${latest.sender_name || "Ekip"}`, { body: latest.text || "📎 Dosya gönderildi" });
        }
      }
      lastCount.current = list.length;
      setMsgs(list);
      setUnread(data.unread || 0);
    } catch { setEnabled(false); }
  }, [open]);

  useEffect(() => {
    if (!onStudio) return;
    poll();
    const t = setInterval(poll, 4000);
    return () => clearInterval(t);
  }, [onStudio, poll]);

  useEffect(() => { if (open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [msgs, open]);

  const markRead = async () => { try { await studioApi.post("/studio/chat/read"); setUnread(0); } catch {} };
  const openWidget = () => {
    setOpen(true); markRead();
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
  };

  const send = async (payload) => {
    try { await studioApi.post("/studio/chat", payload); setText(""); setEmojiOpen(false); await poll(); }
    catch (e) { /* ignore */ }
  };
  const sendText = () => { const t = text.trim(); if (t) send({ text: t }); };

  const sendFile = (file, kind) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { alert("Dosya en fazla 8 MB olabilir"); return; }
    const r = new FileReader();
    r.onload = () => send({ attach_b64: r.result, attach_mime: file.type, attach_name: file.name, attach_kind: kind });
    r.readAsDataURL(file);
  };
  const onFile = (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (f) sendFile(f, f.type.startsWith("image/") ? "image" : "file");
  };

  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };

  const startRec = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { alert("Tarayıcınız ses kaydını desteklemiyor"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickAudioMime();
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
      mr.onstop = () => {
        stopTimer();
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (canceledRef.current) { canceledRef.current = false; setRecording(false); setRecSecs(0); return; }
        const type = mr.mimeType || mime || "audio/webm";
        const blob = new Blob(chunks, { type });
        const file = new File([blob], `ses-${Date.now()}.${mimeExt(type)}`, { type });
        const url = URL.createObjectURL(blob);
        setRecSecs((s) => { setPreview({ url, file, secs: s }); return 0; });
        setRecording(false);
      };
      recRef.current = mr;
      mr.start();
      canceledRef.current = false;
      setRecSecs(0);
      setRecording(true);
      timerRef.current = setInterval(() => setRecSecs((s) => {
        if (s >= 300) { recRef.current?.stop(); return s; } // 5 dk güvenlik limiti
        return s + 1;
      }), 1000);
    } catch { alert("Mikrofon izni gerekli"); }
  };

  const stopRec = () => { try { recRef.current?.stop(); } catch {} };
  const cancelRec = () => {
    stopTimer();
    canceledRef.current = true;
    try {
      if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecording(false); setRecSecs(0);
  };
  const discardPreview = () => { if (preview?.url) URL.revokeObjectURL(preview.url); setPreview(null); };
  const sendPreview = () => {
    if (!preview) return;
    sendFile(preview.file, "audio");
    URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  useEffect(() => () => { stopTimer(); streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  if (!onStudio || !enabled) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[70]" data-testid="studio-chat-widget">
      {!open ? (
        <button data-testid="chat-open-btn" onClick={openWidget}
          className="relative w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 shadow-xl grid place-items-center hover:scale-105 transition-transform">
          <MessageCircle className="w-6 h-6 text-white" />
          {unread > 0 && <span data-testid="chat-unread-badge" className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-bold grid place-items-center">{unread}</span>}
        </button>
      ) : (
        <div className="w-[92vw] max-w-sm h-[70vh] max-h-[560px] rounded-2xl bg-neutral-900 border border-white/10 shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 bg-neutral-800 border-b border-white/10">
            <div className="flex items-center gap-2 text-white text-sm font-semibold"><MessageCircle className="w-4 h-4 text-amber-400" /> Ekip Sohbeti</div>
            <div className="flex items-center gap-1">
              <button data-testid="chat-minimize-btn" onClick={() => setOpen(false)} className="w-7 h-7 grid place-items-center text-white/60 hover:text-white rounded"><Minus className="w-4 h-4" /></button>
              <button onClick={() => setOpen(false)} className="w-7 h-7 grid place-items-center text-white/60 hover:text-white rounded"><X className="w-4 h-4" /></button>
            </div>
          </div>
          <div ref={bodyRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-neutral-950">
            {msgs.length === 0 && <p className="text-center text-white/30 text-xs mt-6">Henüz mesaj yok. İlk mesajı gönderin 👋</p>}
            {msgs.map((m) => (
              <div key={m.id} data-testid={`chat-msg-${m.id}`} className="rounded-xl bg-white/5 px-3 py-2 max-w-[85%]">
                <div className="text-[10px] text-amber-300/80 mb-0.5">{m.sender_name}</div>
                {m.attach_kind === "image" && <img src={`${BE}${m.attach_url}`} alt="" className="rounded-lg max-h-48 mb-1" />}
                {m.attach_kind === "audio" && <audio controls src={`${BE}${m.attach_url}`} className="w-full h-8 mb-1" />}
                {m.attach_kind === "file" && <a href={`${BE}${m.attach_url}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-blue-300 underline mb-1"><FileText className="w-3.5 h-3.5" /> {m.attach_name}</a>}
                {m.text && <div className="text-sm text-white/90 whitespace-pre-wrap break-words">{m.text}</div>}
              </div>
            ))}
            <div ref={scrollRef} />
          </div>
          {emojiOpen && (
            <div className="grid grid-cols-9 gap-1 p-2 bg-neutral-800 border-t border-white/10">
              {EMOJIS.map((e) => <button key={e} onClick={() => setText((t) => t + e)} className="text-lg hover:scale-125 transition-transform">{e}</button>)}
            </div>
          )}
          {preview ? (
            <div data-testid="chat-audio-preview" className="flex items-center gap-2 px-2 py-2 bg-neutral-800 border-t border-white/10">
              <button data-testid="chat-audio-discard" onClick={discardPreview} title="Sil" className="w-9 h-9 shrink-0 grid place-items-center rounded-full text-red-400 hover:bg-red-500/15"><Trash2 className="w-4 h-4" /></button>
              <audio data-testid="chat-audio-preview-player" controls src={preview.url} className="flex-1 h-9 min-w-0" />
              <span className="text-[11px] tabular-nums text-white/50 shrink-0">{fmtSecs(preview.secs)}</span>
              <button data-testid="chat-audio-send" onClick={sendPreview} title="Gönder" className="w-9 h-9 shrink-0 grid place-items-center rounded-full bg-amber-500 hover:bg-amber-600 text-neutral-900"><Send className="w-4 h-4" /></button>
            </div>
          ) : recording ? (
            <div data-testid="chat-recording-bar" className="flex items-center gap-2 px-3 py-2.5 bg-neutral-800 border-t border-white/10">
              <button data-testid="chat-rec-cancel" onClick={cancelRec} title="İptal" className="w-9 h-9 shrink-0 grid place-items-center rounded-full text-white/60 hover:text-red-400 hover:bg-white/5"><X className="w-4 h-4" /></button>
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
              <span data-testid="chat-rec-timer" className="text-sm tabular-nums text-white/80 font-medium">{fmtSecs(recSecs)}</span>
              <span className="text-xs text-white/40 truncate">Kaydediliyor…</span>
              <button data-testid="chat-rec-stop" onClick={stopRec} title="Durdur" className="ml-auto w-9 h-9 shrink-0 grid place-items-center rounded-full bg-amber-500 hover:bg-amber-600 text-neutral-900"><Square className="w-4 h-4" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2 py-2 bg-neutral-800 border-t border-white/10">
              <button data-testid="chat-emoji-btn" onClick={() => setEmojiOpen((v) => !v)} className="w-8 h-8 grid place-items-center text-white/60 hover:text-amber-400"><Smile className="w-5 h-5" /></button>
              <button data-testid="chat-file-btn" onClick={() => fileRef.current?.click()} className="w-8 h-8 grid place-items-center text-white/60 hover:text-amber-400"><Paperclip className="w-5 h-5" /></button>
              <button data-testid="chat-mic-btn" onClick={startRec} className="w-8 h-8 grid place-items-center text-white/60 hover:text-amber-400"><Mic className="w-5 h-5" /></button>
              <input ref={fileRef} type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt" hidden onChange={onFile} />
              <input data-testid="chat-input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } }}
                placeholder="Mesaj yaz…" className="flex-1 min-w-0 bg-neutral-900 text-white text-sm rounded-full px-3 h-9 outline-none border border-white/10 focus:border-amber-500" />
              <button data-testid="chat-send-btn" onClick={sendText} className="w-9 h-9 shrink-0 grid place-items-center rounded-full bg-amber-500 hover:bg-amber-600 text-neutral-900"><Send className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
