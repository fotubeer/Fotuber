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
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Response
from pydantic import BaseModel, Field


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
}


def get_router(db, deps):
    router = APIRouter(prefix="/api/photobooth", tags=["photobooth"])
    require_admin = deps["require_admin"]
    new_id = deps["new_id"]
    now_iso = deps["now_iso"]
    put_object = deps["put_object"]
    get_object = deps["get_object"]

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
                "branding_locked": t.get("branding_locked", True), "active": t.get("active", True),
                "sort": t.get("sort", 0)}

    def _pkg_out(p: dict) -> dict:
        return {"id": p["id"], "name": p.get("name"), "price": p.get("price", 0),
                "prints": p.get("prints", 0), "includes_qr": p.get("includes_qr", True),
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
        tpls = await db.photobooth_templates.find({"active": True}, {"_id": 0}).sort("sort", 1).to_list(200)
        pkgs = await db.photobooth_packages.find({"active": True}, {"_id": 0}).sort("sort", 1).to_list(200)
        # admin_exit_pin kiosk config'te SIZDIRILMAZ (yalnızca doğrulama ucu ile kontrol edilir)
        public_settings = {k: v for k, v in settings.items() if k != "admin_exit_pin"}
        return {"settings": public_settings,
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
    ):
        data = await image.read()
        if not data:
            raise HTTPException(status_code=400, detail="Boş görsel")
        token = secrets.token_urlsafe(10)
        key = f"photobooth/{token}.png"
        put_object(key, data, image.content_type or "image/png")
        pkg = await db.photobooth_packages.find_one({"id": package_id}, {"_id": 0}) if package_id else None
        doc = {
            "id": new_id(), "device_id": device_id or None,
            "template_id": template_id or None, "package_id": package_id or None,
            "photo_key": key, "qr_token": token,
            "amount": (pkg or {}).get("price", 0),
            "prints": (pkg or {}).get("prints", 0),
            "status": "captured",  # taslak: ödeme atlandı
            "created_at": now_iso(),
        }
        await db.photobooth_transactions.insert_one(doc)
        return {"qr_token": token, "gallery_path": f"/anilarim/{token}",
                "photo_url": f"/api/photobooth/photo/{token}"}

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
               "branding_locked": payload.branding_locked, "active": payload.active,
               "sort": payload.sort, "created_at": now_iso()}
        await db.photobooth_templates.insert_one(doc)
        return {"template": _tpl_out(doc)}

    @router.patch("/admin/templates/{tid}")
    async def patch_template(tid: str, payload: TemplateIn, admin: dict = Depends(require_admin)):
        layout = payload.layout if payload.layout in LAYOUTS else "single"
        await db.photobooth_templates.update_one({"id": tid}, {"$set": {
            "name": payload.name.strip(), "layout": layout, "category": payload.category.strip() or layout,
            "accent": payload.accent, "branding_locked": payload.branding_locked,
            "active": payload.active, "sort": payload.sort}})
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

    @router.get("/admin/packages")
    async def list_packages(admin: dict = Depends(require_admin)):
        await _seed_defaults()
        rows = await db.photobooth_packages.find({}, {"_id": 0}).sort("sort", 1).to_list(500)
        return {"packages": [_pkg_out(p) for p in rows]}

    @router.post("/admin/packages")
    async def create_package(payload: PackageIn, admin: dict = Depends(require_admin)):
        # Ücretsiz paket yok — fiyat 0 olamaz.
        if payload.price <= 0:
            raise HTTPException(status_code=400, detail="Paket fiyatı 0'dan büyük olmalı (ücretsiz seçenek yok)")
        doc = {"id": new_id(), "name": payload.name.strip(), "price": payload.price,
               "prints": max(0, payload.prints), "includes_qr": payload.includes_qr,
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

    return router
