"""
Fotuber Photobooth & Kiosk — TASLAK (draft) modülü.

Amaç: Fiziksel photobooth/kiosk yazılımının iskeleti + temel çalışan akışı.
Bu aşamada:
  - RBAC: yalnızca Site Admini (require_admin). Belirli Stüdyo kullanıcılarına
    açılması sonraki faza bırakıldı.
  - AI arka plan silme, PayTR fiziksel POS ve donanım entegrasyonları YOK (sonra).
  - Ödeme adımı taslakta atlandı (kullanıcı isteği).

Koleksiyonlar:
  photobooth_settings     — global marka/slogan, admin çıkış PIN'i, özellik anahtarları
  photobooth_devices      — kiosk cihaz kayıtları
  photobooth_templates    — çerçeve/düzen kataloğu (strip, kartpostal, grid, polaroid, retro…)
  photobooth_packages     — fiyat/paket tanımları (QR / 1 Baskı + QR vb.)
  photobooth_transactions — her çekim kaydı (foto anahtarı + QR token)
"""
import secrets
import os
import hmac
import base64
import hashlib
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Response, Request
from pydantic import BaseModel, Field
import jwt


DEFAULT_PERMS = {"event_info": True, "frames": True, "texts": True, "print_toggle": True}
OPERATOR_SETTING_KEYS = ["brand_slogan", "brand_logo_url", "event_name", "event_hashtag",
                         "show_date", "countdown_seconds", "payment_required", "cash_enabled"]


# Taslak varsayılan düzen kataloğu (kullanıcı 30+ isteyecek; şimdilik temsili set).
DEFAULT_TEMPLATES = [
    {"name": "Klasik Şerit (4'lü)", "layout": "strip4", "category": "strip", "accent": "#111827"},
    {"name": "Retro Şerit", "layout": "strip4", "category": "retro", "accent": "#b45309"},
    {"name": "Kartpostal (10x15)", "layout": "postcard", "category": "postcard", "accent": "#0f766e"},
    {"name": "2x2 Izgara", "layout": "grid4", "category": "grid", "accent": "#7c3aed"},
    {"name": "Polaroid Tekli", "layout": "polaroid", "category": "polaroid", "accent": "#374151"},
    {"name": "Sinematik Tek Kare", "layout": "single", "category": "single", "accent": "#be123c"},
]

DEFAULT_PACKAGES = [
    {"name": "Sadece QR", "price": 75, "prints": 0, "includes_qr": True, "sort": 1},
    {"name": "1 Baskı + QR", "price": 150, "prints": 1, "includes_qr": True, "sort": 2},
    {"name": "2 Baskı + QR", "price": 220, "prints": 2, "includes_qr": True, "sort": 3},
]

DEFAULT_SETTINGS = {
    "brand_logo_url": "",
    "brand_slogan": "Fotuber Photobooth",
    "admin_exit_pin": "1234",
    "video_mode": False,       # video/GIF modu (taslak)
    "ai_bg_removal": False,     # yeşil-perdesiz AI arka plan (taslak)
    "live_wall": False,         # Anı Duvarı canlı yükleme (taslak)
    "countdown_seconds": 3,
    "payment_required": True,   # paket seçilince ödeme adımı zorunlu
    "cash_enabled": True,        # Nakit ödeme seçeneği (site admini firma için aç/kapat)
    "event_hashtag": "",        # baskıya eklenecek etkinlik etiketi (ör. #AyseMehmet)
    "show_date": True,          # baskıya tarih damgası ekle
}


