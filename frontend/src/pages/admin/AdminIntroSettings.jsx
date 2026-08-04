import React, { useEffect, useState } from "react";
import { api, formatApiError, API_BASE } from "@/lib/api";
import { useSettings } from "@/context/SettingsContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Film, Save, Play, Upload, Volume2, Type, ImageIcon, RotateCw } from "lucide-react";
import { toast } from "sonner";

// Curated font stacks the user can pick from (labels + CSS)
const FONT_PRESETS = {
  greeting: [
    { label: "Klasik Serif (Cormorant Garamond)", css: "'Cormorant Garamond', 'Times New Roman', serif" },
    { label: "Modern Serif (Playfair Display)",   css: "'Playfair Display', 'Georgia', serif" },
    { label: "Sade Sans (Manrope)",               css: "'Manrope', 'Helvetica Neue', Arial, sans-serif" },
    { label: "Elegant Ince (Poiret One)",         css: "'Poiret One', 'Segoe UI', sans-serif" },
  ],
  brand: [
    { label: "Kalın Sans (Manrope 900)",           css: "'Manrope', 'Helvetica Neue', Arial, sans-serif" },
    { label: "Modern Grotesk (Inter Black)",       css: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
    { label: "Neo Sans (Poppins Black)",           css: "'Poppins', 'Helvetica Neue', Arial, sans-serif" },
    { label: "Klasik Serif (Playfair)",            css: "'Playfair Display', 'Georgia', serif" },
  ],
  cursive: [
    { label: "Kaligrafi (Great Vibes)",            css: "'Great Vibes', 'Pinyon Script', cursive" },
    { label: "Zarif El Yazısı (Dancing Script)",   css: "'Dancing Script', 'Segoe Script', cursive" },
    { label: "Klasik Cursive (Pinyon Script)",     css: "'Pinyon Script', 'Great Vibes', cursive" },
    { label: "Serbest Fırça (Brush Script)",       css: "'Brush Script MT', cursive" },
  ],
};

const findPreset = (list, css) => list.find((p) => p.css === css)?.css || list[0].css;

const AdminIntroSettings = () => {
  const { settings, refresh } = useSettings();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setForm({
      intro_enabled:       settings.intro_enabled !== false,
      intro_sound_enabled: settings.intro_sound_enabled !== false,
      intro_volume:        settings.intro_volume ?? 0.8,
      intro_greeting_text: settings.intro_greeting_text || "Bugün harika görünüyorsunuz{comma_name}.",
      intro_brand_top:     settings.intro_brand_top || "Fotuber",
      intro_brand_bottom:  settings.intro_brand_bottom || "Görsel Sanat",
      intro_subtitle_domain: settings.intro_subtitle_domain || "fotuber.com.tr",
      intro_font_greeting: settings.intro_font_greeting || FONT_PRESETS.greeting[0].css,
      intro_font_brand:    settings.intro_font_brand    || FONT_PRESETS.brand[0].css,
      intro_font_cursive:  settings.intro_font_cursive  || FONT_PRESETS.cursive[0].css,
      intro_logo_id:       settings.intro_logo_id || null,
    });
  }, [settings]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/settings", form);
      toast.success("Animasyon ayarları kaydedildi.");
      refresh?.();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/settings/intro-logo", fd);
      set("intro_logo_id", data.intro_logo_id);
      toast.success("Intro logosu yüklendi. 'Kaydet' ile ayarları sabitleyin.");
      refresh?.();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setUploading(false); }
  };

  const preview = () => {
    // Force intro to play on Home
    try { sessionStorage.removeItem("fotuber_intro_seen_v4"); } catch (_) {}
    window.open("/?intro=1", "_blank");
  };

  const resetDefaults = () => {
    setForm({
      intro_enabled: true,
      intro_sound_enabled: true,
      intro_volume: 0.8,
      intro_greeting_text: "Bugün harika görünüyorsunuz{comma_name}.",
      intro_brand_top: "Fotuber",
      intro_brand_bottom: "Görsel Sanat",
      intro_subtitle_domain: "fotuber.com.tr",
      intro_font_greeting: FONT_PRESETS.greeting[0].css,
      intro_font_brand:    FONT_PRESETS.brand[0].css,
      intro_font_cursive:  FONT_PRESETS.cursive[0].css,
      intro_logo_id: null,
    });
  };

  const introLogoUrl = form.intro_logo_id ? `${API_BASE}/settings/logo/${form.intro_logo_id}` : null;
  const fallbackLogoUrl = !form.intro_logo_id && settings?.logo_id ? `${API_BASE}/settings/logo/${settings.logo_id}` : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2" data-testid="admin-intro-title">
            <Film className="w-7 h-7 text-slate-700" /> Açılış Animasyonu
          </h1>
          <p className="text-sm text-slate-500 mt-1">Karşılama metnini, marka fontlarını, logoyu ve sesleri buradan yönetin.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={resetDefaults} data-testid="reset-defaults-btn">
            <RotateCw className="w-4 h-4 mr-2" /> Varsayılana Dön
          </Button>
          <Button variant="outline" onClick={preview} data-testid="preview-intro-btn">
            <Play className="w-4 h-4 mr-2" /> Önizle
          </Button>
          <Button onClick={save} disabled={saving} className="bg-slate-900 hover:bg-slate-800" data-testid="save-intro-btn">
            <Save className="w-4 h-4 mr-2" /> {saving ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </div>
      </div>

      {/* Genel */}
      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base font-semibold">Genel</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
            <Switch checked={!!form.intro_enabled} onCheckedChange={(v) => set("intro_enabled", v)} data-testid="switch-intro-enabled" />
            <div>
              <div className="text-sm font-medium">Animasyonu Göster</div>
              <div className="text-xs text-slate-500">Kapatırsanız site direkt ana sayfa ile açılır.</div>
            </div>
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
            <Switch checked={!!form.intro_sound_enabled} onCheckedChange={(v) => set("intro_sound_enabled", v)} data-testid="switch-sound-enabled" />
            <div>
              <div className="text-sm font-medium">Sesler Açık</div>
              <div className="text-xs text-slate-500">Shutter · flaş · kalp atışı.</div>
            </div>
          </label>
          <div className="rounded-lg border border-slate-200 p-3">
            <Label className="text-xs text-slate-500 flex items-center gap-1"><Volume2 className="w-3.5 h-3.5" /> Ses Düzeyi</Label>
            <input
              type="range" min="0" max="1" step="0.05"
              value={form.intro_volume || 0}
              onChange={(e) => set("intro_volume", Number(e.target.value))}
              className="w-full mt-2"
              data-testid="slider-volume"
            />
            <div className="text-xs text-slate-500 mt-1">Seviye: %{Math.round((form.intro_volume || 0) * 100)}</div>
          </div>
        </CardContent>
      </Card>

      {/* Metinler */}
      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-2"><Type className="w-4 h-4" /> Metinler</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">Karşılama Cümlesi</Label>
            <Textarea
              rows={2}
              value={form.intro_greeting_text || ""}
              onChange={(e) => set("intro_greeting_text", e.target.value)}
              placeholder="Bugün harika görünüyorsunuz{comma_name}."
              data-testid="input-greeting"
            />
            <div className="text-xs text-slate-500 mt-1">
              Değişkenler: <code>{"{ad}"}</code> (giriş yapmış kullanıcının ilk adı, yoksa boş) ·
              <code className="ml-1">{"{comma_name}"}</code> (giriş yapmışsa ", Ali" gibi, yapmamışsa boş)
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Marka Ana Yazı (kalın)</Label>
              <Input value={form.intro_brand_top || ""} onChange={(e) => set("intro_brand_top", e.target.value)} data-testid="input-brand-top" placeholder="Fotuber" />
            </div>
            <div>
              <Label className="text-xs">Marka Alt Yazı (kaligrafi)</Label>
              <Input value={form.intro_brand_bottom || ""} onChange={(e) => set("intro_brand_bottom", e.target.value)} data-testid="input-brand-bottom" placeholder="Görsel Sanat" />
            </div>
            <div>
              <Label className="text-xs">Domain Etiketi</Label>
              <Input value={form.intro_subtitle_domain || ""} onChange={(e) => set("intro_subtitle_domain", e.target.value)} data-testid="input-domain" placeholder="fotuber.com.tr" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fontlar */}
      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-2"><Type className="w-4 h-4" /> Fontlar</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs">Karşılama Fontu</Label>
            <Select value={findPreset(FONT_PRESETS.greeting, form.intro_font_greeting)} onValueChange={(v) => set("intro_font_greeting", v)}>
              <SelectTrigger data-testid="select-font-greeting"><SelectValue /></SelectTrigger>
              <SelectContent>{FONT_PRESETS.greeting.map((p) => <SelectItem key={p.css} value={p.css}><span style={{ fontFamily: p.css }}>{p.label}</span></SelectItem>)}</SelectContent>
            </Select>
            <div style={{ fontFamily: form.intro_font_greeting }} className="mt-2 text-lg text-slate-700 truncate">Bugün harika görünüyorsunuz.</div>
          </div>
          <div>
            <Label className="text-xs">Marka Ana Fontu</Label>
            <Select value={findPreset(FONT_PRESETS.brand, form.intro_font_brand)} onValueChange={(v) => set("intro_font_brand", v)}>
              <SelectTrigger data-testid="select-font-brand"><SelectValue /></SelectTrigger>
              <SelectContent>{FONT_PRESETS.brand.map((p) => <SelectItem key={p.css} value={p.css}><span style={{ fontFamily: p.css }}>{p.label}</span></SelectItem>)}</SelectContent>
            </Select>
            <div style={{ fontFamily: form.intro_font_brand, fontWeight: 900 }} className="mt-2 text-2xl text-slate-800 truncate">{form.intro_brand_top || "Fotuber"}</div>
          </div>
          <div>
            <Label className="text-xs">Kaligrafi Fontu</Label>
            <Select value={findPreset(FONT_PRESETS.cursive, form.intro_font_cursive)} onValueChange={(v) => set("intro_font_cursive", v)}>
              <SelectTrigger data-testid="select-font-cursive"><SelectValue /></SelectTrigger>
              <SelectContent>{FONT_PRESETS.cursive.map((p) => <SelectItem key={p.css} value={p.css}><span style={{ fontFamily: p.css }}>{p.label}</span></SelectItem>)}</SelectContent>
            </Select>
            <div style={{ fontFamily: form.intro_font_cursive }} className="mt-2 text-2xl text-amber-700 truncate">{form.intro_brand_bottom || "Görsel Sanat"}</div>
          </div>
        </CardContent>
      </Card>

      {/* Logo */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Animasyon Logosu</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-6 items-start">
          <div>
            <div className="rounded-2xl bg-black p-8 flex items-center justify-center min-h-[240px] border border-slate-200">
              {introLogoUrl ? (
                <img src={introLogoUrl} alt="Intro logo" className="max-w-full max-h-56 object-contain" style={{ mixBlendMode: "screen" }} />
              ) : fallbackLogoUrl ? (
                <img src={fallbackLogoUrl} alt="Site logo fallback" className="max-w-full max-h-56 object-contain" style={{ mixBlendMode: "screen" }} />
              ) : (
                <div className="text-slate-500 text-sm">Henüz logo yok. Site ayarlarındaki logo veya varsayılan simge kullanılır.</div>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-2">
              Önizleme siyah arkaplan üzerine screen-blend uygulanmış hâlidir (canlıdaki animasyondaki gibi). Şeffaf arka planlı PNG kullanmanız önerilir.
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Yeni logo yükle</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => uploadLogo(e.target.files?.[0])}
                disabled={uploading}
                data-testid="intro-logo-file"
              />
              <div className="text-xs text-slate-500 mt-1">
                Önerilen: minimum 512×512 px, şeffaf arka planlı, beyaz ya da açık renk mark. Ana site logosu değiştirilmez.
              </div>
            </div>
            {form.intro_logo_id && (
              <Button variant="outline" onClick={() => set("intro_logo_id", null)} data-testid="clear-intro-logo">
                Intro Logosunu Temizle (Site Logosuna Dön)
              </Button>
            )}
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
              <b>İpucu</b>: Site logonuz (Admin → Site Ayarları) tüm sayfalarda görünür. Buradaki logo ise <b>sadece açılış animasyonunda</b> kullanılır. Boş bırakırsanız site logosu kullanılır.
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-slate-500 pt-4">
        Preview URL'ye <code>?intro=1</code> ekleyerek animasyonu her zaman tekrar oynatabilirsiniz.
      </div>
    </div>
  );
};

export default AdminIntroSettings;
