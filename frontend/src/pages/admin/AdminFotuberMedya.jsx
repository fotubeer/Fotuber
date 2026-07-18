import React, { useEffect, useRef, useState } from "react";
import { api, formatApiError, API_BASE } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Building2, Film } from "lucide-react";
import { toast } from "sonner";

const emptyP = { title: "", description: "", client_name: "", category: "sosyal-medya", external_url: "", file: null };
const emptyC = { name: "", industry: "", website: "", testimonial: "", logo: null };

const AdminFotuberMedya = () => {
  const [tab, setTab] = useState("portfolio");
  const [cats, setCats] = useState([]);
  const [items, setItems] = useState([]);
  const [clients, setClients] = useState([]);
  const [pForm, setPForm] = useState(emptyP);
  const [cForm, setCForm] = useState(emptyC);
  const [pBusy, setPBusy] = useState(false);
  const [cBusy, setCBusy] = useState(false);
  const pFileRef = useRef();
  const cFileRef = useRef();

  const load = async () => {
    const [c, p, cl] = await Promise.all([
      api.get("/portfolio/categories"),
      api.get("/portfolio"),
      api.get("/clients"),
    ]);
    setCats(c.data); setItems(p.data); setClients(cl.data);
  };
  useEffect(() => { load(); }, []);

  const submitPortfolio = async () => {
    if (!pForm.title.trim()) { toast.error("Başlık zorunlu"); return; }
    setPBusy(true);
    try {
      const fd = new FormData();
      fd.append("title", pForm.title);
      fd.append("description", pForm.description);
      fd.append("client_name", pForm.client_name);
      fd.append("category", pForm.category);
      fd.append("external_url", pForm.external_url);
      if (pForm.file) fd.append("file", pForm.file);
      await api.post("/portfolio", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Portfolyo eklendi");
      setPForm(emptyP);
      if (pFileRef.current) pFileRef.current.value = "";
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setPBusy(false); }
  };

  const submitClient = async () => {
    if (!cForm.name.trim()) { toast.error("Firma adı zorunlu"); return; }
    setCBusy(true);
    try {
      const fd = new FormData();
      fd.append("name", cForm.name);
      fd.append("industry", cForm.industry);
      fd.append("website", cForm.website);
      fd.append("testimonial", cForm.testimonial);
      if (cForm.logo) fd.append("logo", cForm.logo);
      await api.post("/clients", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Firma eklendi");
      setCForm(emptyC);
      if (cFileRef.current) cFileRef.current.value = "";
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setCBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2" data-testid="admin-medya-title">
          <Film className="w-6 h-6 text-[#d4af37]" /> Fotuber Medya
        </h1>
        <p className="text-sm text-slate-500 mt-1">B2B portfolyonuzu ve çalıştığınız firmaları yönetin.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="portfolio" data-testid="tab-portfolio">Portfolyo ({items.length})</TabsTrigger>
          <TabsTrigger value="clients" data-testid="tab-clients">Firmalar ({clients.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="portfolio" className="mt-4 space-y-4">
          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-2"><Plus className="w-4 h-4" /> Yeni Portfolyo İçeriği</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Başlık *</Label>
                <Input data-testid="portfolio-title" value={pForm.title} onChange={(e) => setPForm({ ...pForm, title: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Kategori</Label>
                <Select value={pForm.category} onValueChange={(v) => setPForm({ ...pForm, category: v })}>
                  <SelectTrigger data-testid="portfolio-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {cats.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Müşteri / Firma</Label>
                <Input data-testid="portfolio-client" value={pForm.client_name} onChange={(e) => setPForm({ ...pForm, client_name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Dış Link (YouTube, Vimeo vb.)</Label>
                <Input data-testid="portfolio-url" value={pForm.external_url} onChange={(e) => setPForm({ ...pForm, external_url: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Açıklama</Label>
                <Textarea data-testid="portfolio-desc" rows={2} value={pForm.description} onChange={(e) => setPForm({ ...pForm, description: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Görsel veya Video</Label>
                <Input type="file" ref={pFileRef} data-testid="portfolio-file" accept="image/*,video/*"
                  onChange={(e) => setPForm({ ...pForm, file: e.target.files?.[0] || null })} />
              </div>
              <div className="md:col-span-2">
                <Button data-testid="portfolio-submit" onClick={submitPortfolio} disabled={pBusy} className="bg-slate-900 hover:bg-slate-800">
                  {pBusy ? "Yükleniyor..." : "Ekle"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((p) => (
              <div key={p.id} data-testid={`admin-portfolio-${p.id}`} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="aspect-video bg-slate-100">
                  {p.media_id ? (
                    p.media_type === "video"
                      ? <video src={`${API_BASE}/portfolio/media/${p.media_id}`} className="w-full h-full object-cover" muted />
                      : <img src={`${API_BASE}/portfolio/media/${p.media_id}`} alt={p.title} className="w-full h-full object-cover" />
                  ) : <div className="w-full h-full flex items-center justify-center text-slate-400"><Film /></div>}
                </div>
                <div className="p-3">
                  <Badge variant="outline" className="text-[10px] mb-2">{(cats.find(c => c.slug === p.category) || {}).name || p.category}</Badge>
                  <div className="text-sm font-medium truncate">{p.title}</div>
                  {p.client_name && <div className="text-xs text-slate-500 truncate">{p.client_name}</div>}
                  <Button size="sm" variant="destructive" className="mt-2 h-7"
                    onClick={async () => { if (window.confirm("Silinsin mi?")) { await api.delete(`/portfolio/${p.id}`); load(); toast.success("Silindi"); } }}
                    data-testid={`portfolio-delete-${p.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="clients" className="mt-4 space-y-4">
          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-2"><Plus className="w-4 h-4" /> Yeni Firma</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Firma Adı *</Label>
                <Input data-testid="client-name" value={cForm.name} onChange={(e) => setCForm({ ...cForm, name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Sektör</Label>
                <Input data-testid="client-industry" value={cForm.industry} onChange={(e) => setCForm({ ...cForm, industry: e.target.value })} placeholder="E-ticaret, Restoran vb." />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Web Sitesi</Label>
                <Input data-testid="client-website" value={cForm.website} onChange={(e) => setCForm({ ...cForm, website: e.target.value })} placeholder="https://" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Yorum / Referans (opsiyonel)</Label>
                <Textarea data-testid="client-testimonial" rows={2} value={cForm.testimonial} onChange={(e) => setCForm({ ...cForm, testimonial: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Logo (PNG/SVG şeffaf önerilir)</Label>
                <Input type="file" ref={cFileRef} data-testid="client-logo" accept="image/*"
                  onChange={(e) => setCForm({ ...cForm, logo: e.target.files?.[0] || null })} />
              </div>
              <div className="md:col-span-2">
                <Button data-testid="client-submit" onClick={submitClient} disabled={cBusy} className="bg-slate-900 hover:bg-slate-800">
                  {cBusy ? "Ekleniyor..." : "Firma Ekle"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {clients.map((c) => (
              <div key={c.id} data-testid={`admin-client-${c.id}`} className="border border-slate-200 rounded-xl p-4 bg-white text-center">
                <div className="aspect-square bg-slate-50 rounded-lg flex items-center justify-center mb-3 p-2">
                  {c.logo_id
                    ? <img src={`${API_BASE}/clients/logo/${c.logo_id}`} alt={c.name} className="max-w-full max-h-full object-contain" />
                    : <Building2 className="w-8 h-8 text-slate-400" />}
                </div>
                <div className="text-sm font-medium truncate">{c.name}</div>
                <div className="text-xs text-slate-500 truncate">{c.industry}</div>
                <Button size="sm" variant="destructive" className="mt-2 h-7"
                  onClick={async () => { if (window.confirm("Silinsin mi?")) { await api.delete(`/clients/${c.id}`); load(); toast.success("Silindi"); } }}
                  data-testid={`client-delete-${c.id}`}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminFotuberMedya;
