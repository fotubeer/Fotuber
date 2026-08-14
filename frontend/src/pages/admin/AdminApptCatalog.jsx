import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Camera, Package, FileText, ExternalLink, Save, X, DollarSign, Search, Download } from "lucide-react";
import { toast } from "sonner";

const CAT_LABELS = { album: "Albüm", canvas: "Kanvas Tablo", fine: "Fine Tablo", poster: "Poster", print: "Baskı", magazine: "Dergi" };
const tl = (n) => `${Number(n || 0).toLocaleString("tr-TR")} ₺`;

export default function AdminApptCatalog() {
  const location = useLocation();
  const initialTab = new URLSearchParams(location.search).get("tab") || "services";
  const [tab, setTab] = useState(initialTab);
  const [unseen, setUnseen] = useState(0);

  const loadUnseen = () => api.get("/appt-pro/approvals").then(({ data }) => setUnseen(data.unseen || 0)).catch(() => {});
  useEffect(() => { loadUnseen(); const t = setInterval(loadUnseen, 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (tab === "saved" && unseen > 0) { api.post("/appt-pro/approvals/seen").then(() => setUnseen(0)).catch(() => {}); }
  }, [tab, unseen]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2"><FileText className="text-slate-700" /> Randevu Kataloğu</h1>
          <p className="text-sm text-slate-500 mt-1">Fiziki randevu ekranındaki hizmetler, alt seçenekler, ürünler ve sözleşme içeriğini yönetin.</p>
        </div>
        <Link to="/admin/randevu-olustur"><Button className="bg-slate-900 hover:bg-slate-800 gap-2" data-testid="go-builder"><ExternalLink size={16} /> Randevu Oluştur</Button></Link>
      </div>
      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 w-fit">
        {[["services", "Hizmet & Etkinlik", Camera], ["products", "Ürünler", Package], ["bulk", "Toplu Fiyat", DollarSign], ["contract", "Sözleşme İçeriği", FileText], ["saved", "Sözleşme Arşivi", FileText]].map(([k, l, I]) => (
          <button key={k} data-testid={`cat-tab-${k}`} onClick={() => setTab(k)}
            className={`relative px-4 h-9 rounded-lg text-sm font-medium flex items-center gap-1.5 ${tab === k ? "bg-white shadow text-slate-900" : "text-slate-500"}`}>
            <I size={15} /> {l}
            {k === "saved" && unseen > 0 && <span data-testid="approvals-badge" className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">{unseen}</span>}
          </button>
        ))}
      </div>
      {tab === "services" && <ServicesTab />}
      {tab === "products" && <ProductsTab />}
      {tab === "bulk" && <BulkPriceTab />}
      {tab === "contract" && <ContractTab />}
      {tab === "saved" && <ContractsTab />}
    </div>
  );
}

// ── Hizmetler ───────────────────────────────────────────────────────────────
function ServicesTab() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const load = () => api.get("/appt-pro/services").then(({ data }) => setRows(data.services || [])).catch((e) => toast.error(formatApiError(e)));
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const payload = { ...editing, base_price: Number(editing.base_price) || 0, sort: Number(editing.sort) || 0,
        options: (editing.options || []).map((o) => ({ id: o.id, label: o.label, price: Number(o.price) || 0 })) };
      if (editing.id) await api.patch(`/appt-pro/services/${editing.id}`, payload);
      else await api.post("/appt-pro/services", payload);
      toast.success("Kaydedildi"); setEditing(null); load();
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const remove = async (id) => { if (!window.confirm("Silinsin mi?")) return; await api.delete(`/appt-pro/services/${id}`); load(); };

  return (
    <Card className="border-slate-200">
      <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base">Hizmet & Etkinlik Türleri ({rows.length})</CardTitle>
        <Button size="sm" onClick={() => setEditing({ name: "", active: true, sort: rows.length, base_price: 0, venue_enabled: false, options: [] })} className="bg-slate-900 hover:bg-slate-800 gap-1" data-testid="svc-new"><Plus size={15} /> Yeni</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((s) => (
          <div key={s.id} data-testid={`svc-row-${s.id}`} className={`rounded-xl border p-3 flex items-start gap-3 ${s.active ? "border-slate-200" : "border-slate-200 bg-slate-50 opacity-70"}`}>
            <div className="flex-1">
              <div className="font-medium flex items-center gap-2">{s.name}
                {s.venue_enabled && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">mekan</span>}
                {Number(s.base_price) > 0 && <span className="text-xs text-slate-500">temel {tl(s.base_price)}</span>}
              </div>
              {(s.options || []).length > 0 && <div className="text-xs text-slate-500 mt-1">{s.options.map((o) => `${o.label}${Number(o.price) > 0 ? ` (+${tl(o.price)})` : ""}`).join(" · ")}</div>}
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditing({ ...s, options: [...(s.options || [])] })} data-testid={`svc-edit-${s.id}`}><Pencil size={13} /></Button>
            <Button size="sm" variant="destructive" onClick={() => remove(s.id)} data-testid={`svc-del-${s.id}`}><Trash2 size={13} /></Button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">Henüz yok.</p>}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="svc-dialog">
          <DialogHeader><DialogTitle>{editing?.id ? "Hizmet Düzenle" : "Yeni Hizmet"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Ad</Label><Input data-testid="svc-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Temel Fiyat (₺)</Label><Input type="number" value={editing.base_price} onChange={(e) => setEditing({ ...editing, base_price: e.target.value })} /></div>
                <div><Label>Sıra</Label><Input type="number" value={editing.sort} onChange={(e) => setEditing({ ...editing, sort: e.target.value })} /></div>
              </div>
              <label className="flex items-center justify-between text-sm"><span>Mekan alanı göster</span><Switch data-testid="svc-venue" checked={editing.venue_enabled} onCheckedChange={(v) => setEditing({ ...editing, venue_enabled: v })} /></label>
              <label className="flex items-center justify-between text-sm"><span>Aktif</span><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /></label>
              <div>
                <div className="flex items-center justify-between mb-1.5"><Label>Alt Seçenekler (ikramlı/klipli vb.)</Label>
                  <Button size="sm" variant="outline" onClick={() => setEditing({ ...editing, options: [...(editing.options || []), { id: null, label: "", price: 0 }] })} data-testid="svc-opt-add"><Plus size={13} /> Seçenek</Button></div>
                <div className="space-y-2">
                  {(editing.options || []).map((o, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input placeholder="Ad (ör: İkramlı)" value={o.label} data-testid={`svc-opt-label-${i}`} onChange={(e) => { const opts = [...editing.options]; opts[i] = { ...o, label: e.target.value }; setEditing({ ...editing, options: opts }); }} />
                      <Input type="number" placeholder="₺" className="w-24" value={o.price} data-testid={`svc-opt-price-${i}`} onChange={(e) => { const opts = [...editing.options]; opts[i] = { ...o, price: e.target.value }; setEditing({ ...editing, options: opts }); }} />
                      <button onClick={() => setEditing({ ...editing, options: editing.options.filter((_, j) => j !== i) })} className="text-red-500"><X size={16} /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Vazgeç</Button><Button onClick={save} className="bg-slate-900 hover:bg-slate-800" data-testid="svc-save">Kaydet</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Ürünler ───────────────────────────────────────────────────────────────
function ProductsTab() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const load = () => api.get("/appt-pro/products").then(({ data }) => setRows(data.products || [])).catch((e) => toast.error(formatApiError(e)));
  useEffect(() => { load(); }, []);
  const byCat = useMemo(() => { const m = {}; rows.forEach((p) => (m[p.category] = m[p.category] || []).push(p)); return m; }, [rows]);

  const save = async () => {
    try {
      const payload = { ...editing, price: Number(editing.price) || 0, sort: Number(editing.sort) || 0 };
      if (editing.id) await api.patch(`/appt-pro/products/${editing.id}`, payload);
      else await api.post("/appt-pro/products", payload);
      toast.success("Kaydedildi"); setEditing(null); load();
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const remove = async (id) => { if (!window.confirm("Silinsin mi?")) return; await api.delete(`/appt-pro/products/${id}`); load(); };

  return (
    <Card className="border-slate-200">
      <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base">Ürün Kataloğu ({rows.length})</CardTitle>
        <Button size="sm" onClick={() => setEditing({ category: "album", name: "", variant: "", size: "", price: 0, active: true, sort: rows.length })} className="bg-slate-900 hover:bg-slate-800 gap-1" data-testid="prod-new"><Plus size={15} /> Yeni</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(byCat).map(([cat, list]) => (
          <div key={cat}>
            <div className="text-xs font-semibold text-slate-500 mb-1.5">{CAT_LABELS[cat] || cat} ({list.length})</div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {list.map((p) => (
                <div key={p.id} data-testid={`prod-row-${p.id}`} className={`rounded-lg border p-2 flex items-center gap-2 ${p.active ? "border-slate-200" : "bg-slate-50 opacity-70 border-slate-200"}`}>
                  <div className="flex-1 text-sm"><div className="font-medium">{p.name}{p.variant ? ` · ${p.variant}` : ""}</div><div className="text-xs text-slate-500">{p.size} · {tl(p.price)}</div></div>
                  <button onClick={() => setEditing({ ...p })} className="text-slate-500" data-testid={`prod-edit-${p.id}`}><Pencil size={14} /></button>
                  <button onClick={() => remove(p.id)} className="text-red-500" data-testid={`prod-del-${p.id}`}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent data-testid="prod-dialog">
          <DialogHeader><DialogTitle>{editing?.id ? "Ürün Düzenle" : "Yeni Ürün"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Kategori</Label>
                <Select value={editing.category} onValueChange={(v) => setEditing({ ...editing, category: v })}>
                  <SelectTrigger data-testid="prod-cat"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(CAT_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Ad</Label><Input data-testid="prod-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
                <div><Label>Varyant (Tekli/Aile/Üçlü)</Label><Input data-testid="prod-variant" value={editing.variant} onChange={(e) => setEditing({ ...editing, variant: e.target.value })} /></div>
                <div><Label>Boyut</Label><Input data-testid="prod-size" value={editing.size} onChange={(e) => setEditing({ ...editing, size: e.target.value })} placeholder="Ör: 30x50 / 20 Sayfa" /></div>
                <div><Label>Fiyat (₺)</Label><Input type="number" data-testid="prod-price" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} /></div>
              </div>
              <label className="flex items-center justify-between text-sm"><span>Aktif</span><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /></label>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Vazgeç</Button><Button onClick={save} className="bg-slate-900 hover:bg-slate-800" data-testid="prod-save">Kaydet</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Sözleşme içeriği + tasarım ───────────────────────────────────────────────
const FONT_OPTIONS = [
  ["'Great Vibes', cursive", "Great Vibes (el yazısı)"],
  ["'Dancing Script', cursive", "Dancing Script (el yazısı)"],
  ["'Parisienne', cursive", "Parisienne (el yazısı)"],
  ["'Playfair Display', serif", "Playfair Display"],
  ["'Cormorant Garamond', serif", "Cormorant Garamond"],
  ["'Marcellus', serif", "Marcellus"],
  ["'Cinzel', serif", "Cinzel"],
  ["'Manrope', sans-serif", "Manrope"],
  ["'Montserrat', sans-serif", "Montserrat"],
  ["'Poppins', sans-serif", "Poppins"],
];

function ContractTab() {
  const [s, setS] = useState(null);
  useEffect(() => { api.get("/appt-pro/contract-settings").then(({ data }) => setS(data.settings)).catch((e) => toast.error(formatApiError(e))); }, []);
  const setD = (k, v) => setS((p) => ({ ...p, design: { ...(p.design || {}), [k]: v } }));
  const save = async () => {
    try { const { data } = await api.put("/appt-pro/contract-settings", s); setS(data.settings); toast.success("Sözleşme içeriği kaydedildi"); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  if (!s) return <div className="text-slate-400 py-6">Yükleniyor…</div>;
  const d = s.design || {};
  return (
    <div className="space-y-4" data-testid="contract-tab">
      {/* Tasarım */}
      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base">Sözleşme Tasarımı & Marka</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>Marka — Nişan Evi / Davet seçiliyken</Label><Input data-testid="ct-brand-venue" value={s.brand_name_venue || ""} onChange={(e) => setS({ ...s, brand_name_venue: e.target.value })} placeholder="FOTUBER Photography & Davet Evi" /></div>
            <div><Label>Marka — Sadece Çekim seçiliyken</Label><Input data-testid="ct-brand-photo" value={s.brand_name_photo || ""} onChange={(e) => setS({ ...s, brand_name_photo: e.target.value })} placeholder="FOTUBER Photography" /></div>
            <div><Label>Logo URL (opsiyonel — girilirse amblem yerine kullanılır)</Label><Input data-testid="ct-logo" value={s.logo_url || ""} onChange={(e) => setS({ ...s, logo_url: e.target.value })} /></div>
            <div><Label>Alt Başlık</Label><Input data-testid="ct-subtitle" value={d.subtitle || ""} onChange={(e) => setD("subtitle", e.target.value)} placeholder="HİZMET SÖZLEŞMESİ" /></div>
          </div>
          <div className="grid sm:grid-cols-4 gap-4">
            <div><Label>Vurgu Rengi</Label><Input type="color" data-testid="ct-accent" value={d.accent_color || "#111827"} onChange={(e) => setD("accent_color", e.target.value)} className="h-10 p-1" /></div>
            <div><Label>Metin Rengi</Label><Input type="color" value={d.text_color || "#1a1a1a"} onChange={(e) => setD("text_color", e.target.value)} className="h-10 p-1" /></div>
            <div><Label>Başlık Fontu</Label>
              <Select value={d.title_font} onValueChange={(v) => setD("title_font", v)}><SelectTrigger data-testid="ct-title-font"><SelectValue /></SelectTrigger>
                <SelectContent>{FONT_OPTIONS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><Label>Gövde Fontu</Label>
              <Select value={d.body_font} onValueChange={(v) => setD("body_font", v)}><SelectTrigger data-testid="ct-body-font"><SelectValue /></SelectTrigger>
                <SelectContent>{FONT_OPTIONS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <div className="grid sm:grid-cols-4 gap-4 items-end">
            <div><Label>Başlık Boyutu</Label><Input type="number" value={d.title_size || 30} onChange={(e) => setD("title_size", Number(e.target.value) || 30)} /></div>
            <div><Label>Başlık Hizası</Label>
              <Select value={d.header_align || "left"} onValueChange={(v) => setD("header_align", v)}><SelectTrigger data-testid="ct-align"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="left">Sola</SelectItem><SelectItem value="center">Ortala</SelectItem></SelectContent></Select>
            </div>
            <label className="flex items-center justify-between text-sm rounded-lg border border-slate-200 px-3 h-10"><span>Amblem göster</span><Switch data-testid="ct-emblem" checked={d.show_emblem !== false} onCheckedChange={(v) => setD("show_emblem", v)} /></label>
            <label className="flex items-center justify-between text-sm rounded-lg border border-slate-200 px-3 h-10"><span>İmza zorunlu (müşteri onayında)</span><Switch data-testid="ct-require-sig" checked={s.require_signature !== false} onCheckedChange={(v) => setS({ ...s, require_signature: v })} /></label>
          </div>
          {d.show_emblem !== false && !s.logo_url && (
            <div className="grid sm:grid-cols-3 gap-4">
              <div><Label>Amblem Harfi</Label><Input value={d.emblem_letter || "F"} onChange={(e) => setD("emblem_letter", e.target.value.slice(0, 2))} /></div>
              <div><Label>Amblem Üst Yazı</Label><Input value={d.emblem_top_text || ""} onChange={(e) => setD("emblem_top_text", e.target.value)} placeholder="STUDIO" /></div>
              <div><Label>Amblem Alt Yazı</Label><Input value={d.emblem_bottom_text || ""} onChange={(e) => setD("emblem_bottom_text", e.target.value)} placeholder="Görsel Sanat" /></div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Maddeler */}
      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base">Sözleşme Maddeleri</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2 text-xs text-slate-500">Madde içinde <code>{"{{toplam}}"}</code>, <code>{"{{cayma}}"}</code>, <code>{"{{kalan}}"}</code> yazarsanız sözleşmede otomatik tutarlarla dolar.</div>
          <div className="space-y-3">
            {(s.clauses || []).map((c, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input className="font-semibold" data-testid={`ct-title-${i}`} value={c.title} onChange={(e) => { const cl = [...s.clauses]; cl[i] = { ...c, title: e.target.value }; setS({ ...s, clauses: cl }); }} />
                  <button onClick={() => setS({ ...s, clauses: s.clauses.filter((_, j) => j !== i) })} className="text-red-500" data-testid={`ct-del-${i}`}><Trash2 size={16} /></button>
                </div>
                <Textarea rows={4} data-testid={`ct-body-${i}`} value={c.body} onChange={(e) => { const cl = [...s.clauses]; cl[i] = { ...c, body: e.target.value }; setS({ ...s, clauses: cl }); }} />
              </div>
            ))}
            <Button variant="outline" onClick={() => setS({ ...s, clauses: [...(s.clauses || []), { title: "YENİ MADDE", body: "" }] })} data-testid="ct-add" className="gap-1"><Plus size={15} /> Madde Ekle</Button>
          </div>
          <div><Label>Kabul Metni (en sona eklenir)</Label><Textarea rows={2} data-testid="ct-acceptance" value={s.acceptance_text || ""} onChange={(e) => setS({ ...s, acceptance_text: e.target.value })} /></div>
          <Button onClick={save} className="bg-slate-900 hover:bg-slate-800 gap-2" data-testid="ct-save"><Save size={16} /> Tümünü Kaydet</Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Toplu Fiyat düzenleme ─────────────────────────────────────────────────
function BulkPriceTab() {
  const [services, setServices] = useState([]);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const load = () => {
    api.get("/appt-pro/services").then(({ data }) => setServices(data.services || [])).catch(() => {});
    api.get("/appt-pro/products").then(({ data }) => setProducts(data.products || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const setSvcPrice = (sid, val) => setServices((rows) => rows.map((s) => s.id === sid ? { ...s, base_price: val, _dirty: true } : s));
  const setOptPrice = (sid, oid, val) => setServices((rows) => rows.map((s) => s.id === sid ? { ...s, _dirty: true, options: s.options.map((o) => o.id === oid ? { ...o, price: val } : o) } : s));
  const setProdPrice = (pid, val) => setProducts((rows) => rows.map((p) => p.id === pid ? { ...p, price: val, _dirty: true } : p));

  const saveAll = async () => {
    setSaving(true);
    try {
      const svcOps = services.filter((s) => s._dirty).map((s) => api.patch(`/appt-pro/services/${s.id}`, {
        name: s.name, active: s.active, sort: s.sort, base_price: Number(s.base_price) || 0, venue_enabled: s.venue_enabled,
        options: (s.options || []).map((o) => ({ id: o.id, label: o.label, price: Number(o.price) || 0 })),
      }));
      const prodOps = products.filter((p) => p._dirty).map((p) => api.patch(`/appt-pro/products/${p.id}`, {
        category: p.category, name: p.name, variant: p.variant, size: p.size, price: Number(p.price) || 0, active: p.active, sort: p.sort,
      }));
      await Promise.all([...svcOps, ...prodOps]);
      toast.success(`${svcOps.length + prodOps.length} kalem güncellendi`); load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const dirty = services.some((s) => s._dirty) || products.some((p) => p._dirty);
  const byCat = useMemo(() => { const m = {}; products.forEach((p) => (m[p.category] = m[p.category] || []).push(p)); return m; }, [products]);

  return (
    <div className="space-y-4" data-testid="bulk-price-tab">
      <div className="flex items-center justify-between sticky top-0 bg-slate-50 py-2 z-10">
        <p className="text-sm text-slate-500">Tüm hizmet ve ürün fiyatlarını tek ekrandan girin.</p>
        <Button onClick={saveAll} disabled={!dirty || saving} className="bg-slate-900 hover:bg-slate-800 gap-2" data-testid="bulk-save"><Save size={16} /> {saving ? "Kaydediliyor…" : "Tümünü Kaydet"}</Button>
      </div>
      <Card className="border-slate-200"><CardHeader className="pb-2"><CardTitle className="text-base">Hizmet & Alt Seçenek Fiyatları</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {services.map((s) => (
            <div key={s.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-2">
                <span className="font-medium flex-1">{s.name}</span>
                <span className="text-xs text-slate-500">Temel</span>
                <Input type="number" className="w-28 h-8" data-testid={`bulk-svc-${s.id}`} value={s.base_price} onChange={(e) => setSvcPrice(s.id, e.target.value)} />
              </div>
              {(s.options || []).length > 0 && (
                <div className="mt-2 ml-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {s.options.map((o) => (
                    <div key={o.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1">{o.label}</span>
                      <Input type="number" className="w-24 h-8" data-testid={`bulk-opt-${o.id}`} value={o.price} onChange={(e) => setOptPrice(s.id, o.id, e.target.value)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="border-slate-200"><CardHeader className="pb-2"><CardTitle className="text-base">Ürün Fiyatları</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(byCat).map(([cat, list]) => (
            <div key={cat}>
              <div className="text-xs font-semibold text-slate-500 mb-1.5">{CAT_LABELS[cat] || cat}</div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {list.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm">
                    <span className="flex-1">{p.name}{p.variant ? ` · ${p.variant}` : ""} <span className="text-slate-400">{p.size}</span></span>
                    <Input type="number" className="w-24 h-8" data-testid={`bulk-prod-${p.id}`} value={p.price} onChange={(e) => setProdPrice(p.id, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sözleşme Arşivi (filtreli) ─────────────────────────────────────────────
function ContractsTab() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  useEffect(() => { api.get("/appt-pro/contracts").then(({ data }) => setRows(data.contracts || [])).catch((e) => toast.error(formatApiError(e))); }, []);

  const filtered = useMemo(() => rows.filter((c) => {
    if (status !== "all" && (c.approval_status || "pending") !== status) return false;
    const name = `${c.bride_name || ""} ${c.groom_name || ""} ${c.party_name || ""}`.toLowerCase();
    if (q && !name.includes(q.toLowerCase())) return false;
    const d = (c.event_date || c.created_at || "").slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }), [rows, q, status, from, to]);

  const exportCsv = () => {
    const cols = ["Çift", "Sözleşme Sahibi", "Rol", "TC", "Telefon", "E-posta", "Etkinlik Tarihi", "Mekan",
      "Ara Toplam", "İndirim %", "İndirim Tutar", "Net Tutar", "Cayma Bedeli", "Kalan", "Ödeme", "Durum", "Onaylayan", "Oluşturma"];
    const roleL = { gelin: "Gelin", damat: "Damat", diger: "Diğer" };
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [cols.join(";")];
    filtered.forEach((c) => {
      const couple = `${c.bride_name || ""}${c.bride_name && c.groom_name ? " & " : ""}${c.groom_name || ""}`.trim() || c.customer_name || "";
      lines.push([couple, c.party_name || "", roleL[c.party_role] || "", c.party_tc || "", c.party_phone || "", c.party_email || "",
        c.event_date || "", c.venue || "", c.subtotal || 0, c.discount_percent || 0, c.discount_amount || 0,
        c.total || 0, c.deposit_amount || 0, c.remaining_amount || 0,
        c.payment_method === "card" ? "Kart" : "Nakit",
        c.approval_status === "approved" ? "Onaylandı" : "Onay Bekliyor",
        c.approver_name || "", (c.created_at || "").slice(0, 10)].map(esc).join(";"));
    });
    const csv = "\uFEFF" + lines.join("\r\n"); // BOM → Excel Türkçe uyumu
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `sozlesme-arsivi-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast.success(`${filtered.length} sözleşme dışa aktarıldı`);
  };

  return (
    <Card className="border-slate-200" data-testid="contracts-list">
      <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base">Sözleşme Arşivi ({filtered.length}/{rows.length})</CardTitle>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={filtered.length === 0} className="gap-1.5" data-testid="arch-export"><Download size={15} /> Excel/CSV İndir</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid sm:grid-cols-4 gap-2">
          <div className="relative"><Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" /><Input className="pl-8" placeholder="Çift / kişi ara" data-testid="arch-search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select value={status} onValueChange={setStatus}><SelectTrigger data-testid="arch-status"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tümü</SelectItem><SelectItem value="approved">Onaylı</SelectItem><SelectItem value="pending">Onay Bekliyor</SelectItem></SelectContent></Select>
          <Input type="date" data-testid="arch-from" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" data-testid="arch-to" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {filtered.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">Kayıt yok.</p>}
        {filtered.map((c) => (
          <div key={c.id} data-testid={`contract-item-${c.id}`} className="rounded-xl border border-slate-200 p-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="font-medium">{`${c.bride_name || ""}${c.bride_name && c.groom_name ? " & " : ""}${c.groom_name || ""}`.trim() || c.party_name || "—"}</div>
              <div className="text-xs text-slate-500">{c.event_date || "—"} · {tl(c.total)} · {(c.created_at || "").slice(0, 10)}</div>
            </div>
            {c.approval_status === "approved"
              ? <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">Onaylandı</span>
              : <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">Onay Bekliyor</span>}
            <Link to={`/admin/sozlesme/${c.id}`}><Button size="sm" variant="outline" data-testid={`contract-open-${c.id}`}>Aç</Button></Link>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}


