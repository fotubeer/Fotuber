"""
Etkinlik Galerisi (Event Gallery) — additive Studio Suite module.

Studio-authenticated management (events, chunked photo upload, service packs,
orders + PDF) plus PUBLIC client selection via a share token. Reuses studio auth
via studio.build_get_current_studio. No existing routes are touched.
"""
import io
import os
import secrets
import zipfile
from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Request
from pydantic import BaseModel, Field
from starlette.responses import Response as StarletteResponse, StreamingResponse

from routers.studio import build_get_current_studio, _studio_state, _merged_plan


def _gallery_durations(plan):
    mp = _merged_plan(plan or "trial")
    return (mp.get("link_days", 2), mp.get("del_days", 4))


def _quota_error(message: str):
    """402 with an [UPGRADE] marker so the frontend can show the upgrade screen."""
    return HTTPException(status_code=402, detail=f"[UPGRADE] {message}")

RAW_EXTS = {"cr2", "cr3", "nef", "arw", "dng", "raf", "orf", "rw2", "sr2", "pef", "raw"}

# Package-based durations now come from the (editable) plan config via _merged_plan.

# Order lifecycle (client-visible). Keys are stored; labels shown to client.
ORDER_FLOW = ["new", "preparing", "printing", "shipping", "completed"]
ORDER_LABELS = {"new": "İnceleniyor", "preparing": "Hazırlanıyor", "printing": "Baskıda",
                "shipping": "Kargoda", "completed": "Tamamlandı"}

# In-memory chunk buffer for resumable uploads (single-process dev/preview).
_UPLOADS: dict = {}


class EventIn(BaseModel):
    name: str = Field(min_length=1)
    client_name: str = ""
    client_phone: str = ""
    client_email: str = ""
    event_date: str = ""
    album_limit: int = 0     # 0 = sınırsız
    canvas_limit: int = 0
    retouch_limit: int = 0


class ServicePackIn(BaseModel):
    name: str = Field(min_length=1)
    price: float = Field(ge=0)
    description: str = ""
    active: bool = True
    kind: str = "Diğer"          # Baskı / Çerçeve / Ahşap Tablo / Cam Tablo / Albüm / Diğer
    max_qty: int = 0             # 0 = sınırsız; müşterinin bu hizmet için seçebileceği maks. adet


class PaymentMethodIn(BaseModel):
    provider: str                  # paytr | iyzico | odeal | link | iban | cash
    label: str = ""
    active: bool = True
    config: dict = {}              # provider'a göre alanlar (gizli anahtarlar dahil)


# Sağlayıcı meta verisi — fotoğrafçıya yöntem eklerken bilgi olarak gösterilir.
PAYMENT_PROVIDERS = [
    {"provider": "paytr", "label": "PayTR", "auto": True, "kind": "Sanal POS (Otomatik)",
     "help": "PayTR mağazanız üzerinden müşteriden otomatik KART tahsilatı. Ödeme tamamlanınca sipariş kendiliğinden 'Ödendi' olur.",
     "steps": [
         "paytr.com adresinden Üye İş Yeri (mağaza) hesabınıza giriş yapın. Hesabınız yoksa başvuru yapıp mağazanızı onaylatın.",
         "Sol menüden 'Bilgi' (veya 'Ayarlar') → 'Entegrasyon Bilgileri / API Bilgileri' bölümüne girin.",
         "Buradaki üç değeri kopyalayın: Mağaza No (merchant_id), Mağaza Parolası (merchant_key), Mağaza Gizli Anahtarı (merchant_salt).",
         "PayTR destekten 'Link API' özelliğinin mağazanız için AKTİF edilmesini isteyin (Link ile Ödeme kapalıysa link üretilemez).",
         "Üç değeri aşağıdaki alanlara yapıştırıp kaydedin. Test için önce küçük bir tutarla deneyin.",
     ],
     "docs": "https://www.paytr.com",
     "fields": [
         {"key": "merchant_id", "label": "Mağaza No (merchant_id)", "secret": False},
         {"key": "merchant_key", "label": "Mağaza Parolası (merchant_key)", "secret": True},
         {"key": "merchant_salt", "label": "Mağaza Gizli Anahtarı (merchant_salt)", "secret": True},
     ]},
    {"provider": "iyzico", "label": "iyzico", "auto": True, "kind": "Sanal POS (Otomatik)",
     "help": "iyzico hesabınız üzerinden otomatik KART tahsilatı (iyziLink). Ödeme tamamlanınca sipariş kendiliğinden 'Ödendi' olur.",
     "steps": [
         "merchant.iyzico.com adresinden iyzico işletme hesabınıza giriş yapın.",
         "'Ayarlar' → 'API Anahtarları' menüsüne gidin.",
         "API Key ve Secret Key değerlerini kopyalayın (Gerçek tahsilat için 'Production/Canlı', deneme için 'Sandbox' anahtarları farklıdır).",
         "Hesabınızda 'iyzico Link (iyziLink)' ürününün aktif olduğundan emin olun; değilse iyzico destekten aktifleştirin.",
         "Anahtarları aşağı yapıştırın ve Ortam alanına gerçek tahsilat için 'production', deneme için 'sandbox' yazın.",
     ],
     "docs": "https://merchant.iyzico.com",
     "fields": [
         {"key": "api_key", "label": "API Key", "secret": False},
         {"key": "secret_key", "label": "Secret Key", "secret": True},
         {"key": "environment", "label": "Ortam (production / sandbox)", "secret": False, "default": "production"},
     ]},
    {"provider": "odeal", "label": "Ödeal", "auto": True, "kind": "Sanal POS (Otomatik)",
     "help": "Ödeal Sanal POS üzerinden otomatik KART tahsilatı. Müşteri 3D güvenli sayfada öder, ödeme doğrulanınca sipariş 'Ödendi' olur.",
     "steps": [
         "Ödeal ile Sanal POS / online ödeme sözleşmeniz olmalı. Yoksa odeal.com üzerinden başvurun.",
         "Ödeal entegrasyon/teknik ekibinden hesabınıza ait API Key ve Secret Key bilgilerini talep edin.",
         "Test için 'stage', gerçek tahsilat için 'production' anahtarları ayrıdır; hangisini kullanacaksanız onu isteyin.",
         "'Link ile Ödeme (Pay by Link)' özelliğinin hesabınızda açık olduğunu teyit edin.",
         "Anahtarları aşağı yapıştırın ve Ortam alanına 'production' (veya deneme için 'stage') yazıp kaydedin.",
     ],
     "docs": "https://docs.odeal.com",
     "fields": [
         {"key": "api_key", "label": "API Key", "secret": False},
         {"key": "secret_key", "label": "Secret Key", "secret": True},
         {"key": "environment", "label": "Ortam (production / stage)", "secret": False, "default": "production"},
     ]},
    {"provider": "link", "label": "Ödeme Linki (PayPal / iyzico / Ödeal / Banka POS)", "auto": False, "kind": "Ödeme Linki",
     "help": "Herhangi bir sağlayıcının hazır ödeme linkini kullanın. Müşteri linke tıklayıp öder, dönüp 'Ödedim' der, siz onaylarsınız.",
     "steps": [
         "Kullandığınız ödeme sağlayıcısının (PayPal, iyzico, Ödeal, bankanızın Sanal POS'u vb.) paneline girin.",
         "Oradan bir 'Ödeme Linki' / 'Ödeme Talebi' / 'Payment Link' oluşturun (çoğu sağlayıcıda tek tıkla yapılır).",
         "Oluşan linki (https://... ile başlayan) kopyalayın.",
         "Linki aşağıdaki alana yapıştırıp kaydedin. Aynı link tüm müşterilere gösterilir; tutarı müşteriyle ayrıca teyit edin.",
         "Müşteri ödedikten sonra Siparişler sekmesinden 'Ödemeyi Onayla' ile onaylayın.",
     ],
     "docs": "",
     "fields": [
         {"key": "url", "label": "Ödeme Linki (https://...)", "secret": False},
     ]},
    {"provider": "iban", "label": "Havale / EFT (IBAN)", "auto": False, "kind": "Manuel Onay",
     "help": "Müşteriye IBAN bilgilerinizi gösterir. Para hesabınıza geçince siparişten onaylarsınız.",
     "steps": [
         "Tahsilat yapmak istediğiniz banka hesabınızın IBAN numarasını hazırlayın.",
         "IBAN, hesap sahibinin adı-soyadı/ünvanı ve (isteğe bağlı) banka adını aşağıya girin.",
         "Kaydedin. Müşteri bu bilgileri görüp havale/EFT yapar ve 'Ödedim' der.",
         "Para hesabınıza geçtiğini gördüğünüzde Siparişler sekmesinden 'Ödemeyi Onayla' butonuna basın.",
     ],
     "docs": "",
     "fields": [
         {"key": "iban", "label": "IBAN", "secret": False},
         {"key": "holder", "label": "Ad Soyad / Ünvan", "secret": False},
         {"key": "bank", "label": "Banka (opsiyonel)", "secret": False},
     ]},
    {"provider": "cash", "label": "Nakit / Elden Ödeme", "auto": False, "kind": "Manuel Onay",
     "help": "Müşteri teslimatta elden öder. Ödeme alınınca siparişten onaylarsınız.",
     "steps": [
         "Bu yöntemi eklemek için ek bilgi gerekmez; sadece bir etiket (örn. 'Elden Ödeme') yazıp kaydedin.",
         "Müşteri bu seçeneği seçtiğinde sipariş 'Onay bekliyor' durumuna geçer.",
         "Ödemeyi elden aldığınızda Siparişler sekmesinden 'Ödemeyi Onayla' butonuna basın.",
     ],
     "docs": "",
     "fields": []},
]
_AUTO_PROVIDERS = {"paytr", "iyzico", "odeal"}
_SECRET_KEYS = {"merchant_key", "merchant_salt", "secret_key"}


