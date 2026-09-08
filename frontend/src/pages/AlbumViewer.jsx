import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, formatApiError, API_BASE } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Check, Heart, ShoppingBag, Send, Lock, Camera, LogIn } from "lucide-react";
import { toast } from "sonner";
import { SEO } from "@/components/SEO";

const PRODUCT_LABELS = { album: "Albüm", print: "Baskı", canvas: "Tablo" };

const AlbumViewer = () => {
  const { token } = useParams();
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [selections, setSelections] = useState({}); // { photoId: { photo_code, product_type, product_variant, quantity, notes } }
  const [customerNote, setCustomerNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // Force login before showing album
      nav("/giris", { state: { from: `/albumler/${token}` } });
      return;
    }
    (async () => {
      try {
        const { data } = await api.get(`/photo-albums/${token}`);
        setData(data);
        // Prefill selections with existing user selections
        const existing = {};
        (data.selections || []).forEach((s) => {
          existing[s.photo_id] = {
            photo_code: s.photo_code,
            product_type: s.product_type,
            product_variant: s.product_variant,
            quantity: s.quantity,
            notes: s.notes,
          };
        });
        setSelections(existing);
        setCustomerNote(data.selections?.[0]?.customer_note || "");
      } catch (e) { setError(formatApiError(e)); }
    })();
  }, [token, user, authLoading]);

  const selectedList = useMemo(() => Object.entries(selections), [selections]);

  const toggleSelect = (p) => {
    setSelections((s) => {
      const next = { ...s };
      if (next[p.id]) delete next[p.id];
      else next[p.id] = { photo_code: p.code, product_type: "album", product_variant: "", quantity: 1, notes: "" };
      return next;
    });
  };

  const updateSel = (pid, key, value) => {
    setSelections((s) => ({ ...s, [pid]: { ...s[pid], [key]: value } }));
  };

  const submit = async () => {
    if (selectedList.length === 0) { toast.error("En az bir fotoğraf seçin"); return; }
    setSaving(true);
    try {
      const payload = {
        customer_note: customerNote,
        selections: selectedList.map(([pid, sel]) => ({
          photo_id: pid,
          photo_code: sel.photo_code,
          product_type: sel.product_type,
          product_variant: sel.product_variant || "",
          quantity: Number(sel.quantity) || 1,
          notes: sel.notes || "",
        })),
      };
      await api.post(`/photo-albums/${token}/selections`, payload);
      toast.success("Seçimleriniz iletildi. Ekibimiz sizinle iletişime geçecek. 🎉");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-400">Yükleniyor…</div>;

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-200 flex items-center justify-center px-6">
        <SEO title="Albüm" description="Fotoğraf seçim albümü" noIndex path={`/albumler/${token}`} />
        <div className="max-w-md text-center">
          <Lock className="w-10 h-10 mx-auto mb-4 text-[#d4af37]" />
          <h1 className="hero-title text-3xl mb-2">Bağlantı geçersiz</h1>
          <p className="text-sm text-neutral-400">{error}</p>
          <Link to="/" className="mt-6 inline-block text-[#d4af37] underline">Anasayfa</Link>
        </div>
      </div>
    );
  }

  if (!data) return <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-500">Albüm yükleniyor…</div>;

  const { album, photos, print_sizes, canvas_options, album_options } = data;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <SEO title={album.couple_names} description="Fotoğraf seçim albümü" noIndex path={`/albumler/${token}`} />

      <header className="border-b border-neutral-900 sticky top-0 z-30 bg-neutral-950/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-[#d4af37]" />
            <span className="font-serif text-lg">Fotuber</span>
          </Link>
          <div className="text-right">
            <div className="text-xs text-[#d4af37] uppercase tracking-[0.2em]">Özel Seçim Albümü</div>
            <div className="text-sm font-medium">{album.couple_names}</div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="hero-title text-4xl md:text-5xl mb-2">
            <em>Kareleri</em> seçin.
          </h1>
          <p className="text-neutral-400 max-w-2xl">
            Beğendiğiniz fotoğrafın üzerine dokunarak sepete ekleyin. Sonra sağ alttaki sepetten her fotoğraf için <b>Albüm</b>, <b>Baskı</b> veya <b>Tablo</b> ürününü seçip gönderin. Ekibimiz sizi arayarak detayları netleştirecek.
          </p>
          {album.notes && <p className="mt-3 text-sm text-neutral-300 italic border-l-2 border-[#d4af37] pl-3">"{album.notes}"</p>}
          {album.max_selections && (
            <p className="text-xs text-[#d4af37] mt-3">En fazla {album.max_selections} fotoğraf seçebilirsiniz. Şu an: {selectedList.length}</p>
          )}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 pb-40" data-testid="album-photo-grid">
          {photos.map((p) => {
            const selected = !!selections[p.id];
            return (
              <div key={p.id} className="relative group aspect-[3/4] rounded-lg overflow-hidden bg-neutral-900" data-testid={`photo-${p.id}`}>
                <img
                  src={`${API_BASE}/photo-albums/${token}/file/${p.id}`}
                  alt={p.code}
                  loading="lazy"
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => setPreview(p)}
                />
                <button
                  onClick={() => toggleSelect(p)}
                  data-testid={`photo-select-${p.code}`}
                  className={`absolute top-2 right-2 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${selected ? "bg-[#d4af37] border-[#d4af37] text-black" : "bg-black/50 border-white/60 text-white hover:bg-black/80"}`}
                >
                  {selected ? <Check className="w-4 h-4" /> : <Heart className="w-4 h-4" />}
                </button>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1">
                  <div className="text-[10px] font-mono text-white/80 truncate">{p.code}</div>
                </div>
                {selected && <div className="absolute inset-0 ring-4 ring-[#d4af37] pointer-events-none" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-40 bg-black/95 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <img
            src={`${API_BASE}/photo-albums/${token}/file/${preview.id}`}
            alt={preview.code}
            className="max-w-full max-h-[90vh] object-contain"
          />
          <div className="absolute top-6 left-6 bg-black/60 rounded-full px-4 py-2 text-sm font-mono">{preview.code}</div>
          <button
            onClick={(e) => { e.stopPropagation(); toggleSelect(preview); }}
            data-testid={`preview-select-${preview.code}`}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full bg-[#d4af37] hover:bg-[#b5952f] text-black px-8 py-3 font-medium flex items-center gap-2"
          >
            {selections[preview.id] ? <><Check className="w-4 h-4" /> Sepette</> : <><Heart className="w-4 h-4" /> Sepete Ekle</>}
          </button>
        </div>
      )}

      {/* Sticky basket / summary */}
      <StickyBasket
        token={token}
        selections={selections}
        setSelections={setSelections}
        photos={photos}
        printSizes={print_sizes}
        canvasOpts={canvas_options}
        albumOpts={album_options}
        customerNote={customerNote}
        setCustomerNote={setCustomerNote}
        onSubmit={submit}
        saving={saving}
      />
    </div>
  );
};

const StickyBasket = ({ token, selections, setSelections, photos, printSizes, canvasOpts, albumOpts, customerNote, setCustomerNote, onSubmit, saving }) => {
  const [open, setOpen] = useState(false);
  const list = Object.entries(selections);
  const photosById = useMemo(() => Object.fromEntries((photos || []).map((p) => [p.id, p])), [photos]);
  const updateSel = (pid, key, value) => setSelections((s) => ({ ...s, [pid]: { ...s[pid], [key]: value } }));
  const remove = (pid) => setSelections((s) => { const n = { ...s }; delete n[pid]; return n; });

  return (
    <>
      <div className="fixed bottom-0 inset-x-0 z-30 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4">
          <ShoppingBag className="w-5 h-5 text-[#d4af37]" />
          <div className="flex-1">
            <div className="text-sm"><b>{list.length}</b> fotoğraf seçildi</div>
            <div className="text-xs text-neutral-500">Ürün seçimini yapıp gönder</div>
          </div>
          <Button
            onClick={() => setOpen(true)}
            disabled={list.length === 0}
            className="rounded-full bg-[#d4af37] hover:bg-[#b5952f] text-black disabled:opacity-40"
            data-testid="open-basket-btn"
          >
            Sepeti Aç ({list.length})
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="basket-dialog">
          <DialogHeader>
            <DialogTitle>Seçtiğiniz Kareler ({list.length})</DialogTitle>
            <DialogDescription>Her fotoğraf için ürün türünü ve boyutunu belirleyin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {list.map(([pid, sel]) => (
              <div key={pid} className="flex gap-3 items-start border rounded-lg p-3" data-testid={`basket-item-${sel.photo_code}`}>
                <img
                  src={`${API_BASE}/photo-albums/${token}/file/${pid}`}
                  className="w-16 h-16 object-cover rounded"
                  alt={sel.photo_code}
                />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-sm">{sel.photo_code}</span>
                    <Button size="sm" variant="ghost" onClick={() => remove(pid)} className="text-red-600 hover:text-red-700 h-7 text-xs">Kaldır</Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Select value={sel.product_type} onValueChange={(v) => updateSel(pid, "product_type", v)}>
                      <SelectTrigger className="h-9 text-xs" data-testid={`basket-type-${sel.photo_code}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="album">Albüm</SelectItem>
                        <SelectItem value="print">Baskı</SelectItem>
                        <SelectItem value="canvas">Tablo</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={sel.product_variant || ""} onValueChange={(v) => updateSel(pid, "product_variant", v)}>
                      <SelectTrigger className="h-9 text-xs" data-testid={`basket-variant-${sel.photo_code}`}><SelectValue placeholder="Boyut/Model" /></SelectTrigger>
                      <SelectContent>
                        {sel.product_type === "print" && (printSizes || []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        {sel.product_type === "canvas" && (canvasOpts || []).map((c) => (
                          <SelectItem key={c.id} value={`${c.name}${c.size ? " · " + c.size : ""}`}>{c.name}{c.size ? ` · ${c.size}` : ""}</SelectItem>
                        ))}
                        {sel.product_type === "album" && (albumOpts && albumOpts.length ? albumOpts : [{ id: "default", name: "Standart", size: "" }]).map((c) => (
                          <SelectItem key={c.id} value={c.name}>{c.name}{c.size ? ` · ${c.size}` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input type="number" min="1" value={sel.quantity} onChange={(e) => updateSel(pid, "quantity", e.target.value)} className="h-9 text-xs" placeholder="Adet" />
                  </div>
                  <Input value={sel.notes} onChange={(e) => updateSel(pid, "notes", e.target.value)} placeholder="Not (opsiyonel)" className="h-9 text-xs" />
                </div>
              </div>
            ))}
            <div className="pt-2">
              <Label className="text-sm font-semibold">Genel notunuz</Label>
              <Textarea rows={3} value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} placeholder="Örn: Albüm rengi krem olsun, tablolar mat kaplama..." data-testid="basket-general-note" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Kapat</Button>
            <Button onClick={() => { onSubmit(); setOpen(false); }} disabled={saving} className="bg-[#d4af37] hover:bg-[#b5952f] text-black" data-testid="basket-submit-btn">
              <Send className="w-4 h-4 mr-2" /> {saving ? "Gönderiliyor..." : "Ekibe Gönder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AlbumViewer;
