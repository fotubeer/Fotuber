from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import asyncio
import uuid
import base64
import hmac
import hashlib
import json
import bcrypt
import jwt
import requests
import email_service
import trend_radar
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import (
    FastAPI, APIRouter, HTTPException, Depends, Request, Response, status,
    UploadFile, File, Form, Query, Header, Body,
)
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import Response as StarletteResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 24  # 24h
REFRESH_TOKEN_DAYS = 7

# Object storage
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
APP_NAME = "fotuber"
_storage_key: Optional[str] = None


def init_storage() -> Optional[str]:
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_KEY:
        return None
    try:
        resp = requests.post(
            f"{STORAGE_URL}/init",
            json={"emergent_key": EMERGENT_KEY},
            timeout=30,
        )
        resp.raise_for_status()
        _storage_key = resp.json().get("storage_key")
        return _storage_key
    except Exception as e:
        logging.getLogger("fotuber").error(f"Storage init failed: {e}")
        return None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Depolama başlatılamadı")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=180,
    )
    if resp.status_code == 403:
        # refresh key once
        global _storage_key
        _storage_key = None
        key = init_storage()
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=180,
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> tuple[bytes, str]:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Depolama başlatılamadı")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=120,
    )
    if resp.status_code == 403:
        global _storage_key
        _storage_key = None
        key = init_storage()
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key},
            timeout=120,
        )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


def delete_object(path: str) -> bool:
    key = init_storage()
    if not key:
        return False
    try:
        resp = requests.delete(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key},
            timeout=60,
        )
        if resp.status_code == 403:
            global _storage_key
            _storage_key = None
            key = init_storage()
            resp = requests.delete(
                f"{STORAGE_URL}/objects/{path}",
                headers={"X-Storage-Key": key},
                timeout=60,
            )
        return resp.status_code in (200, 204, 404)
    except Exception:
        return False

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Fotuber API")
api_router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------
def new_id() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_DAYS),
        "type": "refresh",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    # In this preview deployment we run behind HTTPS, but same-site is 'none' for cross-site preview iframes.
    response.set_cookie(
        key="access_token", value=access, httponly=True, secure=True,
        samesite="none", max_age=ACCESS_TOKEN_MINUTES * 60, path="/",
    )
    response.set_cookie(
        key="refresh_token", value=refresh, httponly=True, secure=True,
        samesite="none", max_age=REFRESH_TOKEN_DAYS * 86400, path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


def strip_user(user: dict) -> dict:
    if not user:
        return user
    return {
        "id": user.get("id"),
        "email": user.get("email"),
        "name": user.get("name"),
        "phone": user.get("phone"),
        "role": user.get("role"),
        "can_trend_radar": True if user.get("role") == "admin" else bool(user.get("can_trend_radar")),
        "kvkk_consent": user.get("kvkk_consent", False),
        "marketing_consent": user.get("marketing_consent", False),
        "created_at": user.get("created_at"),
    }


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Kimlik doğrulaması gerekli")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Geçersiz token türü")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Oturum süresi doldu")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Geçersiz token")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Yetkisiz erişim")
    return user


async def require_staff_or_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in ("admin", "staff"):
        raise HTTPException(status_code=403, detail="Yetkisiz erişim")
    return user


async def require_trend_access(user: dict = Depends(get_current_user)) -> dict:
    """Admins always; staff only if granted the 'Sektör Radarı Görüntüleme' permission."""
    if user.get("role") == "admin":
        return user
    if user.get("role") == "staff" and user.get("can_trend_radar"):
        return user
    raise HTTPException(status_code=403, detail="Sektör Radarı görüntüleme yetkiniz yok")


MEMBER_MONTHLY_PRICE = float(os.environ.get("MEMBER_MONTHLY_PRICE", "99"))
MEMBER_YEARLY_PRICE = float(os.environ.get("MEMBER_YEARLY_PRICE", "899"))
TRIAL_DAYS = 30

def _membership_state(user: dict) -> dict:
    now = datetime.now(timezone.utc)
    def _parse(v):
        try:
            return datetime.fromisoformat(v) if v else None
        except Exception:
            return None
    trial_end = _parse(user.get("trial_end"))
    paid_until = _parse(user.get("paid_until"))
    active, mstatus, until = False, "expired", None
    if paid_until and paid_until > now:
        active, mstatus, until = True, "active", user.get("paid_until")
    elif trial_end and trial_end > now:
        active, mstatus, until = True, "trial", user.get("trial_end")
    return {"active": active, "status": mstatus, "until": until,
            "plan": user.get("plan") or ("trial" if mstatus == "trial" else ("paid" if mstatus == "active" else "none")),
            "price": MEMBER_MONTHLY_PRICE, "yearly_price": MEMBER_YEARLY_PRICE,
            "currency": "TRY", "trial_days": TRIAL_DAYS}


def _norm_phone(raw: str) -> str:
    digits = "".join(ch for ch in (raw or "") if ch.isdigit())
    if digits.startswith("90"):
        digits = digits[2:]
    if digits.startswith("0"):
        digits = digits[1:]
    return digits


def _norm_company(raw: str) -> str:
    return (raw or "").strip().lower()


async def _track_feature(user_id: str, feature: str):
    """Record that a user used a given site feature (for admin membership reporting)."""
    if not user_id:
        return
    try:
        await db.users.update_one(
            {"id": user_id},
            {"$addToSet": {"features_used": feature},
             "$set": {"last_active": datetime.now(timezone.utc).isoformat()}},
        )
    except Exception:
        pass


async def require_vesikalik_access(request: Request) -> dict:
    """Combined auth for Vesikalık: accepts main-site (admin/staff/member) OR a Studio
    account token (studio_token cookie / Bearer) that has the 'vesikalik' module.
    Studio accounts consume their own ai_credits; admin/staff use Emergent balance."""
    tokens = []
    ah = request.headers.get("Authorization", "")
    if ah.startswith("Bearer "):
        tokens.append(ah[7:])
    if request.cookies.get("access_token"):
        tokens.append(request.cookies["access_token"])
    if request.cookies.get("studio_token"):
        tokens.append(request.cookies["studio_token"])
    for tok in tokens:
        try:
            payload = jwt.decode(tok, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except Exception:
            continue
        if payload.get("type") != "access":
            continue
        role = payload.get("role")
        sub = payload.get("sub")
        if role == "studio":
            acc = await db.studio_accounts.find_one({"id": sub}, {"_id": 0})
            if not acc:
                continue
            mods = acc.get("modules") or {"vesikalik": True, "gallery": True}
            if not mods.get("vesikalik", True):
                raise HTTPException(status_code=403, detail="Vesikalık modülü paketinizde bulunmuyor.")
            acc["role"] = "studio"
            return acc
        user = await db.users.find_one({"id": sub}, {"_id": 0})
        if not user:
            continue
        r = user.get("role")
        if r in ("admin", "staff"):
            return user
        if r == "member":
            if not _membership_state(user)["active"]:
                raise HTTPException(status_code=402, detail="Üyeliğiniz aktif değil. Lütfen abone olun.")
            return user
    raise HTTPException(status_code=401, detail="Kimlik doğrulaması gerekli")


async def _deduct_vesikalik_credits(user: dict, new_remaining: int):
    """Persist remaining AI credits to the correct collection based on account type."""
    coll = db.studio_accounts if user.get("role") == "studio" else db.users
    await coll.update_one({"id": user.get("id")}, {"$set": {"ai_credits": int(new_remaining)}})


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    surname: str = Field(min_length=2, max_length=80)
    email: EmailStr
    phone: str = Field(min_length=7, max_length=20)
    password: str = Field(min_length=6, max_length=128)
    kvkk_consent: bool
    marketing_consent: bool = False


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class ServiceIn(BaseModel):
    name: str
    description: Optional[str] = ""
    price: float = 0
    duration_hours: int = 1
    image_url: Optional[str] = ""
    active: bool = True


class ServiceOut(ServiceIn):
    id: str
    created_at: str


class AppointmentIn(BaseModel):
    service_id: str
    date: str  # YYYY-MM-DD
    time: str  # HH:MM (30-min slot)
    notes: Optional[str] = ""
    contract_accepted: bool = False
    # Extended event configuration
    event_type: Optional[str] = None            # wedding|engagement_venue|kina|nikah|birthday|bride_party|other
    event_addons: Optional[List[str]] = None    # e.g. ["klip", "album", "tablo"]
    extra_services_note: Optional[str] = ""
    phone_2: Optional[str] = ""


class MidPaymentIn(BaseModel):
    amount: float = Field(gt=0)
    date: str                       # YYYY-MM-DD
    method: Literal["cash", "card", "transfer"] = "cash"
    note: Optional[str] = ""


class AppointmentAdminUpdate(BaseModel):
    status: Optional[Literal["pending", "approved", "cancelled"]] = None
    deposit_amount: Optional[float] = None
    total_amount: Optional[float] = None
    paid_amount: Optional[float] = None
    notes: Optional[str] = None
    admin_notes: Optional[str] = None
    phone_2: Optional[str] = None
    event_type: Optional[str] = None
    event_addons: Optional[List[str]] = None
    extra_services_note: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None


class BlockedSlotIn(BaseModel):
    date: str
    time: str
    reason: Optional[str] = ""


class StaffIn(BaseModel):
    name: str
    role: str = "Fotoğrafçı"
    phone: Optional[str] = ""
    email: Optional[str] = ""
    salary: float = 0
    active: bool = True
    hired_at: Optional[str] = None


class SiteSettingsIn(BaseModel):
    business_name: Optional[str] = None
    tagline: Optional[str] = None
    hero_title: Optional[str] = None
    hero_title_accent: Optional[str] = None
    hero_subtitle: Optional[str] = None
    hero_intro: Optional[str] = None
    about_text: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    instagram: Optional[str] = None
    instagram_secondary: Optional[str] = None
    youtube: Optional[str] = None
    tiktok: Optional[str] = None
    facebook: Optional[str] = None
    google_maps_url: Optional[str] = None
    google_maps_embed: Optional[str] = None
    notification_recipients: Optional[str] = None  # comma-separated phone list
    msg_new_appointment: Optional[str] = None
    msg_approved: Optional[str] = None
    msg_cancelled: Optional[str] = None
    msg_reminder: Optional[str] = None
    contract_terms: Optional[str] = None
    discount_active: Optional[bool] = None
    discount_percent: Optional[float] = None
    discount_expiry_days: Optional[int] = None
    discount_heading: Optional[str] = None
    discount_subtitle: Optional[str] = None
    hero_image_url: Optional[str] = None
    # Analytics & typography (added Feb 2026)
    google_analytics_id: Optional[str] = None
    font_heading: Optional[str] = None
    font_body: Optional[str] = None
    font_scale: Optional[float] = None
    h1_size_class: Optional[str] = None
    h2_size_class: Optional[str] = None
    body_size_class: Optional[str] = None
    # SEO
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    seo_keywords: Optional[str] = None
    seo_og_image_url: Optional[str] = None
    seo_site_url: Optional[str] = None
    seo_business_type: Optional[str] = None  # e.g. "PhotographyBusiness"
    seo_opening_hours: Optional[str] = None  # e.g. "Mo-Sa 09:00-19:00"
    seo_price_range: Optional[str] = None    # e.g. "₺₺"
    google_search_console_verification: Optional[str] = None
    # Intro animation configuration (added Feb 2026)
    intro_enabled: Optional[bool] = None
    intro_sound_enabled: Optional[bool] = None
    intro_volume: Optional[float] = None            # 0.0 - 1.0
    intro_greeting_text: Optional[str] = None       # supports {ad} placeholder
    intro_brand_top: Optional[str] = None           # bold headline (e.g. "Fotuber")
    intro_brand_bottom: Optional[str] = None        # cursive subtitle (e.g. "Görsel Sanat")
    intro_subtitle_domain: Optional[str] = None     # tiny label (e.g. "fotuber.com.tr")
    intro_font_greeting: Optional[str] = None       # CSS font-family stack
    intro_font_brand: Optional[str] = None
    intro_font_cursive: Optional[str] = None
    intro_logo_id: Optional[str] = None             # separate logo file id (falls back to site logo_id)
    # Fotuber AI Assistant (added Feb 2026)
    ai_enabled: Optional[bool] = None
    ai_model: Optional[str] = None                   # "claude-sonnet-4-6" | "gpt-5.4" | "gemini-3-flash-preview"
    ai_provider: Optional[str] = None                # "anthropic" | "openai" | "gemini"
    ai_system_prompt: Optional[str] = None
    ai_welcome_message: Optional[str] = None
    ai_bubble_text: Optional[str] = None
    ai_button_label: Optional[str] = None
    ai_default_city: Optional[str] = None


class TransactionIn(BaseModel):
    kind: Literal["income", "expense"]
    amount: float = Field(gt=0)
    payment_method: Literal["cash", "card", "transfer"]
    category: Optional[str] = ""
    description: Optional[str] = ""
    date: str  # YYYY-MM-DD
    appointment_id: Optional[str] = None
    staff_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.appointments.create_index([("date", 1), ("time", 1)])
    await db.blocked_slots.create_index([("date", 1), ("time", 1)], unique=True)
    await db.gallery.create_index([("category", 1), ("created_at", -1)])
    await db.notifications.create_index([("created_at", -1)])
    await db.photo_albums.create_index("share_token", unique=True)
    await db.album_photos.create_index([("album_id", 1), ("sort_order", 1)])
    await db.photo_selections.create_index([("album_id", 1), ("user_id", 1)])
    await db.guest_events.create_index("upload_token", unique=True)
    await db.guest_uploads.create_index([("event_id", 1), ("user_id", 1)])
    await db.guest_uploads.create_index("delete_at")
    await db.venues.create_index("qr_token", unique=True)
    await db.guest_events.create_index("download_token")
    await db.email_log.create_index("notification_key", unique=True)
    await db.invitations.create_index("slug", unique=True)
    await db.invitations.create_index([("owner_user_id", 1), ("created_at", -1)])
    await db.invitation_rsvps.create_index([("invitation_id", 1), ("created_at", -1)])
    await db.invitation_memories.create_index([("invitation_id", 1), ("created_at", -1)])
    await db.invitation_photos.create_index([("invitation_id", 1), ("created_at", -1)])
    await db.invitation_rsvps.create_index("checkin_token")
    await db.invitation_guests.create_index([("invitation_id", 1), ("created_at", 1)])
    await db.invitation_guests.create_index("guest_token")
    init_storage()

    # Start background cleanup task (deletes expired guest uploads once an hour)
    asyncio.create_task(_cleanup_expired_uploads())
    # Start membership expiry reminder loop (7 & 3 days before expiry / trial end)
    asyncio.create_task(_membership_reminder_loop())
    # Start Sektör Radarı daily generation loop (key-free internet scan)
    asyncio.create_task(_trend_radar_loop())

    # Seed default site settings if missing
    if await db.site_settings.count_documents({}) == 0:
        await db.site_settings.insert_one({
            "id": "singleton",
            "business_name": "Fotuber",
            "tagline": "Studio · fotuber.com.tr",
            "hero_title": "Anlar, ",
            "hero_title_accent": "ışıkla",
            "hero_subtitle": "ölümsüzleşir.",
            "hero_intro": "Düğün ve nişan çekimlerinden podcast prodüksiyonuna, stüdyo portresinden klip yapımına — Fotuber ile her ana özenle, sinematik bir bakışla dokunuyoruz.",
            "about_text": "Fotuber, düğün ve nişan çekimlerinden podcast prodüksiyonuna, stüdyo portresinden klip yapımına ve karaoke etkinliklerine kadar geniş bir hizmet yelpazesi sunan modern bir prodüksiyon stüdyosudur.",
            "phone": "05010002523",
            "whatsapp": "905010002523",
            "email": "info@fotuber.com.tr",
            "address": "fotuber.com.tr · Randevu ile ziyaret",
            "instagram": "",
            "instagram_secondary": "",
            "youtube": "",
            "tiktok": "",
            "facebook": "",
            "google_maps_url": "",
            "google_maps_embed": "",
            "notification_recipients": "",
            "msg_new_appointment": "Merhaba {ad}, {tarih} {saat} için {hizmet} randevu talebiniz alındı. Ekibimiz sizi arayacak. — {marka}",
            "msg_approved": "Merhaba {ad}, {tarih} {saat} tarihindeki {hizmet} randevunuz onaylandı. Adres: {adres}. Yol tarifi: {harita_link}. — {marka}",
            "msg_cancelled": "Merhaba {ad}, {tarih} {saat} randevunuz iptal edilmiştir. Detay için: {telefon}. — {marka}",
            "msg_reminder": "Merhaba {ad}, yarın {tarih} {saat} {hizmet} randevunuz var. Adres: {adres}. Yol tarifi: {harita_link}. Görüşmek üzere! — {marka}",
            "contract_terms": "Bu alana Fotuber Studio hizmet sözleşmesinin maddelerini yazınız.\n\n1. Randevu ve Kapora: ...\n2. İptal ve İade Koşulları: ...\n3. Fikri Mülkiyet Hakları: ...\n4. Görüntülerin Kullanımı ve KVKK: ...\n5. Diğer Koşullar: ...\n\n(Metni Site Ayarları > Sözleşme Metni alanından güncelleyebilirsiniz.)",
            "discount_active": True,
            "discount_percent": 10.0,
            "discount_expiry_days": 60,
            "discount_heading": "Sosyal medyada takip et, %10 indirim kazan",
            "discount_subtitle": "Instagram ve YouTube hesaplarımızı takip ederek özel indirim kodunuzu anında alın. Kod, stüdyoya bizzat geldiğinizde geçerli olur.",
            "logo_id": None,
            "hero_image_url": "https://images.pexels.com/photos/5762880/pexels-photo-5762880.jpeg",
            "updated_at": now_iso(),
        })

    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@fotuber.com.tr").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "FTB.2024")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "id": new_id(),
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Fotuber Yönetici",
            "phone": "",
            "role": "admin",
            "created_at": now_iso(),
        })
    else:
        if not verify_password(admin_password, existing.get("password_hash", "")):
            await db.users.update_one(
                {"email": admin_email},
                {"$set": {"password_hash": hash_password(admin_password), "role": "admin"}},
            )

    # Convenience alias: same password works for admin@fotuber.com (without .tr)
    alias_email = "admin@fotuber.com"
    if alias_email != admin_email:
        alias_existing = await db.users.find_one({"email": alias_email})
        alias_doc = {
            "email": alias_email,
            "password_hash": hash_password(admin_password),
            "name": "Fotuber Yönetici",
            "phone": "",
            "role": "admin",
        }
        if alias_existing is None:
            alias_doc["id"] = new_id()
            alias_doc["created_at"] = now_iso()
            await db.users.insert_one(alias_doc)
        else:
            await db.users.update_one(
                {"email": alias_email},
                {"$set": {"password_hash": hash_password(admin_password), "role": "admin"}},
            )

    # Seed services
    if await db.services.count_documents({}) == 0:
        defaults = [
            {"name": "Düğün Çekimi", "description": "Düğün töreni ve after party fotoğraf/video çekimi.", "price": 25000, "duration_hours": 8, "image_url": "https://images.unsplash.com/photo-1596457221755-b96bc3a6df18?crop=entropy&cs=srgb&fm=jpg&q=85", "active": True},
            {"name": "Portre Çekimi", "description": "Stüdyoda profesyonel portre çekimi.", "price": 3500, "duration_hours": 2, "image_url": "https://images.pexels.com/photos/23991042/pexels-photo-23991042.jpeg", "active": True},
            {"name": "Ürün Çekimi", "description": "E-ticaret için ürün fotoğraf çekimi.", "price": 4500, "duration_hours": 3, "image_url": "https://images.unsplash.com/photo-1697301439938-46e2b8ff74da?crop=entropy&cs=srgb&fm=jpg&q=85", "active": True},
            {"name": "Aile Çekimi", "description": "Stüdyoda aile fotoğraf çekimi.", "price": 2800, "duration_hours": 1, "image_url": "https://images.pexels.com/photos/37409083/pexels-photo-37409083.jpeg", "active": True},
            {"name": "Doğum Günü Çekimi", "description": "Doğum günü organizasyonlarında dış mekan çekim.", "price": 3200, "duration_hours": 2, "image_url": "https://images.pexels.com/photos/5762880/pexels-photo-5762880.jpeg", "active": True},
        ]
        for s in defaults:
            s.update({"id": new_id(), "created_at": now_iso()})
            await db.services.insert_one(s)

    # Seed design-rights packages (admin-configurable via /api/admin/design-rights-packages)
    if await db.design_rights_packages.count_documents({}) == 0:
        for i, p in enumerate([
            {"name": "1 Tasarım Hakkı", "rights": 1, "price": 149.0},
            {"name": "3 Tasarım Hakkı", "rights": 3, "price": 399.0},
            {"name": "5 Tasarım Hakkı", "rights": 5, "price": 599.0},
            {"name": "10 Tasarım Hakkı", "rights": 10, "price": 999.0},
        ]):
            await db.design_rights_packages.insert_one({
                "id": new_id(), "name": p["name"], "rights": p["rights"], "price": p["price"],
                "active": True, "sort": i, "created_at": now_iso(),
            })


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


# ---------------------------------------------------------------------------
# Auth Endpoints
# ---------------------------------------------------------------------------
@api_router.post("/auth/register")
async def register(payload: RegisterInput, response: Response):
    email = payload.email.lower()
    if not payload.kvkk_consent:
        raise HTTPException(status_code=400, detail="KVKK aydınlatma metnini kabul etmelisiniz")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Bu e-posta ile kayıtlı bir hesap mevcut")
    now = now_iso()
    user_doc = {
        "id": new_id(),
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": f"{payload.name} {payload.surname}",
        "phone": payload.phone,
        "role": "customer",
        "kvkk_consent": True,
        "kvkk_consent_at": now,
        "marketing_consent": payload.marketing_consent,
        "marketing_consent_at": now if payload.marketing_consent else None,
        "created_at": now,
    }
    await db.users.insert_one(user_doc)
    access = create_access_token(user_doc["id"], email, "customer")
    refresh = create_refresh_token(user_doc["id"])
    set_auth_cookies(response, access, refresh)
    return {"user": strip_user(user_doc), "token": access}


@api_router.post("/auth/login")
async def login(payload: LoginInput, response: Response):
    email = payload.email.strip().lower()
    password = payload.password
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="E-posta veya şifre hatalı")
    access = create_access_token(user["id"], email, user["role"])
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    return {"user": strip_user(user), "token": access}


@api_router.post("/auth/logout")
async def logout(response: Response):
    clear_auth_cookies(response)
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return strip_user(user)


# ---------------------------------------------------------------------------
# Public: Services
# ---------------------------------------------------------------------------
@api_router.get("/services")
async def list_services(only_active: bool = True):
    q = {"active": True} if only_active else {}
    items = await db.services.find(q, {"_id": 0}).sort("created_at", 1).to_list(200)
    return items


