import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { QRCodeCanvas } from "qrcode.react";
import { Loader2, UserPlus, Users, Trash2, Send, Upload, QrCode, ClipboardList, Smartphone, Check, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const API = process.env.REACT_APP_BACKEND_URL;
const api = (path, opts = {}) => fetch(`${API}/api${path}`, { credentials: "include", ...opts });

const waNumber = (raw) => {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("90")) return d;
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) return "90" + d;
  return d;
};

// Parse a .vcf (vCard) file into {name, phone} rows.
export const parseVcf = (text) => {
  const cards = text.split(/BEGIN:VCARD/i).slice(1);
  const out = [];
  for (const c of cards) {
    const fn = (c.match(/\nFN[^:\n]*:(.*)/i) || [])[1] || (c.match(/\nN[^:\n]*:(.*)/i) || [])[1] || "";
    const tels = [...c.matchAll(/TEL[^:\n]*:([^\n\r]+)/gi)].map((m) => m[1].trim());
    const name = fn.replace(/;/g, " ").replace(/\s+/g, " ").trim();
    if (tels.length) out.push({ name: name || tels[0], phone: tels[0] });
    else if (name) out.push({ name, phone: "" });
  }
  return out;
};

export const contactPickerSupported = () => typeof navigator !== "undefined" && "contacts" in navigator && "ContactsManager" in window;

const SIDE_LABEL = { gelin: "Gelin Tarafı", damat: "Damat Tarafı", "": "Belirsiz" };
const SIDE_COLOR = { gelin: "bg-rose-100 text-rose-700 border-rose-200", damat: "bg-blue-100 text-blue-700 border-blue-200", "": "bg-slate-100 text-slate-600 border-slate-200" };

// Special family roles (auto-imply the side).
export const GUEST_ROLES = [
  { key: "gelin_anne", label: "Gelinin Annesi", side: "gelin" },
  { key: "gelin_baba", label: "Gelinin Babası", side: "gelin" },
  { key: "damat_anne", label: "Damadın Annesi", side: "damat" },
  { key: "damat_baba", label: "Damadın Babası", side: "damat" },
];
const ROLE_LABEL = GUEST_ROLES.reduce((a, r) => ((a[r.key] = r.label), a), {});

