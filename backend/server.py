from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
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


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.appointments.create_index([("date", 1), ("time", 1)])
    await db.blocked_slots.create_index([("date", 1), ("time", 1)], unique=True)
    await db.gallery.create_index([("category", 1), ("created_at", -1)])
    init_storage()

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
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
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
        "created_at": now_iso(),
    }
    await db.appointments.insert_one(doc)
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
    doc = await db.appointments.find_one({"id": aid})
    return await _enrich_appointment(doc)


@api_router.delete("/appointments/{aid}")
async def delete_appointment(aid: str, admin: dict = Depends(require_admin)):
    await db.appointments.delete_one({"id": aid})
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
