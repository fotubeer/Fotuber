"""
Fotuber Medya — B2B Firma (partner) paneli. Fotuber Photography markası altında.
FAZ 1: Admin firma hesaplarını açar/şifre belirler/pasife alır + yetki (indir/yükle/yedekle).
Firma kendi alanına girer, firma bilgisi + logo yükler, yetkisine göre dosya indirir/yükler.
Depolama: dahili object storage (media/{partner_id}/...). NAS/WebDAV sonra eklenecek.
"""
from typing import Optional
import os
import io
import json
import base64 as _b64
import asyncio
from datetime import date, datetime
from fastapi import APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, Form
from pydantic import BaseModel, Field
import jwt


# Fotuber Medya — platform bazlı Türkçe sosyal medya içerik üretimi (Gemini 3 Flash)
_PLATFORM_GUIDE = {
    "instagram_post": ("Instagram Gönderisi", "Sıcak, görsel odaklı, emoji kullan. 3-5 cümle. Sonunda net bir çağrı (yorum/DM/rezervasyon)."),
    "instagram_story": ("Instagram Story", "Çok kısa, 1-2 satır, dikkat çekici. Anket/soru/kaydır çağrısı gibi story etkileşimi öner."),
    "facebook": ("Facebook Gönderisi", "Biraz daha uzun, samimi ve bilgilendirici olabilir. Emoji dengeli kullan."),
    "tiktok": ("TikTok", "Genç, enerjik, trend bir dil kullan. Kısa ve akılda kalıcı. Video fikri de öner."),
    "twitter": ("X (Twitter)", "280 karakteri geçmeyen, vurucu ve net tek bir metin. En fazla 2-3 hashtag."),
}


# Türk özel günleri (sabit Gregoryen tarihler). Anneler/Babalar Günü dinamik hesaplanır.
_FIXED_SPECIAL_DAYS = [
    (1, 1, "Yılbaşı", "🎉"),
    (2, 14, "Sevgililer Günü", "❤️"),
    (3, 8, "Dünya Kadınlar Günü", "💐"),
    (3, 18, "Çanakkale Zaferi", "🇹🇷"),
    (3, 21, "Nevruz Bayramı", "🌱"),
    (4, 23, "Ulusal Egemenlik ve Çocuk Bayramı", "🎈"),
    (5, 1, "Emek ve Dayanışma Günü", "🌷"),
    (5, 19, "Gençlik ve Spor Bayramı", "🎽"),
    (8, 30, "Zafer Bayramı", "🎖️"),
    (9, 1, "Yeni Sezon / Okula Dönüş", "🍂"),
    (10, 29, "Cumhuriyet Bayramı", "🇹🇷"),
    (11, 10, "10 Kasım Atatürk'ü Anma", "🕊️"),
    (11, 24, "Öğretmenler Günü", "📚"),
    (12, 31, "Yılbaşı Arifesi", "✨"),
]


def _nth_weekday(year, month, weekday, n):
    d = date(year, month, 1)
    offset = (weekday - d.weekday()) % 7
    return date(year, month, 1 + offset + (n - 1) * 7)


