from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import asyncio
import uuid
import bcrypt
import jwt
import requests
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import (
    FastAPI, APIRouter, HTTPException, Depends, Request, Response, status,
    UploadFile, File, Form, Query, Header,
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
    time: str  # HH:MM (opening one-hour slot)
    notes: Optional[str] = ""
    contract_accepted: bool = False


class AppointmentAdminUpdate(BaseModel):
    status: Optional[Literal["pending", "approved", "cancelled"]] = None
    deposit_amount: Optional[float] = None
    total_amount: Optional[float] = None
    paid_amount: Optional[float] = None
    notes: Optional[str] = None


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
    init_storage()

    # Start background cleanup task (deletes expired guest uploads once an hour)
    asyncio.create_task(_cleanup_expired_uploads())

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
OPENING_HOUR = 9
CLOSING_HOUR = 20  # last slot start 19:00
SLOTS = [f"{h:02d}:00" for h in range(OPENING_HOUR, CLOSING_HOUR)]


@api_router.get("/availability")
async def availability(date: str):
    """Return list of slots with status per date."""
    # approved appointments block
    approved = await db.appointments.find(
        {"date": date, "status": "approved"}, {"_id": 0, "time": 1}
    ).to_list(200)
    blocked = await db.blocked_slots.find({"date": date}, {"_id": 0, "time": 1}).to_list(200)

    booked_times = {a["time"] for a in approved} | {b["time"] for b in blocked}
    result = []
    now = datetime.now(timezone.utc)
    for t in SLOTS:
        # mark past times as booked (cannot select)
        try:
            slot_dt = datetime.fromisoformat(f"{date}T{t}:00+00:00")
        except Exception:
            slot_dt = now
        past = slot_dt < now - timedelta(hours=1)
        result.append({
            "time": t,
            "status": "booked" if (t in booked_times or past) else "available",
        })
    return {"date": date, "slots": result}


# ---------------------------------------------------------------------------
# Appointments
# ---------------------------------------------------------------------------
async def _enrich_appointment(a: dict) -> dict:
    if not a:
        return a
    a.pop("_id", None)
    svc = await db.services.find_one({"id": a.get("service_id")}, {"_id": 0, "name": 1, "price": 1})
    a["service_name"] = svc["name"] if svc else "Bilinmeyen Hizmet"
    a["service_price"] = svc["price"] if svc else 0
    return a


@api_router.post("/appointments")
async def create_appointment(payload: AppointmentIn, user: dict = Depends(get_current_user)):
    if user.get("role") != "customer":
        raise HTTPException(status_code=403, detail="Sadece müşteriler randevu oluşturabilir")

    if not payload.contract_accepted:
        raise HTTPException(status_code=400, detail="Randevu oluşturmak için sözleşme maddelerini kabul etmelisiniz")

    if payload.time not in SLOTS:
        raise HTTPException(status_code=400, detail="Geçersiz saat dilimi")

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
        "service_id": payload.service_id,
        "date": payload.date,
        "time": payload.time,
        "notes": payload.notes or "",
        "status": "pending",
        "deposit_amount": 0,
        "total_amount": service.get("price", 0),
        "paid_amount": 0,
        "origin": "online",
        "contract_accepted": True,
        "contract_accepted_at": now,
        "physical_contract_needed": True,  # they still need to sign in-person / confirm
        "contract_file_id": None,
        "created_at": now,
    }
    await db.appointments.insert_one(doc)

    # In-panel notification for the admin team
    await db.notifications.insert_one({
        "id": new_id(),
        "kind": "appointment_pending",
        "title": "Yeni randevu talebi",
        "message": f"{user.get('name')} · {service.get('name')} · {payload.date} {payload.time}",
        "appointment_id": doc["id"],
        "read": False,
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


@api_router.get("/appointments/me")
async def my_appointments(user: dict = Depends(get_current_user)):
    items = await db.appointments.find({"user_id": user["id"]}).sort("created_at", -1).to_list(200)
    return [await _enrich_appointment(i) for i in items]


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
    return [await _enrich_appointment(i) for i in items]


@api_router.patch("/appointments/{aid}")
async def update_appointment(aid: str, payload: AppointmentAdminUpdate, admin: dict = Depends(require_admin)):
    existing = await db.appointments.find_one({"id": aid})
    if not existing:
        raise HTTPException(status_code=404, detail="Randevu bulunamadı")

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if payload.status == "approved":
        # ensure slot not double-booked
        conflict = await db.appointments.find_one({
            "id": {"$ne": aid},
            "date": existing["date"],
            "time": existing["time"],
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


# ---- Contract file upload (signed physical contract) ----
class WalkinAppointmentIn(BaseModel):
    customer_name: str
    customer_phone: str
    customer_email: Optional[str] = ""
    service_id: str
    date: str
    time: str
    deposit_amount: float = 0
    total_amount: Optional[float] = None
    paid_amount: float = 0
    notes: Optional[str] = ""
    auto_approve: bool = True


@api_router.post("/appointments/walkin")
async def create_walkin_appointment(payload: WalkinAppointmentIn, admin: dict = Depends(require_admin)):
    """Admin creates a face-to-face appointment for a walk-in customer."""
    if payload.time not in SLOTS:
        raise HTTPException(status_code=400, detail="Geçersiz saat dilimi")
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
        "service_id": payload.service_id,
        "date": payload.date,
        "time": payload.time,
        "notes": payload.notes or "",
        "status": "approved" if payload.auto_approve else "pending",
        "deposit_amount": payload.deposit_amount,
        "total_amount": payload.total_amount if payload.total_amount is not None else service.get("price", 0),
        "paid_amount": payload.paid_amount,
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
    approved_docs = await db.appointments.find({"status": "approved"}, {"_id": 0}).to_list(1000)
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

    headers = ["Tarih", "Tür", "Ödeme Yöntemi", "Kategori", "Açıklama", "Tutar (₺)", "İşaretli Tutar"]
    for i, h in enumerate(headers, 1):
        c = ws.cell(row=4, column=i, value=h)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
        c.alignment = Alignment(horizontal="center")

    method_map = {"cash": "Nakit", "card": "Kart", "transfer": "Havale"}
    kind_map = {"income": "Gelir", "expense": "Gider"}
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
        ws.cell(row=row, column=5, value=t.get("description", ""))
        ws.cell(row=row, column=6, value=amount)
        ws.cell(row=row, column=7, value=signed)
        row += 1

    # Totals
    row += 1
    ws.cell(row=row, column=5, value="Toplam Gelir").font = Font(bold=True)
    ws.cell(row=row, column=6, value=total_in).font = Font(bold=True, color="059669")
    row += 1
    ws.cell(row=row, column=5, value="Toplam Gider").font = Font(bold=True)
    ws.cell(row=row, column=6, value=total_out).font = Font(bold=True, color="DC2626")
    row += 1
    ws.cell(row=row, column=5, value="NET").font = Font(bold=True, size=12)
    ws.cell(row=row, column=6, value=total_in - total_out).font = Font(bold=True, size=12)

    # Column widths
    widths = [12, 10, 14, 24, 40, 14, 14]
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
    from io import BytesIO
    from urllib.parse import quote

    date_from, date_to, label = _period_bounds(period)
    items = await db.transactions.find(
        {"date": {"$gte": date_from, "$lte": date_to}}, {"_id": 0}
    ).sort([("date", 1), ("created_at", 1)]).to_list(5000)
    settings = await db.site_settings.find_one({"id": "singleton"}, {"_id": 0}) or {}
    brand = settings.get("business_name", "Fotuber")

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=15*mm, rightMargin=15*mm, topMargin=15*mm, bottomMargin=15*mm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("t", parent=styles["Title"], fontSize=18, textColor=colors.HexColor("#0F172A"))
    sub_style = ParagraphStyle("s", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#666666"))

    story = [
        Paragraph(f"{brand} — Nakit Akışı Raporu", title_style),
        Paragraph(f"Dönem: <b>{label}</b> · Kayıt: {len(items)}", sub_style),
        Spacer(1, 6*mm),
    ]

    method_map = {"cash": "Nakit", "card": "Kart", "transfer": "Havale"}
    kind_map = {"income": "Gelir", "expense": "Gider"}

    data = [["Tarih", "Tür", "Yöntem", "Kategori", "Açıklama", "Tutar (₺)"]]
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
            (t.get("description") or "")[:40],
            f"{'+' if t['kind']=='income' else '−'}{amt:,.2f}".replace(",", "."),
        ])

    tbl = Table(data, colWidths=[22*mm, 20*mm, 22*mm, 45*mm, 90*mm, 30*mm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (5, 1), (5, -1), "RIGHT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#F8FAFC"), colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(tbl)

    story += [
        Spacer(1, 6*mm),
        Paragraph(f"<b>Toplam Gelir:</b> ₺{total_in:,.2f}".replace(",", "."), styles["Normal"]),
        Paragraph(f"<b>Toplam Gider:</b> ₺{total_out:,.2f}".replace(",", "."), styles["Normal"]),
        Paragraph(f"<b>NET:</b> ₺{(total_in - total_out):,.2f}".replace(",", "."), styles["Heading3"]),
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
        {"date": date, "payment_method": "cash"}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    cash_in = sum(float(t.get("amount", 0) or 0) for t in tx if t.get("kind") == "income")
    cash_out = sum(float(t.get("amount", 0) or 0) for t in tx if t.get("kind") == "expense")
    opening = float(saved.get("opening_balance", 0)) if saved else suggested_opening
    expected_closing = opening + cash_in - cash_out

    return {
        "date": date,
        "saved": saved,
        "suggested_opening": suggested_opening,
        "previous_date": prev_date,
        "cash_in": cash_in,
        "cash_out": cash_out,
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


@api_router.get("/notifications")
async def list_notifications(admin: dict = Depends(require_admin), limit: int = 30, unread_only: bool = False):
    q = {"read": False} if unread_only else {}
    items = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    unread_count = await db.notifications.count_documents({"read": False})
    return {"items": items, "unread_count": unread_count}


@api_router.post("/notifications/mark-read")
async def mark_read(admin: dict = Depends(require_admin), notification_id: Optional[str] = None):
    if notification_id:
        await db.notifications.update_one({"id": notification_id}, {"$set": {"read": True}})
    else:
        await db.notifications.update_many({"read": False}, {"$set": {"read": True}})
    return {"ok": True}


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
        "event_type": ev.get("event_type"),
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
            "event_type": ev.get("event_type"),
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
@api_router.get("/")
async def root():
    return {"service": "Fotuber API", "ok": True}


# Register the router
app.include_router(api_router)


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
