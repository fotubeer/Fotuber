import React, { useEffect, useRef, useState } from "react";
import { api, formatApiError, galleryFileUrl } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Upload, Trash2, Film, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

const AdminGallery = () => {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ category: "", title: "", description: "" });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef();

  useEffect(() => {
    api.get("/gallery/categories").then((r) => {
      const raw = r.data;
      const cats = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.categories) ? raw.categories : Array.isArray(raw?.results) ? raw.results : [];
      setCategories(cats);
      setForm((f) => ({ ...f, category: cats[0]?.slug || "" }));
    }).catch(() => setCategories([]));
    load();
  }, []);

  const load = () => api.get("/gallery").then((r) => {
    const raw = r.data;
    setItems(Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.gallery) ? raw.gallery : Array.isArray(raw?.results) ? raw.results : []);
  }).catch(() => setItems([]));

  const upload = async () => {
    if (!file) { toast.error("Bir dosya seçin"); return; }
    if (!form.category) { toast.error("Kategori seçin"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("category", form.category);
      fd.append("title", form.title);
      fd.append("description", form.description);
      fd.append("file", file);
      await api.post("/gallery/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Medya yüklendi");
      setForm({ ...form, title: "", description: "" });
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      load();
    } catch (e) { toast.error(formatApiError(e, "Yükleme başarısız")); }
    finally { setUploading(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Bu medya silinsin mi?")) return;
    await api.delete(`/gallery/${id}`); load(); toast.success("Silindi");
  };

  const filtered = filter === "all" ? items : items.filter((i) => i.category === filter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight" data-testid="admin-gallery-title">Galeri Yönetimi</h1>
        <p className="text-sm text-slate-500 mt-1">Fotoğraf ve videoları kategorilere göre yükleyin.</p>
      </div>

      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-2"><Upload className="w-4 h-4" /> Yeni Medya Yükle</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-slate-500">Kategori</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger data-testid="upload-category"><SelectValue placeholder="Kategori seçin" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-slate-500">Dosya (görsel veya video)</Label>
            <Input
              type="file"
              ref={inputRef}
              data-testid="upload-file"
              accept="image/*,video/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {file && <div className="text-xs text-slate-500 mt-1">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</div>}
          </div>
          <div>
            <Label className="text-xs text-slate-500">Başlık (opsiyonel)</Label>
            <Input data-testid="upload-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Açıklama (opsiyonel)</Label>
            <Textarea data-testid="upload-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Button data-testid="upload-submit-btn" disabled={uploading} onClick={upload} className="bg-slate-900 hover:bg-slate-800">
              {uploading ? "Yükleniyor..." : (<><Upload className="w-4 h-4 mr-2" /> Yükle</>)}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <button data-testid="filter-all" onClick={() => setFilter("all")} className={`px-3 py-1.5 rounded-full text-sm border ${filter === "all" ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200 text-slate-700"}`}>Tümü</button>
        {categories.map((c) => (
          <button key={c.slug} data-testid={`filter-${c.slug}`} onClick={() => setFilter(c.slug)} className={`px-3 py-1.5 rounded-full text-sm border ${filter === c.slug ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200 text-slate-700"}`}>{c.name}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="border border-dashed border-slate-300 rounded-2xl py-20 text-center text-slate-500">
          Henüz medya yüklenmedi.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((g) => (
            <div key={g.id} data-testid={`admin-gallery-item-${g.id}`} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <div className="aspect-video bg-slate-100">
                {g.media_type === "video" ? (
                  <video src={galleryFileUrl(g.id)} className="w-full h-full object-cover" muted />
                ) : (
                  <img src={galleryFileUrl(g.id)} alt={g.title || ""} className="w-full h-full object-cover" />
                )}
              </div>
              <div className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <Badge variant="outline" className="text-[10px]">
                    {g.media_type === "video" ? <Film className="w-3 h-3 mr-1" /> : <ImageIcon className="w-3 h-3 mr-1" />}
                    {categories.find((c) => c.slug === g.category)?.name || g.category}
                  </Badge>
                  <Button size="icon" variant="ghost" onClick={() => remove(g.id)} data-testid={`gallery-delete-${g.id}`}>
                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  </Button>
                </div>
                {g.title && <div className="text-sm font-medium truncate">{g.title}</div>}
                {g.description && <div className="text-xs text-slate-500 line-clamp-2">{g.description}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminGallery;
