import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Camera, Loader2, Images } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

// Live guest photo wall. Guests upload photos during the event; the gallery
// polls every 8s so it streams new photos in near real-time. Shown only when
// the invitation has the (premium) photowall section enabled.
export default function PhotoWall({ slug, t }) {
  const [photos, setPhotos] = useState([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/invitations/public/${slug}/photos`);
      if (r.ok) { const d = await r.json(); setPhotos(d.photos || []); }
    } catch (e) { /* ignore */ }
  }, [slug]);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("uploader_name", name);
      const r = await fetch(`${API}/api/invitations/public/${slug}/photos`, { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Yüklenemedi");
      toast.success("Fotoğrafınız duvara eklendi 💛");
      if (inputRef.current) inputRef.current.value = "";
      load();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }}
      className="rounded-2xl p-7" style={{ background: t.panel, border: `1px solid ${t.border}`, backdropFilter: "blur(10px)" }} data-testid="photowall-card">
      <h3 className="text-2xl mb-1 flex items-center justify-center gap-2 text-center" style={{ fontFamily: t.heading, color: t.accent }}>
        <Images className="w-5 h-5" /> Canlı Foto Duvarı
      </h3>
      <p className="text-xs mb-4 text-center" style={{ color: t.sub, fontFamily: "'Montserrat', sans-serif" }}>
        Etkinlikten çektiğiniz fotoğrafları paylaşın, duvarda canlı görünsün.
      </p>
      <div className="space-y-3">
        <input placeholder="Adınız (isteğe bağlı)" value={name} onChange={(e) => setName(e.target.value)}
          className="w-full py-2 text-sm outline-none placeholder:opacity-50"
          style={{ background: "transparent", borderBottom: `1px solid ${t.accent}66`, color: t.text }} data-testid="photowall-name" />
        <label className="flex items-center justify-center gap-2 py-3 rounded-full cursor-pointer text-sm font-medium"
          style={{ background: t.accent, color: t.dark ? "#0b0b0b" : "#fff" }} data-testid="photowall-upload-label">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} Fotoğraf Yükle
          <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => upload(e.target.files?.[0])} data-testid="photowall-upload" />
        </label>
      </div>
      {photos.length > 0 && (
        <div className="mt-5 grid grid-cols-3 gap-2" data-testid="photowall-gallery">
          {photos.map((p) => (
            <motion.div key={p.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="aspect-square overflow-hidden rounded-lg" style={{ border: `1px solid ${t.border}` }}>
              <img src={`${API}/api/invitations/photo/${p.id}`} alt={p.uploader_name || "Anı"} className="w-full h-full object-cover" loading="lazy" />
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