def _redact_method(m: dict) -> dict:
    """Studio-facing: mask secret config values (never return raw secrets)."""
    cfg = dict(m.get("config") or {})
    for k in list(cfg.keys()):
        if k in _SECRET_KEYS and cfg[k]:
            cfg[k] = "••••••" + str(cfg[k])[-2:]
    return {"id": m.get("id"), "provider": m.get("provider"), "label": m.get("label", ""),
            "active": m.get("active", True), "config": cfg}


def _public_method(m: dict) -> dict:
    """Client-facing: expose only what the buyer needs (never secrets)."""
    prov = m.get("provider")
    cfg = m.get("config") or {}
    out = {"id": m.get("id"), "provider": prov, "label": m.get("label") or _provider_label(prov),
           "auto": prov in _AUTO_PROVIDERS, "info": {}}
    if prov == "iban":
        out["info"] = {"iban": cfg.get("iban", ""), "holder": cfg.get("holder", ""), "bank": cfg.get("bank", "")}
    elif prov == "cash":
        out["info"] = {}
    elif prov == "link":
        out["info"] = {"url": cfg.get("url", "")}
    return out


def _provider_label(prov: str) -> str:
    for p in PAYMENT_PROVIDERS:
        if p["provider"] == prov:
            return p["label"]
    return prov or "Ödeme"


# ---- Gateway link creators (per-merchant credentials, multi-tenant) --------
def _hmac_b64(key: str, msg: str) -> str:
    import base64
    import hashlib
    import hmac
    return base64.b64encode(hmac.new(key.encode(), msg.encode(), hashlib.sha256).digest()).decode()


async def _paytr_gallery_link(cfg: dict, title: str, price_kurus: str, callback_url: str, callback_id: str) -> str:
    import httpx
    mid = cfg.get("merchant_id", ""); mkey = cfg.get("merchant_key", ""); msalt = cfg.get("merchant_salt", "")
    if not (mid and mkey and msalt):
        raise HTTPException(status_code=400, detail="PayTR bilgileri eksik")
    currency, max_inst, link_type, lang, min_count = "TL", "1", "product", "tr", "1"
    required = title + price_kurus + currency + max_inst + link_type + lang + min_count
    token = _hmac_b64(mkey, required + msalt)
    data = {"merchant_id": mid, "name": title, "price": price_kurus, "currency": currency,
            "max_installment": max_inst, "link_type": link_type, "lang": lang, "min_count": min_count,
            "max_count": "1", "callback_link": callback_url, "callback_id": callback_id,
            "debug_on": "0", "get_qr": "0", "paytr_token": token}
    async with httpx.AsyncClient(timeout=25) as http:
        r = await http.post("https://www.paytr.com/odeme/api/link/create", data=data)
    try:
        res = r.json()
    except Exception:
        raise HTTPException(status_code=502, detail=f"PayTR yanıtı okunamadı: {r.text[:150]}")
    if res.get("status") != "success":
        raise HTTPException(status_code=502, detail=res.get("err_msg") or res.get("reason") or "PayTR link oluşturulamadı")
    return res.get("link")


async def _iyzico_gallery_link(cfg: dict, order_id: str, title: str, price: str) -> tuple:
    import httpx
    import json as _json
    import secrets as _secrets
    api_key = cfg.get("api_key", ""); secret = cfg.get("secret_key", "")
    env = (cfg.get("environment") or "production").lower()
    if not (api_key and secret):
        raise HTTPException(status_code=400, detail="iyzico bilgileri eksik")
    base = "https://sandbox-api.iyzipay.com" if env == "sandbox" else "https://api.iyzipay.com"
    path = "/v2/iyzilink/products"
    payload = {"conversationId": order_id, "locale": "tr", "name": title[:120],
               "description": title[:400], "price": price, "currencyCode": "TRY",
               "encodedImageFile": "", "addressIgnorable": True,
               "installmentRequested": False, "stockEnabled": False, "categoryType": "UNKNOWN"}
    body = _json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    rnd = _secrets.token_urlsafe(18)
    import base64
    import hashlib
    import hmac
    sig = hmac.new(secret.encode(), f"{rnd}{path}{body}".encode(), hashlib.sha256).hexdigest()
    auth = base64.b64encode(f"apiKey:{api_key}&randomKey:{rnd}&signature:{sig}".encode()).decode()
    headers = {"Authorization": f"IYZWSv2 {auth}", "x-iyzi-rnd": rnd, "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=25) as http:
        r = await http.post(base + path, content=body.encode(), headers=headers)
    try:
        res = r.json()
    except Exception:
        raise HTTPException(status_code=502, detail=f"iyzico yanıtı okunamadı: {r.text[:150]}")
    if res.get("status") != "success":
        raise HTTPException(status_code=502, detail=res.get("errorMessage") or "iyzico link oluşturulamadı")
    d = res.get("data") or {}
    return d.get("url"), d.get("token")


async def _odeal_gallery_link(cfg: dict, external_id: str, amount: float, return_url: str,
                              buyer_name: str = "", buyer_mail: str = "") -> tuple:
    import httpx
    api_key = cfg.get("api_key", ""); secret = cfg.get("secret_key", "")
    env = (cfg.get("environment") or "production").lower()
    if not (api_key and secret):
        raise HTTPException(status_code=400, detail="Ödeal bilgileri eksik")
    base = "https://api.odeal.com" if env == "production" else "https://api-stg.odeal.com"
    token_url = "https://auth-sandbox.odeal.com/api/v1/token" if env != "production" else "https://auth.odeal.com/api/v1/token"
    async with httpx.AsyncClient(timeout=20) as http:
        tr = await http.post(token_url, json={"apiKey": api_key, "secretKey": secret})
        if tr.status_code >= 400:
            raise HTTPException(status_code=502, detail="Ödeal kimlik doğrulama başarısız")
        tb = tr.json()
        token = (tb.get("result") or {}).get("accessToken") or tb.get("accessToken")
        if not token:
            raise HTTPException(status_code=502, detail="Ödeal token alınamadı")
        payload = {"amount": float(amount), "currency": "TRY", "externalId": external_id, "returnUrl": return_url}
        if buyer_name:
            payload["buyerName"] = buyer_name
        if buyer_mail:
            payload["buyerMail"] = buyer_mail
        pr = await http.post(base + "/vpos/pay-by-link",
                             headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
                             json=payload)
    try:
        pb = pr.json()
    except Exception:
        raise HTTPException(status_code=502, detail=f"Ödeal yanıtı okunamadı: {pr.text[:150]}")
    if pr.status_code >= 400 or not pb.get("checkout3DUrl"):
        raise HTTPException(status_code=502, detail=pb.get("message") or "Ödeal link oluşturulamadı")
    return pb.get("checkout3DUrl"), pb.get("id")


async def _odeal_check_status(cfg: dict, external_id: str, odeal_id: str) -> str:
    import httpx
    env = (cfg.get("environment") or "production").lower()
    base = "https://api.odeal.com" if env == "production" else "https://api-stg.odeal.com"
    token_url = "https://auth-sandbox.odeal.com/api/v1/token" if env != "production" else "https://auth.odeal.com/api/v1/token"
    async with httpx.AsyncClient(timeout=20) as http:
        tr = await http.post(token_url, json={"apiKey": cfg.get("api_key", ""), "secretKey": cfg.get("secret_key", "")})
        tb = tr.json()
        token = (tb.get("result") or {}).get("accessToken") or tb.get("accessToken")
        r = await http.post(base + "/vpos/check-status",
                            headers={"Authorization": f"Bearer {token}"},
                            json={"id": odeal_id} if odeal_id else {"externalId": external_id})
    try:
        rb = r.json()
    except Exception:
        return ""
    return (rb.get("result") or {}).get("payment_status") or rb.get("payment_status") or ""


class SelectionItem(BaseModel):
    photo_id: str
    album: bool = False
    canvas: bool = False
    retouch: bool = False
    packs: list[str] = []          # bu fotoğrafa atanan özel hizmet paketi id'leri


class SelectionIn(BaseModel):
    selections: list[SelectionItem] = []
    upsells: list[str] = []        # geriye dönük uyumluluk (foto'ya atanmamış genel paketler)
    note: str = ""


def _thumb_bytes(data: bytes):
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(data))
        im = im.convert("RGB")
        im.thumbnail((640, 640))
        out = io.BytesIO()
        im.save(out, format="JPEG", quality=80)
        return out.getvalue()
    except Exception:
        return None


