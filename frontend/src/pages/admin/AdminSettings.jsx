import React, { useEffect, useRef, useState } from "react";
import { api, formatApiError, API_BASE } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload, Save, Image as ImageIcon } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";

const AdminSettings = () => {
  const { refresh } = useSettings();
  const [form, setForm] = useState(null);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef();

  useEffect(() => { api.get("/settings").then((r) => setForm(r.data)); }, []);

  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    setSaving(true);
    try {
      const { logo_id, id, updated_at, _id, ...rest } = form;
      await api.put("/settings", rest);
      toast.success("Site ayarları kaydedildi");
      refresh();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const uploadLogo = async () => {
    if (!file) { toast.error("Bir logo dosyası seçin"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post("/settings/logo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Logo güncellendi");
      const { data } = await api.get("/settings");
      setForm(data);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      refresh();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setUploading(false); }
  };

  if (!form) return <div className="text-slate-500">Yükleniyor...</div>;

  const logoUrl = form.logo_id ? `${API_BASE}/settings/logo/${form.logo_id}?t=${form.updated_at || ''}` : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight" data-testid="admin-settings-title">Site Ayarları</h1>
        <p className="text-sm text-slate-500 mt-1">Logo, marka, hero metinleri ve iletişim bilgilerini yönetin.</p>
      </div>

      {/* Logo */}
      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Logo</CardTitle></CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-6 items-start">
          <div className="w-32 h-32 rounded-2xl border border-slate-200 flex items-center justify-center bg-slate-50 overflow-hidden">
            {logoUrl ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" /> :
              <span className="text-xs text-slate-400 text-center px-2">Henüz logo<br />yüklenmedi</span>}
          </div>
          <div className="flex-1 space-y-3">
            <Input
              type="file"
              ref={inputRef}
              data-testid="logo-upload-input"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <p className="text-xs text-slate-500">PNG, JPG, WEBP veya SVG. Şeffaf arkaplanlı PNG önerilir (kare oran).</p>
            <Button data-testid="logo-upload-btn" onClick={uploadLogo} disabled={uploading || !file} className="bg-slate-900 hover:bg-slate-800">
              <Upload className="w-4 h-4 mr-2" /> {uploading ? "Yükleniyor..." : "Logoyu Yükle"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Marka */}
      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base font-semibold">Marka</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">İşletme Adı</Label>
            <Input data-testid="setting-business-name" value={form.business_name || ""} onChange={upd("business_name")} />
          </div>
          <div>
            <Label className="text-xs">Tagline (küçük yazı)</Label>
            <Input data-testid="setting-tagline" value={form.tagline || ""} onChange={upd("tagline")} />
          </div>
        </CardContent>
      </Card>

      {/* Hero */}
      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base font-semibold">Ana Sayfa Hero</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Başlık — 1. bölüm</Label>
            <Input data-testid="setting-hero-title" value={form.hero_title || ""} onChange={upd("hero_title")} />
            <p className="text-[11px] text-slate-500 mt-1">Örn: "Anlar, "</p>
          </div>
          <div>
            <Label className="text-xs">Başlık — vurgulu kelime (altın)</Label>
            <Input data-testid="setting-hero-accent" value={form.hero_title_accent || ""} onChange={upd("hero_title_accent")} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Alt başlık</Label>
            <Input data-testid="setting-hero-subtitle" value={form.hero_subtitle || ""} onChange={upd("hero_subtitle")} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Açıklama Paragrafı</Label>
            <Textarea data-testid="setting-hero-intro" rows={3} value={form.hero_intro || ""} onChange={upd("hero_intro")} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Hero Arka Plan Görsel URL'si</Label>
            <Input data-testid="setting-hero-image" value={form.hero_image_url || ""} onChange={upd("hero_image_url")} placeholder="https://..." />
            {form.hero_image_url && (
              <img src={form.hero_image_url} alt="Hero" className="mt-2 h-24 rounded border border-slate-200 object-cover" />
            )}
          </div>
        </CardContent>
      </Card>

      {/* İletişim */}
      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base font-semibold">İletişim Bilgileri</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Telefon (görüntüleme)</Label>
            <Input data-testid="setting-phone" value={form.phone || ""} onChange={upd("phone")} placeholder="05010002523" />
          </div>
          <div>
            <Label className="text-xs">WhatsApp (uluslararası, + olmadan)</Label>
            <Input data-testid="setting-whatsapp" value={form.whatsapp || ""} onChange={upd("whatsapp")} placeholder="905010002523" />
          </div>
          <div>
            <Label className="text-xs">E-posta</Label>
            <Input data-testid="setting-email" value={form.email || ""} onChange={upd("email")} />
          </div>
          <div>
            <Label className="text-xs">İşletme Adresi</Label>
            <Input data-testid="setting-address" value={form.address || ""} onChange={upd("address")} placeholder="Örn: Cumhuriyet Cad. No:12, Şişli / İstanbul" />
          </div>
        </CardContent>
      </Card>

      {/* Sosyal Medya */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Sosyal Medya Hesapları</CardTitle>
          <p className="text-xs text-slate-500 mt-1">Kullanıcı adı (@fotuber) veya tam URL girebilirsiniz.</p>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Instagram (Ana Hesap)</Label>
            <Input data-testid="setting-instagram" value={form.instagram || ""} onChange={upd("instagram")} placeholder="@fotuber veya https://instagram.com/fotuber" />
          </div>
          <div>
            <Label className="text-xs">Instagram (İkinci Hesap - opsiyonel)</Label>
            <Input data-testid="setting-instagram-2" value={form.instagram_secondary || ""} onChange={upd("instagram_secondary")} placeholder="@fotuber.studio" />
          </div>
          <div>
            <Label className="text-xs">YouTube</Label>
            <Input data-testid="setting-youtube" value={form.youtube || ""} onChange={upd("youtube")} placeholder="https://youtube.com/@fotuber veya @fotuber" />
          </div>
          <div>
            <Label className="text-xs">TikTok (opsiyonel)</Label>
            <Input data-testid="setting-tiktok" value={form.tiktok || ""} onChange={upd("tiktok")} placeholder="@fotuber" />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Facebook (opsiyonel)</Label>
            <Input data-testid="setting-facebook" value={form.facebook || ""} onChange={upd("facebook")} placeholder="https://facebook.com/fotuber" />
          </div>
        </CardContent>
      </Card>

      {/* Bildirim Alıcıları */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Bildirim Alacak Numaralar</CardTitle>
          <p className="text-xs text-slate-500 mt-1">
            Yeni randevu talebi geldiğinde SMS/WhatsApp gelmesini istediğiniz telefon numaralarını virgülle ayırarak yazın.
            Ayrıca Personel sayfasındaki aktif personellerin telefonları otomatik dahil edilir.
            (Twilio anahtarları backend .env dosyasına eklendiğinde dış bildirimler aktif olur; şu ana kadar sadece panel içi bildirim çalışır.)
          </p>
        </CardHeader>
        <CardContent>
          <Textarea
            data-testid="setting-notify-recipients"
            rows={2}
            value={form.notification_recipients || ""}
            onChange={upd("notification_recipients")}
            placeholder="05011112233, 05012223344"
          />
        </CardContent>
      </Card>

      {/* Mesaj Şablonları */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Mesaj Şablonları (SMS / WhatsApp)</CardTitle>
          <p className="text-xs text-slate-500 mt-1">
            Müşteriye otomatik giden mesajları özelleştirin. Değişkenler:{" "}
            <code className="text-slate-800 bg-slate-100 px-1 rounded">{"{ad}"}</code>{" "}
            <code className="text-slate-800 bg-slate-100 px-1 rounded">{"{tarih}"}</code>{" "}
            <code className="text-slate-800 bg-slate-100 px-1 rounded">{"{saat}"}</code>{" "}
            <code className="text-slate-800 bg-slate-100 px-1 rounded">{"{hizmet}"}</code>{" "}
            <code className="text-slate-800 bg-slate-100 px-1 rounded">{"{marka}"}</code>{" "}
            <code className="text-slate-800 bg-slate-100 px-1 rounded">{"{adres}"}</code>{" "}
            <code className="text-slate-800 bg-slate-100 px-1 rounded">{"{harita_link}"}</code>{" "}
            <code className="text-slate-800 bg-slate-100 px-1 rounded">{"{telefon}"}</code>{" "}
            <code className="text-slate-800 bg-slate-100 px-1 rounded">{"{kapora}"}</code>{" "}
            <code className="text-slate-800 bg-slate-100 px-1 rounded">{"{ucret}"}</code>
          </p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div>
            <Label className="text-xs">1. Yeni Randevu Talebi (müşteriye "aldık" onayı)</Label>
            <Textarea data-testid="tpl-new" rows={2} value={form.msg_new_appointment || ""} onChange={upd("msg_new_appointment")} />
          </div>
          <div>
            <Label className="text-xs">2. Randevu Onaylandığında</Label>
            <Textarea data-testid="tpl-approved" rows={3} value={form.msg_approved || ""} onChange={upd("msg_approved")} />
          </div>
          <div>
            <Label className="text-xs">3. Randevu İptal Edildiğinde</Label>
            <Textarea data-testid="tpl-cancelled" rows={2} value={form.msg_cancelled || ""} onChange={upd("msg_cancelled")} />
          </div>
          <div>
            <Label className="text-xs">4. Hatırlatma Mesajı (admin butonuyla veya bir gün öncesinden)</Label>
            <Textarea data-testid="tpl-reminder" rows={3} value={form.msg_reminder || ""} onChange={upd("msg_reminder")} />
          </div>
        </CardContent>
      </Card>

      {/* Google Maps */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Google Haritalar Konumu</CardTitle>
          <p className="text-xs text-slate-500 mt-1">Google Maps üzerinden işletmenizi bulun → Paylaş → "Bir harita yerleştir" sekmesindeki HTML kodundaki <b>src="..."</b> bağlantısını kopyalayıp buraya yapıştırın. Veya sadece paylaşım linkini yapıştırabilirsiniz.</p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div>
            <Label className="text-xs">Google Maps Paylaşım URL'si (yol tarifi butonu için)</Label>
            <Input data-testid="setting-gmaps-url" value={form.google_maps_url || ""} onChange={upd("google_maps_url")} placeholder="https://maps.app.goo.gl/xxxxx" />
          </div>
          <div>
            <Label className="text-xs">Google Maps Embed URL'si (site içi harita için)</Label>
            <Textarea
              data-testid="setting-gmaps-embed"
              rows={3}
              value={form.google_maps_embed || ""}
              onChange={upd("google_maps_embed")}
              placeholder='https://www.google.com/maps/embed?pb=... veya tüm iframe HTML kodu'
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              iframe HTML kodunun tamamını yapıştırırsanız da otomatik olarak URL çıkartılır.
            </p>
          </div>
          {form.google_maps_embed && (
            <div className="border border-slate-200 rounded-lg overflow-hidden aspect-video max-w-lg">
              <iframe
                title="Google Maps önizleme"
                src={(form.google_maps_embed.match(/src="([^"]+)"/) || [null, form.google_maps_embed])[1]}
                className="w-full h-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hakkımızda */}
      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base font-semibold">Hakkımızda Metni</CardTitle></CardHeader>
        <CardContent>
          <Textarea data-testid="setting-about" rows={6} value={form.about_text || ""} onChange={upd("about_text")} placeholder="Şirketinizi kısaca anlatın..." />
        </CardContent>
      </Card>

      {/* Sözleşme Metni */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Hizmet Sözleşmesi Metni</CardTitle>
          <p className="text-xs text-slate-500 mt-1">
            Online randevu formunda müşteriye gösterilecek ve onayı istenecek sözleşme maddeleri.
            Boş satırla paragraflar ayırabilirsiniz. Bu metin kabul edilmeden müşteri randevu oluşturamaz.
          </p>
        </CardHeader>
        <CardContent>
          <Textarea
            data-testid="setting-contract"
            rows={16}
            value={form.contract_terms || ""}
            onChange={upd("contract_terms")}
            className="font-mono text-xs"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end sticky bottom-4">
        <Button data-testid="settings-save-btn" onClick={save} disabled={saving} size="lg" className="bg-slate-900 hover:bg-slate-800 shadow-lg">
          <Save className="w-4 h-4 mr-2" /> {saving ? "Kaydediliyor..." : "Tüm Ayarları Kaydet"}
        </Button>
      </div>
    </div>
  );
};

export default AdminSettings;
