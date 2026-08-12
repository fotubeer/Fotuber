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
        "id": "trial", "link_days": 2, "del_days": 4, "max_users": 1, "name": "Ücretsiz Deneme", "price": 0, "period": "3 gün",
        "ai_credits": 0, "storage_gb": STUDIO_TRIAL_STORAGE_GB, "max_events": STUDIO_TRIAL_MAX_EVENTS,
        "max_devices": 1, "watermark_forced": True,
        "highlights": ["3 gün tam erişim", "Fotuber filigranı zorunlu", "0 AI kredisi"],
    },
    {
        "id": "basic", "link_days": 2, "del_days": 4, "max_users": 1, "name": "Basic", "price": 499, "price_yearly": 4990, "period": "aylık",
        "ai_credits": 50, "storage_gb": 50, "max_events": 10,
        "max_devices": 1, "watermark_forced": False,
        "highlights": ["50 AI kredisi", "50 GB depolama", "Filigtransız"],
    },
    {
        "id": "bronze", "link_days": 4, "del_days": 8, "max_users": 3, "name": "Bronze", "price": 899, "price_yearly": 8990, "period": "aylık",
        "ai_credits": 150, "storage_gb": 150, "max_events": 30,
        "max_devices": 2, "watermark_forced": False,
        "highlights": ["150 AI kredisi", "150 GB depolama", "2 cihaz"],
    },
    {
        "id": "silver", "link_days": 5, "del_days": 10, "max_users": 5, "name": "Silver", "price": 1499, "price_yearly": 14990, "period": "aylık",
        "ai_credits": 400, "storage_gb": 400, "max_events": 100,
        "max_devices": 4, "watermark_forced": False,
        "highlights": ["400 AI kredisi", "400 GB depolama", "4 cihaz"],
    },
    {
        "id": "gold", "link_days": 7, "del_days": 14, "max_users": 10, "name": "Gold", "price": 2499, "price_yearly": 24990, "period": "aylık",
        "ai_credits": 1200, "storage_gb": 1024, "max_events": 500,
        "max_devices": 8, "watermark_forced": False,
        "highlights": ["1200 AI kredisi", "1 TB depolama", "8 cihaz"],
    },
]
PLAN_MAP = {p["id"]: p for p in STUDIO_PLANS}

# ---- Editable plan overrides (Super Admin) --------------------------------
_PLAN_OVERRIDES: dict = {}
SECOND_MODULE_DISCOUNT_DEFAULT = 20
_GLOBAL_CONFIG = {"second_module_discount": SECOND_MODULE_DISCOUNT_DEFAULT}
# Per-module prices (admin-editable, independent of quota tiers). Example defaults.
_MODULE_PRICING = {
    "vesikalik": {"monthly": 499.0, "yearly": 4990.0},
    "gallery": {"monthly": 699.0, "yearly": 6990.0},
}


def get_module_pricing() -> dict:
    return {m: dict(v) for m, v in _MODULE_PRICING.items()}


def set_module_pricing(data: dict):
    for m in ("vesikalik", "gallery"):
        d = (data or {}).get(m) or {}
        if "monthly" in d and d["monthly"] is not None:
            _MODULE_PRICING[m]["monthly"] = max(0.0, float(d["monthly"]))
        if "yearly" in d and d["yearly"] is not None:
            _MODULE_PRICING[m]["yearly"] = max(0.0, float(d["yearly"]))

_OVERRIDABLE = {"price", "price_yearly", "ai_credits", "storage_gb", "max_events",
                "max_users", "max_devices", "link_days", "del_days"}


def _merged_plan(plan_id: str) -> dict:
    base = dict(PLAN_MAP.get(plan_id) or PLAN_MAP["trial"])
    ov = _PLAN_OVERRIDES.get(plan_id) or {}
    for k, v in ov.items():
        if k in _OVERRIDABLE and v is not None:
            base[k] = v
    return base


def _second_module_discount() -> int:
    return int(_GLOBAL_CONFIG.get("second_module_discount", SECOND_MODULE_DISCOUNT_DEFAULT))


