"""
Davetiye Tasarım Stüdyosu (Invitation Design Studio) — additive module.

A Canva-like editor backend: stores design projects (Fabric.js canvas JSON),
serves the curated Turkish-supporting font catalogue + starter templates, and
handles PNG asset uploads to the shared object storage.
"""
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File
from pydantic import BaseModel, Field
from starlette.responses import Response as StarletteResponse

# ---------------------------------------------------------------------------
# Font catalogue — Google Fonts with Turkish (latin-ext) glyph support.
# ---------------------------------------------------------------------------
FONTS: List[dict] = [
    {"family": "Playfair Display", "cat": "serif"},
    {"family": "Cormorant Garamond", "cat": "serif"},
    {"family": "EB Garamond", "cat": "serif"},
    {"family": "Cardo", "cat": "serif"},
    {"family": "Libre Baskerville", "cat": "serif"},
    {"family": "Crimson Text", "cat": "serif"},
    {"family": "Merriweather", "cat": "serif"},
    {"family": "PT Serif", "cat": "serif"},
    {"family": "Spectral", "cat": "serif"},
    {"family": "Bitter", "cat": "serif"},
    {"family": "Arvo", "cat": "serif"},
    {"family": "Marcellus", "cat": "serif"},
    {"family": "Cinzel", "cat": "serif"},
    {"family": "DM Serif Display", "cat": "serif"},
    {"family": "Fraunces", "cat": "serif"},
    {"family": "Yeseva One", "cat": "serif"},
    {"family": "Abril Fatface", "cat": "display"},
    {"family": "Bebas Neue", "cat": "display"},
    {"family": "Anton", "cat": "display"},
    {"family": "Oswald", "cat": "sans"},
    {"family": "Montserrat", "cat": "sans"},
    {"family": "Poppins", "cat": "sans"},
    {"family": "Raleway", "cat": "sans"},
    {"family": "Nunito", "cat": "sans"},
    {"family": "Roboto", "cat": "sans"},
    {"family": "Open Sans", "cat": "sans"},
    {"family": "Lato", "cat": "sans"},
    {"family": "Work Sans", "cat": "sans"},
    {"family": "Rubik", "cat": "sans"},
    {"family": "Quicksand", "cat": "sans"},
    {"family": "Josefin Sans", "cat": "sans"},
    {"family": "Manrope", "cat": "sans"},
    {"family": "Inter", "cat": "sans"},
    {"family": "DM Sans", "cat": "sans"},
    {"family": "Sora", "cat": "sans"},
    {"family": "Space Grotesk", "cat": "sans"},
    {"family": "Archivo", "cat": "sans"},
    {"family": "PT Sans", "cat": "sans"},
    {"family": "Ubuntu", "cat": "sans"},
    {"family": "Comfortaa", "cat": "sans"},
    {"family": "Great Vibes", "cat": "script"},
    {"family": "Dancing Script", "cat": "script"},
    {"family": "Pacifico", "cat": "script"},
    {"family": "Lobster", "cat": "script"},
    {"family": "Caveat", "cat": "script"},
    {"family": "Sacramento", "cat": "script"},
    {"family": "Satisfy", "cat": "script"},
    {"family": "Parisienne", "cat": "script"},
    {"family": "Cookie", "cat": "script"},
    {"family": "Tangerine", "cat": "script"},
    {"family": "Allura", "cat": "script"},
    {"family": "Alex Brush", "cat": "script"},
    {"family": "Pinyon Script", "cat": "script"},
    {"family": "Italianno", "cat": "script"},
    {"family": "Marck Script", "cat": "script"},
    {"family": "Amatic SC", "cat": "handwriting"},
    {"family": "Kalam", "cat": "handwriting"},
    {"family": "Sriracha", "cat": "handwriting"},
]

