"""
Stüdyo Paneli (Studio Suite) — additive multi-tenant SaaS module.

Reuses the existing bcrypt + PyJWT auth primitives from server.py (passed via
`deps`) but stores accounts in a SEPARATE `studio_accounts` collection with
role="studio" so the existing users/auth flow is never touched.
"""
import os
import secrets
import base64
import asyncio
import logging
from datetime import datetime, timezone, timedelta

import jwt
from fastapi import APIRouter, HTTPException, Depends, Request, Response
from pydantic import BaseModel, EmailStr, Field

EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
NANO_BANANA_MODEL = os.environ.get("NANO_BANANA_MODEL", "gemini-3.1-flash-image-preview")
# Free design rights granted to every studio account (1 right = 3 AI alternatives).
STUDIO_FREE_DESIGN_RIGHTS = int(os.environ.get("STUDIO_FREE_DESIGN_RIGHTS", "3"))
_log = logging.getLogger("fotuber")

# ---------------------------------------------------------------------------
# Trial / plan configuration (env-overridable)
# ---------------------------------------------------------------------------
STUDIO_TRIAL_DAYS = int(os.environ.get("STUDIO_TRIAL_DAYS", "3"))
STUDIO_TRIAL_STORAGE_GB = int(os.environ.get("STUDIO_TRIAL_STORAGE_GB", "10"))
STUDIO_TRIAL_MAX_EVENTS = int(os.environ.get("STUDIO_TRIAL_MAX_EVENTS", "2"))

# Subscription plans. Prices in TRY; PayTR handles the actual charge later.
STUDIO_PLANS = [
    {
        "id": "trial", "name": "Ücretsiz Deneme", "price": 0, "period": "3 gün",
        "ai_credits": 0, "storage_gb": STUDIO_TRIAL_STORAGE_GB, "max_events": STUDIO_TRIAL_MAX_EVENTS,
        "max_devices": 1, "watermark_forced": True,
        "highlights": ["3 gün tam erişim", "Fotuber filigranı zorunlu", "0 AI kredisi"],
    },
    {
        "id": "basic", "name": "Basic", "price": 499, "period": "aylık",
        "ai_credits": 50, "storage_gb": 50, "max_events": 10,
        "max_devices": 1, "watermark_forced": False,
        "highlights": ["50 AI kredisi", "50 GB depolama", "Filigtransız"],
    },
    {
        "id": "bronze", "name": "Bronze", "price": 899, "period": "aylık",
        "ai_credits": 150, "storage_gb": 150, "max_events": 30,
        "max_devices": 2, "watermark_forced": False,
        "highlights": ["150 AI kredisi", "150 GB depolama", "2 cihaz"],
    },
    {
        "id": "silver", "name": "Silver", "price": 1499, "period": "aylık",
        "ai_credits": 400, "storage_gb": 400, "max_events": 100,
        "max_devices": 4, "watermark_forced": False,
        "highlights": ["400 AI kredisi", "400 GB depolama", "4 cihaz"],
    },
    {
        "id": "gold", "name": "Gold", "price": 2499, "period": "aylık",
        "ai_credits": 1200, "storage_gb": 1024, "max_events": 500,
        "max_devices": 8, "watermark_forced": False,
        "highlights": ["1200 AI kredisi", "1 TB depolama", "8 cihaz"],
    },
]
PLAN_MAP = {p["id"]: p for p in STUDIO_PLANS}


# ---------------------------------------------------------------------------
# Pydantic payloads
# ---------------------------------------------------------------------------
class StudioRegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    firma_adi: str = Field(min_length=2)
    phone: str = ""
    kvkk_consent: bool = False


class StudioLoginIn(BaseModel):
    email: EmailStr
    password: str


class AiDesignIn(BaseModel):
    prompt: str = Field(min_length=3, max_length=600)


class AiEditIn(BaseModel):
    asset_id: str
    instruction: str = Field(min_length=2, max_length=400)


class DesignRightsBuyIn(BaseModel):
    package_id: str
    origin_url: str = ""


class NotifySettingsIn(BaseModel):
    notify_email: str = ""
    notify_enabled: bool = True


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _parse(v):
    try:
        return datetime.fromisoformat(v) if v else None
    except Exception:
        return None