@api_router.post("/services")
async def create_service(payload: ServiceIn, admin: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_iso()
    await db.services.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/services/{sid}")
async def update_service(sid: str, payload: ServiceIn, admin: dict = Depends(require_admin)):
    res = await db.services.update_one({"id": sid}, {"$set": payload.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Hizmet bulunamadı")
    doc = await db.services.find_one({"id": sid}, {"_id": 0})
    return doc


@api_router.delete("/services/{sid}")
async def delete_service(sid: str, admin: dict = Depends(require_admin)):
    await db.services.delete_one({"id": sid})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Public: Availability
# ---------------------------------------------------------------------------
# 30-min interval slots
PUBLIC_OPENING_HOUR = 8   # earliest slot 08:00
PUBLIC_CLOSING_HOUR = 24  # last slot 23:30 (exclusive of 24:00)


def _generate_slots(start_hour: int, end_hour: int) -> List[str]:
    out = []
    total_start = start_hour * 60
    total_end = end_hour * 60
    for minute in range(total_start, total_end, 30):
        h = minute // 60
        m = minute % 60
        out.append(f"{h:02d}:{m:02d}")
    return out


PUBLIC_SLOTS = _generate_slots(PUBLIC_OPENING_HOUR, PUBLIC_CLOSING_HOUR)   # 08:00..23:30
FULL_SLOTS = _generate_slots(0, 24)                                        # 00:00..23:30
SLOTS = PUBLIC_SLOTS  # legacy alias for existing code


async def _try_get_current_user(request: Request) -> Optional[dict]:
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


@api_router.get("/availability")
async def availability(date: str, request: Request):
    """Return list of slots with status per date. Admin/staff see full 24h; public sees 08:00-23:30 and booked slots are hidden."""
    user = await _try_get_current_user(request)
    is_privileged = bool(user and user.get("role") in ("admin", "staff"))
    slots_source = FULL_SLOTS if is_privileged else PUBLIC_SLOTS

    # approved appointments block
    approved = await db.appointments.find(
        {"date": date, "status": "approved"}, {"_id": 0, "time": 1}
    ).to_list(500)
    blocked = await db.blocked_slots.find({"date": date}, {"_id": 0, "time": 1}).to_list(500)

    booked_times = {a["time"] for a in approved} | {b["time"] for b in blocked}
    result = []
    now = datetime.now(timezone.utc)
    for t in slots_source:
        try:
            slot_dt = datetime.fromisoformat(f"{date}T{t}:00+00:00")
        except Exception:
            slot_dt = now
        past = slot_dt < now - timedelta(hours=1)
        is_taken = t in booked_times or past
        if is_privileged:
            # admin/staff sees everything and knows what is booked
            result.append({"time": t, "status": "booked" if is_taken else "available"})
        else:
            # public: hide booked slots entirely (no availability visibility)
            if is_taken:
                continue
            result.append({"time": t, "status": "available"})
    return {"date": date, "slots": result}


# ---------------------------------------------------------------------------
# Appointments
# ---------------------------------------------------------------------------
async def _enrich_appointment(a: dict, service_map: Optional[dict] = None) -> dict:
    if not a:
        return a
    a.pop("_id", None)
    if service_map is not None:
        svc = service_map.get(a.get("service_id"))
    else:
        svc = await db.services.find_one({"id": a.get("service_id")}, {"_id": 0, "name": 1, "price": 1})
    a["service_name"] = svc["name"] if svc else "Bilinmeyen Hizmet"
    a["service_price"] = svc["price"] if svc else 0
    # Compute derived financials
    mp = a.get("mid_payments") or []
    mid_total = sum(float(p.get("amount", 0) or 0) for p in mp)
    deposit = float(a.get("deposit_amount") or 0)
    total = float(a.get("total_amount") or 0)
    paid_from_field = float(a.get("paid_amount") or 0)
    # Sum of paid = max(paid_amount_field, deposit + mid_total) to keep back-compat
    paid_total = max(paid_from_field, deposit + mid_total)
    a["mid_payments_total"] = round(mid_total, 2)
    a["paid_total"] = round(paid_total, 2)
    a["remaining_amount"] = round(max(total - paid_total, 0), 2)
    return a


@api_router.post("/appointments")
async def create_appointment(payload: AppointmentIn, user: dict = Depends(get_current_user)):
    if user.get("role") != "customer":
        raise HTTPException(status_code=403, detail="Sadece müşteriler randevu oluşturabilir")

    if not payload.contract_accepted:
        raise HTTPException(status_code=400, detail="Randevu oluşturmak için sözleşme maddelerini kabul etmelisiniz")

    if payload.time not in PUBLIC_SLOTS:
        raise HTTPException(status_code=400, detail="Geçersiz saat dilimi (08:00 - 23:30 arasında 30 dk aralıklarla seçin)")

    # Check if slot already blocked
    if await db.appointments.find_one({"date": payload.date, "time": payload.time, "status": "approved"}):
        raise HTTPException(status_code=409, detail="Bu saat dolu")
    if await db.blocked_slots.find_one({"date": payload.date, "time": payload.time}):
        raise HTTPException(status_code=409, detail="Bu saat kapalı")

    service = await db.services.find_one({"id": payload.service_id}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Hizmet bulunamadı")

    now = now_iso()
    doc = {
        "id": new_id(),
        "user_id": user["id"],
        "customer_name": user.get("name"),
        "customer_phone": user.get("phone"),
        "customer_email": user.get("email"),
        "phone_2": payload.phone_2 or "",
        "service_id": payload.service_id,
        "date": payload.date,
        "time": payload.time,
        "notes": payload.notes or "",
        "admin_notes": "",
        "event_type": payload.event_type or "",
        "event_addons": payload.event_addons or [],
        "extra_services_note": payload.extra_services_note or "",
        "status": "pending",
        "deposit_amount": 0,
        "total_amount": service.get("price", 0),
        "paid_amount": 0,
        "mid_payments": [],
        "origin": "online",
        "contract_accepted": True,
        "contract_accepted_at": now,
        "physical_contract_needed": True,  # they still need to sign in-person / confirm
        "contract_file_id": None,
        "created_at": now,
    }
    await db.appointments.insert_one(doc)
    await _track_feature(user["id"], "randevu")
    await db.notifications.insert_one({
        "id": new_id(),
        "kind": "appointment_pending",
        "title": "Yeni randevu talebi",
        "message": f"{user.get('name')} · {service.get('name')} · {payload.date} {payload.time}",
        "appointment_id": doc["id"],
        "severity": "critical",
        "firma_adi": user.get("company_name") or user.get("name") or "",
        "link": "/admin/randevular",
        "read": False,
        "read_at": None,
        "created_at": now_iso(),
    })

    ctx = await _build_message_context(doc)
    settings = await db.site_settings.find_one({"id": "singleton"}, {"_id": 0}) or {}
    # 1) External notify to ADMIN/STAFF that a new request came
    await _try_send_external_notification(
        title="Yeni Randevu Talebi",
        body=f"{doc.get('customer_name')} · {service.get('name')} · {doc.get('date')} {doc.get('time')}. Onaylamak için: {os.environ.get('PUBLIC_URL','')}/admin/randevular",
    )
    # 2) Optional acknowledgment to CUSTOMER (if template present)
    tpl = settings.get("msg_new_appointment")
    if tpl and doc.get("customer_phone"):
        await _try_send_external_notification(
            title="",
            body=_render_template(tpl, ctx),
            to_numbers=[doc["customer_phone"]],
        )

    return await _enrich_appointment(doc)


async def _build_service_map(items: list) -> dict:
    ids = list({a.get("service_id") for a in items if a.get("service_id")})
    if not ids:
        return {}
    svcs = await db.services.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "price": 1}).to_list(len(ids))
    return {s["id"]: s for s in svcs}


@api_router.get("/appointments/me")
async def my_appointments(user: dict = Depends(get_current_user)):
    items = await db.appointments.find({"user_id": user["id"]}).sort("created_at", -1).to_list(200)
    smap = await _build_service_map(items)
    return [await _enrich_appointment(i, smap) for i in items]


@api_router.get("/appointments")
async def list_appointments(
    admin: dict = Depends(require_admin),
    status_filter: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    q: dict = {}
    if status_filter:
        q["status"] = status_filter
    if date_from or date_to:
        rng = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to
        q["date"] = rng
    items = await db.appointments.find(q).sort([("date", 1), ("time", 1)]).to_list(500)
    smap = await _build_service_map(items)
    return [await _enrich_appointment(i, smap) for i in items]


@api_router.patch("/appointments/{aid}")
async def update_appointment(aid: str, payload: AppointmentAdminUpdate, admin: dict = Depends(require_admin)):
    existing = await db.appointments.find_one({"id": aid})
    if not existing:
        raise HTTPException(status_code=404, detail="Randevu bulunamadı")

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}

    # If date/time being changed, ensure it's a valid 30-min slot and not taken
    new_date = updates.get("date") or existing["date"]
    new_time = updates.get("time") or existing["time"]
    if updates.get("date") is not None or updates.get("time") is not None:
        if new_time not in FULL_SLOTS:
            raise HTTPException(status_code=400, detail="Geçersiz saat dilimi (30 dk aralıklarla seçin)")
        if new_date != existing["date"] or new_time != existing["time"]:
            conflict = await db.appointments.find_one({
                "id": {"$ne": aid},
                "date": new_date,
                "time": new_time,
                "status": "approved",
            })
            if conflict:
                raise HTTPException(status_code=409, detail="Bu saat başka bir randevu tarafından işgal edildi")
            if await db.blocked_slots.find_one({"date": new_date, "time": new_time}):
                raise HTTPException(status_code=409, detail="Bu saat kapalı")

    if payload.status == "approved":
        # ensure slot not double-booked
        conflict = await db.appointments.find_one({
            "id": {"$ne": aid},
            "date": new_date,
            "time": new_time,
            "status": "approved",
        })
        if conflict:
            raise HTTPException(status_code=409, detail="Bu saat başka bir randevu tarafından işgal edildi")
        updates["approved_at"] = now_iso()
    if payload.status == "cancelled":
        updates["cancelled_at"] = now_iso()

    updates["updated_at"] = now_iso()
    await db.appointments.update_one({"id": aid}, {"$set": updates})
    doc = await db.appointments.find_one({"id": aid}, {"_id": 0})

    # Notify CUSTOMER when status changes
    settings = await db.site_settings.find_one({"id": "singleton"}, {"_id": 0}) or {}
    ctx = await _build_message_context(doc)
    tpl = None
    if payload.status == "approved":
        tpl = settings.get("msg_approved")
    elif payload.status == "cancelled":
        tpl = settings.get("msg_cancelled")
    if tpl and doc.get("customer_phone"):
        await _try_send_external_notification(
            title="",
            body=_render_template(tpl, ctx),
            to_numbers=[doc["customer_phone"]],
        )
    return await _enrich_appointment(doc)


@api_router.delete("/appointments/{aid}")
async def delete_appointment(aid: str, admin: dict = Depends(require_admin)):
    await db.appointments.delete_one({"id": aid})
    return {"ok": True}


@api_router.get("/appointments/{aid}")
async def get_appointment(aid: str, admin: dict = Depends(require_staff_or_admin)):
    doc = await db.appointments.find_one({"id": aid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Randevu bulunamadı")
    return await _enrich_appointment(doc)


@api_router.post("/appointments/{aid}/mid-payments")
async def add_mid_payment(aid: str, payload: MidPaymentIn, admin: dict = Depends(require_admin)):
    """Add an interim (mid) payment to an existing appointment (admin only).

    Also writes a linked row into the `transactions` ledger so that the
    payment shows up automatically in Finans / Nakit Akışı and the
    daily-earnings totals on the Kasa Devir Defteri page.
    """
    appt = await db.appointments.find_one({"id": aid})
    if not appt:
        raise HTTPException(status_code=404, detail="Randevu bulunamadı")
    now = now_iso()
    entry = {
        "id": new_id(),
        "amount": float(payload.amount),
        "date": payload.date,
        "method": payload.method,
        "note": payload.note or "",
        "created_at": now,
        "created_by": admin.get("id"),
        "created_by_name": admin.get("name") or admin.get("email"),
    }
    await db.appointments.update_one(
        {"id": aid},
        {"$push": {"mid_payments": entry}, "$set": {"updated_at": now_iso()}},
    )
    # Mirror into the transactions ledger so daily/monthly totals stay in sync
    customer = appt.get("customer_name") or appt.get("user_name") or "Müşteri"
    service = appt.get("service_name") or ""
    desc_bits = [f"Randevu #{aid[:6]}", customer]
    if service:
        desc_bits.append(service)
    if payload.note:
        desc_bits.append(payload.note)
    tx_doc = {
        "id": new_id(),
        "kind": "income",
        "amount": float(payload.amount),
        "payment_method": payload.method,
        "category": "Randevu Ödemesi",
        "description": " · ".join(desc_bits),
        "date": payload.date,
        "appointment_id": aid,
        "mid_payment_id": entry["id"],
        "source": "appointment",
        "created_at": now,
        "created_by": admin.get("id"),
        "created_by_name": admin.get("name"),
        "created_by_role": admin.get("role"),
    }
    await db.transactions.insert_one(tx_doc)
    doc = await db.appointments.find_one({"id": aid}, {"_id": 0})
    return await _enrich_appointment(doc)


@api_router.delete("/appointments/{aid}/mid-payments/{pid}")
async def remove_mid_payment(aid: str, pid: str, admin: dict = Depends(require_admin)):
    """Remove a specific mid-payment (admin only) and its mirrored transaction."""
    res = await db.appointments.update_one(
        {"id": aid},
        {"$pull": {"mid_payments": {"id": pid}}, "$set": {"updated_at": now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Randevu bulunamadı")
    await db.transactions.delete_one({"mid_payment_id": pid, "source": "appointment"})
    doc = await db.appointments.find_one({"id": aid}, {"_id": 0})
    return await _enrich_appointment(doc)


# ---- Contract file upload (signed physical contract) ----
class WalkinAppointmentIn(BaseModel):
    customer_name: str
    customer_phone: str
    customer_email: Optional[str] = ""
    phone_2: Optional[str] = ""
    service_id: str
    date: str
    time: str
    deposit_amount: float = 0
    total_amount: Optional[float] = None
    paid_amount: float = 0
    notes: Optional[str] = ""
    admin_notes: Optional[str] = ""
    event_type: Optional[str] = None
    event_addons: Optional[List[str]] = None
    extra_services_note: Optional[str] = ""
    auto_approve: bool = True


@api_router.post("/appointments/walkin")
async def create_walkin_appointment(payload: WalkinAppointmentIn, admin: dict = Depends(require_admin)):
    """Admin creates a face-to-face appointment for a walk-in customer."""
    if payload.time not in FULL_SLOTS:
        raise HTTPException(status_code=400, detail="Geçersiz saat dilimi (30 dk aralıklarla seçin)")
    if await db.appointments.find_one({"date": payload.date, "time": payload.time, "status": "approved"}):
        raise HTTPException(status_code=409, detail="Bu saat dolu")
    if await db.blocked_slots.find_one({"date": payload.date, "time": payload.time}):
        raise HTTPException(status_code=409, detail="Bu saat kapalı")

    service = await db.services.find_one({"id": payload.service_id}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Hizmet bulunamadı")

    now = now_iso()
    doc = {
        "id": new_id(),
        "user_id": None,
        "customer_name": payload.customer_name,
        "customer_phone": payload.customer_phone,
        "customer_email": payload.customer_email or "",
        "phone_2": payload.phone_2 or "",
        "service_id": payload.service_id,
        "date": payload.date,
        "time": payload.time,
        "notes": payload.notes or "",
        "admin_notes": payload.admin_notes or "",
        "event_type": payload.event_type or "",
        "event_addons": payload.event_addons or [],
        "extra_services_note": payload.extra_services_note or "",
        "status": "approved" if payload.auto_approve else "pending",
        "deposit_amount": payload.deposit_amount,
        "total_amount": payload.total_amount if payload.total_amount is not None else service.get("price", 0),
        "paid_amount": payload.paid_amount,
        "mid_payments": [],
        "origin": "walkin",
        "contract_accepted": True,  # signed in-person
        "contract_accepted_at": now,
        "physical_contract_needed": False,
        "contract_file_id": None,
        "created_at": now,
        "approved_at": now if payload.auto_approve else None,
    }
    await db.appointments.insert_one(doc)
    return await _enrich_appointment(doc)


@api_router.post("/appointments/{aid}/contract")
async def upload_contract(aid: str, file: UploadFile = File(...), admin: dict = Depends(require_admin)):
    appt = await db.appointments.find_one({"id": aid})
    if not appt:
        raise HTTPException(status_code=404, detail="Randevu bulunamadı")
    ext = (file.filename or "bin").split(".")[-1].lower()
    content_type = file.content_type or "application/octet-stream"
    file_id = new_id()
    path = f"{APP_NAME}/contracts/{aid}/{file_id}.{ext}"
    data = await file.read()
    put_object(path, data, content_type)

    await db.contracts.insert_one({
        "id": file_id,
        "appointment_id": aid,
        "storage_path": path,
        "content_type": content_type,
        "size": len(data),
        "original_filename": file.filename,
        "uploaded_by": admin.get("id"),
        "created_at": now_iso(),
    })
    await db.appointments.update_one(
        {"id": aid},
        {"$set": {"contract_file_id": file_id, "physical_contract_needed": False, "updated_at": now_iso()}},
    )
    return {"contract_file_id": file_id}


@api_router.get("/appointments/{aid}/contract")
async def download_contract(aid: str, admin: dict = Depends(require_admin)):
    appt = await db.appointments.find_one({"id": aid})
    if not appt or not appt.get("contract_file_id"):
        raise HTTPException(status_code=404, detail="Bu randevu için sözleşme yüklenmemiş")
    doc = await db.contracts.find_one({"id": appt["contract_file_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Sözleşme dosyası kayıp")
    data, ct = get_object(doc["storage_path"])
    return StarletteResponse(
        content=data,
        media_type=doc.get("content_type", ct),
        headers={"Cache-Control": "no-store"},
    )


@api_router.delete("/appointments/{aid}/contract")
async def delete_contract(aid: str, admin: dict = Depends(require_admin)):
    await db.appointments.update_one(
        {"id": aid},
        {"$set": {"contract_file_id": None, "physical_contract_needed": True}},
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Blocked slots
# ---------------------------------------------------------------------------
@api_router.post("/blocked-slots")
async def block_slot(payload: BlockedSlotIn, admin: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_iso()
    try:
        await db.blocked_slots.insert_one(doc)
    except Exception:
        raise HTTPException(status_code=409, detail="Bu saat zaten kapalı")
    doc.pop("_id", None)
    return doc


@api_router.get("/blocked-slots")
async def list_blocked(admin: dict = Depends(require_admin), date_from: Optional[str] = None):
    q = {}
    if date_from:
        q["date"] = {"$gte": date_from}
    items = await db.blocked_slots.find(q, {"_id": 0}).sort([("date", 1), ("time", 1)]).to_list(500)
    return items


@api_router.delete("/blocked-slots/{bid}")
async def unblock(bid: str, admin: dict = Depends(require_admin)):
    await db.blocked_slots.delete_one({"id": bid})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Staff CRUD
# ---------------------------------------------------------------------------
@api_router.get("/staff")
async def list_staff(admin: dict = Depends(require_admin)):
    items = await db.staff.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    return items


@api_router.post("/staff")
async def add_staff(payload: StaffIn, admin: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_iso()
    if not doc.get("hired_at"):
        doc["hired_at"] = datetime.now(timezone.utc).date().isoformat()
    await db.staff.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/staff/{sid}")
async def update_staff(sid: str, payload: StaffIn, admin: dict = Depends(require_admin)):
    await db.staff.update_one({"id": sid}, {"$set": payload.model_dump()})
    doc = await db.staff.find_one({"id": sid}, {"_id": 0})
    return doc


@api_router.delete("/staff/{sid}")
async def delete_staff(sid: str, admin: dict = Depends(require_admin)):
    await db.staff.delete_one({"id": sid})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------
@api_router.get("/reports/summary")
async def reports_summary(admin: dict = Depends(require_admin)):
    today = datetime.now(timezone.utc).date().isoformat()
    pending = await db.appointments.count_documents({"status": "pending"})
    approved = await db.appointments.count_documents({"status": "approved"})
    cancelled = await db.appointments.count_documents({"status": "cancelled"})
    today_count = await db.appointments.count_documents({"date": today, "status": "approved"})

    # sum revenues (approved paid amounts)
    approved_docs = await db.appointments.find({"status": "approved"}, {"_id": 0, "paid_amount": 1, "deposit_amount": 1, "date": 1}).to_list(1000)
    total_revenue = sum(a.get("paid_amount", 0) or 0 for a in approved_docs)
    total_deposits = sum(a.get("deposit_amount", 0) or 0 for a in approved_docs)

    # last 7 days revenue timeseries
    series = {}
    for i in range(6, -1, -1):
        d = (datetime.now(timezone.utc).date() - timedelta(days=i)).isoformat()
        series[d] = 0
    for a in approved_docs:
        d = a.get("date")
        if d in series:
            series[d] += a.get("paid_amount", 0) or 0
    revenue_series = [{"date": k, "revenue": v} for k, v in series.items()]

    staff_count = await db.staff.count_documents({"active": True})

    return {
        "pending": pending,
        "approved": approved,
        "cancelled": cancelled,
        "today_approved": today_count,
        "total_revenue": total_revenue,
        "total_deposits": total_deposits,
        "revenue_series": revenue_series,
        "staff_count": staff_count,
    }


# ---------------------------------------------------------------------------
# Gallery (photos & videos, admin uploads, public read)
# ---------------------------------------------------------------------------
GALLERY_CATEGORIES = [
    {"slug": "nisan-evi", "name": "Nişan Evi"},
    {"slug": "fotograf-cekimi", "name": "Fotoğraf Çekimi"},
    {"slug": "studyo-cekimi", "name": "Stüdyo Çekimi"},
    {"slug": "podcast-alani", "name": "Podcast Alanı"},
    {"slug": "klip-cekimleri", "name": "Klip Çekimleri"},
    {"slug": "karaoke-alani", "name": "Karaoke Alanı"},
]


@api_router.get("/gallery/categories")
async def gallery_categories():
    return GALLERY_CATEGORIES


@api_router.get("/gallery")
async def list_gallery(category: Optional[str] = None):
    q: dict = {"is_deleted": {"$ne": True}}
    if category:
        q["category"] = category
    items = await db.gallery.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@api_router.post("/gallery/upload")
async def upload_gallery(
    category: str = Form(...),
    title: str = Form(""),
    description: str = Form(""),
    file: UploadFile = File(...),
    admin: dict = Depends(require_admin),
):
    valid_slugs = {c["slug"] for c in GALLERY_CATEGORIES}
    if category not in valid_slugs:
        raise HTTPException(status_code=400, detail="Geçersiz kategori")

    ext = (file.filename or "bin").split(".")[-1].lower()
    content_type = file.content_type or "application/octet-stream"
    media_type = "video" if content_type.startswith("video") else "image"
    file_id = new_id()
    path = f"{APP_NAME}/gallery/{category}/{file_id}.{ext}"
    data = await file.read()
    put_object(path, data, content_type)

    doc = {
        "id": file_id,
        "category": category,
        "title": title,
        "description": description,
        "media_type": media_type,
        "content_type": content_type,
        "storage_path": path,
        "size": len(data),
        "original_filename": file.filename,
        "is_deleted": False,
        "created_at": now_iso(),
    }
    await db.gallery.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/gallery/file/{item_id}")
async def download_gallery_file(item_id: str):
    doc = await db.gallery.find_one({"id": item_id, "is_deleted": {"$ne": True}})
    if not doc:
        raise HTTPException(status_code=404, detail="Medya bulunamadı")
    data, ct = get_object(doc["storage_path"])
    return StarletteResponse(
        content=data,
        media_type=doc.get("content_type", ct),
        headers={"Cache-Control": "public, max-age=86400"},
    )


@api_router.delete("/gallery/{item_id}")
async def delete_gallery(item_id: str, admin: dict = Depends(require_admin)):
    await db.gallery.update_one({"id": item_id}, {"$set": {"is_deleted": True}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Site Settings (branding, contact, hero)
# ---------------------------------------------------------------------------
@api_router.get("/settings")
async def get_settings():
    doc = await db.site_settings.find_one({"id": "singleton"}, {"_id": 0})
    return doc or {}


@api_router.put("/settings")
async def update_settings(payload: SiteSettingsIn, admin: dict = Depends(require_admin)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    updates["updated_at"] = now_iso()
    await db.site_settings.update_one({"id": "singleton"}, {"$set": updates}, upsert=True)
    return await db.site_settings.find_one({"id": "singleton"}, {"_id": 0})


@api_router.post("/settings/intro-logo")
async def upload_intro_logo(file: UploadFile = File(...), admin: dict = Depends(require_admin)):
    """Upload a dedicated logo used only for the cinematic intro splash.
    Does NOT change the main site logo (`logo_id`)."""
    ext = (file.filename or "png").split(".")[-1].lower()
    content_type = file.content_type or "image/png"
    logo_id = new_id()
    path = f"{APP_NAME}/branding/intro-logo-{logo_id}.{ext}"
    data = await file.read()
    put_object(path, data, content_type)

    await db.site_assets.insert_one({
        "id": logo_id,
        "storage_path": path,
        "content_type": content_type,
        "kind": "intro_logo",
        "created_at": now_iso(),
    })
    await db.site_settings.update_one(
        {"id": "singleton"},
        {"$set": {"intro_logo_id": logo_id, "updated_at": now_iso()}},
        upsert=True,
    )
    return {"intro_logo_id": logo_id}


@api_router.post("/settings/logo")
async def upload_logo(file: UploadFile = File(...), admin: dict = Depends(require_admin)):
    ext = (file.filename or "png").split(".")[-1].lower()
    content_type = file.content_type or "image/png"
    logo_id = new_id()
    path = f"{APP_NAME}/branding/logo-{logo_id}.{ext}"
    data = await file.read()
    put_object(path, data, content_type)

    await db.site_assets.insert_one({
        "id": logo_id,
        "storage_path": path,
        "content_type": content_type,
        "kind": "logo",
        "created_at": now_iso(),
    })
    await db.site_settings.update_one(
        {"id": "singleton"},
        {"$set": {"logo_id": logo_id, "updated_at": now_iso()}},
        upsert=True,
    )
    return {"logo_id": logo_id}


@api_router.get("/settings/logo/{logo_id}")
async def download_logo(logo_id: str):
    doc = await db.site_assets.find_one({"id": logo_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Logo bulunamadı")
    data, ct = get_object(doc["storage_path"])
    return StarletteResponse(
        content=data,
        media_type=doc.get("content_type", ct),
        headers={"Cache-Control": "public, max-age=3600"},
    )


# ---------------------------------------------------------------------------
# Instagram Slideshow (Manual — admin uploads photos + Instagram link per photo)
# ---------------------------------------------------------------------------
class InstagramPostIn(BaseModel):
    instagram_url: str
    caption: Optional[str] = ""
    account_label: Optional[str] = ""      # e.g. "@fotuberphotography"
    order: Optional[int] = 0
    active: Optional[bool] = True


@api_router.get("/instagram-posts")
async def list_instagram_posts(active_only: bool = True):
    q = {"active": True} if active_only else {}
    docs = await db.instagram_posts.find(q, {"_id": 0}).sort([("order", 1), ("created_at", -1)]).to_list(200)
    return docs


@api_router.get("/instagram-posts/all")
async def list_instagram_posts_all(admin: dict = Depends(require_admin)):
    docs = await db.instagram_posts.find({}, {"_id": 0}).sort([("order", 1), ("created_at", -1)]).to_list(500)
    return docs


@api_router.post("/instagram-posts")
async def create_instagram_post(
    file: UploadFile = File(...),
    instagram_url: str = Form(...),
    caption: str = Form(""),
    account_label: str = Form(""),
    order: int = Form(0),
    active: bool = Form(True),
    admin: dict = Depends(require_admin),
):
    # Store image in object storage
    ext = (file.filename or "jpg").split(".")[-1].lower()
    content_type = file.content_type or "image/jpeg"
    asset_id = new_id()
    path = f"{APP_NAME}/instagram/{asset_id}.{ext}"
    data = await file.read()
    put_object(path, data, content_type)

    await db.site_assets.insert_one({
        "id": asset_id,
        "storage_path": path,
        "content_type": content_type,
        "kind": "instagram",
        "created_at": now_iso(),
    })

    post_id = new_id()
    doc = {
        "id": post_id,
        "image_id": asset_id,
        "instagram_url": instagram_url,
        "caption": caption or "",
        "account_label": account_label or "",
        "order": int(order or 0),
        "active": bool(active),
        "created_at": now_iso(),
        "created_by": admin.get("id"),
    }
    await db.instagram_posts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.patch("/instagram-posts/{post_id}")
async def update_instagram_post(post_id: str, payload: InstagramPostIn, admin: dict = Depends(require_admin)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    updates["updated_at"] = now_iso()
    res = await db.instagram_posts.update_one({"id": post_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    doc = await db.instagram_posts.find_one({"id": post_id}, {"_id": 0})
    return doc


@api_router.delete("/instagram-posts/{post_id}")
async def delete_instagram_post(post_id: str, admin: dict = Depends(require_admin)):
    doc = await db.instagram_posts.find_one({"id": post_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    # Best-effort image cleanup
    if doc.get("image_id"):
        try:
            asset = await db.site_assets.find_one({"id": doc["image_id"]})
            if asset:
                try: delete_object(asset["storage_path"])
                except Exception: pass
                await db.site_assets.delete_one({"id": doc["image_id"]})
        except Exception:
            pass
    await db.instagram_posts.delete_one({"id": post_id})
    return {"ok": True}


@api_router.get("/instagram-posts/{post_id}/image")
async def get_instagram_image(post_id: str):
    post = await db.instagram_posts.find_one({"id": post_id})
    if not post or not post.get("image_id"):
        raise HTTPException(status_code=404, detail="Fotoğraf bulunamadı")
    asset = await db.site_assets.find_one({"id": post["image_id"]})
    if not asset:
        raise HTTPException(status_code=404, detail="Fotoğraf bulunamadı")
    data, ct = get_object(asset["storage_path"])
    return StarletteResponse(
        content=data,
        media_type=asset.get("content_type", ct),
        headers={"Cache-Control": "public, max-age=3600"},
    )


# ---------------------------------------------------------------------------
# Fotuber AI Assistant (Emergent Universal LLM Key + Open-Meteo weather)
# ---------------------------------------------------------------------------
DEFAULT_AI_SYSTEM_PROMPT = """Sen Fotuber Görsel Sanat stüdyosunun resmi yapay zeka asistanı Fotuber Asistan'sın.
Türkiye'nin Çankırı ilinde bulunan, düğün / nişan / kına / bride party / doğum günü / stüdyo çekimleri yapan bu profesyonel stüdyoyu temsil ediyorsun.

DEĞERLER VE HASSASİYETLER:
- Türk kültürüne, muhafazakar ve tesettürlü müşterilerin hassasiyetlerine SAYGILIYSIN. Kıyafet önerisi verirken tesettürlü seçenekleri her zaman önce sun; müşteri açıkça tesettürlü olmadığını belirtmedikçe kapalı ve edepli önerilerle başla.
- Aile mahremiyeti, saygı, geleneksel törenler (kına, düğün, nişan, nikah) konularında bilgili ve nezaketlisin.
- Cinsiyet, din, mezhep ayrımı yapmadan herkese eşit ve nazik davranırsın.

MUTLAK REKABET KURALI — ÇOK ÖNEMLİ:
- ASLA ve ASLA başka bir fotoğrafçı, stüdyo, nişan evi, düğün salonu, prodüksiyon firması, video editörü, DJ, gelinlik mağazası, makyaj sanatçısı, mekan, organizasyon firması ya da herhangi bir rakip / üçüncü firma önermezsin ya da adını anmazsın.
- "Hangi fotoğrafçıyı önerirsin?", "Başka nişan evi biliyor musun?", "Bu iş için başka bir firma var mı?" gibi sorulara nazikçe şöyle dersin: "Bu konuda size en iyi hizmeti Fotuber Görsel Sanat olarak biz sunuyoruz — düğün, nişan evi, stüdyo çekimleri ve tüm prodüksiyon süreçlerinde yanınızdayız. İsterseniz size özel bir randevu oluşturalım."
- Genel mekan tavsiyesi verirken (park, tarihi yer, doğa alanı gibi) yer adı verebilirsin ama YİNE de bir hizmet sağlayıcı (fotoğrafçı, organizatör vs.) ismi veremezsin.

KAPSAM DIŞI KONULAR — KESİN SINIR:
Sen SADECE aşağıdaki konularda konuşursun:
- Fotoğrafçılık, videografi, prodüksiyon
- Düğün, nişan, kına, bride party, doğum günü, stüdyo portre, klip, doğa/dış mekan çekimi
- Nişan evi konsept, dekorasyon, ışık, tema
- Gelin/damat, misafir hazırlığı (kıyafet, saç, makyaj ipuçları — kültürel hassasiyetle)
- Çekim mekanı önerileri (park, tarihi yer, doğa)
- Hava durumu, mevsim, gün batımı (çekim planlaması için)
- Fotuber'in hizmetleri ve randevu süreci

BU SKALANIN DIŞINDA HERHANGİ BİR KONUYA CEVAP VERMEZSİN. Örnekler (KONU DIŞI):
- Erotik / cinsel içerik, flört, aşk hayatı danışmanlığı
- Politika, din tartışması, felsefe
- Otomobil, teknoloji, telefon, bilgisayar tavsiyesi
- Yemek tarifi, restoran önerisi, seyahat rehberi
- Sağlık, hukuk, finans, yatırım tavsiyesi
- Genel dünya haberleri, spor, magazin
- Kişisel danışmanlık (aile, ilişki, kariyer sorunları)
- Ödev, program yazma, çeviri, matematik problemi

Kapsam dışı konu sorulduğunda ŞU ŞEKİLDE nazikçe geri döndür (kelime kelime aynı değil ama tondaki gibi):
"Çok teşekkür ederim ama ben Fotuber Görsel Sanat'ın çekim asistanıyım — sadece fotoğrafçılık, düğün ve etkinlik prodüksiyonu konularında yardımcı olabilirim. İsterseniz konumuza dönelim ve özel gününüzü planlamaya devam edelim. Hangi tür bir çekim düşünüyordunuz?"
Cevabına başka bir bilgi ekleme, konuya geri dön.

KİŞİLİK:
- Çok kibar, sıcak, samimi ama profesyonel. "Efendim", "canım", "sevgili misafirim" gibi hitaplar kullanabilirsin — ama abartma, doğal ol.
- Türkçe konuşuyorsun. Her cevabın Türkçe olacak.
- Kısa ve öz cevaplar ver — 2-4 kısa paragraf yeter. Uzun listeler ve kalın maddeler yerine akıcı sohbet tonu tercih et.
- Öğrenmeye açıksın; müşteri düzeltirse "Anladım, teşekkür ederim" der uyum sağlarsın.

GÖREVLERİN:
1. Müşteriye ne tür bir çekim istediğini sor (düğün, nişan, kına, bride party, doğum günü, stüdyo portre, klip, doğa/dış mekan).
2. Tarihi öğren. Ay/mevsim belliyse hava, yağış, gün batımı bilgileri hakkında bilgilendir.
3. Mekan tercihini sor: stüdyo, plato (kapalı set), dış mekan (park, tarihi yer, doğa). Her birinin artı-eksisini kısaca anlat.
4. Golden hour (altın saat) önerisi ver: gün batımından ~1 saat önce başlayan sihirli ışık. Fotoğrafın en güzel çıktığı zaman dilimi.
5. Kıyafet tavsiyesi: mevsime, mekana, konsepte, ve müşterinin dini/kültürel hassasiyetine uygun öneriler. Tesettürlü müşteri için: yumuşak dökümlü şalvar, elbise, tunik + eşarp uyumu; düz renkler, sade desenler.
6. "Düğün öncesi mi, düğün günü mü çekim yapılsın?" sorusuna profesyonel görüşünü paylaş:
   - **Düğün öncesi (pre-wedding)**: Rahat, sakin, çift kendini iyi hissediyor. Fotoğraf kalitesi daha yüksek çıkar. Genellikle düğünden 1-4 hafta önce önerilir.
   - **Düğün günü**: Doğal duygular, gerçek anlar. Ama stres var, süre kısıtlı.
   - Karma: Düğün öncesi profesyonel çekim + düğün günü doğal reportaj tarzı çekim.
7. Sohbetin sonunda uygun bir yerde randevu almasını nazikçe öner: "Dilerseniz stüdyomuzdan randevu alarak yüz yüze detayları konuşabiliriz."

ŞEHİR VE HAVA:
- Kullanıcı şehir belirtmediyse mutlaka SOR: "Hangi şehirde çekim yaptırmayı düşünüyorsunuz?"
- Şehir + tarih verildiğinde sistem sana [WEATHER_TOOL] etiketiyle o şehrin o tarih için hava bilgilerini önden verir; onları kullan.

YASAKLAR (TEKRAR):
- Randevu tarih/saati sen belirleme; müşteriye web sitesindeki takvimden seçmesini söyle.
- Fiyat verme; "Fiyatlar hizmet paketine göre değişiyor, randevu talebinizden sonra size özel teklif sunuyoruz" de.
- Yanıtın 6 cümleyi geçmesin (özet, akıcı ve nazik konuş).
- Başka firma / rakip önerme (Yukarıdaki "MUTLAK REKABET KURALI" maddesi kesin).
- Kapsam dışı soruya bilgi verme (Yukarıdaki "KAPSAM DIŞI KONULAR" maddesi kesin).
"""


GOLDEN_HOUR_DIRECTIVE = """

ALTIN SAAT ARACI — ÇAPRAZ YÖNLENDİRME:
- Işık, gün batımı, altın saat, mavi saat, dış mekan çekim saati, ışığa göre kıyafet rengi ya da manzara/mekan konuları geçtiğinde, Fotuber'in ÜCRETSİZ "Altın Saat & Gün Batımı" aracını öner ve TAM bu bağlantıyı ver: /altin-saat
- Örnek ifade: "Seçtiğiniz şehir ve tarihe göre altın saati anında görmek için Altın Saat aracımıza göz atabilirsiniz: /altin-saat"
- Bağlantıyı olduğu gibi (/altin-saat) yaz; başka/uydurma URL verme.
"""


class AiChatIn(BaseModel):
    session_id: str
    message: str
    city: Optional[str] = None
    event_date: Optional[str] = None  # YYYY-MM-DD


async def _fetch_weather(city: str, event_date: Optional[str] = None) -> Optional[dict]:
    """Fetch weather + sunset info from Open-Meteo (no key required)."""
    import httpx
    async with httpx.AsyncClient(timeout=8.0) as client:
        try:
            geo = await client.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": city, "language": "tr", "count": 1, "country": "TR"},
            )
            g = geo.json()
            if not g.get("results"):
                return None
            r0 = g["results"][0]
            lat, lon, name = r0["latitude"], r0["longitude"], r0.get("name", city)
            params = {
                "latitude": lat,
                "longitude": lon,
                "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset,uv_index_max,weather_code",
                "timezone": "Europe/Istanbul",
                "forecast_days": 14,
            }
            if event_date:
                params["start_date"] = event_date
                params["end_date"]   = event_date
                params.pop("forecast_days")
            fx = await client.get("https://api.open-meteo.com/v1/forecast", params=params)
            d = fx.json().get("daily", {})
            if not d.get("time"):
                return {"city": name, "note": "Tahmin aralığı dışında"}
            i = 0
            return {
                "city": name,
                "date": d["time"][i],
                "temp_max": d.get("temperature_2m_max", [None])[i],
                "temp_min": d.get("temperature_2m_min", [None])[i],
                "precip_mm": d.get("precipitation_sum", [None])[i],
                "sunrise": (d.get("sunrise", [""])[i] or "").split("T")[-1][:5],
                "sunset":  (d.get("sunset",  [""])[i] or "").split("T")[-1][:5],
                "uv_index": d.get("uv_index_max", [None])[i],
                "weather_code": d.get("weather_code", [None])[i],
            }
        except Exception as ex:
            logger.warning(f"weather fetch failed: {ex}")
            return None


def _format_weather_context(w: dict) -> str:
    if not w:
        return ""
    if w.get("note"):
        return f"[WEATHER_TOOL] {w['city']} için tahmin aralığı dışında."
    parts = [
        f"{w.get('city')} · {w.get('date')}",
        f"gündüz {w.get('temp_max')}°C / gece {w.get('temp_min')}°C",
        f"yağış tahmini {w.get('precip_mm')} mm",
        f"gün doğumu {w.get('sunrise')}",
        f"gün batımı {w.get('sunset')}",
        f"UV indeksi {w.get('uv_index')}",
    ]
    return "[WEATHER_TOOL] " + " · ".join([p for p in parts if p and "None" not in p])


@api_router.get("/ai/weather")
async def get_weather(city: str, date: Optional[str] = None):
    w = await _fetch_weather(city, date)
    if w is None:
        raise HTTPException(status_code=404, detail="Şehir bulunamadı ya da hava servisi geçici olarak yanıt vermiyor")
    return w


@api_router.post("/ai/chat")
async def ai_chat(payload: AiChatIn):
    """Multi-turn chat with the Fotuber Asistan. Session history is stored in MongoDB
    and reinjected on each turn using LlmChat."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    settings = await db.site_settings.find_one({"id": "singleton"}, {"_id": 0}) or {}
    if settings.get("ai_enabled") is False:
        raise HTTPException(status_code=503, detail="Asistan geçici olarak kapalı")

    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="AI anahtarı yapılandırılmamış")

    provider = settings.get("ai_provider") or "anthropic"
    model = settings.get("ai_model") or "claude-sonnet-4-6"
    base_prompt = (settings.get("ai_system_prompt") or DEFAULT_AI_SYSTEM_PROMPT) + GOLDEN_HOUR_DIRECTIVE

    # Optional weather context injection
    weather_ctx = ""
    city = payload.city or settings.get("ai_default_city")
    if city and payload.event_date:
        w = await _fetch_weather(city, payload.event_date)
        weather_ctx = "\n\n" + _format_weather_context(w) if w else ""

    chat = LlmChat(
        api_key=key,
        session_id=payload.session_id,
        system_message=base_prompt + weather_ctx,
    ).with_model(provider, model)

    # Rehydrate previous turns from Mongo into this LlmChat instance
    history = await db.ai_messages.find(
        {"session_id": payload.session_id},
        {"_id": 0, "role": 1, "content": 1},
    ).sort([("created_at", 1)]).to_list(200)
    # Ask the library to accept a list of prior messages if supported; otherwise
    # replay them by sending them silently. Simpler: prime by sending prior user messages
    # is not ideal — the library manages memory automatically on subsequent .send/.stream
    # so we only rely on our own DB for admin review. For continuity across pod restarts,
    # we prepend a compact digest of the last 6 exchanges into the system message.
    if history:
        recent = history[-12:]
        digest = "\n\nÖnceki konuşma özeti:\n" + "\n".join(
            f"- {m['role']}: {m['content'][:300]}" for m in recent
        )
        chat = LlmChat(
            api_key=key,
            session_id=payload.session_id,
            system_message=base_prompt + weather_ctx + digest,
        ).with_model(provider, model)

    now = now_iso()
    # Store user message
    await db.ai_messages.insert_one({
        "id": new_id(),
        "session_id": payload.session_id,
        "role": "user",
        "content": payload.message,
        "city": city,
        "event_date": payload.event_date,
        "created_at": now,
    })

    try:
        response = await chat.send_message(UserMessage(text=payload.message))
        reply = response if isinstance(response, str) else str(response)
    except Exception as ex:
        logger.exception("AI error")
        raise HTTPException(status_code=502, detail=f"Yapay zeka geçici olarak yanıt veremedi: {str(ex)[:120]}")

    await db.ai_messages.insert_one({
        "id": new_id(),
        "session_id": payload.session_id,
        "role": "assistant",
        "content": reply,
        "model": f"{provider}/{model}",
        "created_at": now_iso(),
    })
    # Also touch session doc for admin listing
    await db.ai_sessions.update_one(
        {"session_id": payload.session_id},
        {"$set": {
            "session_id": payload.session_id,
            "last_message_at": now_iso(),
            "last_city": city,
        }, "$inc": {"turn_count": 1}, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    return {"reply": reply, "weather_used": bool(weather_ctx)}


@api_router.get("/ai/sessions")
async def list_ai_sessions(admin: dict = Depends(require_admin), limit: int = 50):
    docs = await db.ai_sessions.find({}, {"_id": 0}).sort([("last_message_at", -1)]).limit(limit).to_list(limit)
    return docs


@api_router.get("/ai/sessions/{session_id}/messages")
async def get_ai_session_messages(session_id: str, admin: dict = Depends(require_admin)):
    docs = await db.ai_messages.find({"session_id": session_id}, {"_id": 0}).sort([("created_at", 1)]).to_list(500)
    return docs


# ---------------------------------------------------------------------------
# Cash Flow / Transactions (owner-admin only)
# ---------------------------------------------------------------------------
@api_router.post("/transactions")
async def create_transaction(payload: TransactionIn, user: dict = Depends(require_staff_or_admin)):
    doc = payload.model_dump()
    if user.get("role") == "staff":
        # Personel: sadece bugüne, sadece nakit girişi yapabilir
        doc["payment_method"] = "cash"
        doc["date"] = datetime.now(timezone.utc).date().isoformat()
    doc["id"] = new_id()
    doc["created_at"] = now_iso()
    doc["created_by"] = user.get("id")
    doc["created_by_name"] = user.get("name")
    doc["created_by_role"] = user.get("role")
    await db.transactions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/transactions")
async def list_transactions(
    user: dict = Depends(require_staff_or_admin),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    kind: Optional[str] = None,
    method: Optional[str] = None,
    limit: int = 500,
):
    q: dict = {}
    if user.get("role") == "staff":
        # Personel sadece bugünün nakit hareketlerini görür
        today = datetime.now(timezone.utc).date().isoformat()
        q["date"] = today
        q["payment_method"] = "cash"
    else:
        if kind:
            q["kind"] = kind
        if method:
            q["payment_method"] = method
        if date_from or date_to:
            rng = {}
            if date_from:
                rng["$gte"] = date_from
            if date_to:
                rng["$lte"] = date_to
            q["date"] = rng
    items = await db.transactions.find(q, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(limit)
    return items


@api_router.put("/transactions/{tid}")
async def update_transaction(tid: str, payload: TransactionIn, admin: dict = Depends(require_admin)):
    res = await db.transactions.update_one({"id": tid}, {"$set": payload.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    return await db.transactions.find_one({"id": tid}, {"_id": 0})


@api_router.delete("/transactions/{tid}")
async def delete_transaction(tid: str, admin: dict = Depends(require_admin)):
    await db.transactions.delete_one({"id": tid})
    return {"ok": True}


def _period_bounds(period: str) -> tuple[str, str, str]:
    """Return (date_from, date_to, label) for period keyword."""
    today = datetime.now(timezone.utc).date()
    if period == "week":
        start = today - timedelta(days=today.weekday())
        return start.isoformat(), today.isoformat(), f"{start.strftime('%d.%m.%Y')} – {today.strftime('%d.%m.%Y')}"
    if period == "month":
        start = today.replace(day=1)
        return start.isoformat(), today.isoformat(), start.strftime("%B %Y")
    if period == "year":
        start = today.replace(month=1, day=1)
        return start.isoformat(), today.isoformat(), str(today.year)
    if period == "all":
        return "1900-01-01", today.isoformat(), "Tümü"
    # default = today
    return today.isoformat(), today.isoformat(), today.strftime("%d.%m.%Y")


@api_router.get("/transactions/export.xlsx")
async def export_transactions_xlsx(
    admin: dict = Depends(require_admin),
    period: str = Query("month", description="today|week|month|year|all"),
):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from io import BytesIO
    from urllib.parse import quote

    date_from, date_to, label = _period_bounds(period)
    items = await db.transactions.find(
        {"date": {"$gte": date_from, "$lte": date_to}}, {"_id": 0}
    ).sort([("date", 1), ("created_at", 1)]).to_list(5000)

    wb = Workbook()
    ws = wb.active
    ws.title = "Nakit Akışı"

    # Header row with brand
    ws["A1"] = "Fotuber Studio — Nakit Akışı Raporu"
    ws["A1"].font = Font(bold=True, size=14)
    ws.merge_cells("A1:G1")
    ws["A2"] = f"Dönem: {label}"
    ws["A2"].font = Font(italic=True, color="666666")
    ws.merge_cells("A2:G2")

    headers = ["Tarih", "Tür", "Ödeme Yöntemi", "Kategori", "Kaynak", "Açıklama", "Tutar (₺)", "İşaretli Tutar"]
    for i, h in enumerate(headers, 1):
        c = ws.cell(row=4, column=i, value=h)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
        c.alignment = Alignment(horizontal="center")

    method_map = {"cash": "Nakit", "card": "Kart", "transfer": "Havale"}
    kind_map = {"income": "Gelir", "expense": "Gider"}
    source_map = {"appointment": "Randevu"}
    row = 5
    total_in, total_out = 0.0, 0.0
    for t in items:
        amount = float(t.get("amount", 0) or 0)
        signed = amount if t["kind"] == "income" else -amount
        if t["kind"] == "income": total_in += amount
        else: total_out += amount
        ws.cell(row=row, column=1, value=t.get("date"))
        ws.cell(row=row, column=2, value=kind_map.get(t.get("kind"), t.get("kind")))
        ws.cell(row=row, column=3, value=method_map.get(t.get("payment_method"), t.get("payment_method")))
        ws.cell(row=row, column=4, value=t.get("category", ""))
        ws.cell(row=row, column=5, value=source_map.get(t.get("source"), "Manuel"))
        ws.cell(row=row, column=6, value=t.get("description", ""))
        ws.cell(row=row, column=7, value=amount)
        ws.cell(row=row, column=8, value=signed)
        row += 1

    # Totals
    row += 1
    ws.cell(row=row, column=6, value="Toplam Gelir").font = Font(bold=True)
    ws.cell(row=row, column=7, value=total_in).font = Font(bold=True, color="059669")
    row += 1
    ws.cell(row=row, column=6, value="Toplam Gider").font = Font(bold=True)
    ws.cell(row=row, column=7, value=total_out).font = Font(bold=True, color="DC2626")
    row += 1
    ws.cell(row=row, column=6, value="NET").font = Font(bold=True, size=12)
    ws.cell(row=row, column=7, value=total_in - total_out).font = Font(bold=True, size=12)

    # Column widths
    widths = [12, 10, 14, 22, 12, 40, 14, 14]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[chr(64 + i)].width = w

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = quote(f"fotuber-nakit-akisi-{period}-{date_to}.xlsx")
    return StarletteResponse(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )


@api_router.get("/transactions/export.pdf")
async def export_transactions_pdf(
    admin: dict = Depends(require_admin),
    period: str = Query("month"),
):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from io import BytesIO
    from urllib.parse import quote

    # Register Turkish + ₺ capable font once (DejaVu Sans supports Turkish characters and TL symbol)
    FONT_REG = "FotuberSans"
    FONT_BOLD = "FotuberSans-Bold"
    if FONT_REG not in pdfmetrics.getRegisteredFontNames():
        try:
            pdfmetrics.registerFont(TTFont(FONT_REG, "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
            pdfmetrics.registerFont(TTFont(FONT_BOLD, "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
        except Exception:
            try:
                pdfmetrics.registerFont(TTFont(FONT_REG, "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"))
                pdfmetrics.registerFont(TTFont(FONT_BOLD, "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"))
            except Exception:
                FONT_REG, FONT_BOLD = "Helvetica", "Helvetica-Bold"

    date_from, date_to, label = _period_bounds(period)
    items = await db.transactions.find(
        {"date": {"$gte": date_from, "$lte": date_to}}, {"_id": 0}
    ).sort([("date", 1), ("created_at", 1)]).to_list(5000)
    settings = await db.site_settings.find_one({"id": "singleton"}, {"_id": 0}) or {}
    brand = settings.get("business_name", "Fotuber")

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=15*mm, rightMargin=15*mm, topMargin=15*mm, bottomMargin=15*mm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("t", parent=styles["Title"], fontName=FONT_BOLD, fontSize=18, textColor=colors.HexColor("#0F172A"))
    sub_style = ParagraphStyle("s", parent=styles["Normal"], fontName=FONT_REG, fontSize=10, textColor=colors.HexColor("#666666"))
    body_style = ParagraphStyle("b", parent=styles["Normal"], fontName=FONT_REG, fontSize=10)
    h3_style = ParagraphStyle("h3", parent=styles["Heading3"], fontName=FONT_BOLD, fontSize=12)

    story = [
        Paragraph(f"{brand} — Nakit Akışı Raporu", title_style),
        Paragraph(f"Dönem: <b>{label}</b> · Kayıt: {len(items)}", sub_style),
        Spacer(1, 6*mm),
    ]

    method_map = {"cash": "Nakit", "card": "Kart", "transfer": "Havale"}
    kind_map = {"income": "Gelir", "expense": "Gider"}

    data = [["Tarih", "Tür", "Yöntem", "Kategori", "Kaynak", "Açıklama", "Tutar (₺)"]]
    total_in, total_out = 0.0, 0.0
    for t in items:
        amt = float(t.get("amount", 0) or 0)
        if t["kind"] == "income": total_in += amt
        else: total_out += amt
        data.append([
            t.get("date", ""),
            kind_map.get(t.get("kind"), ""),
            method_map.get(t.get("payment_method"), ""),
            (t.get("category") or "")[:24],
            "Randevu" if t.get("source") == "appointment" else "Manuel",
            (t.get("description") or "")[:40],
            f"{'+' if t['kind']=='income' else '−'}{amt:,.2f}".replace(",", "."),
        ])

    tbl = Table(data, colWidths=[20*mm, 18*mm, 20*mm, 38*mm, 18*mm, 78*mm, 28*mm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
        ("FONTNAME", (0, 1), (-1, -1), FONT_REG),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (6, 1), (6, -1), "RIGHT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#F8FAFC"), colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(tbl)

    story += [
        Spacer(1, 6*mm),
        Paragraph(f"<b>Toplam Gelir:</b> ₺{total_in:,.2f}".replace(",", "."), body_style),
        Paragraph(f"<b>Toplam Gider:</b> ₺{total_out:,.2f}".replace(",", "."), body_style),
        Paragraph(f"<b>NET:</b> ₺{(total_in - total_out):,.2f}".replace(",", "."), h3_style),
    ]

    doc.build(story)
    buf.seek(0)
    filename = quote(f"fotuber-nakit-akisi-{period}-{date_to}.pdf")
    return StarletteResponse(
        content=buf.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )


# ---------------------------------------------------------------------------
# Cash Register (Kasa Devir Defteri) — daily opening/closing balance
# Staff can enter today; Admin sees all history.
# ---------------------------------------------------------------------------
class CashCloseIn(BaseModel):
    date: str  # YYYY-MM-DD
    opening_balance: float = 0
    closing_balance: float = 0
    notes: Optional[str] = ""


@api_router.get("/cash-register")
async def get_cash_register_day(
    date: str,
    user: dict = Depends(require_staff_or_admin),
):
    """Return today's saved close + suggested opening (previous day closing) + today's cash flow."""
    saved = await db.cash_registers.find_one({"date": date}, {"_id": 0})
    prev_list = await db.cash_registers.find(
        {"date": {"$lt": date}}, {"_id": 0}
    ).sort("date", -1).limit(1).to_list(1)
    suggested_opening = float(prev_list[0].get("closing_balance", 0)) if prev_list else 0.0
    prev_date = prev_list[0].get("date") if prev_list else None

    tx = await db.transactions.find(
        {"date": date}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    cash_in = sum(float(t.get("amount", 0) or 0) for t in tx if t.get("kind") == "income" and t.get("payment_method") == "cash")
    cash_out = sum(float(t.get("amount", 0) or 0) for t in tx if t.get("kind") == "expense" and t.get("payment_method") == "cash")
    card_in = sum(float(t.get("amount", 0) or 0) for t in tx if t.get("kind") == "income" and t.get("payment_method") == "card")
    card_out = sum(float(t.get("amount", 0) or 0) for t in tx if t.get("kind") == "expense" and t.get("payment_method") == "card")
    transfer_in = sum(float(t.get("amount", 0) or 0) for t in tx if t.get("kind") == "income" and t.get("payment_method") == "transfer")
    transfer_out = sum(float(t.get("amount", 0) or 0) for t in tx if t.get("kind") == "expense" and t.get("payment_method") == "transfer")
    opening = float(saved.get("opening_balance", 0)) if saved else suggested_opening
    expected_closing = opening + cash_in - cash_out

    return {
        "date": date,
        "saved": saved,
        "suggested_opening": suggested_opening,
        "previous_date": prev_date,
        "cash_in": cash_in,
        "cash_out": cash_out,
        "card_in": card_in,
        "card_out": card_out,
        "transfer_in": transfer_in,
        "transfer_out": transfer_out,
        "total_in": cash_in + card_in + transfer_in,
        "total_out": cash_out + card_out + transfer_out,
        "expected_closing": expected_closing,
        "transactions": tx,
    }


@api_router.post("/cash-register/close")
async def save_cash_register_close(
    payload: CashCloseIn,
    user: dict = Depends(require_staff_or_admin),
):
    now = now_iso()
    update_doc = {
        "date": payload.date,
        "opening_balance": float(payload.opening_balance or 0),
        "closing_balance": float(payload.closing_balance or 0),
        "notes": payload.notes or "",
        "updated_at": now,
        "updated_by": user.get("id"),
        "updated_by_name": user.get("name"),
        "updated_by_role": user.get("role"),
    }
    await db.cash_registers.update_one(
        {"date": payload.date},
        {
            "$set": update_doc,
            "$setOnInsert": {"id": new_id(), "created_at": now, "created_by": user.get("id")},
        },
        upsert=True,
    )
    return await db.cash_registers.find_one({"date": payload.date}, {"_id": 0})


@api_router.get("/cash-register/history")
async def cash_register_history(
    admin: dict = Depends(require_admin),
    limit: int = 90,
):
    items = await db.cash_registers.find({}, {"_id": 0}).sort("date", -1).to_list(limit)
    return items


@api_router.get("/cash-register/discrepancy")
async def cash_register_discrepancy(
    admin: dict = Depends(require_admin),
    year: int = 0,
    month: int = 0,
):
    """Monthly report: days where actual closing ≠ expected closing (opening + cash_in − cash_out)."""
    from calendar import monthrange
    today = datetime.now(timezone.utc).date()
    y = year or today.year
    m = month or today.month
    _, last_day = monthrange(y, m)
    date_from = f"{y:04d}-{m:02d}-01"
    date_to = f"{y:04d}-{m:02d}-{last_day:02d}"

    closes = await db.cash_registers.find(
        {"date": {"$gte": date_from, "$lte": date_to}}, {"_id": 0}
    ).sort("date", 1).to_list(500)

    tx = await db.transactions.find(
        {"date": {"$gte": date_from, "$lte": date_to}, "payment_method": "cash"}, {"_id": 0}
    ).to_list(5000)

    by_day = {}
    for t in tx:
        d = t.get("date")
        by_day.setdefault(d, {"cash_in": 0.0, "cash_out": 0.0})
        amt = float(t.get("amount", 0) or 0)
        if t.get("kind") == "income":
            by_day[d]["cash_in"] += amt
        elif t.get("kind") == "expense":
            by_day[d]["cash_out"] += amt

    rows = []
    total_over = 0.0
    total_short = 0.0
    for c in closes:
        d = c.get("date")
        opening = float(c.get("opening_balance", 0) or 0)
        actual = float(c.get("closing_balance", 0) or 0)
        cash_in = by_day.get(d, {}).get("cash_in", 0.0)
        cash_out = by_day.get(d, {}).get("cash_out", 0.0)
        expected = opening + cash_in - cash_out
        diff = actual - expected
        if diff > 0:
            total_over += diff
        elif diff < 0:
            total_short += diff
        rows.append({
            "date": d,
            "opening": opening,
            "cash_in": cash_in,
            "cash_out": cash_out,
            "expected_closing": expected,
            "actual_closing": actual,
            "diff": diff,
            "notes": c.get("notes", ""),
            "updated_by_name": c.get("updated_by_name", ""),
            "updated_by_role": c.get("updated_by_role", ""),
        })

    days_missing = [d for d in rows if abs(d["diff"]) > 0.01]
    return {
        "year": y,
        "month": m,
        "days": rows,
        "days_with_diff": days_missing,
        "total_over": round(total_over, 2),
        "total_short": round(total_short, 2),
        "net_diff": round(total_over + total_short, 2),
    }


# ---------------------------------------------------------------------------
# Staff User Management (admin only)
# ---------------------------------------------------------------------------
class StaffUserIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=2, max_length=80)
    password: Optional[str] = None
    role: Literal["staff", "admin"] = "staff"
    phone: Optional[str] = ""
    can_trend_radar: bool = False


@api_router.get("/users/staff")
async def list_staff_users(admin: dict = Depends(require_admin)):
    items = await db.users.find(
        {"role": {"$in": ["staff", "admin"]}},
        {"_id": 0, "password_hash": 0},
    ).sort("created_at", 1).to_list(200)
    return items


@api_router.post("/users/staff")
async def create_staff_user(payload: StaffUserIn, admin: dict = Depends(require_admin)):
    email = payload.email.lower()
    if not payload.password or len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Şifre en az 6 karakter olmalı")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Bu e-posta ile kayıtlı bir kullanıcı var")
    doc = {
        "id": new_id(),
        "email": email,
        "name": payload.name,
        "phone": payload.phone or "",
        "role": payload.role,
        "can_trend_radar": bool(payload.can_trend_radar),
        "password_hash": hash_password(payload.password),
        "created_at": now_iso(),
        "created_by": admin.get("id"),
    }
    await db.users.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


@api_router.patch("/users/staff/{uid}")
async def update_staff_user(uid: str, payload: StaffUserIn, admin: dict = Depends(require_admin)):
    existing = await db.users.find_one({"id": uid})
    if not existing:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    if existing.get("role") not in ("staff", "admin"):
        raise HTTPException(status_code=400, detail="Bu hesap personel değil")
    updates = {
        "name": payload.name,
        "phone": payload.phone or "",
        "role": payload.role,
        "can_trend_radar": bool(payload.can_trend_radar),
    }
    if payload.password and len(payload.password) >= 6:
        updates["password_hash"] = hash_password(payload.password)
    await db.users.update_one({"id": uid}, {"$set": updates})
    doc = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    return doc


@api_router.delete("/users/staff/{uid}")
async def delete_staff_user(uid: str, admin: dict = Depends(require_admin)):
    if uid == admin.get("id"):
        raise HTTPException(status_code=400, detail="Kendi hesabınızı silemezsiniz")
    existing = await db.users.find_one({"id": uid})
    if not existing:
        return {"ok": True}
    if existing.get("role") not in ("staff", "admin"):
        raise HTTPException(status_code=400, detail="Bu hesap personel değil")
    await db.users.delete_one({"id": uid})
    return {"ok": True}




@api_router.get("/transactions/summary")
async def transaction_summary(admin: dict = Depends(require_admin)):
    """Return daily (last 7 days), weekly (last 4 weeks), monthly (last 6 months) aggregates,
    plus payment-method breakdown for today/week/month."""
    today = datetime.now(timezone.utc).date()

    def date_range(days_back: int) -> list[str]:
        return [(today - timedelta(days=i)).isoformat() for i in range(days_back - 1, -1, -1)]

    all_docs = await db.transactions.find({}, {"_id": 0}).to_list(5000)

    def money(rows, kind):
        return sum(float(r.get("amount", 0) or 0) for r in rows if r.get("kind") == kind)

    def by_method(rows):
        out = {"cash": 0.0, "card": 0.0, "transfer": 0.0}
        for r in rows:
            m = r.get("payment_method")
            if m in out:
                sign = 1 if r.get("kind") == "income" else -1
                out[m] += sign * float(r.get("amount", 0) or 0)
        return out

    # daily series (last 7 days)
    day_list = date_range(7)
    daily_series = []
    for d in day_list:
        rows = [r for r in all_docs if r.get("date") == d]
        daily_series.append({
            "date": d,
            "income": money(rows, "income"),
            "expense": money(rows, "expense"),
            "net": money(rows, "income") - money(rows, "expense"),
        })

    # weekly series (last 4 weeks) — group by ISO week
    def week_key(d_str):
        y, m, dd = map(int, d_str.split("-"))
        return datetime(y, m, dd).isocalendar()[:2]  # (year, week)

    week_series = []
    current_week = today.isocalendar()[:2]
    weeks = []
    for i in range(3, -1, -1):
        anchor = today - timedelta(weeks=i)
        weeks.append(anchor.isocalendar()[:2])
    for wk in weeks:
        rows = [r for r in all_docs if r.get("date") and week_key(r["date"]) == wk]
        week_series.append({
            "label": f"H{wk[1]}",
            "income": money(rows, "income"),
            "expense": money(rows, "expense"),
            "net": money(rows, "income") - money(rows, "expense"),
        })

    # monthly series (last 6 months)
    month_series = []
    for i in range(5, -1, -1):
        anchor = (today.replace(day=1) - timedelta(days=1 * 30 * i))
        ym = f"{anchor.year}-{anchor.month:02d}"
        rows = [r for r in all_docs if r.get("date", "")[:7] == ym]
        month_series.append({
            "label": ym,
            "income": money(rows, "income"),
            "expense": money(rows, "expense"),
            "net": money(rows, "income") - money(rows, "expense"),
        })

    today_rows = [r for r in all_docs if r.get("date") == today.isoformat()]
    week_start = (today - timedelta(days=today.weekday())).isoformat()
    week_rows = [r for r in all_docs if r.get("date", "") >= week_start]
    month_start = today.replace(day=1).isoformat()
    month_rows = [r for r in all_docs if r.get("date", "") >= month_start]

    return {
        "today": {
            "income": money(today_rows, "income"),
            "expense": money(today_rows, "expense"),
            "net": money(today_rows, "income") - money(today_rows, "expense"),
            "by_method": by_method(today_rows),
        },
        "week": {
            "income": money(week_rows, "income"),
            "expense": money(week_rows, "expense"),
            "net": money(week_rows, "income") - money(week_rows, "expense"),
            "by_method": by_method(week_rows),
        },
        "month": {
            "income": money(month_rows, "income"),
            "expense": money(month_rows, "expense"),
            "net": money(month_rows, "income") - money(month_rows, "expense"),
            "by_method": by_method(month_rows),
        },
        "daily_series": daily_series,
        "week_series": week_series,
        "month_series": month_series,
    }


# ---------------------------------------------------------------------------
# Notifications (in-panel bell) + External notify (Twilio-ready)
# ---------------------------------------------------------------------------
TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_SMS_FROM = os.environ.get("TWILIO_SMS_FROM", "")
TWILIO_WA_FROM = os.environ.get("TWILIO_WHATSAPP_FROM", "")  # e.g. whatsapp:+14155238886


async def _get_notification_recipients() -> list[str]:
    """Combine settings.notification_recipients + active staff phones."""
    numbers = set()
    doc = await db.site_settings.find_one({"id": "singleton"}, {"_id": 0}) or {}
    for raw in (doc.get("notification_recipients") or "").split(","):
        n = raw.strip()
        if n:
            numbers.add(n)
    async for st in db.staff.find({"active": True, "phone": {"$ne": ""}}, {"_id": 0, "phone": 1}):
        p = (st.get("phone") or "").strip()
        if p:
            numbers.add(p)
    return list(numbers)


def _e164(number: str) -> str:
    """Best-effort TR normalization to +90XXXXXXXXXX."""
    digits = "".join(ch for ch in number if ch.isdigit())
    if not digits:
        return ""
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("90"):
        return "+" + digits
    if digits.startswith("0") and len(digits) == 11:
        return "+90" + digits[1:]
    if len(digits) == 10:
        return "+90" + digits
    return "+" + digits


async def _try_send_external_notification(title: str, body: str, to_numbers: Optional[list[str]] = None) -> dict:
    """Send SMS + WhatsApp via Twilio if configured. Returns diagnostics.
    to_numbers: list of specific phone numbers to send to. If None, uses admin/staff recipients."""
    result = {"sent": [], "skipped": [], "errors": []}
    if not (TWILIO_SID and TWILIO_TOKEN):
        result["skipped"].append("Twilio anahtarları .env'de tanımsız")
        return result
    recipients = to_numbers if to_numbers is not None else await _get_notification_recipients()
    if not recipients:
        result["skipped"].append("Alıcı numara yok")
        return result
    try:
        from twilio.rest import Client
        client = Client(TWILIO_SID, TWILIO_TOKEN)
        msg = f"{title}\n{body}" if title else body
        for raw in recipients:
            to = _e164(raw)
            if not to:
                result["errors"].append(f"Geçersiz numara: {raw}")
                continue
            if TWILIO_SMS_FROM:
                try:
                    client.messages.create(from_=TWILIO_SMS_FROM, to=to, body=msg)
                    result["sent"].append({"channel": "sms", "to": to})
                except Exception as e:
                    result["errors"].append(f"SMS→{to}: {e}")
                    logging.getLogger("fotuber").warning(f"Twilio SMS failed to {to}: {e}")
            if TWILIO_WA_FROM:
                try:
                    client.messages.create(from_=TWILIO_WA_FROM, to=f"whatsapp:{to}", body=msg)
                    result["sent"].append({"channel": "whatsapp", "to": to})
                except Exception as e:
                    result["errors"].append(f"WhatsApp→{to}: {e}")
                    logging.getLogger("fotuber").warning(f"Twilio WhatsApp failed to {to}: {e}")
    except Exception as e:
        result["errors"].append(str(e))
        logging.getLogger("fotuber").error(f"External notification error: {e}")
    return result


def _render_template(tpl: str, ctx: dict) -> str:
    if not tpl:
        return ""
    out = tpl
    for k, v in ctx.items():
        out = out.replace("{" + k + "}", str(v or ""))
    return out


async def _build_message_context(appointment: dict) -> dict:
    settings = await db.site_settings.find_one({"id": "singleton"}, {"_id": 0}) or {}
    service = await db.services.find_one({"id": appointment.get("service_id")}, {"_id": 0}) or {}
    ad = (appointment.get("customer_name") or "").split(" ")[0] or "Değerli müşterimiz"
    return {
        "ad": ad,
        "ad_soyad": appointment.get("customer_name", ""),
        "telefon_musteri": appointment.get("customer_phone", ""),
        "tarih": appointment.get("date", ""),
        "saat": appointment.get("time", ""),
        "hizmet": service.get("name", ""),
        "kapora": f"₺{appointment.get('deposit_amount', 0):,.0f}".replace(",", "."),
        "ucret": f"₺{appointment.get('total_amount', 0):,.0f}".replace(",", "."),
        "marka": settings.get("business_name", "Fotuber"),
        "telefon": settings.get("phone", ""),
        "whatsapp": settings.get("whatsapp", ""),
        "adres": settings.get("address", "") or "Stüdyoda buluşuyoruz",
        "harita_link": settings.get("google_maps_url", "") or "",
        "eposta": settings.get("email", ""),
    }


async def _create_notification(kind: str, title: str, message: str, *, severity: str = "general",
                               firma_adi: str = "", link: str = "", **extra) -> dict:
    """Central notification creator. Substitutes {firma_adi} tokens in title/message."""
    fa = firma_adi or ""
    title = (title or "").replace("{firma_adi}", fa)
    message = (message or "").replace("{firma_adi}", fa)
    doc = {
        "id": new_id(),
        "kind": kind,
        "title": title,
        "message": message,
        "severity": "critical" if severity == "critical" else "general",
        "firma_adi": fa,
        "link": link or "",
        "read": False,
        "read_at": None,
        "created_at": now_iso(),
        **extra,
    }
    await db.notifications.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/notifications")
async def list_notifications(admin: dict = Depends(require_admin), limit: int = 30,
                             unread_only: bool = False, severity: Optional[str] = None):
    q = {}
    if unread_only:
        q["read"] = False
    if severity in ("critical", "general"):
        q["severity"] = severity
    items = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    unread_count = await db.notifications.count_documents({"read": False})
    critical_unread = await db.notifications.count_documents({"read": False, "severity": "critical"})
    return {"items": items, "unread_count": unread_count, "critical_unread": critical_unread}


class NotificationCreateIn(BaseModel):
    title: str
    message: str = ""
    severity: str = "general"
    firma_adi: str = ""
    link: str = ""


@api_router.post("/notifications")
async def create_notification(payload: NotificationCreateIn, admin: dict = Depends(require_admin)):
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="Başlık gerekli")
    doc = await _create_notification(
        "manual", payload.title.strip(), payload.message.strip(),
        severity=payload.severity, firma_adi=payload.firma_adi.strip(), link=payload.link.strip(),
        created_by=admin.get("id"), created_by_name=admin.get("name"),
    )
    return doc


@api_router.post("/notifications/mark-read")
async def mark_read(admin: dict = Depends(require_admin), notification_id: Optional[str] = None):
    now = now_iso()
    if notification_id:
        await db.notifications.update_one({"id": notification_id}, {"$set": {"read": True, "read_at": now, "read_by": admin.get("name")}})
    else:
        await db.notifications.update_many({"read": False}, {"$set": {"read": True, "read_at": now, "read_by": admin.get("name")}})
    return {"ok": True}


class StudioModulesIn(BaseModel):
    vesikalik: bool = True
    gallery: bool = True


@api_router.get("/admin/studio-accounts")
async def admin_list_studio_accounts(admin: dict = Depends(require_admin)):
    docs = await db.studio_accounts.find({}, {"_id": 0, "id": 1, "email": 1, "firma_adi": 1, "ftb_code": 1, "plan": 1, "modules": 1, "ai_credits": 1}).sort("created_at", -1).to_list(500)
    for d in docs:
        d["modules"] = d.get("modules") or {"vesikalik": True, "gallery": True}
    return {"accounts": docs}


@api_router.post("/admin/studio-accounts/{sid}/modules")
async def admin_set_studio_modules(sid: str, payload: StudioModulesIn, admin: dict = Depends(require_admin)):
    r = await db.studio_accounts.update_one(
        {"id": sid}, {"$set": {"modules": {"vesikalik": bool(payload.vesikalik), "gallery": bool(payload.gallery)}}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Stüdyo hesabı bulunamadı")
    return {"ok": True, "modules": {"vesikalik": bool(payload.vesikalik), "gallery": bool(payload.gallery)}}


class ManualMessageIn(BaseModel):
    body: str
    to_customer: bool = True
    extra_numbers: Optional[str] = None  # comma-separated additional phone numbers


@api_router.post("/appointments/{aid}/send-reminder")
async def send_reminder(aid: str, admin: dict = Depends(require_admin)):
    """Send reminder message to the customer using msg_reminder template."""
    doc = await db.appointments.find_one({"id": aid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Randevu bulunamadı")
    if not doc.get("customer_phone"):
        raise HTTPException(status_code=400, detail="Müşteri telefonu yok")
    settings = await db.site_settings.find_one({"id": "singleton"}, {"_id": 0}) or {}
    tpl = settings.get("msg_reminder") or "Randevunuzu hatırlatırız: {tarih} {saat} — {marka}"
    body = _render_template(tpl, await _build_message_context(doc))
    diag = await _try_send_external_notification(title="", body=body, to_numbers=[doc["customer_phone"]])
    return {"ok": True, "diagnostics": diag}


@api_router.post("/appointments/{aid}/send-message")
async def send_custom_message(aid: str, payload: ManualMessageIn, admin: dict = Depends(require_admin)):
    """Send a custom (admin-typed) message to the customer + optional extra numbers."""
    doc = await db.appointments.find_one({"id": aid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Randevu bulunamadı")
    body = _render_template(payload.body, await _build_message_context(doc))
    to = []
    if payload.to_customer and doc.get("customer_phone"):
        to.append(doc["customer_phone"])
    if payload.extra_numbers:
        for raw in payload.extra_numbers.split(","):
            n = raw.strip()
            if n:
                to.append(n)
    if not to:
        raise HTTPException(status_code=400, detail="En az bir alıcı gerekli")
    diag = await _try_send_external_notification(title="", body=body, to_numbers=to)
    return {"ok": True, "diagnostics": diag}


@api_router.get("/notifications/health")
async def notifications_health(admin: dict = Depends(require_admin)):
    """Diagnostics: is Twilio configured? which channels are on?"""
    return {
        "twilio_configured": bool(TWILIO_SID and TWILIO_TOKEN),
        "sms_enabled": bool(TWILIO_SMS_FROM),
        "whatsapp_enabled": bool(TWILIO_WA_FROM),
        "sms_from": TWILIO_SMS_FROM,
        "whatsapp_from": TWILIO_WA_FROM,
    }


# ---------------------------------------------------------------------------
# Discount Codes (follow-us-for-discount workflow)
# ---------------------------------------------------------------------------
import random
import string


class DiscountRequestIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=7, max_length=20)
    platforms_followed: list[str] = Field(default_factory=list)  # ["instagram","youtube",...]


class PortfolioIn(BaseModel):
    title: str
    description: Optional[str] = ""
    client_name: Optional[str] = ""
    category: Optional[str] = "sosyal-medya"  # sosyal-medya, klip, reklam-filmi, ürün-çekimi
    external_url: Optional[str] = ""
    active: bool = True


class ClientIn(BaseModel):
    name: str
    industry: Optional[str] = ""
    website: Optional[str] = ""
    testimonial: Optional[str] = ""
    active: bool = True


def _generate_code(length: int = 6) -> str:
    letters = string.ascii_uppercase.replace("O", "").replace("I", "")
    digits = string.digits.replace("0", "").replace("1", "")
    return "FTB-" + "".join(random.choice(letters + digits) for _ in range(length))


@api_router.post("/discount-codes/request")
async def request_discount_code(payload: DiscountRequestIn):
    settings = await db.site_settings.find_one({"id": "singleton"}, {"_id": 0}) or {}
    if not settings.get("discount_active", True):
        raise HTTPException(status_code=400, detail="İndirim kampanyası şu an aktif değil")
    if not payload.platforms_followed:
        raise HTTPException(status_code=400, detail="En az bir sosyal medya hesabını takip ettiğinizi işaretleyin")

    # de-duplicate — same phone + last 30 days => return existing pending code
    existing = await db.discount_codes.find_one(
        {"phone": payload.phone, "status": "issued"},
        sort=[("issued_at", -1)],
    )
    if existing:
        existing.pop("_id", None)
        return existing

    percent = float(settings.get("discount_percent", 10))
    expiry_days = int(settings.get("discount_expiry_days", 60))
    now = datetime.now(timezone.utc)
    expires = (now + timedelta(days=expiry_days)).isoformat()

    # Generate unique code
    for _ in range(20):
        code = _generate_code()
        if not await db.discount_codes.find_one({"code": code}):
            break
    else:
        raise HTTPException(status_code=500, detail="Kod üretilemedi, tekrar deneyin")

    doc = {
        "id": new_id(),
        "code": code,
        "name": payload.name,
        "phone": payload.phone,
        "platforms_followed": payload.platforms_followed,
        "discount_percent": percent,
        "status": "issued",  # issued -> redeemed / expired
        "issued_at": now.isoformat(),
        "expires_at": expires,
        "redeemed_at": None,
        "redeemed_by": None,
        "appointment_id": None,
    }
    await db.discount_codes.insert_one(doc)
    doc.pop("_id", None)

    # In-panel + WhatsApp/SMS to admin
    await db.notifications.insert_one({
        "id": new_id(),
        "kind": "discount_issued",
        "title": "Yeni indirim kodu talebi",
        "message": f"{payload.name} ({payload.phone}) → {code} · %{int(percent)}",
        "code_id": doc["id"],
        "read": False,
        "created_at": now.isoformat(),
    })
    await _try_send_external_notification(
        title="Yeni İndirim Kodu",
        body=f"{payload.name} sosyal medyada takip etti, %{int(percent)} kod aldı: {code}. Takip edilen: {', '.join(payload.platforms_followed)}.",
    )
    # Send code to customer via WhatsApp/SMS
    marka = settings.get("business_name", "Fotuber")
    body = f"Merhaba {payload.name.split(' ')[0]}, takibiniz için teşekkürler! %{int(percent)} indirim kodunuz: {code} . Kod, stüdyoya bizzat geldiğinizde geçerli olur. — {marka}"
    await _try_send_external_notification(title="", body=body, to_numbers=[payload.phone])

    return doc


@api_router.get("/discount-codes")
async def list_discount_codes(
    admin: dict = Depends(require_admin),
    status_filter: Optional[str] = None,
):
    q: dict = {}
    if status_filter:
        q["status"] = status_filter
    items = await db.discount_codes.find(q, {"_id": 0}).sort("issued_at", -1).to_list(500)
    return items


class RedeemIn(BaseModel):
    appointment_id: Optional[str] = None
    note: Optional[str] = None


@api_router.post("/discount-codes/{cid}/redeem")
async def redeem_discount_code(cid: str, payload: RedeemIn, admin: dict = Depends(require_admin)):
    doc = await db.discount_codes.find_one({"id": cid})
    if not doc:
        raise HTTPException(status_code=404, detail="Kod bulunamadı")
    if doc.get("status") != "issued":
        raise HTTPException(status_code=400, detail="Bu kod daha önce kullanılmış veya süresi dolmuş")
    if doc.get("expires_at") and doc["expires_at"] < datetime.now(timezone.utc).isoformat():
        await db.discount_codes.update_one({"id": cid}, {"$set": {"status": "expired"}})
        raise HTTPException(status_code=400, detail="Kodun süresi doldu")
    await db.discount_codes.update_one(
        {"id": cid},
        {"$set": {
            "status": "redeemed",
            "redeemed_at": now_iso(),
            "redeemed_by": admin.get("id"),
            "appointment_id": payload.appointment_id,
            "redeem_note": payload.note or "",
        }},
    )
    return {"ok": True}


@api_router.delete("/discount-codes/{cid}")
async def delete_discount_code(cid: str, admin: dict = Depends(require_admin)):
    await db.discount_codes.delete_one({"id": cid})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Fotuber Medya — B2B Portfolio + Clients
# ---------------------------------------------------------------------------
PORTFOLIO_CATEGORIES = [
    {"slug": "sosyal-medya", "name": "Sosyal Medya Yönetimi"},
    {"slug": "klip", "name": "Klip / Reels"},
    {"slug": "reklam-filmi", "name": "Reklam Filmi"},
    {"slug": "urun-cekimi", "name": "Ürün Çekimi"},
    {"slug": "kurumsal", "name": "Kurumsal Tanıtım"},
]


@api_router.get("/portfolio/categories")
async def portfolio_categories():
    return PORTFOLIO_CATEGORIES


@api_router.get("/portfolio")
async def list_portfolio(category: Optional[str] = None):
    q: dict = {"active": True}
    if category:
        q["category"] = category
    items = await db.portfolio.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@api_router.post("/portfolio")
async def create_portfolio(
    title: str = Form(...),
    description: str = Form(""),
    client_name: str = Form(""),
    category: str = Form("sosyal-medya"),
    external_url: str = Form(""),
    file: Optional[UploadFile] = File(None),
    admin: dict = Depends(require_admin),
):
    doc = {
        "id": new_id(),
        "title": title,
        "description": description,
        "client_name": client_name,
        "category": category,
        "external_url": external_url,
        "active": True,
        "media_id": None,
        "media_type": None,
        "content_type": None,
        "created_at": now_iso(),
    }
    if file is not None:
        ext = (file.filename or "bin").split(".")[-1].lower()
        content_type = file.content_type or "application/octet-stream"
        media_type = "video" if content_type.startswith("video") else "image"
        media_id = new_id()
        path = f"{APP_NAME}/portfolio/{media_id}.{ext}"
        data = await file.read()
        put_object(path, data, content_type)
        await db.portfolio_media.insert_one({
            "id": media_id, "storage_path": path, "content_type": content_type,
            "created_at": now_iso(),
        })
        doc.update({"media_id": media_id, "media_type": media_type, "content_type": content_type})
    await db.portfolio.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/portfolio/media/{media_id}")
async def portfolio_media(media_id: str):
    doc = await db.portfolio_media.find_one({"id": media_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Medya bulunamadı")
    data, ct = get_object(doc["storage_path"])
    return StarletteResponse(
        content=data,
        media_type=doc.get("content_type", ct),
        headers={"Cache-Control": "public, max-age=86400"},
    )


@api_router.delete("/portfolio/{pid}")
async def delete_portfolio(pid: str, admin: dict = Depends(require_admin)):
    await db.portfolio.delete_one({"id": pid})
    return {"ok": True}


# ---- Clients (with logo upload) ----
@api_router.get("/clients")
async def list_clients():
    items = await db.clients.find({"active": True}, {"_id": 0}).sort("name", 1).to_list(500)
    return items


@api_router.post("/clients")
async def create_client(
    name: str = Form(...),
    industry: str = Form(""),
    website: str = Form(""),
    testimonial: str = Form(""),
    logo: Optional[UploadFile] = File(None),
    admin: dict = Depends(require_admin),
):
    doc = {
        "id": new_id(),
        "name": name,
        "industry": industry,
        "website": website,
        "testimonial": testimonial,
        "active": True,
        "logo_id": None,
        "created_at": now_iso(),
    }
    if logo is not None:
        ext = (logo.filename or "png").split(".")[-1].lower()
        content_type = logo.content_type or "image/png"
        logo_id = new_id()
        path = f"{APP_NAME}/clients/logo-{logo_id}.{ext}"
        data = await logo.read()
        put_object(path, data, content_type)
        await db.client_logos.insert_one({
            "id": logo_id, "storage_path": path, "content_type": content_type, "created_at": now_iso(),
        })
        doc["logo_id"] = logo_id
    await db.clients.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/clients/logo/{logo_id}")
async def client_logo(logo_id: str):
    doc = await db.client_logos.find_one({"id": logo_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Logo bulunamadı")
    data, ct = get_object(doc["storage_path"])
    return StarletteResponse(
        content=data,
        media_type=doc.get("content_type", ct),
        headers={"Cache-Control": "public, max-age=86400"},
    )


@api_router.delete("/clients/{cid}")
async def delete_client(cid: str, admin: dict = Depends(require_admin)):
    await db.clients.delete_one({"id": cid})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Photo Selection Albums (Fotoğraf Seçim Sistemi)
# — Photographer uploads up to 1500 photos per album.
# — Customer (registered) picks photos and chooses product (album/print/canvas).
# — Only the photo CODES are recorded (no re-uploads to admin).
# — WhatsApp notification is sent to admin on submit.
# ---------------------------------------------------------------------------
from PIL import Image
import io
import secrets
import zipfile


PRINT_SIZES = ["10x15", "13x18", "15x21", "20x30", "30x40"]


class PhotoAlbumIn(BaseModel):
    couple_names: str = Field(min_length=2, max_length=200)
    event_date: Optional[str] = None
    notes: Optional[str] = ""
    max_selections: Optional[int] = None
    selection_deadline: Optional[str] = None


class SelectionItemIn(BaseModel):
    photo_id: str
    photo_code: str
    product_type: Literal["album", "print", "canvas"]
    product_variant: Optional[str] = ""  # e.g. "20x30" or canvas model name
    quantity: int = 1
    notes: Optional[str] = ""


class SelectionsBatchIn(BaseModel):
    selections: List[SelectionItemIn] = []
    customer_note: Optional[str] = ""


def _resize_photo_for_preview(data: bytes) -> bytes:
    """Downscale to max 1600px on long edge, JPEG 82%. Keeps preview clean but light."""
    try:
        img = Image.open(io.BytesIO(data))
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        img.thumbnail((1600, 1600), Image.LANCZOS)
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=82, optimize=True)
        return out.getvalue()
    except Exception:
        return data


def _extract_photo_code(filename: str) -> str:
    """Get the code from the filename e.g. 'DSC00123.JPG' -> 'DSC00123'."""
    base = (filename or "photo").rsplit("/", 1)[-1].rsplit(".", 1)[0]
    return base.strip().upper() or "PHOTO"


@api_router.post("/admin/photo-albums")
async def create_photo_album(payload: PhotoAlbumIn, admin: dict = Depends(require_admin)):
    doc = {
        "id": new_id(),
        "couple_names": payload.couple_names.strip(),
        "event_date": payload.event_date,
        "notes": payload.notes or "",
        "max_selections": payload.max_selections,
        "selection_deadline": payload.selection_deadline,
        "share_token": secrets.token_urlsafe(16),
        "photo_count": 0,
        "created_at": now_iso(),
        "created_by": admin.get("id"),
        "created_by_name": admin.get("name"),
        "is_locked": False,
    }
    await db.photo_albums.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/admin/photo-albums")
async def list_photo_albums(admin: dict = Depends(require_admin)):
    items = await db.photo_albums.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@api_router.get("/admin/photo-albums/{aid}")
async def get_admin_photo_album(aid: str, admin: dict = Depends(require_admin)):
    album = await db.photo_albums.find_one({"id": aid}, {"_id": 0})
    if not album:
        raise HTTPException(status_code=404, detail="Albüm bulunamadı")
    photos = await db.album_photos.find({"album_id": aid}, {"_id": 0}).sort("sort_order", 1).to_list(2000)
    return {"album": album, "photos": photos}


@api_router.patch("/admin/photo-albums/{aid}")
async def update_photo_album(aid: str, payload: PhotoAlbumIn, admin: dict = Depends(require_admin)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    await db.photo_albums.update_one({"id": aid}, {"$set": updates})
    return await db.photo_albums.find_one({"id": aid}, {"_id": 0})


@api_router.delete("/admin/photo-albums/{aid}")
async def delete_photo_album(aid: str, admin: dict = Depends(require_admin)):
    photos = await db.album_photos.find({"album_id": aid}).to_list(2000)
    for p in photos:
        if p.get("storage_path"):
            delete_object(p["storage_path"])
    await db.album_photos.delete_many({"album_id": aid})
    await db.photo_selections.delete_many({"album_id": aid})
    await db.photo_albums.delete_one({"id": aid})
    return {"ok": True}


@api_router.post("/admin/photo-albums/{aid}/photos")
async def upload_album_photos(
    aid: str,
    files: List[UploadFile] = File(...),
    admin: dict = Depends(require_admin),
):
    album = await db.photo_albums.find_one({"id": aid})
    if not album:
        raise HTTPException(status_code=404, detail="Albüm bulunamadı")
    if album.get("photo_count", 0) + len(files) > 1500:
        raise HTTPException(status_code=400, detail="Albüm başına en fazla 1500 fotoğraf yükleyebilirsiniz")

    added = []
    now_ord = int(datetime.now(timezone.utc).timestamp())
    for i, f in enumerate(files):
        data = await f.read()
        if not data:
            continue
        # server-side resize for preview (keeps disk tiny + fast client)
        preview = _resize_photo_for_preview(data)
        code = _extract_photo_code(f.filename)
        pid = new_id()
        path = f"albums/{aid}/{pid}.jpg"
        try:
            put_object(path, preview, "image/jpeg")
        except Exception as e:
            logger.exception("Photo upload failed: %s", e)
            continue
        doc = {
            "id": pid,
            "album_id": aid,
            "code": code,
            "original_filename": f.filename,
            "storage_path": path,
            "size": len(preview),
            "sort_order": now_ord + i,
            "uploaded_at": now_iso(),
        }
        await db.album_photos.insert_one(doc)
        doc.pop("_id", None)
        added.append(doc)

    await db.photo_albums.update_one({"id": aid}, {"$inc": {"photo_count": len(added)}})
    return {"added": len(added), "photos": added}


@api_router.delete("/admin/photo-albums/{aid}/photos/{pid}")
async def delete_album_photo(aid: str, pid: str, admin: dict = Depends(require_admin)):
    photo = await db.album_photos.find_one({"id": pid, "album_id": aid})
    if not photo:
        raise HTTPException(status_code=404, detail="Fotoğraf bulunamadı")
    if photo.get("storage_path"):
        delete_object(photo["storage_path"])
    await db.album_photos.delete_one({"id": pid})
    await db.photo_selections.delete_many({"album_id": aid, "photo_id": pid})
    await db.photo_albums.update_one({"id": aid}, {"$inc": {"photo_count": -1}})
    return {"ok": True}


@api_router.get("/admin/photo-albums/{aid}/selections")
async def list_album_selections(aid: str, admin: dict = Depends(require_admin)):
    sels = await db.photo_selections.find({"album_id": aid}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    # group by user for admin readability
    users = {}
    for s in sels:
        uid = s.get("user_id")
        if uid not in users:
            users[uid] = {
                "user_id": uid,
                "user_name": s.get("user_name"),
                "user_phone": s.get("user_phone"),
                "user_email": s.get("user_email"),
                "customer_note": s.get("customer_note"),
                "created_at": s.get("created_at"),
                "items": [],
            }
        users[uid]["items"].append(s)
    return {"count": len(sels), "by_user": list(users.values())}


# --- Public album endpoints (require any authenticated user) ---
@api_router.get("/photo-albums/{token}")
async def public_get_album(token: str, user: dict = Depends(get_current_user)):
    album = await db.photo_albums.find_one({"share_token": token}, {"_id": 0})
    if not album:
        raise HTTPException(status_code=404, detail="Albüm bulunamadı")
    photos = await db.album_photos.find({"album_id": album["id"]}, {"_id": 0, "storage_path": 0}).sort("sort_order", 1).to_list(2000)
    existing = await db.photo_selections.find(
        {"album_id": album["id"], "user_id": user.get("id")}, {"_id": 0}
    ).to_list(2000)
    canvas_opts = await db.product_options.find(
        {"kind": "canvas", "active": True}, {"_id": 0}
    ).sort("sort_order", 1).to_list(200)
    album_opts = await db.product_options.find(
        {"kind": "album", "active": True}, {"_id": 0}
    ).sort("sort_order", 1).to_list(200)
    return {
        "album": album,
        "photos": photos,
        "print_sizes": PRINT_SIZES,
        "canvas_options": canvas_opts,
        "album_options": album_opts,
        "selections": existing,
    }


@api_router.get("/photo-albums/{token}/file/{pid}")
async def public_get_album_photo(token: str, pid: str, user: dict = Depends(get_current_user)):
    album = await db.photo_albums.find_one({"share_token": token})
    if not album:
        raise HTTPException(status_code=404, detail="Albüm bulunamadı")
    photo = await db.album_photos.find_one({"id": pid, "album_id": album["id"]})
    if not photo:
        raise HTTPException(status_code=404, detail="Fotoğraf bulunamadı")
    data, ct = get_object(photo["storage_path"])
    return Response(
        content=data,
        media_type=ct,
        headers={"Cache-Control": "public, max-age=3600"},
    )


@api_router.post("/photo-albums/{token}/selections")
async def public_submit_selections(
    token: str,
    payload: SelectionsBatchIn,
    user: dict = Depends(get_current_user),
):
    album = await db.photo_albums.find_one({"share_token": token})
    if not album:
        raise HTTPException(status_code=404, detail="Albüm bulunamadı")
    if album.get("is_locked"):
        raise HTTPException(status_code=400, detail="Bu albümde seçim yapma süresi doldu")
    if album.get("max_selections") and len(payload.selections) > album["max_selections"]:
        raise HTTPException(status_code=400, detail=f"En fazla {album['max_selections']} seçim yapabilirsiniz")

    # Overwrite user's previous selections for this album
    await db.photo_selections.delete_many({"album_id": album["id"], "user_id": user.get("id")})
    docs = []
    for sel in payload.selections:
        docs.append({
            "id": new_id(),
            "album_id": album["id"],
            "album_couple": album.get("couple_names"),
            "album_event_date": album.get("event_date"),
            "user_id": user.get("id"),
            "user_name": user.get("name"),
            "user_phone": user.get("phone", ""),
            "user_email": user.get("email"),
            "photo_id": sel.photo_id,
            "photo_code": sel.photo_code,
            "product_type": sel.product_type,
            "product_variant": sel.product_variant or "",
            "quantity": max(1, sel.quantity),
            "notes": sel.notes or "",
            "customer_note": payload.customer_note or "",
            "created_at": now_iso(),
        })
    if docs:
        await db.photo_selections.insert_many(docs)

    # Notify admin via WhatsApp/SMS (best-effort)
    try:
        from collections import Counter
        summary = Counter([f"{d['product_type']}·{d.get('product_variant') or '-'}" for d in docs])
        breakdown = ", ".join([f"{k}={v}" for k, v in summary.items()])
        title = "📸 Yeni Fotoğraf Seçimi"
        body = (
            f"Albüm: {album.get('couple_names')} · {album.get('event_date') or ''}\n"
            f"Müşteri: {user.get('name')} ({user.get('phone', '-')})\n"
            f"Toplam Seçim: {len(docs)}\n"
            f"Ürün Dağılımı: {breakdown or 'yok'}\n"
            f"Panel: /admin/albumler ile detayları görün."
        )
        await _try_send_external_notification(title, body)
        # In-app notification too
        await db.notifications.insert_one({
            "id": new_id(),
            "type": "selection",
            "title": "Yeni Fotoğraf Seçimi",
            "body": f"{user.get('name')} — {album.get('couple_names')} albümünde {len(docs)} seçim yaptı",
            "read": False,
            "created_at": now_iso(),
        })
    except Exception:
        logger.exception("Selection notification failed")

    return {"ok": True, "count": len(docs)}


# ---------------------------------------------------------------------------
# Product Options (Albüm & Kanvas Tablo Modelleri — admin managed)
# ---------------------------------------------------------------------------
class ProductOptionIn(BaseModel):
    kind: Literal["album", "canvas"]
    name: str = Field(min_length=1, max_length=100)
    size: Optional[str] = ""
    price: Optional[float] = 0
    description: Optional[str] = ""
    active: bool = True
    sort_order: Optional[int] = 0


@api_router.get("/product-options")
async def public_list_product_options(kind: Optional[str] = None):
    q = {"active": True}
    if kind:
        q["kind"] = kind
    items = await db.product_options.find(q, {"_id": 0}).sort("sort_order", 1).to_list(500)
    return {"items": items, "print_sizes": PRINT_SIZES}


@api_router.get("/admin/product-options")
async def admin_list_product_options(admin: dict = Depends(require_admin)):
    items = await db.product_options.find({}, {"_id": 0}).sort([("kind", 1), ("sort_order", 1)]).to_list(500)
    return items


@api_router.post("/admin/product-options")
async def admin_create_product_option(payload: ProductOptionIn, admin: dict = Depends(require_admin)):
    doc = {**payload.model_dump(), "id": new_id(), "created_at": now_iso()}
    await db.product_options.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.patch("/admin/product-options/{oid}")
async def admin_update_product_option(oid: str, payload: ProductOptionIn, admin: dict = Depends(require_admin)):
    await db.product_options.update_one({"id": oid}, {"$set": payload.model_dump()})
    return await db.product_options.find_one({"id": oid}, {"_id": 0})


@api_router.delete("/admin/product-options/{oid}")
async def admin_delete_product_option(oid: str, admin: dict = Depends(require_admin)):
    await db.product_options.delete_one({"id": oid})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Guest Uploads via QR (Etkinlik Fotoğraf/Video Toplama)
# — Guests scan QR at wedding tables, register (KVKK), upload up to 200MB each,
#   files auto-delete after N days (default 3).
# ---------------------------------------------------------------------------
class GuestEventIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    couple_names: Optional[str] = ""
    event_date: Optional[str] = None
    event_type: Optional[str] = "wedding"
    max_size_per_user_mb: int = 200
    retention_days: int = 3
    welcome_message: Optional[str] = ""


@api_router.post("/admin/guest-events")
async def create_guest_event(payload: GuestEventIn, admin: dict = Depends(require_admin)):
    token = secrets.token_urlsafe(10)
    now = datetime.now(timezone.utc)
    delete_at = (now + timedelta(days=int(payload.retention_days))).isoformat()
    doc = {
        "id": new_id(),
        "name": payload.name.strip(),
        "couple_names": payload.couple_names or "",
        "event_date": payload.event_date,
        "event_type": payload.event_type or "wedding",
        "welcome_message": payload.welcome_message or "",
        "max_size_per_user_mb": max(10, min(1000, payload.max_size_per_user_mb)),
        "retention_days": max(1, min(30, payload.retention_days)),
        "upload_token": token,
        "delete_at": delete_at,
        "upload_count": 0,
        "total_size": 0,
        "created_at": now_iso(),
        "created_by": admin.get("id"),
    }
    await db.guest_events.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/admin/guest-events")
async def admin_list_guest_events(admin: dict = Depends(require_admin)):
    items = await db.guest_events.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@api_router.get("/admin/guest-events/{eid}")
async def admin_get_guest_event(eid: str, admin: dict = Depends(require_admin)):
    ev = await db.guest_events.find_one({"id": eid}, {"_id": 0})
    if not ev:
        raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
    uploads = await db.guest_uploads.find({"event_id": eid}, {"_id": 0, "storage_path": 0}).sort("uploaded_at", -1).to_list(2000)
    return {"event": ev, "uploads": uploads}


@api_router.delete("/admin/guest-events/{eid}")
async def admin_delete_guest_event(eid: str, admin: dict = Depends(require_admin)):
    uploads = await db.guest_uploads.find({"event_id": eid}).to_list(2000)
    for up in uploads:
        if up.get("storage_path"):
            delete_object(up["storage_path"])
    await db.guest_uploads.delete_many({"event_id": eid})
    await db.guest_events.delete_one({"id": eid})
    return {"ok": True}


@api_router.post("/admin/guest-events/{eid}/extend")
async def admin_extend_guest_event(eid: str, days: int = 3, admin: dict = Depends(require_admin)):
    ev = await db.guest_events.find_one({"id": eid})
    if not ev:
        raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
    new_delete = (datetime.now(timezone.utc) + timedelta(days=max(1, min(30, days)))).isoformat()
    await db.guest_events.update_one({"id": eid}, {"$set": {"delete_at": new_delete}})
    await db.guest_uploads.update_many({"event_id": eid}, {"$set": {"delete_at": new_delete}})
    return {"delete_at": new_delete}


@api_router.get("/admin/guest-events/{eid}/download-zip")
async def admin_download_event_zip(eid: str, admin: dict = Depends(require_admin)):
    ev = await db.guest_events.find_one({"id": eid})
    if not ev:
        raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
    uploads = await db.guest_uploads.find({"event_id": eid}).to_list(5000)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
        for up in uploads:
            try:
                data, _ct = get_object(up["storage_path"])
                safe_name = (up.get("user_name") or "misafir").replace("/", "_")
                arcname = f"{safe_name}/{up.get('filename') or up['id']}"
                zf.writestr(arcname, data)
            except Exception:
                continue
    buf.seek(0)
    from urllib.parse import quote as _urlquote
    raw_name = f"{ev.get('name', 'etkinlik').replace(' ', '_')}_{ev.get('event_date') or ''}.zip"
    # ASCII fallback for older clients + UTF-8 encoded RFC 5987 filename* for the rest
    ascii_name = raw_name.encode("ascii", "ignore").decode("ascii") or "etkinlik.zip"
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{ascii_name}"; '
                f"filename*=UTF-8''{_urlquote(raw_name)}"
            ),
        },
    )


# Public guest info (for QR landing)
@api_router.get("/guest-events/{token}")
async def public_get_guest_event(token: str):
    ev = await db.guest_events.find_one({"upload_token": token}, {"_id": 0})
    if not ev:
        raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
    expired = ev.get("delete_at") and ev["delete_at"] < now_iso()
    return {
        "name": ev.get("name"),
        "couple_names": ev.get("couple_names"),
        "event_date": ev.get("event_date"),
        "event_type": ev.get("event_type") or "wedding",
        "welcome_message": ev.get("welcome_message"),
        "max_size_per_user_mb": ev.get("max_size_per_user_mb", 200),
        "retention_days": ev.get("retention_days", 3),
        "delete_at": ev.get("delete_at"),
        "expired": bool(expired),
    }


@api_router.get("/guest-events/{token}/my-usage")
async def guest_my_usage(token: str, user: dict = Depends(get_current_user)):
    ev = await db.guest_events.find_one({"upload_token": token})
    if not ev:
        raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
    used_agg = await db.guest_uploads.aggregate([
        {"$match": {"event_id": ev["id"], "user_id": user.get("id")}},
        {"$group": {"_id": None, "total": {"$sum": "$size"}, "count": {"$sum": 1}}},
    ]).to_list(1)
    used = used_agg[0]["total"] if used_agg else 0
    count = used_agg[0]["count"] if used_agg else 0
    limit = ev.get("max_size_per_user_mb", 200) * 1024 * 1024
    return {"used_bytes": used, "used_files": count, "limit_bytes": limit, "remaining_bytes": max(0, limit - used)}


@api_router.post("/guest-events/{token}/upload")
async def guest_upload_file(
    token: str,
    file: UploadFile = File(...),
    kvkk_accepted: bool = Form(True),
    user: dict = Depends(get_current_user),
):
    ev = await db.guest_events.find_one({"upload_token": token})
    if not ev:
        raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
    if ev.get("delete_at") and ev["delete_at"] < now_iso():
        raise HTTPException(status_code=410, detail="Bu etkinlik için yükleme süresi doldu")
    if not kvkk_accepted:
        raise HTTPException(status_code=400, detail="KVKK onayı zorunludur")

    # Check user's used quota
    used_agg = await db.guest_uploads.aggregate([
        {"$match": {"event_id": ev["id"], "user_id": user.get("id")}},
        {"$group": {"_id": None, "total": {"$sum": "$size"}}},
    ]).to_list(1)
    used = used_agg[0]["total"] if used_agg else 0
    limit = ev.get("max_size_per_user_mb", 200) * 1024 * 1024

    data = await file.read()
    size = len(data)
    if size == 0:
        raise HTTPException(status_code=400, detail="Boş dosya")
    if used + size > limit:
        raise HTTPException(
            status_code=413,
            detail=f"Kotanızı aştınız. Kalan: {(limit - used) // (1024*1024)} MB",
        )

    uid = new_id()
    path = f"events/{ev['id']}/{uid}_{(file.filename or 'file').replace('/', '_')[:100]}"
    put_object(path, data, file.content_type or "application/octet-stream")
    doc = {
        "id": uid,
        "event_id": ev["id"],
        "user_id": user.get("id"),
        "user_name": user.get("name"),
        "user_phone": user.get("phone", ""),
        "user_email": user.get("email"),
        "filename": file.filename,
        "storage_path": path,
        "size": size,
        "mime_type": file.content_type or "application/octet-stream",
        "kvkk_accepted": True,
        "kvkk_accepted_at": now_iso(),
        "uploaded_at": now_iso(),
        "delete_at": ev.get("delete_at"),
    }
    await db.guest_uploads.insert_one(doc)
    await db.guest_events.update_one(
        {"id": ev["id"]},
        {"$inc": {"upload_count": 1, "total_size": size}},
    )
    return {"ok": True, "size": size, "remaining": max(0, limit - used - size)}


# ---------------------------------------------------------------------------
# Venues (Mekanlar) — permanent QR codes per venue; the admin swaps which
# couple's event is currently ACTIVE at that venue (wedding hall, engagement house).
# One QR per venue → forever. Panelden çift/organizasyon güncellenir.
# ---------------------------------------------------------------------------
class VenueIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: Optional[str] = ""
    default_max_size_per_user_mb: int = 200
    default_retention_days: int = 3


class VenueActivateIn(BaseModel):
    event_id: Optional[str] = None
    # If event_id is not provided, create a new event using these fields:
    name: Optional[str] = None
    couple_names: Optional[str] = None
    event_date: Optional[str] = None
    event_type: Optional[str] = "wedding"  # wedding | engagement | henna | nikah | other
    welcome_message: Optional[str] = ""
    retention_days: Optional[int] = None
    max_size_per_user_mb: Optional[int] = None


@api_router.post("/admin/venues")
async def create_venue(payload: VenueIn, admin: dict = Depends(require_admin)):
    doc = {
        "id": new_id(),
        "name": payload.name.strip(),
        "description": payload.description or "",
        "qr_token": secrets.token_urlsafe(8),
        "current_event_id": None,
        "default_max_size_per_user_mb": max(10, min(1000, payload.default_max_size_per_user_mb)),
        "default_retention_days": max(1, min(30, payload.default_retention_days)),
        "created_at": now_iso(),
        "created_by": admin.get("id"),
    }
    await db.venues.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/admin/venues")
async def list_venues(admin: dict = Depends(require_admin)):
    items = await db.venues.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for v in items:
        if v.get("current_event_id"):
            ev = await db.guest_events.find_one({"id": v["current_event_id"]}, {"_id": 0})
            if ev:
                v["current_event"] = ev
    return items


@api_router.patch("/admin/venues/{vid}")
async def update_venue(vid: str, payload: VenueIn, admin: dict = Depends(require_admin)):
    await db.venues.update_one({"id": vid}, {"$set": {
        "name": payload.name,
        "description": payload.description or "",
        "default_max_size_per_user_mb": payload.default_max_size_per_user_mb,
        "default_retention_days": payload.default_retention_days,
    }})
    return await db.venues.find_one({"id": vid}, {"_id": 0})


@api_router.post("/admin/venues/{vid}/activate")
async def activate_venue_event(vid: str, payload: VenueActivateIn, admin: dict = Depends(require_admin)):
    venue = await db.venues.find_one({"id": vid})
    if not venue:
        raise HTTPException(status_code=404, detail="Mekan bulunamadı")
    eid = payload.event_id
    if not eid:
        retention = payload.retention_days or venue.get("default_retention_days", 3)
        max_size = payload.max_size_per_user_mb or venue.get("default_max_size_per_user_mb", 200)
        delete_at = (datetime.now(timezone.utc) + timedelta(days=int(retention))).isoformat()
        ev_doc = {
            "id": new_id(),
            "venue_id": vid,
            "venue_name": venue.get("name"),
            "name": payload.name or f"{venue['name']} — {payload.couple_names or 'Etkinlik'}",
            "couple_names": payload.couple_names or "",
            "event_date": payload.event_date,
            "event_type": payload.event_type or "wedding",
            "welcome_message": payload.welcome_message or "",
            "max_size_per_user_mb": max_size,
            "retention_days": retention,
            "upload_token": secrets.token_urlsafe(10),
            "delete_at": delete_at,
            "upload_count": 0,
            "total_size": 0,
            "created_at": now_iso(),
            "created_by": admin.get("id"),
        }
        await db.guest_events.insert_one(ev_doc)
        eid = ev_doc["id"]
    await db.venues.update_one({"id": vid}, {"$set": {"current_event_id": eid}})
    return await db.venues.find_one({"id": vid}, {"_id": 0})


@api_router.post("/admin/venues/{vid}/deactivate")
async def deactivate_venue(vid: str, admin: dict = Depends(require_admin)):
    await db.venues.update_one({"id": vid}, {"$set": {"current_event_id": None}})
    return {"ok": True}


@api_router.delete("/admin/venues/{vid}")
async def delete_venue(vid: str, admin: dict = Depends(require_admin)):
    await db.venues.delete_one({"id": vid})
    return {"ok": True}


@api_router.get("/venues/{qr_token}")
async def public_get_venue(qr_token: str):
    """Public — scanning venue QR resolves to the currently active event (if any)."""
    venue = await db.venues.find_one({"qr_token": qr_token}, {"_id": 0})
    if not venue:
        raise HTTPException(status_code=404, detail="Mekan bulunamadı")
    if not venue.get("current_event_id"):
        return {"venue_name": venue.get("name"), "active": False}
    ev = await db.guest_events.find_one({"id": venue["current_event_id"]}, {"_id": 0})
    if not ev:
        return {"venue_name": venue.get("name"), "active": False}
    expired = ev.get("delete_at") and ev["delete_at"] < now_iso()
    return {
        "venue_name": venue.get("name"),
        "active": not expired,
        "upload_token": ev.get("upload_token"),
        "name": ev.get("name"),
        "couple_names": ev.get("couple_names"),
        "event_date": ev.get("event_date"),
        "event_type": ev.get("event_type") or "wedding",
        "welcome_message": ev.get("welcome_message"),
        "max_size_per_user_mb": ev.get("max_size_per_user_mb", 200),
        "retention_days": ev.get("retention_days", 3),
        "delete_at": ev.get("delete_at"),
        "expired": bool(expired),
    }


# ---------------------------------------------------------------------------
# Couple Download Link — admin generates a shareable link for the couple to
# download ALL guest uploads (photos+videos) with a self-set expiry (2-7 days).
# ---------------------------------------------------------------------------
class DownloadLinkIn(BaseModel):
    days: int = 3


@api_router.post("/admin/guest-events/{eid}/generate-download-link")
async def generate_download_link(eid: str, payload: DownloadLinkIn, admin: dict = Depends(require_admin)):
    ev = await db.guest_events.find_one({"id": eid})
    if not ev:
        raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
    days = max(2, min(7, int(payload.days or 3)))
    token = secrets.token_urlsafe(12)
    expires = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
    await db.guest_events.update_one(
        {"id": eid},
        {"$set": {"download_token": token, "download_expires_at": expires, "download_days": days}},
    )
    return {"download_token": token, "download_expires_at": expires, "days": days}


@api_router.post("/admin/guest-events/{eid}/revoke-download-link")
async def revoke_download_link(eid: str, admin: dict = Depends(require_admin)):
    await db.guest_events.update_one(
        {"id": eid},
        {"$unset": {"download_token": "", "download_expires_at": "", "download_days": ""}},
    )
    return {"ok": True}


@api_router.get("/download/{download_token}")
async def public_get_download(download_token: str):
    ev = await db.guest_events.find_one({"download_token": download_token}, {"_id": 0})
    if not ev:
        raise HTTPException(status_code=404, detail="Bağlantı bulunamadı")
    if ev.get("download_expires_at") and ev["download_expires_at"] < now_iso():
        raise HTTPException(status_code=410, detail="Bu indirme bağlantısının süresi doldu")
    uploads = await db.guest_uploads.find(
        {"event_id": ev["id"]}, {"_id": 0, "storage_path": 0}
    ).sort("uploaded_at", -1).to_list(5000)
    return {
        "event": {
            "name": ev.get("name"),
            "couple_names": ev.get("couple_names"),
            "event_date": ev.get("event_date"),
            "event_type": ev.get("event_type") or "wedding",
        },
        "expires_at": ev.get("download_expires_at"),
        "total_files": len(uploads),
        "total_size": sum(int(u.get("size", 0) or 0) for u in uploads),
        "files": uploads,
    }


@api_router.get("/download/{download_token}/zip")
async def public_download_zip(download_token: str):
    ev = await db.guest_events.find_one({"download_token": download_token})
    if not ev:
        raise HTTPException(status_code=404, detail="Bağlantı bulunamadı")
    if ev.get("download_expires_at") and ev["download_expires_at"] < now_iso():
        raise HTTPException(status_code=410, detail="Bu indirme bağlantısının süresi doldu")
    uploads = await db.guest_uploads.find({"event_id": ev["id"]}).to_list(5000)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
        for up in uploads:
            try:
                data, _ct = get_object(up["storage_path"])
                safe = (up.get("user_name") or "misafir").replace("/", "_")
                zf.writestr(f"{safe}/{up.get('filename') or up['id']}", data)
            except Exception:
                continue
    buf.seek(0)
    from urllib.parse import quote as _urlquote
    raw = f"{ev.get('couple_names') or ev.get('name', 'etkinlik')}_{ev.get('event_date') or ''}.zip".replace(" ", "_")
    ascii_name = raw.encode("ascii", "ignore").decode("ascii") or "etkinlik.zip"
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{ascii_name}"; '
                f"filename*=UTF-8''{_urlquote(raw)}"
            ),
        },
    )


# ---------------------------------------------------------------------------
# Cleanup task — auto-delete expired guest uploads
# ---------------------------------------------------------------------------
async def _cleanup_expired_uploads():
    while True:
        try:
            now = now_iso()
            expired = await db.guest_uploads.find({"delete_at": {"$lt": now}}).to_list(1000)
            for up in expired:
                try:
                    if up.get("storage_path"):
                        delete_object(up["storage_path"])
                    await db.guest_uploads.delete_one({"id": up["id"]})
                    await db.guest_events.update_one(
                        {"id": up.get("event_id")},
                        {"$inc": {"upload_count": -1, "total_size": -int(up.get("size", 0))}},
                    )
                except Exception:
                    logger.exception("Cleanup failed for %s", up.get("id"))
            if expired:
                logger.info("Deleted %d expired guest uploads", len(expired))
        except Exception:
            logger.exception("cleanup loop error")
        await asyncio.sleep(3600)  # every hour


# ---------------------------------------------------------------------------
# Root/health
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Vesikalık AI Photo Editor — Nano Banana image editing
# ---------------------------------------------------------------------------
class VesikalikAiEditIn(BaseModel):
    image_base64: str
    gender: str          # "male" | "female"
    garment: str         # "tshirt" | "polo" | "shirt" | "blazer" | "blouse" | "collared_blouse"
    collar: str = "none" # "collar" | "no_collar" | "none"
    color: str           # hex like "#0f172a" or name
    color_name: str = "" # optional human-readable ("lacivert")

DEFAULT_AI_CREDITS = 25

# Pricing model: each credit = one AI edit. The customer is charged a MARKUP
# (default 2x) over what Emergent costs the owner per edit, so the owner's
# Emergent balance grows with every sale. Base cost + markup are configurable.
AI_CREDIT_BASE_COST = float(os.environ.get("AI_CREDIT_BASE_COST", "2.0"))  # Emergent cost per 1 edit (TRY)
AI_CREDIT_MARKUP = float(os.environ.get("AI_CREDIT_MARKUP", "2"))          # customer pays this multiple
CREDIT_TIERS = [10, 25, 50, 100]
CREDIT_LABELS = {10: "Başlangıç", 25: "Popüler", 50: "Avantajlı", 100: "Pro"}

def _credit_unit_price() -> float:
    return round(AI_CREDIT_BASE_COST * AI_CREDIT_MARKUP, 2)

def _credit_packages() -> dict:
    unit = _credit_unit_price()
    out = {}
    for c in CREDIT_TIERS:
        out[f"p{c}"] = {
            "id": f"p{c}",
            "credits": c,
            "price": round(unit * c, 2),
            "unit_price": unit,
            "label": CREDIT_LABELS.get(c, ""),
            "popular": c == 25,
        }
    return out

def _ai_credits_of(user: dict) -> int:
    v = user.get("ai_credits")
    return DEFAULT_AI_CREDITS if v is None else int(v)

# ---- BYOK: per-user Google Gemini key (encrypted at rest with Fernet) -------
def _fernet():
    import base64 as _b64, hashlib as _hl
    from cryptography.fernet import Fernet
    return Fernet(_b64.urlsafe_b64encode(_hl.sha256(JWT_SECRET.encode()).digest()))

def _encrypt_secret(raw: str) -> str:
    return _fernet().encrypt(raw.encode()).decode()

def _decrypt_secret(enc: str) -> str:
    try:
        return _fernet().decrypt(enc.encode()).decode()
    except Exception:
        return ""

def _user_gemini_key(user: dict) -> str:
    enc = user.get("gemini_api_key_enc")
    return _decrypt_secret(enc) if enc else ""

def _mask_key(raw: str) -> str:
    return raw[-4:] if raw and len(raw) >= 4 else "••••"

def _validate_gemini_key_sync(api_key: str) -> bool:
    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        for _ in client.models.list():
            break
        return True
    except Exception:
        logger.warning("Gemini key validation failed")
        return False

def _byok_image_edit_sync(api_key: str, image_bytes: bytes, mime: str, prompt: str):
    import base64 as _b64
    from google import genai
    from google.genai import types
    model = os.environ.get("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image")
    client = genai.Client(api_key=api_key)
    resp = client.models.generate_content(
        model=model,
        contents=[prompt, types.Part.from_bytes(data=image_bytes, mime_type=mime)],
    )
    for cand in (getattr(resp, "candidates", None) or []):
        content = getattr(cand, "content", None)
        for part in (getattr(content, "parts", None) or []):
            inline = getattr(part, "inline_data", None)
            data = getattr(inline, "data", None) if inline else None
            if data:
                out_mime = getattr(inline, "mime_type", None) or "image/png"
                out_b64 = _b64.b64encode(data).decode() if isinstance(data, (bytes, bytearray)) else str(data)
                return out_b64, out_mime
    return None, None

class GeminiKeyIn(BaseModel):
    api_key: str

@api_router.get("/vesikalik/gemini-key")
async def get_gemini_key(admin: dict = Depends(require_vesikalik_access)):
    """Whether the current user has connected their own Gemini key (masked)."""
    raw = _user_gemini_key(admin)
    return {"connected": bool(raw), "masked": _mask_key(raw) if raw else None}

@api_router.post("/vesikalik/gemini-key")
async def set_gemini_key(payload: GeminiKeyIn, admin: dict = Depends(require_vesikalik_access)):
    """Validate a user-supplied Google Gemini key against Google, then store it."""
    import asyncio as _asyncio
    raw = (payload.api_key or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Anahtar boş olamaz")
    ok = await _asyncio.to_thread(_validate_gemini_key_sync, raw)
    if not ok:
        raise HTTPException(status_code=400, detail="Geçersiz Gemini anahtarı — Google doğrulaması başarısız oldu")
    await db.users.update_one({"id": admin.get("id")}, {"$set": {"gemini_api_key_enc": _encrypt_secret(raw)}})
    await _track_feature(admin.get("id"), "byok")
    return {"connected": True, "masked": _mask_key(raw)}

@api_router.delete("/vesikalik/gemini-key")
async def delete_gemini_key(admin: dict = Depends(require_vesikalik_access)):
    await db.users.update_one({"id": admin.get("id")}, {"$unset": {"gemini_api_key_enc": ""}})
    return {"connected": False, "masked": None}

class MemberRegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    full_name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=7, max_length=20)
    company_name: str = ""  # optional for individuals
    kvkk_accepted: bool = False
    sms_consent: bool = False
    email_consent: bool = False

class MemberLoginIn(BaseModel):
    email: EmailStr
    password: str

def _member_public(user: dict) -> dict:
    return {
        "id": user.get("id"), "email": user.get("email"), "name": user.get("name"),
        "company_name": user.get("company_name", ""), "phone": user.get("phone"),
        "role": user.get("role"),
    }

@api_router.post("/member/register")
async def member_register(payload: MemberRegisterIn, response: Response):
    import uuid
    if not (payload.kvkk_accepted and payload.sms_consent and payload.email_consent):
        raise HTTPException(status_code=400, detail="Devam etmek için KVKK, SMS ve e-posta izinlerini onaylamalısınız")
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Bu e-posta zaten kayıtlı")
    now = datetime.now(timezone.utc)
    uid = str(uuid.uuid4())
    phone_norm = _norm_phone(payload.phone)
    company_norm = _norm_company(payload.company_name)

    # Free 1-month trial is granted ONCE per phone number OR per company name.
    # If any prior member already claimed a trial with the same phone or company,
    # this account starts WITHOUT a trial (must subscribe to use paid features).
    match_or = [{"phone_norm": phone_norm}] if phone_norm else []
    if company_norm:
        match_or.append({"company_norm": company_norm})
    trial_used = False
    if match_or:
        prior = await db.users.find_one({
            "role": "member", "trial_start": {"$ne": None}, "$or": match_or,
        })
        trial_used = bool(prior)

    doc = {
        "id": uid, "email": payload.email.lower(), "password": hash_password(payload.password),
        "name": payload.full_name, "phone": payload.phone,
        "company_name": (payload.company_name or "").strip(),
        "phone_norm": phone_norm, "company_norm": company_norm,
        "role": "member", "created_at": now.isoformat(),
        "trial_start": None if trial_used else now.isoformat(),
        "trial_end": None if trial_used else (now + timedelta(days=TRIAL_DAYS)).isoformat(),
        "trial_used_before": trial_used,
        "paid_until": None, "ai_credits": 0, "features_used": [],
        "consents": {"kvkk": True, "sms": True, "email": True, "accepted_at": now.isoformat()},
    }
    await db.users.insert_one(doc)
    access = create_access_token(uid, doc["email"], "member")
    set_auth_cookies(response, access, create_refresh_token(uid))
    asyncio.create_task(_send_welcome_email(doc, trial=not trial_used))
    return {"token": access, "user": _member_public(doc), "membership": _membership_state(doc), "trial_used_before": trial_used}

@api_router.post("/member/login")
async def member_login(payload: MemberLoginIn, response: Response):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user or user.get("role") != "member" or not verify_password(payload.password, user.get("password", "")):
        raise HTTPException(status_code=401, detail="E-posta veya şifre hatalı")
    access = create_access_token(user["id"], user["email"], "member")
    set_auth_cookies(response, access, create_refresh_token(user["id"]))
    return {"token": access, "user": _member_public(user), "membership": _membership_state(user)}

@api_router.get("/member/me")
async def member_me(user: dict = Depends(get_current_user)):
    return {"user": _member_public(user), "membership": _membership_state(user)}


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str = Field(min_length=6, max_length=128)


def _hash_reset_token(t: str) -> str:
    return hashlib.sha256(t.encode("utf-8")).hexdigest()


async def _send_reset_email(user: dict, link: str):
    if not user or not user.get("email"):
        return
    try:
        subject, html, text = email_service.password_reset(user.get("name") or "", link)
        key = f"reset:{user.get('id')}:{datetime.now(timezone.utc).timestamp()}"
        await _email_send_once(key, user["email"], subject, html, text)
    except Exception as e:
        logger.warning(f"reset email send failed: {e}")


@api_router.post("/member/forgot-password")
async def member_forgot_password(payload: ForgotPasswordIn):
    """Always returns ok — never reveals whether the email exists."""
    email = payload.email.lower()
    user = await db.users.find_one({"email": email, "role": "member"})
    if user:
        raw = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one({
            "token_hash": _hash_reset_token(raw),
            "user_id": user["id"],
            "email": email,
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            "used": False,
            "created_at": now_iso(),
        })
        link = f"{PUBLIC_APP_URL.rstrip('/')}/sifre-sifirla?token={raw}"
        asyncio.create_task(_send_reset_email(user, link))
    return {"ok": True}


@api_router.post("/member/reset-password")
async def member_reset_password(payload: ResetPasswordIn):
    rec = await db.password_reset_tokens.find_one({"token_hash": _hash_reset_token(payload.token), "used": False})
    if not rec:
        raise HTTPException(status_code=400, detail="Bağlantı geçersiz veya daha önce kullanılmış.")
    try:
        expired = datetime.fromisoformat(rec["expires_at"]) < datetime.now(timezone.utc)
    except Exception:
        expired = True
    if expired:
        raise HTTPException(status_code=400, detail="Bağlantının süresi dolmuş. Lütfen yeniden talep edin.")
    await db.users.update_one({"id": rec["user_id"]}, {"$set": {"password": hash_password(payload.new_password)}})
    await db.password_reset_tokens.update_one({"_id": rec["_id"]}, {"$set": {"used": True, "used_at": now_iso()}})
    return {"ok": True}

@api_router.post("/member/subscribe")
async def member_subscribe(user: dict = Depends(get_current_user)):
    """DEMO subscription — no real charge. Extends paid access by 30 days."""
    now = datetime.now(timezone.utc)
    from_dt = now
    try:
        pu = datetime.fromisoformat(user["paid_until"]) if user.get("paid_until") else None
        if pu and pu > now:
            from_dt = pu
    except Exception:
        pass
    new_until = (from_dt + timedelta(days=30)).isoformat()
    await db.users.update_one({"id": user["id"]}, {"$set": {"paid_until": new_until}})
    user["paid_until"] = new_until
    await db.member_subscriptions.insert_one({
        "user_id": user["id"], "price": MEMBER_MONTHLY_PRICE, "currency": "TRY",
        "demo": True, "paid_until": new_until, "created_at": now.isoformat(),
    })
    return {"ok": True, "demo": True, "charged": MEMBER_MONTHLY_PRICE, "membership": _membership_state(user)}

@api_router.get("/vesikalik/ai-credits")
async def vesikalik_ai_credits(admin: dict = Depends(require_vesikalik_access)):
    """Remaining paid AI-garment credits + own-key/role status + pricing."""
    raw = _user_gemini_key(admin)
    role = admin.get("role")
    mode = "own_key" if raw else ("emergent" if role in ("admin", "staff") else "credits")
    return {
        "remaining": _ai_credits_of(admin),
        "total": DEFAULT_AI_CREDITS,
        "own_key": bool(raw),
        "masked": _mask_key(raw) if raw else None,
        "role": role,
        "mode": mode,
        "unit_price": float(_credit_unit_price()),
        "markup": float(AI_CREDIT_MARKUP),
        "currency": "TRY",
    }

@api_router.get("/vesikalik/credit-packages")
async def vesikalik_credit_packages(admin: dict = Depends(require_vesikalik_access)):
    """Available credit top-up packages (per-user). Price = 2x Emergent cost."""
    return {
        "currency": "TRY",
        "demo": True,
        "unit_price": _credit_unit_price(),
        "markup": AI_CREDIT_MARKUP,
        "packages": list(_credit_packages().values()),
    }

class CreditTopupIn(BaseModel):
    package_id: str

@api_router.post("/vesikalik/credits/topup")
async def vesikalik_credit_topup(payload: CreditTopupIn, admin: dict = Depends(require_vesikalik_access)):
    """DEMO top-up: add the selected package's credits to the user's balance.
    No real payment yet — can be replaced by a Stripe checkout later."""
    pkg = _credit_packages().get(payload.package_id)
    if not pkg:
        raise HTTPException(status_code=400, detail="Geçersiz paket")
    current = _ai_credits_of(admin)
    new_remaining = current + int(pkg["credits"])
    await db.users.update_one({"id": admin.get("id")}, {"$set": {"ai_credits": new_remaining}})
    await db.ai_credit_topups.insert_one({
        "user_id": admin.get("id"),
        "package_id": pkg["id"],
        "credits": pkg["credits"],
        "price": pkg["price"],
        "currency": "TRY",
        "demo": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"remaining": new_remaining, "added": pkg["credits"], "package": pkg}

@api_router.post("/vesikalik/ai-edit")
async def vesikalik_ai_edit(payload: VesikalikAiEditIn, admin: dict = Depends(require_vesikalik_access)):
    """Send the studio photo to Gemini Nano Banana for garment editing.
    Prompt is tightly constrained: only the clothing changes, face/hair/skin
    and biometric-safe background must stay untouched.
    """
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    import uuid as _uuid
    import asyncio as _asyncio

    # Strip a data URL prefix if the frontend sent one
    b64 = payload.image_base64
    if "," in b64 and b64.startswith("data:"):
        b64 = b64.split(",", 1)[1]

    gender_tr = "erkek" if payload.gender == "male" else "kadın"
    garment_labels = {
        "tshirt": "tişört",
        "polo": "polo yaka tişört",
        "shirt": "gömlek",
        "blazer": "ceket",
        "blouse": "bluz",
        "collared_blouse": "yakalı bluz",
    }
    garment_tr = garment_labels.get(payload.garment, payload.garment)
    collar_bit = ""
    if payload.collar == "collar":
        collar_bit = "Yakalı olsun. "
    elif payload.collar == "no_collar":
        collar_bit = "Yakasız / bisiklet yaka olsun. "

    color_bit = payload.color_name or payload.color

    system_msg = (
        "Sen profesyonel bir fotoğraf düzenleme aracısın. Verilen fotoğrafta "
        "SADECE istenen kıyafeti değiştir ve tam çözünürlükte düzenlenmiş "
        "fotoğrafı geri ver. Yüz, cilt, saç, arka plan hiçbir şekilde değişmemeli."
    )
    prompt = (
        f"Bu bir vesikalık/biyometrik portre fotoğrafıdır. Kişi {gender_tr}. "
        f"Sadece giydiği kıyafeti değiştir. Yüz, cilt, saç, gözler, kaşlar, "
        f"kulaklar ve tüm baş bölgesi kesinlikle aynı kalacak — hiçbir piksel "
        f"değişmeyecek. Arka planı da tamamen koru (biyometrik beyaz/açık "
        f"gri zemin). "
        f"Yeni kıyafet: {garment_tr}, rengi {color_bit}. {collar_bit}"
        f"Kumaş dokusu doğal, gölge ve ışık kişinin yüzündeki ışıkla uyumlu olsun. "
        f"Fotoğraf biyometrik standartlara uygun kalsın — kıyafet ile arka plan "
        f"birbirine karışmayacak yeterli kontrasta sahip olsun."
    )

    # --- BYOK path: user's own Google Gemini key → their quota, NO app credit ---
    own_key = _user_gemini_key(admin)
    if own_key:
        import base64 as _b64m
        try:
            img_bytes = _b64m.b64decode(b64)
        except Exception:
            raise HTTPException(status_code=400, detail="Görsel çözümlenemedi")
        full_prompt = f"{system_msg}\n\n{prompt}"
        try:
            out_b64, out_mime = await _asyncio.to_thread(
                _byok_image_edit_sync, own_key, img_bytes, "image/jpeg", full_prompt
            )
        except Exception as e:
            logger.exception("BYOK Gemini edit failed")
            raise HTTPException(status_code=502, detail=f"Kendi Gemini anahtarınız hata verdi: {str(e)[:200]}")
        if not out_b64:
            raise HTTPException(status_code=502, detail="AI görüntü üretmedi, farklı bir kıyafet/renk deneyin")
        return {"image_base64": out_b64, "mime_type": out_mime, "own_key": True}

    # --- App-pool path: Emergent key. Owner side (admin/staff) uses the owner's
    # Emergent balance WITHOUT consuming purchasable credits; site members
    # consume 1 purchased credit per edit (bought at 2x the Emergent cost). ---
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="AI anahtarı yapılandırılmamış")
    owner_side = admin.get("role") in ("admin", "staff")
    remaining = _ai_credits_of(admin)
    if not owner_side and remaining <= 0:
        raise HTTPException(status_code=402, detail="AI krediniz bitti. Kendi Gemini anahtarınızı bağlayın veya kredi yükleyin.")

    chat = LlmChat(
        api_key=key,
        session_id=f"vesikalik-{_uuid.uuid4()}",
        system_message=system_msg,
    ).with_model("gemini", "gemini-2.5-flash-image").with_params(modalities=["image", "text"])

    msg = UserMessage(text=prompt, file_contents=[ImageContent(b64)])
    try:
        _text, images = await chat.send_message_multimodal_response(msg)
    except Exception as e:
        # Bubble the real reason up so the frontend can show something useful
        logger.exception("Nano Banana clothing edit failed")
        raise HTTPException(status_code=502, detail=f"AI servisi hata verdi: {str(e)[:300]}")
    if not images:
        raise HTTPException(status_code=502, detail="AI görüntü üretmedi, farklı bir kıyafet/renk deneyin")
    out = images[0]
    await _track_feature(admin.get("id"), "ai_kiyafet")
    if owner_side:
        # Owner's own Emergent balance — no purchasable-credit deduction.
        return {"image_base64": out.get("data", ""), "mime_type": out.get("mime_type", "image/png"), "own_key": False, "emergent": True, "credits_remaining": remaining}
    new_remaining = max(0, remaining - 1)
    await _deduct_vesikalik_credits(admin, new_remaining)
    return {"image_base64": out.get("data", ""), "mime_type": out.get("mime_type", "image/png"), "own_key": False, "credits_remaining": new_remaining}


@api_router.get("/")
async def root():
    return {"service": "Fotuber API", "ok": True}


# ---------------------------------------------------------------------------
# Vesikalık Triple-Processing (3 foto paralel, bağımsız) + 20 fotoluk firma arşivi
# ---------------------------------------------------------------------------
def _vesikalik_prompt(gender, garment, collar, color, color_name):
    gender_tr = "erkek" if gender == "male" else "kadın"
    garment_labels = {"tshirt": "tişört", "polo": "polo yaka tişört", "shirt": "gömlek",
                      "blazer": "ceket", "blouse": "bluz", "collared_blouse": "yakalı bluz"}
    garment_tr = garment_labels.get(garment, garment)
    collar_bit = ""
    if collar == "collar":
        collar_bit = "Yakalı olsun. "
    elif collar == "no_collar":
        collar_bit = "Yakasız / bisiklet yaka olsun. "
    color_bit = color_name or color
    system_msg = (
        "Sen profesyonel bir fotoğraf düzenleme aracısın. Verilen fotoğrafta "
        "SADECE istenen kıyafeti değiştir ve tam çözünürlükte düzenlenmiş "
        "fotoğrafı geri ver. Yüz, cilt, saç, arka plan hiçbir şekilde değişmemeli."
    )
    prompt = (
        f"Bu bir vesikalık/biyometrik portre fotoğrafıdır. Kişi {gender_tr}. "
        f"Sadece giydiği kıyafeti değiştir. Yüz, cilt, saç, gözler, kaşlar, "
        f"kulaklar ve tüm baş bölgesi kesinlikle aynı kalacak. Arka planı da tamamen koru. "
        f"Yeni kıyafet: {garment_tr}, rengi {color_bit}. {collar_bit}"
        f"Kumaş dokusu doğal olsun, biyometrik standartlara uygun kalsın."
    )
    return system_msg, prompt


async def _vesikalik_edit_call(admin, b64, system_msg, prompt):
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    import uuid as _uuid, asyncio as _asyncio
    if "," in b64 and b64.startswith("data:"):
        b64 = b64.split(",", 1)[1]
    own_key = _user_gemini_key(admin)
    if own_key:
        import base64 as _b64m
        img_bytes = _b64m.b64decode(b64)
        out_b64, out_mime = await _asyncio.to_thread(
            _byok_image_edit_sync, own_key, img_bytes, "image/jpeg", f"{system_msg}\n\n{prompt}")
        if not out_b64:
            raise RuntimeError("AI görüntü üretmedi")
        return out_b64, out_mime
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise RuntimeError("AI anahtarı yapılandırılmamış")
    chat = LlmChat(api_key=key, session_id=f"vesikalik-{_uuid.uuid4()}", system_message=system_msg) \
        .with_model("gemini", "gemini-2.5-flash-image").with_params(modalities=["image", "text"])
    _text, images = await chat.send_message_multimodal_response(
        UserMessage(text=prompt, file_contents=[ImageContent(b64)]))
    if not images:
        raise RuntimeError("AI görüntü üretmedi")
    return images[0].get("data", ""), images[0].get("mime_type", "image/png")


async def _vesikalik_archive_save(owner_id, b64, mime, staff_name="", photo_type="", print_pref=""):
    import base64 as _b64m, uuid as _uuid
    if b64 and "," in b64 and b64.startswith("data:"):
        b64 = b64.split(",", 1)[1]
    try:
        data = _b64m.b64decode(b64) if b64 else b""
    except Exception:
        return None
    if not data:
        return None
    aid = str(_uuid.uuid4())
    path = f"vesikalik/archive/{owner_id}/{aid}.png"
    put_object(path, data, mime or "image/png")
    await db.vesikalik_archive.insert_one({
        "id": aid, "owner_id": owner_id, "path": path,
        "mime": mime or "image/png",
        "staff_name": staff_name or "", "photo_type": photo_type or "", "print_pref": print_pref or "",
        "created_at": now_iso(),
    })
    # keep only the last 20 (firm-wide)
    docs = await db.vesikalik_archive.find({"owner_id": owner_id}, {"_id": 0, "id": 1, "path": 1}) \
        .sort("created_at", -1).to_list(1000)
    for old in docs[20:]:
        await db.vesikalik_archive.delete_one({"id": old["id"]})
    return aid


def _staff_name(user: dict) -> str:
    return user.get("_emp_name") or user.get("firma_adi") or user.get("name") or ""


class VesikalikTripleItem(BaseModel):
    image_base64: str
    gender: str = "male"
    garment: str = "shirt"
    collar: str = ""
    color: str = ""
    color_name: str = ""
    photo_type: str = ""
    print_pref: str = ""


class VesikalikTripleIn(BaseModel):
    items: list[VesikalikTripleItem] = Field(default_factory=list)
    save_to_archive: bool = True


@api_router.post("/vesikalik/ai-edit-triple")
async def vesikalik_ai_edit_triple(payload: VesikalikTripleIn, admin: dict = Depends(require_vesikalik_access)):
    """Process up to 3 photos concurrently & independently (one failing won't block others)."""
    import asyncio as _asyncio
    items = payload.items[:3]
    if not items:
        raise HTTPException(status_code=400, detail="En az bir fotoğraf gerekli")
    owner_side = admin.get("role") in ("admin", "staff")
    byok = bool(_user_gemini_key(admin))
    remaining = _ai_credits_of(admin)
    if not owner_side and not byok and remaining < len(items):
        raise HTTPException(status_code=402, detail=f"Yeterli AI krediniz yok (gerekli: {len(items)}, mevcut: {remaining})")

    async def _one(it):
        system_msg, prompt = _vesikalik_prompt(it.gender, it.garment, it.collar, it.color, it.color_name)
        out_b64, mime = await _vesikalik_edit_call(admin, it.image_base64, system_msg, prompt)
        return out_b64, mime

    results = await _asyncio.gather(*[_one(it) for it in items], return_exceptions=True)
    out, success = [], 0
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            out.append({"index": i, "ok": False, "error": str(r)[:200]})
        else:
            success += 1
            entry = {"index": i, "ok": True, "image_base64": r[0], "mime_type": r[1]}
            if payload.save_to_archive:
                entry["archive_id"] = await _vesikalik_archive_save(
                    admin["id"], r[0], r[1],
                    staff_name=_staff_name(admin),
                    photo_type=items[i].photo_type, print_pref=items[i].print_pref)
            out.append(entry)

    credits_remaining = remaining
    if not owner_side and not byok and success > 0:
        credits_remaining = max(0, remaining - success)
        await _deduct_vesikalik_credits(admin, credits_remaining)
    await _track_feature(admin.get("id"), "ai_kiyafet_triple")
    return {"results": out, "success": success, "total": len(items),
            "credits_remaining": credits_remaining, "own_key": byok, "owner_side": owner_side}


@api_router.get("/vesikalik/archive")
async def vesikalik_archive_list(admin: dict = Depends(require_vesikalik_access)):
    docs = await db.vesikalik_archive.find({"owner_id": admin["id"]}, {"_id": 0}) \
        .sort("created_at", -1).to_list(30)
    return [{"id": d["id"], "url": f"/api/vesikalik/archive/{d['id']}/image",
             "staff_name": d.get("staff_name", ""), "photo_type": d.get("photo_type", ""),
             "print_pref": d.get("print_pref", ""), "created_at": d.get("created_at")} for d in docs]


class VesikalikArchiveSaveIn(BaseModel):
    image_base64: str
    mime: str = "image/png"
    photo_type: str = ""
    print_pref: str = ""


@api_router.post("/vesikalik/archive")
async def vesikalik_archive_add(payload: VesikalikArchiveSaveIn, admin: dict = Depends(require_vesikalik_access)):
    aid = await _vesikalik_archive_save(admin["id"], payload.image_base64, payload.mime,
                                        staff_name=_staff_name(admin),
                                        photo_type=payload.photo_type, print_pref=payload.print_pref)
    if not aid:
        raise HTTPException(status_code=400, detail="Görsel kaydedilemedi")
    return {"id": aid, "url": f"/api/vesikalik/archive/{aid}/image"}


@api_router.delete("/vesikalik/archive/{aid}")
async def vesikalik_archive_delete(aid: str, admin: dict = Depends(require_vesikalik_access)):
    r = await db.vesikalik_archive.delete_one({"id": aid, "owner_id": admin["id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Arşiv görseli bulunamadı")
    return {"ok": True}


@api_router.get("/vesikalik/archive/{aid}/image")
async def vesikalik_archive_image(aid: str):
    doc = await db.vesikalik_archive.find_one({"id": aid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Görsel bulunamadı")
    data, ctype = get_object(doc["path"])
    from starlette.responses import Response as _Resp
    return _Resp(content=data, media_type=doc.get("mime") or ctype or "image/png",
                 headers={"Cache-Control": "private, max-age=3600"})


# ---------------------------------------------------------------------------
# Golden Hour — AI shooting-spot suggestions (public, free) with distance
# ---------------------------------------------------------------------------
class GoldenSpotsIn(BaseModel):
    lat: float
    lng: float
    city: str = ""
    date: str = ""
    golden_time: str = ""


def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    import math
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)), 1)


@api_router.post("/golden-hour/ai-spots")
async def golden_hour_ai_spots(payload: GoldenSpotsIn):
    """AI suggests real photography spots near the selected coordinate + computes distance."""
    import json as _json
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="AI servisi yapılandırılmamış")
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    loc = payload.city or f"{payload.lat:.4f},{payload.lng:.4f}"
    sysmsg = (
        "Sen profesyonel bir fotoğrafçılık mekan danışmanısın. Verilen koordinata YAKIN, "
        "gerçek ve altın saat/gün batımı fotoğrafçılığı için ideal 5 çekim mekanı öner. "
        "SADECE geçerli JSON dizisi döndür, başka metin yok. Her öğe: "
        '{"name": "mekan adı", "description": "neden ideal (max 15 kelime, Türkçe)", '
        '"best_for": "portre|manzara|çift|aile", "lat": enlem_sayı, "lon": boylam_sayı}. '
        "lat/lon değerleri gerçek koordinatlara mümkün olduğunca yakın olmalı."
    )
    prompt = (
        f"Konum: {loc} (enlem {payload.lat}, boylam {payload.lng}). "
        f"Tarih: {payload.date or 'bugün'}. Altın saat: {payload.golden_time or 'gün batımı'}. "
        "Bu koordinata en yakın 5 çekim mekanını JSON dizi olarak ver."
    )
    try:
        chat = LlmChat(api_key=key, session_id=f"gh-spots-{new_id()}", system_message=sysmsg).with_model("gemini", "gemini-2.5-flash")
        resp = await chat.send_message(UserMessage(text=prompt))
        raw = (resp or "").strip()
        if raw.startswith("```"):
            raw = raw.split("```", 2)[1] if "```" in raw else raw
            raw = raw.replace("json", "", 1).strip() if raw.lower().startswith("json") else raw
        start, end = raw.find("["), raw.rfind("]")
        arr = _json.loads(raw[start:end + 1]) if start != -1 and end != -1 else []
    except Exception as e:
        logging.getLogger("fotuber").error(f"golden ai-spots error: {e}")
        raise HTTPException(status_code=502, detail="AI önerisi alınamadı, tekrar deneyin")
    out = []
    for s in arr[:6]:
        try:
            slat, slon = float(s.get("lat")), float(s.get("lon"))
            dist = _haversine_km(payload.lat, payload.lng, slat, slon)
            out.append({
                "name": str(s.get("name", "")).strip()[:80],
                "description": str(s.get("description", "")).strip()[:140],
                "best_for": str(s.get("best_for", "")).strip()[:20],
                "lat": slat, "lon": slon, "distance_km": dist,
                "maps_url": f"https://www.google.com/maps/dir/?api=1&destination={slat},{slon}",
            })
        except Exception:
            continue
    out.sort(key=lambda x: x["distance_km"])
    if not out:
        raise HTTPException(status_code=502, detail="Uygun mekan bulunamadı, tekrar deneyin")
    return {"spots": out}



# ---------------------------------------------------------------------------
# PayTR payment gateway (Turkey) — Link API (Basic)
# Replaces the earlier DEMO subscribe + credit top-up flows with real payments.
# We create a per-order payment link; PayTR notifies our callback on success.
# ---------------------------------------------------------------------------
PAYTR_MERCHANT_ID = os.environ.get("PAYTR_MERCHANT_ID", "")
PAYTR_MERCHANT_KEY = os.environ.get("PAYTR_MERCHANT_KEY", "")
PAYTR_MERCHANT_SALT = os.environ.get("PAYTR_MERCHANT_SALT", "")
PAYTR_LINK_CREATE_URL = "https://www.paytr.com/odeme/api/link/create"


def _paytr_link_token(name: str, price: str, currency: str, max_installment: str,
                      link_type: str, lang: str, min_count: str) -> str:
    required = name + price + currency + max_installment + link_type + lang + min_count
    digest = hmac.new(PAYTR_MERCHANT_KEY.encode(), (required + PAYTR_MERCHANT_SALT).encode(), hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def _paytr_callback_hash(callback_id: str, merchant_oid: str, pay_status: str, total_amount: str) -> str:
    msg = callback_id + merchant_oid + PAYTR_MERCHANT_SALT + pay_status + total_amount
    return base64.b64encode(hmac.new(PAYTR_MERCHANT_KEY.encode(), msg.encode(), hashlib.sha256).digest()).decode()


async def _grant_paid_order(order: dict):
    """Apply the entitlement (membership days or AI credits) for a paid order."""
    # Studio Suite: design rights top-up (owner is a studio_accounts doc, not db.users)
    if order.get("kind") == "studio_design_rights":
        sid = order.get("studio_id")
        rights = int(order.get("rights") or 0)
        if sid and rights > 0:
            await db.studio_accounts.update_one({"id": sid}, {"$inc": {"design_rights": rights}})
            await db.studio_design_purchases.insert_one({
                "studio_id": sid, "package_id": order.get("package_id"),
                "rights": rights, "price": order.get("price"), "currency": "TRY",
                "callback_id": order.get("callback_id"),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        return

    # Studio Suite: module purchase (Vesikalık / Etkinlik) — grant entitlement + set plan
    if order.get("kind") == "studio_module":
        sid = order.get("studio_id")
        mod = order.get("module")
        plan = order.get("plan")
        if sid and mod in ("vesikalik", "gallery"):
            acc = await db.studio_accounts.find_one({"id": sid}, {"_id": 0, "modules": 1})
            mods = (acc or {}).get("modules") or {"vesikalik": False, "gallery": False}
            mods[mod] = True
            await db.studio_accounts.update_one({"id": sid}, {"$set": {"modules": mods, "plan": plan}})
            await db.studio_module_purchases.insert_one({
                "studio_id": sid, "module": mod, "plan": plan, "price": order.get("price"),
                "discount": order.get("discount", 0), "currency": "TRY",
                "callback_id": order.get("callback_id"),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        return

    uid = order.get("user_id")
    user = await db.users.find_one({"id": uid})
    if not user:
        return
    now = datetime.now(timezone.utc)
    if order.get("kind") == "subscription":
        from_dt = now
        try:
            pu = datetime.fromisoformat(user["paid_until"]) if user.get("paid_until") else None
            if pu and pu > now:
                from_dt = pu
        except Exception:
            pass
        days = int(order.get("days") or 30)
        new_until = (from_dt + timedelta(days=days)).isoformat()
        plan = "yearly" if days >= 360 else "monthly"
        await db.users.update_one({"id": uid}, {"$set": {"paid_until": new_until, "plan": plan}})
        await db.member_subscriptions.insert_one({
            "user_id": uid, "price": order.get("price"), "currency": "TRY", "plan": plan, "days": days,
            "demo": False, "paytr": True, "callback_id": order.get("callback_id"),
            "paid_until": new_until, "created_at": now.isoformat(),
        })
        await _track_feature(uid, "abonelik")
    elif order.get("kind") == "invitation":
        iid = order.get("invitation_id")
        await db.invitations.update_one(
            {"id": iid, "owner_user_id": uid},
            {"$set": {"status": "published", "paid": True, "is_premium": True,
                      "published_at": now.isoformat(), "paid_price": order.get("price"),
                      "paid_callback_id": order.get("callback_id")}},
        )
        await _track_feature(uid, "davetiye_premium")
    elif order.get("kind") == "invitation_extend":
        iid = order.get("invitation_id")
        inv = await db.invitations.find_one({"id": iid, "owner_user_id": uid})
        if inv:
            new_exp = _invite_expires_at(inv.get("event_date"), extended=True)
            await db.invitations.update_one(
                {"id": iid, "owner_user_id": uid},
                {"$set": {"extended": True, "expires_at": new_exp,
                          "extend_paid_price": order.get("price"),
                          "extend_callback_id": order.get("callback_id")}},
            )
        await _track_feature(uid, "davetiye_uzatma")
    else:
        current = _ai_credits_of(user)
        await db.users.update_one({"id": uid}, {"$set": {"ai_credits": current + int(order.get("credits", 0))}})
        await db.ai_credit_topups.insert_one({
            "user_id": uid, "package_id": order.get("package_id"),
            "credits": order.get("credits"), "price": order.get("price"),
            "currency": "TRY", "demo": False, "paytr": True,
            "callback_id": order.get("callback_id"), "created_at": now.isoformat(),
        })
        await _track_feature(uid, "kredi_yukleme")


class PaytrCreateIn(BaseModel):
    kind: str  # "subscription" | "credits" | "invitation"
    period: str = "monthly"  # "monthly" | "yearly" (subscription only)
    package_id: Optional[str] = None
    invitation_id: Optional[str] = None  # invitation only
    origin_url: str = ""


@api_router.post("/payments/paytr/create")
async def paytr_create(payload: PaytrCreateIn, request: Request, user: dict = Depends(get_current_user)):
    """Create a PayTR payment link. Price/credits are server-defined — never trusted from the client."""
    import httpx as _httpx
    if not (PAYTR_MERCHANT_ID and PAYTR_MERCHANT_KEY and PAYTR_MERCHANT_SALT):
        raise HTTPException(status_code=500, detail="PayTR yapılandırılmamış")

    kind = payload.kind
    days = 0
    invitation_id = None
    if kind == "subscription":
        if payload.period == "yearly":
            price = float(MEMBER_YEARLY_PRICE)
            title = "Fotuber Vesikalik Yillik Uyelik"
            days = 365
        else:
            price = float(MEMBER_MONTHLY_PRICE)
            title = "Fotuber Vesikalik Aylik Uyelik"
            days = 30
        credits = 0
    elif kind == "credits":
        pkg = _credit_packages().get(payload.package_id or "")
        if not pkg:
            raise HTTPException(status_code=400, detail="Geçersiz paket")
        price = float(pkg["price"])
        title = f"{pkg['credits']} AI Kredisi (Fotuber Vesikalik)"
        credits = int(pkg["credits"])
    elif kind == "invitation":
        inv = await db.invitations.find_one({"id": payload.invitation_id or "", "owner_user_id": user.get("id")})
        if not inv:
            raise HTTPException(status_code=404, detail="Davetiye bulunamadı")
        if inv.get("paid") or inv.get("status") == "published":
            raise HTTPException(status_code=400, detail="Bu davetiye zaten yayında")
        pr = _invitation_pricing(inv.get("theme"), inv.get("sections"))
        if not pr["needs_payment"]:
            raise HTTPException(status_code=400, detail="Bu davetiye ücretsiz, ödeme gerekmez")
        price = float(pr["price"])
        title = "Fotuber Premium Dijital Davetiye" + (" + Foto Duvari" if pr["photowall"] else "")
        credits = 0
        invitation_id = inv["id"]
    elif kind == "invitation_extend":
        inv = await db.invitations.find_one({"id": payload.invitation_id or "", "owner_user_id": user.get("id")})
        if not inv:
            raise HTTPException(status_code=404, detail="Davetiye bulunamadı")
        if inv.get("extended"):
            raise HTTPException(status_code=400, detail="Bu davetiyenin süresi zaten uzatılmış")
        price = float(INVITE_EXTEND_PRICE)
        title = "Fotuber Davetiye Sure Uzatma 15 gun"
        credits = 0
        invitation_id = inv["id"]
    else:
        raise HTTPException(status_code=400, detail="Geçersiz işlem türü")

    price_kurus = str(int(round(price * 100)))
    cid = uuid.uuid4().hex  # our callback_id (alphanumeric, <=64)
    max_installment = "1"   # no installments → total_amount equals price
    currency = "TL"
    lang = "tr"
    link_type = "product"
    min_count = "1"

    token = _paytr_link_token(title, price_kurus, currency, max_installment, link_type, lang, min_count)
    # Build the notification URL from the live frontend origin (public, https, no port).
    origin = (payload.origin_url or "").strip().rstrip("/")
    if (not origin.startswith("http")) or origin.startswith("http://localhost") or origin.startswith("http://127."):
        origin = f"{request.base_url}".rstrip("/")
    origin = origin.replace("http://", "https://")
    callback_link = f"{origin}/api/payments/paytr-callback"

    post_data = {
        "merchant_id": PAYTR_MERCHANT_ID,
        "name": title,
        "price": price_kurus,
        "currency": currency,
        "max_installment": max_installment,
        "link_type": link_type,
        "lang": lang,
        "min_count": min_count,
        "max_count": "1",
        "callback_link": callback_link,
        "callback_id": cid,
        "debug_on": "1",
        "get_qr": "0",
        "paytr_token": token,
    }

    async with _httpx.AsyncClient(timeout=25) as http:
        r = await http.post(PAYTR_LINK_CREATE_URL, data=post_data,
                            headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        result = r.json()
    except Exception:
        raise HTTPException(status_code=502, detail=f"PayTR yanıtı okunamadı: {r.text[:200]}")
    if result.get("status") != "success":
        raise HTTPException(status_code=502, detail=result.get("err_msg") or result.get("reason") or "PayTR link oluşturulamadı")

    await db.payment_orders.insert_one({
        "callback_id": cid, "paytr_link_id": result.get("id"),
        "user_id": user.get("id"), "kind": kind, "days": days,
        "package_id": payload.package_id, "credits": credits,
        "invitation_id": invitation_id,
        "expected_amount": price_kurus, "currency": "TRY", "price": price,
        "callback_link": callback_link,
        "status": "pending", "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"callback_id": cid, "link": result.get("link"), "paytr_link_id": result.get("id")}


class DesignRightsPackageIn(BaseModel):
    name: str
    rights: int = Field(gt=0)
    price: float = Field(ge=0)
    active: bool = True
    sort: int = 0


@api_router.get("/admin/design-rights-packages")
async def admin_list_design_rights_packages(admin: dict = Depends(require_admin)):
    return await db.design_rights_packages.find({}, {"_id": 0}).sort("sort", 1).to_list(100)


@api_router.post("/admin/design-rights-packages")
async def admin_create_design_rights_package(payload: DesignRightsPackageIn, admin: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc.update({"id": new_id(), "created_at": now_iso()})
    await db.design_rights_packages.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/admin/design-rights-packages/{pid}")
async def admin_update_design_rights_package(pid: str, payload: DesignRightsPackageIn, admin: dict = Depends(require_admin)):
    r = await db.design_rights_packages.update_one({"id": pid}, {"$set": payload.model_dump()})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Paket bulunamadı")
    return await db.design_rights_packages.find_one({"id": pid}, {"_id": 0})


@api_router.delete("/admin/design-rights-packages/{pid}")
async def admin_delete_design_rights_package(pid: str, admin: dict = Depends(require_admin)):
    r = await db.design_rights_packages.delete_one({"id": pid})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Paket bulunamadı")
    return {"ok": True}


async def _create_paytr_order(title: str, price: float, origin_url: str, request_base_url, order_extra: dict) -> dict:
    """Shared PayTR Link API order creator. Reused by studio design-rights purchases.
    order_extra must carry ownership/grant fields (kind, studio_id/user_id, rights, package_id...)."""
    import httpx as _httpx
    if not (PAYTR_MERCHANT_ID and PAYTR_MERCHANT_KEY and PAYTR_MERCHANT_SALT):
        raise HTTPException(status_code=500, detail="PayTR yapılandırılmamış")
    price_kurus = str(int(round(float(price) * 100)))
    cid = uuid.uuid4().hex
    max_installment, currency, lang, link_type, min_count = "1", "TL", "tr", "product", "1"
    token = _paytr_link_token(title, price_kurus, currency, max_installment, link_type, lang, min_count)
    origin = (origin_url or "").strip().rstrip("/")
    if (not origin.startswith("http")) or origin.startswith("http://localhost") or origin.startswith("http://127."):
        origin = f"{request_base_url}".rstrip("/")
    origin = origin.replace("http://", "https://")
    callback_link = f"{origin}/api/payments/paytr-callback"
    post_data = {
        "merchant_id": PAYTR_MERCHANT_ID, "name": title, "price": price_kurus,
        "currency": currency, "max_installment": max_installment, "link_type": link_type,
        "lang": lang, "min_count": min_count, "max_count": "1",
        "callback_link": callback_link, "callback_id": cid,
        "debug_on": "1", "get_qr": "0", "paytr_token": token,
    }
    async with _httpx.AsyncClient(timeout=25) as http:
        r = await http.post(PAYTR_LINK_CREATE_URL, data=post_data,
                            headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        result = r.json()
    except Exception:
        raise HTTPException(status_code=502, detail=f"PayTR yanıtı okunamadı: {r.text[:200]}")
    if result.get("status") != "success":
        raise HTTPException(status_code=502, detail=result.get("err_msg") or result.get("reason") or "PayTR link oluşturulamadı")
    doc = {
        "callback_id": cid, "paytr_link_id": result.get("id"),
        "expected_amount": price_kurus, "currency": "TRY", "price": float(price),
        "callback_link": callback_link, "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    doc.update(order_extra or {})
    await db.payment_orders.insert_one(doc)
    return {"callback_id": cid, "link": result.get("link"), "paytr_link_id": result.get("id")}


@api_router.post("/payments/paytr-callback")
async def paytr_callback(request: Request):
    """Public PayTR Link API notification. Grants entitlement only after hash verification."""
    from fastapi.responses import PlainTextResponse
    form = await request.form()
    callback_id = str(form.get("callback_id", ""))
    merchant_oid = str(form.get("merchant_oid", ""))
    pay_status = str(form.get("status", ""))
    total_amount = str(form.get("total_amount", ""))
    received = str(form.get("hash", ""))

    if not callback_id or not received:
        raise HTTPException(status_code=400, detail="Geçersiz bildirim")
    expected = _paytr_callback_hash(callback_id, merchant_oid, pay_status, total_amount)
    if not hmac.compare_digest(expected, received):
        raise HTTPException(status_code=400, detail="PAYTR notification failed: bad hash")

    order = await db.payment_orders.find_one({"callback_id": callback_id})
    if not order:
        return PlainTextResponse("OK")
    if order.get("status") == "paid":
        return PlainTextResponse("OK")

    now = datetime.now(timezone.utc).isoformat()
    # Link API only notifies on success; guard anyway.
    if pay_status != "success":
        await db.payment_orders.update_one(
            {"callback_id": callback_id, "status": "pending"},
            {"$set": {"status": "failed", "callback": dict(form), "updated_at": now}},
        )
        return PlainTextResponse("OK")

    changed = await db.payment_orders.find_one_and_update(
        {"callback_id": callback_id, "status": "pending"},
        {"$set": {"status": "paid", "merchant_oid": merchant_oid, "paid_at": now,
                  "callback": dict(form), "updated_at": now}},
    )
    if changed:
        await _grant_paid_order(changed)
        asyncio.create_task(_send_payment_receipt(changed))
    return PlainTextResponse("OK")


@api_router.get("/payments/status/{callback_id}")
async def paytr_status(callback_id: str, user: dict = Depends(get_current_user)):
    order = await db.payment_orders.find_one({"callback_id": callback_id})
    if not order or order.get("user_id") != user.get("id"):
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    resp = {"callback_id": callback_id, "status": order.get("status"), "kind": order.get("kind")}
    if order.get("status") == "paid":
        fresh = await db.users.find_one({"id": user.get("id")})
        resp["membership"] = _membership_state(fresh)
        resp["ai_credits"] = _ai_credits_of(fresh)
    return resp


# ---------------------------------------------------------------------------
# Admin — Kişiler (Contacts) & Üyelikler (Memberships) reporting + CSV export
# ---------------------------------------------------------------------------
FEATURE_LABELS = {
    "abonelik": "Üyelik Aboneliği",
    "kredi_yukleme": "AI Kredi Yükleme",
    "ai_kiyafet": "AI Kıyafet/Renk",
    "byok": "Kendi Gemini Anahtarı",
    "randevu": "Randevu Oluşturma",
}


async def _build_membership_reports() -> list:
    """Rich per-member report: info, membership, purchases, appointments, features used."""
    members = await db.users.find({"role": "member"}).to_list(length=100000)
    subs = await db.member_subscriptions.find({}).to_list(length=100000)
    topups = await db.ai_credit_topups.find({"demo": {"$ne": True}}).to_list(length=100000)
    appts = await db.appointments.find({}, {
        "user_id": 1, "customer_email": 1, "customer_phone": 1, "date": 1, "status": 1, "_id": 0,
    }).to_list(length=100000)

    subs_by_user, topups_by_user = {}, {}
    for s in subs:
        subs_by_user.setdefault(s.get("user_id"), []).append(s)
    for t in topups:
        topups_by_user.setdefault(t.get("user_id"), []).append(t)

    def _member_appts(m):
        emails = {(m.get("email") or "").lower()}
        pnorm = _norm_phone(m.get("phone"))
        out = []
        for a in appts:
            if a.get("user_id") and a.get("user_id") == m.get("id"):
                out.append(a); continue
            if (a.get("customer_email") or "").lower() in emails and (a.get("customer_email")):
                out.append(a); continue
            if pnorm and _norm_phone(a.get("customer_phone")) == pnorm:
                out.append(a)
        return out

    reports = []
    for m in members:
        state = _membership_state(m)
        usubs = subs_by_user.get(m.get("id"), [])
        utops = topups_by_user.get(m.get("id"), [])
        total_spent = sum(float(s.get("price") or 0) for s in usubs) + sum(float(t.get("price") or 0) for t in utops)
        m_appts = _member_appts(m)
        feats = m.get("features_used") or []
        reports.append({
            "id": m.get("id"),
            "name": m.get("name"),
            "email": m.get("email"),
            "phone": m.get("phone"),
            "company_name": m.get("company_name") or "",
            "account_type": "firma" if (m.get("company_name") or "").strip() else "sahis",
            "created_at": m.get("created_at"),
            "last_active": m.get("last_active"),
            "status": state["status"],          # active | trial | expired
            "plan": m.get("plan") or ("trial" if state["status"] == "trial" else "none"),
            "paid_until": m.get("paid_until"),
            "trial_end": m.get("trial_end"),
            "trial_used_before": bool(m.get("trial_used_before")),
            "ai_credits": _ai_credits_of(m),
            "own_gemini_key": bool(m.get("gemini_api_key_enc")),
            "subscription_count": len(usubs),
            "credit_topup_count": len(utops),
            "credits_purchased": sum(int(t.get("credits") or 0) for t in utops),
            "total_spent": round(total_spent, 2),
            "appointment_count": len(m_appts),
            "has_appointment": len(m_appts) > 0,
            "features_used": feats,
            "features_labels": [FEATURE_LABELS.get(f, f) for f in feats],
        })
    return reports


def _membership_group_key(r: dict) -> str:
    if r["status"] == "trial":
        return "trial"
    if r["status"] == "active":
        return "yearly" if (r.get("plan") == "yearly") else "monthly"
    return "expired"


@api_router.get("/admin/memberships")
async def admin_memberships(admin: dict = Depends(require_admin)):
    """Admin-only. Everyone who registered a membership, grouped by membership type,
    with full info, purchases, appointment usage and features used."""
    reports = await _build_membership_reports()
    groups = {"trial": [], "monthly": [], "yearly": [], "expired": []}
    for r in reports:
        groups[_membership_group_key(r)].append(r)
    counts = {k: len(v) for k, v in groups.items()}
    counts["total"] = len(reports)
    return {
        "members": reports,
        "groups": groups,
        "counts": counts,
        "pricing": {"monthly": MEMBER_MONTHLY_PRICE, "yearly": MEMBER_YEARLY_PRICE, "currency": "TRY"},
        "feature_labels": FEATURE_LABELS,
    }


@api_router.get("/admin/contacts")
async def admin_contacts(admin: dict = Depends(require_admin)):
    """Admin-only. Everyone who left their info on the site: members (firma/şahıs),
    customers (site sign-up), and booking-form contacts (from appointments)."""
    users = await db.users.find({"role": {"$in": ["member", "customer"]}}).to_list(length=100000)
    appts = await db.appointments.find({}, {
        "customer_name": 1, "customer_phone": 1, "customer_email": 1, "phone_2": 1,
        "date": 1, "created_at": 1, "user_id": 1, "_id": 0,
    }).to_list(length=100000)

    members, customers = [], []
    known_phones = set()
    for u in users:
        pnorm = _norm_phone(u.get("phone"))
        if pnorm:
            known_phones.add(pnorm)
        base = {
            "id": u.get("id"), "name": u.get("name"), "email": u.get("email"),
            "phone": u.get("phone"), "created_at": u.get("created_at"),
        }
        if u.get("role") == "member":
            st = _membership_state(u)
            members.append({**base,
                "company_name": u.get("company_name") or "",
                "account_type": "firma" if (u.get("company_name") or "").strip() else "sahis",
                "status": st["status"], "plan": u.get("plan") or st["status"],
                "ai_credits": _ai_credits_of(u)})
        else:
            customers.append(base)

    # Booking contacts from appointments that are not tied to a known user phone.
    seen = set()
    booking_contacts = []
    for a in appts:
        pnorm = _norm_phone(a.get("customer_phone"))
        if pnorm and pnorm in known_phones:
            continue
        dedup = pnorm or (a.get("customer_email") or "").lower() or (a.get("customer_name") or "")
        if dedup in seen:
            continue
        seen.add(dedup)
        booking_contacts.append({
            "name": a.get("customer_name"), "phone": a.get("customer_phone"),
            "phone_2": a.get("phone_2") or "", "email": a.get("customer_email") or "",
            "last_date": a.get("date"), "created_at": a.get("created_at"),
        })

    return {
        "members": members,
        "customers": customers,
        "booking_contacts": booking_contacts,
        "counts": {"members": len(members), "customers": len(customers), "booking_contacts": len(booking_contacts)},
    }


@api_router.get("/admin/export")
async def admin_export(kind: str = "contacts", admin: dict = Depends(require_admin)):
    """CSV export. kind='contacts' → personal+contact info only.
    kind='memberships' → detailed membership report."""
    import csv, io
    from fastapi.responses import StreamingResponse
    buf = io.StringIO()
    w = csv.writer(buf)

    if kind == "memberships":
        reports = await _build_membership_reports()
        w.writerow([
            "Ad Soyad", "E-posta", "Telefon", "Firma", "Tip", "Üyelik Durumu", "Plan",
            "Bitiş", "Deneme Kullanıldı", "AI Kredi", "Kendi Anahtarı",
            "Abonelik Sayısı", "Kredi Yükleme Sayısı", "Satın Alınan Kredi", "Toplam Harcama (TRY)",
            "Randevu Sayısı", "Kullandığı Özellikler", "Kayıt Tarihi", "Son Aktiflik",
        ])
        for r in reports:
            w.writerow([
                r["name"], r["email"], r["phone"], r["company_name"], r["account_type"],
                r["status"], r["plan"], r["paid_until"] or r["trial_end"] or "",
                "Evet" if r["trial_used_before"] else "Hayır", r["ai_credits"],
                "Evet" if r["own_gemini_key"] else "Hayır", r["subscription_count"],
                r["credit_topup_count"], r["credits_purchased"], r["total_spent"],
                r["appointment_count"], ", ".join(r["features_labels"]),
                r["created_at"] or "", r["last_active"] or "",
            ])
        fname = "fotuber_uyelikler.csv"
    else:
        data = await _contacts_payload()
        w.writerow(["Tip", "Ad Soyad", "E-posta", "Telefon", "2. Telefon", "Firma", "Kayıt/Son Tarih"])
        for m in data["members"]:
            w.writerow(["Üye (" + m["account_type"] + ")", m["name"], m["email"], m["phone"], "", m.get("company_name", ""), m.get("created_at") or ""])
        for c in data["customers"]:
            w.writerow(["Müşteri", c["name"], c["email"], c["phone"], "", "", c.get("created_at") or ""])
        for b in data["booking_contacts"]:
            w.writerow(["Randevu Kişisi", b["name"], b["email"], b["phone"], b.get("phone_2", ""), "", b.get("last_date") or ""])
        fname = "fotuber_kisiler.csv"

    buf.seek(0)
    return StreamingResponse(
        iter(["\ufeff" + buf.getvalue()]),  # BOM for Excel Turkish chars
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )


async def _contacts_payload() -> dict:
    """Same aggregation as admin_contacts but callable internally (for CSV export)."""
    users = await db.users.find({"role": {"$in": ["member", "customer"]}}).to_list(length=100000)
    appts = await db.appointments.find({}, {
        "customer_name": 1, "customer_phone": 1, "customer_email": 1, "phone_2": 1,
        "date": 1, "created_at": 1, "_id": 0,
    }).to_list(length=100000)
    members, customers, known = [], [], set()
    for u in users:
        pnorm = _norm_phone(u.get("phone"))
        if pnorm:
            known.add(pnorm)
        base = {"name": u.get("name"), "email": u.get("email"), "phone": u.get("phone"), "created_at": u.get("created_at")}
        if u.get("role") == "member":
            members.append({**base, "company_name": u.get("company_name") or "",
                            "account_type": "firma" if (u.get("company_name") or "").strip() else "sahis"})
        else:
            customers.append(base)
    seen, booking = set(), []
    for a in appts:
        pnorm = _norm_phone(a.get("customer_phone"))
        if pnorm and pnorm in known:
            continue
        dedup = pnorm or (a.get("customer_email") or "").lower() or (a.get("customer_name") or "")
        if dedup in seen:
            continue
        seen.add(dedup)
        booking.append({"name": a.get("customer_name"), "phone": a.get("customer_phone"),
                        "phone_2": a.get("phone_2") or "", "email": a.get("customer_email") or "",
                        "last_date": a.get("date")})
    return {"members": members, "customers": customers, "booking_contacts": booking}


# ---------------------------------------------------------------------------
# Email — payment receipts + membership expiry reminders (Gmail SMTP)
# ---------------------------------------------------------------------------
PUBLIC_APP_URL = os.environ.get("PUBLIC_APP_URL", "https://fotuber.com.tr")
FRONTEND_PORTAL_PATH = "/vesikalik"


def _portal_url() -> str:
    return PUBLIC_APP_URL.rstrip("/") + FRONTEND_PORTAL_PATH


async def _email_send_once(notification_key: str, to: str, subject: str, html: str, text: str):
    """Idempotent send: a unique notification_key guards against duplicates."""
    if not email_service.email_configured() or not to:
        return
    try:
        await db.email_log.insert_one({
            "notification_key": notification_key, "to": to, "status": "pending",
            "subject": subject, "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:
        if getattr(exc, "code", None) == 11000:
            return  # already claimed/sent
        return
    try:
        await email_service.send_email(to, subject, html, text)
        await db.email_log.update_one({"notification_key": notification_key},
                                      {"$set": {"status": "sent", "sent_at": datetime.now(timezone.utc).isoformat()}})
    except Exception as exc:
        await db.email_log.update_one({"notification_key": notification_key},
                                      {"$set": {"status": "failed", "error": str(exc)[:400]}})


async def _send_payment_receipt(order: dict):
    user = await db.users.find_one({"id": order.get("user_id")})
    if not user or not user.get("email"):
        return
    ref = order.get("callback_id", "")
    amount = f"{float(order.get('price') or 0):.2f}₺"
    if order.get("kind") == "subscription":
        plan_label = "Yıllık Üyelik" if int(order.get("days") or 30) >= 360 else "Aylık Üyelik"
        until = (user.get("paid_until") or "")[:10]
        subject, html, text = email_service.receipt_subscription(user.get("name"), plan_label, amount, ref, until)
    elif order.get("kind") == "invitation":
        subject = "Fotuber · Premium Davetiye Ödemeniz Alındı"
        html = (f"<div style='font-family:Georgia,serif;color:#3a2a2d'><p>Merhaba {user.get('name') or ''},</p>"
                f"<p><b>{amount}</b> tutarındaki ödemeniz alınmıştır. Premium dijital davetiyeniz artık yayında! 🎉</p>"
                f"<p>Davetiyelerinizi <a href='{_portal_url()}/davetiyelerim'>Davetiyelerim</a> sayfasından yönetebilirsiniz.</p>"
                f"<p style='color:#8a6a6f;font-size:12px'>Referans: {ref}</p><p>Sevgiyle,<br/>Fotuber</p></div>")
        text = f"Merhaba, {amount} tutarindaki odemeniz alindi. Premium davetiyeniz yayinda. Ref: {ref} — Fotuber"
    elif order.get("kind") == "invitation_extend":
        subject = "Fotuber · Davetiye Süre Uzatma Ödemeniz Alındı"
        html = (f"<div style='font-family:Georgia,serif;color:#3a2a2d'><p>Merhaba {user.get('name') or ''},</p>"
                f"<p><b>{amount}</b> tutarındaki ödemeniz alınmıştır. Davetiye bağlantınız etkinlikten 15 gün sonrasına kadar uzatıldı. 🎉</p>"
                f"<p style='color:#8a6a6f;font-size:12px'>Referans: {ref}</p><p>Sevgiyle,<br/>Fotuber</p></div>")
        text = f"Merhaba, {amount} tutarindaki sure uzatma odemeniz alindi. Ref: {ref} — Fotuber"
    else:
        subject, html, text = email_service.receipt_credits(user.get("name"), int(order.get("credits") or 0), amount, ref)
    await _email_send_once(f"receipt:{ref}", user["email"], subject, html, text)


async def _send_welcome_email(user: dict, trial: bool):
    if not user or not user.get("email"):
        return
    subject, html, text = email_service.welcome_email(
        user.get("name"), trial, MEMBER_MONTHLY_PRICE, MEMBER_YEARLY_PRICE, _portal_url())
    await _email_send_once(f"welcome:{user.get('id')}", user["email"], subject, html, text)


async def _run_expiry_reminders() -> dict:
    from zoneinfo import ZoneInfo
    tz = ZoneInfo(email_service.EMAIL_TIMEZONE)
    today = datetime.now(tz).date()
    now = datetime.now(timezone.utc)
    portal = _portal_url()
    members = await db.users.find({"role": "member", "email": {"$ne": None}}).to_list(length=100000)
    sent = 0
    for m in members:
        field = "paid_until" if m.get("paid_until") else ("trial_end" if m.get("trial_end") else None)
        if not field:
            continue
        try:
            exp = datetime.fromisoformat(m[field])
        except Exception:
            continue
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp <= now:
            continue
        days = (exp.astimezone(tz).date() - today).days
        if days not in (7, 3):
            continue
        trial = field == "trial_end"
        key = f"expiry:{m['id']}:{field}:{exp.date()}:{days}"
        already = await db.email_log.find_one({"notification_key": key})
        if already:
            continue
        subject, html, text = email_service.expiry_reminder(
            m.get("name"), days, trial, MEMBER_MONTHLY_PRICE, MEMBER_YEARLY_PRICE, portal)
        await _email_send_once(key, m["email"], subject, html, text)
        sent += 1
    return {"checked": len(members), "sent": sent}


async def _membership_reminder_loop():
    """Every 6 hours check for members expiring in 7 or 3 days. Idempotent per day."""
    await asyncio.sleep(30)
    while True:
        try:
            if email_service.email_configured():
                res = await _run_expiry_reminders()
                if res.get("sent"):
                    logger.info(f"membership reminders sent: {res}")
        except Exception as e:
            logger.warning(f"reminder loop error: {e}")
        await asyncio.sleep(6 * 3600)


@api_router.post("/admin/email-test")
async def admin_email_test(payload: dict = Body(default={}), admin: dict = Depends(require_admin)):
    if not email_service.email_configured():
        raise HTTPException(status_code=400, detail="Gmail SMTP yapılandırılmamış (GMAIL_USER / GMAIL_APP_PASSWORD)")
    to = (payload or {}).get("email") or admin.get("email")
    subject, html, text = email_service.test_email()
    try:
        await email_service.send_email(to, subject, html, text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"E-posta gönderilemedi: {str(e)[:200]}")
    return {"sent": True, "to": to}


@api_router.post("/admin/send-reminders")
async def admin_send_reminders(admin: dict = Depends(require_admin)):
    if not email_service.email_configured():
        raise HTTPException(status_code=400, detail="Gmail SMTP yapılandırılmamış")
    return await _run_expiry_reminders()


@api_router.get("/admin/email-status")
async def admin_email_status(admin: dict = Depends(require_admin)):
    recent = await db.email_log.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=50)
    return {"configured": email_service.email_configured(), "provider": email_service.provider(),
            "sender": email_service.sender_address(), "recent": recent}


# ---------------------------------------------------------------------------
# Sektör Radarı (Agent Reach) — key-free daily internet scan + Turkish report
# ---------------------------------------------------------------------------
def _istanbul_today() -> str:
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo("Europe/Istanbul")).strftime("%Y-%m-%d")


async def _generate_and_store_trend_report() -> dict:
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="AI anahtarı yapılandırılmamış")
    settings = await db.site_settings.find_one({"id": "singleton"}, {"_id": 0}) or {}
    provider = os.environ.get("TREND_LLM_PROVIDER", "gemini")
    model = os.environ.get("TREND_LLM_MODEL", "gemini-2.5-flash")
    report = await trend_radar.generate_report(key, provider, model)
    date = _istanbul_today()
    doc = {
        "id": date,
        "date": date,
        "report": report,
        "sources_count": report.get("_sources_count", 0),
        "generated_at": now_iso(),
        "model": f"{provider}/{model}",
    }
    await db.trend_reports.update_one({"id": date}, {"$set": doc}, upsert=True)
    return doc


@api_router.get("/admin/trend-radar")
async def get_trend_radar(admin: dict = Depends(require_trend_access)):
    """Return today's cached report; if missing, the most recent one. Never blocks on generation."""
    date = _istanbul_today()
    doc = await db.trend_reports.find_one({"id": date}, {"_id": 0})
    if not doc:
        doc = await db.trend_reports.find_one({}, {"_id": 0}, sort=[("generated_at", -1)])
    st = await db.meta.find_one({"id": "trend_status"}, {"_id": 0}) or {}
    return {"report": doc, "today": date, "exists": bool(doc),
            "generating": bool(st.get("generating")), "error": st.get("error")}


async def _set_trend_status(**kw):
    kw["id"] = "trend_status"
    kw["updated_at"] = now_iso()
    await db.meta.update_one({"id": "trend_status"}, {"$set": kw}, upsert=True)


async def _generate_trend_bg():
    """Background generation — decoupled from the HTTP request so the ingress
    60s timeout never cancels it. Status is tracked in db.meta/trend_status."""
    await _set_trend_status(generating=True, error=None, started_at=now_iso())
    try:
        await asyncio.wait_for(_generate_and_store_trend_report(), timeout=150)
        await _set_trend_status(generating=False, error=None, finished_at=now_iso())
    except asyncio.TimeoutError:
        logger.warning("trend radar generation timed out")
        await _set_trend_status(generating=False, error="Zaman aşımı — servisler yavaş yanıt verdi, tekrar deneyin.", finished_at=now_iso())
    except Exception as e:
        logger.exception("trend radar background generation failed")
        await _set_trend_status(generating=False, error=str(e)[:200], finished_at=now_iso())


@api_router.post("/admin/trend-radar/refresh")
async def refresh_trend_radar(admin: dict = Depends(require_trend_access)):
    if not os.environ.get("EMERGENT_LLM_KEY"):
        raise HTTPException(status_code=500, detail="AI anahtarı yapılandırılmamış")
    st = await db.meta.find_one({"id": "trend_status"}, {"_id": 0})
    if st and st.get("generating"):
        return {"status": "generating"}
    asyncio.create_task(_generate_trend_bg())
    return {"status": "started"}


class PublishPackageIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: Optional[str] = ""
    price: float = 0


@api_router.post("/admin/trend-radar/publish-package")
async def publish_trend_package(payload: PublishPackageIn, admin: dict = Depends(require_trend_access)):
    """Create a DRAFT service (active=False) from a Sektör Radarı package idea.
    Admin reviews/activates + sets price & image in the Hizmetler panel."""
    doc = {
        "id": new_id(),
        "name": payload.name.strip()[:120],
        "description": (payload.description or "").strip(),
        "price": max(0, float(payload.price or 0)),
        "duration_hours": 2,
        "image_url": "",
        "active": False,
        "source": "trend_radar",
        "created_at": now_iso(),
    }
    await db.services.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def _trend_radar_loop():
    """Generate today's sector report once per day (checks every 6h). Idempotent per Istanbul date."""
    await asyncio.sleep(60)
    # Reset any stale 'generating' flag left over from a restart mid-generation
    try:
        await db.meta.update_one({"id": "trend_status", "generating": True},
                                 {"$set": {"generating": False, "error": "önceki işlem kesildi"}})
    except Exception:
        pass
    while True:
        try:
            date = _istanbul_today()
            exists = await db.trend_reports.find_one({"id": date}, {"_id": 1})
            st = await db.meta.find_one({"id": "trend_status"}, {"_id": 0})
            busy = bool(st and st.get("generating"))
            if not exists and not busy and os.environ.get("EMERGENT_LLM_KEY"):
                await _generate_trend_bg()
                logger.info(f"trend radar auto-generated for {date}")
        except Exception as e:
            logger.warning(f"trend radar loop error: {e}")
        await asyncio.sleep(6 * 3600)


# ---------------------------------------------------------------------------
# Digital Invitations (Dijital Davetiye) — build → publish (member) → share link/QR
# Guest page is standalone; RSVP requires name+surname; gift via creator's IBAN.
# ---------------------------------------------------------------------------
import re as _re
import invitation_pdf

INVITE_THEMES = ["romantic", "botanic", "gold", "sky", "noir", "royal", "ocean", "marble"]
INVITE_PREMIUM_THEMES = {"noir", "royal", "ocean", "marble"}
INVITE_EVENT_TYPES = ["dugun", "nisan", "kina", "sunnet", "dogumgunu", "nikah", "diger"]
INVITE_PREMIUM_PRICE = float(os.environ.get("INVITE_PREMIUM_PRICE", "250"))
INVITE_PHOTOWALL_PRICE = float(os.environ.get("INVITE_PHOTOWALL_PRICE", "500"))
INVITE_EXTEND_PRICE = float(os.environ.get("INVITE_EXTEND_PRICE", "99"))
INVITE_PHOTOWALL_MAX_GB = float(os.environ.get("INVITE_PHOTOWALL_MAX_GB", "75"))
INVITE_PHOTOWALL_MAX_BYTES = int(INVITE_PHOTOWALL_MAX_GB * 1024 * 1024 * 1024)


def _invitation_pricing(theme: str, sections: dict) -> dict:
    """Server-authoritative pricing. Print PDF is free. Premium DIGITAL invitations
    require a one-time PayTR payment (additive): premium theme = INVITE_PREMIUM_PRICE,
    plus the QR live photo+video wall = INVITE_PHOTOWALL_PRICE (added on top)."""
    photowall = bool((sections or {}).get("photowall"))
    premium_theme = theme in INVITE_PREMIUM_THEMES
    price = 0.0
    if premium_theme:
        price += INVITE_PREMIUM_PRICE
    if photowall:
        price += INVITE_PHOTOWALL_PRICE
    needs_payment = price > 0
    return {"needs_payment": needs_payment, "price": price,
            "premium_theme": premium_theme, "photowall": photowall,
            "premium_price": INVITE_PREMIUM_PRICE, "photowall_price": INVITE_PHOTOWALL_PRICE,
            "extend_price": INVITE_EXTEND_PRICE, "photowall_max_gb": INVITE_PHOTOWALL_MAX_GB,
            "currency": "TRY"}


def _slugify(text: str) -> str:
    tr = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")
    s = (text or "").translate(tr)
    s = _re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s[:40] or "davetiye"


def _invite_expires_at(event_date: str, extended: bool = False) -> str:
    try:
        d = datetime.fromisoformat(event_date)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
    except Exception:
        d = datetime.now(timezone.utc) + timedelta(days=90)
    if extended:
        return (d + timedelta(days=15, hours=23, minutes=59)).isoformat()
    # Free default: valid through the end of the event day only.
    return (d + timedelta(hours=23, minutes=59)).isoformat()


def _invite_public(doc: dict, owner: bool = False) -> dict:
    out = {
        "id": doc.get("id"), "slug": doc.get("slug"), "status": doc.get("status"),
        "event_type": doc.get("event_type"), "title": doc.get("title"),
        "person1": doc.get("person1"), "person2": doc.get("person2"),
        "event_date": doc.get("event_date"), "event_time": doc.get("event_time"),
        "venue_name": doc.get("venue_name"), "venue_address": doc.get("venue_address"),
        "map_url": doc.get("map_url"), "message": doc.get("message"),
        "theme": doc.get("theme"), "primary_color": doc.get("primary_color"),
        "cover_image_id": doc.get("cover_image_id"), "music_url": doc.get("music_url"),
        "greeting_audio_id": doc.get("greeting_audio_id"),
        "checkin_enabled": bool(doc.get("checkin_enabled")),
        "sections": doc.get("sections") or {},
        "gift": doc.get("gift") or {},
        "is_premium": bool(doc.get("is_premium")),
        "reveal_style": doc.get("reveal_style") or "",
        "reveal_opts": doc.get("reveal_opts") or {},
        "extended": bool(doc.get("extended")),
        "created_at": doc.get("created_at"), "expires_at": doc.get("expires_at"),
    }
    if owner:
        out["owner_user_id"] = doc.get("owner_user_id")
        out["price"] = doc.get("price")
        out["pricing"] = _invitation_pricing(doc.get("theme"), doc.get("sections"))
    return out


class InvitationIn(BaseModel):
    event_type: str = "dugun"
    title: Optional[str] = ""
    person1: str
    person2: Optional[str] = ""
    event_date: str  # YYYY-MM-DD
    event_time: Optional[str] = ""
    venue_name: Optional[str] = ""
    venue_address: Optional[str] = ""
    map_url: Optional[str] = ""
    message: Optional[str] = ""
    theme: str = "romantic"
    primary_color: Optional[str] = ""
    cover_image_id: Optional[str] = ""
    music_url: Optional[str] = ""
    greeting_audio_id: Optional[str] = ""
    reveal_style: Optional[str] = ""
    reveal_opts: Optional[dict] = None
    checkin_enabled: bool = False
    sections: Optional[dict] = None
    gift: Optional[dict] = None


class RsvpIn(BaseModel):
    name: str
    surname: str
    attending: bool = True
    guest_count: int = 1
    note: Optional[str] = ""
    guest_token: Optional[str] = ""
    rsvp_choice: Optional[str] = ""  # yes | no | maybe


class MemoryIn(BaseModel):
    name: str
    message: str


@api_router.post("/invitations/cover")
async def invitation_cover_upload(file: UploadFile = File(...)):
    ct = file.content_type or "image/jpeg"
    if not ct.startswith("image"):
        raise HTTPException(status_code=400, detail="Sadece görsel yüklenebilir")
    cid = new_id()
    ext = (file.filename or "jpg").split(".")[-1].lower()[:5]
    path = f"{APP_NAME}/invitations/{cid}.{ext}"
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Görsel en fazla 8MB olabilir")
    put_object(path, data, ct)
    await db.invitation_covers.insert_one({"id": cid, "storage_path": path, "content_type": ct,
                                           "created_at": now_iso()})
    return {"id": cid, "url": f"/api/invitations/cover/{cid}"}


@api_router.get("/invitations/cover/{cid}")
async def invitation_cover_get(cid: str):
    doc = await db.invitation_covers.find_one({"id": cid})
    if not doc:
        raise HTTPException(status_code=404, detail="Görsel bulunamadı")
    data, ct = get_object(doc["storage_path"])
    return StarletteResponse(content=data, media_type=doc.get("content_type", ct),
                             headers={"Cache-Control": "public, max-age=86400"})


@api_router.post("/invitations/audio")
async def invitation_audio_upload(file: UploadFile = File(...)):
    ct = file.content_type or "audio/mpeg"
    if not ct.startswith("audio"):
        raise HTTPException(status_code=400, detail="Sadece ses dosyası yüklenebilir")
    aid = new_id()
    ext = (file.filename or "mp3").split(".")[-1].lower()[:5]
    path = f"{APP_NAME}/invitations/audio/{aid}.{ext}"
    data = await file.read()
    if len(data) > 12 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Ses dosyası en fazla 12MB olabilir")
    put_object(path, data, ct)
    await db.invitation_covers.insert_one({"id": aid, "storage_path": path, "content_type": ct,
                                           "kind": "audio", "created_at": now_iso()})
    return {"id": aid, "url": f"/api/invitations/audio/{aid}"}


@api_router.get("/invitations/audio/{aid}")
async def invitation_audio_get(aid: str):
    doc = await db.invitation_covers.find_one({"id": aid})
    if not doc:
        raise HTTPException(status_code=404, detail="Ses bulunamadı")
    data, ct = get_object(doc["storage_path"])
    return StarletteResponse(content=data, media_type=doc.get("content_type", ct),
                             headers={"Cache-Control": "public, max-age=86400", "Accept-Ranges": "bytes"})


# ---- Print-ready invitation PDF (FREE, public) ----
class PrintInvitationIn(BaseModel):
    person1: str = ""
    person2: Optional[str] = ""
    event_type: str = "dugun"
    event_date: Optional[str] = ""
    event_time: Optional[str] = ""
    venue_name: Optional[str] = ""
    venue_address: Optional[str] = ""
    message: Optional[str] = ""
    size: str = "a5"
    bg_color: str = "#FFF7F0"
    accent_color: str = "#B76E79"
    text_color: str = "#4A2F33"
    symbol: str = "heart"
    qr_url: Optional[str] = ""


@api_router.post("/invitations/print-pdf")
async def invitation_print_pdf(payload: PrintInvitationIn):
    """Generate a high quality, print-ready PDF (3mm bleed, embedded fonts). Free for everyone."""
    if not (payload.person1 or "").strip():
        raise HTTPException(status_code=400, detail="En az bir isim gerekli")
    data = payload.dict()
    if data.get("size") not in invitation_pdf.SIZES:
        data["size"] = "a5"
    if data.get("symbol") not in invitation_pdf.SYMBOLS:
        data["symbol"] = "heart"
    try:
        pdf = invitation_pdf.render_invitation_pdf(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF oluşturulamadı: {str(e)[:200]}")
    fname = _slugify(f"{payload.person1}-{payload.person2}" if payload.person2 else payload.person1) or "davetiye"
    return StarletteResponse(content=pdf, media_type="application/pdf",
                             headers={"Content-Disposition": f"attachment; filename=davetiye-{fname}.pdf"})


@api_router.get("/invitations/print-options")
async def invitation_print_options():
    return {"sizes": [{"key": k, "label": v} for k, v in invitation_pdf.SIZE_LABELS.items()],
            "symbols": invitation_pdf.SYMBOLS,
            "event_types": [{"key": k, "label": v} for k, v in invitation_pdf.EVENT_LABELS.items()]}


# ---- Live guest photo wall ----
@api_router.post("/invitations/public/{slug}/photos")
async def upload_guest_photo(slug: str, file: UploadFile = File(...), uploader_name: str = Form("")):
    d = await _get_active_invitation(slug)
    ct = file.content_type or "image/jpeg"
    is_video = ct.startswith("video")
    if not (ct.startswith("image") or is_video):
        raise HTTPException(status_code=400, detail="Sadece fotoğraf veya video yüklenebilir")
    data = await file.read()
    max_one = (200 if is_video else 25) * 1024 * 1024
    if len(data) > max_one:
        raise HTTPException(status_code=400, detail=("Video en fazla 200MB olabilir" if is_video else "Görsel en fazla 25MB olabilir"))
    count = await db.invitation_photos.count_documents({"invitation_id": d["id"]})
    if count >= 3000:
        raise HTTPException(status_code=400, detail="Yükleme sınırına ulaşıldı")
    # Enforce total storage limit (75 GB) per invitation photo/video wall.
    agg = await db.invitation_photos.aggregate([
        {"$match": {"invitation_id": d["id"]}},
        {"$group": {"_id": None, "total": {"$sum": "$size"}}},
    ]).to_list(1)
    used = int((agg[0]["total"] if agg else 0) or 0)
    if used + len(data) > INVITE_PHOTOWALL_MAX_BYTES:
        raise HTTPException(status_code=400, detail=f"Foto duvarı depolama sınırına ({int(INVITE_PHOTOWALL_MAX_GB)} GB) ulaşıldı")
    pid = new_id()
    ext = (file.filename or ("mp4" if is_video else "jpg")).split(".")[-1].lower()[:5]
    path = f"{APP_NAME}/invitations/photos/{pid}.{ext}"
    put_object(path, data, ct)
    await db.invitation_photos.insert_one({
        "id": pid, "invitation_id": d["id"], "storage_path": path, "content_type": ct,
        "kind": "video" if is_video else "image", "size": len(data),
        "uploader_name": (uploader_name or "").strip()[:60], "created_at": now_iso(),
    })
    return {"ok": True, "id": pid, "kind": "video" if is_video else "image"}


@api_router.get("/invitations/public/{slug}/photos")
async def list_guest_photos(slug: str, since: Optional[str] = None):
    d = await db.invitations.find_one({"slug": slug, "status": "published"}, {"id": 1, "_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Davetiye bulunamadı")
    q = {"invitation_id": d["id"], "hidden": {"$ne": True}}
    if since:
        q["created_at"] = {"$gt": since}
    photos = await db.invitation_photos.find(q, {"_id": 0, "storage_path": 0}).sort("created_at", -1).to_list(length=1000)
    return {"photos": [{"id": p["id"], "uploader_name": p.get("uploader_name", ""), "kind": p.get("kind", "image"), "created_at": p.get("created_at")} for p in photos]}


@api_router.get("/invitations/{iid}/photos/manage")
async def manage_guest_photos(iid: str, user: dict = Depends(get_current_user)):
    """Owner-only: list ALL photos (including hidden) for moderation."""
    d = await db.invitations.find_one({"id": iid, "owner_user_id": user.get("id")}, {"id": 1, "_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Davetiye bulunamadı")
    photos = await db.invitation_photos.find({"invitation_id": iid}, {"_id": 0, "storage_path": 0}).sort("created_at", -1).to_list(length=1000)
    total = sum(int(p.get("size", 0) or 0) for p in photos)
    return {"photos": [{"id": p["id"], "uploader_name": p.get("uploader_name", ""),
                        "kind": p.get("kind", "image"), "size": int(p.get("size", 0) or 0),
                        "created_at": p.get("created_at"), "hidden": bool(p.get("hidden"))} for p in photos],
            "storage_used": total, "storage_limit": INVITE_PHOTOWALL_MAX_BYTES,
            "storage_limit_gb": INVITE_PHOTOWALL_MAX_GB}


class PhotoModerateIn(BaseModel):
    hidden: bool = True


@api_router.post("/invitations/{iid}/photos/{pid}/moderate")
async def moderate_guest_photo(iid: str, pid: str, payload: PhotoModerateIn, user: dict = Depends(get_current_user)):
    """Owner-only: hide or unhide a guest photo."""
    d = await db.invitations.find_one({"id": iid, "owner_user_id": user.get("id")}, {"id": 1, "_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Davetiye bulunamadı")
    r = await db.invitation_photos.update_one({"id": pid, "invitation_id": iid}, {"$set": {"hidden": bool(payload.hidden)}})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Fotoğraf bulunamadı")
    return {"ok": True, "hidden": bool(payload.hidden)}


@api_router.delete("/invitations/{iid}/photos/{pid}")
async def delete_guest_photo(iid: str, pid: str, user: dict = Depends(get_current_user)):
    """Owner-only: permanently delete a guest photo."""
    d = await db.invitations.find_one({"id": iid, "owner_user_id": user.get("id")}, {"id": 1, "_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Davetiye bulunamadı")
    doc = await db.invitation_photos.find_one({"id": pid, "invitation_id": iid})
    if not doc:
        raise HTTPException(status_code=404, detail="Fotoğraf bulunamadı")
    if doc.get("storage_path"):
        try:
            delete_object(doc["storage_path"])
        except Exception:
            pass
    await db.invitation_photos.delete_one({"id": pid})
    return {"ok": True}


@api_router.get("/invitations/photo/{pid}")
async def get_guest_photo(pid: str):
    doc = await db.invitation_photos.find_one({"id": pid})
    if not doc:
        raise HTTPException(status_code=404, detail="Fotoğraf bulunamadı")
    data, ct = get_object(doc["storage_path"])
    return StarletteResponse(content=data, media_type=doc.get("content_type", ct),
                             headers={"Cache-Control": "public, max-age=86400"})


@api_router.get("/invitations/{iid}/photos/download")
async def download_invitation_media(iid: str, user: dict = Depends(get_current_user)):
    """Owner-only: download ALL guest photos & videos of a photo wall as a single ZIP."""
    d = await db.invitations.find_one({"id": iid, "owner_user_id": user.get("id")}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Davetiye bulunamadı")
    docs = await db.invitation_photos.find({"invitation_id": iid}).sort("created_at", 1).to_list(5000)
    if not docs:
        raise HTTPException(status_code=404, detail="İndirilecek medya yok")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
        for i, up in enumerate(docs, 1):
            try:
                data, _ct = get_object(up["storage_path"])
                who = (up.get("uploader_name") or "misafir").replace("/", "_")[:30]
                ext = (up.get("storage_path") or "").split(".")[-1][:5] or ("mp4" if up.get("kind") == "video" else "jpg")
                folder = "videolar" if up.get("kind") == "video" else "fotograflar"
                zf.writestr(f"{folder}/{i:04d}_{who}.{ext}", data)
            except Exception:
                continue
    buf.seek(0)
    raw = f"{d.get('person1') or 'davetiye'}_{d.get('event_date') or ''}_foto-video.zip".replace(" ", "_")
    ascii_name = raw.encode("ascii", "ignore").decode("ascii") or "davetiye_medya.zip"
    return Response(content=buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{ascii_name}"'})


# ---- Optional QR door check-in ----
@api_router.get("/invitations/checkin/{token}")
async def checkin_info(token: str):
    r = await db.invitation_rsvps.find_one({"checkin_token": token}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Geçersiz giriş kodu")
    inv = await db.invitations.find_one({"id": r["invitation_id"]}, {"_id": 0, "person1": 1, "person2": 1, "id": 1})
    return {"name": r.get("name"), "surname": r.get("surname"), "guest_count": r.get("guest_count"),
            "attending": r.get("attending"), "checked_in": bool(r.get("checked_in")),
            "checked_in_at": r.get("checked_in_at"), "invitation_id": r.get("invitation_id"),
            "invitation": {"person1": inv.get("person1"), "person2": inv.get("person2")} if inv else {}}


@api_router.post("/invitations/checkin/{token}")
async def do_checkin(token: str, user: dict = Depends(get_current_user)):
    r = await db.invitation_rsvps.find_one({"checkin_token": token})
    if not r:
        raise HTTPException(status_code=404, detail="Geçersiz giriş kodu")
    inv = await db.invitations.find_one({"id": r["invitation_id"]})
    if not inv or inv.get("owner_user_id") != user.get("id"):
        raise HTTPException(status_code=403, detail="Bu davetiye size ait değil")
    if r.get("checked_in"):
        return {"ok": True, "already": True, "name": r.get("name"), "surname": r.get("surname")}
    await db.invitation_rsvps.update_one({"checkin_token": token},
                                         {"$set": {"checked_in": True, "checked_in_at": now_iso()}})
    return {"ok": True, "already": False, "name": r.get("name"), "surname": r.get("surname"), "guest_count": r.get("guest_count")}


@api_router.post("/invitations")
async def create_invitation(payload: InvitationIn, user: dict = Depends(get_current_user)):
    """Publish an invitation. Membership (a logged-in account) is required — this is the
    last step of the wizard. Returns the public slug + link."""
    now = now_iso()
    iid = new_id()
    base = _slugify(f"{payload.person1}-{payload.person2}" if payload.person2 else payload.person1)
    slug = f"{base}-{uuid.uuid4().hex[:6]}"
    default_sections = {"countdown": True, "map": True, "memories": True, "rsvp": True,
                        "photowall": False,
                        "gift": bool((payload.gift or {}).get("iban")), "music": bool(payload.music_url or payload.greeting_audio_id)}
    theme = payload.theme if payload.theme in INVITE_THEMES else "romantic"
    sections = {**default_sections, **(payload.sections or {})}
    pricing = _invitation_pricing(theme, sections)
    inv_status = "unpaid" if pricing["needs_payment"] else "published"
    doc = {
        "id": iid, "slug": slug, "owner_user_id": user.get("id"), "status": inv_status,
        "event_type": payload.event_type, "title": payload.title,
        "person1": payload.person1, "person2": payload.person2,
        "event_date": payload.event_date, "event_time": payload.event_time,
        "venue_name": payload.venue_name, "venue_address": payload.venue_address,
        "map_url": payload.map_url, "message": payload.message,
        "theme": theme,
        "primary_color": payload.primary_color, "cover_image_id": payload.cover_image_id,
        "music_url": payload.music_url, "greeting_audio_id": payload.greeting_audio_id,
        "checkin_enabled": bool(payload.checkin_enabled),
        "reveal_style": payload.reveal_style or "",
        "reveal_opts": payload.reveal_opts or {},
        "sections": sections,
        "gift": payload.gift or {},
        "is_premium": pricing["needs_payment"], "price": pricing["price"],
        "created_at": now, "published_at": (now if inv_status == "published" else None),
        "expires_at": _invite_expires_at(payload.event_date),
    }
    await db.invitations.insert_one(doc)
    return {"id": iid, "slug": slug, "url": f"/davetiye/{slug}",
            "requires_payment": pricing["needs_payment"], "price": pricing["price"],
            "pricing": pricing, "status": inv_status,
            "invitation": _invite_public(doc, owner=True)}


@api_router.get("/invitations")
async def my_invitations(user: dict = Depends(get_current_user)):
    docs = await db.invitations.find({"owner_user_id": user.get("id")}, {"_id": 0}).sort("created_at", -1).to_list(length=500)
    now = datetime.now(timezone.utc)
    out = []
    for d in docs:
        rc = await db.invitation_rsvps.count_documents({"invitation_id": d["id"]})
        yes = await db.invitation_rsvps.count_documents({"invitation_id": d["id"], "attending": True})
        mem = await db.invitation_memories.count_documents({"invitation_id": d["id"]})
        pub = _invite_public(d, owner=True)
        try:
            pub["expired"] = datetime.fromisoformat(d["expires_at"]) < now
        except Exception:
            pub["expired"] = False
        pub["stats"] = {"rsvp_total": rc, "rsvp_yes": yes, "memories": mem}
        out.append(pub)
    return {"invitations": out}


@api_router.get("/invitations/{iid}")
async def get_invitation(iid: str, user: dict = Depends(get_current_user)):
    d = await db.invitations.find_one({"id": iid, "owner_user_id": user.get("id")}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Davetiye bulunamadı")
    return _invite_public(d, owner=True)


@api_router.put("/invitations/{iid}")
async def update_invitation(iid: str, payload: InvitationIn, user: dict = Depends(get_current_user)):
    d = await db.invitations.find_one({"id": iid, "owner_user_id": user.get("id")})
    if not d:
        raise HTTPException(status_code=404, detail="Davetiye bulunamadı")
    upd = payload.dict()
    upd["theme"] = upd["theme"] if upd["theme"] in INVITE_THEMES else "romantic"
    upd["sections"] = {**(d.get("sections") or {}), **(payload.sections or {})}
    new_pricing = _invitation_pricing(upd["theme"], upd["sections"])
    already_paid = bool(d.get("paid"))
    upd["is_premium"] = new_pricing["needs_payment"]
    upd["price"] = new_pricing["price"]
    upd["status"] = "published" if (not new_pricing["needs_payment"] or already_paid) else "unpaid"
    upd["extended"] = bool(d.get("extended"))
    upd["expires_at"] = _invite_expires_at(payload.event_date, extended=bool(d.get("extended")))
    upd["updated_at"] = now_iso()
    await db.invitations.update_one({"id": iid}, {"$set": upd})
    fresh = await db.invitations.find_one({"id": iid}, {"_id": 0})
    return _invite_public(fresh, owner=True)


@api_router.delete("/invitations/{iid}")
async def delete_invitation(iid: str, user: dict = Depends(get_current_user)):
    r = await db.invitations.delete_one({"id": iid, "owner_user_id": user.get("id")})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Davetiye bulunamadı")
    await db.invitation_rsvps.delete_many({"invitation_id": iid})
    await db.invitation_memories.delete_many({"invitation_id": iid})
    return {"ok": True}


@api_router.get("/invitations/public/{slug}")
async def public_invitation(slug: str):
    d = await db.invitations.find_one({"slug": slug, "status": "published"}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Davetiye bulunamadı")
    try:
        if datetime.fromisoformat(d["expires_at"]) < datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="Bu davetiyenin süresi dolmuştur")
    except HTTPException:
        raise
    except Exception:
        pass
    return _invite_public(d, owner=False)


async def _get_active_invitation(slug: str) -> dict:
    d = await db.invitations.find_one({"slug": slug, "status": "published"})
    if not d:
        raise HTTPException(status_code=404, detail="Davetiye bulunamadı")
    try:
        if datetime.fromisoformat(d["expires_at"]) < datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="Bu davetiyenin süresi dolmuştur")
    except HTTPException:
        raise
    except Exception:
        pass
    return d


@api_router.post("/invitations/public/{slug}/rsvp")
async def submit_rsvp(slug: str, payload: RsvpIn):
    if not payload.name.strip() or not payload.surname.strip():
        raise HTTPException(status_code=400, detail="Ad ve soyad zorunludur")
    d = await _get_active_invitation(slug)
    token = uuid.uuid4().hex[:12]
    choice = (payload.rsvp_choice or "").strip().lower()
    if choice not in ("yes", "no", "maybe"):
        choice = "yes" if payload.attending else "no"
    attending = choice == "yes"
    # Link to a pre-added guest (personalized link) → auto side + status tracking.
    guest = None
    side = ""
    if (payload.guest_token or "").strip():
        guest = await db.invitation_guests.find_one({"invitation_id": d["id"], "guest_token": payload.guest_token.strip()})
        if guest:
            side = guest.get("side") or ""
    rec = {
        "id": new_id(), "invitation_id": d["id"], "name": payload.name.strip(),
        "surname": payload.surname.strip(), "attending": attending, "rsvp_choice": choice,
        "guest_count": max(1, int(payload.guest_count or 1)) if attending else 0, "note": (payload.note or "").strip(),
        "side": side, "guest_id": guest.get("id") if guest else None,
        "checkin_token": token, "checked_in": False, "checked_in_at": None,
        "created_at": now_iso(),
    }
    await db.invitation_rsvps.insert_one(rec)
    if guest:
        await db.invitation_guests.update_one(
            {"id": guest["id"]},
            {"$set": {"rsvp_status": choice,
                      "guest_count": max(1, int(payload.guest_count or 1)) if attending else 0,
                      "rsvp_at": now_iso()}},
        )
    resp = {"ok": True}
    if d.get("checkin_enabled") and payload.attending:
        resp["checkin_token"] = token
    return resp


@api_router.post("/invitations/public/{slug}/memory")
async def submit_memory(slug: str, payload: MemoryIn):
    if not payload.name.strip() or not payload.message.strip():
        raise HTTPException(status_code=400, detail="İsim ve mesaj zorunludur")
    d = await _get_active_invitation(slug)
    rec = {"id": new_id(), "invitation_id": d["id"], "name": payload.name.strip(),
           "message": payload.message.strip()[:1000], "created_at": now_iso()}
    await db.invitation_memories.insert_one(rec)
    return {"ok": True}


@api_router.get("/invitations/public/{slug}/memories")
async def public_memories(slug: str):
    d = await db.invitations.find_one({"slug": slug, "status": "published"}, {"id": 1, "_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Davetiye bulunamadı")
    mems = await db.invitation_memories.find(
        {"invitation_id": d["id"]}, {"_id": 0, "invitation_id": 0}
    ).sort("created_at", -1).to_list(length=200)
    return {"memories": mems}


@api_router.get("/invitations/{iid}/report")
async def invitation_report(iid: str, user: dict = Depends(get_current_user)):
    d = await db.invitations.find_one({"id": iid, "owner_user_id": user.get("id")}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Davetiye bulunamadı")
    rsvps = await db.invitation_rsvps.find({"invitation_id": iid}, {"_id": 0}).sort("created_at", -1).to_list(length=100000)
    memories = await db.invitation_memories.find({"invitation_id": iid}, {"_id": 0}).sort("created_at", -1).to_list(length=100000)
    yes = [r for r in rsvps if r.get("rsvp_choice") == "yes" or (r.get("rsvp_choice") in (None, "") and r.get("attending"))]
    maybe = [r for r in rsvps if r.get("rsvp_choice") == "maybe"]
    no = [r for r in rsvps if r not in yes and r not in maybe]
    heads = sum(int(r.get("guest_count") or 1) for r in yes)
    checked = sum(1 for r in rsvps if r.get("checked_in"))
    def _side(sd):
        sy = [r for r in yes if (r.get("side") or "") == sd]
        sn = [r for r in no if (r.get("side") or "") == sd]
        sm = [r for r in maybe if (r.get("side") or "") == sd]
        return {"attending": len(sy), "declined": len(sn), "maybe": len(sm),
                "guests": sum(int(r.get("guest_count") or 1) for r in sy)}
    guest_count = await db.invitation_guests.count_documents({"invitation_id": iid})
    return {
        "invitation": _invite_public(d, owner=True),
        "rsvps": rsvps, "memories": memories,
        "stats": {"rsvp_total": len(rsvps), "attending": len(yes), "declined": len(no), "maybe": len(maybe),
                  "total_guests": heads, "memories": len(memories), "checked_in": checked,
                  "guest_list_total": guest_count,
                  "by_side": {"gelin": _side("gelin"), "damat": _side("damat")}},
    }


@api_router.get("/invitations/{iid}/report.csv")
async def invitation_report_csv(iid: str, user: dict = Depends(get_current_user)):
    import csv, io
    from fastapi.responses import StreamingResponse
    d = await db.invitations.find_one({"id": iid, "owner_user_id": user.get("id")}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Davetiye bulunamadı")
    rsvps = await db.invitation_rsvps.find({"invitation_id": iid}, {"_id": 0}).sort("created_at", -1).to_list(length=100000)
    buf = io.StringIO(); w = csv.writer(buf)
    w.writerow(["Ad", "Soyad", "Katılım", "Kişi Sayısı", "Not", "Tarih"])
    for r in rsvps:
        w.writerow([r.get("name"), r.get("surname"), "Geliyor" if r.get("attending") else "Gelemiyor",
                    r.get("guest_count"), r.get("note"), (r.get("created_at") or "")[:16]])
    buf.seek(0)
    return StreamingResponse(iter(["\ufeff" + buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f"attachment; filename=davetiye_{d.get('slug')}.csv"})


# ---------------------------------------------------------------------------
# Guest management: Bride/Groom side, contacts import (manual/paste/vCard/Contact-Picker/QR),
# one-click WhatsApp send, and side-based auto RSVP tracking.
# ---------------------------------------------------------------------------
class GuestIn(BaseModel):
    name: str = ""
    phone: Optional[str] = ""
    side: Optional[str] = ""  # "gelin" | "damat" | ""
    role: Optional[str] = ""  # gelin_anne|gelin_baba|damat_anne|damat_baba|"" (special people)


class GuestBulkIn(BaseModel):
    side: Optional[str] = ""
    guests: List[GuestIn] = []


class GuestPatchIn(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    side: Optional[str] = None
    role: Optional[str] = None
    rsvp_status: Optional[str] = None  # pending|yes|no (manual override)
    invited: Optional[bool] = None


ROLE_SIDE = {"gelin_anne": "gelin", "gelin_baba": "gelin", "damat_anne": "damat", "damat_baba": "damat"}


def _guest_public(g: dict) -> dict:
    return {
        "id": g.get("id"), "name": g.get("name"), "phone": g.get("phone"),
        "phone_norm": g.get("phone_norm"), "side": g.get("side") or "",
        "role": g.get("role") or "",
        "guest_token": g.get("guest_token"),
        "rsvp_status": g.get("rsvp_status") or "pending",
        "guest_count": g.get("guest_count") or 0,
        "invited": bool(g.get("invited")), "wa_sent_at": g.get("wa_sent_at"),
        "created_at": g.get("created_at"),
    }


async def _owned_invitation(iid: str, user: dict) -> dict:
    d = await db.invitations.find_one({"id": iid, "owner_user_id": user.get("id")}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Davetiye bulunamadı")
    return d


async def _add_guests(iid: str, side: str, rows: list) -> int:
    side = side if side in ("gelin", "damat") else ""
    existing = await db.invitation_guests.find({"invitation_id": iid}, {"phone_norm": 1}).to_list(20000)
    seen = {e.get("phone_norm") for e in existing if e.get("phone_norm")}
    added = 0
    for r in rows:
        name = (r.get("name") or "").strip()[:80]
        phone = (r.get("phone") or "").strip()[:30]
        pn = _norm_phone(phone)
        if not name and not pn:
            continue
        if pn and pn in seen:
            continue
        if pn:
            seen.add(pn)
        row_side = r.get("side") if r.get("side") in ("gelin", "damat") else side
        role = (r.get("role") or "").strip()
        if role not in ROLE_SIDE:
            role = ""
        if role and row_side not in ("gelin", "damat"):
            row_side = ROLE_SIDE[role]
        await db.invitation_guests.insert_one({
            "id": new_id(), "invitation_id": iid, "name": name or pn,
            "phone": phone, "phone_norm": pn, "side": row_side, "role": role,
            "guest_token": uuid.uuid4().hex[:10], "rsvp_status": "pending",
            "guest_count": 0, "invited": False, "wa_sent_at": None,
            "created_at": now_iso(),
        })
        added += 1
    return added


@api_router.get("/invitations/{iid}/guests")
async def list_guests(iid: str, user: dict = Depends(get_current_user)):
    await _owned_invitation(iid, user)
    guests = await db.invitation_guests.find({"invitation_id": iid}).sort("created_at", 1).to_list(20000)
    items = [_guest_public(g) for g in guests]

    def _c(side, st=None):
        return sum(1 for g in items if (side is None or g["side"] == side) and (st is None or g["rsvp_status"] == st))

    summary = {}
    for side in ("gelin", "damat", ""):
        summary[side or "belirsiz"] = {"total": _c(side), "yes": _c(side, "yes"),
                                       "no": _c(side, "no"), "maybe": _c(side, "maybe"), "pending": _c(side, "pending")}
    summary["all"] = {"total": len(items), "yes": _c(None, "yes"),
                      "no": _c(None, "no"), "maybe": _c(None, "maybe"), "pending": _c(None, "pending")}
    return {"guests": items, "summary": summary}


@api_router.post("/invitations/{iid}/guests")
async def add_guest(iid: str, payload: GuestIn, user: dict = Depends(get_current_user)):
    await _owned_invitation(iid, user)
    n = await _add_guests(iid, payload.side or "", [payload.dict()])
    return {"ok": True, "added": n}


@api_router.post("/invitations/{iid}/guests/bulk")
async def add_guests_bulk(iid: str, payload: GuestBulkIn, user: dict = Depends(get_current_user)):
    await _owned_invitation(iid, user)
    n = await _add_guests(iid, payload.side or "", [g.dict() for g in (payload.guests or [])])
    return {"ok": True, "added": n}


@api_router.patch("/invitations/{iid}/guests/{gid}")
async def update_guest(iid: str, gid: str, payload: GuestPatchIn, user: dict = Depends(get_current_user)):
    await _owned_invitation(iid, user)
    upd = {}
    if payload.name is not None:
        upd["name"] = payload.name.strip()[:80]
    if payload.phone is not None:
        upd["phone"] = payload.phone.strip()[:30]
        upd["phone_norm"] = _norm_phone(payload.phone)
    if payload.side is not None:
        upd["side"] = payload.side if payload.side in ("gelin", "damat") else ""
    if payload.role is not None:
        role = payload.role if payload.role in ROLE_SIDE else ""
        upd["role"] = role
        if role:
            upd["side"] = ROLE_SIDE[role]
    if payload.rsvp_status is not None and payload.rsvp_status in ("pending", "yes", "no"):
        upd["rsvp_status"] = payload.rsvp_status
    if payload.invited is not None:
        upd["invited"] = bool(payload.invited)
    if not upd:
        return {"ok": True}
    r = await db.invitation_guests.update_one({"id": gid, "invitation_id": iid}, {"$set": upd})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Misafir bulunamadı")
    return {"ok": True}


@api_router.post("/invitations/{iid}/guests/{gid}/sent")
async def mark_guest_sent(iid: str, gid: str, user: dict = Depends(get_current_user)):
    await _owned_invitation(iid, user)
    await db.invitation_guests.update_one({"id": gid, "invitation_id": iid},
                                          {"$set": {"invited": True, "wa_sent_at": now_iso()}})
    return {"ok": True}


@api_router.delete("/invitations/{iid}/guests/{gid}")
async def delete_guest(iid: str, gid: str, user: dict = Depends(get_current_user)):
    await _owned_invitation(iid, user)
    await db.invitation_guests.delete_one({"id": gid, "invitation_id": iid})
    return {"ok": True}


# ---- QR phone import: phone has no login; a short-lived token authorizes the upload ----
@api_router.post("/invitations/{iid}/import-token")
async def create_import_token(iid: str, user: dict = Depends(get_current_user)):
    await _owned_invitation(iid, user)
    token = secrets.token_urlsafe(9)
    expires = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    await db.invitations.update_one({"id": iid}, {"$set": {"import_token": token, "import_token_expires": expires}})
    return {"token": token, "expires_at": expires}


@api_router.get("/invitations/import/{token}")
async def import_token_info(token: str):
    d = await db.invitations.find_one({"import_token": token}, {"_id": 0})
    if not d or (d.get("import_token_expires") or "") < now_iso():
        raise HTTPException(status_code=410, detail="Bağlantı süresi doldu")
    return {"invitation_id": d["id"], "person1": d.get("person1"),
            "person2": d.get("person2"), "slug": d.get("slug")}


@api_router.post("/invitations/import/{token}/guests")
async def import_token_guests(token: str, payload: GuestBulkIn):
    d = await db.invitations.find_one({"import_token": token})
    if not d or (d.get("import_token_expires") or "") < now_iso():
        raise HTTPException(status_code=410, detail="Bağlantı süresi doldu")
    n = await _add_guests(d["id"], payload.side or "", [g.dict() for g in (payload.guests or [])])
    return {"ok": True, "added": n}


# Register the router
app.include_router(api_router)

# ---------------------------------------------------------------------------
# Additive modules (Session X): Davetiye Tasarım Stüdyosu + Stüdyo Paneli
# Mounted via factory functions to avoid circular imports. Existing routes untouched.
# ---------------------------------------------------------------------------
from routers import design_studio as _design_studio
from routers import studio as _studio
from routers import gallery as _gallery

_module_deps = {
    "hash_password": hash_password,
    "verify_password": verify_password,
    "create_access_token": create_access_token,
    "create_refresh_token": create_refresh_token,
    "set_auth_cookies": set_auth_cookies,
    "clear_auth_cookies": clear_auth_cookies,
    "get_current_user": get_current_user,
    "new_id": new_id,
    "now_iso": now_iso,
    "put_object": put_object,
    "get_object": get_object,
    "delete_object": delete_object,
    "create_paytr_order": _create_paytr_order,
    "send_email": email_service.send_email,
    "email_configured": email_service.email_configured,
    "JWT_SECRET": JWT_SECRET,
    "JWT_ALGORITHM": JWT_ALGORITHM,
}
app.include_router(_design_studio.get_router(db, _module_deps))
app.include_router(_studio.get_router(db, _module_deps))
app.include_router(_gallery.get_router(db, _module_deps))


# CORS - allow credentials with reflected origin
_origins = os.environ.get("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("fotuber")