const StatusBadge = ({ s }) => {
  const map = {
    yes: ["Geliyor", "bg-emerald-100 text-emerald-700", Check],
    no: ["Gelemiyor", "bg-rose-100 text-rose-700", X],
    pending: ["Bekliyor", "bg-amber-100 text-amber-700", Clock],
  };
  const [label, cls, Icon] = map[s] || map.pending;
  return <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${cls}`}><Icon className="w-3 h-3" />{label}</span>;
};

export default function GuestManager({ inv }) {
  const [guests, setGuests] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [side, setSide] = useState("gelin");        // side for adds
  const [filter, setFilter] = useState("all");       // list filter
  const [manual, setManual] = useState({ name: "", phone: "", role: "" });
  const [paste, setPaste] = useState("");
  const [qrToken, setQrToken] = useState(null);
  const vcfRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await api(`/invitations/${inv.id}/guests`);
      const d = await r.json();
      if (r.ok) { setGuests(d.guests || []); setSummary(d.summary || null); }
    } catch (e) { /* ignore */ }
    finally { setLoading(false); }
  }, [inv.id]);

  useEffect(() => { load(); }, [load]);

  const bulkAdd = async (rows, sideVal) => {
    const clean = (rows || []).filter((r) => (r.name || "").trim() || (r.phone || "").trim());
    if (clean.length === 0) { toast.error("Eklenecek kişi bulunamadı"); return; }
    setBusy(true);
    try {
      const r = await api(`/invitations/${inv.id}/guests/bulk`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side: sideVal, guests: clean }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Eklenemedi");
      toast.success(`${d.added} kişi eklendi (${SIDE_LABEL[sideVal]})`);
      load();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const addManual = async () => {
    if (!manual.name.trim() && !manual.phone.trim()) { toast.error("İsim veya numara girin"); return; }
    const roleSide = GUEST_ROLES.find((r) => r.key === manual.role)?.side;
    await bulkAdd([manual], roleSide || side);
    setManual({ name: "", phone: "", role: "" });
  };

  // Quick-add a special family member (prompts for name + phone).
  const addRole = async (roleKey) => {
    const label = ROLE_LABEL[roleKey];
    const name = window.prompt(`${label} — Ad Soyad`, "");
    if (name === null) return;
    const phone = window.prompt(`${label} — Telefon (isteğe bağlı)`, "");
    if (phone === null) return;
    const roleSide = GUEST_ROLES.find((r) => r.key === roleKey)?.side;
    await bulkAdd([{ name: name.trim() || label, phone: (phone || "").trim(), role: roleKey }], roleSide);
  };

  const addPaste = async () => {
    const rows = paste.split(/\n+/).map((line) => {
      const parts = line.split(/[,;\t]+/).map((s) => s.trim()).filter(Boolean);
      if (parts.length === 0) return null;
      // detect which part is the phone (has many digits)
      const phonePart = parts.find((p) => (p.replace(/\D/g, "").length >= 10));
      const namePart = parts.find((p) => p !== phonePart);
      return { name: namePart || "", phone: phonePart || parts[0] };
    }).filter(Boolean);
    await bulkAdd(rows, side);
    setPaste("");
  };

  const onVcf = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseVcf(text);
      if (rows.length === 0) { toast.error("vCard içinde kişi bulunamadı"); return; }
      await bulkAdd(rows, side);
    } catch (e) { toast.error("vCard okunamadı"); }
    if (vcfRef.current) vcfRef.current.value = "";
  };

  const pickContacts = async () => {
    if (!contactPickerSupported()) {
      toast.error("Bu cihaz/tarayıcı rehber seçimini desteklemiyor. vCard yükleyin, yapıştırın veya QR ile telefondan aktarın.");
      return;
    }
    try {
      const contacts = await navigator.contacts.select(["name", "tel"], { multiple: true });
      const rows = contacts.map((c) => ({ name: (c.name && c.name[0]) || "", phone: (c.tel && c.tel[0]) || "" }));
      await bulkAdd(rows, side);
    } catch (e) { /* user cancelled */ }
  };

  const openQr = async () => {
    setBusy(true);
    try {
      const r = await api(`/invitations/${inv.id}/import-token`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Oluşturulamadı");
      setQrToken(d.token);
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const sendWhatsApp = (g) => {
    const num = waNumber(g.phone);
    const link = `${window.location.origin}/davetiye/${inv.slug}?g=${g.guest_token}`;
    const names = inv.person2 ? `${inv.person1} & ${inv.person2}` : inv.person1;
    const msg = encodeURIComponent(`Merhaba ${g.name || ""}! ${names} olarak sizi özel günümüze davet ediyoruz 💐\nDavetiye, konum ve LCV için: ${link}`);
    const url = num ? `https://wa.me/${num}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(url, "_blank");
    api(`/invitations/${inv.id}/guests/${g.id}/sent`, { method: "POST" }).then(() => load());
  };

  const removeGuest = async (gid) => {
    try {
      await api(`/invitations/${inv.id}/guests/${gid}`, { method: "DELETE" });
      setGuests((x) => x.filter((g) => g.id !== gid));
    } catch (e) { toast.error("Silinemedi"); }
  };

  const importUrl = qrToken ? `${window.location.origin}/davetiye/import/${qrToken}` : "";
  const shown = guests.filter((g) => filter === "all" || g.side === filter);

  const SideStat = ({ sideKey, label }) => {
    const s = summary?.[sideKey] || { total: 0, yes: 0, no: 0, pending: 0 };
    return (
      <div className={`rounded-xl border p-3 ${sideKey === "gelin" ? "border-rose-200 bg-rose-50/50" : sideKey === "damat" ? "border-blue-200 bg-blue-50/50" : "border-slate-200"}`} data-testid={`guest-stat-${sideKey}`}>
        <div className="text-xs font-semibold text-slate-700 mb-1">{label}</div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-500">Toplam <b className="text-slate-800">{s.total}</b></span>
          <span className="text-emerald-600">Geliyor <b>{s.yes}</b></span>
          <span className="text-rose-500">Gelmiyor <b>{s.no}</b></span>
          <span className="text-amber-600">Bekliyor <b>{s.pending}</b></span>
        </div>
      </div>
    );
  };

  return (
    <div className="text-slate-900" data-testid="guest-manager">
      {/* Summary */}
      <div className="grid sm:grid-cols-2 gap-2 mb-4">
        <SideStat sideKey="gelin" label="Gelin Tarafı" />
        <SideStat sideKey="damat" label="Damat Tarafı" />
      </div>

      {/* Add tools */}
      <div className="rounded-xl border border-slate-200 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-medium">Taraf:</span>
          <div className="flex rounded-lg overflow-hidden border border-slate-200">
            {["gelin", "damat"].map((s) => (
              <button key={s} onClick={() => setSide(s)} data-testid={`guest-side-${s}`}
                className={`px-4 py-1.5 text-sm font-medium ${side === s ? (s === "gelin" ? "bg-rose-500 text-white" : "bg-blue-600 text-white") : "bg-white text-slate-600"}`}>
                {s === "gelin" ? "Gelin" : "Damat"}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400">Eklenenler bu tarafa yazılır</span>
        </div>

        {/* Manual */}
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <Input placeholder="İsim" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} data-testid="guest-manual-name" />
          <Input placeholder="Telefon" value={manual.phone} onChange={(e) => setManual({ ...manual, phone: e.target.value })} data-testid="guest-manual-phone" />
          <select value={manual.role} onChange={(e) => setManual({ ...manual, role: e.target.value })} data-testid="guest-manual-role"
            className="rounded-md border border-slate-200 text-sm px-2 h-10 bg-white text-slate-700 shrink-0">
            <option value="">Rol yok</option>
            {GUEST_ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <Button onClick={addManual} disabled={busy} className="bg-slate-900 hover:bg-slate-800 shrink-0" data-testid="guest-add-manual"><UserPlus className="w-4 h-4 mr-1" /> Ekle</Button>
        </div>

        {/* Special family roles quick-add */}
        <div className="mb-3">
          <div className="text-[11px] text-slate-500 mb-1.5">Özel kişiler (tek dokunuşla ekle):</div>
          <div className="flex flex-wrap gap-1.5" data-testid="guest-roles">
            {GUEST_ROLES.map((r) => (
              <button key={r.key} type="button" onClick={() => addRole(r.key)} disabled={busy} data-testid={`guest-role-${r.key}`}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium ${r.side === "gelin" ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "border-blue-200 text-blue-700 hover:bg-blue-50"}`}>
                + {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Import buttons */}
        <div className="flex flex-wrap gap-2 mb-3">
          <Button variant="outline" size="sm" onClick={pickContacts} disabled={busy} data-testid="guest-pick-contacts"><Smartphone className="w-4 h-4 mr-1" /> Rehberden Seç</Button>
          <Button variant="outline" size="sm" onClick={() => vcfRef.current?.click()} disabled={busy} data-testid="guest-vcf-btn"><Upload className="w-4 h-4 mr-1" /> vCard (.vcf) Yükle</Button>
          <input ref={vcfRef} type="file" accept=".vcf,text/vcard" className="hidden" onChange={(e) => onVcf(e.target.files?.[0])} data-testid="guest-vcf-input" />
          <Button variant="outline" size="sm" onClick={openQr} disabled={busy} data-testid="guest-qr-btn"><QrCode className="w-4 h-4 mr-1" /> Telefondan Aktar (QR)</Button>
        </div>

        {/* Paste */}
        <div>
          <Textarea rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} className="font-mono text-sm"
            placeholder={"Toplu yapıştır (her satır: İsim, Numara)\nAyşe Yılmaz, 0555 111 22 33\nMehmet Kaya, 0532 444 55 66"} data-testid="guest-paste" />
          <Button onClick={addPaste} disabled={busy} size="sm" className="mt-2 bg-slate-900 hover:bg-slate-800" data-testid="guest-add-paste"><ClipboardList className="w-4 h-4 mr-1" /> Toplu Ekle</Button>
        </div>

        {/* QR panel */}
        {qrToken && (
          <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 text-center" data-testid="guest-qr-panel">
            <div className="text-sm font-medium text-slate-800 mb-1">Telefonunla okut, rehberinden aktar</div>
            <p className="text-[11px] text-slate-500 mb-3">QR'ı telefonunla okut → açılan sayfada Gelin/Damat seç → rehberinden kişileri seç. 24 saat geçerli.</p>
            <div className="bg-white p-3 rounded-xl inline-block"><QRCodeCanvas value={importUrl} size={168} data-testid="guest-qr-code" /></div>
            <div className="mt-2 text-[11px] text-slate-500 break-all">{importUrl}</div>
            <Button variant="ghost" size="sm" className="mt-1 text-slate-500" onClick={() => setQrToken(null)}>Kapat</Button>
          </div>
        )}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 mb-2">
        {[["all", "Tümü"], ["gelin", "Gelin"], ["damat", "Damat"]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} data-testid={`guest-filter-${k}`}
            className={`px-3 py-1 rounded-full text-xs font-medium ${filter === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>{l}</button>
        ))}
        <span className="text-xs text-slate-400 ml-auto">{shown.length} kişi</span>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" /></div>
      ) : shown.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-sm flex flex-col items-center gap-2"><Users className="w-6 h-6" /> Henüz misafir eklenmedi.</div>
      ) : (
        <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1" data-testid="guest-list">
          {shown.map((g) => (
            <div key={g.id} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2" data-testid={`guest-row-${g.id}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800 truncate">{g.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border ${SIDE_COLOR[g.side]}`}>{g.side === "gelin" ? "Gelin" : g.side === "damat" ? "Damat" : "—"}</span>
                  {g.role && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-medium">{ROLE_LABEL[g.role]}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {g.phone && <span className="text-[11px] text-slate-400 font-mono">{g.phone}</span>}
                  <StatusBadge s={g.rsvp_status} />
                  {g.invited && <span className="text-[9px] text-emerald-600">✓ gönderildi</span>}
                </div>
              </div>
              <button onClick={() => sendWhatsApp(g)} title="WhatsApp ile davet gönder" data-testid={`guest-wa-${g.id}`}
                className="w-8 h-8 rounded-lg bg-[#25D366]/10 text-[#128C7E] grid place-items-center hover:bg-[#25D366]/20 shrink-0">
                <Send className="w-4 h-4" />
              </button>
              <button onClick={() => removeGuest(g.id)} title="Sil" data-testid={`guest-del-${g.id}`}
                className="w-8 h-8 rounded-lg bg-rose-50 text-rose-500 grid place-items-center hover:bg-rose-100 shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