def _studio_state(acc: dict) -> dict:
    """Compute live trial/subscription state + effective limits."""
    now = datetime.now(timezone.utc)
    plan_id = acc.get("plan") or "trial"
    plan = PLAN_MAP.get(plan_id, PLAN_MAP["trial"])
    trial_end = _parse(acc.get("trial_end"))
    paid_until = _parse(acc.get("paid_until"))

    active, status, until = False, "expired", None
    if plan_id != "trial" and paid_until and paid_until > now:
        active, status, until = True, "active", acc.get("paid_until")
    elif plan_id == "trial" and trial_end and trial_end > now:
        active, status, until = True, "trial", acc.get("trial_end")

    ref = paid_until if (plan_id != "trial" and paid_until) else trial_end
    days_left = 0
    if ref and ref > now:
        days_left = (ref - now).days + (1 if (ref - now).seconds > 0 else 0)

    return {
        "active": active,
        "status": status,
        "until": until,
        "days_left": max(days_left, 0),
        "plan": plan_id,
        "plan_name": plan["name"],
        "limits": {
            "ai_credits": plan["ai_credits"],
            "storage_gb": plan["storage_gb"],
            "max_events": plan["max_events"],
            "max_devices": plan["max_devices"],
            "watermark_forced": plan["watermark_forced"],
        },
        "ai_credits_remaining": acc.get("ai_credits", plan["ai_credits"]),
    }


def _strip_studio(acc: dict) -> dict:
    if not acc:
        return acc
    return {
        "id": acc.get("id"),
        "email": acc.get("email"),
        "firma_adi": acc.get("firma_adi"),
        "phone": acc.get("phone"),
        "ftb_code": acc.get("ftb_code"),
        "role": "studio",
        "design_rights": acc.get("design_rights", 0),
        "notify_email": acc.get("notify_email") or acc.get("email"),
        "notify_enabled": acc.get("notify_enabled", True),
        "created_at": acc.get("created_at"),
        "membership": _studio_state(acc),
    }


# ---------------------------------------------------------------------------
# Router factory (no server.py import → no circular dependency)
# ---------------------------------------------------------------------------
def build_get_current_studio(db, JWT_SECRET, JWT_ALGORITHM):
    """Module-level factory so other routers (e.g. gallery) can reuse studio auth."""
    async def get_current_studio(request: Request) -> dict:
        token = request.cookies.get("studio_token") or request.cookies.get("access_token")
        if not token:
            auth = request.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                token = auth[7:]
        if not token:
            raise HTTPException(status_code=401, detail="Stüdyo girişi gerekli")
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload.get("type") != "access" or payload.get("role") != "studio":
                raise HTTPException(status_code=401, detail="Geçersiz stüdyo oturumu")
            acc = await db.studio_accounts.find_one({"id": payload["sub"]}, {"_id": 0})
            if not acc:
                raise HTTPException(status_code=401, detail="Stüdyo hesabı bulunamadı")
            return acc
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Oturum süresi doldu")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Geçersiz token")
    return get_current_studio