async def load_plan_overrides(db):
    """Load persisted plan overrides + global config into memory (call on startup)."""
    try:
        async for row in db.studio_plan_config.find({}, {"_id": 0}):
            if row.get("id") == "_global":
                _GLOBAL_CONFIG.update({k: v for k, v in row.items() if k != "id"})
            elif row.get("id") == "_module_pricing":
                set_module_pricing({m: row.get(m) for m in ("vesikalik", "gallery")})
            else:
                _PLAN_OVERRIDES[row["id"]] = {k: v for k, v in row.items() if k in _OVERRIDABLE}
    except Exception:
        pass


def apply_plan_override(plan_id: str, data: dict):
    _PLAN_OVERRIDES.setdefault(plan_id, {})
    for k, v in data.items():
        if k in _OVERRIDABLE:
            _PLAN_OVERRIDES[plan_id][k] = v


def set_global_config(data: dict):
    if "second_module_discount" in data:
        _GLOBAL_CONFIG["second_module_discount"] = int(data["second_module_discount"])


def effective_plans() -> list:
    return [_merged_plan(p["id"]) for p in STUDIO_PLANS]


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
    email: str  # firm e-mail OR employee username
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


def _module_entitlement(acc: dict) -> dict:
    """Per-module access: the 3-day trial opens BOTH modules; after trial only
    modules with an unexpired purchase (module_until) stay open. Legacy paid
    accounts (paid_until + modules flag, no module_until) keep their access."""
    now = datetime.now(timezone.utc)
    trial_end = _parse(acc.get("trial_end"))
    trial_active = bool(trial_end and trial_end > now)
    paid_until = _parse(acc.get("paid_until"))
    legacy_active = bool(paid_until and paid_until > now)
    legacy_mods = acc.get("modules") if isinstance(acc.get("modules"), dict) else {}
    mu = acc.get("module_until") or {}

    def _ent(m):
        u = _parse(mu.get(m))
        if u and u > now:
            return True
        if trial_active:
            return True
        if legacy_active and not mu and bool(legacy_mods.get(m)):
            return True  # grandfather old single-paid_until accounts
        return False

    return {
        "vesikalik": _ent("vesikalik"), "gallery": _ent("gallery"),
        "vesikalik_until": mu.get("vesikalik"), "gallery_until": mu.get("gallery"),
        "trial_active": trial_active, "trial_end": acc.get("trial_end"),
    }


def _studio_state(acc: dict) -> dict:
    """Compute live trial/subscription state + effective limits."""
    now = datetime.now(timezone.utc)
    plan_id = acc.get("plan") or "trial"
    plan = _merged_plan(plan_id)
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
            "max_events": plan["max_events"] + int(acc.get("bonus_events", 0) or 0),
            "max_devices": plan["max_devices"],
            "max_users": plan.get("max_users", 1),
            "link_days": plan.get("link_days", 2),
            "del_days": plan.get("del_days", 4),
            "watermark_forced": plan["watermark_forced"],
        },
        "ai_credits_remaining": acc.get("ai_credits", plan["ai_credits"]),
        "coupon_pct": int(acc.get("comp_coupon_pct", 0) or 0),
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
        "modules": acc.get("modules") if isinstance(acc.get("modules"), dict) else {"vesikalik": True, "gallery": True},
        "entitlement": acc.get("_entitlement"),
        "is_member_design": bool(acc.get("is_member_design")),
        "brand_name": acc.get("brand_name") or acc.get("firma_adi"),
        "brand_logo_asset_id": acc.get("brand_logo_asset_id"),
        "ai_credits": acc.get("ai_credits", 0),
        "gallery_watermark": (True if (acc.get("plan") or "trial") == "trial" else acc.get("gallery_watermark", True)),
        "gallery_allow_originals": (False if (acc.get("plan") or "trial") == "trial" else acc.get("gallery_allow_originals", False)),
        "current_user": {"name": acc.get("_emp_name") or acc.get("firma_adi"),
                         "is_owner": acc.get("_is_owner", True),
                         "emp_id": acc.get("_emp_id")},
        "notify_email": acc.get("notify_email") or acc.get("email"),
        "notify_enabled": acc.get("notify_enabled", True),
        "created_at": acc.get("created_at"),
        "membership": _studio_state(acc),
    }


