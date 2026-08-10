"""
Salon (Wedding Venue) Portal — additive module.

A separate account role ("venue") with its own JWT (venue_token cookie / Bearer),
so wedding venues can log in, generate single-use invitation codes for the couples
marrying at their venue, and track redemptions. Couples redeem the code inside the
digital-invitation wizard to get a FREE premium invitation or a discount.

Mirrors the established studio auth pattern. No existing routes are touched.
"""
import secrets
from datetime import datetime, timezone

import jwt
from fastapi import APIRouter, HTTPException, Depends, Request, Response
from pydantic import BaseModel, EmailStr, Field


def build_get_current_venue(db, JWT_SECRET, JWT_ALGORITHM):
    async def get_current_venue(request: Request) -> dict:
        token = request.cookies.get("venue_token")
        if not token:
            auth = request.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                token = auth[7:]
        if not token:
            raise HTTPException(status_code=401, detail="Salon girişi gerekli")
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload.get("type") != "access" or payload.get("role") != "venue":
                raise HTTPException(status_code=401, detail="Geçersiz salon oturumu")
            acc = await db.venue_accounts.find_one({"id": payload["sub"]}, {"_id": 0})
            if not acc or not acc.get("active", True):
                raise HTTPException(status_code=401, detail="Salon hesabı bulunamadı")
            return acc
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Oturum süresi doldu")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Geçersiz token")
    return get_current_venue


def _strip_venue(acc: dict) -> dict:
    if not acc:
        return acc
    return {
        "id": acc.get("id"), "email": acc.get("email"),
        "salon_adi": acc.get("salon_adi"), "phone": acc.get("phone"),
        "city": acc.get("city", ""), "role": "venue",
        "created_at": acc.get("created_at"),
    }


class VenueRegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    salon_adi: str = Field(min_length=2)
    phone: str = ""
    city: str = ""
    kvkk_consent: bool = False


class VenueLoginIn(BaseModel):
    email: str
    password: str


class CodeCreateIn(BaseModel):
    count: int = Field(default=1, ge=1, le=100)
    code_type: str = "free"          # "free" | "discount"
    discount_percent: int = Field(default=0, ge=0, le=100)
    couple_name: str = ""
    note: str = ""