def _upcoming_special_days(limit=14):
    today = date.today()
    items = []
    for yr in (today.year, today.year + 1):
        for m, d, name, emoji in _FIXED_SPECIAL_DAYS:
            items.append((date(yr, m, d), name, emoji))
        # Anneler Günü — Mayıs'ın 2. Pazarı ; Babalar Günü — Haziran'ın 3. Pazarı
        items.append((_nth_weekday(yr, 5, 6, 2), "Anneler Günü", "🌸"))
        items.append((_nth_weekday(yr, 6, 6, 3), "Babalar Günü", "👔"))
    seen, out = set(), []
    for dt, name, emoji in sorted(items, key=lambda x: x[0]):
        if dt < today:
            continue
        key = (dt.isoformat(), name)
        if key in seen:
            continue
        seen.add(key)
        days_left = (dt - today).days
        out.append({"date": dt.isoformat(), "name": name, "emoji": emoji,
                    "label": dt.strftime("%d.%m.%Y"), "days_left": days_left})
        if len(out) >= limit:
            break
    return out


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
                "brand": {**{"primary_color": "#0ea5e9", "secondary_color": "#f59e0b", "font": "modern",
                             "logo_pos_post": "br", "logo_pos_story": "br"}, **(p.get("brand") or {})},
                "has_logo": bool(p.get("logo_key")),
                "campaign_credits": int(p.get("campaign_credits", 0)),
                "folder": p.get("folder", p["id"]), "created_at": p.get("created_at")}

    def _partner_id_from_token(tok):
        try:
            payload = jwt.decode(tok, deps["JWT_SECRET"], algorithms=[deps["JWT_ALGORITHM"]])
            if payload.get("role") != "partner":
                return None
            return payload.get("sub")
        except jwt.PyJWTError:
            return None

    _FONT_STYLES = {
        "modern": "modern, temiz sans-serif tipografi (Montserrat/Helvetica hissi)",
        "elegant": "zarif, ince serif tipografi (Playfair Display/Didot hissi)",
        "script": "akıcı el yazısı / script tipografi",
        "bold": "kalın, cesur ve dikkat çekici display tipografi",
    }

    def _slug(s: str) -> str:
        tr = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")
        s = (s or "").translate(tr)
        out = "".join(ch if ch.isalnum() else "-" for ch in s).strip("-").lower()
        while "--" in out:
            out = out.replace("--", "-")
        return out[:40] or "firma"

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
        doc["folder"] = f"{_slug(payload.name)}-{doc['id'][:6]}"
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
        key = f"media/{p.get('folder', p['id'])}/logo.{ext}"
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
        key = f"media/{p.get('folder', p['id'])}/files/{fid}.{ext}"
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

    # ── PARTNER — Yapay Zeka İçerik Asistanı (FAZ 2) ─────────────────────
    async def _gemini_content(b64: str, platform_key: str, context: str) -> dict:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        import uuid as _uuid
        key = os.environ.get("EMERGENT_LLM_KEY")
        if not key:
            raise HTTPException(status_code=503, detail="AI anahtarı yapılandırılmamış")
        if b64 and b64.startswith("data:") and "," in b64:
            b64 = b64.split(",", 1)[1]
        label, tone = _PLATFORM_GUIDE.get(platform_key, _PLATFORM_GUIDE["instagram_post"])
        ctx = (context or "").strip()
        system_msg = (
            "Sen bir fotoğraf/video stüdyosu için çalışan uzman bir Türk sosyal medya içerik üreticisisin. "
            "Görseli dikkatle incele ve TAMAMEN TÜRKÇE, akıcı, satış odaklı ve markaya uygun içerik üret. "
            "Klişe ve yapay ifadelerden kaçın; samimi ve profesyonel ol."
        )
        prompt = (
            f"Bu görsel için '{label}' platformuna uygun içerik üret.\n"
            f"Platform tonu: {tone}\n"
            + (f"Ek bağlam / not: {ctx}\n" if ctx else "")
            + "\nSADECE şu JSON formatında yanıt ver (başka hiçbir metin ekleme):\n"
            '{"captions": ["varyant 1", "varyant 2", "varyant 3"], '
            '"hashtags": ["#etiket1", "#etiket2", ...], '
            '"tip": "içeriği daha etkili paylaşmak için tek cümlelik pratik bir öneri"}\n'
            "captions: 3 farklı açıklama varyantı. hashtags: platforma uygun sayıda (Instagram/TikTok 12-20, X en fazla 3), Türkçe + ilgili yabancı popüler etiketler karışık."
        )
        chat = LlmChat(api_key=key, session_id=f"media-ai-{_uuid.uuid4()}", system_message=system_msg) \
            .with_model("gemini", "gemini-3-flash-preview")
        try:
            resp = await chat.send_message(UserMessage(text=prompt, file_contents=[ImageContent(b64)]))
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"AI üretimi başarısız: {e}")
        text = (resp or "").strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.lower().startswith("json"):
                text = text[4:]
        s, e = text.find("{"), text.rfind("}")
        parsed = None
        if s != -1 and e != -1:
            try:
                parsed = json.loads(text[s:e + 1])
            except Exception:
                parsed = None
        if not isinstance(parsed, dict):
            parsed = {"captions": [text] if text else [], "hashtags": [], "tip": ""}
        caps = [c for c in (parsed.get("captions") or []) if isinstance(c, str) and c.strip()]
        tags = [t for t in (parsed.get("hashtags") or []) if isinstance(t, str) and t.strip()]
        tags = [t if t.startswith("#") else f"#{t.lstrip('#')}" for t in tags]
        return {"captions": caps, "hashtags": tags, "tip": (parsed.get("tip") or "").strip(), "platform": platform_key}

    @router.get("/partner/ai-platforms")
    async def ai_platforms(p: dict = Depends(get_current_partner)):
        return {"platforms": [{"key": k, "label": v[0]} for k, v in _PLATFORM_GUIDE.items()]}

    @router.post("/partner/ai-content")
    async def ai_content(
        p: dict = Depends(get_current_partner),
        image: UploadFile = File(...),
        platform: str = Form("instagram_post"),
        context: str = Form(""),
    ):
        data = await image.read()
        if not data:
            raise HTTPException(status_code=400, detail="Boş görsel")
        if len(data) > 12 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Görsel çok büyük (en fazla 12 MB)")
        ctype = (image.content_type or "").lower()
        if ctype and not ctype.startswith("image/"):
            raise HTTPException(status_code=400, detail="Sadece görsel dosyası yükleyin")
        b64 = _b64.b64encode(data).decode()
        result = await _gemini_content(b64, platform, context)
        hid = new_id()
        await db.media_ai_history.insert_one({
            "id": hid, "partner_id": p["id"], "platform": platform,
            "context": (context or "")[:500], "captions": result.get("captions", []),
            "hashtags": result.get("hashtags", []), "tip": result.get("tip", ""),
            "favorite": False, "created_at": now_iso(),
        })
        result["history_id"] = hid
        return result

    # ── PARTNER — İçerik Geçmişi ─────────────────────────────────────────
    @router.get("/partner/ai-history")
    async def ai_history(favorites: bool = False, p: dict = Depends(get_current_partner)):
        q = {"partner_id": p["id"]}
        if favorites:
            q["favorite"] = True
        rows = await db.media_ai_history.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
        labels = {k: v[0] for k, v in _PLATFORM_GUIDE.items()}
        for r in rows:
            r["platform_label"] = labels.get(r.get("platform"), r.get("platform"))
        return {"history": rows}

    @router.post("/partner/ai-history/{hid}/favorite")
    async def ai_history_favorite(hid: str, p: dict = Depends(get_current_partner)):
        h = await db.media_ai_history.find_one({"id": hid, "partner_id": p["id"]}, {"_id": 0, "favorite": 1})
        if not h:
            raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
        fav = not h.get("favorite", False)
        await db.media_ai_history.update_one({"id": hid, "partner_id": p["id"]}, {"$set": {"favorite": fav}})
        return {"favorite": fav}

    @router.delete("/partner/ai-history/{hid}")
    async def ai_history_delete(hid: str, p: dict = Depends(get_current_partner)):
        await db.media_ai_history.delete_one({"id": hid, "partner_id": p["id"]})
        return {"ok": True}

    # ── PARTNER — Özel Gün Takvimi + logolu görsel üretimi (FAZ 3) ────────
    @router.get("/partner/special-days")
    async def special_days(p: dict = Depends(get_current_partner)):
        return {"days": _upcoming_special_days(14)}

    def _overlay_logo(img_bytes: bytes, logo_bytes: Optional[bytes], target_w: int, target_h: int, pos: str = "br") -> bytes:
        from PIL import Image
        base = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
        # hedef orana kırp + yeniden boyutlandır (cover)
        bw, bh = base.size
        scale = max(target_w / bw, target_h / bh)
        base = base.resize((max(1, int(bw * scale)), max(1, int(bh * scale))), Image.LANCZOS)
        bw, bh = base.size
        left, top = (bw - target_w) // 2, (bh - target_h) // 2
        base = base.crop((left, top, left + target_w, top + target_h))
        if logo_bytes:
            try:
                logo = Image.open(io.BytesIO(logo_bytes)).convert("RGBA")
                lw = int(target_w * 0.22)
                lh = int(logo.height * (lw / logo.width))
                logo = logo.resize((lw, lh), Image.LANCZOS)
                pad = int(target_w * 0.04)
                bgpad = int(pad * 0.5)
                plate = Image.new("RGBA", (lw + bgpad * 2, lh + bgpad * 2), (0, 0, 0, 90))
                pk = (pos or "br").lower()
                vch, hch = (pk[0] if len(pk) > 0 else "b"), (pk[1] if len(pk) > 1 else "r")
                if hch == "l":
                    px = pad
                elif hch == "c":
                    px = (target_w - plate.width) // 2
                else:
                    px = target_w - plate.width - pad
                if vch == "t":
                    py = pad
                elif vch == "m":
                    py = (target_h - plate.height) // 2
                else:
                    py = target_h - plate.height - pad
                base.alpha_composite(plate, (px, py))
                base.alpha_composite(logo, (px + bgpad, py + bgpad))
            except Exception:
                pass
        out = io.BytesIO()
        base.convert("RGB").save(out, format="JPEG", quality=90)
        return out.getvalue()

    async def _gen_one_image(prompt: str) -> Optional[str]:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        import uuid as _uuid
        key = os.environ.get("EMERGENT_LLM_KEY")
        chat = LlmChat(api_key=key, session_id=f"media-img-{_uuid.uuid4()}", system_message="Profesyonel sosyal medya görsel tasarımcısısın.") \
            .with_model("gemini", "gemini-2.5-flash-image").with_params(modalities=["image", "text"])
        try:
            _text, images = await chat.send_message_multimodal_response(UserMessage(text=prompt))
        except Exception:
            return None
        if not images:
            return None
        return images[0].get("data", "")

    def _brand_of(p):
        return {**{"primary_color": "#0ea5e9", "secondary_color": "#f59e0b", "font": "modern",
                   "logo_pos_post": "br", "logo_pos_story": "br"}, **(p.get("brand") or {})}

    _POS_NAMES = {"tl": "sol üst", "tc": "üst orta", "tr": "sağ üst", "ml": "sol orta", "mc": "orta",
                  "mr": "sağ orta", "bl": "sol alt", "bc": "alt orta", "br": "sağ alt"}

    async def _make_images(p, fmt, base_prompt, kind, day_name=""):
        fmt = "story" if fmt == "story" else "post"
        tw, th = (1024, 1536) if fmt == "story" else (1024, 1024)
        brand = _brand_of(p)
        logo_pos = brand.get("logo_pos_story" if fmt == "story" else "logo_pos_post", "br")
        styles = [
            "zarif ve minimal, bol boşluklu, modern tipografi, pastel tonlar",
            "sıcak ve premium, altın vurgular, lüks ve şık kompozisyon, koyu zemin",
            "canlı ve enerjik, cesur renkler, dikkat çekici modern grafik",
        ]
        prompts = [f"{base_prompt} Stil: {s}." for s in styles]
        raw = await asyncio.gather(*[_gen_one_image(pr) for pr in prompts])
        logo_bytes = None
        if p.get("logo_key"):
            try:
                logo_bytes, _ = get_object(p["logo_key"])
            except Exception:
                logo_bytes = None
        images = []
        folder = p.get("folder", p["id"])
        for b64img in raw:
            if not b64img:
                continue
            try:
                data = _b64.b64decode(b64img)
                composed = await asyncio.to_thread(_overlay_logo, data, logo_bytes, tw, th, logo_pos)
            except Exception:
                continue
            iid = new_id()
            key = f"media/{folder}/{kind}/{iid}.jpg"
            try:
                put_object(key, composed, "image/jpeg")
            except Exception:
                pass
            await db.media_special_images.insert_one({
                "id": iid, "partner_id": p["id"], "day_name": day_name, "kind": kind,
                "format": fmt, "path": key, "created_at": now_iso(),
            })
            images.append({"id": iid, "data_url": "data:image/jpeg;base64," + _b64.b64encode(composed).decode()})
        return images, bool(logo_bytes)

    class SpecialImgIn(BaseModel):
        day_name: str = Field(min_length=1, max_length=120)
        format: str = "post"

    @router.post("/partner/special-day-images")
    async def special_day_images(payload: SpecialImgIn, p: dict = Depends(get_current_partner)):
        if not os.environ.get("EMERGENT_LLM_KEY"):
            raise HTTPException(status_code=503, detail="AI anahtarı yapılandırılmamış")
        # ANTİ-İSTİSMAR: sadece resmi takvimdeki özel günler için üretilebilir
        valid_names = {d["name"] for d in _upcoming_special_days(60)}
        if payload.day_name not in valid_names:
            raise HTTPException(status_code=400, detail="Yalnızca takvimdeki özel günler için görsel üretilebilir")
        fmt = "story" if payload.format == "story" else "post"
        ratio = "9:16 dikey story" if fmt == "story" else "1:1 kare gönderi"
        brand = _brand_of(p)
        font_desc = _FONT_STYLES.get(brand.get("font", "modern"), _FONT_STYLES["modern"])
        company_name = (p.get("company", {}) or {}).get("name") or p.get("name", "")
        logo_pos = brand.get("logo_pos_story" if fmt == "story" else "logo_pos_post", "br")
        base_prompt = (
            f"'{payload.day_name}' özel günü için {ratio} formatında profesyonel bir sosyal medya kutlama görseli tasarla. "
            f"Görselde SADECE bu özel güne dair TÜRKÇE kısa ve şık bir kutlama mesajı yer alsın; başka konu, kişi veya ürün ekleme. "
            f"Yüksek kaliteli, marka kalitesinde, temiz kompozisyon. "
            f"Kurumsal kimlik — ana renk {brand.get('primary_color')}, ikincil renk {brand.get('secondary_color')}; tipografi: {font_desc}. "
            + (f"Firma/marka: {company_name}. " if company_name else "")
            + f"{_POS_NAMES.get(logo_pos, 'sağ alt')} köşede logo için boşluk bırak. Fotoğraf stüdyosu/medya ajansı estetiğinde."
        )
        images, has_logo = await _make_images(p, fmt, base_prompt, "special", payload.day_name)
        if not images:
            raise HTTPException(status_code=502, detail="AI görsel üretemedi, lütfen tekrar deneyin")
        return {"images": images, "day_name": payload.day_name, "format": fmt, "has_logo": has_logo}

    # ── PARTNER — Kampanya Kredisi (admin onaylı) + kampanya görseli ──────
    @router.get("/partner/credits")
    async def partner_credits(p: dict = Depends(get_current_partner)):
        fresh = await db.media_partners.find_one({"id": p["id"]}, {"_id": 0, "campaign_credits": 1})
        pending = await db.media_credit_requests.find_one({"partner_id": p["id"], "status": "pending"}, {"_id": 0})
        return {"campaign_credits": int((fresh or {}).get("campaign_credits", 0)), "pending_request": pending}

    class CreditReqIn(BaseModel):
        amount: int = Field(default=5, ge=1, le=100)
        note: str = ""

    @router.post("/partner/credit-request")
    async def request_credits(payload: CreditReqIn, p: dict = Depends(get_current_partner)):
        if await db.media_credit_requests.find_one({"partner_id": p["id"], "status": "pending"}):
            raise HTTPException(status_code=400, detail="Zaten bekleyen bir talebiniz var")
        doc = {"id": new_id(), "partner_id": p["id"], "partner_name": p.get("name"),
               "partner_email": p.get("email"), "amount": payload.amount, "note": (payload.note or "")[:300],
               "status": "pending", "created_at": now_iso()}
        await db.media_credit_requests.insert_one(doc)
        return {"ok": True, "request": {k: v for k, v in doc.items() if k != "_id"}}

    class CampaignImgIn(BaseModel):
        brief: str = Field(min_length=3, max_length=600)
        format: str = "post"

    @router.post("/partner/campaign-images")
    async def campaign_images(payload: CampaignImgIn, p: dict = Depends(get_current_partner)):
        if not os.environ.get("EMERGENT_LLM_KEY"):
            raise HTTPException(status_code=503, detail="AI anahtarı yapılandırılmamış")
        # kredi düş (atomik) — yetersizse reddet
        r = await db.media_partners.update_one(
            {"id": p["id"], "campaign_credits": {"$gte": 1}}, {"$inc": {"campaign_credits": -1}})
        if r.modified_count == 0:
            raise HTTPException(status_code=402, detail="Kampanya krediniz yok. Lütfen yöneticiden kredi talep edin.")
        fmt = "story" if payload.format == "story" else "post"
        ratio = "9:16 dikey story" if fmt == "story" else "1:1 kare gönderi"
        brand = _brand_of(p)
        font_desc = _FONT_STYLES.get(brand.get("font", "modern"), _FONT_STYLES["modern"])
        company_name = (p.get("company", {}) or {}).get("name") or p.get("name", "")
        logo_pos = brand.get("logo_pos_story" if fmt == "story" else "logo_pos_post", "br")
        base_prompt = (
            f"Bir fotoğraf/medya firması için {ratio} formatında profesyonel bir KAMPANYA / tanıtım görseli tasarla. "
            f"Kampanya özeti: {payload.brief}. Görselde TÜRKÇE, satış odaklı kısa ve şık bir metin yer alsın. "
            f"Yüksek kaliteli, marka kalitesinde, temiz kompozisyon. "
            f"Kurumsal kimlik — ana renk {brand.get('primary_color')}, ikincil renk {brand.get('secondary_color')}; tipografi: {font_desc}. "
            + (f"Firma/marka: {company_name}. " if company_name else "")
            + f"{_POS_NAMES.get(logo_pos, 'sağ alt')} köşede logo için boşluk bırak."
        )
        images, has_logo = await _make_images(p, fmt, base_prompt, "campaign", "")
        if not images:
            # üretim başarısızsa krediyi iade et
            await db.media_partners.update_one({"id": p["id"]}, {"$inc": {"campaign_credits": 1}})
            raise HTTPException(status_code=502, detail="AI görsel üretemedi, krediniz iade edildi")
        left = (await db.media_partners.find_one({"id": p["id"]}, {"_id": 0, "campaign_credits": 1})).get("campaign_credits", 0)
        return {"images": images, "format": fmt, "has_logo": has_logo, "campaign_credits": int(left)}

    # ── PARTNER — Marka Kiti ─────────────────────────────────────────────
    class BrandIn(BaseModel):
        primary_color: str = "#0ea5e9"
        secondary_color: str = "#f59e0b"
        font: str = "modern"
        logo_pos_post: str = "br"
        logo_pos_story: str = "br"

    @router.put("/partner/brand")
    async def update_brand(payload: BrandIn, p: dict = Depends(get_current_partner)):
        font = payload.font if payload.font in _FONT_STYLES else "modern"
        valid_pos = {"tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"}
        brand = {
            "primary_color": payload.primary_color[:9], "secondary_color": payload.secondary_color[:9],
            "font": font,
            "logo_pos_post": payload.logo_pos_post if payload.logo_pos_post in valid_pos else "br",
            "logo_pos_story": payload.logo_pos_story if payload.logo_pos_story in valid_pos else "br",
        }
        await db.media_partners.update_one({"id": p["id"]}, {"$set": {"brand": brand}})
        return {"brand": brand}

    # ── PARTNER — Özel Gün Görsel Galerisi ───────────────────────────────
    @router.get("/partner/special-gallery")
    async def special_gallery(p: dict = Depends(get_current_partner)):
        rows = await db.media_special_images.find({"partner_id": p["id"]}, {"_id": 0, "path": 0}).sort("created_at", -1).to_list(500)
        return {"images": rows}

    @router.get("/partner/special-image/{iid}")
    async def special_image(iid: str, request: Request, t: str = ""):
        tok = t or request.cookies.get("partner_token", "")
        if not tok:
            auth = request.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                tok = auth[7:]
        pid = _partner_id_from_token(tok)
        if not pid:
            raise HTTPException(status_code=401, detail="Giriş gerekli")
        rec = await db.media_special_images.find_one({"id": iid, "partner_id": pid}, {"_id": 0})
        if not rec:
            raise HTTPException(status_code=404, detail="Görsel bulunamadı")
        content, ctype = get_object(rec["path"])
        return Response(content=content, media_type=ctype or "image/jpeg")

    @router.delete("/partner/special-image/{iid}")
    async def delete_special_image(iid: str, p: dict = Depends(get_current_partner)):
        rec = await db.media_special_images.find_one({"id": iid, "partner_id": p["id"]})
        if rec:
            try:
                delete_object(rec["path"])
            except Exception:
                pass
            await db.media_special_images.delete_one({"id": iid, "partner_id": p["id"]})
        return {"ok": True}

    # ── ADMIN — kampanya kredisi yönetimi ────────────────────────────────
    @router.get("/admin/credit-requests")
    async def admin_credit_requests(admin: dict = Depends(require_admin)):
        rows = await db.media_credit_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
        rows.sort(key=lambda r: (r.get("status") != "pending", r.get("created_at", "")), reverse=False)
        return {"requests": rows}

    class GrantIn(BaseModel):
        amount: Optional[int] = None

    @router.post("/admin/credit-requests/{rid}/approve")
    async def approve_credit_request(rid: str, payload: GrantIn, admin: dict = Depends(require_admin)):
        req = await db.media_credit_requests.find_one({"id": rid}, {"_id": 0})
        if not req:
            raise HTTPException(status_code=404, detail="Talep bulunamadı")
        if req.get("status") != "pending":
            raise HTTPException(status_code=400, detail="Bu talep zaten işlenmiş")
        amount = int(payload.amount) if payload.amount is not None else int(req.get("amount", 0))
        if amount < 1:
            raise HTTPException(status_code=400, detail="Geçersiz miktar")
        await db.media_partners.update_one({"id": req["partner_id"]}, {"$inc": {"campaign_credits": amount}})
        await db.media_credit_requests.update_one({"id": rid}, {"$set": {"status": "approved", "granted": amount, "processed_at": now_iso()}})
        return {"ok": True, "granted": amount}

    @router.post("/admin/credit-requests/{rid}/reject")
    async def reject_credit_request(rid: str, admin: dict = Depends(require_admin)):
        r = await db.media_credit_requests.update_one({"id": rid, "status": "pending"}, {"$set": {"status": "rejected", "processed_at": now_iso()}})
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Bekleyen talep bulunamadı")
        return {"ok": True}

    class AdjustIn(BaseModel):
        amount: int

    @router.post("/admin/partners/{pid}/credits")
    async def adjust_partner_credits(pid: str, payload: AdjustIn, admin: dict = Depends(require_admin)):
        p = await db.media_partners.find_one({"id": pid}, {"_id": 0, "campaign_credits": 1})
        if not p:
            raise HTTPException(status_code=404, detail="Firma bulunamadı")
        new_val = max(0, int(p.get("campaign_credits", 0)) + int(payload.amount))
        await db.media_partners.update_one({"id": pid}, {"$set": {"campaign_credits": new_val}})
        return {"campaign_credits": new_val}

    return router