def get_router(db, deps):
    router = APIRouter(prefix="/api", tags=["event-gallery"])
    get_current_studio = build_get_current_studio(db, deps["JWT_SECRET"], deps["JWT_ALGORITHM"])
    new_id = deps["new_id"]
    now_iso = deps["now_iso"]
    put_object = deps["put_object"]
    get_object = deps["get_object"]
    send_email = deps.get("send_email")
    email_configured = deps.get("email_configured")

    def _event_out(ev, counts=None):
        return {
            "id": ev["id"], "name": ev["name"], "client_name": ev.get("client_name", ""),
            "client_phone": ev.get("client_phone", ""),
            "client_email": ev.get("client_email", ""),
            "event_date": ev.get("event_date", ""), "album_limit": ev.get("album_limit", 0),
            "canvas_limit": ev.get("canvas_limit", 0), "retouch_limit": ev.get("retouch_limit", 0),
            "share_token": ev["share_token"], "status": ev.get("status", "open"),
            "submitted": ev.get("submitted", False), "created_at": ev.get("created_at"),
            "photo_count": (counts or {}).get("photos", 0),
            "order_status": ev.get("order_status"),
            "order_status_label": ORDER_LABELS.get(ev.get("order_status"), None),
            "link_expires_at": ev.get("link_expires_at"),
            "originals_delete_at": ev.get("originals_delete_at"),
            "extra_link_used": ev.get("extra_link_used", False),
            "originals_purged": ev.get("originals_purged", False),
            "link_expired": _is_past(ev.get("link_expires_at")),
        }

    def _is_past(iso):
        if not iso:
            return False
        try:
            return datetime.now(timezone.utc) > datetime.fromisoformat(iso)
        except Exception:
            return False

    def _add_days(days):
        from datetime import timedelta
        return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()

    async def _purge_if_due(ev):
        """After the package deletion window, delete only the ORIGINAL hi-res files.
        Thumbnails, filenames (selection codes) and all order/selection metadata are
        preserved so the studio can still reference which photo was which."""
        if ev.get("originals_purged"):
            return ev
        if not _is_past(ev.get("originals_delete_at")):
            return ev
        photos = await db.gallery_photos.find({"event_id": ev["id"]}, {"_id": 0, "id": 1, "path": 1, "original_purged": 1}).to_list(5000)
        for p in photos:
            if p.get("original_purged"):
                continue
            if p.get("path"):
                try:
                    deps.get("delete_object", lambda *_: None)(p["path"])
                except Exception:
                    pass
            await db.gallery_photos.update_one({"id": p["id"]}, {"$set": {"original_purged": True}})
        await db.gallery_events.update_one({"id": ev["id"]}, {"$set": {"originals_purged": True, "status": "expired"}})
        ev["originals_purged"] = True
        ev["status"] = "expired"
        return ev

    # ==================== STUDIO: EVENTS ====================
    @router.post("/studio/gallery/events")
    async def create_event(payload: EventIn, acc: dict = Depends(get_current_studio)):
        state = _studio_state(acc)
        if not state["active"]:
            raise _quota_error("Deneme/abonelik süreniz doldu. Devam etmek için bir paket seçin.")
        max_events = state["limits"].get("max_events", 0)
        current = await db.gallery_events.count_documents({"studio_id": acc["id"]})
        if max_events and current >= max_events:
            raise _quota_error(f"Paket etkinlik limitine ulaştınız ({max_events}). Daha fazlası için paketinizi yükseltin.")
        link_days, del_days = _gallery_durations(acc.get("plan"))
        doc = {
            "id": new_id(), "studio_id": acc["id"], "name": payload.name,
            "client_name": payload.client_name, "client_phone": (payload.client_phone or "").strip(),
            "client_email": (payload.client_email or "").strip(),
            "event_date": payload.event_date,
            "album_limit": payload.album_limit, "canvas_limit": payload.canvas_limit,
            "retouch_limit": payload.retouch_limit,
            "share_token": secrets.token_urlsafe(9), "status": "open",
            "submitted": False, "order_status": None, "created_at": now_iso(),
            "link_expires_at": _add_days(link_days),
            "originals_delete_at": _add_days(del_days),
            "extra_link_used": False, "originals_purged": False,
            "reminder_sent": False,
        }
        await db.gallery_events.insert_one(doc)
        return _event_out(doc)

    @router.post("/studio/gallery/events/{event_id}/extend-link")
    async def extend_link(event_id: str, acc: dict = Depends(get_current_studio)):
        ev = await db.gallery_events.find_one({"id": event_id, "studio_id": acc["id"]}, {"_id": 0})
        if not ev:
            raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
        if ev.get("originals_purged"):
            raise HTTPException(status_code=400, detail="Orijinal dosyalar silindiği için link yenilenemez.")
        link_days, _ = _gallery_durations(acc.get("plan"))
        base = datetime.now(timezone.utc)
        try:
            cur = datetime.fromisoformat(ev["link_expires_at"])
            if cur > base:
                base = cur
        except Exception:
            pass
        from datetime import timedelta
        new_exp = base + timedelta(days=link_days)
        # Client link can never outlive the originals-deletion date (studio window).
        capped = False
        try:
            odel = datetime.fromisoformat(ev["originals_delete_at"])
            if new_exp > odel:
                new_exp = odel
                capped = True
        except Exception:
            pass
        new_exp_iso = new_exp.isoformat()
        await db.gallery_events.update_one({"id": event_id}, {"$set": {"link_expires_at": new_exp_iso, "extra_link_used": True}})
        note = "Müşteri linki yenilendi. Orijinal dosya silinme tarihi değişmedi."
        if capped:
            note = "Link, orijinal dosya silinme tarihine kadar uzatıldı (bu tarihi aşamaz)."
        return {"ok": True, "link_expires_at": new_exp_iso, "note": note}

    @router.get("/studio/gallery/events")
    async def list_events(acc: dict = Depends(get_current_studio)):
        evs = await db.gallery_events.find({"studio_id": acc["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
        out = []
        for ev in evs:
            pc = await db.gallery_photos.count_documents({"event_id": ev["id"]})
            out.append(_event_out(ev, {"photos": pc}))
        return out

    @router.get("/studio/gallery/events/{event_id}")
    async def get_event(event_id: str, acc: dict = Depends(get_current_studio)):
        ev = await db.gallery_events.find_one({"id": event_id, "studio_id": acc["id"]}, {"_id": 0})
        if not ev:
            raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
        ev = await _purge_if_due(ev)
        photos = await db.gallery_photos.find({"event_id": event_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
        for p in photos:
            purged = p.get("original_purged", False)
            p["original_purged"] = purged
            p["url"] = None if purged else f"/api/gallery/photo/{p['id']}"
            p["thumb"] = f"/api/gallery/thumb/{p['id']}" if p.get("thumb_path") else None
        pc = len(photos)
        return {"event": _event_out(ev, {"photos": pc}), "photos": photos}

    @router.delete("/studio/gallery/events/{event_id}")
    async def delete_event(event_id: str, acc: dict = Depends(get_current_studio)):
        ev = await db.gallery_events.find_one({"id": event_id, "studio_id": acc["id"]})
        if not ev:
            raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
        await db.gallery_photos.delete_many({"event_id": event_id})
        await db.gallery_orders.delete_many({"event_id": event_id})
        await db.gallery_events.delete_one({"id": event_id})
        return {"ok": True}

    # ==================== STUDIO: CHUNKED UPLOAD ====================
    @router.post("/studio/gallery/events/{event_id}/upload-init")
    async def upload_init(event_id: str, filename: str = Form(...), size: int = Form(0),
                          total_chunks: int = Form(...), acc: dict = Depends(get_current_studio)):
        ev = await db.gallery_events.find_one({"id": event_id, "studio_id": acc["id"]})
        if not ev:
            raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
        # Per-event storage quota (package-based, e.g. trial 10 GB/event)
        limits = _studio_state(acc)["limits"]
        cap_bytes = int(limits.get("storage_gb", 0)) * 1024 * 1024 * 1024
        if cap_bytes:
            agg = await db.gallery_photos.aggregate([
                {"$match": {"event_id": event_id}},
                {"$group": {"_id": None, "total": {"$sum": "$size"}}},
            ]).to_list(1)
            used = (agg[0]["total"] if agg else 0) or 0
            if used + max(0, size) > cap_bytes:
                raise _quota_error(f"Etkinlik yükleme limitine ulaştınız ({limits.get('storage_gb')} GB). Daha fazlası için paketinizi yükseltin.")
        upload_id = new_id()
        ext = (filename.rsplit(".", 1)[-1] if "." in filename else "").lower()
        _UPLOADS[upload_id] = {
            "event_id": event_id, "studio_id": acc["id"], "filename": filename,
            "ext": ext, "size": size, "total": total_chunks, "chunks": {},
        }
        return {"upload_id": upload_id, "is_raw": ext in RAW_EXTS,
                "warning": "RAW dosyalar büyüktür ve tarayıcıda önizlenemez." if ext in RAW_EXTS else None}

    @router.post("/studio/gallery/upload-chunk/{upload_id}")
    async def upload_chunk(upload_id: str, index: int = Form(...), chunk: UploadFile = File(...),
                           acc: dict = Depends(get_current_studio)):
        u = _UPLOADS.get(upload_id)
        if not u or u["studio_id"] != acc["id"]:
            raise HTTPException(status_code=404, detail="Yükleme oturumu bulunamadı")
        u["chunks"][index] = await chunk.read()
        return {"received": index, "count": len(u["chunks"]), "total": u["total"]}

    @router.post("/studio/gallery/upload-complete/{upload_id}")
    async def upload_complete(upload_id: str, acc: dict = Depends(get_current_studio)):
        u = _UPLOADS.get(upload_id)
        if not u or u["studio_id"] != acc["id"]:
            raise HTTPException(status_code=404, detail="Yükleme oturumu bulunamadı")
        if len(u["chunks"]) != u["total"]:
            raise HTTPException(status_code=400, detail="Eksik parça var, yükleme tamamlanamadı")
        data = b"".join(u["chunks"][i] for i in sorted(u["chunks"].keys()))
        ext = u["ext"] or "bin"
        is_raw = ext in RAW_EXTS
        photo_id = new_id()
        content_type = f"image/{'jpeg' if ext in ('jpg','jpeg') else ext}" if not is_raw else "application/octet-stream"
        path = f"gallery/{u['studio_id']}/{u['event_id']}/{photo_id}.{ext}"
        put_object(path, data, content_type)
        thumb_path = None
        if not is_raw:
            tb = _thumb_bytes(data)
            if tb:
                thumb_path = f"gallery/{u['studio_id']}/{u['event_id']}/{photo_id}_thumb.jpg"
                put_object(thumb_path, tb, "image/jpeg")
        doc = {
            "id": photo_id, "event_id": u["event_id"], "studio_id": u["studio_id"],
            "filename": u["filename"], "path": path, "thumb_path": thumb_path,
            "content_type": content_type, "size": len(data), "is_raw": is_raw,
            "sel_album": False, "sel_canvas": False, "sel_retouch": False,
            "created_at": now_iso(),
        }
        await db.gallery_photos.insert_one(doc)
        del _UPLOADS[upload_id]
        return {"id": photo_id, "is_raw": is_raw, "filename": u["filename"],
                "url": f"/api/gallery/photo/{photo_id}",
                "thumb": f"/api/gallery/thumb/{photo_id}" if thumb_path else None}

    @router.delete("/studio/gallery/photos/{photo_id}")
    async def delete_photo(photo_id: str, acc: dict = Depends(get_current_studio)):
        r = await db.gallery_photos.delete_one({"id": photo_id, "studio_id": acc["id"]})
        if r.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Fotoğraf bulunamadı")
        return {"ok": True}

    @router.get("/studio/gallery/events/{event_id}/download")
    async def download_originals(event_id: str, acc: dict = Depends(get_current_studio)):
        """Studio-only ZIP of ORIGINAL hi-res files (no watermark). Filenames = selection codes."""
        ev = await db.gallery_events.find_one({"id": event_id, "studio_id": acc["id"]}, {"_id": 0})
        if not ev:
            raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
        if ev.get("originals_purged"):
            raise HTTPException(status_code=400, detail="Orijinal dosyalar silme süresi dolduğu için indirilemez.")
        photos = await db.gallery_photos.find({"event_id": event_id}, {"_id": 0}).sort("created_at", 1).to_list(5000)
        if not photos:
            raise HTTPException(status_code=404, detail="Bu etkinlikte fotoğraf yok.")
        buf = io.BytesIO()
        used = set()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
            for p in photos:
                if p.get("original_purged") or not p.get("path"):
                    continue
                try:
                    data, _ct = get_object(p["path"])
                except Exception:
                    continue
                name = p.get("filename") or f"{p['id']}.jpg"
                # de-dupe filenames inside the zip
                base_name, i = name, 1
                while name in used:
                    stem, dot, ext = base_name.rpartition(".")
                    name = f"{stem}_{i}.{ext}" if dot else f"{base_name}_{i}"
                    i += 1
                used.add(name)
                zf.writestr(name, data)
        buf.seek(0)
        safe = "".join(ch for ch in (ev.get("name") or "etkinlik") if ch.isalnum() or ch in "-_") or "etkinlik"
        return StreamingResponse(buf, media_type="application/zip",
                                 headers={"Content-Disposition": f'attachment; filename="{safe}-orijinaller.zip"'})

    # ==================== STUDIO: SERVICE PACKS (UPSELL) ====================
    @router.get("/studio/gallery/service-packs")
    async def list_packs(acc: dict = Depends(get_current_studio)):
        return await db.gallery_service_packs.find({"studio_id": acc["id"]}, {"_id": 0}).sort("created_at", 1).to_list(100)

    @router.post("/studio/gallery/service-packs")
    async def create_pack(payload: ServicePackIn, acc: dict = Depends(get_current_studio)):
        doc = payload.model_dump()
        doc.update({"id": new_id(), "studio_id": acc["id"], "created_at": now_iso()})
        await db.gallery_service_packs.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.put("/studio/gallery/service-packs/{pid}")
    async def update_pack(pid: str, payload: ServicePackIn, acc: dict = Depends(get_current_studio)):
        r = await db.gallery_service_packs.update_one({"id": pid, "studio_id": acc["id"]}, {"$set": payload.model_dump()})
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Paket bulunamadı")
        return await db.gallery_service_packs.find_one({"id": pid}, {"_id": 0})

    @router.delete("/studio/gallery/service-packs/{pid}")
    async def delete_pack(pid: str, acc: dict = Depends(get_current_studio)):
        r = await db.gallery_service_packs.delete_one({"id": pid, "studio_id": acc["id"]})
        if r.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Paket bulunamadı")
        return {"ok": True}

    # ==================== STUDIO: ORDERS ====================
    @router.get("/studio/gallery/orders")
    async def list_orders(acc: dict = Depends(get_current_studio)):
        q = {"studio_id": acc["id"]}
        # Employees see only orders assigned to them; owner sees all.
        if not acc.get("_is_owner", True):
            q["assigned_to"] = acc.get("_emp_id")
        orders = await db.gallery_orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(300)
        for o in orders:
            o["status_label"] = ORDER_LABELS.get(o.get("status"), o.get("status"))
        return orders

    @router.get("/studio/gallery/order-flow")
    async def order_flow(acc: dict = Depends(get_current_studio)):
        return {"flow": [{"key": k, "label": ORDER_LABELS[k]} for k in ORDER_FLOW]}

    @router.put("/studio/gallery/orders/{order_id}/status")
    async def update_order_status(order_id: str, request: Request, acc: dict = Depends(get_current_studio)):
        body = await request.json()
        status = body.get("status")
        # Accept new 5-step flow + legacy values for backward compatibility.
        if status not in set(ORDER_FLOW) | {"ready", "delivered", "processing"}:
            raise HTTPException(status_code=400, detail="Geçersiz durum")
        order = await db.gallery_orders.find_one({"id": order_id, "studio_id": acc["id"]})
        if not order:
            raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
        await db.gallery_orders.update_one({"id": order_id}, {"$set": {"status": status}})
        await db.gallery_events.update_one({"id": order["event_id"]}, {"$set": {"order_status": status}})
        return {"ok": True, "status": status, "status_label": ORDER_LABELS.get(status, status)}

    @router.put("/studio/gallery/orders/{order_id}/assign")
    async def assign_order(order_id: str, request: Request, acc: dict = Depends(get_current_studio)):
        if not acc.get("_is_owner", True):
            raise HTTPException(status_code=403, detail="Yalnızca firma sahibi personel atayabilir.")
        body = await request.json()
        emp_id = body.get("employee_id") or None
        assigned_name = None
        if emp_id:
            emp = await db.studio_employees.find_one({"id": emp_id, "studio_id": acc["id"]}, {"_id": 0})
            if not emp:
                raise HTTPException(status_code=404, detail="Çalışan bulunamadı")
            assigned_name = emp.get("name") or emp.get("username")
        r = await db.gallery_orders.update_one({"id": order_id, "studio_id": acc["id"]},
                                               {"$set": {"assigned_to": emp_id, "assigned_name": assigned_name}})
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
        return {"ok": True, "assigned_to": emp_id, "assigned_name": assigned_name}

    # ==================== STUDIO: GALLERY SETTINGS (watermark / originals) ====================
    @router.get("/studio/gallery/settings")
    async def get_gallery_settings(acc: dict = Depends(get_current_studio)):
        trial = (acc.get("plan") or "trial") == "trial"
        return {
            "watermark": True if trial else acc.get("gallery_watermark", True),
            "allow_originals": False if trial else acc.get("gallery_allow_originals", False),
            "watermark_forced": trial,
        }

    @router.put("/studio/gallery/settings")
    async def set_gallery_settings(request: Request, acc: dict = Depends(get_current_studio)):
        if not acc.get("_is_owner", True):
            raise HTTPException(status_code=403, detail="Yalnızca firma sahibi değiştirebilir.")
        body = await request.json()
        upd = {}
        if "watermark" in body:
            upd["gallery_watermark"] = bool(body["watermark"])
        if "allow_originals" in body:
            upd["gallery_allow_originals"] = bool(body["allow_originals"])
        if upd:
            await db.studio_accounts.update_one({"id": acc["id"]}, {"$set": upd})
        trial = (acc.get("plan") or "trial") == "trial"
        return {"ok": True, "watermark_forced": trial}

    # ==================== STUDIO: EXPIRY REMINDERS (24h before deletion) ====================
    @router.get("/studio/gallery/reminders")
    async def gallery_reminders(acc: dict = Depends(get_current_studio)):
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        horizon = now + timedelta(hours=24)
        evs = await db.gallery_events.find(
            {"studio_id": acc["id"], "originals_purged": {"$ne": True}}, {"_id": 0}
        ).to_list(500)
        firma = acc.get("firma_adi", "Stüdyo")
        out = []
        for ev in evs:
            dstr = ev.get("originals_delete_at")
            if not dstr:
                continue
            try:
                dt = datetime.fromisoformat(dstr)
            except Exception:
                continue
            if dt > horizon:  # not within the next 24h yet
                continue
            msg = (f"Merhaba, {ev.get('name')} etkinliği fotoğraflarınızın indirme süresi yakında sona erecek. "
                   f"Fotoğraflarınızı indirmediyseniz lütfen süre bitmeden işleminizi tamamlayın. "
                   f"Süreyi uzatmak için paket satın alabilirsiniz. — {firma}")
            digits = "".join(ch for ch in (ev.get("client_phone") or "") if ch.isdigit())
            wa = None
            if digits:
                num = digits if digits.startswith("90") else "90" + digits.lstrip("0")
                wa = f"https://wa.me/{num}?text={quote(msg)}"
            emailed = ev.get("reminder_sent", False)
            if not emailed and ev.get("client_email") and send_email and email_configured and email_configured():
                try:
                    await send_email(ev["client_email"], f"İndirme süreniz sona eriyor — {ev.get('name')}",
                                     f"<p>Merhaba,</p><p>{msg}</p>", msg)
                    await db.gallery_events.update_one({"id": ev["id"]}, {"$set": {"reminder_sent": True}})
                    emailed = True
                except Exception:
                    pass
            out.append({
                "id": ev["id"], "name": ev.get("name"), "client_name": ev.get("client_name", ""),
                "client_phone": ev.get("client_phone", ""), "client_email": ev.get("client_email", ""),
                "originals_delete_at": dstr, "reminder_sent": emailed,
                "whatsapp_url": wa, "whatsapp_message": msg, "overdue": dt < now,
            })
        out.sort(key=lambda x: x["originals_delete_at"])
        return {"reminders": out}


    @router.get("/studio/gallery/orders/{order_id}/pdf")
    async def order_pdf(order_id: str, acc: dict = Depends(get_current_studio)):
        order = await db.gallery_orders.find_one({"id": order_id, "studio_id": acc["id"]}, {"_id": 0})
        if not order:
            raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
        pdf = _build_order_pdf(order, acc)
        return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                                 headers={"Content-Disposition": f'attachment; filename="siparis-{order.get("order_no","")}.pdf"'})

    # ==================== PUBLIC: CLIENT SELECTION ====================
    @router.get("/gallery/public/{token}")
    async def public_event(token: str):
        ev = await db.gallery_events.find_one({"share_token": token}, {"_id": 0})
        if not ev:
            raise HTTPException(status_code=404, detail="Galeri bulunamadı")
        ev = await _purge_if_due(ev)
        # Link expiry: block access to photos when the client link window has passed.
        link_expired = _is_past(ev.get("link_expires_at"))
        studio = await db.studio_accounts.find_one({"id": ev["studio_id"]}, {"_id": 0, "firma_adi": 1, "plan": 1, "gallery_watermark": 1, "gallery_allow_originals": 1})
        trial = ((studio or {}).get("plan") or "trial") == "trial"
        watermark = True if trial else (studio or {}).get("gallery_watermark", True)
        allow_originals = False if trial else (studio or {}).get("gallery_allow_originals", False)
        base = {
            "event": {"name": ev["name"], "client_name": ev.get("client_name", ""),
                      "event_date": ev.get("event_date", ""), "album_limit": ev.get("album_limit", 0),
                      "canvas_limit": ev.get("canvas_limit", 0), "retouch_limit": ev.get("retouch_limit", 0),
                      "submitted": ev.get("submitted", False), "status": ev.get("status", "open"),
                      "order_status": ev.get("order_status"),
                      "order_status_label": ORDER_LABELS.get(ev.get("order_status")),
                      "link_expires_at": ev.get("link_expires_at")},
            "firma_adi": (studio or {}).get("firma_adi", "Stüdyo"),
            "order_flow": [{"key": k, "label": ORDER_LABELS[k]} for k in ORDER_FLOW],
            "watermark": watermark, "allow_originals": allow_originals,
            "link_expired": link_expired, "originals_purged": ev.get("originals_purged", False),
        }
        if link_expired or ev.get("originals_purged"):
            base["photos"] = []
            base["service_packs"] = []
            base["message"] = "Galeri görüntüleme/indirme süresi doldu. Yeni erişim için fotoğrafçınızla iletişime geçin."
            return base
        photos = await db.gallery_photos.find({"event_id": ev["id"]}, {"_id": 0}).sort("created_at", 1).to_list(1000)
        clean = []
        for p in photos:
            has_thumb = bool(p.get("thumb_path")) and not p.get("is_raw")
            clean.append({
                "id": p["id"], "filename": p.get("filename", ""), "is_raw": p.get("is_raw", False),
                "url": f"/api/gallery/photo/{p['id']}",
                "thumb": f"/api/gallery/thumb/{p['id']}" if has_thumb else None,
            })
        packs = await db.gallery_service_packs.find({"studio_id": ev["studio_id"], "active": True}, {"_id": 0}).to_list(100)
        base["photos"] = clean
        base["service_packs"] = packs
        return base

    @router.post("/gallery/public/{token}/select")
    async def public_select(token: str, payload: SelectionIn):
        ev = await db.gallery_events.find_one({"share_token": token})
        if not ev:
            raise HTTPException(status_code=404, detail="Galeri bulunamadı")
        if _is_past(ev.get("link_expires_at")) or ev.get("originals_purged"):
            raise HTTPException(status_code=403, detail="Galeri süresi doldu. Fotoğrafçınızla iletişime geçin.")
        if ev.get("submitted"):
            raise HTTPException(status_code=400, detail="Seçim zaten gönderilmiş")
        # Photo id -> filename (selection code) map for photos belonging to this event
        photo_docs = await db.gallery_photos.find({"event_id": ev["id"]}, {"_id": 0, "id": 1, "filename": 1}).to_list(5000)
        code_of = {p["id"]: (p.get("filename") or p["id"]) for p in photo_docs}
        valid_ids = set(code_of.keys())
        sels = [s for s in payload.selections if s.photo_id in valid_ids]
        album_n = sum(1 for s in sels if s.album)
        canvas_n = sum(1 for s in sels if s.canvas)
        retouch_n = sum(1 for s in sels if s.retouch)
        # Katı albüm/kanvas/retouch limitleri (0 = sınırsız)
        if ev.get("album_limit", 0) and album_n > ev["album_limit"]:
            raise HTTPException(status_code=400, detail=f"Albüm limiti {ev['album_limit']}. {album_n} seçtiniz.")
        if ev.get("canvas_limit", 0) and canvas_n > ev["canvas_limit"]:
            raise HTTPException(status_code=400, detail=f"Kanvas limiti {ev['canvas_limit']}. {canvas_n} seçtiniz.")
        if ev.get("retouch_limit", 0) and retouch_n > ev["retouch_limit"]:
            raise HTTPException(status_code=400, detail=f"Retouch limiti {ev['retouch_limit']}. {retouch_n} seçtiniz.")

        # Persist per-photo album/canvas/retouch flags
        for s in sels:
            await db.gallery_photos.update_one(
                {"id": s.photo_id, "event_id": ev["id"]},
                {"$set": {"sel_album": s.album, "sel_canvas": s.canvas, "sel_retouch": s.retouch}})

        # Selection codes for the studio (filenames)
        album_codes = [code_of[s.photo_id] for s in sels if s.album]
        canvas_codes = [code_of[s.photo_id] for s in sels if s.canvas]
        retouch_codes = [code_of[s.photo_id] for s in sels if s.retouch]

        # Per-photo custom service pack assignments → {pack_id: [photo_ids]}
        pack_map: dict = {}
        for s in sels:
            for pid in (s.packs or []):
                pack_map.setdefault(pid, []).append(s.photo_id)
        # Merge legacy global upsells (no photo assigned)
        for pid in (payload.upsells or []):
            pack_map.setdefault(pid, [])

        pack_details = []
        upsell_total = 0.0
        if pack_map:
            pdocs = await db.gallery_service_packs.find(
                {"id": {"$in": list(pack_map.keys())}, "studio_id": ev["studio_id"]}, {"_id": 0}).to_list(200)
            pdoc_by_id = {d["id"]: d for d in pdocs}
            for pid, photo_ids in pack_map.items():
                d = pdoc_by_id.get(pid)
                if not d:
                    continue
                max_qty = int(d.get("max_qty") or 0)
                qty = len(photo_ids)
                if max_qty and qty > max_qty:
                    raise HTTPException(status_code=400,
                                        detail=f"{d['name']} için en fazla {max_qty} fotoğraf seçebilirsiniz ({qty} seçtiniz).")
                unit = float(d.get("price", 0) or 0)
                billed_qty = qty if qty > 0 else 1
                line_total = unit * billed_qty
                upsell_total += line_total
                pack_details.append({
                    "id": pid, "name": d.get("name", ""), "kind": d.get("kind") or "Diğer",
                    "price": unit, "qty": qty, "total": line_total,
                    "codes": [code_of[x] for x in photo_ids],
                })

        # Backward-compatible flat upsells list
        packs = [{"name": p["name"], "price": p["price"]} for p in pack_details]

        order_no = "SIP-" + secrets.token_hex(3).upper()
        needs_payment = upsell_total > 0
        order = {
            "id": new_id(), "order_no": order_no, "event_id": ev["id"], "studio_id": ev["studio_id"],
            "event_name": ev["name"], "client_name": ev.get("client_name", ""),
            "album_count": album_n, "canvas_count": canvas_n, "retouch_count": retouch_n,
            "album_codes": album_codes, "canvas_codes": canvas_codes, "retouch_codes": retouch_codes,
            "pack_details": pack_details,
            "upsells": packs, "upsell_total": upsell_total, "note": payload.note,
            "status": "new", "created_at": now_iso(),
            "payment_status": "unpaid" if needs_payment else "none",
            "payment_provider": None, "payment_method_id": None,
            "payment_ref": None, "paid_at": None,
        }
        await db.gallery_orders.insert_one(order)
        await db.gallery_events.update_one({"id": ev["id"]}, {"$set": {"submitted": True, "order_status": "new"}})
        order.pop("_id", None)

        # Central admin notification (critical) with firma tag
        try:
            _st = await db.studio_accounts.find_one({"id": ev["studio_id"]}, {"_id": 0, "firma_adi": 1})
            _firma = (_st or {}).get("firma_adi", "Stüdyo")
            await db.notifications.insert_one({
                "id": new_id(), "kind": "gallery_order",
                "title": "Yeni galeri seçimi",
                "message": f"{_firma} · {ev['name']} ({order_no}) · Albüm {album_n}, Kanvas {canvas_n}, Rötuş {retouch_n}",
                "severity": "critical", "firma_adi": _firma,
                "link": "/studyo/galeri", "read": False, "read_at": None, "created_at": now_iso(),
            })
        except Exception:
            pass

        # Notify the studio by email (best-effort; never blocks the client)
        try:
            if send_email and email_configured and email_configured():
                studio = await db.studio_accounts.find_one({"id": ev["studio_id"]}, {"_id": 0, "email": 1, "firma_adi": 1, "notify_email": 1, "notify_enabled": 1})
                to = (studio or {}).get("notify_email") or (studio or {}).get("email")
                if to and (studio or {}).get("notify_enabled", True):
                    firma = (studio or {}).get("firma_adi", "Stüdyo")
                    def _codes(lst):
                        return ", ".join(lst) if lst else "-"
                    up = "".join(
                        f"<li><b>{d['name']}</b> ({d['kind']}) — {d['qty']} adet · {d['total']:.0f}₺"
                        f"<br/><span style='color:#666'>Kodlar: {_codes(d['codes'])}</span></li>"
                        for d in pack_details) or "<li>-</li>"
                    subject = f"Yeni galeri seçimi: {ev['name']} ({order_no})"
                    html = (
                        f"<h2>Yeni müşteri seçimi geldi</h2>"
                        f"<p><b>{firma}</b> · Etkinlik: <b>{ev['name']}</b></p>"
                        f"<p>Müşteri: {ev.get('client_name','-')}<br/>Sipariş No: <b>{order_no}</b></p>"
                        f"<ul>"
                        f"<li>Albüm: {album_n} — <span style='color:#666'>{_codes(album_codes)}</span></li>"
                        f"<li>Kanvas: {canvas_n} — <span style='color:#666'>{_codes(canvas_codes)}</span></li>"
                        f"<li>Rötuş: {retouch_n} — <span style='color:#666'>{_codes(retouch_codes)}</span></li>"
                        f"</ul>"
                        f"<p>Ek Hizmetler (fotoğraf kodlarıyla):</p><ul>{up}</ul>"
                        f"<p>Not: {payload.note or '-'}</p>"
                        f"<p>Fotuber Stüdyo Paneli</p>"
                    )
                    text = f"Yeni seçim: {ev['name']} ({order_no}) - Albüm {album_n}, Kanvas {canvas_n}, Rötuş {retouch_n}"
                    await send_email(to, subject, html, text)
        except Exception:
            pass

        # Payment options for the client (only when there are paid services)
        pay_methods = []
        if needs_payment:
            raw = await db.studio_payment_methods.find(
                {"studio_id": ev["studio_id"], "active": True}, {"_id": 0}).sort("created_at", 1).to_list(50)
            pay_methods = [_public_method(m) for m in raw]

        return {"ok": True, "order_no": order_no, "order_id": order["id"],
                "upsell_total": upsell_total, "needs_payment": needs_payment,
                "payment_methods": pay_methods}

    # ==================== PUBLIC: PHOTO SERVING ====================
    @router.get("/gallery/photo/{photo_id}")
    async def serve_photo(photo_id: str):
        p = await db.gallery_photos.find_one({"id": photo_id}, {"_id": 0})
        if not p:
            raise HTTPException(status_code=404, detail="Fotoğraf bulunamadı")
        data, ctype = get_object(p["path"])
        return StarletteResponse(content=data, media_type=ctype or "application/octet-stream",
                                 headers={"Cache-Control": "public, max-age=86400"})

    @router.get("/gallery/thumb/{photo_id}")
    async def serve_thumb(photo_id: str):
        p = await db.gallery_photos.find_one({"id": photo_id}, {"_id": 0})
        if not p or not p.get("thumb_path"):
            raise HTTPException(status_code=404, detail="Önizleme yok")
        data, ctype = get_object(p["thumb_path"])
        return StarletteResponse(content=data, media_type="image/jpeg",
                                 headers={"Cache-Control": "public, max-age=86400"})

    # ===================== ÖDEME YÖNTEMLERİ (Stüdyoya Özel Ödeme) =====================
    @router.get("/studio/gallery/payment-providers")
    async def payment_providers(acc: dict = Depends(get_current_studio)):
        return {"providers": PAYMENT_PROVIDERS}

    @router.get("/studio/gallery/payment-methods")
    async def list_payment_methods(acc: dict = Depends(get_current_studio)):
        raw = await db.studio_payment_methods.find({"studio_id": acc["id"]}, {"_id": 0}).sort("created_at", 1).to_list(50)
        return [_redact_method(m) for m in raw]

    @router.post("/studio/gallery/payment-methods")
    async def create_payment_method(payload: PaymentMethodIn, acc: dict = Depends(get_current_studio)):
        if payload.provider not in {p["provider"] for p in PAYMENT_PROVIDERS}:
            raise HTTPException(status_code=400, detail="Geçersiz ödeme sağlayıcısı")
        doc = {"id": new_id(), "studio_id": acc["id"], "provider": payload.provider,
               "label": payload.label or _provider_label(payload.provider),
               "active": payload.active, "config": payload.config or {}, "created_at": now_iso()}
        await db.studio_payment_methods.insert_one(doc)
        return _redact_method(doc)

    @router.put("/studio/gallery/payment-methods/{mid}")
    async def update_payment_method(mid: str, payload: PaymentMethodIn, acc: dict = Depends(get_current_studio)):
        cur = await db.studio_payment_methods.find_one({"id": mid, "studio_id": acc["id"]}, {"_id": 0})
        if not cur:
            raise HTTPException(status_code=404, detail="Yöntem bulunamadı")
        # Keep existing secret values if the incoming config left them masked/blank.
        new_cfg = dict(payload.config or {})
        old_cfg = cur.get("config") or {}
        for k in _SECRET_KEYS:
            v = new_cfg.get(k)
            if k in new_cfg and (not v or str(v).startswith("••••••")):
                new_cfg[k] = old_cfg.get(k, "")
        await db.studio_payment_methods.update_one(
            {"id": mid, "studio_id": acc["id"]},
            {"$set": {"label": payload.label or _provider_label(payload.provider),
                      "active": payload.active, "config": new_cfg, "provider": payload.provider}})
        doc = await db.studio_payment_methods.find_one({"id": mid}, {"_id": 0})
        return _redact_method(doc)

    @router.delete("/studio/gallery/payment-methods/{mid}")
    async def delete_payment_method(mid: str, acc: dict = Depends(get_current_studio)):
        r = await db.studio_payment_methods.delete_one({"id": mid, "studio_id": acc["id"]})
        if r.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Yöntem bulunamadı")
        return {"ok": True}

    async def _finalize_paid(order: dict, ref: str = ""):
        if order.get("payment_status") == "paid":
            return
        await db.gallery_orders.update_one(
            {"id": order["id"], "payment_status": {"$ne": "paid"}},
            {"$set": {"payment_status": "paid", "paid_at": now_iso(), "payment_ref": ref}})
        try:
            _st = await db.studio_accounts.find_one({"id": order["studio_id"]}, {"_id": 0, "firma_adi": 1})
            _firma = (_st or {}).get("firma_adi", "Stüdyo")
            await db.notifications.insert_one({
                "id": new_id(), "kind": "gallery_payment", "title": "Galeri ödemesi alındı",
                "message": f"{_firma} · {order.get('event_name','')} ({order.get('order_no','')}) · {order.get('upsell_total',0):.0f}₺ ödendi",
                "severity": "info", "firma_adi": _firma, "link": "/studyo/galeri",
                "read": False, "read_at": None, "created_at": now_iso()})
        except Exception:
            pass

    @router.put("/studio/gallery/orders/{oid}/confirm-payment")
    async def confirm_payment(oid: str, acc: dict = Depends(get_current_studio)):
        """Manuel yöntemler (IBAN/Nakit/Ödeme Linki) için fotoğrafçının ödemeyi onaylaması."""
        order = await db.gallery_orders.find_one({"id": oid, "studio_id": acc["id"]}, {"_id": 0})
        if not order:
            raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
        await _finalize_paid(order, ref="manual")
        return {"ok": True, "payment_status": "paid"}

    # ===================== PUBLIC ÖDEME AKIŞI =====================
    @router.post("/gallery/public/{token}/orders/{oid}/pay")
    async def public_pay(token: str, oid: str, payload: dict, request: Request):
        ev = await db.gallery_events.find_one({"share_token": token}, {"_id": 0})
        if not ev:
            raise HTTPException(status_code=404, detail="Galeri bulunamadı")
        order = await db.gallery_orders.find_one({"id": oid, "event_id": ev["id"]}, {"_id": 0})
        if not order:
            raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
        if order.get("payment_status") == "paid":
            return {"paid": True}
        method = await db.studio_payment_methods.find_one(
            {"id": payload.get("method_id"), "studio_id": ev["studio_id"], "active": True}, {"_id": 0})
        if not method:
            raise HTTPException(status_code=400, detail="Ödeme yöntemi bulunamadı")
        prov = method["provider"]
        cfg = method.get("config") or {}
        amount = float(order.get("upsell_total") or 0)
        title = f"{ev['name']} - Ek Hizmet ({order['order_no']})"
        await db.gallery_orders.update_one({"id": oid}, {"$set": {
            "payment_provider": prov, "payment_method_id": method["id"], "payment_status": "pending"}})

        origin = f"{request.base_url}".rstrip("/").replace("http://", "https://")
        if prov == "paytr":
            cb_id = "gal" + secrets.token_hex(10)
            cb = f"{origin}/api/gallery/pay/paytr-callback"
            link = await _paytr_gallery_link(cfg, title[:60], str(int(round(amount * 100))), cb, cb_id)
            await db.gallery_orders.update_one({"id": oid}, {"$set": {"payment_callback_id": cb_id}})
            return {"redirect_url": link, "auto": True}
        if prov == "iyzico":
            url, tok = await _iyzico_gallery_link(cfg, oid, title, f"{amount:.2f}")
            await db.gallery_orders.update_one({"id": oid}, {"$set": {"payment_token": tok}})
            return {"redirect_url": url, "auto": True}
        if prov == "odeal":
            ext = f"{ev['studio_id']}:{oid}"
            cb = f"{origin}/api/gallery/pay/odeal-callback/{ev['studio_id']}"
            url, odid = await _odeal_gallery_link(cfg, ext, amount, cb,
                                                  buyer_name=order.get("client_name", ""),
                                                  buyer_mail=payload.get("email", ""))
            await db.gallery_orders.update_one({"id": oid}, {"$set": {"payment_ref": odid, "payment_external_id": ext}})
            return {"redirect_url": url, "auto": True}
        if prov == "link":
            return {"redirect_url": cfg.get("url", ""), "auto": False, "requires_confirm": True}
        # iban / cash → manual
        return {"auto": False, "requires_confirm": True, "info": _public_method(method)["info"]}

    @router.post("/gallery/public/{token}/orders/{oid}/mark-paid")
    async def public_mark_paid(token: str, oid: str):
        """Müşteri manuel yöntemlerde 'Ödedim' dediğinde sipariş onay bekler duruma geçer."""
        ev = await db.gallery_events.find_one({"share_token": token}, {"_id": 0})
        if not ev:
            raise HTTPException(status_code=404, detail="Galeri bulunamadı")
        order = await db.gallery_orders.find_one({"id": oid, "event_id": ev["id"]}, {"_id": 0})
        if not order:
            raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
        if order.get("payment_status") != "paid":
            await db.gallery_orders.update_one({"id": oid}, {"$set": {"payment_status": "awaiting_confirm"}})
        return {"ok": True, "payment_status": "awaiting_confirm"}

    @router.get("/gallery/public/{token}/orders/{oid}/status")
    async def public_order_status(token: str, oid: str):
        ev = await db.gallery_events.find_one({"share_token": token}, {"_id": 0})
        if not ev:
            raise HTTPException(status_code=404, detail="Galeri bulunamadı")
        order = await db.gallery_orders.find_one({"id": oid, "event_id": ev["id"]}, {"_id": 0, "payment_status": 1})
        if not order:
            raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
        return {"payment_status": order.get("payment_status", "none")}

    # ---- Gateway callbacks (server-to-server, no auth) ----
    @router.post("/gallery/pay/paytr-callback")
    async def paytr_gallery_callback(request: Request):
        form = await request.form()
        post = {k: str(v) for k, v in form.items()}
        cb_id = post.get("callback_id", "")
        order = await db.gallery_orders.find_one({"payment_callback_id": cb_id}, {"_id": 0})
        if not order:
            return StarletteResponse("OK", media_type="text/plain")
        method = await db.studio_payment_methods.find_one({"id": order.get("payment_method_id")}, {"_id": 0})
        cfg = (method or {}).get("config") or {}
        if post.get("merchant_id") and cfg.get("merchant_id") and post["merchant_id"] != str(cfg["merchant_id"]):
            return StarletteResponse("PAYTR merchant mismatch", media_type="text/plain")
        msg = cb_id + post.get("merchant_oid", "") + cfg.get("merchant_salt", "") + post.get("status", "") + post.get("total_amount", "")
        expected = _hmac_b64(cfg.get("merchant_key", ""), msg)
        import hmac as _hmac
        if not _hmac.compare_digest(expected, post.get("hash", "")):
            return StarletteResponse("PAYTR bad hash", media_type="text/plain")
        if post.get("status") == "success":
            await _finalize_paid(order, ref=post.get("merchant_oid", "paytr"))
        return StarletteResponse("OK", media_type="text/plain")

    @router.post("/gallery/pay/iyzico-webhook")
    async def iyzico_gallery_webhook(request: Request):
        try:
            payload = await request.json()
        except Exception:
            return {"received": True}
        conv = payload.get("paymentConversationId") or payload.get("conversationId")
        tok = payload.get("token")
        order = await db.gallery_orders.find_one(
            {"$or": [{"id": conv}, {"payment_token": tok}]}, {"_id": 0})
        if not order:
            return {"received": True}
        method = await db.studio_payment_methods.find_one({"id": order.get("payment_method_id")}, {"_id": 0})
        secret = ((method or {}).get("config") or {}).get("secret_key", "")
        sig = request.headers.get("X-IYZ-SIGNATURE-V3", "")
        import hashlib
        import hmac as _hmac
        raw = secret + str(payload.get("iyziEventType", "")) + str(payload.get("iyziPaymentId", "")) + \
            str(payload.get("token", "")) + str(payload.get("paymentConversationId", "")) + str(payload.get("status", ""))
        expected = _hmac.new(secret.encode(), raw.encode(), hashlib.sha256).hexdigest()
        if sig and _hmac.compare_digest(expected.lower(), sig.lower()) and payload.get("status") == "SUCCESS":
            await _finalize_paid(order, ref=str(payload.get("iyziPaymentId", "iyzico")))
        return {"received": True}

    @router.post("/gallery/pay/odeal-callback/{studio_id}")
    async def odeal_gallery_callback(studio_id: str, request: Request):
        try:
            event = await request.json()
        except Exception:
            return {"received": True}
        ext = event.get("externalId", "")
        odid = event.get("id")
        order = await db.gallery_orders.find_one(
            {"$or": [{"payment_external_id": ext}, {"payment_ref": str(odid)}], "studio_id": studio_id}, {"_id": 0})
        if not order:
            return {"received": True}
        method = await db.studio_payment_methods.find_one({"id": order.get("payment_method_id")}, {"_id": 0})
        cfg = (method or {}).get("config") or {}
        try:
            status = await _odeal_check_status(cfg, ext, str(odid))
        except Exception:
            status = ""
        if str(status).upper() == "COMPLETED":
            await _finalize_paid(order, ref=str(odid))
        return {"received": True}

    return router


def _build_order_pdf(order: dict, acc: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as pdfcanvas

    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=A4)
    w, h = A4
    y = h - 30 * mm
    c.setFont("Helvetica-Bold", 18)
    c.drawString(25 * mm, y, "Siparis Formu")
    c.setFont("Helvetica", 10)
    c.drawRightString(w - 25 * mm, y, acc.get("firma_adi", "Studio"))
    y -= 6 * mm
    c.setStrokeColorRGB(0.8, 0.8, 0.8)
    c.line(25 * mm, y, w - 25 * mm, y)
    y -= 12 * mm

    def row(label, value):
        nonlocal y
        c.setFont("Helvetica-Bold", 11)
        c.drawString(25 * mm, y, f"{label}:")
        c.setFont("Helvetica", 11)
        c.drawString(70 * mm, y, str(value))
        y -= 8 * mm

    row("Siparis No", order.get("order_no", ""))
    row("Etkinlik", order.get("event_name", ""))
    row("Musteri", order.get("client_name", "") or "-")
    row("Tarih", (order.get("created_at", "") or "")[:10])
    row("Durum", order.get("status", ""))

    def codes_block(title, codes):
        nonlocal y
        if not codes:
            return
        c.setFont("Helvetica-Bold", 9)
        c.drawString(70 * mm, y, f"{title} kodlari:")
        y -= 5 * mm
        c.setFont("Helvetica", 8)
        line, chars = "", 0
        for code in codes:
            piece = (", " if line else "") + str(code)
            if chars + len(piece) > 85:
                c.drawString(72 * mm, y, line)
                y -= 4.5 * mm
                line, chars = str(code), len(str(code))
            else:
                line += piece
                chars += len(piece)
        if line:
            c.drawString(72 * mm, y, line)
            y -= 5 * mm

    y -= 4 * mm
    c.setFont("Helvetica-Bold", 12)
    c.drawString(25 * mm, y, "Secimler")
    y -= 9 * mm
    row("Album", order.get("album_count", 0))
    codes_block("Album", order.get("album_codes"))
    row("Kanvas", order.get("canvas_count", 0))
    codes_block("Kanvas", order.get("canvas_codes"))
    row("Retouch", order.get("retouch_count", 0))
    codes_block("Retouch", order.get("retouch_codes"))

    pack_details = order.get("pack_details")
    if pack_details:
        y -= 4 * mm
        c.setFont("Helvetica-Bold", 12)
        c.drawString(25 * mm, y, "Ek Hizmetler")
        y -= 9 * mm
        for d in pack_details:
            row(f"{d.get('name','')} ({d.get('kind','')})", f"{d.get('qty',0)} adet · {d.get('total',0):.0f} TL")
            codes_block(d.get("name", ""), d.get("codes"))
        row("Ek Hizmet Toplam", f"{order.get('upsell_total', 0):.0f} TL")
    elif order.get("upsells"):
        y -= 4 * mm
        c.setFont("Helvetica-Bold", 12)
        c.drawString(25 * mm, y, "Ek Hizmetler")
        y -= 9 * mm
        for up in order["upsells"]:
            row(up.get("name", ""), f"{up.get('price', 0)} TL")
        row("Ek Hizmet Toplam", f"{order.get('upsell_total', 0)} TL")

    if order.get("note"):
        y -= 4 * mm
        c.setFont("Helvetica-Bold", 12)
        c.drawString(25 * mm, y, "Not")
        y -= 8 * mm
        c.setFont("Helvetica", 10)
        c.drawString(25 * mm, y, str(order["note"])[:120])

    c.showPage()
    c.save()
    return buf.getvalue()
