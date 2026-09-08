import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Save, Trash2, RotateCw, RotateCcw, Plus, Minus, Users, X, UserCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { venueApi } from "@/lib/venueApi";
import { SYMBOL_GROUPS, SYMBOL_MAP, isTable } from "@/lib/venueSymbols";

const uid = () => Math.random().toString(36).slice(2, 9);
const TL_ROLES = [["fotografci", "Fotoğrafçı"], ["garson_sefi", "Garson Şefi"], ["muzisyen", "Müzisyen"], ["salon_gorevlisi", "Salon Görevlisi"], ["salon_muduru", "Müdür"], ["sanatci", "Sanatçı"], ["kameraman", "Kameraman"]];

// Hazır akış (run-of-show) şablonları — tek tıkla timeline'a eklenir.
const TL_PRESETS = {
  dugun: { label: "💍 Düğün", items: [
    { time: "19:00", title: "Davetli Girişi & Kokteyl", roles: ["garson_sefi", "salon_gorevlisi"] },
    { time: "19:45", title: "Gelin & Damat Girişi / İlk Dans", roles: ["fotografci", "muzisyen", "kameraman"] },
    { time: "20:15", title: "Nikah Töreni", roles: ["fotografci", "kameraman", "salon_muduru"] },
    { time: "21:00", title: "Yemek Servisi", roles: ["garson_sefi"] },
    { time: "21:45", title: "Pasta & Takı Töreni", roles: ["fotografci", "kameraman", "garson_sefi"] },
    { time: "22:30", title: "Halay & Eğlence", roles: ["muzisyen", "sanatci"] },
    { time: "23:30", title: "Kapanış & Uğurlama", roles: ["salon_gorevlisi"] },
  ] },
  nisan: { label: "🥂 Nişan", items: [
    { time: "18:30", title: "Davetli Girişi", roles: ["salon_gorevlisi"] },
    { time: "19:00", title: "Çiftin Girişi", roles: ["fotografci", "muzisyen"] },
    { time: "19:30", title: "Yüzük Takma Töreni", roles: ["fotografci", "kameraman"] },
    { time: "20:00", title: "İkram & Pasta", roles: ["garson_sefi"] },
    { time: "20:45", title: "Müzik & Sohbet", roles: ["muzisyen"] },
  ] },
  kina: { label: "🔴 Kına", items: [
    { time: "20:00", title: "Karşılama", roles: ["salon_gorevlisi"] },
    { time: "20:30", title: "Gelin Alayı & Giriş", roles: ["fotografci", "muzisyen", "kameraman"] },
    { time: "21:00", title: "Kına Yakma Töreni", roles: ["fotografci", "kameraman", "sanatci"] },
    { time: "21:45", title: "Oyunlar & Eğlence", roles: ["muzisyen", "sanatci"] },
    { time: "22:30", title: "İkram", roles: ["garson_sefi"] },
  ] },
  sunnet: { label: "🎈 Sünnet", items: [
    { time: "13:00", title: "Misafir Girişi", roles: ["salon_gorevlisi"] },
    { time: "13:30", title: "Çocuğun Girişi (Prens Konsepti)", roles: ["fotografci", "kameraman"] },
    { time: "14:00", title: "Animasyon & Gösteri", roles: ["sanatci", "muzisyen"] },
    { time: "14:45", title: "Pasta & İkram", roles: ["garson_sefi", "fotografci"] },
    { time: "15:30", title: "Kapanış", roles: ["salon_gorevlisi"] },
  ] },
};

