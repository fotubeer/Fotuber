import React, { useEffect, useState } from "react";
import { api, formatApiError, API_BASE } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Instagram, Upload, ExternalLink, Trash2, Save, Plus, GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const ACCOUNTS = [
  { value: "@fotuberphotography",  label: "@fotuberphotography — Fotuber Photography" },
  { value: "@cankirinisanevii",    label: "@cankirinisanevii — Çankırı Nişan Evi" },
];

const AdminInstagramSlideshow = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    file: null,
    instagram_url: "",
    caption: "",
    account_label: ACCOUNTS[0].value,
    active: true,
  });
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const load = () => {
    setLoading(true);
    api.get("/instagram-posts/all")
      .then((r) => {
        const raw = r.data;
        setPosts(Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.posts) ? raw.posts : Array.isArray(raw?.results) ? raw.results : []);
      })
      .catch((e) => { toast.error(formatApiError(e)); setPosts([]); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const upload = async () => {
    if (!form.file) { toast.error("Bir fotoğraf seçin"); return; }
    if (!form.instagram_url.trim()) { toast.error("Instagram linkini girin"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", form.file);
      fd.append("instagram_url", form.instagram_url.trim());
      fd.append("caption", form.caption || "");
      fd.append("account_label", form.account_label || "");
      fd.append("order", String(posts.length));
      fd.append("active", String(form.active));
      await api.post("/instagram-posts", fd);
      toast.success("Fotoğraf eklendi.");
      setForm({ file: null, instagram_url: "", caption: "", account_label: form.account_label, active: true });
      // Reset file input
      const inp = document.querySelector("[data-testid='insta-file']");
      if (inp) inp.value = "";
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setUploading(false); }
  };

  const toggleActive = async (p) => {
    try {
      await api.patch(`/instagram-posts/${p.id}`, {
        instagram_url: p.instagram_url,
        caption: p.caption,
        account_label: p.account_label,
        order: p.order,
        active: !p.active,
      });
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const move = async (p, dir) => {
    const idx = posts.findIndex((x) => x.id === p.id);
    const target = idx + dir;
    if (target < 0 || target >= posts.length) return;
    const other = posts[target];
    try {
      await Promise.all([
        api.patch(`/instagram-posts/${p.id}`,     { instagram_url: p.instagram_url, order: other.order, caption: p.caption, account_label: p.account_label, active: p.active }),
        api.patch(`/instagram-posts/${other.id}`, { instagram_url: other.instagram_url, order: p.order, caption: other.caption, account_label: other.account_label, active: other.active }),
      ]);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const remove = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/instagram-posts/${deleteId}`);
      toast.success("Silindi.");
      setDeleteId(null);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2" data-testid="admin-insta-title">
          <Instagram className="w-7 h-7 text-pink-600" /> Instagram Slaytı
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Instagram'daki en beğendiğiniz fotoğrafları buraya yükleyin. Ziyaretçiler anasayfadaki sinemasal slaytı görüp fotoğrafa tıkladığında ilgili Instagram sayfasına gider.
        </p>
      </div>

      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-2"><Plus className="w-4 h-4" /> Yeni Fotoğraf Ekle</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="col-span-2 md:col-span-1">
            <Label className="text-xs">Fotoğraf</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })}
              data-testid="insta-file"
            />
            {form.file && <div className="text-xs text-slate-500 mt-1">{form.file.name} · {(form.file.size / 1024).toFixed(0)} KB</div>}
          </div>
          <div>
            <Label className="text-xs">Hangi Instagram Hesabı</Label>
            <select
              className="w-full mt-1 rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={form.account_label}
              onChange={(e) => setForm({ ...form, account_label: e.target.value })}
              data-testid="insta-account"
            >
              {ACCOUNTS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Instagram Linki (fotoğraf veya profil)</Label>
            <Input
              value={form.instagram_url}
              onChange={(e) => setForm({ ...form, instagram_url: e.target.value })}
              placeholder="Örn. https://www.instagram.com/fotuberphotography/ veya /p/xxxxxxx/"
              data-testid="insta-url"
            />
            <div className="text-xs text-slate-500 mt-1">Tıklandığında bu link yeni sekmede açılır. Belirli bir fotoğraf linki ya da profil linki verebilirsiniz.</div>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Açıklama (opsiyonel)</Label>
            <Textarea rows={2} value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} placeholder="Örn. Ayşe & Mehmet düğün gecesi, 2025" />
          </div>
          <label className="col-span-2 flex items-center gap-3">
            <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            <span className="text-sm">Anasayfada gösterilsin</span>
          </label>
          <div className="col-span-2">
            <Button onClick={upload} disabled={uploading || !form.file || !form.instagram_url} className="bg-pink-600 hover:bg-pink-700" data-testid="insta-upload-btn">
              <Upload className="w-4 h-4 mr-2" /> {uploading ? "Yükleniyor..." : "Yükle ve Ekle"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base font-semibold">Slayt Sırası ({posts.length} fotoğraf)</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-slate-500 py-8 text-center">Yükleniyor...</div>
          ) : posts.length === 0 ? (
            <div className="text-sm text-slate-500 py-10 text-center">
              Henüz slayt fotoğrafı eklemediniz. Yukarıdan ilkini ekleyerek başlayın.
            </div>
          ) : (
            <ul className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              {posts.map((p, idx) => (
                <li key={p.id} className={`rounded-xl border overflow-hidden bg-white ${p.active ? "border-slate-200" : "border-slate-200 opacity-60"}`} data-testid={`insta-item-${p.id}`}>
                  <div className="relative">
                    <img
                      src={`${API_BASE}/instagram-posts/${p.id}/image`}
                      alt={p.caption || "Instagram"}
                      className="w-full aspect-square object-cover"
                    />
                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                      <Button size="icon" variant="secondary" className="h-7 w-7" onClick={() => move(p, -1)} disabled={idx === 0} data-testid={`insta-up-${p.id}`}>
                        <ArrowUp className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="secondary" className="h-7 w-7" onClick={() => move(p, 1)} disabled={idx === posts.length - 1} data-testid={`insta-down-${p.id}`}>
                        <ArrowDown className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="absolute top-2 right-2 flex flex-col gap-1">
                      <a href={p.instagram_url} target="_blank" rel="noopener noreferrer">
                        <Button size="icon" variant="secondary" className="h-7 w-7"><ExternalLink className="w-3 h-3" /></Button>
                      </a>
                      <Button size="icon" variant="destructive" className="h-7 w-7" onClick={() => setDeleteId(p.id)} data-testid={`insta-delete-${p.id}`}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="text-xs font-medium text-pink-700">{p.account_label || "—"}</div>
                    {p.caption && <div className="text-xs text-slate-600 line-clamp-2">{p.caption}</div>}
                    <div className="text-[10px] text-slate-400 truncate">{p.instagram_url}</div>
                    <label className="flex items-center gap-2 pt-1">
                      <Switch checked={p.active} onCheckedChange={() => toggleActive(p)} />
                      <span className="text-xs">{p.active ? "Aktif" : "Gizli"}</span>
                    </label>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>Bu fotoğraf slayttan kalıcı olarak kaldırılacak.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-red-600 hover:bg-red-700">Evet, Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminInstagramSlideshow;