# ---------------------------------------------------------------------------
# Starter templates — Fabric.js-compatible object graphs (kept minimal; the
# editor renders/extends them). background is a solid color rect via `bg`.
# ---------------------------------------------------------------------------
TEMPLATES: List[dict] = [
    {
        "id": "blank-portrait", "name": "Boş Tuval (Dikey)", "category": "Boş",
        "width": 1080, "height": 1350, "bg": "#ffffff", "thumb_bg": "#ffffff", "objects": [],
    },
    {
        "id": "blank-square", "name": "Boş Tuval (Kare)", "category": "Boş",
        "width": 1080, "height": 1080, "bg": "#faf7f2", "thumb_bg": "#faf7f2", "objects": [],
    },
    {
        "id": "wedding-gold", "name": "Altın Çiçekli Düğün", "category": "Düğün",
        "width": 1080, "height": 1350, "bg": "#f7f2e8",
        "bg_image": "https://static.prod-images.emergentagent.com/jobs/fc76a8ea-b91a-4ba1-bc47-0822af835ee4/images/b87ae60f5163682798cfbae27534e6c46489e165c755721827ea0f7efe489433.jpeg",
        "objects": [
            {"type": "textbox", "text": "Düğünümüze Davetlisiniz", "left": 540, "top": 470,
             "fontSize": 60, "fontFamily": "Cormorant Garamond", "fill": "#7a5c2e",
             "textAlign": "center", "originX": "center", "width": 760},
            {"type": "textbox", "text": "Ayşe & Mehmet", "left": 540, "top": 650,
             "fontSize": 120, "fontFamily": "Great Vibes", "fill": "#9a7b3f",
             "textAlign": "center", "originX": "center", "width": 820},
            {"type": "textbox", "text": "12 Ağustos 2026 · 18:00", "left": 540, "top": 850,
             "fontSize": 40, "fontFamily": "Montserrat", "fill": "#7a5c2e",
             "textAlign": "center", "originX": "center", "width": 760},
        ],
    },
    {
        "id": "wedding-navy", "name": "Lacivert Art-Deco Düğün", "category": "Düğün",
        "width": 1080, "height": 1350, "bg": "#0b1f3a",
        "bg_image": "https://static.prod-images.emergentagent.com/jobs/fc76a8ea-b91a-4ba1-bc47-0822af835ee4/images/fda66983ac91504f2566b8a0eae14e6b240f70c5290991a6ed9857fce19b2ccc.jpeg",
        "objects": [
            {"type": "textbox", "text": "Save the Date", "left": 540, "top": 560,
             "fontSize": 46, "fontFamily": "Marcellus", "fill": "#e8c27a",
             "textAlign": "center", "originX": "center", "width": 640},
            {"type": "textbox", "text": "Elif & Kaan", "left": 540, "top": 680,
             "fontSize": 104, "fontFamily": "Playfair Display", "fill": "#ffffff",
             "textAlign": "center", "originX": "center", "width": 700},
        ],
    },
    {
        "id": "engagement-blush", "name": "Pudra Nişan", "category": "Nişan",
        "width": 1080, "height": 1350, "bg": "#f7e6e6",
        "bg_image": "https://static.prod-images.emergentagent.com/jobs/fc76a8ea-b91a-4ba1-bc47-0822af835ee4/images/4c6cba3976f1f826a09aada37bc26e683418384aa32b76e308fcf82c6539f3d2.jpeg",
        "objects": [
            {"type": "textbox", "text": "Nişan Törenimize Bekleriz", "left": 540, "top": 560,
             "fontSize": 54, "fontFamily": "Cormorant Garamond", "fill": "#8a4b52",
             "textAlign": "center", "originX": "center", "width": 700},
            {"type": "textbox", "text": "Zeynep & Can", "left": 540, "top": 700,
             "fontSize": 110, "fontFamily": "Dancing Script", "fill": "#b06b74",
             "textAlign": "center", "originX": "center", "width": 760},
        ],
    },
    {
        "id": "henna-bordeaux", "name": "Bordo Altın Kına", "category": "Kına",
        "width": 1080, "height": 1350, "bg": "#5a0f1c",
        "bg_image": "https://static.prod-images.emergentagent.com/jobs/fc76a8ea-b91a-4ba1-bc47-0822af835ee4/images/781b9d5b2770336e0ffaebc0950e76d0a7aa5bc57331133437ea11a150b3f900.jpeg",
        "objects": [
            {"type": "textbox", "text": "Kına Gecemize\nDavetlisiniz", "left": 540, "top": 560,
             "fontSize": 70, "fontFamily": "Marcellus", "fill": "#f0d28a",
             "textAlign": "center", "originX": "center", "width": 700},
            {"type": "textbox", "text": "Elif için", "left": 540, "top": 780,
             "fontSize": 96, "fontFamily": "Great Vibes", "fill": "#ffe9b0",
             "textAlign": "center", "originX": "center", "width": 700},
        ],
    },
    {
        "id": "birthday-fun", "name": "Renkli Doğum Günü", "category": "Doğum Günü",
        "width": 1080, "height": 1350, "bg": "#eef6ff",
        "bg_image": "https://static.prod-images.emergentagent.com/jobs/fc76a8ea-b91a-4ba1-bc47-0822af835ee4/images/c2972b5db81e28158cdd890543c395b9b66164a16525cbaf764055ab48a75fee.jpeg",
        "objects": [
            {"type": "textbox", "text": "Doğum Günü Partisi", "left": 540, "top": 560,
             "fontSize": 72, "fontFamily": "Bebas Neue", "fill": "#6a3fa0",
             "textAlign": "center", "originX": "center", "width": 760},
            {"type": "textbox", "text": "Elif 7 Yaşında!", "left": 540, "top": 700,
             "fontSize": 80, "fontFamily": "Pacifico", "fill": "#ef476f",
             "textAlign": "center", "originX": "center", "width": 800},
        ],
    },
    {
        "id": "sunnet-blue", "name": "Mavi Sünnet", "category": "Sünnet",
        "width": 1080, "height": 1350, "bg": "#12306b",
        "bg_image": "https://static.prod-images.emergentagent.com/jobs/fc76a8ea-b91a-4ba1-bc47-0822af835ee4/images/e67d6b18591bfee0ff67b2e36c47b3a6f6b217f5bd6ff6520493577d75cacde9.jpeg",
        "objects": [
            {"type": "textbox", "text": "Sünnet Düğünümüze\nDavetlisiniz", "left": 540, "top": 560,
             "fontSize": 62, "fontFamily": "Marcellus", "fill": "#ffffff",
             "textAlign": "center", "originX": "center", "width": 720},
            {"type": "textbox", "text": "Yusuf", "left": 540, "top": 780,
             "fontSize": 110, "fontFamily": "Great Vibes", "fill": "#dbe6ff",
             "textAlign": "center", "originX": "center", "width": 700},
        ],
    },
    {
        "id": "soz-rosegold", "name": "Rose Gold Söz", "category": "Söz",
        "width": 1080, "height": 1350, "bg": "#f3e9e0",
        "bg_image": "https://static.prod-images.emergentagent.com/jobs/fc76a8ea-b91a-4ba1-bc47-0822af835ee4/images/69b1683782720256360c420b328b3ff1cb1c7f2b4fe28960547cbf6c708841a1.jpeg",
        "objects": [
            {"type": "textbox", "text": "Söz Törenimize\nBekleriz", "left": 540, "top": 560,
             "fontSize": 60, "fontFamily": "Cormorant Garamond", "fill": "#8a6a3f",
             "textAlign": "center", "originX": "center", "width": 700},
            {"type": "textbox", "text": "Elif & Kaan", "left": 540, "top": 760,
             "fontSize": 100, "fontFamily": "Great Vibes", "fill": "#b08a5f",
             "textAlign": "center", "originX": "center", "width": 720},
        ],
    },
    {
        "id": "mevlut-green", "name": "Zarif Mevlüt", "category": "Mevlüt",
        "width": 1080, "height": 1350, "bg": "#eef2e6",
        "bg_image": "https://static.prod-images.emergentagent.com/jobs/fc76a8ea-b91a-4ba1-bc47-0822af835ee4/images/08bc89d9a3442a45307e27766eaf28769682a4f57a740f3df455aa8150e9394e.jpeg",
        "objects": [
            {"type": "textbox", "text": "Mevlid-i Şerif\nOkutulacaktır", "left": 540, "top": 580,
             "fontSize": 58, "fontFamily": "Marcellus", "fill": "#3f5a3f",
             "textAlign": "center", "originX": "center", "width": 680},
            {"type": "textbox", "text": "Teşrifleriniz rica olunur", "left": 540, "top": 780,
             "fontSize": 38, "fontFamily": "Cormorant Garamond", "fill": "#5a7a5a",
             "textAlign": "center", "originX": "center", "width": 680},
        ],
    },
    {
        "id": "opening-gold", "name": "Görkemli Açılış", "category": "Açılış",
        "width": 1080, "height": 1350, "bg": "#0a0a0a",
        "bg_image": "https://static.prod-images.emergentagent.com/jobs/fc76a8ea-b91a-4ba1-bc47-0822af835ee4/images/c8d2ac702cda46c4597357a8b3ef514038b82138c843d6ec588929c8e1deeabb.jpeg",
        "objects": [
            {"type": "textbox", "text": "Açılışımıza\nDavetlisiniz", "left": 540, "top": 560,
             "fontSize": 66, "fontFamily": "Marcellus", "fill": "#e8c27a",
             "textAlign": "center", "originX": "center", "width": 720},
            {"type": "textbox", "text": "Büyük Açılış · 20 Eylül", "left": 540, "top": 780,
             "fontSize": 40, "fontFamily": "Montserrat", "fill": "#ffffff",
             "textAlign": "center", "originX": "center", "width": 720},
        ],
    },
]