def get_router(db, deps):
    router = APIRouter(prefix="/api/studio", tags=["studio"])

    hash_password = deps["hash_password"]
    verify_password = deps["verify_password"]
    create_access_token = deps["create_access_token"]
    create_refresh_token = deps["create_refresh_token"]
    set_auth_cookies = deps["set_auth_cookies"]
    clear_auth_cookies = deps["clear_auth_cookies"]
    new_id = deps["new_id"]
    now_iso = deps["now_iso"]
    put_object = deps["put_object"]
    get_object = deps["get_object"]
    create_paytr_order = deps["create_paytr_order"]
    JWT_SECRET = deps["JWT_SECRET"]
    JWT_ALGORITHM = deps["JWT_ALGORITHM"]

    async def _gen_ftb_code() -> str:
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no ambiguous chars
        for _ in range(30):
            code = "FTB-" + "".join(secrets.choice(alphabet) for _ in range(5))
            if not await db.studio_accounts.find_one({"ftb_code": code}):
                return code
        return "FTB-" + secrets.token_hex(3).upper()

    get_current_studio = build_get_current_studio(db, JWT_SECRET, JWT_ALGORITHM)

    def _set_studio_cookie(response: Response, access: str):
        response.set_cookie(
            key="studio_token", value=access, httponly=True, secure=True,
            samesite="none", max_age=60 * 60 * 24, path="/",
        )

    # ---- Public: plan catalog ------------------------------------------------
    @router.get("/plans")
    async def list_plans():
        return {"plans": STUDIO_PLANS, "trial_days": STUDIO_TRIAL_DAYS}

    # ---- Register ------------------------------------------------------------
    @router.post("/register")
    async def studio_register(payload: StudioRegisterIn, response: Response):
        email = payload.email.lower().strip()
        if not payload.kvkk_consent:
            raise HTTPException(status_code=400, detail="KVKK metnini kabul etmelisiniz")
        if await db.studio_accounts.find_one({"email": email}):
            raise HTTPException(status_code=400, detail="Bu e-posta ile kayıtlı bir stüdyo mevcut")
        now = datetime.now(timezone.utc)
        trial_end = (now + timedelta(days=STUDIO_TRIAL_DAYS)).isoformat()
        ftb = await _gen_ftb_code()
        doc = {
            "id": new_id(),
            "email": email,
            "password_hash": hash_password(payload.password),
            "firma_adi": payload.firma_adi.strip(),
            "phone": payload.phone,
            "ftb_code": ftb,
            "role": "studio",
            "plan": "trial",
            "trial_start": now.isoformat(),
            "trial_end": trial_end,
            "paid_until": None,
            "ai_credits": 0,
            "design_rights": STUDIO_FREE_DESIGN_RIGHTS,
            "notify_email": None,
            "notify_enabled": True,
            "storage_used_bytes": 0,
            "kvkk_consent": True,
            "kvkk_consent_at": now.isoformat(),
            "created_at": now_iso(),
        }
        await db.studio_accounts.insert_one(doc)
        access = create_access_token(doc["id"], email, "studio")
        _set_studio_cookie(response, access)
        return {"account": _strip_studio(doc), "token": access}

    # ---- Login ---------------------------------------------------------------
    @router.post("/login")
    async def studio_login(payload: StudioLoginIn, response: Response):
        email = payload.email.lower().strip()
        acc = await db.studio_accounts.find_one({"email": email})
        if not acc or not verify_password(payload.password, acc.get("password_hash", "")):
            raise HTTPException(status_code=401, detail="E-posta veya şifre hatalı")
        access = create_access_token(acc["id"], email, "studio")
        _set_studio_cookie(response, access)
        return {"account": _strip_studio(acc), "token": access}

    # ---- Logout --------------------------------------------------------------
    @router.post("/logout")
    async def studio_logout(response: Response):
        response.delete_cookie("studio_token", path="/")
        return {"ok": True}

    # ---- Me ------------------------------------------------------------------
    @router.get("/me")
    async def studio_me(acc: dict = Depends(get_current_studio)):
        return {"account": _strip_studio(acc), "plans": STUDIO_PLANS}

    # ---- AI Design generation (Tasarım Hakkı → Nano Banana) ------------------
    async def _generate_one(user_prompt: str, style: str, idx: int) -> bytes | None:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        full = (
            f"{user_prompt}. Bu bir DAVETİYE ARKA PLAN tasarımı. Stil: {style}. "
            "Zarif, yüksek çözünürlüklü, dikey (1080x1350) kompozisyon. "
            "Metin yerleştirmek için ORTADA geniş, sade boş bir alan bırak. "
            "Görselde HİÇBİR yazı, harf veya rakam olmasın — sadece dekoratif arka plan."
        )
        chat = LlmChat(
            api_key=EMERGENT_KEY,
            session_id=f"studio-design-{idx}-{secrets.token_hex(4)}",
            system_message="Sen profesyonel bir davetiye tasarımcısısın. Metin için ortada boş alan bırakan, yazısız, zarif davetiye arka planları üretirsin.",
        )
        chat.with_model("gemini", NANO_BANANA_MODEL).with_params(modalities=["image", "text"])
        try:
            _text, images = await chat.send_message_multimodal_response(UserMessage(text=full))
            if images:
                return base64.b64decode(images[0]["data"])
        except Exception as e:
            _log.error(f"Nano Banana generation failed (idx {idx}): {e}")
        return None

    @router.post("/design/ai-generate")
    async def ai_generate(payload: AiDesignIn, acc: dict = Depends(get_current_studio)):
        if not EMERGENT_KEY:
            raise HTTPException(status_code=500, detail="AI anahtarı yapılandırılmamış")
        rights = int(acc.get("design_rights", 0) or 0)
        if rights < 1:
            raise HTTPException(status_code=402, detail="Tasarım hakkınız bitti. Aşama 2'de PayTR ile yeni hak satın alabileceksiniz.")
        # Atomically consume 1 right (guard against races).
        res = await db.studio_accounts.update_one(
            {"id": acc["id"], "design_rights": {"$gte": 1}},
            {"$inc": {"design_rights": -1}},
        )
        if res.modified_count == 0:
            raise HTTPException(status_code=402, detail="Tasarım hakkınız bitti.")

        styles = [
            "altın ve fildişi tonları, zarif çiçek ve yaprak motifleri, klasik lüks",
            "koyu lacivert ve altın, art-deco geometrik çerçeve, modern lüks",
            "pastel pudra ve toz pembe, minimal suluboya çiçekler, romantik",
        ]
        try:
            results = await asyncio.gather(*[
                _generate_one(payload.prompt, styles[i % len(styles)], i) for i in range(3)
            ])
        except Exception as e:
            await db.studio_accounts.update_one({"id": acc["id"]}, {"$inc": {"design_rights": 1}})
            _log.error(f"ai-generate gather failed: {e}")
            raise HTTPException(status_code=502, detail="AI üretimi başarısız oldu, hakkınız iade edildi.")

        images = []
        for data in results:
            if not data:
                continue
            asset_id = new_id()
            path = f"design/ai/{acc['id']}/{asset_id}.png"
            try:
                put_object(path, data, "image/png")
            except Exception as e:
                _log.error(f"AI asset store failed: {e}")
                continue
            await db.design_assets.insert_one({
                "id": asset_id, "owner_studio_id": acc["id"], "path": path,
                "content_type": "image/png", "source": "ai", "prompt": payload.prompt,
                "created_at": now_iso(),
            })
            images.append({"id": asset_id, "url": f"/api/design/asset/{asset_id}"})

        if not images:
            # total failure → refund the right
            await db.studio_accounts.update_one({"id": acc["id"]}, {"$inc": {"design_rights": 1}})
            raise HTTPException(status_code=502, detail="AI görsel üretilemedi, hakkınız iade edildi.")

        fresh = await db.studio_accounts.find_one({"id": acc["id"]}, {"_id": 0, "design_rights": 1})
        return {"images": images, "rights_remaining": int((fresh or {}).get("design_rights", 0))}

    # ---- AI Edit (revize) — 1 hak, referans görsel ile Nano Banana --------
    @router.post("/design/ai-edit")
    async def ai_edit(payload: AiEditIn, acc: dict = Depends(get_current_studio)):
        if not EMERGENT_KEY:
            raise HTTPException(status_code=500, detail="AI anahtarı yapılandırılmamış")
        asset = await db.design_assets.find_one({"id": payload.asset_id})
        if not asset or asset.get("owner_studio_id") != acc["id"]:
            raise HTTPException(status_code=404, detail="Görsel bulunamadı")
        if int(acc.get("design_rights", 0) or 0) < 1:
            raise HTTPException(status_code=402, detail="Tasarım hakkınız bitti.")
        res = await db.studio_accounts.update_one(
            {"id": acc["id"], "design_rights": {"$gte": 1}}, {"$inc": {"design_rights": -1}})
        if res.modified_count == 0:
            raise HTTPException(status_code=402, detail="Tasarım hakkınız bitti.")

        try:
            src_bytes, _ct = get_object(asset["path"])
            from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
            b64 = base64.b64encode(src_bytes).decode("utf-8")
            chat = LlmChat(
                api_key=EMERGENT_KEY, session_id=f"studio-edit-{secrets.token_hex(4)}",
                system_message="Sen profesyonel bir davetiye tasarımcısısın. Verilen davetiye arka planını, kompozisyonu ve ortadaki boş metin alanını KORUYARAK istenen şekilde revize edersin. Görselde yazı/harf/rakam olmasın.",
            )
            chat.with_model("gemini", NANO_BANANA_MODEL).with_params(modalities=["image", "text"])
            instruction = (
                f"Bu davetiye arka planını şu isteğe göre revize et: {payload.instruction}. "
                "Genel kompozisyonu ve ORTADAKİ boş metin alanını koru. Görselde yazı olmasın."
            )
            _text, images = await chat.send_message_multimodal_response(
                UserMessage(text=instruction, file_contents=[ImageContent(b64)]))
        except Exception as e:
            await db.studio_accounts.update_one({"id": acc["id"]}, {"$inc": {"design_rights": 1}})
            _log.error(f"ai-edit failed: {e}")
            raise HTTPException(status_code=502, detail="AI revizyonu başarısız, hakkınız iade edildi.")

        if not images:
            await db.studio_accounts.update_one({"id": acc["id"]}, {"$inc": {"design_rights": 1}})
            raise HTTPException(status_code=502, detail="Revize görsel üretilemedi, hakkınız iade edildi.")

        data = base64.b64decode(images[0]["data"])
        new_asset_id = new_id()
        path = f"design/ai/{acc['id']}/{new_asset_id}.png"
        put_object(path, data, "image/png")
        await db.design_assets.insert_one({
            "id": new_asset_id, "owner_studio_id": acc["id"], "path": path,
            "content_type": "image/png", "source": "ai_edit", "instruction": payload.instruction,
            "parent_asset_id": payload.asset_id, "created_at": now_iso(),
        })
        fresh = await db.studio_accounts.find_one({"id": acc["id"]}, {"_id": 0, "design_rights": 1})
        return {"image": {"id": new_asset_id, "url": f"/api/design/asset/{new_asset_id}"},
                "rights_remaining": int((fresh or {}).get("design_rights", 0))}

    # ---- Design-rights packages + PayTR purchase -------------------------
    @router.get("/design/rights-packages")
    async def rights_packages(acc: dict = Depends(get_current_studio)):
        pkgs = await db.design_rights_packages.find({"active": True}, {"_id": 0}).sort("sort", 1).to_list(100)
        return {"packages": pkgs, "design_rights": int(acc.get("design_rights", 0) or 0)}

    @router.post("/payments/design-rights/create")
    async def buy_rights(payload: DesignRightsBuyIn, request: Request, acc: dict = Depends(get_current_studio)):
        pkg = await db.design_rights_packages.find_one({"id": payload.package_id, "active": True})
        if not pkg:
            raise HTTPException(status_code=400, detail="Geçersiz paket")
        title = f"Fotuber {int(pkg['rights'])} Tasarim Hakki"
        return await create_paytr_order(
            title=title, price=float(pkg["price"]), origin_url=payload.origin_url,
            request_base_url=request.base_url,
            order_extra={"kind": "studio_design_rights", "studio_id": acc["id"],
                         "rights": int(pkg["rights"]), "package_id": pkg["id"]},
        )

    @router.get("/payments/status/{callback_id}")
    async def payment_status(callback_id: str, acc: dict = Depends(get_current_studio)):
        order = await db.payment_orders.find_one({"callback_id": callback_id}, {"_id": 0})
        if not order or order.get("studio_id") != acc["id"]:
            raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
        resp = {"callback_id": callback_id, "status": order.get("status"), "kind": order.get("kind")}
        if order.get("status") == "paid":
            fresh = await db.studio_accounts.find_one({"id": acc["id"]}, {"_id": 0, "design_rights": 1})
            resp["design_rights"] = int((fresh or {}).get("design_rights", 0))
        return resp

    # ---- Notification settings ------------------------------------------
    @router.put("/settings/notifications")
    async def update_notifications(payload: NotifySettingsIn, acc: dict = Depends(get_current_studio)):
        await db.studio_accounts.update_one(
            {"id": acc["id"]},
            {"$set": {"notify_email": (payload.notify_email or "").strip() or None,
                      "notify_enabled": bool(payload.notify_enabled)}})
        fresh = await db.studio_accounts.find_one({"id": acc["id"]}, {"_id": 0})
        return {"account": _strip_studio(fresh)}

    # ---- AI background favorites (studio-scoped) ------------------------
    @router.get("/design/ai-favorites")
    async def list_ai_favorites(acc: dict = Depends(get_current_studio)):
        favs = await db.design_ai_favorites.find({"studio_id": acc["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
        return {"favorites": favs}

    @router.post("/design/ai-favorites/{asset_id}")
    async def add_ai_favorite(asset_id: str, acc: dict = Depends(get_current_studio)):
        asset = await db.design_assets.find_one({"id": asset_id}, {"_id": 0})
        if not asset or asset.get("owner_studio_id") != acc["id"]:
            raise HTTPException(status_code=404, detail="Görsel bulunamadı")
        await db.design_ai_favorites.update_one(
            {"studio_id": acc["id"], "asset_id": asset_id},
            {"$setOnInsert": {"studio_id": acc["id"], "asset_id": asset_id,
                              "url": f"/api/design/asset/{asset_id}",
                              "prompt": asset.get("prompt") or asset.get("instruction") or "",
                              "created_at": now_iso()}},
            upsert=True)
        return {"ok": True}

    @router.delete("/design/ai-favorites/{asset_id}")
    async def remove_ai_favorite(asset_id: str, acc: dict = Depends(get_current_studio)):
        await db.design_ai_favorites.delete_one({"studio_id": acc["id"], "asset_id": asset_id})
        return {"ok": True}

    return router