def get_router(db, deps):
    router = APIRouter(prefix="/api/photobooth", tags=["photobooth"])
    require_admin = deps["require_admin"]
    new_id = deps["new_id"]
    now_iso = deps["now_iso"]
    put_object = deps["put_object"]
    get_object = deps["get_object"]
    hash_password = deps["hash_password"]
    verify_password = deps["verify_password"]
    create_access_token = deps["create_access_token"]
    JWT_SECRET = deps["JWT_SECRET"]
    JWT_ALGORITHM = deps["JWT_ALGORITHM"]

    async def get_current_operator(request: Request) -> dict:
        token = request.cookies.get("booth_token")
        if not token:
            auth = request.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                token = auth[7:]
        if not token:
            raise HTTPException(status_code=401, detail="Giriş gerekli")
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload.get("role") != "booth_operator":
                raise HTTPException(status_code=401, detail="Geçersiz token")
            t = await db.photobooth_tenants.find_one({"id": payload.get("sub")}, {"_id": 0})
            if not t or not t.get("active", True):
                raise HTTPException(status_code=401, detail="Hesap pasif veya bulunamadı")
            return t
        except jwt.PyJWTError:
            raise HTTPException(status_code=401, detail="Geçersiz token")

    def _tenant_settings(t: dict) -> dict:
        return {**DEFAULT_SETTINGS, **(t.get("settings") or {})}

    def _tenant_out(t: dict, include_secret=False) -> dict:
        o = {"id": t["id"], "name": t.get("name"), "operator_email": t.get("operator_email"),
             "active": t.get("active", True), "perms": {**DEFAULT_PERMS, **(t.get("perms") or {})},
             "settings": _tenant_settings(t), "created_at": t.get("created_at")}
        return o

    # ---- helpers -------------------------------------------------------------
    async def _get_settings() -> dict:
        s = await db.photobooth_settings.find_one({"id": "global"}, {"_id": 0})
        if not s:
            s = {"id": "global", **DEFAULT_SETTINGS, "created_at": now_iso()}
            await db.photobooth_settings.update_one({"id": "global"}, {"$setOnInsert": s}, upsert=True)
        # eksik anahtarları tamamla
        merged = {**DEFAULT_SETTINGS, **{k: v for k, v in s.items() if k not in ("_id",)}}
        return merged

    async def _seed_defaults():
        if await db.photobooth_templates.count_documents({}) == 0:
            for i, t in enumerate(DEFAULT_TEMPLATES):
                await db.photobooth_templates.insert_one({
                    "id": new_id(), "name": t["name"], "layout": t["layout"],
                    "category": t["category"], "accent": t["accent"],
                    "branding_locked": True, "active": True, "sort": i, "created_at": now_iso(),
                })
        if await db.photobooth_packages.count_documents({}) == 0:
            for p in DEFAULT_PACKAGES:
                await db.photobooth_packages.insert_one({
                    "id": new_id(), "name": p["name"], "price": p["price"],
                    "prints": p["prints"], "includes_qr": p["includes_qr"],
                    "active": True, "sort": p["sort"], "created_at": now_iso(),
                })

    def _tpl_out(t: dict) -> dict:
        return {"id": t["id"], "name": t.get("name"), "layout": t.get("layout", "single"),
                "category": t.get("category", "single"), "accent": t.get("accent", "#111827"),
                "frame_url": t.get("frame_url", ""), "border_color": t.get("border_color", ""),
                "border_width": t.get("border_width", 0), "is_global": t.get("is_global", False),
                "width_cm": t.get("width_cm", 0), "height_cm": t.get("height_cm", 0),
                "copies_per_sheet": t.get("copies_per_sheet", 1),
                "branding_locked": t.get("branding_locked", True), "active": t.get("active", True),
                "sort": t.get("sort", 0)}

    def _paytr_configured() -> bool:
        return bool(os.environ.get("PAYTR_MERCHANT_ID") and os.environ.get("PAYTR_MERCHANT_KEY")
                    and os.environ.get("PAYTR_MERCHANT_SALT"))

    def _pkg_out(p: dict) -> dict:
        return {"id": p["id"], "name": p.get("name"), "price": p.get("price", 0),
                "prints": p.get("prints", 0), "includes_qr": p.get("includes_qr", True),
                "tenant_id": p.get("tenant_id"),
                "active": p.get("active", True), "sort": p.get("sort", 0)}

    def _dev_out(d: dict) -> dict:
        return {"id": d["id"], "name": d.get("name"), "location": d.get("location", ""),
                "active": d.get("active", True), "created_at": d.get("created_at")}

    # =========================================================================
    # KIOSK config + capture (admin-authenticated for now; route admin-only)
    # =========================================================================
    @router.get("/config")
    async def kiosk_config(admin: dict = Depends(require_admin)):
        await _seed_defaults()
        settings = await _get_settings()
        tpls = await db.photobooth_templates.find({"active": True, "$or": [{"is_global": True}, {"tenant_id": None}, {"tenant_id": {"$exists": False}}]}, {"_id": 0}).sort("sort", 1).to_list(200)
        pkgs = await db.photobooth_packages.find({"active": True, "$or": [{"tenant_id": None}, {"tenant_id": {"$exists": False}}]}, {"_id": 0}).sort("sort", 1).to_list(200)
        # admin_exit_pin kiosk config'te SIZDIRILMAZ (yalnızca doğrulama ucu ile kontrol edilir)
        public_settings = {k: v for k, v in settings.items() if k != "admin_exit_pin"}
        public_settings["paytr_configured"] = _paytr_configured()
        return {"settings": public_settings, "mode": "admin", "admin_free": True,
                "templates": [_tpl_out(t) for t in tpls],
                "packages": [_pkg_out(p) for p in pkgs]}

    class ExitPinIn(BaseModel):
        pin: str

    @router.post("/verify-exit-pin")
    async def verify_exit_pin(payload: ExitPinIn, admin: dict = Depends(require_admin)):
        settings = await _get_settings()
        ok = (payload.pin or "").strip() == str(settings.get("admin_exit_pin", ""))
        return {"ok": ok}

    @router.post("/capture")
    async def capture(
        admin: dict = Depends(require_admin),
        image: UploadFile = File(...),
        template_id: str = Form(""),
        package_id: str = Form(""),
        device_id: str = Form(""),
        payment_method: str = Form("cash"),   # cash | card | free
        staff_pin: str = Form(""),
    ):
        data = await image.read()
        if not data:
            raise HTTPException(status_code=400, detail="Boş görsel")
        settings = await _get_settings()
        pkg = await db.photobooth_packages.find_one({"id": package_id}, {"_id": 0}) if package_id else None
        amount = (pkg or {}).get("price", 0)
        method = payment_method if payment_method in ("cash", "pos", "card", "free") else "cash"
        # Ödeme zorunluysa ve ücretsiz değilse personel PIN'i ile onay şart (istismar önleme)
        if settings.get("payment_required", True) and method != "free" and amount > 0:
            if (staff_pin or "").strip() != str(settings.get("admin_exit_pin", "")):
                raise HTTPException(status_code=403, detail="Ödeme onayı için personel PIN'i gerekli")
        status = "captured" if method == "free" else "paid"
        token = secrets.token_urlsafe(10)
        key = f"photobooth/{token}.png"
        put_object(key, data, image.content_type or "image/png")
        doc = {
            "id": new_id(), "device_id": device_id or None,
            "template_id": template_id or None, "package_id": package_id or None,
            "photo_key": key, "qr_token": token,
            "amount": amount if method != "free" else 0,
            "prints": (pkg or {}).get("prints", 0),
            "payment_method": method, "status": status,
            "created_at": now_iso(),
        }
        await db.photobooth_transactions.insert_one(doc)
        return {"qr_token": token, "gallery_path": f"/anilarim/{token}",
                "photo_url": f"/api/photobooth/photo/{token}"}

    class PaytrLinkIn(BaseModel):
        package_id: str
        origin_url: str = ""

    @router.post("/paytr-link")
    async def paytr_link(payload: PaytrLinkIn, admin: dict = Depends(require_admin)):
        """Kiosk kart ödemesi için PayTR ödeme linki üretir (müşteri telefonundan öder)."""
        import httpx as _httpx
        mid = os.environ.get("PAYTR_MERCHANT_ID", "")
        mkey = os.environ.get("PAYTR_MERCHANT_KEY", "")
        msalt = os.environ.get("PAYTR_MERCHANT_SALT", "")
        if not (mid and mkey and msalt):
            raise HTTPException(status_code=400, detail="PayTR yapılandırılmamış — nakit tahsil edin")
        pkg = await db.photobooth_packages.find_one({"id": payload.package_id}, {"_id": 0})
        if not pkg or pkg.get("price", 0) <= 0:
            raise HTTPException(status_code=400, detail="Geçersiz paket")
        title = f"Fotuber Photobooth - {pkg.get('name', 'Paket')}"
        price_kurus = str(int(round(float(pkg["price"]) * 100)))
        currency, max_installment, link_type, lang, min_count = "TL", "1", "product", "tr", "1"
        required = title + price_kurus + currency + max_installment + link_type + lang + min_count
        digest = hmac.new(mkey.encode(), (required + msalt).encode(), hashlib.sha256).digest()
        token = base64.b64encode(digest).decode()
        post_data = {
            "merchant_id": mid, "name": title, "price": price_kurus, "currency": currency,
            "max_installment": max_installment, "link_type": link_type, "lang": lang,
            "min_count": min_count, "max_count": "1", "get_qr": "1", "debug_on": "1",
            "paytr_token": token,
        }
        try:
            async with _httpx.AsyncClient(timeout=25) as http:
                r = await http.post("https://www.paytr.com/odeme/api/link/create", data=post_data)
                res = r.json()
        except Exception:
            raise HTTPException(status_code=502, detail="PayTR bağlantısı başarısız")
        if res.get("status") != "success":
            raise HTTPException(status_code=502, detail=res.get("reason") or "PayTR link hatası")
        return {"link": res.get("link"), "amount": pkg["price"]}

    @router.get("/photo/{token}")
    async def get_photo(token: str):
        """Public — QR ile telefondan erişim."""
        tx = await db.photobooth_transactions.find_one({"qr_token": token}, {"_id": 0})
        if not tx:
            raise HTTPException(status_code=404, detail="Bulunamadı")
        try:
            content, ctype = get_object(tx["photo_key"])
        except Exception:
            raise HTTPException(status_code=404, detail="Görsel bulunamadı")
        return Response(content=content, media_type=ctype or "image/png")

    # =========================================================================
    # ADMIN — Settings
    # =========================================================================
    class SettingsIn(BaseModel):
        brand_logo_url: str | None = None
        brand_slogan: str | None = None
        admin_exit_pin: str | None = None
        video_mode: bool | None = None
        ai_bg_removal: bool | None = None
        live_wall: bool | None = None
        countdown_seconds: int | None = None
        payment_required: bool | None = None
        cash_enabled: bool | None = None
        event_hashtag: str | None = None
        show_date: bool | None = None

    @router.get("/admin/settings")
    async def admin_get_settings(admin: dict = Depends(require_admin)):
        return {"settings": await _get_settings()}

    @router.put("/admin/settings")
    async def admin_put_settings(payload: SettingsIn, admin: dict = Depends(require_admin)):
        upd = {k: v for k, v in payload.model_dump().items() if v is not None}
        if "countdown_seconds" in upd:
            upd["countdown_seconds"] = max(1, min(10, int(upd["countdown_seconds"])))
        await db.photobooth_settings.update_one({"id": "global"}, {"$set": upd}, upsert=True)
        return {"settings": await _get_settings()}

    # =========================================================================
    # ADMIN — Devices
    # =========================================================================
    class DeviceIn(BaseModel):
        name: str = Field(min_length=1, max_length=120)
        location: str = ""
        active: bool = True

    @router.get("/admin/devices")
    async def list_devices(admin: dict = Depends(require_admin)):
        rows = await db.photobooth_devices.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
        return {"devices": [_dev_out(d) for d in rows]}

    @router.post("/admin/devices")
    async def create_device(payload: DeviceIn, admin: dict = Depends(require_admin)):
        doc = {"id": new_id(), "name": payload.name.strip(), "location": payload.location.strip(),
               "active": payload.active, "created_at": now_iso()}
        await db.photobooth_devices.insert_one(doc)
        return {"device": _dev_out(doc)}

    @router.patch("/admin/devices/{did}")
    async def patch_device(did: str, payload: DeviceIn, admin: dict = Depends(require_admin)):
        await db.photobooth_devices.update_one({"id": did}, {"$set": {
            "name": payload.name.strip(), "location": payload.location.strip(), "active": payload.active}})
        return {"ok": True}

    @router.delete("/admin/devices/{did}")
    async def delete_device(did: str, admin: dict = Depends(require_admin)):
        await db.photobooth_devices.delete_one({"id": did})
        return {"ok": True}

    # =========================================================================
    # ADMIN — Templates (frames / layouts)
    # =========================================================================
    LAYOUTS = ["strip4", "postcard", "grid4", "polaroid", "single"]

    class TemplateIn(BaseModel):
        name: str = Field(min_length=1, max_length=120)
        layout: str = "single"
        category: str = "single"
        accent: str = "#111827"
        frame_url: str = ""
        border_color: str = ""
        border_width: int = 0
        width_cm: float = 0
        height_cm: float = 0
        branding_locked: bool = True
        active: bool = True
        sort: int = 0

    @router.get("/admin/templates")
    async def list_templates(admin: dict = Depends(require_admin)):
        await _seed_defaults()
        rows = await db.photobooth_templates.find({}, {"_id": 0}).sort("sort", 1).to_list(500)
        return {"templates": [_tpl_out(t) for t in rows], "layouts": LAYOUTS}

    @router.post("/admin/templates")
    async def create_template(payload: TemplateIn, admin: dict = Depends(require_admin)):
        layout = payload.layout if payload.layout in LAYOUTS else "single"
        doc = {"id": new_id(), "name": payload.name.strip(), "layout": layout,
               "category": payload.category.strip() or layout, "accent": payload.accent,
               "frame_url": payload.frame_url.strip(), "border_color": payload.border_color.strip(),
               "border_width": max(0, min(60, int(payload.border_width or 0))),
               "width_cm": payload.width_cm, "height_cm": payload.height_cm,
               "branding_locked": payload.branding_locked, "active": payload.active,
               "sort": payload.sort, "created_at": now_iso()}
        await db.photobooth_templates.insert_one(doc)
        return {"template": _tpl_out(doc)}

    @router.patch("/admin/templates/{tid}")
    async def patch_template(tid: str, payload: TemplateIn, admin: dict = Depends(require_admin)):
        layout = payload.layout if payload.layout in LAYOUTS else "single"
        await db.photobooth_templates.update_one({"id": tid}, {"$set": {
            "name": payload.name.strip(), "layout": layout, "category": payload.category.strip() or layout,
            "accent": payload.accent, "frame_url": payload.frame_url.strip(),
            "border_color": payload.border_color.strip(), "border_width": max(0, min(60, int(payload.border_width or 0))),
            "width_cm": payload.width_cm, "height_cm": payload.height_cm,
            "branding_locked": payload.branding_locked, "active": payload.active, "sort": payload.sort}})
        return {"ok": True}

    @router.delete("/admin/templates/{tid}")
    async def delete_template(tid: str, admin: dict = Depends(require_admin)):
        await db.photobooth_templates.delete_one({"id": tid})
        return {"ok": True}

    # =========================================================================
    # ADMIN — Packages (pricing)
    # =========================================================================
    class PackageIn(BaseModel):
        name: str = Field(min_length=1, max_length=120)
        price: float = 0
        prints: int = 0
        includes_qr: bool = True
        active: bool = True
        sort: int = 0
        tenant_id: str | None = None

    @router.get("/admin/packages")
    async def list_packages(tenant_id: str = "", admin: dict = Depends(require_admin)):
        await _seed_defaults()
        q = {"tenant_id": tenant_id} if tenant_id else {}
        rows = await db.photobooth_packages.find(q, {"_id": 0}).sort("sort", 1).to_list(500)
        return {"packages": [_pkg_out(p) for p in rows]}

    @router.post("/admin/packages")
    async def create_package(payload: PackageIn, admin: dict = Depends(require_admin)):
        # Ücretsiz paket yok — fiyat 0 olamaz.
        if payload.price <= 0:
            raise HTTPException(status_code=400, detail="Paket fiyatı 0'dan büyük olmalı (ücretsiz seçenek yok)")
        doc = {"id": new_id(), "name": payload.name.strip(), "price": payload.price,
               "prints": max(0, payload.prints), "includes_qr": payload.includes_qr,
               "tenant_id": payload.tenant_id or None,
               "active": payload.active, "sort": payload.sort, "created_at": now_iso()}
        await db.photobooth_packages.insert_one(doc)
        return {"package": _pkg_out(doc)}

    @router.patch("/admin/packages/{pid}")
    async def patch_package(pid: str, payload: PackageIn, admin: dict = Depends(require_admin)):
        if payload.price <= 0:
            raise HTTPException(status_code=400, detail="Paket fiyatı 0'dan büyük olmalı (ücretsiz seçenek yok)")
        await db.photobooth_packages.update_one({"id": pid}, {"$set": {
            "name": payload.name.strip(), "price": payload.price, "prints": max(0, payload.prints),
            "includes_qr": payload.includes_qr, "active": payload.active, "sort": payload.sort}})
        return {"ok": True}

    @router.delete("/admin/packages/{pid}")
    async def delete_package(pid: str, admin: dict = Depends(require_admin)):
        await db.photobooth_packages.delete_one({"id": pid})
        return {"ok": True}

    # =========================================================================
    # ADMIN — Transactions (report)
    # =========================================================================
    @router.get("/admin/transactions")
    async def list_transactions(admin: dict = Depends(require_admin)):
        rows = await db.photobooth_transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
        total = sum(r.get("amount", 0) for r in rows)
        return {"transactions": rows, "count": len(rows), "revenue": total}

    # =========================================================================
    # MULTI-TENANT — Firmalar (admin) + Operatör girişi & sınırlı panel
    # =========================================================================
    class TenantIn(BaseModel):
        name: str = Field(min_length=1, max_length=140)
        operator_email: str = Field(min_length=3, max_length=160)
        password: str = ""
        active: bool = True
        perms: dict | None = None

    @router.get("/admin/tenants")
    async def list_tenants(admin: dict = Depends(require_admin)):
        rows = await db.photobooth_tenants.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
        return {"tenants": [_tenant_out(t) for t in rows]}

    @router.post("/admin/tenants")
    async def create_tenant(payload: TenantIn, admin: dict = Depends(require_admin)):
        if not payload.password:
            raise HTTPException(status_code=400, detail="Şifre gerekli")
        email = payload.operator_email.strip().lower()
        if await db.photobooth_tenants.find_one({"operator_email": email}):
            raise HTTPException(status_code=400, detail="Bu e-posta zaten kayıtlı")
        perms = {**DEFAULT_PERMS, **(payload.perms or {})}
        doc = {"id": new_id(), "name": payload.name.strip(), "operator_email": email,
               "password_hash": hash_password(payload.password), "active": payload.active,
               "perms": perms, "settings": {"admin_exit_pin": "1234"}, "created_at": now_iso()}
        await db.photobooth_tenants.insert_one(doc)
        return {"tenant": _tenant_out(doc)}

    @router.patch("/admin/tenants/{tid}")
    async def patch_tenant(tid: str, payload: TenantIn, admin: dict = Depends(require_admin)):
        upd = {"name": payload.name.strip(), "operator_email": payload.operator_email.strip().lower(),
               "active": payload.active, "perms": {**DEFAULT_PERMS, **(payload.perms or {})}}
        if payload.password:
            upd["password_hash"] = hash_password(payload.password)
        await db.photobooth_tenants.update_one({"id": tid}, {"$set": upd})
        return {"ok": True}

    @router.delete("/admin/tenants/{tid}")
    async def delete_tenant(tid: str, admin: dict = Depends(require_admin)):
        await db.photobooth_tenants.delete_one({"id": tid})
        await db.photobooth_templates.delete_many({"tenant_id": tid})
        await db.photobooth_packages.delete_many({"tenant_id": tid})
        return {"ok": True}

    class OpLoginIn(BaseModel):
        email: str
        password: str

    @router.post("/operator/login")
    async def operator_login(payload: OpLoginIn):
        t = await db.photobooth_tenants.find_one({"operator_email": payload.email.strip().lower()}, {"_id": 0})
        if not t or not verify_password(payload.password, t.get("password_hash", "")):
            raise HTTPException(status_code=401, detail="E-posta veya şifre hatalı")
        if not t.get("active", True):
            raise HTTPException(status_code=403, detail="Hesabınız pasif")
        token = create_access_token(t["id"], t["operator_email"], "booth_operator")
        return {"token": token, "tenant": _tenant_out(t)}

    @router.get("/operator/me")
    async def operator_me(t: dict = Depends(get_current_operator)):
        return {"tenant": _tenant_out(t)}

    class OpSettingsIn(BaseModel):
        settings: dict

    @router.put("/operator/settings")
    async def operator_update_settings(payload: OpSettingsIn, t: dict = Depends(get_current_operator)):
        perms = {**DEFAULT_PERMS, **(t.get("perms") or {})}
        cur = t.get("settings") or {}
        allow = set()
        if perms.get("event_info"):
            allow |= {"event_name", "event_hashtag", "show_date"}
        if perms.get("texts"):
            allow |= {"brand_slogan", "brand_logo_url", "event_hashtag"}
        if perms.get("print_toggle"):
            allow |= {"payment_required", "cash_enabled"}
        upd = {f"settings.{k}": v for k, v in payload.settings.items() if k in allow}
        if not upd:
            raise HTTPException(status_code=403, detail="Bu ayarları değiştirme yetkiniz yok")
        if "settings.countdown_seconds" in upd:
            upd["settings.countdown_seconds"] = max(1, min(10, int(upd["settings.countdown_seconds"])))
        await db.photobooth_tenants.update_one({"id": t["id"]}, {"$set": upd})
        fresh = await db.photobooth_tenants.find_one({"id": t["id"]}, {"_id": 0})
        return {"tenant": _tenant_out(fresh)}

    # Operatör çerçeveleri (perms.frames)
    @router.get("/operator/templates")
    async def operator_templates(t: dict = Depends(get_current_operator)):
        rows = await db.photobooth_templates.find({"tenant_id": t["id"]}, {"_id": 0}).sort("sort", 1).to_list(500)
        return {"templates": [_tpl_out(r) for r in rows], "layouts": LAYOUTS, "can_edit": bool((t.get("perms") or {}).get("frames", True))}

    @router.post("/operator/templates")
    async def operator_create_template(payload: TemplateIn, t: dict = Depends(get_current_operator)):
        if not (t.get("perms") or {}).get("frames", True):
            raise HTTPException(status_code=403, detail="Çerçeve yetkiniz yok")
        layout = payload.layout if payload.layout in LAYOUTS else "single"
        doc = {"id": new_id(), "tenant_id": t["id"], "name": payload.name.strip(), "layout": layout,
               "category": payload.category.strip() or layout, "accent": payload.accent,
               "frame_url": payload.frame_url.strip(), "border_color": payload.border_color.strip(),
               "border_width": max(0, min(60, int(payload.border_width or 0))),
               "width_cm": payload.width_cm, "height_cm": payload.height_cm,
               "branding_locked": True, "active": payload.active, "sort": payload.sort, "created_at": now_iso()}
        await db.photobooth_templates.insert_one(doc)
        return {"template": _tpl_out(doc)}

    @router.patch("/operator/templates/{tpid}")
    async def operator_patch_template(tpid: str, payload: TemplateIn, t: dict = Depends(get_current_operator)):
        if not (t.get("perms") or {}).get("frames", True):
            raise HTTPException(status_code=403, detail="Çerçeve yetkiniz yok")
        layout = payload.layout if payload.layout in LAYOUTS else "single"
        await db.photobooth_templates.update_one({"id": tpid, "tenant_id": t["id"]}, {"$set": {
            "name": payload.name.strip(), "layout": layout, "accent": payload.accent,
            "frame_url": payload.frame_url.strip(), "border_color": payload.border_color.strip(),
            "border_width": max(0, min(60, int(payload.border_width or 0))),
            "width_cm": payload.width_cm, "height_cm": payload.height_cm,
            "active": payload.active, "sort": payload.sort}})
        return {"ok": True}

    @router.delete("/operator/templates/{tpid}")
    async def operator_delete_template(tpid: str, t: dict = Depends(get_current_operator)):
        await db.photobooth_templates.delete_one({"id": tpid, "tenant_id": t["id"]})
        return {"ok": True}

    # Operatör kiosk config (kendi firmasına özel)
    @router.get("/operator/config")
    async def operator_config(t: dict = Depends(get_current_operator)):
        settings = _tenant_settings(t)
        settings.pop("admin_exit_pin", None)
        settings["tenant_name"] = t.get("name")
        tpls = await db.photobooth_templates.find({"active": True, "$or": [{"tenant_id": t["id"]}, {"is_global": True}]}, {"_id": 0}).sort("sort", 1).to_list(200)
        pkgs = await db.photobooth_packages.find({"tenant_id": t["id"], "active": True}, {"_id": 0}).sort("sort", 1).to_list(200)
        return {"settings": settings, "templates": [_tpl_out(x) for x in tpls],
                "packages": [_pkg_out(x) for x in pkgs], "mode": "operator", "admin_free": False}

    @router.post("/operator/capture")
    async def operator_capture(
        t: dict = Depends(get_current_operator),
        image: UploadFile = File(...), template_id: str = Form(""),
        package_id: str = Form(""), payment_method: str = Form("cash"), staff_pin: str = Form(""),
    ):
        data = await image.read()
        if not data:
            raise HTTPException(status_code=400, detail="Boş görsel")
        settings = _tenant_settings(t)
        pkg = await db.photobooth_packages.find_one({"id": package_id, "tenant_id": t["id"]}, {"_id": 0}) if package_id else None
        amount = (pkg or {}).get("price", 0)
        method = payment_method if payment_method in ("cash", "pos", "card", "free") else "cash"
        if settings.get("payment_required", True) and method != "free" and amount > 0:
            if (staff_pin or "").strip() != str(settings.get("admin_exit_pin", "1234")):
                raise HTTPException(status_code=403, detail="Ödeme onayı için personel PIN'i gerekli")
        token = secrets.token_urlsafe(10)
        key = f"photobooth/{token}.png"
        put_object(key, data, image.content_type or "image/png")
        doc = {"id": new_id(), "tenant_id": t["id"], "template_id": template_id or None,
               "package_id": package_id or None, "photo_key": key, "qr_token": token,
               "amount": amount if method != "free" else 0, "prints": (pkg or {}).get("prints", 0),
               "payment_method": method, "status": "captured" if method == "free" else "paid",
               "created_at": now_iso()}
        await db.photobooth_transactions.insert_one(doc)
        return {"qr_token": token, "gallery_path": f"/anilarim/{token}", "photo_url": f"/api/photobooth/photo/{token}"}

    # ── ADMIN — Global PNG çerçeveler (tüm kiosklara otomatik yansır) ─────
    @router.post("/admin/frames/upload")
    async def upload_global_frame(
        admin: dict = Depends(require_admin),
        image: UploadFile = File(...),
        name: str = Form("Çerçeve"),
        layout: str = Form("postcard"),
        width_cm: float = Form(10),
        height_cm: float = Form(15),
        copies_per_sheet: int = Form(1),
    ):
        data = await image.read()
        if not data:
            raise HTTPException(status_code=400, detail="Boş dosya")
        ctype = (image.content_type or "").lower()
        if "png" not in ctype:
            raise HTTPException(status_code=400, detail="Yalnızca şeffaf PNG yükleyin")
        if len(data) > 8 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Dosya çok büyük (en fazla 8 MB)")
        fid = new_id()
        key = f"photobooth/frames/{fid}.png"
        put_object(key, data, "image/png")
        lay = layout if layout in LAYOUTS else "postcard"
        doc = {"id": fid, "tenant_id": None, "is_global": True, "name": name.strip() or "Çerçeve",
               "layout": lay, "category": lay, "accent": "#111827",
               "frame_url": f"/api/photobooth/frame/{fid}", "frame_key": key,
               "border_color": "", "border_width": 0,
               "width_cm": width_cm, "height_cm": height_cm,
               "copies_per_sheet": 2 if int(copies_per_sheet or 1) == 2 else 1, "branding_locked": True,
               "active": True, "sort": 0, "created_at": now_iso()}
        await db.photobooth_templates.insert_one(doc)
        return {"template": _tpl_out(doc)}

    @router.get("/admin/frames")
    async def list_global_frames(admin: dict = Depends(require_admin)):
        rows = await db.photobooth_templates.find({"is_global": True}, {"_id": 0}).sort("created_at", -1).to_list(500)
        return {"frames": [_tpl_out(r) for r in rows]}

    @router.delete("/admin/frames/{fid}")
    async def delete_global_frame(fid: str, admin: dict = Depends(require_admin)):
        rec = await db.photobooth_templates.find_one({"id": fid, "is_global": True})
        if rec and rec.get("frame_key"):
            try:
                deps.get("delete_object", lambda *_: None)(rec["frame_key"])
            except Exception:
                pass
        await db.photobooth_templates.delete_one({"id": fid, "is_global": True})
        return {"ok": True}

    @router.get("/frame/{fid}")
    async def serve_frame(fid: str):
        rec = await db.photobooth_templates.find_one({"id": fid}, {"_id": 0})
        if not rec or not rec.get("frame_key"):
            raise HTTPException(status_code=404, detail="Çerçeve bulunamadı")
        content, ctype = get_object(rec["frame_key"])
        return Response(content=content, media_type=ctype or "image/png")

    return router
