import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { useSettings } from "@/context/SettingsContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bot, Save, RotateCw, MessageSquare, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

const MODELS = [
  { provider: "anthropic", model: "claude-sonnet-4-6",  label: "Claude Sonnet 4.6 (Önerilen — nazik Türkçe)" },
  { provider: "anthropic", model: "claude-opus-4-7",    label: "Claude Opus 4.7 (En akıcı ama yavaş)" },
  { provider: "anthropic", model: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (Hızlı ve ekonomik)" },
  { provider: "openai",    model: "gpt-5.4",            label: "GPT 5.4 (Hızlı, dengeli)" },
  { provider: "openai",    model: "gpt-5.4-mini",       label: "GPT 5.4 Mini (En ekonomik)" },
  { provider: "gemini",    model: "gemini-3-flash-preview", label: "Gemini 3 Flash (Ekonomik + hızlı)" },
];

const AdminAIAssistant = () => {
  const { settings, refresh } = useSettings();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!settings) return;
    setForm({
      ai_enabled: settings.ai_enabled !== false,
      ai_provider: settings.ai_provider || "anthropic",
      ai_model:    settings.ai_model    || "claude-sonnet-4-6",
      ai_system_prompt:    settings.ai_system_prompt || "",
      ai_welcome_message:  settings.ai_welcome_message || "Merhaba! Ben Fotuber Asistan. Size özel çekim önerileri, hava durumu, gün batımı saati ve kıyafet tavsiyeleri için buradayım. Hangi tarih ve şehir için sorunuz var?",
      ai_bubble_text:      settings.ai_bubble_text || "Fotuber yapay zekaya sor ve öğren",
      ai_button_label:     settings.ai_button_label || "Fotuber Asistan",
      ai_default_city:     settings.ai_default_city || "Çankırı",
    });
  }, [settings]);

  useEffect(() => {
    api.get("/ai/sessions").then((r) => {
      const raw = r.data;
      setSessions(Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.sessions) ? raw.sessions : Array.isArray(raw?.results) ? raw.results : []);
    }).catch(() => setSessions([]));
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    setSaving(true);
    try {
      await api.put("/settings", form);
      toast.success("Fotuber Asistan ayarları kaydedildi.");
      refresh?.();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const modelValue = `${form.ai_provider}|${form.ai_model}`;
  const setModel = (v) => {
    const [provider, model] = v.split("|");
    setForm((f) => ({ ...f, ai_provider: provider, ai_model: model }));
  };

  const openSession = async (s) => {
    setSelected(s);
    try {
      const { data } = await api.get(`/ai/sessions/${s.session_id}/messages`);
      setMessages(data);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2" data-testid="admin-ai-title">
            <Bot className="w-7 h-7 text-emerald-600" /> Fotuber Asistan (AI)
          </h1>
          <p className="text-sm text-slate-500 mt-1">Kişilik, sistem promptu, karşılama metni ve müşteri sohbetlerini buradan yönetin.</p>
        </div>
        <Button onClick={save} disabled={saving} className="bg-slate-900 hover:bg-slate-800" data-testid="save-ai-btn">
          <Save className="w-4 h-4 mr-2" /> {saving ? "Kaydediliyor..." : "Kaydet"}
        </Button>
      </div>

      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base font-semibold">Genel</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
            <Switch checked={!!form.ai_enabled} onCheckedChange={(v) => set("ai_enabled", v)} data-testid="switch-ai-enabled" />
            <div>
              <div className="text-sm font-medium">Asistanı Göster</div>
              <div className="text-xs text-slate-500">Kapatırsanız chat butonu görünmez.</div>
            </div>
          </label>
          <div>
            <Label className="text-xs">Model</Label>
            <Select value={modelValue} onValueChange={setModel}>
              <SelectTrigger data-testid="select-ai-model"><SelectValue /></SelectTrigger>
              <SelectContent>{MODELS.map((m) => <SelectItem key={`${m.provider}|${m.model}`} value={`${m.provider}|${m.model}`}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
            <div className="text-xs text-slate-500 mt-1">Tüm modeller Emergent Universal Key ile çalışır. Claude Sonnet 4.6 en nazik Türkçe cevaplar için önerilir.</div>
          </div>
          <div>
            <Label className="text-xs">Varsayılan Şehir</Label>
            <Input value={form.ai_default_city || ""} onChange={(e) => set("ai_default_city", e.target.value)} placeholder="Çankırı" data-testid="input-default-city" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base font-semibold">Metinler</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Konuşma Balonu (kısa)</Label>
              <Input value={form.ai_bubble_text || ""} onChange={(e) => set("ai_bubble_text", e.target.value)} data-testid="input-bubble-text" />
            </div>
            <div>
              <Label className="text-xs">Buton Adı</Label>
              <Input value={form.ai_button_label || ""} onChange={(e) => set("ai_button_label", e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Karşılama Mesajı (chat açıldığında)</Label>
            <Textarea rows={2} value={form.ai_welcome_message || ""} onChange={(e) => set("ai_welcome_message", e.target.value)} data-testid="input-welcome" />
          </div>
          <div>
            <Label className="text-xs">Sistem Promptu (Asistanın kişiliği ve kuralları)</Label>
            <Textarea rows={12} value={form.ai_system_prompt || ""} onChange={(e) => set("ai_system_prompt", e.target.value)} data-testid="input-system-prompt"
              placeholder="Boş bırakırsanız varsayılan Fotuber Asistan promptu kullanılır (Türk kültürüne, tesettürlü müşteri hassasiyetlerine saygılı, fotoğrafçılık danışmanı)." />
            <div className="text-xs text-slate-500 mt-1">
              Değiştirdiğinizde: 6 cümle kuralı, hassasiyet notu, muhafazakar kıyafet önerisi, randevu yönlendirmesi gibi Fotuber özel kurallarını korumaya özen gösterin.
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Müşteri Sohbetleri</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">Henüz sohbet yok. Müşteriler sordukça burada listelenir. Sohbetler asistanın öğrenmesi için değerli veridir.</div>
          ) : (
            <div className="grid md:grid-cols-3 gap-4">
              <ul className="md:col-span-1 divide-y divide-slate-200 border border-slate-200 rounded-lg max-h-96 overflow-y-auto" data-testid="ai-sessions">
                {sessions.map((s) => (
                  <li key={s.session_id}>
                    <button
                      onClick={() => openSession(s)}
                      className={`w-full text-left p-3 hover:bg-slate-50 ${selected?.session_id === s.session_id ? "bg-slate-100" : ""}`}
                    >
                      <div className="text-xs font-medium truncate">{s.session_id}</div>
                      <div className="text-[10px] text-slate-500">{s.turn_count || 0} mesaj · {s.last_city || "-"}</div>
                      <div className="text-[10px] text-slate-400">{(s.last_message_at || "").slice(0, 16).replace("T", " ")}</div>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="md:col-span-2 border border-slate-200 rounded-lg p-4 min-h-[280px] max-h-96 overflow-y-auto space-y-3 bg-slate-50/50">
                {!selected ? (
                  <div className="text-sm text-slate-500 text-center pt-16">Sol taraftan bir sohbet seçin</div>
                ) : messages.length === 0 ? (
                  <div className="text-sm text-slate-500">Mesaj yok.</div>
                ) : messages.map((m) => (
                  <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-800"}`}>
                      <div className="text-[9px] uppercase tracking-wide opacity-60 mb-1 flex items-center gap-1">
                        {m.role === "user" ? <><UserIcon className="w-2.5 h-2.5" /> Müşteri</> : <><Bot className="w-2.5 h-2.5" /> Asistan</>}
                        {m.city && <span>· {m.city}</span>}
                        {m.event_date && <span>· {m.event_date}</span>}
                      </div>
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAIAssistant;