export default function FloorPlanBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [els, setEls] = useState([]);
  const [assign, setAssign] = useState({});
  const [sel, setSel] = useState(null);
  const [saving, setSaving] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const [timeline, setTimeline] = useState([]);
  const [tlOpen, setTlOpen] = useState(false);
  const [tlTemplates, setTlTemplates] = useState([]);
  const [couples, setCouples] = useState([]);
  const [coupleId, setCoupleId] = useState("");
  const [guests, setGuests] = useState([]);
  const canvasRef = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    venueApi.get(`/venue/floorplans/${id}`).then(({ data }) => {
      setPlan(data.plan); setEls(data.plan.elements || []); setAssign(data.plan.assignments || {}); setTimeline(data.plan.timeline || []);
      if (data.plan.invitation_id) setCoupleId(data.plan.invitation_id);
    }).catch(() => { toast.error("Kroki yüklenemedi"); navigate("/salon/panel"); });
    venueApi.get("/venue/couples").then(({ data }) => setCouples(data.couples || [])).catch(() => {});
    venueApi.get("/venue/timeline-templates").then(({ data }) => setTlTemplates(data.templates || [])).catch(() => {});
  }, [id, navigate]);

  useEffect(() => {
    if (!coupleId) { setGuests([]); return; }
    venueApi.get(`/venue/couples/${coupleId}/guests`).then(({ data }) => setGuests(data.guests || [])).catch(() => setGuests([]));
  }, [coupleId]);

  const addSymbol = (t) => {
    const s = SYMBOL_MAP[t];
    const off = (els.length % 10) * 26;
    const el = { elId: uid(), type: t, label: s.label, left: 120 + off, top: 90 + off, w: s.w, h: s.h, rot: 0 };
    if (s.table) el.seats = s.seats || 8;
    setEls((p) => [...p, el]); setSel(el.elId);
  };
  const patchSel = (patch) => setEls((p) => p.map((e) => (e.elId === sel ? { ...e, ...patch } : e)));
  const delSel = () => { setEls((p) => p.filter((e) => e.elId !== sel)); setAssign((a) => { const n = { ...a }; delete n[sel]; return n; }); setSel(null); };

  const onDown = (e, el) => {
    e.stopPropagation();
    setSel(el.elId);
    const pt = e.touches ? e.touches[0] : e;
    const rect = canvasRef.current.getBoundingClientRect();
    drag.current = { id: el.elId, dx: pt.clientX - rect.left - el.left, dy: pt.clientY - rect.top - el.top };
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const pt = e.touches ? e.touches[0] : e;
    const rect = canvasRef.current.getBoundingClientRect();
    const left = Math.max(0, Math.min(rect.width - 20, pt.clientX - rect.left - drag.current.dx));
    const top = Math.max(0, Math.min(rect.height - 20, pt.clientY - rect.top - drag.current.dy));
    setEls((p) => p.map((el) => (el.elId === drag.current.id ? { ...el, left, top } : el)));
  };
  const onUp = () => { drag.current = null; };

  const save = async () => {
    setSaving(true);
    try {
      await venueApi.put(`/venue/floorplans/${id}`, { elements: els, assignments: assign, timeline, invitation_id: coupleId || null });
      toast.success("Kroki kaydedildi");
    } catch { toast.error("Kaydedilemedi"); } finally { setSaving(false); }
  };

  const selEl = els.find((e) => e.elId === sel);
  const assignedAll = new Set(Object.values(assign).flat());
  const unassigned = guests.filter((g) => !assignedAll.has(g.name));
  const assignGuest = (name) => { if (!sel) return; setAssign((a) => ({ ...a, [sel]: [...(a[sel] || []), name] })); };
  const unassignGuest = (elId, name) => setAssign((a) => ({ ...a, [elId]: (a[elId] || []).filter((n) => n !== name) }));

  const addTl = () => setTimeline((t) => [...t, { id: uid(), time: "20:00", title: "", roles: [], note: "" }].sort((a, b) => (a.time || "").localeCompare(b.time || "")));
  const patchTl = (tid, patch) => setTimeline((t) => t.map((it) => (it.id === tid ? { ...it, ...patch } : it)));
  const delTl = (tid) => setTimeline((t) => t.filter((it) => it.id !== tid));
  const toggleTlRole = (tid, r) => setTimeline((t) => t.map((it) => it.id === tid ? { ...it, roles: (it.roles || []).includes(r) ? it.roles.filter((x) => x !== r) : [...(it.roles || []), r] } : it));
  const applyPreset = (key) => {
    const p = TL_PRESETS[key]; if (!p) return;
    const items = p.items.map((it) => ({ id: uid(), note: "", ...it }));
    setTimeline((t) => [...t, ...items].sort((a, b) => (a.time || "").localeCompare(b.time || "")));
    setTlOpen(true);
  };
  const loadTemplates = () => venueApi.get("/venue/timeline-templates").then(({ data }) => setTlTemplates(data.templates || [])).catch(() => {});
  const saveTemplate = async () => {
    if (!timeline.length) { toast.error("Önce akış öğesi ekleyin"); return; }
    const name = window.prompt("Şablon adı (örn. Klasik Düğün Akışı):", plan?.name ? `${plan.name} Akışı` : "");
    if (!name || !name.trim()) return;
    try {
      const clean = timeline.map(({ id: _i, ...rest }) => rest); // id'siz sakla; uygulanınca yeni id verilir
      await venueApi.post("/venue/timeline-templates", { name: name.trim(), timeline: clean });
      toast.success("Akış şablonu kaydedildi");
      loadTemplates();
    } catch (e) { toast.error("Kaydedilemedi"); }
  };
  const applyTemplate = (tpl) => {
    const items = (tpl.timeline || []).map((it) => ({ id: uid(), note: "", ...it }));
    setTimeline((t) => [...t, ...items].sort((a, b) => (a.time || "").localeCompare(b.time || "")));
    setTlOpen(true);
    toast.success(`"${tpl.name}" akışa eklendi`);
  };
  const deleteTemplate = async (tid) => {
    if (!window.confirm("Şablon silinsin mi?")) return;
    try { await venueApi.delete(`/venue/timeline-templates/${tid}`); loadTemplates(); }
    catch { toast.error("Silinemedi"); }
  };

  if (!plan) return <div className="min-h-screen grid place-items-center bg-slate-950 text-white">Yükleniyor…</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col" onMouseMove={onMove} onMouseUp={onUp} onTouchMove={onMove} onTouchEnd={onUp}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-slate-900/80 backdrop-blur sticky top-0 z-30">
        <button onClick={() => navigate("/salon/panel")} className="text-white/70 hover:text-white" data-testid="fp-back"><ArrowLeft size={20} /></button>
        <input value={plan.name} onChange={(e) => setPlan((p) => ({ ...p, name: e.target.value }))}
          onBlur={(e) => venueApi.put(`/venue/floorplans/${id}`, { name: e.target.value, elements: els, assignments: assign }).catch(() => {})}
          className="bg-transparent border-b border-white/20 text-lg font-semibold outline-none focus:border-amber-400 max-w-[40vw]" data-testid="fp-name" />
        <span className="text-xs px-2 py-0.5 rounded-full bg-white/10">{plan.area_type === "garden" ? "🌳 Kır Bahçesi" : "🏛️ Kapalı Salon"}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={() => setGuestOpen((o) => !o)} variant="outline" className="border-white/20 text-black" data-testid="fp-guests-toggle"><Users size={16} className="mr-1" /> Davetli / Masa</Button>
          <Button onClick={() => setTlOpen((o) => !o)} variant="outline" className="border-white/20 text-black" data-testid="fp-timeline-toggle"><Clock size={16} className="mr-1" /> Akış Programı</Button>
          <Button onClick={save} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-black" data-testid="fp-save"><Save size={16} className="mr-1" /> {saving ? "…" : "Kaydet"}</Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Palette */}
        <div className="w-52 shrink-0 border-r border-white/10 overflow-y-auto p-3 space-y-4 bg-slate-900/40" data-testid="fp-palette">
          {SYMBOL_GROUPS.map((g) => (
            <div key={g.key}>
              <div className="text-[11px] uppercase tracking-wider text-white/40 mb-2">{g.label}</div>
              <div className="grid grid-cols-2 gap-1.5">
                {g.items.map((it) => (
                  <button key={it.type} onClick={() => addSymbol(it.type)} data-testid={`fp-add-${it.type}`}
                    className="flex flex-col items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/10 py-2 transition">
                    <span className="text-lg">{it.emoji}</span>
                    <span className="text-[9px] text-white/60 leading-tight text-center px-1">{it.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-auto p-6 bg-[radial-gradient(circle,#1e293b_1px,transparent_1px)] [background-size:22px_22px]" onMouseDown={() => setSel(null)}>
          <div ref={canvasRef} className="relative mx-auto rounded-xl border border-white/10"
            style={{ width: 960, height: 640, background: plan.area_type === "garden" ? "linear-gradient(#14321f,#0d2417)" : "linear-gradient(#1e293b,#0f172a)" }}
            data-testid="fp-canvas">
            {els.map((el) => {
              const s = SYMBOL_MAP[el.type] || {};
              const active = el.elId === sel;
              const cnt = (assign[el.elId] || []).length;
              const cap = el.seats ?? s.seats;
              const over = isTable(el.type) && cap != null && cnt > cap;
              return (
                <div key={el.elId} onMouseDown={(e) => onDown(e, el)} onTouchStart={(e) => onDown(e, el)}
                  data-testid={`fp-el-${el.elId}`}
                  className={`absolute grid place-items-center cursor-move select-none ${active ? "ring-2 ring-amber-400 z-20" : "z-10"}`}
                  style={{ left: el.left, top: el.top, width: el.w, height: el.h, transform: `rotate(${el.rot}deg)`,
                    background: s.fill, borderRadius: s.shape === "circle" ? "9999px" : "8px", boxShadow: "0 4px 12px rgba(0,0,0,.4)" }}>
                  <span className="text-[10px] font-semibold text-white/95 text-center leading-none pointer-events-none px-1">
                    <span className="block text-sm">{s.emoji}</span>{el.label}
                    {isTable(el.type) && <span className={`block mt-0.5 rounded px-1 ${over ? "bg-red-600" : "bg-black/40"}`}>{cnt}/{cap ?? "?"}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Guest panel */}
        {guestOpen && (
          <div className="w-72 shrink-0 border-l border-white/10 bg-slate-900/60 p-3 overflow-y-auto" data-testid="fp-guest-panel">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">Davetli Yerleştirme</h3>
              <button onClick={() => setGuestOpen(false)} className="text-white/50"><X size={16} /></button>
            </div>
            <label className="text-[11px] text-white/50">Çift (davet kodu kullanan)</label>
            <select value={coupleId} onChange={(e) => setCoupleId(e.target.value)} data-testid="fp-couple-select"
              className="w-full mt-1 mb-3 rounded-lg bg-white/5 border border-white/15 px-2 py-2 text-sm">
              <option value="">— Çift seçin —</option>
              {couples.map((c) => <option key={c.invitation_id} value={c.invitation_id}>{c.names} ({c.attending_count} kişi)</option>)}
            </select>
            {!coupleId && <p className="text-[11px] text-white/40">Bir çift seçince "Katılacağım" diyen davetliler listelenir. Bir masa seçip aşağıdan davetli atayın.</p>}
            {coupleId && (
              <>
                <div className="text-[11px] text-white/50 mb-1">Atanmamış ({unassigned.length}) {selEl && isTable(selEl.type) ? `→ ${selEl.label}` : "(önce masa seçin)"}</div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {unassigned.map((g) => (
                    <button key={g.name} disabled={!(selEl && isTable(selEl.type))} onClick={() => assignGuest(g.name)}
                      data-testid={`fp-guest-${g.name}`}
                      className="text-[11px] px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 disabled:opacity-40 hover:bg-emerald-500/25">
                      {g.name}{g.party > 1 ? ` +${g.party - 1}` : ""}
                    </button>
                  ))}
                  {unassigned.length === 0 && <span className="text-[11px] text-white/40">Tüm davetliler yerleştirildi 🎉</span>}
                </div>
                {selEl && isTable(selEl.type) && (
                  <div className="rounded-lg bg-white/5 p-2">
                    <div className="text-[11px] text-white/60 mb-1 flex items-center gap-1"><UserCheck size={12} /> {selEl.label} — {(assign[sel] || []).length}/{selEl.seats ?? SYMBOL_MAP[selEl.type].seats ?? 8} kişi</div>
                    <div className="flex flex-wrap gap-1">
                      {(assign[sel] || []).map((n) => (
                        <span key={n} className="text-[11px] px-2 py-1 rounded-full bg-amber-500/20 border border-amber-400/30 flex items-center gap-1">
                          {n}<button onClick={() => unassignGuest(sel, n)} className="text-white/50 hover:text-white"><X size={10} /></button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Run of Show timeline panel */}
        {tlOpen && (
          <div className="w-80 shrink-0 border-l border-white/10 bg-slate-900/60 p-3 overflow-y-auto" data-testid="fp-timeline-panel">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm flex items-center gap-1.5"><Clock size={15} /> Akış Programı</h3>
              <button onClick={() => setTlOpen(false)} className="text-white/50"><X size={16} /></button>
            </div>
            <p className="text-[11px] text-white/45 mb-3">Saat, olay ve uyarılacak personel rollerini girin. Personel kioskunda sıra 5 dk kala sesli/pop-up uyarı düşer. Değişiklikleri <b>Kaydet</b> ile saklayın.</p>
            <div className="mb-3">
              <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5">Hazır Şablon Ekle</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(TL_PRESETS).map(([k, p]) => (
                  <button key={k} onClick={() => applyPreset(k)} data-testid={`tl-preset-${k}`}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-amber-400/40 text-amber-200 hover:bg-amber-500/15">
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Kaydedilmiş kendi şablonlarım */}
            <div className="mb-3" data-testid="tl-my-templates">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[10px] uppercase tracking-wider text-white/40">Kayıtlı Akış Şablonlarım</div>
                <button onClick={saveTemplate} data-testid="tl-save-template"
                  className="text-[11px] px-2 py-0.5 rounded-md border border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/15 flex items-center gap-1">
                  <Save size={12} /> Şablon Olarak Kaydet
                </button>
              </div>
              {tlTemplates.length === 0 ? (
                <p className="text-[10px] text-white/35">Henüz şablon yok. Akışını düzenleyip "Şablon Olarak Kaydet" ile sakla, sonra tek tıkla uygula.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {tlTemplates.map((tpl) => (
                    <span key={tpl.id} data-testid={`tl-template-${tpl.id}`}
                      className="text-[11px] pl-2.5 pr-1 py-1 rounded-full border border-sky-400/40 text-sky-200 flex items-center gap-1 hover:bg-sky-500/15">
                      <button onClick={() => applyTemplate(tpl)} className="max-w-[120px] truncate" title={tpl.name}>{tpl.name}</button>
                      <button onClick={() => deleteTemplate(tpl.id)} className="text-red-300 hover:text-red-400 px-1" data-testid={`tl-template-del-${tpl.id}`}><X size={11} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              {timeline.map((it) => (
                <div key={it.id} className="rounded-lg bg-white/5 border border-white/10 p-2.5" data-testid={`tl-item-${it.id}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <input type="time" value={it.time} onChange={(e) => patchTl(it.id, { time: e.target.value })} data-testid={`tl-time-${it.id}`}
                      className="bg-white/10 rounded px-2 py-1 text-sm outline-none" />
                    <input value={it.title} onChange={(e) => patchTl(it.id, { title: e.target.value })} placeholder="Olay (örn. Pasta Kesimi)" data-testid={`tl-title-${it.id}`}
                      className="flex-1 bg-white/10 rounded px-2 py-1 text-sm outline-none" />
                    <button onClick={() => delTl(it.id)} className="text-red-300 p-1"><Trash2 size={14} /></button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {TL_ROLES.map(([k, lbl]) => (
                      <button key={k} onClick={() => toggleTlRole(it.id, k)} data-testid={`tl-role-${it.id}-${k}`}
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${(it.roles || []).includes(k) ? "bg-amber-500 text-black border-amber-400" : "border-white/15 text-white/50"}`}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {timeline.length === 0 && <p className="text-[11px] text-white/40">Henüz akış öğesi yok.</p>}
            </div>
            <Button onClick={addTl} data-testid="tl-add" className="w-full mt-3 bg-white/10 hover:bg-white/20"><Plus size={15} className="mr-1" /> Olay Ekle</Button>
          </div>
        )}
      </div>

      {/* Selected element toolbar */}
      {selEl && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 rounded-full bg-slate-800 border border-white/15 px-3 py-2 shadow-xl" data-testid="fp-el-toolbar">
          <span className="text-xs text-white/70 pr-1">{selEl.label}</span>
          <input value={selEl.label} onChange={(e) => patchSel({ label: e.target.value })} className="w-24 bg-white/10 rounded px-2 py-1 text-xs outline-none" data-testid="fp-el-label" />
          <button onClick={() => patchSel({ rot: (selEl.rot - 15) })} className="p-1.5 rounded hover:bg-white/10" data-testid="fp-rot-l"><RotateCcw size={15} /></button>
          <button onClick={() => patchSel({ rot: (selEl.rot + 15) })} className="p-1.5 rounded hover:bg-white/10" data-testid="fp-rot-r"><RotateCw size={15} /></button>
          <button onClick={() => patchSel({ w: Math.max(20, selEl.w - 12), h: Math.max(12, selEl.h - 12) })} className="p-1.5 rounded hover:bg-white/10" data-testid="fp-size-down"><Minus size={15} /></button>
          <button onClick={() => patchSel({ w: selEl.w + 12, h: selEl.h + 12 })} className="p-1.5 rounded hover:bg-white/10" data-testid="fp-size-up"><Plus size={15} /></button>
          {isTable(selEl.type) && (
            <span className="flex items-center gap-1 pl-2 ml-1 border-l border-white/15" data-testid="fp-seats-control">
              <Users size={13} className="text-white/60" />
              <button onClick={() => patchSel({ seats: Math.max(1, (selEl.seats ?? SYMBOL_MAP[selEl.type].seats ?? 8) - 1) })} className="p-1 rounded hover:bg-white/10" data-testid="fp-seats-down"><Minus size={13} /></button>
              <input type="number" min="1" max="40" value={selEl.seats ?? SYMBOL_MAP[selEl.type].seats ?? 8}
                onChange={(e) => patchSel({ seats: Math.max(1, Math.min(40, parseInt(e.target.value) || 1)) })}
                className="w-10 bg-white/10 rounded px-1 py-0.5 text-xs text-center outline-none" data-testid="fp-seats-input" />
              <button onClick={() => patchSel({ seats: (selEl.seats ?? SYMBOL_MAP[selEl.type].seats ?? 8) + 1 })} className="p-1 rounded hover:bg-white/10" data-testid="fp-seats-up"><Plus size={13} /></button>
              <span className="text-[10px] text-white/40">kişi</span>
            </span>
          )}
          <button onClick={delSel} className="p-1.5 rounded hover:bg-red-500/20 text-red-300 ml-1" data-testid="fp-del"><Trash2 size={15} /></button>
        </div>
      )}
    </div>
  );
}
