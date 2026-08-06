"""Sektör Radarı (Agent Reach) — key-free daily sector research.

Collects live web/news signals with NO API key:
  * Google News RSS  (feedparser)  — Turkish + foreign news (fast)
  * DuckDuckGo (ddgs)              — global trend snippets
Then synthesizes a Turkish, actionable executive dashboard via the Emergent LLM key,
structured into 3 sections: Sektör Haberleri · Sosyal Medya Trendleri · Çekim Paket Fikirleri.
"""
import asyncio
import json
import logging
import urllib.parse
from datetime import datetime, timezone

import feedparser

logger = logging.getLogger("trend_radar")

# --- Sector query sets --------------------------------------------------------
NEWS_TR = [
    "düğün fotoğrafçılığı",
    "fotoğraf stüdyosu",
    "düğün sektörü",
    "video prodüksiyon",
    "ürün fotoğrafçılığı",
    "fotoğrafçılık haber",
]
NEWS_EN = [
    "wedding photography industry",
    "photography business trends",
]
TREND_EN = [
    "wedding photography trends 2026",
    "instagram reels tiktok trends photographers 2026",
    "product photography trends 2026",
]

MAX_PER_QUERY = 6


def _google_news(query: str, lang: str = "tr") -> list:
    try:
        if lang == "tr":
            q = f"https://news.google.com/rss/search?q={urllib.parse.quote(query)}&hl=tr&gl=TR&ceid=TR:tr"
        else:
            q = f"https://news.google.com/rss/search?q={urllib.parse.quote(query)}&hl=en-US&gl=US&ceid=US:en"
        f = feedparser.parse(q)
        out = []
        for e in f.entries[:MAX_PER_QUERY]:
            src = ""
            try:
                src = e.get("source", {}).get("title", "") if e.get("source") else ""
            except Exception:
                src = ""
            out.append({
                "title": (e.get("title") or "").strip(),
                "url": e.get("link") or "",
                "source": src,
                "published": e.get("published", ""),
                "lang": lang,
            })
        return out
    except Exception as ex:
        logger.warning(f"google_news failed [{query}]: {ex}")
        return []


def _ddg(query: str) -> list:
    try:
        from ddgs import DDGS
        out = []
        with DDGS() as d:
            for r in d.text(query, max_results=5, backend="auto"):
                out.append({
                    "title": (r.get("title") or "").strip(),
                    "url": r.get("href") or r.get("url") or "",
                    "snippet": (r.get("body") or "")[:220],
                    "lang": "en",
                })
        return out
    except Exception as ex:
        logger.warning(f"ddg failed [{query}]: {ex}")
        return []


def _collect_sync() -> dict:
    tr_news, en_news, trends = [], [], []
    for q in NEWS_TR:
        tr_news += _google_news(q, "tr")
    for q in NEWS_EN:
        en_news += _google_news(q, "en")
    for q in TREND_EN:
        trends += _ddg(q)

    def dedup(items):
        seen, out = set(), []
        for it in items:
            key = (it.get("title") or "").lower()[:80]
            if key and key not in seen:
                seen.add(key)
                out.append(it)
        return out

    return {
        "tr_news": dedup(tr_news)[:22],
        "en_news": dedup(en_news)[:10],
        "trends": dedup(trends)[:18],
    }


async def collect_raw() -> dict:
    return await asyncio.to_thread(_collect_sync)


