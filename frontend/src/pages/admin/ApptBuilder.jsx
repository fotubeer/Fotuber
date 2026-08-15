import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, FileText, Users, CalendarDays, Package, Camera, Percent, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const tl = (n) => `${Number(n || 0).toLocaleString("tr-TR")} ₺`;
const CAT_LABELS = { album: "Albüm", canvas: "Kanvas Tablo", fine: "Fine Tablo", poster: "Poster", print: "Baskı", magazine: "Dergi" };

export default function ApptBuilder() {
  const navigate = useNavigate();
  const { contractId } = useParams();
  const editing = !!contractId;
  const [ready, setReady] = useState(false);
  const [services, setServices] = useState([]);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);

  // Çift
  const [bride, setBride] = useState({ name: "", phone: "" });
  const [groom, setGroom] = useState({ name: "", phone: "" });
  // Etkinlik
  const [ev, setEv] = useState({ date: "", time: "", venue: "" });
  const [adminNotes, setAdminNotes] = useState("");
  // Seçimler: svc[serviceId] = {selected, options:Set}
  const [svcSel, setSvcSel] = useState({});
  const [prodQty, setProdQty] = useState({}); // productId -> qty
  const [discount, setDiscount] = useState(0);
  const [deposit, setDeposit] = useState(0);
  const [paid, setPaid] = useState(0);
  const [manualTotal, setManualTotal] = useState("");   // boşsa otomatik toplam kullanılır
  const [paymentMethod, setPaymentMethod] = useState("cash"); // cash | card
  // Sözleşme tarafı
  const [party, setParty] = useState({ role: "gelin", name: "", tc: "", email: "", address: "", phone: "" });
  const [consentSocial, setConsentSocial] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("/appt-pro/services?active_only=true").then(({ data }) => setServices(data.services || [])),
      api.get("/appt-pro/products?active_only=true").then(({ data }) => setProducts(data.products || [])),
    ]).catch((e) => toast.error(formatApiError(e))).finally(() => setReady(true));
  }, []);

  // Düzenleme modu: var olan sözleşmeyi yükle ve seçimleri yeniden kur
  useEffect(() => {
    if (!ready || !contractId) return;
    api.get(`/appt-pro/contracts/${contractId}`).then(({ data }) => {
      const c = data.contract || {};
      setBride({ name: c.bride_name || "", phone: c.bride_phone || "" });
      setGroom({ name: c.groom_name || "", phone: c.groom_phone || "" });
      setEv({ date: c.event_date || "", time: c.event_time || "", venue: c.venue || "" });
      setParty({ role: c.party_role || "gelin", name: c.party_name || "", tc: c.party_tc || "",
        email: c.party_email || "", address: c.party_address || "", phone: c.party_phone || "" });
      setDiscount(c.discount_percent || 0);
      setDeposit(c.deposit_amount || 0);
      setPaid(c.deposit_amount || 0);
      setManualTotal(c.total != null ? String(c.total) : "");
      setPaymentMethod(c.payment_method || "cash");
      setConsentSocial(!!c.consent_social);
      setConsentMarketing(!!c.consent_marketing);
      const nextSvc = {}, nextProd = {};
      (c.line_items || []).forEach((it) => {
        if (it.type === "service") {
          const parts = (it.label || "").split(" · ");
          const svc = services.find((s) => s.name === parts[0]);
          if (svc) {
            const optLabels = parts.slice(1).join(" · ").split(", ").filter(Boolean);
            const optIds = (svc.options || []).filter((o) => optLabels.includes(o.label)).map((o) => o.id);
            nextSvc[svc.id] = { selected: true, options: optIds };
          }
        } else if (it.type === "product") {
          const m = (it.label || "").match(/×(\d+)\s*$/);
          const qty = m ? Number(m[1]) : 1;
          const prod = products.find((p) => (it.label || "").startsWith(`${CAT_LABELS[p.category] || p.category} · ${p.name}`));
          if (prod) nextProd[prod.id] = qty;
        }
      });
      setSvcSel(nextSvc);
      setProdQty(nextProd);
    }).catch((e) => toast.error(formatApiError(e)));
  }, [ready, contractId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Taraf otomatik doldurma
  useEffect(() => {
    if (party.role === "gelin") setParty((p) => ({ ...p, name: bride.name, phone: bride.phone }));
    else if (party.role === "damat") setParty((p) => ({ ...p, name: groom.name, phone: groom.phone }));
  }, [party.role, bride.name, bride.phone, groom.name, groom.phone]);

  const toggleSvc = (s) => setSvcSel((prev) => {
    const cur = prev[s.id] || { selected: false, options: [] };
    return { ...prev, [s.id]: { ...cur, selected: !cur.selected } };
  });
  const toggleOpt = (sid, oid) => setSvcSel((prev) => {
    const cur = prev[sid] || { selected: true, options: [] };
    const set = new Set(cur.options);
    if (set.has(oid)) set.delete(oid); else set.add(oid);
    return { ...prev, [sid]: { selected: true, options: Array.from(set) } };
  });

  // Fiyat & satır kalemleri
  const lineItems = useMemo(() => {
    const items = [];
    services.forEach((s) => {
      const sel = svcSel[s.id];
      if (!sel?.selected) return;
      const chosen = (s.options || []).filter((o) => (sel.options || []).includes(o.id));
      const price = Number(s.base_price || 0) + chosen.reduce((a, o) => a + Number(o.price || 0), 0);
      const optLabels = chosen.map((o) => o.label).join(", ");
      items.push({ type: "service", label: `${s.name}${optLabels ? " · " + optLabels : ""}`, price });
    });
    products.forEach((p) => {
      const q = Number(prodQty[p.id] || 0);
      if (q <= 0) return;
      const label = `${CAT_LABELS[p.category] || p.category} · ${p.name}${p.variant ? " · " + p.variant : ""}${p.size ? " · " + p.size : ""}${q > 1 ? ` ×${q}` : ""}`;
      items.push({ type: "product", label, price: Number(p.price || 0) * q });
    });
    return items;
  }, [services, products, svcSel, prodQty]);

  const subtotal = useMemo(() => lineItems.reduce((a, it) => a + Number(it.price || 0), 0), [lineItems]);
  const discountAmount = useMemo(() => Math.round((subtotal * (Number(discount) || 0)) / 100 * 100) / 100, [subtotal, discount]);
  const autoTotal = useMemo(() => Math.max(0, subtotal - discountAmount), [subtotal, discountAmount]);
  const total = useMemo(() => (manualTotal !== "" && !isNaN(Number(manualTotal)) ? Number(manualTotal) : autoTotal), [manualTotal, autoTotal]);
  const remaining = useMemo(() => Math.max(0, total - (Number(deposit) || 0)), [total, deposit]);

  // Marka: seçili hizmetlerden herhangi biri "mekan/davet" ise Davet Evi, yoksa sadece çekim → Photography
  const brandVariant = useMemo(() => {
    const anyVenue = services.some((s) => svcSel[s.id]?.selected && s.venue_enabled);
    return anyVenue ? "venue" : "photo";
  }, [services, svcSel]);

  const productsByCat = useMemo(() => {
    const m = {};
    products.forEach((p) => { (m[p.category] = m[p.category] || []).push(p); });
    return m;
  }, [products]);

  const save = async () => {
    if (!bride.name && !groom.name) { toast.error("En az bir çift ismi girin"); return; }
    if (lineItems.length === 0) { toast.error("En az bir hizmet veya ürün seçin"); return; }
    if (!ev.date) { toast.error("Etkinlik tarihi girin"); return; }
    setSaving(true);
    try {
      const contract = {
        party_role: party.role, party_name: party.name, party_tc: party.tc,
        party_email: party.email, party_address: party.address, party_phone: party.phone,
        bride_name: bride.name, groom_name: groom.name, bride_phone: bride.phone, groom_phone: groom.phone,
        event_date: ev.date, event_time: ev.time, venue: ev.venue,
        line_items: lineItems, subtotal, discount_percent: Number(discount) || 0,
        discount_amount: discountAmount, total, deposit_amount: Number(deposit) || 0,
        remaining_amount: remaining, consent_social: consentSocial, consent_marketing: consentMarketing,
        brand_variant: brandVariant, payment_method: paymentMethod,
      };
      if (editing) {
        await api.put(`/appt-pro/contracts/${contractId}`, contract);
        toast.success("Sözleşme güncellendi");
        navigate(`/admin/sozlesme/${contractId}`);
        return;
      }
      const payload = {
        customer_name: `${bride.name}${bride.name && groom.name ? " & " : ""}${groom.name}`.trim(),
        customer_phone: bride.phone || groom.phone || "",
        service_name_snapshot: lineItems.filter((i) => i.type === "service").map((i) => i.label.split(" · ")[0]).join(", ") || "Fiziki Randevu",
        date: ev.date, time: ev.time, venue: ev.venue, admin_notes: adminNotes,
        line_items: lineItems, subtotal, discount_percent: Number(discount) || 0,
        discount_amount: discountAmount, total, deposit_amount: Number(deposit) || 0,
        paid_amount: Number(paid) || Number(deposit) || 0, payment_method: paymentMethod, contract,
      };
      const { data } = await api.post("/appt-pro/appointments", payload);
      toast.success("Randevu ve sözleşme oluşturuldu");
      navigate(`/admin/sozlesme/${data.contract_id}`);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-6">
      <div className="max-w-5xl mx-auto px-4 space-y-5">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate("/admin/randevular")} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900" data-testid="builder-back">
            <ArrowLeft size={16} /> Randevular
          </button>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><FileText className="text-slate-700" /> {editing ? "Sözleşmeyi Düzenle" : "Fiziki Randevu & Sözleşme"}</h1>
          <div className="w-24" />
        </div>

        {/* Çift */}
        <Card className="border-slate-200"><CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Users size={17} /> Çift Bilgileri</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <div><Label>Gelin Adı Soyadı</Label><Input data-testid="bride-name" value={bride.name} onChange={(e) => setBride({ ...bride, name: e.target.value })} /></div>
            <div><Label>Gelin Telefon</Label><Input data-testid="bride-phone" value={bride.phone} onChange={(e) => setBride({ ...bride, phone: e.target.value })} placeholder="05xx…" /></div>
            <div><Label>Damat Adı Soyadı</Label><Input data-testid="groom-name" value={groom.name} onChange={(e) => setGroom({ ...groom, name: e.target.value })} /></div>
            <div><Label>Damat Telefon</Label><Input data-testid="groom-phone" value={groom.phone} onChange={(e) => setGroom({ ...groom, phone: e.target.value })} placeholder="05xx…" /></div>
          </CardContent>
        </Card>

        {/* Etkinlik */}
        <Card className="border-slate-200"><CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CalendarDays size={17} /> Etkinlik</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-3 gap-4">
            <div><Label>Tarih *</Label><Input data-testid="ev-date" type="date" value={ev.date} onChange={(e) => setEv({ ...ev, date: e.target.value })} /></div>
            <div><Label>Saat</Label><Input data-testid="ev-time" type="time" value={ev.time} onChange={(e) => setEv({ ...ev, time: e.target.value })} /></div>
            <div><Label>Mekan</Label><Input data-testid="ev-venue" value={ev.venue} onChange={(e) => setEv({ ...ev, venue: e.target.value })} placeholder="Salon / adres" /></div>
          </CardContent>
        </Card>

        {/* Hizmetler */}
        <Card className="border-slate-200"><CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Camera size={17} /> Hizmet & Etkinlik Türü</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {services.length === 0 && <p className="text-sm text-slate-400">Katalogda aktif hizmet yok. Admin panelinden ekleyin.</p>}
            {services.map((s) => {
              const sel = svcSel[s.id];
              return (
                <div key={s.id} data-testid={`svc-${s.id}`} className={`rounded-xl border p-3 ${sel?.selected ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={!!sel?.selected} onCheckedChange={() => toggleSvc(s)} data-testid={`svc-check-${s.id}`} />
                    <span className="font-medium">{s.name}</span>
                    {Number(s.base_price) > 0 && <span className="text-xs text-slate-500">temel {tl(s.base_price)}</span>}
                    {s.venue_enabled && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">mekan</span>}
                  </label>
                  {sel?.selected && (s.options || []).length > 0 && (
                    <div className="mt-2 ml-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {s.options.map((o) => (
                        <label key={o.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                          <Checkbox checked={(sel.options || []).includes(o.id)} onCheckedChange={() => toggleOpt(s.id, o.id)} data-testid={`opt-${o.id}`} />
                          {o.label}{Number(o.price) > 0 && <span className="text-xs text-slate-400">+{tl(o.price)}</span>}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Ürünler */}
        <Card className="border-slate-200"><CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Package size={17} /> Ürünler</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(productsByCat).map(([cat, list]) => (
              <div key={cat}>
                <div className="text-xs font-semibold text-slate-500 mb-1.5">{CAT_LABELS[cat] || cat}</div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {list.map((p) => (
                    <div key={p.id} data-testid={`prod-${p.id}`} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
                      <div className="flex-1 text-sm">
                        <div className="font-medium">{p.name}{p.variant ? ` · ${p.variant}` : ""}</div>
                        <div className="text-xs text-slate-500">{p.size} {Number(p.price) > 0 ? `· ${tl(p.price)}` : ""}</div>
                      </div>
                      <Input type="number" min="0" className="w-16 h-8" data-testid={`prod-qty-${p.id}`}
                        value={prodQty[p.id] || ""} placeholder="0"
                        onChange={(e) => setProdQty({ ...prodQty, [p.id]: e.target.value })} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Sözleşme tarafı */}
        <Card className="border-slate-200"><CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ShieldCheck size={17} /> Sözleşme Sahibi</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {[["gelin", "Gelin Adına"], ["damat", "Damat Adına"], ["diger", "Farklı Kişi"]].map(([k, l]) => (
                <button key={k} data-testid={`party-${k}`} onClick={() => setParty({ ...party, role: k, ...(k === "diger" ? { name: "", phone: "" } : {}) })}
                  className={`px-4 py-2 rounded-full text-sm font-medium border ${party.role === k ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 text-slate-600"}`}>{l}</button>
              ))}
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Ad Soyad</Label><Input data-testid="party-name" value={party.name} onChange={(e) => setParty({ ...party, name: e.target.value })} disabled={party.role !== "diger"} /></div>
              <div><Label>Telefon</Label><Input data-testid="party-phone" value={party.phone} onChange={(e) => setParty({ ...party, phone: e.target.value })} disabled={party.role !== "diger"} /></div>
              <div><Label>T.C. Kimlik No</Label><Input data-testid="party-tc" value={party.tc} onChange={(e) => setParty({ ...party, tc: e.target.value.replace(/\D/g, "").slice(0, 11) })} /></div>
              <div><Label>E-posta</Label><Input data-testid="party-email" value={party.email} onChange={(e) => setParty({ ...party, email: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Adres</Label><Textarea rows={2} data-testid="party-address" value={party.address} onChange={(e) => setParty({ ...party, address: e.target.value })} /></div>
            </div>
            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-500">Görsel Kullanım İzni (KVKK)</div>
              <label className="flex items-center justify-between text-sm"><span>Sosyal medyada paylaşım izni</span><Switch data-testid="consent-social" checked={consentSocial} onCheckedChange={setConsentSocial} /></label>
              <label className="flex items-center justify-between text-sm"><span>Ürün / kampanyalarda kullanım izni</span><Switch data-testid="consent-marketing" checked={consentMarketing} onCheckedChange={setConsentMarketing} /></label>
            </div>
          </CardContent>
        </Card>

        {/* Fiyat özeti */}
        <Card className="border-slate-200"><CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Percent size={17} /> Fiyat Özeti</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1 text-sm">
              {lineItems.map((it, i) => (
                <div key={i} className="flex justify-between"><span className="text-slate-600">{it.label}</span><span>{tl(it.price)}</span></div>
              ))}
              {lineItems.length === 0 && <div className="text-slate-400 text-sm">Henüz seçim yok</div>}
            </div>
            <div className="border-t border-slate-200 pt-2 flex justify-between text-sm"><span>Ara Toplam</span><span data-testid="sum-subtotal" className="font-semibold">{tl(subtotal)}</span></div>
            <div className="grid sm:grid-cols-3 gap-3 items-end">
              <div><Label>İndirim (%)</Label><Input data-testid="sum-discount" type="number" min="0" max="100" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
              <div><Label>Toplam Tutar (elle · opsiyonel)</Label><Input data-testid="sum-total-manual" type="number" min="0" placeholder={String(autoTotal)} value={manualTotal} onChange={(e) => setManualTotal(e.target.value)} /></div>
              <div><Label>Ödeme Şekli</Label>
                <div className="flex gap-2">
                  {[["cash", "Nakit"], ["card", "Kart"]].map(([k, l]) => (
                    <button key={k} type="button" data-testid={`pay-${k}`} onClick={() => setPaymentMethod(k)}
                      className={`flex-1 h-10 rounded-lg text-sm font-medium border ${paymentMethod === k ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 text-slate-600"}`}>{l}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 items-end">
              <div><Label>Cayma Bedeli / Peşinat (₺)</Label><Input data-testid="sum-deposit" type="number" min="0" value={deposit} onChange={(e) => setDeposit(e.target.value)} /></div>
              <div><Label>Alınan Ödeme (₺)</Label><Input data-testid="sum-paid" type="number" min="0" value={paid} onChange={(e) => setPaid(e.target.value)} /></div>
            </div>
            {Number(discount) > 0 && <div className="flex justify-between text-sm text-rose-600"><span>İndirim</span><span data-testid="sum-discount-amt">- {tl(discountAmount)}</span></div>}
            <div className="flex justify-between text-lg font-bold"><span>Net Tutar</span><span data-testid="sum-total">{tl(total)}</span></div>
            <div className="flex justify-between text-sm"><span>Kalan Ödeme</span><span data-testid="sum-remaining" className="font-semibold">{tl(remaining)}</span></div>
            <div><Label>Yönetici Notu</Label><Textarea rows={2} value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} /></div>
          </CardContent>
        </Card>

        <div className="flex justify-end pb-10">
          <Button data-testid="builder-save" onClick={save} disabled={saving} className="bg-slate-900 hover:bg-slate-800 h-12 px-8 text-base">
            {saving ? "Kaydediliyor…" : (editing ? "Sözleşmeyi Güncelle" : "Sözleşmeyi Oluştur & Önizle")}
          </Button>
        </div>
      </div>
    </div>
  );
}
