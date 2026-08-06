import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast, Toaster } from "sonner";
import { Loader2, Smartphone, Upload, ClipboardList, Check, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parseVcf, contactPickerSupported } from "@/components/invitation/GuestManager";

const API = process.env.REACT_APP_BACKEND_URL;

// Public phone page opened by scanning the host's QR. Lets a guest/host add
// contacts (Contact Picker / vCard / paste) straight into the invitation.
export default function GuestImport() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [side, setSide] = useState("gelin");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(0);
  const [paste, setPaste] = useState("");
  const vcfRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/api/invitations/import/${token}`);
        if (!r.ok) { setError(r.status === 410 ? "Bağlantı süresi doldu." : "Bağlantı geçersiz."); return; }
        setInfo(await r.json());
      } catch (e) { setError("Yüklenemedi."); }
      finally { setLoading(false); }
    })();
  }, [token]);

  const send = async (rows) => {
    const clean = (rows || []).filter((r) => (r.name || "").trim() || (r.phone || "").trim());
    if (clean.length === 0) { toast.error("Kişi bulunamadı"); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/invitations/import/${token}/guests`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side, guests: clean }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Eklenemedi");
      setAdded((x) => x + (d.added || 0));
      toast.success(`${d.added} kişi eklendi`);
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const pick = async () => {
    if (!contactPickerSupported()) { toast.error("Bu telefon rehber seçimini desteklemiyor. vCard yükleyin veya yapıştırın."); return; }
    try {
      const contacts = await navigator.contacts.select(["name", "tel"], { multiple: true });
      await send(contacts.map((c) => ({ name: (c.name && c.name[0]) || "", phone: (c.tel && c.tel[0]) || "" })));
    } catch (e) { /* cancelled */ }
  };

  const onVcf = async (file) => {
    if (!file) return;
    try { await send(parseVcf(await file.text())); } catch (e) { toast.error("vCard okunamadı"); }
    if (vcfRef.current) vcfRef.current.value = "";
  };

  const addPaste = async () => {
    const rows = paste.split(/\n+/).map((line) => {
      const parts = line.split(/[,;\t]+/).map((s) => s.trim()).filter(Boolean);
      if (!parts.length) return null;
      const phonePart = parts.find((p) => p.replace(/\D/g, "").length >= 10);
      const namePart = parts.find((p) => p !== phonePart);
      return { name: namePart || "", phone: phonePart || parts[0] };
    }).filter(Boolean);
    await send(rows);
    setPaste("");
  };

  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-950 text-white"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (error) return <div className="min-h-screen grid place-items-center bg-slate-950 text-white px-6 text-center"><div><Users className="w-8 h-8 mx-auto mb-3 text-slate-500" /><p>{error}</p></div></div>;

  const names = info.person2 ? `${info.person1} & ${info.person2}` : info.person1;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 px-4 py-8" data-testid="guest-import-page">
      <Toaster position="top-center" richColors />
      <div className="max-w-md mx-auto">
        <div className="text-center mb-5">
          <div className="text-xs uppercase tracking-widest text-indigo-600 font-semibold">Fotuber · Misafir Aktarımı</div>
          <h1 className="text-2xl font-bold mt-1">{names}</h1>
          <p className="text-sm text-slate-500 mt-1">Rehberinizden misafirleri seçin; davet listesine eklensin.</p>
          {added > 0 && <div className="mt-2 inline-flex items-center gap-1 text-emerald-600 text-sm"><Check className="w-4 h-4" /> {added} kişi eklendi</div>}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div>
            <div className="text-sm font-medium mb-2">Hangi taraf?</div>
            <div className="flex rounded-lg overflow-hidden border border-slate-200">
              {["gelin", "damat"].map((s) => (
                <button key={s} onClick={() => setSide(s)} data-testid={`import-side-${s}`}
                  className={`flex-1 py-2.5 text-sm font-semibold ${side === s ? (s === "gelin" ? "bg-rose-500 text-white" : "bg-blue-600 text-white") : "bg-white text-slate-600"}`}>
                  {s === "gelin" ? "Gelin Tarafı" : "Damat Tarafı"}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={pick} disabled={busy} className="w-full bg-slate-900 hover:bg-slate-800 h-12" data-testid="import-pick-contacts">
            <Smartphone className="w-5 h-5 mr-2" /> Rehberimden Seç
          </Button>
          <p className="text-[11px] text-slate-400 -mt-2 text-center">Android Chrome'da rehber açılır (çoklu seçim). iPhone'da vCard/yapıştır kullanın.</p>

          <Button onClick={() => vcfRef.current?.click()} disabled={busy} variant="outline" className="w-full h-12" data-testid="import-vcf-btn">
            <Upload className="w-5 h-5 mr-2" /> vCard (.vcf) Yükle
          </Button>
          <input ref={vcfRef} type="file" accept=".vcf,text/vcard" className="hidden" onChange={(e) => onVcf(e.target.files?.[0])} data-testid="import-vcf-input" />

          <div>
            <Textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} className="font-mono text-sm"
              placeholder={"Yapıştır (her satır: İsim, Numara)\nAyşe, 0555 111 22 33"} data-testid="import-paste" />
            <Button onClick={addPaste} disabled={busy} className="w-full mt-2 bg-slate-900 hover:bg-slate-800" data-testid="import-add-paste">
              <ClipboardList className="w-4 h-4 mr-2" /> Ekle
            </Button>
          </div>
        </div>
        <p className="text-center text-[11px] text-slate-400 mt-4">Eklediğiniz kişiler ev sahibinin davet panelinde görünür.</p>
      </div>
    </div>
  );
}
