import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Monitor, Apple, Save, Info } from "lucide-react";
import { toast } from "sonner";

export default function AdminDesktopApp() {
  const [form, setForm] = useState({ windows_url: "", mac_url: "", version: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/desktop-downloads").then((r) => setForm({
      windows_url: r.data.windows_url || "", mac_url: r.data.mac_url || "", version: r.data.version || "",
    })).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/admin/desktop-downloads", form);
      toast.success("İndirme bağlantıları kaydedildi");
    } catch (e) { toast.error(formatApiError(e, "Kaydedilemedi")); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight" data-testid="admin-desktop-title">Masaüstü Uygulaması</h1>
        <p className="text-sm text-slate-500 mt-1">Stüdyoların Windows ve macOS için masaüstü uygulamasını indirebileceği bağlantıları buradan yönetin. Bağlantılar Stüdyo Panelinde "Masaüstü Uygulaması" bölümünde otomatik gösterilir.</p>
      </div>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4 text-xs text-amber-800 flex gap-2">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            Kurulum dosyaları (<b>.exe</b> / <b>.dmg</b>) GitHub Actions ile otomatik üretilir (bkz. <code>.github/workflows/desktop-build.yml</code>).
            En kalıcı yöntem: GitHub'da bir <b>Release</b> yayınlayıp <b>.exe</b> ve <b>.dmg</b> dosyalarını ekleyin, ardından o dosyaların herkese açık indirme (browser_download_url) linklerini aşağıya yapıştırın.
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base font-semibold">İndirme Bağlantıları</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-slate-500 flex items-center gap-1.5"><Monitor className="w-3.5 h-3.5" /> Windows (.exe) indirme linki</Label>
            <Input data-testid="desktop-windows-url" value={form.windows_url} onChange={(e) => setForm({ ...form, windows_url: e.target.value })} placeholder="https://.../Fotuber-Studio-Setup.exe" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-slate-500 flex items-center gap-1.5"><Apple className="w-3.5 h-3.5" /> macOS (.dmg) indirme linki</Label>
            <Input data-testid="desktop-mac-url" value={form.mac_url} onChange={(e) => setForm({ ...form, mac_url: e.target.value })} placeholder="https://.../Fotuber-Studio.dmg" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Sürüm (opsiyonel)</Label>
            <Input data-testid="desktop-version" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="1.0.0" className="mt-1 max-w-[160px]" />
          </div>
          <Button data-testid="desktop-save" onClick={save} disabled={saving} className="gap-1.5">
            <Save className="w-4 h-4" /> {saving ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
