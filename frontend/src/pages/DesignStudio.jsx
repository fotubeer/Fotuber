import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as fabric from "fabric";
import { toast } from "sonner";
import {
  Type, Heading, Square, Circle as CircleIcon, Minus, Image as ImageIcon,
  UserSquare, Save, Download, LayoutTemplate, Trash2, Copy, ArrowUp, ArrowDown,
  Bold, Italic, AlignLeft, AlignCenter, AlignRight, ArrowLeft, ZoomIn,
  Sparkles, Loader2, Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { api, formatApiError, API_BASE } from "@/lib/api";
import { studioApi } from "@/lib/studioApi";
import { loadGoogleFont, preloadFonts } from "@/lib/designFonts";

const DEFAULT_W = 1080;
const DEFAULT_H = 1350;

// input[type=color] needs a 7-char hex; normalize fabric fills (#111, rgb(...)).
function toHexColor(c) {
  if (typeof c !== "string") return "#111111";
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  if (/^#[0-9a-fA-F]{3}$/.test(c)) return "#" + c.slice(1).split("").map((x) => x + x).join("");
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return "#" + [1, 2, 3].map((i) => parseInt(m[i], 10).toString(16).padStart(2, "0")).join("");
  return "#111111";
}

export default function DesignStudio() {
  const navigate = useNavigate();
  const canvasElRef = useRef(null);
  const wrapRef = useRef(null);
  const fcRef = useRef(null); // fabric canvas
  const designRef = useRef({ w: DEFAULT_W, h: DEFAULT_H });
  const fileInputRef = useRef(null);

  const [fonts, setFonts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [sel, setSel] = useState(null); // active object snapshot
  const [title, setTitle] = useState("İsimsiz Tasarım");
  const [projectId, setProjectId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [zoomPct, setZoomPct] = useState(100);
  const [tplOpen, setTplOpen] = useState(false);
  const [sampleName, setSampleName] = useState("");

  // AI design (Tasarım Hakkı → Nano Banana)
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiImages, setAiImages] = useState([]);
  const [aiRights, setAiRights] = useState(undefined); // undefined=checking, null=not logged in, number=rights

  // ---- Fit canvas to container using fabric zoom ------------------------
  const fitCanvas = useCallback(() => {
    const fc = fcRef.current;
    const wrap = wrapRef.current;
    if (!fc || !wrap) return;
    const { w, h } = designRef.current;
    const padW = wrap.clientWidth - 24;
    const padH = wrap.clientHeight - 24;
    const scale = Math.min(padW / w, padH / h, 1.4);
    fc.setDimensions({ width: w * scale, height: h * scale });
    fc.setZoom(scale);
    fc.requestRenderAll();
    fc.__displayScale = scale;
    setZoomPct(Math.round(scale * 100));
  }, []);

  const readSel = useCallback(() => {
    const fc = fcRef.current;
    const o = fc?.getActiveObject();
    if (!o) { setSel(null); return; }
    setSel({
      type: o.type,
      isText: o.type === "textbox" || o.type === "i-text" || o.type === "text",
      fontFamily: o.fontFamily,
      fontSize: o.fontSize,
      fill: o.fill,
      fontWeight: o.fontWeight,
      fontStyle: o.fontStyle,
      textAlign: o.textAlign,
      personalize: !!o.personalize,
    });
  }, []);

  // ---- Load a template graph -------------------------------------------
  const loadTemplate = useCallback(async (tpl) => {
    const fc = fcRef.current;
    if (!fc) return;
    designRef.current = { w: tpl.width, h: tpl.height };
    fc.clear();
    fc.backgroundColor = tpl.bg || "#ffffff";
    const used = [...new Set((tpl.objects || []).map((o) => o.fontFamily).filter(Boolean))];
    await preloadFonts(used);
    (tpl.objects || []).forEach((o) => {
      if (o.type === "textbox") {
        const tb = new fabric.Textbox(o.text || "Metin", {
          left: o.left, top: o.top, width: o.width || 600,
          fontSize: o.fontSize || 48, fontFamily: o.fontFamily || "Montserrat",
          fill: o.fill || "#111", textAlign: o.textAlign || "left",
          originX: o.originX || "left", originY: o.originY || "top",
        });
        fc.add(tb);
      }
    });
    fc.requestRenderAll();
    fitCanvas();
    setTplOpen(false);
  }, [fitCanvas]);

  // ---- Init fabric ------------------------------------------------------
  useEffect(() => {
    const fc = new fabric.Canvas(canvasElRef.current, {
      backgroundColor: "#ffffff",
      preserveObjectStacking: true,
    });
    fcRef.current = fc;
    fc.on("selection:created", readSel);
    fc.on("selection:updated", readSel);
    fc.on("selection:cleared", () => setSel(null));

    let cancelled = false;
    Promise.all([
      api.get("/design/fonts").then((r) => r.data.fonts).catch(() => []),
      api.get("/design/templates").then((r) => r.data.templates).catch(() => []),
    ]).then(([fnts, tpls]) => {
      if (cancelled) return;
      setFonts(fnts);
      setTemplates(tpls);
      const blank = tpls.find((t) => t.id === "blank-portrait") || tpls[0];
      if (blank) loadTemplate(blank);
      else fitCanvas();
    });

    const onResize = () => fitCanvas();
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      fc.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Add elements -----------------------------------------------------
  const centerLeft = () => designRef.current.w / 2 - 200;
  const centerTop = () => designRef.current.h / 2 - 40;

  const addText = (heading = false) => {
    const fc = fcRef.current;
    const tb = new fabric.Textbox(heading ? "Başlık" : "Metninizi yazın", {
      left: centerLeft(), top: centerTop(), width: 420,
      fontSize: heading ? 90 : 44,
      fontFamily: heading ? "Playfair Display" : "Montserrat",
      fill: "#111", textAlign: "center",
    });
    loadGoogleFont(tb.fontFamily).then(() => fc.requestRenderAll());
    fc.add(tb); fc.setActiveObject(tb); fc.requestRenderAll(); readSel();
  };

  const addShape = (kind) => {
    const fc = fcRef.current;
    let obj;
    if (kind === "rect") obj = new fabric.Rect({ left: centerLeft(), top: centerTop(), width: 300, height: 200, fill: "#e8c27a" });
    else if (kind === "circle") obj = new fabric.Circle({ left: centerLeft(), top: centerTop(), radius: 130, fill: "#8a4b52" });
    else obj = new fabric.Line([0, 0, 360, 0], { left: centerLeft(), top: centerTop() + 80, stroke: "#111", strokeWidth: 6 });
    fc.add(obj); fc.setActiveObject(obj); fc.requestRenderAll(); readSel();
  };

  const addPersonalize = () => {
    const fc = fcRef.current;
    const tb = new fabric.Textbox("{isim}", {
      left: designRef.current.w / 2, top: designRef.current.h / 2, width: 700,
      fontSize: 96, fontFamily: "Great Vibes", fill: "#c0392b",
      textAlign: "center", originX: "center", originY: "center",
    });
    tb.personalize = true;
    tb.baseFontSize = 96;
    tb.boxWidth = 700;
    loadGoogleFont("Great Vibes").then(() => fc.requestRenderAll());
    fc.add(tb); fc.setActiveObject(tb); fc.requestRenderAll(); readSel();
    toast.success("Kişiselleştirme alanı eklendi. Baskıda her davetliye özel isim yazılır.");
  };

  // Overflow protection: shrink font until sample name fits the box width.
  const applySample = (name) => {
    setSampleName(name);
    const fc = fcRef.current;
    if (!fc) return;
    fc.getObjects().forEach((o) => {
      if (!o.personalize) return;
      const text = name.trim() || "{isim}";
      const base = o.baseFontSize || o.fontSize;
      let fs = base;
      o.set({ text, fontSize: fs, width: o.boxWidth || o.width });
      o.initDimensions && o.initDimensions();
      // reduce until it fits on a single line within the box
      let guard = 0;
      while (o.width && o.__lineWidths && Math.max(...o.__lineWidths) > (o.boxWidth || o.width) && fs > 18 && guard < 60) {
        fs -= 3; o.set({ fontSize: fs }); o.initDimensions && o.initDimensions(); guard++;
      }
    });
    fc.requestRenderAll();
  };

  const uploadImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const fc = fcRef.current;
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/design/upload", fd);
      const url = `${process.env.REACT_APP_BACKEND_URL}${data.url}`;
      const img = await fabric.FabricImage.fromURL(url, { crossOrigin: "anonymous" });
      const maxW = designRef.current.w * 0.6;
      if (img.width > maxW) img.scaleToWidth(maxW);
      img.set({ left: designRef.current.w / 2, top: designRef.current.h / 2, originX: "center", originY: "center" });
      fc.add(img); fc.setActiveObject(img); fc.requestRenderAll();
      toast.success("Görsel eklendi");
    } catch (err) {
      if (err?.response?.status === 401) toast.error("Görsel yüklemek için giriş yapın (/giris)");
      else toast.error(formatApiError(err, "Görsel yüklenemedi"));
    }
  };

  // ---- Property edits ---------------------------------------------------
  const setProp = (patch) => {
    const fc = fcRef.current;
    const o = fc?.getActiveObject();
    if (!o) return;
    o.set(patch);
    o.initDimensions && o.initDimensions();
    fc.requestRenderAll();
    readSel();
  };
  const changeFont = async (family) => {
    await loadGoogleFont(family);
    setProp({ fontFamily: family });
  };
  const layer = (dir) => {
    const fc = fcRef.current; const o = fc?.getActiveObject(); if (!o) return;
    if (dir === "up") fc.bringObjectForward(o); else fc.sendObjectBackwards(o);
    fc.requestRenderAll();
  };
  const duplicate = async () => {
    const fc = fcRef.current; const o = fc?.getActiveObject(); if (!o) return;
    const cloned = await o.clone();
    cloned.set({ left: (o.left || 0) + 30, top: (o.top || 0) + 30 });
    fc.add(cloned); fc.setActiveObject(cloned); fc.requestRenderAll();
  };
  const removeSel = () => {
    const fc = fcRef.current; const o = fc?.getActiveObject(); if (!o) return;
    fc.remove(o); fc.discardActiveObject(); fc.requestRenderAll(); setSel(null);
  };

  // ---- Save / export ----------------------------------------------------
  const doSave = async () => {
    const fc = fcRef.current; if (!fc) return;
    setSaving(true);
    try {
      const json = fc.toJSON();
      const thumb = fc.toDataURL({ format: "png", multiplier: 0.25 });
      const hasPersonalize = fc.getObjects().some((o) => o.personalize);
      const body = {
        title, canvas_json: json,
        width: designRef.current.w, height: designRef.current.h,
        thumbnail: thumb,
        personalization: { enabled: hasPersonalize, placeholder: "{isim}" },
      };
      if (projectId) {
        await api.put(`/design/projects/${projectId}`, body);
      } else {
        const { data } = await api.post("/design/projects", body);
        setProjectId(data.id);
      }
      toast.success("Tasarım kaydedildi");
    } catch (err) {
      if (err?.response?.status === 401) {
        toast.error("Kaydetmek için üye girişi gerekli");
        navigate("/giris");
      } else toast.error(formatApiError(err, "Kaydedilemedi"));
    } finally {
      setSaving(false);
    }
  };

  const exportPng = () => {
    const fc = fcRef.current; if (!fc) return;
    const scale = fc.__displayScale || 1;
    const url = fc.toDataURL({ format: "png", multiplier: 1 / scale });
    const a = document.createElement("a");
    a.href = url; a.download = `${title || "davetiye"}.png`; a.click();
  };

  // ---- AI design (Tasarım Hakkı) ---------------------------------------
  const openAi = async (open) => {
    setAiOpen(open);
    if (!open) return;
    setAiRights(undefined);
    try {
      const { data } = await studioApi.get("/studio/me");
      setAiRights(data.account.design_rights ?? 0);
    } catch {
      setAiRights(null); // not logged into studio
    }
  };

  const doAiGenerate = async () => {
    if (!aiPrompt.trim()) { toast.error("Lütfen tasarımınızı tarif edin"); return; }
    setAiBusy(true); setAiImages([]);
    try {
      const { data } = await studioApi.post("/studio/design/ai-generate", { prompt: aiPrompt.trim() });
      setAiImages(data.images || []);
      setAiRights(data.rights_remaining);
      toast.success("3 alternatif üretildi · 1 tasarım hakkı kullanıldı");
    } catch (err) {
      const st = err?.response?.status;
      if (st === 401) { toast.error("AI için Stüdyo Paneli hesabınızla giriş yapın"); setAiRights(null); }
      else if (st === 402) toast.error(formatApiError(err, "Tasarım hakkınız bitti"));
      else toast.error(formatApiError(err, "AI üretimi başarısız"));
    } finally {
      setAiBusy(false);
    }
  };

  const addAiBackground = async (imgUrl) => {
    const fc = fcRef.current; if (!fc) return;
    try {
      const url = `${process.env.REACT_APP_BACKEND_URL}${imgUrl}`;
      const img = await fabric.FabricImage.fromURL(url, { crossOrigin: "anonymous" });
      const { w, h } = designRef.current;
      const scale = Math.max(w / img.width, h / img.height);
      img.set({ originX: "center", originY: "center", left: w / 2, top: h / 2, scaleX: scale, scaleY: scale });
      fc.add(img);
      fc.sendObjectToBack(img);
      fc.requestRenderAll();
      setAiOpen(false);
      toast.success("Arka plan tuvale eklendi. Üstüne metin/{isim} ekleyebilirsiniz.");
    } catch {
      toast.error("Görsel eklenemedi");
    }
  };

  return (
    <div data-testid="design-studio-page" className="fixed inset-0 flex flex-col bg-neutral-100 text-neutral-900">
      {/* Header */}
      <header className="flex items-center gap-2 px-3 py-2 bg-white border-b border-neutral-200 shrink-0">
        <Link to="/" className="p-2 rounded-lg hover:bg-neutral-100" data-testid="ds-back"><ArrowLeft size={18} /></Link>
        <Input
          data-testid="ds-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-9 max-w-[46vw] sm:max-w-xs text-sm font-medium"
        />
        <div className="ml-auto flex items-center gap-2">
          <Dialog open={tplOpen} onOpenChange={setTplOpen}>
            <DialogTrigger asChild>
              <Button data-testid="ds-templates-btn" variant="outline" size="sm" className="gap-1.5">
                <LayoutTemplate size={16} /><span className="hidden sm:inline">Şablonlar</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl text-neutral-900">
              <DialogHeader><DialogTitle>Şablon Seç</DialogTitle>
                <DialogDescription>Hazır bir düzenle başla veya boş tuval seç.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    data-testid={`template-card-${t.id}`}
                    onClick={() => loadTemplate(t)}
                    className="rounded-xl overflow-hidden border border-neutral-200 hover:border-amber-400 transition-colors group"
                  >
                    <div className="aspect-[4/5] flex items-center justify-center text-xs text-white/80"
                      style={{ background: t.thumb_bg || "#eee" }}>
                      {t.objects?.length ? "Örnek düzen" : "Boş"}
                    </div>
                    <div className="px-2 py-1.5 text-xs font-medium text-left">{t.name}</div>
                  </button>
                ))}
              </div>
            </DialogContent>
          </Dialog>
          <Button data-testid="ds-export-btn" variant="outline" size="sm" className="gap-1.5" onClick={exportPng}>
            <Download size={16} /><span className="hidden sm:inline">İndir</span>
          </Button>
          <Button data-testid="ds-save-btn" size="sm" className="gap-1.5 bg-neutral-900 hover:bg-neutral-800" onClick={doSave} disabled={saving}>
            <Save size={16} />{saving ? "..." : "Kaydet"}
          </Button>
        </div>
      </header>

      {/* Add toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-neutral-200 overflow-x-auto shrink-0">
        <Tool testid="ds-add-text" icon={Type} label="Metin" onClick={() => addText(false)} />
        <Tool testid="ds-add-heading" icon={Heading} label="Başlık" onClick={() => addText(true)} />
        <Tool testid="ds-add-rect" icon={Square} label="Kutu" onClick={() => addShape("rect")} />
        <Tool testid="ds-add-circle" icon={CircleIcon} label="Daire" onClick={() => addShape("circle")} />
        <Tool testid="ds-add-line" icon={Minus} label="Çizgi" onClick={() => addShape("line")} />
        <Tool testid="ds-add-image" icon={ImageIcon} label="Görsel" onClick={() => fileInputRef.current?.click()} />
        <Tool testid="ds-add-personalize" icon={UserSquare} label="{isim}" onClick={addPersonalize} accent />
        <Tool testid="ds-ai-btn" icon={Sparkles} label="AI Tasarla" onClick={() => openAi(true)} accent />
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={uploadImage} />
      </div>

      {/* AI Design dialog (Tasarım Hakkı → Nano Banana) */}
      <Dialog open={aiOpen} onOpenChange={openAi}>
        <DialogContent data-testid="ai-design-dialog" className="max-w-2xl text-neutral-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wand2 size={18} className="text-amber-500" /> AI ile Davetiye Tasarla</DialogTitle>
            <DialogDescription>Tarif edin, Nano Banana yapay zekâsı 3 alternatif üretsin. Her üretim 1 tasarım hakkı kullanır.</DialogDescription>
          </DialogHeader>

          {aiRights === null ? (
            <div data-testid="ai-login-note" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              AI tasarım üretimi için <b>Stüdyo Paneli</b> hesabınızla giriş yapmalısınız.
              <div className="mt-3">
                <Button size="sm" onClick={() => window.open("/studyo", "_blank")} className="bg-amber-500 hover:bg-amber-600 text-white">
                  Stüdyo Paneli'ne Giriş Yap
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">Kalan Tasarım Hakkı</span>
                <span data-testid="ai-rights" className="font-semibold text-amber-600">
                  {aiRights === undefined ? "…" : `${aiRights} hak`}
                </span>
              </div>
              <Textarea
                data-testid="ai-prompt"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Örn. Zarif bir kına gecesi davetiyesi, bordo ve altın tonları, mum ve gül motifleri"
                rows={3}
                className="text-neutral-900"
              />
              <Button
                data-testid="ai-generate-btn"
                onClick={doAiGenerate}
                disabled={aiBusy || aiRights === 0}
                className="w-full gap-2 bg-gradient-to-r from-amber-400 to-amber-600 text-neutral-900 font-semibold hover:from-amber-300 hover:to-amber-500"
              >
                {aiBusy ? <><Loader2 size={18} className="animate-spin" /> Üretiliyor… (~20 sn)</> : <><Sparkles size={18} /> 3 Alternatif Üret (1 hak)</>}
              </Button>
              {aiRights === 0 && (
                <p className="text-xs text-red-500 text-center">Tasarım hakkınız bitti. Aşama 2'de PayTR ile yeni hak alabileceksiniz.</p>
              )}

              {aiImages.length > 0 && (
                <div>
                  <p className="text-xs text-neutral-500 mb-2">Birini seçin — tuvale arka plan olarak eklenir:</p>
                  <div className="grid grid-cols-3 gap-2">
                    {aiImages.map((im, i) => (
                      <button
                        key={im.id}
                        data-testid={`ai-result-${i}`}
                        onClick={() => addAiBackground(im.url)}
                        className="rounded-lg overflow-hidden border-2 border-transparent hover:border-amber-400 transition-colors aspect-[4/5]"
                      >
                        <img src={`${process.env.REACT_APP_BACKEND_URL}${im.url}`} alt={`Alternatif ${i + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Canvas */}
      <div ref={wrapRef} className="flex-1 min-h-0 flex items-center justify-center overflow-hidden p-3">
        <div className="shadow-2xl bg-white"><canvas ref={canvasElRef} /></div>
      </div>

      {/* Sample name (personalization preview) */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-t border-neutral-200 shrink-0">
        <span className="text-xs text-neutral-500 shrink-0">Örnek isim:</span>
        <Input
          data-testid="ds-sample-name"
          value={sampleName}
          placeholder="Örn. Ahmet Yılmaz"
          onChange={(e) => applySample(e.target.value)}
          className="h-8 max-w-[40vw] text-sm"
        />
        <div className="ml-auto flex items-center gap-2 text-xs text-neutral-500">
          <ZoomIn size={14} /><span data-testid="ds-zoom">{zoomPct}%</span>
        </div>
      </div>

      {/* Property panel (bottom sheet) */}
      {sel && (
        <div data-testid="ds-property-panel" className="bg-white border-t border-neutral-200 px-3 py-3 shrink-0 space-y-3">
          {sel.isText && (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={sel.fontFamily} onValueChange={changeFont}>
                <SelectTrigger data-testid="ds-font-select" className="h-9 w-44 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {fonts.map((f) => (
                    <SelectItem key={f.family} value={f.family} style={{ fontFamily: f.family }}>{f.family}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 w-40">
                <span className="text-xs text-neutral-500">Boyut</span>
                <Slider data-testid="ds-fontsize" min={12} max={220} step={2} value={[sel.fontSize || 44]}
                  onValueChange={([v]) => setProp({ fontSize: v, baseFontSize: v })} />
              </div>
              <IconToggle testid="ds-bold" active={sel.fontWeight === "bold"} icon={Bold}
                onClick={() => setProp({ fontWeight: sel.fontWeight === "bold" ? "normal" : "bold" })} />
              <IconToggle testid="ds-italic" active={sel.fontStyle === "italic"} icon={Italic}
                onClick={() => setProp({ fontStyle: sel.fontStyle === "italic" ? "normal" : "italic" })} />
              <IconToggle testid="ds-align-left" active={sel.textAlign === "left"} icon={AlignLeft} onClick={() => setProp({ textAlign: "left" })} />
              <IconToggle testid="ds-align-center" active={sel.textAlign === "center"} icon={AlignCenter} onClick={() => setProp({ textAlign: "center" })} />
              <IconToggle testid="ds-align-right" active={sel.textAlign === "right"} icon={AlignRight} onClick={() => setProp({ textAlign: "right" })} />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-neutral-500">
              Renk
              <input data-testid="ds-color" type="color" value={toHexColor(sel.fill)}
                onChange={(e) => setProp({ fill: e.target.value })} className="w-8 h-8 rounded cursor-pointer border border-neutral-200" />
            </label>
            <Button data-testid="ds-layer-up" variant="outline" size="sm" className="gap-1" onClick={() => layer("up")}><ArrowUp size={14} />Öne</Button>
            <Button data-testid="ds-layer-down" variant="outline" size="sm" className="gap-1" onClick={() => layer("down")}><ArrowDown size={14} />Arka</Button>
            <Button data-testid="ds-duplicate" variant="outline" size="sm" className="gap-1" onClick={duplicate}><Copy size={14} />Kopyala</Button>
            <Button data-testid="ds-delete" variant="destructive" size="sm" className="gap-1 ml-auto" onClick={removeSel}><Trash2 size={14} />Sil</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Tool({ testid, icon: Icon, label, onClick, accent }) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      className={`shrink-0 flex flex-col items-center justify-center gap-1 w-16 h-16 rounded-xl border text-[11px] font-medium transition-colors ${
        accent ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
               : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
      }`}
    >
      <Icon size={20} /><span>{label}</span>
    </button>
  );
}

function IconToggle({ testid, active, icon: Icon, onClick }) {
  return (
    <button data-testid={testid} onClick={onClick}
      className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors ${
        active ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100"
      }`}>
      <Icon size={16} />
    </button>
  );
}
