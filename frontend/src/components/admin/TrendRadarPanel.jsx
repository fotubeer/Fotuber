import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Radar, RefreshCw, Newspaper, Sparkles, Package, ExternalLink, Loader2,
  TrendingUp, AlertTriangle, Lightbulb, Clock, ChevronDown, ChevronUp, Megaphone, Plus, Check,
} from "lucide-react";
import { toast } from "sonner";

const SENTIMENT = {
  positive: { label: "Olumlu", cls: "bg-emerald-100 text-emerald-700 border-emerald-300", Icon: TrendingUp },
  opportunity: { label: "Fırsat", cls: "bg-amber-100 text-amber-800 border-amber-300", Icon: Lightbulb },
  negative: { label: "Dikkat", cls: "bg-red-100 text-red-700 border-red-300", Icon: AlertTriangle },
};

const timeAgo = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
};

const SectionShell = ({ tone, Icon, title, count, children, testId }) => (
  <div className={`rounded-2xl border bg-white overflow-hidden flex flex-col border-slate-200`} data-testid={testId}>
    <div className={`px-4 py-3 border-b flex items-center gap-2 bg-gradient-to-r ${tone.head}`}>
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${tone.icon}`}><Icon className="w-4 h-4" /></span>
      <span className="font-semibold text-slate-900 text-sm">{title}</span>
      <Badge variant="outline" className="ml-auto text-[11px] bg-white/70">{count}</Badge>
    </div>
    <div className="p-3 space-y-3 flex-1">{children}</div>
  </div>
);

const NewsItem = ({ it }) => {
  const s = SENTIMENT[it.sentiment] || SENTIMENT.positive;
  const isNeg = it.sentiment === "negative";
  return (
    <div className={`rounded-xl border p-3 ${isNeg ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-slate-50/50"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900 leading-snug">{it.title}</div>
        <Badge className={`shrink-0 gap-1 text-[10px] ${s.cls}`}><s.Icon className="w-3 h-3" />{s.label}</Badge>
      </div>
      {it.summary && <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{it.summary}</p>}
      {it.why_important && (
        <p className="text-xs text-slate-500 mt-1.5"><span className="font-medium text-slate-700">Neden önemli:</span> {it.why_important}</p>
      )}
      <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
        {it.date && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{it.date}</span>}
        {it.source && <span className="truncate max-w-[120px]">{it.source}</span>}
        {it.url && (
          <a href={it.url} target="_blank" rel="noopener noreferrer" className="ml-auto text-slate-500 hover:text-slate-900 flex items-center gap-1">
            Habere Git <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
};

const SocialItem = ({ it }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
    <div className="flex items-center gap-2">
      <Badge className="bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300 text-[10px]">{it.platform || "Genel"}</Badge>
      <div className="text-sm font-semibold text-slate-900">{it.title}</div>
    </div>
    {it.idea && <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{it.idea}</p>}
    {it.audience && <p className="text-xs text-slate-500 mt-1.5"><span className="font-medium text-slate-700">Kime uygun:</span> {it.audience}</p>}
    {it.how_to_apply && <p className="text-xs text-slate-500 mt-1"><span className="font-medium text-slate-700">Nasıl uygulanır:</span> {it.how_to_apply}</p>}
  </div>
);

const PackageItem = ({ it }) => {
  const high = it.impact === "high";
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const publish = async () => {
    setBusy(true);
    try {
      const description = [
        it.contents ? `İçerik: ${it.contents}` : "",
        it.target_customer ? `Hedef müşteri: ${it.target_customer}` : "",
        it.sales_message ? `Satış mesajı: ${it.sales_message}` : "",
        it.why_now ? `Fırsat: ${it.why_now}` : "",
      ].filter(Boolean).join("\n");
      await api.post("/admin/trend-radar/publish-package", { name: it.name, description, price: 0 });
      setPublished(true);
      toast.success("Taslak hizmet oluşturuldu — Hizmetler panelinden fiyat/görsel ekleyip yayına alın.");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className={`rounded-xl border p-3 ${high ? "border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-200" : "border-slate-200 bg-slate-50/50"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-bold text-slate-900">{it.name}</div>
        {high && <Badge className="bg-indigo-600 text-white text-[10px] gap-1"><Sparkles className="w-3 h-3" />Yüksek Potansiyel</Badge>}
      </div>
      {it.target_customer && <p className="text-xs text-slate-500 mt-1.5"><span className="font-medium text-slate-700">Hedef:</span> {it.target_customer}</p>}
      {it.contents && <p className="text-xs text-slate-600 mt-1"><span className="font-medium text-slate-700">İçerik:</span> {it.contents}</p>}
      {it.sales_message && (
        <div className="mt-2 rounded-lg bg-white border border-indigo-200 px-2.5 py-1.5 text-xs text-indigo-900 flex gap-1.5">
          <Megaphone className="w-3.5 h-3.5 shrink-0 mt-0.5 text-indigo-500" /> <span className="italic">"{it.sales_message}"</span>
        </div>
      )}
      {it.why_now && <p className="text-[11px] text-amber-700 mt-1.5 flex items-center gap-1"><Lightbulb className="w-3 h-3" />{it.why_now}</p>}
      <button onClick={publish} disabled={busy || published} data-testid="trend-publish-package"
        className={`mt-2.5 w-full text-xs font-semibold rounded-lg py-1.5 flex items-center justify-center gap-1.5 transition ${published ? "bg-emerald-100 text-emerald-700 cursor-default" : "bg-slate-900 text-white hover:bg-slate-800"}`}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : published ? <><Check className="w-3.5 h-3.5" /> Taslak Eklendi</> : <><Plus className="w-3.5 h-3.5" /> Hizmet Olarak Ekle</>}
      </button>
    </div>
  );
};

const RADIO = {
  news: { head: "from-slate-50 to-white", icon: "bg-slate-900 text-white", Icon: Newspaper, title: "Sektör Haberleri", Item: NewsItem },
  social: { head: "from-fuchsia-50 to-white", icon: "bg-fuchsia-600 text-white", Icon: Sparkles, title: "Sosyal Medya Trendleri", Item: SocialItem },
  packages: { head: "from-indigo-50 to-white", icon: "bg-indigo-600 text-white", Icon: Package, title: "Çekim Paket Fikirleri", Item: PackageItem },
};

const Section = ({ keyName, items }) => {
  const [showAll, setShowAll] = useState(false);
  const cfg = RADIO[keyName];
  const list = showAll ? items : items.slice(0, 3);
  const ItemComp = cfg.Item;
  return (
    <SectionShell tone={cfg} Icon={cfg.Icon} title={cfg.title} count={items.length} testId={`trend-section-${keyName}`}>
      {items.length === 0 ? (
        <div className="text-xs text-slate-400 py-6 text-center">Bu başlıkta şu an içerik yok.</div>
      ) : (
        <>
          {list.map((it, i) => <ItemComp key={i} it={it} />)}
          {items.length > 3 && (
            <button onClick={() => setShowAll((v) => !v)} data-testid={`trend-seeall-${keyName}`}
              className="w-full text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center justify-center gap-1 py-1.5 rounded-lg hover:bg-slate-50">
              {showAll ? <>Daha Az <ChevronUp className="w-3.5 h-3.5" /></> : <>Tümünü Gör ({items.length}) <ChevronDown className="w-3.5 h-3.5" /></>}
            </button>
          )}
        </>
      )}
    </SectionShell>
  );
};

const TrendRadarPanel = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState(null);
  const pollRef = useRef(null);

  const fetchOnce = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/trend-radar");
      setData(data);
      setGenerating(!!data.generating);
      setErr(data.error || null);
      return data;
    } catch (e) {
      setErr(formatApiError(e));
      return null;
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchOnce();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchOnce]);

  // Poll while generating
  useEffect(() => {
    if (generating) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const d = await fetchOnce();
        if (d && !d.generating) { clearInterval(pollRef.current); pollRef.current = null; }
      }, 5000);
    }
    return () => { if (pollRef.current && !generating) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [generating, fetchOnce]);

  const refresh = async () => {
    try {
      const { data } = await api.post("/admin/trend-radar/refresh");
      if (data.status === "generating" || data.status === "started") {
        setGenerating(true);
        toast.info("Sektör taranıyor — internetten güncel veriler toplanıyor…");
      }
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const report = data?.report?.report;
  const sections = report?.sections || [];
  const secByKey = Object.fromEntries(sections.map((s) => [s.key, s.items || []]));
  const generatedAt = data?.report?.generated_at;
  const hasReport = !!report;

  return (
    <div className="rounded-3xl border border-slate-200 bg-gradient-to-b from-slate-50/80 to-white shadow-sm overflow-hidden" data-testid="trend-radar-panel">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 bg-white flex flex-wrap items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-900 to-slate-700 text-white flex items-center justify-center shadow">
          <Radar className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <div className="text-lg font-semibold tracking-tight flex items-center gap-2">
            Sektör Radarı
            <span className="text-[10px] uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Canlı</span>
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-1.5" data-testid="trend-status">
            {generating ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> İnternet taranıyor, rapor hazırlanıyor…</>
            ) : hasReport ? (
              <><Clock className="w-3 h-3" /> Son güncelleme: {timeAgo(generatedAt)} · Günlük otomatik güncellenir</>
            ) : (
              <>Henüz rapor yok · Günlük otomatik güncellenir</>
            )}
          </div>
        </div>
        <Button onClick={refresh} disabled={generating} data-testid="trend-refresh-btn"
          className="ml-auto bg-slate-900 hover:bg-slate-800 gap-2">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {generating ? "Güncelleniyor…" : "Şimdi Yenile"}
        </Button>
      </div>

      {/* Summary */}
      {hasReport && report.summary && (
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 text-sm text-slate-700 flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <span>{report.summary}</span>
        </div>
      )}

      {/* Body */}
      <div className="p-4">
        {loading ? (
          <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin" /> Yükleniyor…
          </div>
        ) : !hasReport && generating ? (
          <div className="py-16 text-center text-slate-500 flex flex-col items-center gap-3" data-testid="trend-generating">
            <Loader2 className="w-8 h-8 animate-spin text-slate-700" />
            <div className="font-medium">İlk rapor hazırlanıyor</div>
            <div className="text-xs max-w-sm">Sektör haberleri ve sosyal medya trendleri internetten toplanıp Türkçe özetleniyor. Bu işlem yaklaşık 1 dakika sürebilir.</div>
          </div>
        ) : !hasReport ? (
          <div className="py-16 text-center text-slate-500 flex flex-col items-center gap-3" data-testid="trend-empty">
            <Radar className="w-8 h-8 text-slate-300" />
            <div className="font-medium">Henüz veri yok</div>
            {err && <div className="text-xs text-red-500 max-w-sm">{err}</div>}
            <div className="text-xs max-w-sm text-slate-400">"Şimdi Yenile" ile ilk sektör radarı raporunu oluşturabilirsiniz.</div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <Section keyName="news" items={secByKey.news || []} />
            <Section keyName="social" items={secByKey.social || []} />
            <Section keyName="packages" items={secByKey.packages || []} />
          </div>
        )}
        {hasReport && err && (
          <div className="mt-3 text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Son güncelleme denemesi: {err}</div>
        )}
      </div>
    </div>
  );
};

export default TrendRadarPanel;
