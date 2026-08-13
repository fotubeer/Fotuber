"""
Salon (Wedding Venue) Portal — additive module.

A separate account role ("venue") with its own JWT (venue_token cookie / Bearer),
so wedding venues can log in, generate single-use invitation codes for the couples
marrying at their venue, and track redemptions. Couples redeem the code inside the
digital-invitation wizard to get a FREE premium invitation or a discount.

Mirrors the established studio auth pattern. No existing routes are touched.
"""
import secrets
from datetime import datetime, timezone, timedelta

import jwt
from fastapi import APIRouter, HTTPException, Depends, Request, Response
from pydantic import BaseModel, EmailStr, Field


async def ensure_admin_venue(db, sub: str, email: str) -> dict:
    """Get-or-create a full-access venue account for the site admin/staff."""
    aid = f"admin-{sub}"
    acc = await db.venue_accounts.find_one({"id": aid}, {"_id": 0})
    if not acc:
        acc = {
            "id": aid, "email": email or "admin@fotuber.com.tr",
            "salon_adi": "Fotuber Yönetim", "phone": "", "city": "",
            "role": "venue", "active": True, "is_admin_super": True,
            "kvkk_consent": True, "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.venue_accounts.update_one({"id": aid}, {"$setOnInsert": acc}, upsert=True)
        acc = await db.venue_accounts.find_one({"id": aid}, {"_id": 0})
    return acc


def build_get_current_venue(db, JWT_SECRET, JWT_ALGORITHM):
    async def get_current_venue(request: Request) -> dict:
        token = request.cookies.get("venue_token") or request.cookies.get("access_token")
        if not token:
            auth = request.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                token = auth[7:]
        if not token:
            raise HTTPException(status_code=401, detail="Salon girişi gerekli")
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload.get("type") != "access":
                raise HTTPException(status_code=401, detail="Geçersiz salon oturumu")
            role = payload.get("role")
            if role in ("admin", "staff"):
                return await ensure_admin_venue(db, payload.get("sub"), payload.get("email"))
            if role != "venue":
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
    require_admin = deps["require_admin"]
    get_current_venue = build_get_current_venue(db, JWT_SECRET, JWT_ALGORITHM)

    # Staff kiosk auth: short-lived JWT (role=venue_staff, sub=staff_id).
    async def get_current_staff(request: Request) -> dict:
        token = request.cookies.get("venue_staff_token")
        if not token:
            auth = request.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                token = auth[7:]
        if not token:
            raise HTTPException(status_code=401, detail="Personel girişi gerekli")
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload.get("role") != "venue_staff":
                raise HTTPException(status_code=401, detail="Geçersiz personel oturumu")
            st = await db.venue_staff.find_one({"id": payload["sub"]}, {"_id": 0})
            if not st or not st.get("active", True):
                raise HTTPException(status_code=401, detail="Personel bulunamadı")
            return st
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Oturum süresi doldu")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Geçersiz token")

    async def _ensure_kiosk_code(acc: dict) -> str:
        if acc.get("kiosk_code"):
            return acc["kiosk_code"]
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        for _ in range(40):
            code = "".join(secrets.choice(alphabet) for _ in range(5))
            if not await db.venue_accounts.find_one({"kiosk_code": code}):
                await db.venue_accounts.update_one({"id": acc["id"]}, {"$set": {"kiosk_code": code}})
                return code
        code = secrets.token_hex(3).upper()
        await db.venue_accounts.update_one({"id": acc["id"]}, {"$set": {"kiosk_code": code}})
        return code

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
        # RBAC: salon hesapları artık yalnızca Site Admini tarafından açılır.
        raise HTTPException(status_code=403, detail="Salon hesapları yalnızca Fotuber yönetimi tarafından oluşturulur. Lütfen bizimle iletişime geçin.")

    @router.post("/login")
    async def login(payload: VenueLoginIn, response: Response):
        ident = payload.email.lower().strip()
        # Site admin / staff ALWAYS get a full-access venue session first.
        admin_user = await db.users.find_one({"email": ident, "role": {"$in": ["admin", "staff"]}})
        if admin_user and verify_password(payload.password, admin_user.get("password_hash", "")):
            adm = await ensure_admin_venue(db, admin_user["id"], admin_user.get("email"))
            access = create_access_token(adm["id"], admin_user.get("email") or ident, "venue")
            _set_cookie(response, access)
            return {"account": _strip_venue(adm), "token": access}
        acc = await db.venue_accounts.find_one({"email": ident})
        if acc and verify_password(payload.password, acc.get("password_hash", "")):
            if not acc.get("active", True):
                raise HTTPException(status_code=403, detail="Hesabınız pasif durumda.")
            access = create_access_token(acc["id"], acc["email"], "venue")
            _set_cookie(response, access)
            return {"account": _strip_venue(acc), "token": access}
        raise HTTPException(status_code=401, detail="E-posta veya şifre hatalı")

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

    # ========================================================================
    # FAZ A — RBAC: Admin creates venue accounts + venue admin manages staff.
    # ========================================================================
    class AdminVenueAccountIn(BaseModel):
        email: EmailStr
        password: str = Field(min_length=6)
        salon_adi: str = Field(min_length=2)
        phone: str = ""
        city: str = ""

    class AdminVenueAccountPatch(BaseModel):
        active: bool | None = None
        password: str | None = None
        salon_adi: str | None = None
        phone: str | None = None
        city: str | None = None

    @router.post("/admin/accounts")
    async def admin_create_venue(payload: AdminVenueAccountIn, admin: dict = Depends(require_admin)):
        email = payload.email.lower().strip()
        if await db.venue_accounts.find_one({"email": email}):
            raise HTTPException(status_code=400, detail="Bu e-posta ile kayıtlı bir salon mevcut")
        doc = {
            "id": new_id(), "email": email, "password_hash": hash_password(payload.password),
            "salon_adi": payload.salon_adi.strip(), "phone": payload.phone.strip(),
            "city": payload.city.strip(), "role": "venue", "active": True,
            "kvkk_consent": True, "created_at": now_iso(), "created_by_admin": admin.get("id"),
        }
        await db.venue_accounts.insert_one(doc)
        return {"account": _strip_venue(doc)}

    @router.get("/admin/accounts")
    async def admin_list_venues(admin: dict = Depends(require_admin)):
        rows = await db.venue_accounts.find(
            {"is_admin_super": {"$ne": True}}, {"_id": 0, "password_hash": 0}
        ).sort("created_at", -1).to_list(1000)
        for r in rows:
            r["staff_count"] = await db.venue_staff.count_documents({"venue_id": r["id"]})
        return {"accounts": rows}

    @router.patch("/admin/accounts/{vid}")
    async def admin_patch_venue(vid: str, payload: AdminVenueAccountPatch, admin: dict = Depends(require_admin)):
        acc = await db.venue_accounts.find_one({"id": vid})
        if not acc:
            raise HTTPException(status_code=404, detail="Salon bulunamadı")
        upd = {}
        if payload.active is not None: upd["active"] = payload.active
        if payload.password: upd["password_hash"] = hash_password(payload.password)
        for f in ("salon_adi", "phone", "city"):
            v = getattr(payload, f)
            if v is not None: upd[f] = v.strip()
        if upd:
            await db.venue_accounts.update_one({"id": vid}, {"$set": upd})
        return {"ok": True}

    @router.delete("/admin/accounts/{vid}")
    async def admin_delete_venue(vid: str, admin: dict = Depends(require_admin)):
        await db.venue_accounts.delete_one({"id": vid})
        await db.venue_staff.delete_many({"venue_id": vid})
        return {"ok": True}

    # ---- Venue admin: staff management --------------------------------------
    STAFF_ROLES = ["fotografci", "garson_sefi", "muzisyen", "salon_gorevlisi", "salon_muduru", "sanatci", "kameraman", "diger"]

    class StaffIn(BaseModel):
        name: str = Field(min_length=2, max_length=80)
        job_role: str = "salon_gorevlisi"
        pin: str = Field(min_length=4, max_length=6)

    class StaffPatch(BaseModel):
        name: str | None = None
        job_role: str | None = None
        pin: str | None = None
        active: bool | None = None

    def _staff_out(s: dict) -> dict:
        return {"id": s["id"], "name": s.get("name"), "job_role": s.get("job_role"),
                "active": s.get("active", True), "created_at": s.get("created_at")}

    @router.get("/kiosk-code")
    async def get_kiosk_code(acc: dict = Depends(get_current_venue)):
        code = await _ensure_kiosk_code(acc)
        return {"kiosk_code": code, "salon_adi": acc.get("salon_adi")}

    @router.get("/staff")
    async def list_staff(acc: dict = Depends(get_current_venue)):
        rows = await db.venue_staff.find({"venue_id": acc["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
        return {"staff": [_staff_out(s) for s in rows], "roles": STAFF_ROLES}

    @router.post("/staff")
    async def create_staff(payload: StaffIn, acc: dict = Depends(get_current_venue)):
        if not payload.pin.isdigit():
            raise HTTPException(status_code=400, detail="PIN yalnızca rakamlardan oluşmalı")
        doc = {
            "id": new_id(), "venue_id": acc["id"], "name": payload.name.strip(),
            "job_role": payload.job_role if payload.job_role in STAFF_ROLES else "salon_gorevlisi",
            "pin_hash": hash_password(payload.pin), "active": True, "created_at": now_iso(),
        }
        await db.venue_staff.insert_one(doc)
        await _ensure_kiosk_code(acc)
        return {"staff": _staff_out(doc)}

    @router.patch("/staff/{sid}")
    async def patch_staff(sid: str, payload: StaffPatch, acc: dict = Depends(get_current_venue)):
        s = await db.venue_staff.find_one({"id": sid, "venue_id": acc["id"]})
        if not s:
            raise HTTPException(status_code=404, detail="Personel bulunamadı")
        upd = {}
        if payload.name is not None: upd["name"] = payload.name.strip()
        if payload.job_role in STAFF_ROLES: upd["job_role"] = payload.job_role
        if payload.active is not None: upd["active"] = payload.active
        if payload.pin:
            if not payload.pin.isdigit():
                raise HTTPException(status_code=400, detail="PIN yalnızca rakamlardan oluşmalı")
            upd["pin_hash"] = hash_password(payload.pin)
        if upd:
            await db.venue_staff.update_one({"id": sid}, {"$set": upd})
        return {"ok": True}

    @router.delete("/staff/{sid}")
    async def delete_staff(sid: str, acc: dict = Depends(get_current_venue)):
        await db.venue_staff.delete_one({"id": sid, "venue_id": acc["id"]})
        return {"ok": True}

    # ---- Staff KIOSK login (venue kiosk_code + numeric PIN) ------------------
    class StaffLoginIn(BaseModel):
        kiosk_code: str
        pin: str

    def _set_staff_cookie(response: Response, access: str):
        response.set_cookie(key="venue_staff_token", value=access, httponly=True, secure=True,
                            samesite="none", max_age=60 * 60 * 12, path="/")

    @router.post("/staff/login")
    async def staff_login(payload: StaffLoginIn, response: Response):
        code = (payload.kiosk_code or "").strip().upper()
        venue = await db.venue_accounts.find_one({"kiosk_code": code})
        if not venue or not venue.get("active", True):
            raise HTTPException(status_code=404, detail="Salon kodu bulunamadı")
        # Brute-force lockout per (venue kiosk_code) — short PINs are weak.
        lk = await db.venue_staff_attempts.find_one({"kiosk_code": code})
        now = datetime.now(timezone.utc)
        if lk and lk.get("locked_until") and lk["locked_until"] > now.isoformat():
            raise HTTPException(status_code=429, detail="Çok fazla hatalı deneme. Birkaç dakika sonra tekrar deneyin.")
        staff_list = await db.venue_staff.find({"venue_id": venue["id"], "active": True}).to_list(500)
        matched = None
        for s in staff_list:
            if verify_password(payload.pin, s.get("pin_hash", "")):
                matched = s
                break
        if not matched:
            fails = (lk.get("fails", 0) if lk else 0) + 1
            upd = {"kiosk_code": code, "fails": fails, "updated_at": now.isoformat()}
            if fails >= 6:
                upd["locked_until"] = (now + timedelta(minutes=10)).isoformat()
                upd["fails"] = 0
            await db.venue_staff_attempts.update_one({"kiosk_code": code}, {"$set": upd}, upsert=True)
            raise HTTPException(status_code=401, detail="PIN hatalı")
        await db.venue_staff_attempts.delete_one({"kiosk_code": code})
        access = create_access_token(matched["id"], f"staff-{matched['id']}", "venue_staff")
        _set_staff_cookie(response, access)
        return {"token": access, "staff": {**_staff_out(matched), "venue_id": venue["id"],
                "venue_name": venue.get("salon_adi"), "kiosk_code": code}}

    @router.post("/staff/logout")
    async def staff_logout(response: Response):
        response.delete_cookie("venue_staff_token", path="/")
        return {"ok": True}

    @router.get("/staff/me")
    async def staff_me(st: dict = Depends(get_current_staff)):
        venue = await db.venue_accounts.find_one({"id": st["venue_id"]}, {"_id": 0, "salon_adi": 1})
        return {"staff": {**_staff_out(st), "venue_id": st["venue_id"], "venue_name": (venue or {}).get("salon_adi")}}

    # ========================================================================
    # FAZ B — Floor Plan Builder + couple/guest assignment + hostess lookup.
    # ========================================================================
    class FloorPlanIn(BaseModel):
        name: str = Field(default="Yeni Kroki", max_length=120)
        invitation_id: str | None = None
        area_type: str = "indoor"  # indoor | garden

    class FloorPlanSaveIn(BaseModel):
        name: str | None = None
        invitation_id: str | None = None
        area_type: str | None = None
        elements: list = []          # canvas objects (fabric JSON-ish)
        assignments: dict | None = None  # { elementId: [guestName, ...] }

    def _plan_out(p: dict) -> dict:
        return {"id": p["id"], "name": p.get("name"), "invitation_id": p.get("invitation_id"),
                "area_type": p.get("area_type", "indoor"), "elements": p.get("elements", []),
                "assignments": p.get("assignments", {}), "updated_at": p.get("updated_at"),
                "created_at": p.get("created_at")}

    @router.get("/floorplans")
    async def list_plans(acc: dict = Depends(get_current_venue)):
        rows = await db.venue_floorplans.find({"venue_id": acc["id"]}, {"_id": 0}).sort("updated_at", -1).to_list(200)
        return {"plans": [{"id": r["id"], "name": r.get("name"), "area_type": r.get("area_type", "indoor"),
                           "invitation_id": r.get("invitation_id"), "updated_at": r.get("updated_at"),
                           "element_count": len(r.get("elements", []))} for r in rows]}

    @router.post("/floorplans")
    async def create_plan(payload: FloorPlanIn, acc: dict = Depends(get_current_venue)):
        doc = {"id": new_id(), "venue_id": acc["id"], "name": payload.name.strip() or "Yeni Kroki",
               "invitation_id": payload.invitation_id, "area_type": payload.area_type,
               "elements": [], "assignments": {}, "created_at": now_iso(), "updated_at": now_iso()}
        await db.venue_floorplans.insert_one(doc)
        return {"plan": _plan_out(doc)}

    @router.get("/floorplans/{pid}")
    async def get_plan(pid: str, acc: dict = Depends(get_current_venue)):
        p = await db.venue_floorplans.find_one({"id": pid, "venue_id": acc["id"]}, {"_id": 0})
        if not p:
            raise HTTPException(status_code=404, detail="Kroki bulunamadı")
        return {"plan": _plan_out(p)}

    @router.put("/floorplans/{pid}")
    async def save_plan(pid: str, payload: FloorPlanSaveIn, acc: dict = Depends(get_current_venue)):
        p = await db.venue_floorplans.find_one({"id": pid, "venue_id": acc["id"]})
        if not p:
            raise HTTPException(status_code=404, detail="Kroki bulunamadı")
        upd = {"updated_at": now_iso(), "elements": payload.elements or []}
        if payload.name is not None: upd["name"] = payload.name.strip() or p.get("name")
        if payload.invitation_id is not None: upd["invitation_id"] = payload.invitation_id
        if payload.area_type is not None: upd["area_type"] = payload.area_type
        if payload.assignments is not None: upd["assignments"] = payload.assignments
        await db.venue_floorplans.update_one({"id": pid}, {"$set": upd})
        p = await db.venue_floorplans.find_one({"id": pid}, {"_id": 0})
        return {"plan": _plan_out(p)}

    @router.delete("/floorplans/{pid}")
    async def delete_plan(pid: str, acc: dict = Depends(get_current_venue)):
        await db.venue_floorplans.delete_one({"id": pid, "venue_id": acc["id"]})
        return {"ok": True}

    # ---- Couples linked to this venue (via redeemed invite codes) -----------
    @router.get("/couples")
    async def venue_couples(acc: dict = Depends(get_current_venue)):
        codes = await db.venue_invite_codes.find(
            {"venue_id": acc["id"], "status": "used", "used_invitation_id": {"$ne": None}},
            {"_id": 0, "used_invitation_id": 1, "couple_name": 1}).to_list(2000)
        out = []
        seen = set()
        for c in codes:
            iid = c.get("used_invitation_id")
            if not iid or iid in seen:
                continue
            seen.add(iid)
            inv = await db.invitations.find_one({"id": iid},
                {"_id": 0, "id": 1, "person1": 1, "person2": 1, "event_date": 1, "event_type": 1, "slug": 1})
            if not inv:
                continue
            names = f"{inv.get('person1','')} & {inv.get('person2','')}".strip(" &") or c.get("couple_name", "")
            yes = await db.invitation_rsvps.count_documents(
                {"invitation_id": iid, "$or": [{"rsvp_choice": "yes"}, {"rsvp_choice": {"$in": [None, ""]}, "attending": True}]})
            out.append({"invitation_id": iid, "names": names, "event_date": inv.get("event_date"),
                        "event_type": inv.get("event_type"), "slug": inv.get("slug"), "attending_count": yes})
        return {"couples": out}

    @router.get("/couples/{iid}/guests")
    async def venue_couple_guests(iid: str, acc: dict = Depends(get_current_venue)):
        # only couples linked to this venue
        link = await db.venue_invite_codes.find_one({"venue_id": acc["id"], "used_invitation_id": iid})
        if not link:
            raise HTTPException(status_code=403, detail="Bu çift salonunuza bağlı değil")
        rows = await db.invitation_rsvps.find({"invitation_id": iid}, {"_id": 0}).sort("created_at", -1).to_list(100000)
        guests = []
        for r in rows:
            choice = r.get("rsvp_choice") or ("yes" if r.get("attending") else "no")
            if choice != "yes":
                continue
            full = f"{r.get('name','')} {r.get('surname','')}".strip()
            party = 1 + len(r.get("companions") or [])
            if full:
                guests.append({"name": full, "party": party})
        return {"guests": guests, "count": len(guests)}

    # ---- Hostess kiosk: find a guest's table on a plan ----------------------
    @router.get("/floorplans/{pid}/find")
    async def hostess_find(pid: str, q: str = "", st: dict = Depends(get_current_staff)):
        p = await db.venue_floorplans.find_one({"id": pid, "venue_id": st["venue_id"]}, {"_id": 0})
        if not p:
            raise HTTPException(status_code=404, detail="Kroki bulunamadı")
        ql = (q or "").strip().lower()
        results = []
        assignments = p.get("assignments", {}) or {}
        labels = {e.get("elId"): (e.get("label") or e.get("name") or "Masa") for e in (p.get("elements", []) or []) if e.get("elId")}
        for el_id, names in assignments.items():
            for nm in (names or []):
                if ql and ql not in nm.lower():
                    continue
                results.append({"guest": nm, "element_id": el_id, "table_label": labels.get(el_id, "Masa")})
        return {"results": results[:50], "plan_name": p.get("name")}

    @router.get("/staff/floorplans")
    async def staff_list_plans(st: dict = Depends(get_current_staff)):
        rows = await db.venue_floorplans.find({"venue_id": st["venue_id"]}, {"_id": 0}).sort("updated_at", -1).to_list(200)
        return {"plans": [{"id": r["id"], "name": r.get("name"), "area_type": r.get("area_type", "indoor")} for r in rows]}

    @router.get("/staff/floorplans/{pid}")
    async def staff_get_plan(pid: str, st: dict = Depends(get_current_staff)):
        p = await db.venue_floorplans.find_one({"id": pid, "venue_id": st["venue_id"]}, {"_id": 0})
        if not p:
            raise HTTPException(status_code=404, detail="Kroki bulunamadı")
        return {"plan": _plan_out(p)}

    return router