SYSTEM_PROMPT = """Sen bir fotoğraf & video stüdyosu (Fotuber Görsel Sanat) için çalışan uzman SEKTÖR ANALİSTİ ve
İÇERİK STRATEJİSTİsin. Sana canlı web araması ve haber başlıkları (ham veri) verilecek. Bunları analiz edip
stüdyo sahibinin her sabah bakıp KARAR verebileceği, Türkçe ve UYGULANABİLİR bir "Sektör Radarı" panosu üreteceksin.

Kapsam (hepsi dahil): düğün / nişan / kına, stüdyo & vesikalık, doğum günü, kurumsal çekim, ÜRÜN fotoğrafçılığı,
fotoğraf & video prodüksiyonu, sosyal medya (Instagram Reels / TikTok) içerik trendleri.

GENEL KURALLAR:
- Yabancı kaynakları Türkçeye ÇEVİR ve Türkçe yaz. Türkiye haberlerini Türkçe ver.
- Rakip firma / fotoğrafçı / stüdyo REKLAMI yapma; sadece genel trend, haber ve fikir ver.
- Uydurma bilgi verme; verilen ham veriye ve genel sektör bilgine dayan. Haberlerde URL varsa AYNEN koru.
- Kısa, net, yönetici diliyle yaz.
- SADECE geçerli JSON döndür, başka hiçbir metin yazma.

3 BÖLÜM ÜRETECEKSİN (her bölümde önem sırasına göre en fazla 6 madde; en kritik/en fırsatlı en üstte):

1) news (Sektör Haberleri): Güncel gelişmeler. Her madde:
   {"title": "haber başlığı (TR)", "summary": "1-2 cümle Türkçe özet", "date": "yayın tarihi metni veya ''",
    "source": "kaynak adı", "url": "haber linki veya ''", "why_important": "stüdyo için neden önemli (1 cümle)",
    "sentiment": "positive | negative | opportunity"}
   Kritik/olumsuz haberler sentiment="negative", fırsat doğuranlar "opportunity".

2) social (Sosyal Medya Trendleri): Reels/TikTok/fotoğraf-video içerik trendleri. Her madde:
   {"title": "trendin kısa adı", "platform": "Instagram Reels | TikTok | YouTube | Genel",
    "idea": "kısa içerik/çekim fikri", "audience": "hangi müşteri grubu (ör. düğün çiftleri, e-ticaret markaları)",
    "how_to_apply": "stüdyoda nasıl uygulanır / müşteri kazanımına nasıl döner (1-2 cümle)"}

3) packages (Çekim Paket Fikirleri): Haber + trendlerden türetilmiş SATILABİLİR paket fikirleri. Her madde:
   {"name": "paket adı", "target_customer": "hedef müşteri", "contents": "paket içeriği (kısa)",
    "sales_message": "müşteriye söylenebilecek kısa satış cümlesi", "why_now": "neden şu an fırsat (1 cümle)",
    "impact": "high | medium"}  (en çok kazandıracaklar impact="high")

ÇIKTI JSON ŞEMASI:
{
  "summary": "Bugünün genel durumu (1-2 cümle, yönetici özeti)",
  "sections": [
    {"key": "news", "title": "Sektör Haberleri", "items": [ ... ]},
    {"key": "social", "title": "Sosyal Medya Trendleri", "items": [ ... ]},
    {"key": "packages", "title": "Çekim Paket Fikirleri", "items": [ ... ]}
  ]
}
Boş kalan bölüm için items: []."""


async def synthesize(raw: dict, llm_key: str, provider: str = "gemini", model: str = "gemini-2.5-flash") -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    payload = {
        "turkiye_haberleri": [{"baslik": i["title"], "kaynak": i.get("source", ""), "tarih": i.get("published", ""), "url": i.get("url", "")} for i in raw.get("tr_news", [])],
        "yabanci_haberler": [{"title": i["title"], "source": i.get("source", ""), "url": i.get("url", "")} for i in raw.get("en_news", [])],
        "global_trendler": [{"title": i["title"], "snippet": i.get("snippet", ""), "url": i.get("url", "")} for i in raw.get("trends", [])],
    }
    user_text = (
        "Aşağıdaki ham veriyi analiz et ve şemaya uygun JSON panosunu üret.\n\n"
        + json.dumps(payload, ensure_ascii=False)
    )
    session_id = f"trend_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    chat = LlmChat(api_key=llm_key, session_id=session_id, system_message=SYSTEM_PROMPT).with_model(provider, model)
    resp = await chat.send_message(UserMessage(text=user_text))
    text = (resp if isinstance(resp, str) else str(resp)).strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1] if text.count("```") >= 2 else text
        if text.startswith("json"):
            text = text[4:]
        text = text.strip("` \n")
    try:
        data = json.loads(text)
    except Exception:
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            data = json.loads(text[start:end + 1])
        else:
            raise
    if "sections" not in data:
        data["sections"] = []
    return data


async def generate_report(llm_key: str, provider: str = "gemini", model: str = "gemini-2.5-flash") -> dict:
    raw = await collect_raw()
    total = len(raw.get("tr_news", [])) + len(raw.get("en_news", [])) + len(raw.get("trends", []))
    if total == 0:
        raise RuntimeError("Canlı veri toplanamadı (ağ/servis geçici olarak erişilemiyor)")
    report = await synthesize(raw, llm_key, provider, model)
    report["_sources_count"] = total
    return report