def get_router(db, deps):
    router = APIRouter(prefix="/api/venue", tags=["venue"])
    hash_password = deps["hash_password"]
    verify_password = deps["verify_password"]
    create_access_token = deps["create_access_token"]
    new_id = deps["new_id"]
    now_iso = deps["now_iso"]
    JWT_SECRET = deps["JWT_SECRET"]
    JWT_ALGORITHM = deps["JWT_ALGORITHM"]
    get_current_venue = build_get_current_venue(db, JWT_SECRET, JWT_ALGORITHM)

    def _set_cookie(response: Response, access: str):
        response.set_cookie(key="venue_token", value=access, httponly=True, secure=True,
                            samesite="none", max_age=60 * 60 * 24, path="/")

    async def _gen_code() -> str:
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        for _ in range(40):
            code = "SALON-" + "".join(secrets.choice(alphabet) for _ in range(6))
            if not await db.venue_invite_codes.find_one({"code": code}):
                return code
        return "SALON-" + secrets.token_hex(4).upper()

    # ---- Auth ----------------------------------------------------------------
    @router.post("/register")
    async def register(payload: VenueRegisterIn, response: Response):
        email = payload.email.lower().strip()
        if not payload.kvkk_consent:
            raise HTTPException(status_code=400, detail="KVKK metnini kabul etmelisiniz")
        if await db.venue_accounts.find_one({"email": email}):
            raise HTTPException(status_code=400, detail="Bu e-posta ile kayıtlı bir salon mevcut")
        now = now_iso()
        doc = {
            "id": new_id(), "email": email, "password_hash": hash_password(payload.password),
            "salon_adi": payload.salon_adi.strip(), "phone": payload.phone.strip(),
            "city": payload.city.strip(), "role": "venue", "active": True,
            "kvkk_consent": True, "created_at": now,
        }
        await db.venue_accounts.insert_one(doc)
        try:
            await db.notifications.insert_one({
                "id": new_id(), "kind": "venue_register", "title": "Yeni salon kaydı",
                "message": f"{doc['salon_adi']} ({email}) salon portalına katıldı.",
                "severity": "general", "link": "/admin/uyelikler", "read": False,
                "read_at": None, "created_at": now,
            })
        except Exception:
            pass
        access = create_access_token(doc["id"], email, "venue")
        _set_cookie(response, access)
        return {"account": _strip_venue(doc), "token": access}

    @router.post("/login")
    async def login(payload: VenueLoginIn, response: Response):
        acc = await db.venue_accounts.find_one({"email": payload.email.lower().strip()})
        if not acc or not verify_password(payload.password, acc.get("password_hash", "")):
            raise HTTPException(status_code=401, detail="E-posta veya şifre hatalı")
        if not acc.get("active", True):
            raise HTTPException(status_code=403, detail="Hesabınız pasif durumda.")
        access = create_access_token(acc["id"], acc["email"], "venue")
        _set_cookie(response, access)
        return {"account": _strip_venue(acc), "token": access}

    @router.post("/logout")
    async def logout(response: Response):
        response.delete_cookie("venue_token", path="/")
        return {"ok": True}

    @router.get("/me")
    async def me(acc: dict = Depends(get_current_venue)):
        return {"account": _strip_venue(acc)}

    # ---- Invitation codes ----------------------------------------------------
    def _code_out(c: dict) -> dict:
        return {
            "id": c["id"], "code": c["code"], "code_type": c.get("code_type", "free"),
            "discount_percent": c.get("discount_percent", 0), "status": c.get("status", "active"),
            "couple_name": c.get("couple_name", ""), "note": c.get("note", ""),
            "created_at": c.get("created_at"), "used_at": c.get("used_at"),
            "used_slug": c.get("used_slug"),
        }

    @router.post("/codes")
    async def create_codes(payload: CodeCreateIn, acc: dict = Depends(get_current_venue)):
        code_type = payload.code_type if payload.code_type in ("free", "discount") else "free"
        if code_type == "discount" and payload.discount_percent <= 0:
            raise HTTPException(status_code=400, detail="İndirim kodu için indirim yüzdesi girin")
        now = now_iso()
        created = []
        for _ in range(payload.count):
            code = await _gen_code()
            doc = {
                "id": new_id(), "venue_id": acc["id"], "venue_name": acc.get("salon_adi"),
                "code": code, "code_type": code_type,
                "discount_percent": payload.discount_percent if code_type == "discount" else 100,
                "status": "active", "couple_name": payload.couple_name.strip(),
                "note": payload.note.strip(), "created_at": now,
                "used_at": None, "used_invitation_id": None, "used_slug": None,
            }
            await db.venue_invite_codes.insert_one(doc)
            created.append(_code_out(doc))
        return {"created": created}

    @router.get("/codes")
    async def list_codes(acc: dict = Depends(get_current_venue)):
        rows = await db.venue_invite_codes.find({"venue_id": acc["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
        return {"codes": [_code_out(c) for c in rows]}

    @router.delete("/codes/{cid}")
    async def delete_code(cid: str, acc: dict = Depends(get_current_venue)):
        c = await db.venue_invite_codes.find_one({"id": cid, "venue_id": acc["id"]})
        if not c:
            raise HTTPException(status_code=404, detail="Kod bulunamadı")
        if c.get("status") == "used":
            raise HTTPException(status_code=400, detail="Kullanılmış kod silinemez")
        await db.venue_invite_codes.delete_one({"id": cid})
        return {"ok": True}

    @router.get("/stats")
    async def stats(acc: dict = Depends(get_current_venue)):
        total = await db.venue_invite_codes.count_documents({"venue_id": acc["id"]})
        used = await db.venue_invite_codes.count_documents({"venue_id": acc["id"], "status": "used"})
        free_used = await db.venue_invite_codes.count_documents({"venue_id": acc["id"], "status": "used", "code_type": "free"})
        disc_used = await db.venue_invite_codes.count_documents({"venue_id": acc["id"], "status": "used", "code_type": "discount"})
        return {"total": total, "used": used, "active": total - used,
                "free_used": free_used, "discount_used": disc_used}

    # ---- Detailed usage report (which couple used which code, when) ----------
    @router.get("/report")
    async def report(acc: dict = Depends(get_current_venue)):
        rows = await db.venue_invite_codes.find(
            {"venue_id": acc["id"], "status": "used"}, {"_id": 0}
        ).sort("used_at", -1).to_list(2000)
        out = []
        for c in rows:
            inv = None
            if c.get("used_invitation_id"):
                inv = await db.invitations.find_one(
                    {"id": c["used_invitation_id"]},
                    {"_id": 0, "person1": 1, "person2": 1, "event_date": 1, "slug": 1, "event_type": 1, "status": 1})
            couple = c.get("couple_name", "")
            if inv:
                names = f"{inv.get('person1','')} & {inv.get('person2','')}".strip(" &")
                if names:
                    couple = names
            out.append({
                "id": c["id"], "code": c["code"], "code_type": c.get("code_type", "free"),
                "discount_percent": c.get("discount_percent", 0),
                "couple_name": couple, "note": c.get("note", ""),
                "used_at": c.get("used_at"),
                "invitation_slug": (inv or {}).get("slug") or c.get("used_slug"),
                "event_date": (inv or {}).get("event_date", ""),
                "event_type": (inv or {}).get("event_type", ""),
                "invitation_status": (inv or {}).get("status", ""),
            })
        return {"report": out, "count": len(out)}

    # ---- Public: validate a code (used by the invitation wizard) -------------
    @router.get("/code/{code}")
    async def validate_code(code: str):
        c = await db.venue_invite_codes.find_one({"code": code.strip().upper()}, {"_id": 0})
        if not c:
            raise HTTPException(status_code=404, detail="Kod bulunamadı")
        if c.get("status") == "used":
            raise HTTPException(status_code=400, detail="Bu kod daha önce kullanılmış")
        return {
            "valid": True, "code": c["code"], "code_type": c.get("code_type", "free"),
            "discount_percent": c.get("discount_percent", 0), "venue_name": c.get("venue_name", ""),
        }

    return router
