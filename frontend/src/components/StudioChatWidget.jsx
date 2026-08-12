import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { MessageCircle, X, Minus, Send, Paperclip, Image as ImageIcon, Mic, Smile, FileText, Square, Trash2, Pin, PinOff, Play, Pause } from "lucide-react";
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

// Deterministic bar heights from a seed string (WhatsApp-style static waveform).
const seededBars = (seed, n = 34) => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const out = [];
  for (let i = 0; i < n; i++) { h = (Math.imul(h, 1103515245) + 12345) >>> 0; out.push(0.22 + (h % 1000) / 1000 * 0.78); }
  return out;
};

// Compact chat audio player with a tappable waveform + progress fill. Works on all browsers/mobile.
function AudioBubble({ src, seed, testid }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const bars = useMemo(() => seededBars(seed || src, 34), [seed, src]);
  const pct = dur > 0 && isFinite(dur) ? cur / dur : 0;

  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (playing) a.pause(); else a.play().catch(() => {});
  };
  const onMeta = () => {
    const a = audioRef.current; if (!a) return;
    if (a.duration === Infinity || isNaN(a.duration)) {
      // MediaRecorder webm süresi hatası için workaround.
      a.currentTime = 1e101;
      const fix = () => { a.removeEventListener("timeupdate", fix); a.currentTime = 0; setDur(a.duration || 0); };
      a.addEventListener("timeupdate", fix);
    } else setDur(a.duration);
  };
  const seek = (e) => {
    const a = audioRef.current; if (!a || !dur || !isFinite(dur)) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.min(dur, Math.max(0, ((e.clientX - r.left) / r.width) * dur));
  };

  return (
    <div data-testid={testid} className="flex items-center gap-2 w-full mb-1 min-w-[190px]">
      <button data-testid={testid ? `${testid}-play` : undefined} onClick={toggle} title={playing ? "Duraklat" : "Oynat"}
        className="w-8 h-8 shrink-0 grid place-items-center rounded-full bg-amber-500 hover:bg-amber-600 text-neutral-900">
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>
      <div onClick={seek} className="flex items-center gap-[2px] flex-1 h-8 cursor-pointer">
        {bars.map((b, i) => (
          <span key={i} className={`flex-1 rounded-full transition-colors ${i / bars.length <= pct ? "bg-amber-400" : "bg-white/25"}`}
            style={{ height: `${Math.round(b * 100)}%` }} />
        ))}
      </div>
      <span className="text-[10px] tabular-nums text-white/50 shrink-0 w-8 text-right">{fmtSecs(Math.round(playing || cur ? cur : dur))}</span>
      <audio ref={audioRef} src={src} preload="metadata"
        onLoadedMetadata={onMeta}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCur(0); }} className="hidden" />
    </div>
  );
}

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
  const [isOwner, setIsOwner] = useState(false);
  const [pinned, setPinned] = useState(null);
  const lastCount = useRef(0);
  const recRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const canceledRef = useRef(false);
  const fileRef = useRef(null);
  const scrollRef = useRef(null);
  const bodyRef = useRef(null);
  const analyserRef = useRef(null);
  const liveCanvasRef = useRef(null);

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
      setIsOwner(!!data.is_owner);
      setPinned(data.pinned || null);
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

  const togglePin = async (m, next) => {
    try { await studioApi.post(`/studio/chat/${m.id}/pin`, { pinned: next }); await poll(); }
    catch (e) { /* ignore */ }
  };

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
      try {
        _actx = _actx || new (window.AudioContext || window.webkitAudioContext)();
        const source = _actx.createMediaStreamSource(stream);
        const analyser = _actx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;
      } catch { analyserRef.current = null; }
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

  // Live recording waveform.
  useEffect(() => {
    if (!recording) return;
    const canvas = liveCanvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const cctx = canvas.getContext("2d");
    const buf = new Uint8Array(analyser.frequencyBinCount);
    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = canvas.width, h = canvas.height;
      analyser.getByteFrequencyData(buf);
      cctx.clearRect(0, 0, w, h);
      const bars = 28, step = Math.floor(buf.length / bars);
      const bw = w / bars;
      cctx.fillStyle = "#fbbf24";
      for (let i = 0; i < bars; i++) {
        const v = buf[i * step] / 255;
        const bh = Math.max(2, v * h);
        cctx.fillRect(i * bw + bw * 0.2, (h - bh) / 2, bw * 0.6, bh);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [recording]);

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
          {pinned && (
            <div data-testid="chat-pinned-banner" className="flex items-start gap-2 px-3 py-2 bg-amber-500/10 border-b border-amber-400/20">
              <Pin className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-amber-300/80 font-medium">Sabitlenen · {pinned.sender_name}</div>
                <div className="text-xs text-white/80 truncate">{pinned.text || (pinned.attach_kind === "audio" ? "🎙️ Sesli mesaj" : pinned.attach_kind === "image" ? "🖼️ Görsel" : "📎 Dosya")}</div>
              </div>
              {isOwner && (
                <button data-testid="chat-unpin-btn" onClick={() => togglePin(pinned, false)} title="Sabitlemeyi kaldır" className="shrink-0 text-white/50 hover:text-red-300"><PinOff className="w-3.5 h-3.5" /></button>
              )}
            </div>
          )}
          <div ref={bodyRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-neutral-950">
            {msgs.length === 0 && <p className="text-center text-white/30 text-xs mt-6">Henüz mesaj yok. İlk mesajı gönderin 👋</p>}
            {msgs.map((m) => (
              <div key={m.id} data-testid={`chat-msg-${m.id}`} className={`group relative rounded-xl px-3 py-2 max-w-[85%] ${m.pinned ? "bg-amber-500/10 border border-amber-400/25" : "bg-white/5"}`}>
                <div className="flex items-center gap-1 mb-0.5">
                  <div className="text-[10px] text-amber-300/80">{m.sender_name}</div>
                  {m.pinned && <Pin className="w-3 h-3 text-amber-400" />}
                </div>
                {m.attach_kind === "image" && <img src={`${BE}${m.attach_url}`} alt="" className="rounded-lg max-h-48 mb-1" />}
                {m.attach_kind === "audio" && <AudioBubble src={`${BE}${m.attach_url}`} seed={m.id} testid={`chat-audio-bubble-${m.id}`} />}
                {m.attach_kind === "file" && <a href={`${BE}${m.attach_url}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-blue-300 underline mb-1"><FileText className="w-3.5 h-3.5" /> {m.attach_name}</a>}
                {m.text && <div className="text-sm text-white/90 whitespace-pre-wrap break-words">{m.text}</div>}
                {isOwner && (
                  <button data-testid={`chat-pin-${m.id}`} onClick={() => togglePin(m, !m.pinned)} title={m.pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
                    className="absolute top-1 right-1 w-6 h-6 grid place-items-center rounded-md bg-neutral-800/80 text-white/50 hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    {m.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                  </button>
                )}
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
              <div className="flex-1 min-w-0"><AudioBubble src={preview.url} seed={`preview-${preview.secs}`} testid="chat-audio-preview-player" /></div>
              <button data-testid="chat-audio-send" onClick={sendPreview} title="Gönder" className="w-9 h-9 shrink-0 grid place-items-center rounded-full bg-amber-500 hover:bg-amber-600 text-neutral-900"><Send className="w-4 h-4" /></button>
            </div>
          ) : recording ? (
            <div data-testid="chat-recording-bar" className="flex items-center gap-2 px-3 py-2.5 bg-neutral-800 border-t border-white/10">
              <button data-testid="chat-rec-cancel" onClick={cancelRec} title="İptal" className="w-9 h-9 shrink-0 grid place-items-center rounded-full text-white/60 hover:text-red-400 hover:bg-white/5"><X className="w-4 h-4" /></button>
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
              <span data-testid="chat-rec-timer" className="text-sm tabular-nums text-white/80 font-medium shrink-0">{fmtSecs(recSecs)}</span>
              <canvas data-testid="chat-rec-waveform" ref={liveCanvasRef} width={160} height={28} className="flex-1 min-w-0 h-7" />
              <button data-testid="chat-rec-stop" onClick={stopRec} title="Durdur" className="w-9 h-9 shrink-0 grid place-items-center rounded-full bg-amber-500 hover:bg-amber-600 text-neutral-900"><Square className="w-4 h-4" /></button>
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