# AI prompt packs by event type — one-click themes (Kına/Nişan etc.)
AI_PRESETS: List[dict] = [
    {"id": "wedding-royal", "event": "Düğün", "title": "Kraliyet Altın",
     "prompt": "Görkemli düğün davetiyesi arka planı, altın ve fildişi, zarif çiçek ve yaprak süslemeleri, lüks ve romantik"},
    {"id": "wedding-minimal", "event": "Düğün", "title": "Modern Minimal",
     "prompt": "Modern minimalist düğün davetiyesi arka planı, krem ve toprak tonları, ince zarif çizgiler, sade şık"},
    {"id": "engagement-blush", "event": "Nişan", "title": "Pudra Çiçek",
     "prompt": "Zarif nişan davetiyesi arka planı, pudra pembe ve toz gül suluboya çiçekler, romantik ve yumuşak"},
    {"id": "engagement-emerald", "event": "Nişan", "title": "Zümrüt & Altın",
     "prompt": "Nişan davetiyesi arka planı, zümrüt yeşili ve altın botanik motifler, lüks ve zarif"},
    {"id": "henna-classic", "event": "Kına", "title": "Bordo Kına",
     "prompt": "Türk kına gecesi davetiyesi arka planı, bordo ve altın, şal ve mehndi desenleri, mum ışığı, sıcak ve festival havası"},
    {"id": "henna-anatolian", "event": "Kına", "title": "Anadolu Motif",
     "prompt": "Kına gecesi davetiyesi arka planı, kırmızı ve altın Anadolu kilim ve çini motifleri, geleneksel ve zarif"},
    {"id": "sunnet-royal", "event": "Sünnet", "title": "Mavi Sultan",
     "prompt": "Sünnet düğünü davetiyesi arka planı, saray mavisi ve gümüş, ay yıldız motifleri, görkemli ve neşeli"},
    {"id": "birthday-kids", "event": "Doğum Günü", "title": "Renkli Balon",
     "prompt": "Neşeli çocuk doğum günü davetiyesi arka planı, renkli balonlar ve konfeti, pastel, eğlenceli"},
    {"id": "birthday-elegant", "event": "Doğum Günü", "title": "Şık Kutlama",
     "prompt": "Şık doğum günü davetiyesi arka planı, siyah ve altın, ışıltılı konfeti, zarif kutlama"},
    {"id": "engagement-soz", "event": "Söz", "title": "Söz Töreni",
     "prompt": "Söz töreni davetiyesi arka planı, şampanya ve rose gold tonları, ince çiçek detayları, sıcak ve zarif"},
    {"id": "mevlut-classic", "event": "Mevlüt", "title": "Huzurlu Mevlüt",
     "prompt": "Mevlüt davetiyesi arka planı, krem ve yeşil, ince İslami arabesk ve geometrik bordür, huzurlu ve zarif"},
    {"id": "opening-lux", "event": "Açılış", "title": "Lüks Açılış",
     "prompt": "İşyeri açılış davetiyesi arka planı, siyah ve altın, kurdele ve konfeti detayları, kurumsal ve görkemli"},
]




