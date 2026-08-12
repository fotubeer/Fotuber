import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as fabric from "fabric";
import JSZip from "jszip";
import { toast } from "sonner";
import {
  Type, Heading, Square, Circle as CircleIcon, Minus, Image as ImageIcon,
  UserSquare, Save, Download, LayoutTemplate, Trash2, Copy, ArrowUp, ArrowDown,
  Bold, Italic, AlignLeft, AlignCenter, AlignRight, ArrowLeft, ZoomIn,
  Sparkles, Loader2, Wand2, Users, ShoppingCart, RefreshCw, Star, Printer, Smile, Check,
  Undo2, Redo2, Triangle, Heart,
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
import { printImageSheet } from "@/lib/printImage";

const DEFAULT_W = 1080;
const DEFAULT_H = 1350;

// Matbaa baskı ölçüleri (mm) — açıklamalı, kullanıcı boyutu anlasın diye.
const PRINT_SIZES = [
  { key: "13x18", w: 130, h: 180, label: "13 × 18 cm", desc: "En garanti, klasik boyut; her zarfa ve ortama uyar." },
  { key: "10x21", w: 100, h: 210, label: "10 × 21 cm (DL / Diplomat)", desc: "Modern, zarif, ince; minimalist tasarımlar için ideal." },
  { key: "15x15", w: 150, h: 150, label: "15 × 15 cm (Kare)", desc: "Şık, dikkat çekici; lüks/konsept düğünler için." },
  { key: "148x210", w: 148, h: 210, label: "A5 · 14.8 × 21 cm", desc: "A4'ün yarısı; harita/uzun metin/program için geniş." },
  { key: "105x148", w: 105, h: 148, label: "A6 · 10.5 × 14.8 cm", desc: "Küçük, ekonomik; sade nikah/söz davetiyeleri." },
  { key: "15x22", w: 150, h: 220, label: "15 × 22 cm", desc: "Geleneksel dikey dikdörtgen alternatifi." },
  { key: "12x17", w: 120, h: 170, label: "12 × 17 cm", desc: "Geleneksel matbaa kesimi alternatifi." },
  { key: "custom", w: 0, h: 0, label: "Özel (mm gir)", desc: "Kendi ölçünüzü mm cinsinden girin." },
];
const BLEED_MM = 3;

// Categorized symbol/emoji library for the design canvas.
const SYMBOL_LIBRARY = [
  { cat: "Kalpler", items: ["❤", "♥", "💕", "💖", "💗", "💘", "💝", "♡", "❥", "💞", "💓", "💟", "❣", "🫶", "💐"] },
  { cat: "Çiçek & Yaprak", items: ["🌸", "🌷", "🌹", "🌺", "🌼", "💐", "🍃", "🌿", "❀", "✿", "🌻", "🏵", "☘", "🍀", "🌾"] },
  { cat: "Düğün & Yüzük", items: ["💍", "👰", "🤵", "💒", "🕊", "🥂", "🍾", "🎊", "🎉", "🔔", "💌", "👑", "🎀", "🪄", "🗝"] },
  { cat: "Yıldız & Işıltı", items: ["★", "☆", "✦", "✧", "✨", "⭐", "🌟", "❋", "❃", "✩", "✫", "✬", "✭", "❇", "⁂"] },
  { cat: "Geometrik & Çerçeve", items: ["◆", "◇", "❖", "▲", "△", "●", "○", "⬥", "⟡", "⌘", "■", "□", "▰", "▱", "⬦", "⬨", "◈", "⧫"] },
  { cat: "Kına & Geleneksel", items: ["🌙", "☾", "☽", "۞", "❁", "☙", "❦", "⚜", "✤", "҂", "☪", "۩", "࿐", "❂", "⁕"] },
  { cat: "Doğum Günü & Kutlama", items: ["🎂", "🎈", "🎁", "🎉", "🎊", "🧁", "🍰", "🎆", "🎇", "🪅", "🎠", "🎪", "🥳", "🍭", "🎵"] },
  { cat: "Ok & Ayraç", items: ["➳", "➵", "❯", "❮", "»", "«", "➺", "➻", "⤜", "⤛", "─", "━", "┈", "⸻", "❧"] },
];

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
  const histRef = useRef([]);
  const histIdxRef = useRef(-1);
  const restoringRef = useRef(false);
  const histTimerRef = useRef(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const snapshot = () => {
    const fc = fcRef.current;
    if (!fc || restoringRef.current) return;
    if (histTimerRef.current) clearTimeout(histTimerRef.current);
    histTimerRef.current = setTimeout(() => {
      try {
        const json = JSON.stringify(fc.toJSON());
        const h = histRef.current.slice(0, histIdxRef.current + 1);
        if (h[h.length - 1] === json) return;
        h.push(json);
        while (h.length > 40) h.shift();
        histRef.current = h;
        histIdxRef.current = h.length - 1;
        setCanUndo(histIdxRef.current > 0);
        setCanRedo(false);
      } catch { /* ignore */ }
    }, 250);
  };
  const restoreHist = async (idx) => {
    const fc = fcRef.current;
    const json = histRef.current[idx];
    if (!fc || json == null) return;
    restoringRef.current = true;
    try {
      await fc.loadFromJSON(JSON.parse(json));
      fc.requestRenderAll();
    } finally {
      restoringRef.current = false;
      histIdxRef.current = idx;
      setCanUndo(idx > 0);
      setCanRedo(idx < histRef.current.length - 1);
      setSel(null);
    }
  };
  const undo = () => { if (histIdxRef.current > 0) restoreHist(histIdxRef.current - 1); };
  const redo = () => { if (histIdxRef.current < histRef.current.length - 1) restoreHist(histIdxRef.current + 1); };

  const designRef = useRef({ w: DEFAULT_W, h: DEFAULT_H });
  const fileInputRef = useRef(null);

  const [fonts, setFonts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [aiPresets, setAiPresets] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [sel, setSel] = useState(null); // active object snapshot
  const [title, setTitle] = useState("İsimsiz Tasarım");
  const [projectId, setProjectId] = useState(null);
  const [autosavedAt, setAutosavedAt] = useState(null);
  const [symbolPickerOpen, setSymbolPickerOpen] = useState(false);
  const dirtyRef = useRef(false);
  const doSaveRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [zoomPct, setZoomPct] = useState(100);
  const [tplOpen, setTplOpen] = useState(false);
  const [previewTpl, setPreviewTpl] = useState(null);
  const [sampleName, setSampleName] = useState("");

  // AI design (Tasarım Hakkı → Nano Banana)
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiMode, setAiMode] = useState("ready"); // "template" (arka plan) | "ready" (hazır davetiye)
  const [aiCouple, setAiCouple] = useState("");
  const [aiDate, setAiDate] = useState("");
  const [aiVenue, setAiVenue] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiImages, setAiImages] = useState([]);
  const [aiRights, setAiRights] = useState(undefined); // undefined=checking, null=not logged in, number=rights
  // buy rights / revise / bulk
  const [aiBuyOpen, setAiBuyOpen] = useState(false);
  const [aiPackages, setAiPackages] = useState([]);
  const [aiBuying, setAiBuying] = useState(null);
  const [reviseFor, setReviseFor] = useState(null);
  const [reviseText, setReviseText] = useState("");
  const [reviseBusy, setReviseBusy] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkNames, setBulkNames] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [printCap, setPrintCap] = useState(null);
  const [printSize, setPrintSize] = useState("13x18");
  const [customW, setCustomW] = useState("");
  const [customH, setCustomH] = useState("");
  const [bulkOutput, setBulkOutput] = useState("single"); // single | zip
  const [bulkPkgs, setBulkPkgs] = useState(null);
  const [bulkPkgBusy, setBulkPkgBusy] = useState(null);
  const loadPrintCap = async () => {
    try { setPrintCap((await api.get("/design/print-capacity")).data); } catch { setPrintCap(null); }
    try {
      const { data } = await studioApi.get("/studio/design/bulk-print-packages");
      setBulkPkgs(data.packages || []);
    } catch { setBulkPkgs([]); }
  };
  const [aiFavs, setAiFavs] = useState([]);

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
    if (tpl.bg_image) {
      try {
        const bg = await fabric.FabricImage.fromURL(tpl.bg_image, { crossOrigin: "anonymous" });
        const scale = Math.max(tpl.width / bg.width, tpl.height / bg.height);
        bg.set({ originX: "center", originY: "center", left: tpl.width / 2, top: tpl.height / 2, scaleX: scale, scaleY: scale });
        fc.add(bg);
        fc.sendObjectToBack(bg);
      } catch { /* ignore bg image failure */ }
    }
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
    ["object:modified", "object:added", "object:removed", "text:changed"].forEach((ev) =>
      fc.on(ev, () => { dirtyRef.current = true; snapshot(); }));

    // Keyboard shortcuts: undo/redo/delete
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      const editing = tag === "input" || tag === "textarea" || fc.getActiveObject()?.isEditing;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault(); if (e.shiftKey) redo(); else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault(); redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && !editing) {
        const o = fc.getActiveObject(); if (o) { e.preventDefault(); fc.remove(o); fc.discardActiveObject(); fc.requestRenderAll(); setSel(null); }
      }
    };
    window.addEventListener("keydown", onKey);

    let cancelled = false;
    Promise.all([
      api.get("/design/fonts").then((r) => r.data.fonts).catch(() => []),
      api.get("/design/templates").then((r) => r.data.templates).catch(() => []),
      api.get("/design/ai-presets").then((r) => r.data.presets).catch(() => []),
      api.get("/design/favorites").then((r) => r.data.favorites).catch(() => []),
    ]).then(([fnts, tpls, presets, favs]) => {
      if (cancelled) return;
      setFonts(fnts);
      setTemplates(tpls);
      setAiPresets(presets);
      setFavorites(favs || []);
      const blank = tpls.find((t) => t.id === "blank-portrait") || tpls[0];
      if (blank) loadTemplate(blank);
      else fitCanvas();
    });

    const onResize = () => fitCanvas();
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
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
    const L = centerLeft(), T = centerTop();
    if (kind === "rect") obj = new fabric.Rect({ left: L, top: T, width: 300, height: 200, fill: "#e8c27a", rx: 0, ry: 0 });
    else if (kind === "roundrect") obj = new fabric.Rect({ left: L, top: T, width: 320, height: 200, fill: "#e8c27a", rx: 40, ry: 40 });
    else if (kind === "circle") obj = new fabric.Circle({ left: L, top: T, radius: 130, fill: "#8a4b52" });
    else if (kind === "triangle") obj = new fabric.Triangle({ left: L, top: T, width: 260, height: 230, fill: "#8a4b52" });
    else if (kind === "star") {
      const pts = []; const spikes = 5, outer = 150, inner = 62;
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outer : inner; const a = (Math.PI / spikes) * i - Math.PI / 2;
        pts.push({ x: outer + r * Math.cos(a), y: outer + r * Math.sin(a) });
      }
      obj = new fabric.Polygon(pts, { left: L, top: T, fill: "#e8c27a" });
    } else if (kind === "heart") {
      obj = new fabric.Path("M 272 128 C 272 76 232 40 184 40 C 152 40 128 56 116 80 C 104 56 80 40 48 40 C 0 40 -40 76 -40 128 C -40 200 40 260 116 312 C 192 260 272 200 272 128 z",
        { left: L, top: T, fill: "#c0392b", scaleX: 0.7, scaleY: 0.7 });
    } else if (kind === "diamond") {
      obj = new fabric.Polygon([{ x: 130, y: 0 }, { x: 260, y: 150 }, { x: 130, y: 300 }, { x: 0, y: 150 }],
        { left: L, top: T, fill: "#8a4b52" });
    } else obj = new fabric.Line([0, 0, 360, 0], { left: L, top: T + 80, stroke: "#111", strokeWidth: 6 });
    fc.add(obj); fc.setActiveObject(obj); fc.requestRenderAll(); readSel();
  };

  // ---- AI ready-invitation text overlay --------------------------------


  const addSymbol = (ch) => {
    const fc = fcRef.current; if (!fc) return;
    const tb = new fabric.Textbox(ch, {
      left: centerLeft() + 160, top: centerTop(), fontSize: 120,
      fontFamily: "Arial", fill: "#8a4b52", textAlign: "center",
      width: 160, editable: false,
    });
    fc.add(tb); fc.setActiveObject(tb); fc.requestRenderAll(); readSel();
    setSymbolPickerOpen(false);
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
  const applyNameToCanvas = (name) => {
    const fc = fcRef.current;
    if (!fc) return false;
    let found = false;
    fc.getObjects().forEach((o) => {
      if (!o.personalize) return;
      found = true;
      const text = (name || "").trim() || "{isim}";
      const base = o.baseFontSize || o.fontSize;
      let fs = base;
      o.set({ text, fontSize: fs, width: o.boxWidth || o.width });
      o.initDimensions && o.initDimensions();
      let guard = 0;
      while (o.width && o.__lineWidths && Math.max(...o.__lineWidths) > (o.boxWidth || o.width) && fs > 18 && guard < 60) {
        fs -= 3; o.set({ fontSize: fs }); o.initDimensions && o.initDimensions(); guard++;
      }
    });
    fc.requestRenderAll();
    return found;
  };
  const applySample = (name) => { setSampleName(name); applyNameToCanvas(name); };

  const toggleFavorite = async (templateId, e) => {
    e?.stopPropagation?.();
    const isFav = favorites.includes(templateId);
    setFavorites((f) => isFav ? f.filter((x) => x !== templateId) : [...f, templateId]);
    try {
      if (isFav) await api.delete(`/design/favorites/${templateId}`);
      else await api.post(`/design/favorites/${templateId}`);
    } catch (err) {
      setFavorites((f) => isFav ? [...f, templateId] : f.filter((x) => x !== templateId));
      if (err?.response?.status === 401) toast.error("Favorilere eklemek için üye girişi gerekli");
      else toast.error("İşlem başarısız");
    }
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
  const doSave = async (silent = false) => {
    const fc = fcRef.current; if (!fc) return;
    if (!silent) setSaving(true);
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
      if (silent) setAutosavedAt(Date.now());
      else toast.success("Tasarım kaydedildi");
    } catch (err) {
      if (silent) return; // autosave stays quiet (e.g. not logged in yet)
      if (err?.response?.status === 401) {
        toast.error("Kaydetmek için üye girişi gerekli");
        navigate("/giris");
      } else toast.error(formatApiError(err, "Kaydedilemedi"));
    } finally {
      if (!silent) setSaving(false);
    }
  };
  doSaveRef.current = doSave;

  // Auto-save every 12s when the canvas is dirty (silent).
  useEffect(() => {
    const t = setInterval(() => {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        doSaveRef.current && doSaveRef.current(true);
      }
    }, 12000);
    return () => clearInterval(t);
  }, []);

  const exportPng = () => {
    const fc = fcRef.current; if (!fc) return;
    const scale = fc.__displayScale || 1;
    const url = fc.toDataURL({ format: "png", multiplier: 1 / scale });
    const a = document.createElement("a");
    a.href = url; a.download = `${title || "davetiye"}.png`; a.click();
  };

  const quickPrint = () => {
    const fc = fcRef.current; if (!fc) return;
    const scale = fc.__displayScale || 1;
    const url = fc.toDataURL({ format: "png", multiplier: 1 / scale });
    const ok = printImageSheet(url, { title: title || "Davetiye" });
    if (!ok) { toast.error("Baskı penceresi açılamadı — açılır pencere iznini verin"); return; }
    toast.success("Baskı penceresi açıldı");
  };

  // ---- AI design (Tasarım Hakkı) ---------------------------------------
  const openAi = async (open) => {
    setAiOpen(open);
    if (!open) return;
    setAiRights(undefined);
    try {
      const { data } = await studioApi.get("/studio/me");
      setAiRights(data.account.design_rights ?? 0);
      studioApi.get("/studio/design/ai-favorites").then((r) => setAiFavs(r.data.favorites || [])).catch(() => {});
    } catch {
      setAiRights(null); // not logged into studio
    }
  };

  const isAiFav = (assetId) => aiFavs.some((f) => f.asset_id === assetId);
  const toggleAiFav = async (im) => {
    const fav = isAiFav(im.id);
    try {
      if (fav) {
        await studioApi.delete(`/studio/design/ai-favorites/${im.id}`);
        setAiFavs((f) => f.filter((x) => x.asset_id !== im.id));
      } else {
        await studioApi.post(`/studio/design/ai-favorites/${im.id}`);
        setAiFavs((f) => [{ asset_id: im.id, url: im.url, prompt: "" }, ...f]);
        toast.success("Arka plan favorilere kaydedildi");
      }
    } catch { toast.error("İşlem başarısız"); }
  };

  const doAiGenerate = async (promptOverride) => {
    const p = (promptOverride ?? aiPrompt).trim();
    if (!p) { toast.error("Lütfen tasarımınızı tarif edin"); return; }
    setAiBusy(true); setAiImages([]);
    try {
      const { data } = await studioApi.post("/studio/design/ai-generate", { prompt: p });
      setAiImages(data.images || []);
      setAiRights(data.rights_remaining);
      toast.success("3 alternatif üretildi · 1 tasarım hakkı kullanıldı");
    } catch (err) {
      const st = err?.response?.status;
      if (st === 401) { toast.error("AI için üyelik girişi yapın"); setAiRights(null); }
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
      // "Hazır Davetiye" modu: arka planın üstüne çift ismi + tarih + mekân yerleştir
      if (aiMode === "ready") {
        const { w, h } = designRef.current;
        const couple = (aiCouple || "İsim & İsim").trim();
        const mkText = (txt, top, opts) => {
          const tb = new fabric.Textbox(txt, {
            left: w / 2, top, width: w * 0.82, textAlign: "center",
            originX: "center", originY: "center", fill: "#ffffff",
            shadow: new fabric.Shadow({ color: "rgba(0,0,0,0.45)", blur: 12, offsetX: 0, offsetY: 2 }),
            ...opts,
          });
          loadGoogleFont(tb.fontFamily).then(() => fc.requestRenderAll());
          fc.add(tb);
        };
        mkText(couple, h * 0.42, { fontSize: 118, fontFamily: "Great Vibes" });
        if ((aiDate || "").trim()) mkText(aiDate.trim(), h * 0.60, { fontSize: 46, fontFamily: "Playfair Display" });
        if ((aiVenue || "").trim()) mkText(aiVenue.trim(), h * 0.67, { fontSize: 34, fontFamily: "Montserrat" });
        toast.success("Hazır davetiye oluşturuldu · metinleri düzenleyebilirsiniz");
      } else {
        toast.success("Arka plan tuvale eklendi. Üstüne metin/{isim} ekleyebilirsiniz.");
      }
      fc.requestRenderAll();
      setAiOpen(false);
    } catch {
      toast.error("Görsel eklenemedi");
    }
  };

  // ---- Buy design rights (PayTR) ---------------------------------------
  const openBuy = async () => {
    setAiBuyOpen(true);
    setAiPackages(null);
    try {
      const { data } = await studioApi.get("/studio/design/rights-packages");
      setAiPackages(data.packages || []);
      setAiRights(data.design_rights);
    } catch {
      setAiPackages([]);
      setAiRights(null);
    }
  };

  const pollStudioPayment = (cid) => {
    const started = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - started > 5 * 60 * 1000) { clearInterval(timer); return; }
      try {
        const { data } = await studioApi.get(`/studio/payments/status/${cid}`);
        if (data.status === "paid") {
          clearInterval(timer);
          setAiRights(data.design_rights);
          setAiBuying(null);
          setAiBuyOpen(false);
          toast.success("Ödeme alındı! Tasarım haklarınız yüklendi.");
        }
      } catch {}
    }, 3000);
  };

  const buyPackage = async (pkg) => {
    setAiBuying(pkg.id);
    try {
      const { data } = await studioApi.post("/studio/payments/design-rights/create", {
        package_id: pkg.id, origin_url: window.location.origin,
      });
      window.open(data.link, "_blank");
      toast.info("Ödeme sayfası açıldı. Ödeme sonrası haklar otomatik yüklenir.");
      pollStudioPayment(data.callback_id);
    } catch (err) {
      toast.error(formatApiError(err, "Ödeme başlatılamadı"));
      setAiBuying(null);
    }
  };

  // ---- AI revise (revize) ----------------------------------------------
  const doRevise = async (assetId) => {
    if (!reviseText.trim()) { toast.error("Revize isteğinizi yazın"); return; }
    setReviseBusy(true);
    try {
      const { data } = await studioApi.post("/studio/design/ai-edit", {
        asset_id: assetId, instruction: reviseText.trim(),
      });
      setAiImages((prev) => [data.image, ...prev]);
      setAiRights(data.rights_remaining);
      setReviseFor(null); setReviseText("");
      toast.success("Revize edildi · 1 tasarım hakkı kullanıldı");
    } catch (err) {
      const st = err?.response?.status;
      if (st === 402) toast.error(formatApiError(err, "Tasarım hakkınız bitti"));
      else toast.error(formatApiError(err, "Revize başarısız"));
    } finally {
      setReviseBusy(false);
    }
  };

  // ---- Bulk personalization (client-side render + ZIP) -----------------
  const parseBulkNames = (raw) =>
    (raw || "").split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).slice(0, 200);

  const onBulkCsv = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const text = await file.text();
    setBulkNames((prev) => (prev ? prev + "\n" : "") + text);
  };

  const _imgFromDataUrl = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });

  // Render current canvas (with the applied name) to a print-ready page image:
  // page = trim + 2*bleed at 300 DPI, design "cover"-fit so it bleeds off every
  // edge → no white borders / shifting when the print house cuts at the trim.
  const _renderPageImage = async (wmm, hmm, bleed) => {
    const fc = fcRef.current;
    const scale = fc.__displayScale || 1;
    const src = fc.toDataURL({ format: "png", multiplier: 1 / scale });
    const img = await _imgFromDataUrl(src);
    const pxW = Math.round((wmm + 2 * bleed) / 25.4 * 300);
    const pxH = Math.round((hmm + 2 * bleed) / 25.4 * 300);
    const cv = document.createElement("canvas");
    cv.width = pxW; cv.height = pxH;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, pxW, pxH);
    const s = Math.max(pxW / img.width, pxH / img.height);
    const dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, (pxW - dw) / 2, (pxH - dh) / 2, dw, dh);
    return cv.toDataURL("image/jpeg", 0.92).split(",")[1];
  };

  const pollBulkPayment = (cid) => {
    const started = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - started > 5 * 60 * 1000) { clearInterval(timer); return; }
      try {
        const { data } = await studioApi.get(`/studio/payments/status/${cid}`);
        if (data.status === "paid") {
          clearInterval(timer);
          setBulkPkgBusy(null);
          setPrintCap((p) => ({ ...(p || {}), capacity: data.print_capacity, remaining: data.print_remaining }));
          setAiRights(data.design_rights);
          toast.success("Ödeme alındı! Baskı kapasiteniz ve AI krediniz yüklendi.");
        }
      } catch {}
    }, 3000);
  };
  const buyBulkPkg = async (pkg) => {
    setBulkPkgBusy(pkg.id);
    try {
      const { data } = await studioApi.post("/studio/payments/bulk-print/create", { package_id: pkg.id, origin_url: window.location.origin });
      window.open(data.link, "_blank");
      toast.info("Ödeme sayfası açıldı. Ödeme sonrası kapasite otomatik yüklenir.");
      pollBulkPayment(data.callback_id);
    } catch (err) {
      toast.error(formatApiError(err, "Ödeme başlatılamadı"));
      setBulkPkgBusy(null);
    }
  };

  const doBulkGenerate = async () => {
    const fc = fcRef.current; if (!fc) return;
    const names = parseBulkNames(bulkNames);
    if (names.length === 0) { toast.error("En az bir isim girin"); return; }
    if (!fc.getObjects().some((o) => o.personalize)) {
      toast.error("Önce tuvale {isim} kişiselleştirme alanı ekleyin");
      return;
    }
    const size = PRINT_SIZES.find((s) => s.key === printSize) || PRINT_SIZES[0];
    let wmm = size.w, hmm = size.h;
    if (printSize === "custom") {
      wmm = parseFloat(customW) || 0; hmm = parseFloat(customH) || 0;
      if (wmm < 40 || hmm < 40 || wmm > 500 || hmm > 500) { toast.error("Geçerli ölçü girin (40–500 mm)"); return; }
    }
    // Enforce purchased personalized-print capacity
    try {
      const { data } = await api.post("/design/print-consume", { count: names.length });
      setPrintCap((p) => ({ ...(p || {}), used: data.used, remaining: data.remaining, capacity: data.capacity }));
    } catch (err) {
      if (err?.response?.status === 402) {
        toast.error(err.response.data.detail.replace("[CAPACITY]", "").trim(), { duration: 7000 });
      } else if (err?.response?.status === 401) {
        toast.error("Toplu baskı için üye girişi gerekli"); navigate("/giris");
      } else {
        toast.error(formatApiError(err, "Kapasite kontrolü başarısız"));
      }
      return;
    }
    setBulkBusy(true); setBulkProgress(0);
    const savedName = sampleName;
    try {
      const images = [];
      for (let i = 0; i < names.length; i++) {
        applyNameToCanvas(names[i]);
        await new Promise((r) => setTimeout(r, 30));
        images.push(await _renderPageImage(wmm, hmm, BLEED_MM));
        setBulkProgress(Math.round(((i + 1) / names.length) * 90));
      }
      setBulkProgress(95);
      const { data: blob } = await api.post("/design/bulk-print-pdf",
        { images, width_mm: wmm, height_mm: hmm, bleed_mm: BLEED_MM, mode: bulkOutput, title },
        { responseType: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = bulkOutput === "single" ? `${title || "davetiye"}-matbaa.pdf` : `${title || "davetiye"}-matbaa-pdf.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setBulkProgress(100);
      toast.success(`${names.length} matbaaya hazır davetiye (${size.key === "custom" ? `${wmm}×${hmm}mm` : size.label}, ${BLEED_MM}mm bleed) indirildi`);
      setBulkOpen(false);
    } catch (err) {
      toast.error("Toplu üretim başarısız");
    } finally {
      applyNameToCanvas(savedName);
      setBulkBusy(false);
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
            <DialogContent className="max-w-2xl text-neutral-900 max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Şablon Seç</DialogTitle>
                <DialogDescription>Kategoriye göre hazır bir düzenle başla veya boş tuval seç.</DialogDescription>
              </DialogHeader>
              {(favorites.length ? ["Favoriler", ...new Set(templates.map((t) => t.category || "Diğer"))] : [...new Set(templates.map((t) => t.category || "Diğer"))]).map((cat) => {
                const list = cat === "Favoriler"
                  ? templates.filter((t) => favorites.includes(t.id))
                  : templates.filter((t) => (t.category || "Diğer") === cat);
                if (list.length === 0) return null;
                return (
                  <div key={cat} className="mb-4">
                    <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                      {cat === "Favoriler" && <Star size={12} className="text-amber-500 fill-amber-500" />}{cat}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {list.map((t) => (
                        <div
                          key={`${cat}-${t.id}`}
                          data-testid={`template-card-${t.id}`}
                          onClick={() => setPreviewTpl(t)}
                          className="relative rounded-xl overflow-hidden border border-neutral-200 hover:border-amber-400 transition-colors text-left cursor-pointer"
                        >
                          <button
                            data-testid={`template-fav-${t.id}`}
                            onClick={(e) => toggleFavorite(t.id, e)}
                            className="absolute top-1.5 right-1.5 z-10 bg-black/40 hover:bg-black/60 rounded-full p-1.5"
                            title="Favori"
                          >
                            <Star size={14} className={favorites.includes(t.id) ? "text-amber-400 fill-amber-400" : "text-white"} />
                          </button>
                          <div className="aspect-[4/5] flex items-center justify-center text-xs text-white/80 bg-cover bg-center"
                            style={t.bg_image ? { backgroundImage: `url(${t.bg_image})` } : { background: t.thumb_bg || "#eee" }}>
                            {!t.bg_image && (t.objects?.length ? "Örnek düzen" : "Boş")}
                          </div>
                          <div className="px-2 py-1.5 text-xs font-medium">{t.name}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </DialogContent>
          </Dialog>
          <Button data-testid="ds-export-btn" variant="outline" size="sm" className="gap-1.5" onClick={exportPng}>
            <Download size={16} /><span className="hidden sm:inline">İndir</span>
          </Button>
          <Button data-testid="ds-print-btn" variant="outline" size="sm" className="gap-1.5" onClick={quickPrint}>
            <Printer size={16} /><span className="hidden sm:inline">Hızlı Baskı</span>
          </Button>
          <Button data-testid="ds-save-btn" size="sm" className="gap-1.5 bg-neutral-900 hover:bg-neutral-800" onClick={() => doSave(false)} disabled={saving}>
            <Save size={16} />{saving ? "..." : "Kaydet"}
          </Button>
          {autosavedAt && (
            <span data-testid="ds-autosave-indicator" className="hidden md:flex items-center gap-1 text-[11px] text-emerald-600">
              <Check size={12} /> Otomatik kaydedildi
            </span>
          )}
        </div>
      </header>

      {/* Add toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-neutral-200 overflow-x-auto shrink-0">
        <button data-testid="ds-undo" onClick={undo} disabled={!canUndo} title="Geri Al (Ctrl+Z)"
          className="shrink-0 grid place-items-center w-10 h-12 rounded-lg text-neutral-700 hover:bg-neutral-100 disabled:opacity-30"><Undo2 size={18} /></button>
        <button data-testid="ds-redo" onClick={redo} disabled={!canRedo} title="İleri Al (Ctrl+Y)"
          className="shrink-0 grid place-items-center w-10 h-12 rounded-lg text-neutral-700 hover:bg-neutral-100 disabled:opacity-30"><Redo2 size={18} /></button>
        <div className="w-px h-8 bg-neutral-200 shrink-0" />
        <Tool testid="ds-add-text" icon={Type} label="Metin" onClick={() => addText(false)} />
        <Tool testid="ds-add-heading" icon={Heading} label="Başlık" onClick={() => addText(true)} />
        <Tool testid="ds-add-rect" icon={Square} label="Kutu" onClick={() => addShape("rect")} />
        <Tool testid="ds-add-roundrect" icon={Square} label="Yumuşak" onClick={() => addShape("roundrect")} />
        <Tool testid="ds-add-circle" icon={CircleIcon} label="Daire" onClick={() => addShape("circle")} />
        <Tool testid="ds-add-triangle" icon={Triangle} label="Üçgen" onClick={() => addShape("triangle")} />
        <Tool testid="ds-add-star" icon={Star} label="Yıldız" onClick={() => addShape("star")} />
        <Tool testid="ds-add-heart" icon={Heart} label="Kalp" onClick={() => addShape("heart")} />
        <Tool testid="ds-add-diamond" icon={CircleIcon} label="Elmas" onClick={() => addShape("diamond")} />
        <Tool testid="ds-add-line" icon={Minus} label="Çizgi" onClick={() => addShape("line")} />
        <Tool testid="ds-add-symbol" icon={Smile} label="Sembol" onClick={() => setSymbolPickerOpen(true)} accent />
        <Tool testid="ds-add-image" icon={ImageIcon} label="Görsel" onClick={() => fileInputRef.current?.click()} />
        <Tool testid="ds-add-personalize" icon={UserSquare} label="{isim}" onClick={addPersonalize} accent />
        <Tool testid="ds-ai-btn" icon={Sparkles} label="AI Tasarla" onClick={() => openAi(true)} accent />
        <Tool testid="ds-bulk-btn" icon={Users} label="Toplu Üret" onClick={() => { setBulkOpen(true); loadPrintCap(); }} accent />
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={uploadImage} />
      </div>

      {/* Symbol / emoji library */}
      <Dialog open={symbolPickerOpen} onOpenChange={setSymbolPickerOpen}>
        <DialogContent className="max-w-lg text-neutral-900 max-h-[85vh] overflow-y-auto" data-testid="ds-symbol-dialog">
          <DialogHeader><DialogTitle>Sembol & Süsleme Ekle</DialogTitle>
            <DialogDescription>Bir kategoriden dokunarak tuvale ekleyin; sonra renk ve boyutu değiştirebilirsiniz.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {SYMBOL_LIBRARY.map((g) => (
              <div key={g.cat}>
                <div className="text-xs font-semibold text-neutral-500 mb-1.5">{g.cat}</div>
                <div className="grid grid-cols-8 gap-1.5">
                  {g.items.map((ch, i) => (
                    <button key={i} data-testid={`ds-symbol-${g.cat}-${i}`} onClick={() => addSymbol(ch)}
                      className="h-10 rounded-lg border border-neutral-200 hover:bg-rose-50 hover:border-rose-300 text-xl flex items-center justify-center">
                      {ch}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Design dialog (Tasarım Hakkı → Nano Banana) */}
      <Dialog open={aiOpen} onOpenChange={openAi}>
        <DialogContent data-testid="ai-design-dialog" className="max-w-2xl text-neutral-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wand2 size={18} className="text-amber-500" /> AI ile Davetiye Tasarla</DialogTitle>
            <DialogDescription>Tarif edin, Nano Banana yapay zekâsı 3 alternatif üretsin. Her üretim 1 tasarım hakkı kullanır.</DialogDescription>
          </DialogHeader>

          {aiRights === null ? (
            <div data-testid="ai-login-note" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              AI tasarım ve isme özel özellikler ücretlidir. Kullanmak için <b>üyelik girişi</b> yapın; ardından tasarım hakkı satın alabilirsiniz.
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => navigate("/giris")} className="bg-amber-500 hover:bg-amber-600 text-white">
                  Üye Girişi / Kayıt Ol
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">Kalan Tasarım Hakkı</span>
                <div className="flex items-center gap-2">
                  <span data-testid="ai-rights" className="font-semibold text-amber-600">
                    {aiRights === undefined ? "…" : `${aiRights} hak`}
                  </span>
                  <Button data-testid="ai-buy-btn" size="sm" variant="outline" className="h-7 gap-1 text-xs"
                    onClick={openBuy}><ShoppingCart size={13} /> Hak Satın Al</Button>
                </div>
              </div>
              <Textarea
                data-testid="ai-prompt"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Örn. Zarif bir kına gecesi davetiyesi, bordo ve altın tonları, mum ve gül motifleri"
                rows={3}
                className="text-neutral-900"
              />
              {/* Çıktı türü: Sadece Şablon (arka plan) veya Hazır Davetiye */}
              <div>
                <p className="text-[11px] text-neutral-500 mb-1.5">Çıktı türü</p>
                <div className="grid grid-cols-2 gap-2" data-testid="ai-mode">
                  {[
                    { k: "template", t: "Sadece Şablon", d: "AI arka plan üretir" },
                    { k: "ready", t: "Hazır Davetiye", d: "İsim + tarih + mekân eklenir" },
                  ].map((m) => (
                    <button key={m.k} type="button" data-testid={`ai-mode-${m.k}`}
                      onClick={() => setAiMode(m.k)}
                      className={`text-left rounded-xl border p-2.5 transition-all ${aiMode === m.k ? "border-amber-500 ring-2 ring-amber-200 bg-amber-50" : "border-neutral-200 hover:border-neutral-300"}`}>
                      <div className="text-sm font-semibold text-neutral-800 flex items-center gap-1">{m.t}{aiMode === m.k && <Check size={13} className="text-amber-600" />}</div>
                      <div className="text-[10px] text-neutral-500">{m.d}</div>
                    </button>
                  ))}
                </div>
              </div>
              {aiMode === "ready" && (
                <div className="grid grid-cols-1 gap-2" data-testid="ai-ready-fields">
                  <Input data-testid="ai-couple" value={aiCouple} onChange={(e) => setAiCouple(e.target.value)} placeholder="Çift ismi (örn. Elif & Mert)" className="text-neutral-900" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input data-testid="ai-date" value={aiDate} onChange={(e) => setAiDate(e.target.value)} placeholder="Tarih (örn. 12 Eylül 2026)" className="text-neutral-900" />
                    <Input data-testid="ai-venue" value={aiVenue} onChange={(e) => setAiVenue(e.target.value)} placeholder="Mekân (örn. Grand Salon)" className="text-neutral-900" />
                  </div>
                </div>
              )}
              {aiPresets.length > 0 && (
                <div data-testid="ai-presets" className="space-y-1.5">
                  <p className="text-[11px] text-neutral-500">Hazır temalar — tek tıkla üret (1 hak):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {aiPresets.map((p) => (
                      <button
                        key={p.id}
                        data-testid={`ai-preset-${p.id}`}
                        disabled={aiBusy || aiRights === 0}
                        onClick={() => { setAiPrompt(p.prompt); doAiGenerate(p.prompt); }}
                        className="text-[11px] px-2.5 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                        title={p.prompt}
                      >
                        {p.event} · {p.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <Button
                data-testid="ai-generate-btn"
                onClick={() => doAiGenerate()}
                disabled={aiBusy || aiRights === 0}
                className="w-full gap-2 bg-gradient-to-r from-amber-400 to-amber-600 text-neutral-900 font-semibold hover:from-amber-300 hover:to-amber-500"
              >
                {aiBusy ? <><Loader2 size={18} className="animate-spin" /> Üretiliyor… (~20 sn)</> : <><Sparkles size={18} /> 3 Alternatif Üret (1 hak)</>}
              </Button>
              {aiRights === 0 && (
                <p className="text-xs text-red-500 text-center">Tasarım hakkınız bitti. Yukarıdaki "Hak Satın Al" ile yeni hak alabilirsiniz.</p>
              )}

              {aiImages.length === 0 && aiFavs.length > 0 && (
                <div data-testid="ai-favs-standalone">
                  <p className="text-[11px] text-neutral-500 mb-1.5 flex items-center gap-1"><Star size={11} className="fill-amber-500 text-amber-500" /> Kayıtlı Arka Planlar — tıkla, tuvale gelsin</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {aiFavs.map((f) => (
                      <button key={f.asset_id} data-testid={`ai-fav-use-${f.asset_id}`}
                        onClick={() => addAiBackground(f.url)}
                        className="shrink-0 w-16 aspect-[4/5] rounded-lg overflow-hidden border-2 border-transparent hover:border-amber-400">
                        <img src={`${process.env.REACT_APP_BACKEND_URL}${f.url}`} alt="favori" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {aiImages.length > 0 && (
                <div>
                  <p className="text-xs text-neutral-500 mb-2">Görsele tıkla → tuvale arka plan olur. "Revize et" ile AI'a değişiklik yaptır (1 hak).</p>
                  <div className="grid grid-cols-3 gap-2">
                    {aiImages.map((im, i) => (
                      <div key={im.id} className="space-y-1">
                        <button
                          data-testid={`ai-result-${i}`}
                          onClick={() => addAiBackground(im.url)}
                          className="w-full rounded-lg overflow-hidden border-2 border-transparent hover:border-amber-400 transition-colors aspect-[4/5]"
                        >
                          <img src={`${process.env.REACT_APP_BACKEND_URL}${im.url}`} alt={`Alternatif ${i + 1}`} className="w-full h-full object-cover" />
                        </button>
                        <button
                          data-testid={`ai-revise-${i}`}
                          onClick={() => { setReviseFor(im.id); setReviseText(""); }}
                          className="w-full text-[11px] flex items-center justify-center gap-1 py-1 rounded-md bg-neutral-100 hover:bg-neutral-200 text-neutral-700"
                        >
                          <RefreshCw size={11} /> Revize et
                        </button>
                        <button
                          data-testid={`ai-fav-${i}`}
                          onClick={() => toggleAiFav(im)}
                          className={`w-full text-[11px] flex items-center justify-center gap-1 py-1 rounded-md ${isAiFav(im.id) ? "bg-amber-100 text-amber-800" : "bg-neutral-100 hover:bg-neutral-200 text-neutral-700"}`}
                        >
                          <Star size={11} className={isAiFav(im.id) ? "fill-amber-500 text-amber-500" : ""} /> {isAiFav(im.id) ? "Kaydedildi" : "Kaydet"}
                        </button>
                      </div>
                    ))}
                  </div>
                  {aiFavs.length > 0 && (
                    <div data-testid="ai-favs-section" className="mt-3">
                      <p className="text-[11px] text-neutral-500 mb-1.5 flex items-center gap-1"><Star size={11} className="fill-amber-500 text-amber-500" /> Kayıtlı Arka Planlar</p>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {aiFavs.map((f) => (
                          <button key={f.asset_id} data-testid={`ai-fav-use-${f.asset_id}`}
                            onClick={() => addAiBackground(f.url)}
                            className="shrink-0 w-16 aspect-[4/5] rounded-lg overflow-hidden border-2 border-transparent hover:border-amber-400">
                            <img src={`${process.env.REACT_APP_BACKEND_URL}${f.url}`} alt="favori" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {reviseFor && (
                    <div data-testid="ai-revise-panel" className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                      <p className="text-xs text-amber-800 font-medium">Seçilen alternatifi nasıl revize edelim?</p>
                      <Input data-testid="ai-revise-input" value={reviseText} onChange={(e) => setReviseText(e.target.value)}
                        placeholder="Örn. daha koyu bordo yap, farklı çiçek kullan" className="h-9 text-sm text-neutral-900" />
                      <div className="flex gap-2">
                        <Button data-testid="ai-revise-submit" size="sm" disabled={reviseBusy}
                          onClick={() => doRevise(reviseFor)}
                          className="gap-1 bg-amber-500 hover:bg-amber-600 text-white">
                          {reviseBusy ? <><Loader2 size={14} className="animate-spin" /> Revize ediliyor…</> : <><Wand2 size={14} /> Revize Et (1 hak)</>}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setReviseFor(null)}>Vazgeç</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Buy design rights dialog */}
      <Dialog open={aiBuyOpen} onOpenChange={setAiBuyOpen}>
        <DialogContent data-testid="ai-buy-dialog" className="max-w-lg text-neutral-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShoppingCart size={18} className="text-amber-500" /> Tasarım Hakkı Satın Al</DialogTitle>
            <DialogDescription>PayTR ile güvenli ödeme. Ödeme sonrası haklar otomatik yüklenir. Her hak = 3 AI alternatifi veya 1 revize.</DialogDescription>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            {aiPackages === null && <p className="text-sm text-neutral-500">Paketler yükleniyor…</p>}
            {(aiPackages || []).map((p) => (
              <div key={p.id} data-testid={`buy-pkg-${p.id}`} className="rounded-xl border border-neutral-200 p-4">
                <div className="font-semibold">{p.name}</div>
                <div className="text-2xl font-bold text-amber-600 mt-1">{p.price}₺</div>
                <div className="text-xs text-neutral-500">{p.rights} tasarım hakkı</div>
                <Button data-testid={`buy-pkg-btn-${p.id}`} size="sm" disabled={aiBuying === p.id}
                  onClick={() => buyPackage(p)}
                  className="mt-3 w-full gap-1 bg-neutral-900 hover:bg-neutral-800">
                  {aiBuying === p.id ? <><Loader2 size={14} className="animate-spin" /> Bekleniyor…</> : <>Satın Al</>}
                </Button>
              </div>
            ))}
            {aiPackages !== null && aiPackages.length === 0 && <p className="text-sm text-neutral-500">Paket bulunamadı.</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk personalization dialog */}
      <Dialog open={bulkOpen} onOpenChange={(o) => { setBulkOpen(o); if (o) loadPrintCap(); }}>
        <DialogContent data-testid="bulk-dialog" className="max-w-lg text-neutral-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Users size={18} className="text-amber-500" /> İsme Özel Toplu Baskı</DialogTitle>
            <DialogDescription>Her isim için ayrı, matbaaya hazır davetiye üretilir (300 DPI, {BLEED_MM}mm bleed + kesim işaretleri). Tuvalde {"{isim}"} alanı olmalı.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            {printCap && (
              <div data-testid="bulk-capacity" className={`rounded-lg border p-2.5 text-sm flex items-center justify-between ${printCap.remaining > 0 ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                <span>İsme özel baskı kapasitesi</span>
                <span className="font-semibold">{printCap.remaining} / {printCap.capacity} kaldı</span>
              </div>
            )}
            {/* Capacity 0 → buy a bulk-print package (prints + bonus AI) */}
            {printCap && printCap.remaining === 0 && (
              <div data-testid="bulk-buy" className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                <p className="text-xs font-semibold text-amber-800">Toplu Baskı Paketi Satın Al (baskı kotası + hediye AI kredisi)</p>
                {bulkPkgs === null && <p className="text-xs text-neutral-500">Paketler yükleniyor…</p>}
                {(bulkPkgs || []).map((p) => (
                  <div key={p.id} data-testid={`bulk-pkg-${p.id}`} className="flex items-center justify-between rounded-lg bg-white border border-amber-200 px-3 py-2">
                    <div>
                      <div className="text-sm font-semibold text-neutral-800">{p.name}</div>
                      <div className="text-[11px] text-neutral-500">{p.prints} baskı{p.bonus_ai ? ` · +${p.bonus_ai} AI kredisi` : ""}</div>
                    </div>
                    <Button size="sm" disabled={bulkPkgBusy === p.id} onClick={() => buyBulkPkg(p)} data-testid={`bulk-pkg-buy-${p.id}`}
                      className="gap-1 bg-amber-500 hover:bg-amber-600 text-white">
                      {bulkPkgBusy === p.id ? <Loader2 size={14} className="animate-spin" /> : <ShoppingCart size={14} />} {p.price}₺
                    </Button>
                  </div>
                ))}
                {(bulkPkgs || []).length === 0 && bulkPkgs !== null && <p className="text-xs text-neutral-500">Aktif paket yok. Yönetici tanımlamalı.</p>}
              </div>
            )}

            {/* Print size */}
            <div>
              <p className="text-[11px] text-neutral-500 mb-1">Baskı Ölçüsü</p>
              <Select value={printSize} onValueChange={setPrintSize}>
                <SelectTrigger data-testid="bulk-size" className="text-neutral-900"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {PRINT_SIZES.map((s) => (
                    <SelectItem key={s.key} value={s.key} data-testid={`bulk-size-${s.key}`}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-neutral-500 mt-1">{(PRINT_SIZES.find((s) => s.key === printSize) || {}).desc}</p>
              {printSize === "custom" && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Input data-testid="bulk-custom-w" type="number" value={customW} onChange={(e) => setCustomW(e.target.value)} placeholder="Genişlik (mm)" className="text-neutral-900" />
                  <Input data-testid="bulk-custom-h" type="number" value={customH} onChange={(e) => setCustomH(e.target.value)} placeholder="Yükseklik (mm)" className="text-neutral-900" />
                </div>
              )}
            </div>

            {/* Output format */}
            <div>
              <p className="text-[11px] text-neutral-500 mb-1">Çıktı biçimi (matbaanın tercihine göre)</p>
              <div className="grid grid-cols-2 gap-2" data-testid="bulk-output">
                {[
                  { k: "single", t: "Tek Birleşik PDF", d: "Her davetli 1 sayfa" },
                  { k: "zip", t: "Ayrı PDF (ZIP)", d: "Her davetli ayrı dosya" },
                ].map((m) => (
                  <button key={m.k} type="button" data-testid={`bulk-output-${m.k}`} onClick={() => setBulkOutput(m.k)}
                    className={`text-left rounded-xl border p-2.5 transition-all ${bulkOutput === m.k ? "border-amber-500 ring-2 ring-amber-200 bg-amber-50" : "border-neutral-200 hover:border-neutral-300"}`}>
                    <div className="text-sm font-semibold text-neutral-800 flex items-center gap-1">{m.t}{bulkOutput === m.k && <Check size={13} className="text-amber-600" />}</div>
                    <div className="text-[10px] text-neutral-500">{m.d}</div>
                  </button>
                ))}
              </div>
            </div>

            <Textarea data-testid="bulk-names" value={bulkNames} onChange={(e) => setBulkNames(e.target.value)}
              placeholder={"Her satıra bir isim:\nAyşe Yılmaz\nMehmet Demir\nZeynep Kaya"} rows={5} className="text-neutral-900" />
            <div className="flex items-center justify-between">
              <label className="text-xs text-neutral-600 flex items-center gap-2 cursor-pointer">
                <input data-testid="bulk-csv" type="file" accept=".csv,.txt" onChange={onBulkCsv} className="text-xs" />
              </label>
              <span className="text-xs text-neutral-500">{parseBulkNames(bulkNames).length} isim</span>
            </div>
            {bulkBusy && (
              <div className="h-2 rounded-full bg-neutral-200 overflow-hidden">
                <div className="h-full bg-amber-500 transition-all" style={{ width: `${bulkProgress}%` }} />
              </div>
            )}
            <Button data-testid="bulk-generate-btn" disabled={bulkBusy} onClick={doBulkGenerate}
              className="w-full gap-2 bg-gradient-to-r from-amber-400 to-amber-600 text-neutral-900 font-semibold hover:from-amber-300 hover:to-amber-500">
              {bulkBusy ? <><Loader2 size={18} className="animate-spin" /> Üretiliyor… %{bulkProgress}</> : <><Download size={18} /> Matbaaya Hazır Üret ve İndir</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Template preview */}
      <Dialog open={!!previewTpl} onOpenChange={(o) => !o && setPreviewTpl(null)}>
        <DialogContent data-testid="template-preview-dialog" className="max-w-md text-neutral-900">
          <DialogHeader>
            <DialogTitle>{previewTpl?.name}</DialogTitle>
            <DialogDescription>{previewTpl?.category} · Önizleme</DialogDescription>
          </DialogHeader>
          {previewTpl && (
            <div className="space-y-3">
              <div className="mx-auto w-full max-w-[260px] aspect-[4/5] rounded-xl overflow-hidden border border-neutral-200 bg-cover bg-center"
                style={previewTpl.bg_image ? { backgroundImage: `url(${previewTpl.bg_image})` } : { background: previewTpl.thumb_bg || "#eee" }} />
              <Button data-testid="template-use-btn" onClick={() => { loadTemplate(previewTpl); setPreviewTpl(null); }}
                className="w-full bg-neutral-900 hover:bg-neutral-800">Bu şablonu kullan</Button>
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
