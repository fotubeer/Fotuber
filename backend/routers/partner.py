"""
Fotuber Medya — B2B Firma (partner) paneli. Fotuber Photography markası altında.
FAZ 1: Admin firma hesaplarını açar/şifre belirler/pasife alır + yetki (indir/yükle/yedekle).
Firma kendi alanına girer, firma bilgisi + logo yükler, yetkisine göre dosya indirir/yükler.
Depolama: dahili object storage (media/{partner_id}/...). NAS/WebDAV sonra eklenecek.
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Request, Response, UploadFile, File
from pydantic import BaseModel, Field
import jwt


def build_get_current_partner(db, JWT_SECRET, JWT_ALGORITHM):
    async def get_current_partner(request: Request) -> dict:
        token = request.cookies.get("partner_token")
        if not token:
            auth = request.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                token = auth[7:]
        if not token:
            raise HTTPException(status_code=401, detail="Giriş gerekli")
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload.get("role") != "partner":
                raise HTTPException(status_code=401, detail="Geçersiz token")
            p = await db.media_partners.find_one({"id": payload.get("sub")}, {"_id": 0})
            if not p or not p.get("active", True):
                raise HTTPException(status_code=401, detail="Hesap pasif veya bulunamadı")
            return p
        except jwt.PyJWTError:
            raise HTTPException(status_code=401, detail="Geçersiz token")
    return get_current_partner


def get_router(db, deps):
    router = APIRouter(prefix="/api/media", tags=["media"])
    require_admin = deps["require_admin"]
    hash_password = deps["hash_password"]
    verify_password = deps["verify_password"]
    create_access_token = deps["create_access_token"]
    new_id = deps["new_id"]
    now_iso = deps["now_iso"]
    put_object = deps["put_object"]
    get_object = deps["get_object"]
    delete_object = deps["delete_object"]
    get_current_partner = build_get_current_partner(db, deps["JWT_SECRET"], deps["JWT_ALGORITHM"])

    def _out(p):
        return {"id": p["id"], "name": p.get("name"), "email": p.get("email"),
                "active": p.get("active", True), "perms": p.get("perms", {}),
                "company": p.get("company", {}), "logo_url": p.get("logo_url", ""),
                "created_at": p.get("created_at")}

    # ── ADMIN — firma hesap yönetimi ─────────────────────────────────────
    class PartnerIn(BaseModel):
        name: str = Field(min_length=1, max_length=160)
        email: str = Field(min_length=3, max_length=160)
        password: Optional[str] = None
        active: bool = True
        can_download: bool = True
        can_upload: bool = False
        can_backup: bool = False

    @router.get("/admin/partners")
    async def list_partners(admin: dict = Depends(require_admin)):
        rows = await db.media_partners.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
        return {"partners": [_out(p) for p in rows]}

    @router.post("/admin/partners")
    async def create_partner(payload: PartnerIn, admin: dict = Depends(require_admin)):
        email = payload.email.strip().lower()
        if await db.media_partners.find_one({"email": email}):
            raise HTTPException(status_code=400, detail="Bu e-posta zaten kayıtlı")
        if not payload.password or len(payload.password) < 4:
            raise HTTPException(status_code=400, detail="Şifre en az 4 karakter olmalı")
        doc = {"id": new_id(), "name": payload.name.strip(), "email": email,
               "password_hash": hash_password(payload.password), "active": payload.active,
               "perms": {"download": payload.can_download, "upload": payload.can_upload, "backup": payload.can_backup},
               "company": {}, "logo_url": "", "created_at": now_iso()}
        await db.media_partners.insert_one(doc)
        return {"partner": _out(doc)}

    @router.patch("/admin/partners/{pid}")
    async def update_partner(pid: str, payload: PartnerIn, admin: dict = Depends(require_admin)):
        upd = {"name": payload.name.strip(), "email": payload.email.strip().lower(), "active": payload.active,
               "perms": {"download": payload.can_download, "upload": payload.can_upload, "backup": payload.can_backup}}
        if payload.password:
            upd["password_hash"] = hash_password(payload.password)
        r = await db.media_partners.update_one({"id": pid}, {"$set": upd})
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Firma bulunamadı")
        return {"ok": True}

    @router.delete("/admin/partners/{pid}")
    async def delete_partner(pid: str, admin: dict = Depends(require_admin)):
        await db.media_partners.delete_one({"id": pid})
        await db.media_files.delete_many({"partner_id": pid})
        return {"ok": True}

    @router.get("/admin/partners/{pid}/files")
    async def admin_partner_files(pid: str, admin: dict = Depends(require_admin)):
        rows = await db.media_files.find({"partner_id": pid}, {"_id": 0}).sort("created_at", -1).to_list(2000)
        return {"files": rows}

    # ── PARTNER — auth & profil ──────────────────────────────────────────
    class LoginIn(BaseModel):
        email: str
        password: str

    @router.post("/partner/login")
    async def partner_login(payload: LoginIn, response: Response):
        p = await db.media_partners.find_one({"email": payload.email.strip().lower()})
        if not p or not verify_password(payload.password, p.get("password_hash", "")):
            raise HTTPException(status_code=401, detail="E-posta veya şifre hatalı")
        if not p.get("active", True):
            raise HTTPException(status_code=403, detail="Hesabınız pasif durumda")
        token = create_access_token(p["id"], p["email"], "partner")
        response.set_cookie(key="partner_token", value=token, httponly=True, secure=True, samesite="none", max_age=7*24*3600)
        return {"token": token, "partner": _out(p)}

    @router.post("/partner/logout")
    async def partner_logout(response: Response):
        response.delete_cookie("partner_token")
        return {"ok": True}

    @router.get("/partner/me")
    async def partner_me(p: dict = Depends(get_current_partner)):
        return {"partner": _out(p)}

    class CompanyIn(BaseModel):
        company: dict = {}
        logo_url: Optional[str] = None

    @router.put("/partner/company")
    async def update_company(payload: CompanyIn, p: dict = Depends(get_current_partner)):
        upd = {"company": payload.company or {}}
        if payload.logo_url is not None:
            upd["logo_url"] = payload.logo_url
        await db.media_partners.update_one({"id": p["id"]}, {"$set": upd})
        np = await db.media_partners.find_one({"id": p["id"]}, {"_id": 0})
        return {"partner": _out(np)}

    @router.post("/partner/logo")
    async def upload_logo(p: dict = Depends(get_current_partner), image: UploadFile = File(...)):
        data = await image.read()
        if not data:
            raise HTTPException(status_code=400, detail="Boş dosya")
        ext = (image.filename.rsplit(".", 1)[-1] if "." in image.filename else "png").lower()
        key = f"media/{p['id']}/logo.{ext}"
        put_object(key, data, image.content_type or "image/png")
        url = f"/api/media/partner/logo/{p['id']}.{ext}"
        await db.media_partners.update_one({"id": p["id"]}, {"$set": {"logo_url": url, "logo_key": key}})
        return {"logo_url": url}

    @router.get("/partner/logo/{fname}")
    async def get_logo(fname: str):
        pid = fname.rsplit(".", 1)[0]
        p = await db.media_partners.find_one({"id": pid}, {"_id": 0, "logo_key": 1})
        if not p or not p.get("logo_key"):
            raise HTTPException(status_code=404, detail="Bulunamadı")
        content, ctype = get_object(p["logo_key"])
        return Response(content=content, media_type=ctype or "image/png")

    # ── PARTNER — dosya alanı (yetkiye göre) ─────────────────────────────
    @router.get("/partner/files")
    async def partner_files(p: dict = Depends(get_current_partner)):
        rows = await db.media_files.find({"partner_id": p["id"]}, {"_id": 0}).sort("created_at", -1).to_list(2000)
        return {"files": rows, "perms": p.get("perms", {})}

    @router.post("/partner/upload")
    async def partner_upload(p: dict = Depends(get_current_partner), file: UploadFile = File(...)):
        if not p.get("perms", {}).get("upload"):
            raise HTTPException(status_code=403, detail="Yükleme yetkiniz yok")
        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="Boş dosya")
        fid = new_id()
        ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin").lower()
        key = f"media/{p['id']}/files/{fid}.{ext}"
        put_object(key, data, file.content_type or "application/octet-stream")
        doc = {"id": fid, "partner_id": p["id"], "name": file.filename, "path": key,
               "size": len(data), "content_type": file.content_type, "created_at": now_iso()}
        await db.media_files.insert_one(doc)
        return {"file": {k: v for k, v in doc.items() if k != "_id"}}

    @router.get("/partner/file/{fid}")
    async def partner_download(fid: str, p: dict = Depends(get_current_partner)):
        if not p.get("perms", {}).get("download"):
            raise HTTPException(status_code=403, detail="İndirme yetkiniz yok")
        f = await db.media_files.find_one({"id": fid, "partner_id": p["id"]}, {"_id": 0})
        if not f:
            raise HTTPException(status_code=404, detail="Dosya bulunamadı")
        content, ctype = get_object(f["path"])
        return Response(content=content, media_type=ctype or "application/octet-stream",
                        headers={"Content-Disposition": f'attachment; filename="{f["name"]}"'})

    @router.delete("/partner/file/{fid}")
    async def partner_delete(fid: str, p: dict = Depends(get_current_partner)):
        if not p.get("perms", {}).get("backup"):
            raise HTTPException(status_code=403, detail="Yönetim (yedekleme/silme) yetkiniz yok")
        f = await db.media_files.find_one({"id": fid, "partner_id": p["id"]})
        if not f:
            raise HTTPException(status_code=404, detail="Dosya bulunamadı")
        try:
            delete_object(f["path"])
        except Exception:
            pass
        await db.media_files.delete_one({"id": fid, "partner_id": p["id"]})
        return {"ok": True}

    return router
