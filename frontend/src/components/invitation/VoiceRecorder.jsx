import React, { useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, Square, Upload, Loader2, Play } from "lucide-react";

// In-browser microphone recorder. Records via MediaRecorder, lets the user
// preview, then hands a File to `onUpload` (parent uploads to the backend).
export default function VoiceRecorder({ onUpload, uploading }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blobUrl, setBlobUrl] = useState(null);
  const mrRef = useRef(null);
  const chunksRef = useRef([]);
  const blobRef = useRef(null);
  const timerRef = useRef(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        blobRef.current = blob;
        setBlobUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mrRef.current = mr;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      toast.error("Mikrofona erişilemedi. Lütfen izin verin.");
    }
  };

  const stop = () => {
    try { mrRef.current?.stop(); } catch (e) { /* noop */ }
    clearInterval(timerRef.current);
    setRecording(false);
  };

  const doUpload = () => {
    if (!blobRef.current) return;
    const type = blobRef.current.type || "audio/webm";
    const ext = type.includes("mp4") || type.includes("mpeg") ? "m4a" : (type.includes("ogg") ? "ogg" : "webm");
    const file = new File([blobRef.current], `karsilama.${ext}`, { type });
    onUpload(file);
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="rounded-lg border border-slate-200 p-3" data-testid="voice-recorder">
      <div className="flex items-center gap-2 flex-wrap">
        {!recording ? (
          <button type="button" onClick={start} data-testid="voice-record-start"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700">
            <Mic className="w-4 h-4" /> Sesini Kaydet
          </button>
        ) : (
          <button type="button" onClick={stop} data-testid="voice-record-stop"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium animate-pulse">
            <Square className="w-4 h-4" /> Durdur · {mm}:{ss}
          </button>
        )}
        {blobUrl && !recording && (
          <>
            <audio src={blobUrl} controls className="h-9" data-testid="voice-record-preview" />
            <button type="button" onClick={doUpload} disabled={uploading} data-testid="voice-record-upload"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Bu Kaydı Kullan
            </button>
          </>
        )}
      </div>
      <p className="text-[11px] text-slate-500 mt-2">
        {recording ? "Kayıt sürüyor… bittiğinde Durdur'a basın." : "Mikrofonla kısa bir karşılama kaydedin; davetiye açılınca çalar."}
      </p>
    </div>
  );
}
