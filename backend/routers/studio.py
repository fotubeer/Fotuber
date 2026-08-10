"""
Stüdyo Paneli (Studio Suite) — additive multi-tenant SaaS module.

Reuses the existing bcrypt + PyJWT auth primitives from server.py (passed via
`deps`) but stores accounts in a SEPARATE `studio_accounts` collection with
role="studio" so the existing users/auth flow is never touched.
"""
import os
import secrets
from datetime import datetime, timezone, timedelta

import jwt
from fastapi import APIRouter, HTTPException, Depends, Request, Response
from pydantic import BaseModel, EmailStr, Field

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
        "created_at": acc.get("created_at"),
        "membership": _studio_state(acc),
    }


# ---------------------------------------------------------------------------
# Router factory (no server.py import → no circular dependency)
# ---------------------------------------------------------------------------
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
    JWT_SECRET = deps["JWT_SECRET"]
    JWT_ALGORITHM = deps["JWT_ALGORITHM"]

    async def _gen_ftb_code() -> str:
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no ambiguous chars
        for _ in range(30):
            code = "FTB-" + "".join(secrets.choice(alphabet) for _ in range(5))
            if not await db.studio_accounts.find_one({"ftb_code": code}):
                return code
        return "FTB-" + secrets.token_hex(3).upper()

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

    return router