class DesignProjectIn(BaseModel):
    title: str = "İsimsiz Tasarım"
    canvas_json: dict = Field(default_factory=dict)
    width: int = 1080
    height: int = 1350
    thumbnail: Optional[str] = None  # data URL (small preview)
    personalization: Optional[dict] = None  # {enabled, placeholder, box:{...}}


def get_router(db, deps):
    router = APIRouter(prefix="/api/design", tags=["design-studio"])

    get_current_user = deps["get_current_user"]
    new_id = deps["new_id"]
    now_iso = deps["now_iso"]
    put_object = deps["put_object"]
    get_object = deps["get_object"]

    # ---- Public catalogues --------------------------------------------------
    @router.get("/fonts")
    async def list_fonts():
        return {"fonts": FONTS, "count": len(FONTS)}

    @router.get("/templates")
    async def list_templates():
        return {"templates": TEMPLATES}

    @router.get("/ai-presets")
    async def list_ai_presets():
        return {"presets": AI_PRESETS}

    # ---- Favorite templates (per user) --------------------------------------
    @router.get("/favorites")
    async def list_favorites(user: dict = Depends(get_current_user)):
        favs = await db.design_favorites.find({"user_id": user["id"]}, {"_id": 0, "template_id": 1}).to_list(200)
        return {"favorites": [f["template_id"] for f in favs]}

    @router.post("/favorites/{template_id}")
    async def add_favorite(template_id: str, user: dict = Depends(get_current_user)):
        await db.design_favorites.update_one(
            {"user_id": user["id"], "template_id": template_id},
            {"$setOnInsert": {"user_id": user["id"], "template_id": template_id, "created_at": now_iso()}},
            upsert=True)
        return {"ok": True}

    @router.delete("/favorites/{template_id}")
    async def remove_favorite(template_id: str, user: dict = Depends(get_current_user)):
        await db.design_favorites.delete_one({"user_id": user["id"], "template_id": template_id})
        return {"ok": True}

    # ---- Projects (owner-scoped) --------------------------------------------
    @router.post("/projects")
    async def create_project(payload: DesignProjectIn, user: dict = Depends(get_current_user)):
        doc = {
            "id": new_id(),
            "owner_user_id": user["id"],
            "title": payload.title,
            "canvas_json": payload.canvas_json,
            "width": payload.width,
            "height": payload.height,
            "thumbnail": payload.thumbnail,
            "personalization": payload.personalization or {"enabled": False},
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.design_projects.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.get("/projects")
    async def list_projects(user: dict = Depends(get_current_user)):
        items = await db.design_projects.find(
            {"owner_user_id": user["id"]}, {"_id": 0, "canvas_json": 0}
        ).sort("updated_at", -1).to_list(200)
        return items

    @router.get("/projects/{pid}")
    async def get_project(pid: str, user: dict = Depends(get_current_user)):
        doc = await db.design_projects.find_one(
            {"id": pid, "owner_user_id": user["id"]}, {"_id": 0}
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Tasarım bulunamadı")
        return doc

    @router.put("/projects/{pid}")
    async def update_project(pid: str, payload: DesignProjectIn, user: dict = Depends(get_current_user)):
        existing = await db.design_projects.find_one({"id": pid, "owner_user_id": user["id"]})
        if not existing:
            raise HTTPException(status_code=404, detail="Tasarım bulunamadı")
        upd = {
            "title": payload.title,
            "canvas_json": payload.canvas_json,
            "width": payload.width,
            "height": payload.height,
            "thumbnail": payload.thumbnail,
            "personalization": payload.personalization or {"enabled": False},
            "updated_at": now_iso(),
        }
        await db.design_projects.update_one({"id": pid}, {"$set": upd})
        doc = await db.design_projects.find_one({"id": pid}, {"_id": 0})
        return doc

    @router.delete("/projects/{pid}")
    async def delete_project(pid: str, user: dict = Depends(get_current_user)):
        res = await db.design_projects.delete_one({"id": pid, "owner_user_id": user["id"]})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Tasarım bulunamadı")
        return {"ok": True}

    # ---- PNG asset upload ---------------------------------------------------
    @router.post("/upload")
    async def upload_asset(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
        content_type = file.content_type or "image/png"
        if not content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Sadece görsel yüklenebilir")
        data = await file.read()
        if len(data) > 15 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Görsel 15MB'den küçük olmalı")
        asset_id = new_id()
        ext = "png" if "png" in content_type else ("jpg" if "jpeg" in content_type else "img")
        path = f"design/{user['id']}/{asset_id}.{ext}"
        put_object(path, data, content_type)
        await db.design_assets.insert_one({
            "id": asset_id, "owner_user_id": user["id"], "path": path,
            "content_type": content_type, "created_at": now_iso(),
        })
        return {"id": asset_id, "url": f"/api/design/asset/{asset_id}"}

    @router.get("/asset/{asset_id}")
    async def get_asset(asset_id: str):
        meta = await db.design_assets.find_one({"id": asset_id}, {"_id": 0})
        if not meta:
            raise HTTPException(status_code=404, detail="Görsel bulunamadı")
        data, ctype = get_object(meta["path"])
        return StarletteResponse(content=data, media_type=ctype,
                                 headers={"Cache-Control": "public, max-age=31536000"})

    return router