# ---------------------------------------------------------------------------
# Router factory (no server.py import → no circular dependency)
# ---------------------------------------------------------------------------
async def ensure_admin_studio(db, sub: str, email: str) -> dict:
    """Get-or-create a persistent full-access studio account for the site admin/staff.
    Grants every module, Gold plan, unlimited quotas and free everything so the admin
    uses ALL studio features without a separate signup or payment."""
    aid = f"admin-{sub}"
    acc = await db.studio_accounts.find_one({"id": aid}, {"_id": 0})
    if not acc:
        far = (datetime.now(timezone.utc) + timedelta(days=3650)).isoformat()
        acc = {
            "id": aid, "role": "studio", "is_admin_super": True,
            "email": email or "admin@fotuber.com.tr",
            "firma_adi": "Fotuber Yönetim", "brand_name": "Fotuber Yönetim",
            "ftb_code": "FTB-ADMIN", "plan": "gold", "paid_until": far,
            "modules": {"vesikalik": True, "gallery": True},
            "design_rights": 10_000_000, "ai_credits": 10_000_000,
            "bonus_events": 1_000_000,
            "gallery_watermark": False, "gallery_allow_originals": True,
            "notify_enabled": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.studio_accounts.update_one({"id": aid}, {"$setOnInsert": acc}, upsert=True)
        acc = await db.studio_accounts.find_one({"id": aid}, {"_id": 0})
    if int(acc.get("design_rights", 0) or 0) < 1000 or int(acc.get("ai_credits", 0) or 0) < 1000:
        await db.studio_accounts.update_one({"id": aid}, {"$set": {"design_rights": 10_000_000, "ai_credits": 10_000_000}})
        acc["design_rights"] = 10_000_000
        acc["ai_credits"] = 10_000_000
    acc["_emp_id"] = None
    acc["_emp_name"] = acc.get("firma_adi")
    acc["_is_owner"] = True
    return acc


async def ensure_member_design_account(db, sub: str, email: str) -> dict:
    """Get-or-create a DESIGN-ONLY account for a normal main-site MEMBER so they can
    use the Davetiye Tasarım Stüdyosu paid features (AI, personalization, bulk) with
    their normal membership + purchased design rights — NO studio subscription needed.
    Has no vesikalık/gallery modules."""
    aid = f"member-{sub}"
    acc = await db.studio_accounts.find_one({"id": aid}, {"_id": 0})
    if not acc:
        free = int(os.environ.get("MEMBER_FREE_DESIGN_RIGHTS", "1"))
        acc = {
            "id": aid, "role": "studio", "is_member_design": True,
            "email": email or "", "firma_adi": "Üye Tasarım", "brand_name": "Üye Tasarım",
            "plan": None, "modules": {}, "design_rights": free, "ai_credits": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.studio_accounts.update_one({"id": aid}, {"$setOnInsert": acc}, upsert=True)
        acc = await db.studio_accounts.find_one({"id": aid}, {"_id": 0})
    acc["_emp_id"] = None
    acc["_emp_name"] = acc.get("firma_adi")
    acc["_is_owner"] = True
    return acc


def build_get_current_studio(db, JWT_SECRET, JWT_ALGORITHM):
    """Module-level factory so other routers (e.g. gallery) can reuse studio auth."""
    async def get_current_studio(request: Request) -> dict:
        token = request.cookies.get("studio_token") or request.cookies.get("access_token")
        if not token:
            auth = request.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                token = auth[7:]
        # Site admin/staff main-site token → full-access "super" studio account
        # (all modules, unlimited quotas, everything free). No separate signup.
        main_token = request.cookies.get("fotuber_token") or request.cookies.get("token")
        if not token and main_token:
            token = main_token
        if not token:
            raise HTTPException(status_code=401, detail="Stüdyo girişi gerekli")
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload.get("type") != "access":
                raise HTTPException(status_code=401, detail="Geçersiz stüdyo oturumu")
            role = payload.get("role")
            if role in ("admin", "staff"):
                return await ensure_admin_studio(db, payload.get("sub"), payload.get("email"))
            if role == "member":
                return await ensure_member_design_account(db, payload.get("sub"), payload.get("email"))
            if role != "studio":
                raise HTTPException(status_code=401, detail="Geçersiz stüdyo oturumu")
            acc = await db.studio_accounts.find_one({"id": payload["sub"]}, {"_id": 0})
            if not acc:
                raise HTTPException(status_code=401, detail="Stüdyo hesabı bulunamadı")
            # Attach current-user identity (firm owner vs. employee) from token claims
            emp_id = payload.get("emp")
            if emp_id:
                emp = await db.studio_employees.find_one({"id": emp_id, "studio_id": acc["id"]}, {"_id": 0})
                if not emp or not emp.get("active", True):
                    raise HTTPException(status_code=401, detail="Çalışan hesabı pasif veya bulunamadı")
                acc["_emp_id"] = emp_id
                acc["_emp_name"] = emp.get("name") or emp.get("username")
                acc["_is_owner"] = False
            else:
                acc["_emp_id"] = None
                acc["_emp_name"] = acc.get("firma_adi")
                acc["_is_owner"] = True
            # Per-module access: overwrite modules with live entitlement so every
            # module-gated endpoint + the dashboard respects trial/purchase expiry.
            ent = _module_entitlement(acc)
            acc["_entitlement"] = ent
            acc["modules"] = {"vesikalik": ent["vesikalik"], "gallery": ent["gallery"]}
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
        return {"plans": effective_plans(), "trial_days": STUDIO_TRIAL_DAYS}

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
            "modules": {"vesikalik": True, "gallery": True},
            "brand_name": payload.firma_adi.strip(),
            "brand_logo_asset_id": None,
            "notify_email": None,
            "notify_enabled": True,
            "storage_used_bytes": 0,
            "kvkk_consent": True,
            "kvkk_consent_at": now.isoformat(),
            "created_at": now_iso(),
        }
        await db.studio_accounts.insert_one(doc)
        try:
            await db.notifications.insert_one({
                "id": new_id(), "kind": "studio_register",
                "title": "Yeni stüdyo kaydı",
                "message": f"{doc.get('firma_adi')} ({email}) ücretsiz deneme ile katıldı.",
                "severity": "general", "firma_adi": doc.get("firma_adi", ""),
                "link": "/admin/uyelikler", "read": False, "read_at": None, "created_at": now_iso(),
            })
        except Exception:
            pass
        access = create_access_token(doc["id"], email, "studio")
        _set_studio_cookie(response, access)
        return {"account": _strip_studio(doc), "token": access}

    # ---- Login (firm owner by email, OR employee by username) ---------------
    def _emp_token(studio_id: str, emp_id: str, emp_name: str) -> str:
        payload = {
            "sub": studio_id, "role": "studio", "type": "access",
            "emp": emp_id, "emp_name": emp_name,
            "exp": datetime.now(timezone.utc) + timedelta(hours=12),
        }
        return jwt.encode(payload, JWT_SECRET, algorithm=deps["JWT_ALGORITHM"])

    @router.post("/login")
    async def studio_login(payload: StudioLoginIn, response: Response):
        ident = payload.email.strip()
        # Site admin / staff ALWAYS get a full-access studio session first — even if
        # a regular (trial/expired) studio account exists under the same email.
        admin_user = await db.users.find_one({"email": ident.lower(), "role": {"$in": ["admin", "staff"]}})
        if admin_user and verify_password(payload.password, admin_user.get("password_hash", "")):
            adm = await ensure_admin_studio(db, admin_user["id"], admin_user.get("email"))
            access = create_access_token(adm["id"], admin_user.get("email") or ident.lower(), "studio")
            _set_studio_cookie(response, access)
            return {"account": _strip_studio(adm), "token": access}
        acc = await db.studio_accounts.find_one({"email": ident.lower()})
        if acc and verify_password(payload.password, acc.get("password_hash", "")):
            access = create_access_token(acc["id"], ident.lower(), "studio")
            _set_studio_cookie(response, access)
            acc["_is_owner"] = True
            acc["_emp_name"] = acc.get("firma_adi")
            return {"account": _strip_studio(acc), "token": access}
        # Employee login by username (case-insensitive)
        emp = await db.studio_employees.find_one({"username": ident.lower()})
        if emp and verify_password(payload.password, emp.get("password_hash", "")):
            if not emp.get("active", True):
                raise HTTPException(status_code=403, detail="Hesabınız pasif durumda. Firma yöneticinize başvurun.")
            firm = await db.studio_accounts.find_one({"id": emp["studio_id"]}, {"_id": 0})
            if not firm:
                raise HTTPException(status_code=401, detail="Firma bulunamadı")
            access = _emp_token(firm["id"], emp["id"], emp.get("name") or emp.get("username"))
            _set_studio_cookie(response, access)
            firm["_is_owner"] = False
            firm["_emp_id"] = emp["id"]
            firm["_emp_name"] = emp.get("name") or emp.get("username")
            return {"account": _strip_studio(firm), "token": access}
        raise HTTPException(status_code=401, detail="E-posta/kullanıcı adı veya şifre hatalı")

    # ---- Logout --------------------------------------------------------------
    @router.post("/logout")
    async def studio_logout(response: Response):
        response.delete_cookie("studio_token", path="/")
        return {"ok": True}

    # ---- Me ------------------------------------------------------------------
    @router.get("/me")
    async def studio_me(acc: dict = Depends(get_current_studio)):
        try:
            await db.studio_accounts.update_one(
                {"id": acc["id"]}, {"$set": {"last_seen": datetime.now(timezone.utc).isoformat()}})
        except Exception:
            pass
        return {"account": _strip_studio(acc), "plans": effective_plans()}

    # ---- Merkezi Duyuru (broadcast) — studio-facing --------------------------
    def _personalize(text: str, acc: dict) -> str:
        return (text or "").replace("{firma_adi}", acc.get("firma_adi") or "Değerli Üyemiz") \
                            .replace("{musteri_kodu}", acc.get("ftb_code") or "")

    @router.get("/announcements")
    async def studio_announcements(acc: dict = Depends(get_current_studio)):
        now = datetime.now(timezone.utc).isoformat()
        rows = await db.studio_announcements.find({"active": True}, {"_id": 0}).sort("created_at", -1).to_list(50)
        acked = set(await db.studio_announcement_acks.distinct(
            "announcement_id", {"studio_id": acc["id"]}))
        out = []
        for a in rows:
            if a.get("starts_at") and a["starts_at"] > now:
                continue
            if a.get("ends_at") and a["ends_at"] < now:
                continue
            is_acked = a["id"] in acked
            # dismissed non-sticky announcements are hidden; sticky critical stay
            if is_acked and not a.get("sticky"):
                continue
            out.append({
                "id": a["id"], "type": a.get("type", "update"),
                "title": _personalize(a.get("title", ""), acc),
                "message": _personalize(a.get("message", ""), acc),
                "dismissible": a.get("dismissible", True), "sticky": a.get("sticky", False),
                "acked": is_acked, "created_at": a.get("created_at"),
            })
        return {"announcements": out}

    @router.post("/announcements/{aid}/ack")
    async def studio_ack_announcement(aid: str, acc: dict = Depends(get_current_studio)):
        await db.studio_announcement_acks.update_one(
            {"announcement_id": aid, "studio_id": acc["id"]},
            {"$set": {"announcement_id": aid, "studio_id": acc["id"],
                      "acked_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
        return {"ok": True}

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
            raise HTTPException(status_code=402, detail="Tasarım hakkınız bitti. 'Hak Satın Al' ile yeni hak satın alabilirsiniz.")
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
            uid = None
            if str(acc.get("id", "")).startswith(("member-", "admin-")):
                uid = str(acc["id"]).split("-", 1)[1]
            if uid:
                u = await db.users.find_one({"id": uid}, {"_id": 0, "print_capacity": 1, "print_used": 1})
                cap = int((u or {}).get("print_capacity", 0) or 0)
                used = int((u or {}).get("print_used", 0) or 0)
                resp["print_capacity"] = cap
                resp["print_remaining"] = max(0, cap - used)
        return resp

    # ---- Personalized bulk-print packages (prints quota + bonus AI) --------
    @router.get("/design/bulk-print-packages")
    async def list_bulk_print_packages(acc: dict = Depends(get_current_studio)):
        pkgs = await db.bulk_print_packages.find({"active": True}, {"_id": 0}).sort("sort", 1).to_list(100)
        uid = None
        if str(acc.get("id", "")).startswith(("member-", "admin-")):
            uid = str(acc["id"]).split("-", 1)[1]
        cap = used = 0
        if uid:
            u = await db.users.find_one({"id": uid}, {"_id": 0, "print_capacity": 1, "print_used": 1})
            cap = int((u or {}).get("print_capacity", 0) or 0)
            used = int((u or {}).get("print_used", 0) or 0)
        return {"packages": pkgs, "print_capacity": cap, "print_used": used,
                "print_remaining": max(0, cap - used), "design_rights": int(acc.get("design_rights", 0) or 0)}

    class BulkPrintBuyIn(BaseModel):
        package_id: str
        origin_url: str = ""

    @router.post("/payments/bulk-print/create")
    async def buy_bulk_print(payload: BulkPrintBuyIn, request: Request, acc: dict = Depends(get_current_studio)):
        pkg = await db.bulk_print_packages.find_one({"id": payload.package_id, "active": True})
        if not pkg:
            raise HTTPException(status_code=400, detail="Geçersiz paket")
        uid = None
        if str(acc.get("id", "")).startswith(("member-", "admin-")):
            uid = str(acc["id"]).split("-", 1)[1]
        if not uid:
            raise HTTPException(status_code=400, detail="Toplu baskı paketi yalnızca üyelik hesabıyla alınır")
        title = f"Fotuber {int(pkg['prints'])} Isme Ozel Baski"
        return await create_paytr_order(
            title=title, price=float(pkg["price"]), origin_url=payload.origin_url,
            request_base_url=request.base_url,
            order_extra={"kind": "member_bulk_print", "user_id": uid, "studio_id": acc["id"],
                         "prints": int(pkg["prints"]), "bonus_ai": int(pkg.get("bonus_ai") or 0),
                         "package_id": pkg["id"]},
        )

    # ---- Module sales (Vesikalık / Etkinlik) via PayTR + 2nd-module 20% off ----
    class ModuleBuyIn(BaseModel):
        module: str
        plan: str
        origin_url: str = ""
        period: str = "monthly"

    def _module_price(mod: str, plan_id: str, mods: dict, period: str = "monthly"):
        if plan_id == "trial" or mod not in ("vesikalik", "gallery"):
            return None
        plan = _merged_plan(plan_id)
        if plan.get("id") != plan_id:
            return None
        owns_other = bool((mods or {}).get("gallery" if mod == "vesikalik" else "vesikalik", False))
        yearly = period == "yearly"
        mp = _MODULE_PRICING.get(mod)
        if mp:  # per-module admin price (independent of tier)
            base = float(mp["yearly"]) if yearly else float(mp["monthly"])
            base_yearly = float(mp["yearly"])
        else:
            base = float(plan.get("price_yearly") or (float(plan["price"]) * 10)) if yearly else float(plan["price"])
            base_yearly = float(plan.get("price_yearly") or (float(plan["price"]) * 10))
        disc = _second_module_discount()
        price = round(base * (1 - disc / 100.0), 2) if owns_other else base
        return {"plan": plan, "base": base, "price": price, "discount": disc if owns_other else 0,
                "period": period, "price_yearly": base_yearly}

    @router.get("/modules/pricing")
    async def modules_pricing(acc: dict = Depends(get_current_studio)):
        mods = acc.get("modules") or {}
        out = []
        for m in ("vesikalik", "gallery"):
            for p in STUDIO_PLANS:
                if p["id"] == "trial":
                    continue
                info = _module_price(m, p["id"], mods)
                info_y = _module_price(m, p["id"], mods, "yearly")
                monthly_x12 = float(info["base"]) * 12
                savings_pct = int(round((monthly_x12 - float(info_y["base"])) / monthly_x12 * 100)) if monthly_x12 > 0 else 0
                out.append({"module": m, "plan": p["id"], "plan_name": p["name"],
                            "base_price": info["base"], "price": info["price"], "discount": info["discount"],
                            "price_yearly": info_y["price"], "base_yearly": info_y["base"],
                            "savings_pct": max(0, savings_pct)})
        return {"pricing": out, "modules": mods,
                "note": f"İkinci modülde otomatik %{_second_module_discount()} indirim uygulanır."}

    @router.post("/payments/module/create")
    async def buy_module(payload: ModuleBuyIn, request: Request, acc: dict = Depends(get_current_studio)):
        period = "yearly" if getattr(payload, "period", "monthly") == "yearly" else "monthly"
        info = _module_price(payload.module, payload.plan, acc.get("modules") or {}, period)
        if not info:
            raise HTTPException(status_code=400, detail="Geçersiz modül veya plan")
        mlabel = "Vesikalık" if payload.module == "vesikalik" else "Etkinlik Galerisi"
        title = f"Fotuber {mlabel} {info['plan']['name']} ({'Yıllık' if period == 'yearly' else 'Aylık'})"
        return await create_paytr_order(
            title=title, price=info["price"], origin_url=payload.origin_url,
            request_base_url=request.base_url,
            order_extra={"kind": "studio_module", "studio_id": acc["id"], "module": payload.module,
                         "plan": info["plan"]["id"], "discount": info["discount"], "period": period},
        )

    # ---- Notification settings ------------------------------------------
    @router.put("/settings/notifications")
    async def update_notifications(payload: NotifySettingsIn, acc: dict = Depends(get_current_studio)):
        await db.studio_accounts.update_one(
            {"id": acc["id"]},
            {"$set": {"notify_email": (payload.notify_email or "").strip() or None,
                      "notify_enabled": bool(payload.notify_enabled)}})
        fresh = await db.studio_accounts.find_one({"id": acc["id"]}, {"_id": 0})
        return {"account": _strip_studio(fresh)}

    # ---- Brand (panel-only display; NOT added to Vesikalık print output) ----
    @router.put("/settings/brand")
    async def update_brand(payload: dict, acc: dict = Depends(get_current_studio)):
        name = (payload.get("brand_name") or "").strip()
        await db.studio_accounts.update_one(
            {"id": acc["id"]},
            {"$set": {"brand_name": name or acc.get("firma_adi")}})
        fresh = await db.studio_accounts.find_one({"id": acc["id"]}, {"_id": 0})
        return {"account": _strip_studio(fresh)}

    # ---- Employee (team) management (owner only) ----------------------------
    def _require_owner(acc: dict):
        if not acc.get("_is_owner", True):
            raise HTTPException(status_code=403, detail="Bu işlem yalnızca firma sahibi tarafından yapılabilir.")

    def _emp_out(e: dict) -> dict:
        return {"id": e["id"], "name": e.get("name"), "username": e.get("username"),
                "active": e.get("active", True), "created_at": e.get("created_at")}

    @router.get("/employees")
    async def list_employees(acc: dict = Depends(get_current_studio)):
        emps = await db.studio_employees.find({"studio_id": acc["id"]}, {"_id": 0}).sort("created_at", 1).to_list(100)
        state = _studio_state(acc)
        max_users = state["limits"].get("max_users", 1)
        return {"owner": {"name": acc.get("firma_adi"), "email": acc.get("email")},
                "employees": [_emp_out(e) for e in emps],
                "max_users": max_users, "used_users": 1 + len(emps),
                "can_add": (1 + len(emps)) < max_users}

    class EmployeeIn(BaseModel):
        name: str = Field(min_length=2, max_length=60)
        username: str = Field(min_length=3, max_length=40)
        password: str = Field(min_length=4, max_length=128)

    @router.post("/employees")
    async def add_employee(payload: EmployeeIn, acc: dict = Depends(get_current_studio)):
        _require_owner(acc)
        state = _studio_state(acc)
        max_users = state["limits"].get("max_users", 1)
        count = await db.studio_employees.count_documents({"studio_id": acc["id"]})
        if (1 + count) >= max_users:
            raise HTTPException(status_code=403, detail=f"Paket kullanıcı limitine ulaştınız ({max_users}). Daha fazla çalışan için paketinizi yükseltin.")
        uname = payload.username.lower().strip()
        if await db.studio_employees.find_one({"username": uname}) or await db.studio_accounts.find_one({"email": uname}):
            raise HTTPException(status_code=409, detail="Bu kullanıcı adı zaten kullanılıyor.")
        doc = {"id": new_id(), "studio_id": acc["id"], "name": payload.name.strip(),
               "username": uname, "password_hash": hash_password(payload.password),
               "active": True, "created_at": now_iso()}
        await db.studio_employees.insert_one(doc)
        return {"employee": _emp_out(doc)}

    class EmployeePatchIn(BaseModel):
        name: str | None = None
        active: bool | None = None

    @router.patch("/employees/{eid}")
    async def patch_employee(eid: str, payload: EmployeePatchIn, acc: dict = Depends(get_current_studio)):
        _require_owner(acc)
        upd = {}
        if payload.name is not None:
            upd["name"] = payload.name.strip()
        if payload.active is not None:
            upd["active"] = bool(payload.active)
        if not upd:
            raise HTTPException(status_code=400, detail="Güncellenecek alan yok")
        r = await db.studio_employees.update_one({"id": eid, "studio_id": acc["id"]}, {"$set": upd})
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Çalışan bulunamadı")
        return {"ok": True}

    class EmployeePwIn(BaseModel):
        password: str = Field(min_length=4, max_length=128)

    @router.post("/employees/{eid}/reset-password")
    async def reset_employee_pw(eid: str, payload: EmployeePwIn, acc: dict = Depends(get_current_studio)):
        _require_owner(acc)
        r = await db.studio_employees.update_one({"id": eid, "studio_id": acc["id"]},
                                                 {"$set": {"password_hash": hash_password(payload.password)}})
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Çalışan bulunamadı")
        return {"ok": True}

    @router.delete("/employees/{eid}")
    async def delete_employee(eid: str, acc: dict = Depends(get_current_studio)):
        _require_owner(acc)
        r = await db.studio_employees.delete_one({"id": eid, "studio_id": acc["id"]})
        if r.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Çalışan bulunamadı")
        return {"ok": True}

    # ---- Team chat (3+ user packages only) ----------------------------------
    def _chat_enabled(acc: dict) -> bool:
        return _studio_state(acc)["limits"].get("max_users", 1) >= 3

    @router.get("/chat")
    async def get_chat(acc: dict = Depends(get_current_studio)):
        if not _chat_enabled(acc):
            return {"enabled": False, "messages": [], "unread": 0}
        me = acc.get("_emp_id") or "owner"
        msgs = await db.studio_chat_messages.find({"studio_id": acc["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
        msgs = list(reversed(msgs))
        unread = sum(1 for m in msgs if me not in (m.get("read_by") or []) and m.get("sender_id") != me)
        return {"enabled": True, "messages": msgs, "unread": unread, "me": me}

    class ChatIn(BaseModel):
        text: str = Field(min_length=1, max_length=1000)

    @router.post("/chat")
    async def post_chat(payload: ChatIn, acc: dict = Depends(get_current_studio)):
        if not _chat_enabled(acc):
            raise HTTPException(status_code=403, detail="Ekip sohbeti 3+ kullanıcılı paketlerde aktiftir.")
        me = acc.get("_emp_id") or "owner"
        doc = {"id": new_id(), "studio_id": acc["id"], "sender_id": me,
               "sender_name": acc.get("_emp_name") or acc.get("firma_adi"),
               "text": payload.text.strip(), "read_by": [me], "created_at": now_iso()}
        await db.studio_chat_messages.insert_one(doc)
        doc.pop("_id", None)
        return {"message": doc}

    @router.post("/chat/read")
    async def read_chat(acc: dict = Depends(get_current_studio)):
        if not _chat_enabled(acc):
            return {"ok": True}
        me = acc.get("_emp_id") or "owner"
        await db.studio_chat_messages.update_many(
            {"studio_id": acc["id"], "read_by": {"$ne": me}}, {"$addToSet": {"read_by": me}})
        return {"ok": True}

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
