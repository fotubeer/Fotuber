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
        "id": "blank-portrait", "name": "Boş Tuval (Dikey)", "width": 1080, "height": 1350,
        "bg": "#ffffff", "thumb_bg": "#ffffff", "objects": [],
    },
    {
        "id": "blank-square", "name": "Boş Tuval (Kare)", "width": 1080, "height": 1080,
        "bg": "#faf7f2", "thumb_bg": "#faf7f2", "objects": [],
    },
    {
        "id": "wedding-classic", "name": "Klasik Düğün", "width": 1080, "height": 1350,
        "bg": "#0b1f3a", "thumb_bg": "#0b1f3a",
        "objects": [
            {"type": "textbox", "text": "Düğünümüze\nDavetlisiniz", "left": 540, "top": 260,
             "fontSize": 92, "fontFamily": "Playfair Display", "fill": "#e8c27a",
             "textAlign": "center", "originX": "center", "width": 900},
            {"type": "textbox", "text": "Ayşe & Mehmet", "left": 540, "top": 640,
             "fontSize": 120, "fontFamily": "Great Vibes", "fill": "#ffffff",
             "textAlign": "center", "originX": "center", "width": 900},
            {"type": "textbox", "text": "12 Ağustos 2026 · 18:00", "left": 540, "top": 900,
             "fontSize": 46, "fontFamily": "Montserrat", "fill": "#e8c27a",
             "textAlign": "center", "originX": "center", "width": 900},
        ],
    },
    {
        "id": "engagement-blush", "name": "Nişan (Pudra)", "width": 1080, "height": 1350,
        "bg": "#f7e6e6", "thumb_bg": "#f7e6e6",
        "objects": [
            {"type": "textbox", "text": "Nişan Törenimize\nBekleriz", "left": 540, "top": 300,
             "fontSize": 80, "fontFamily": "Cormorant Garamond", "fill": "#8a4b52",
             "textAlign": "center", "originX": "center", "width": 900},
            {"type": "textbox", "text": "Zeynep & Can", "left": 540, "top": 700,
             "fontSize": 110, "fontFamily": "Dancing Script", "fill": "#b06b74",
             "textAlign": "center", "originX": "center", "width": 900},
        ],
    },
    {
        "id": "birthday-fun", "name": "Doğum Günü", "width": 1080, "height": 1080,
        "bg": "#1a1030", "thumb_bg": "#1a1030",
        "objects": [
            {"type": "textbox", "text": "Doğum Günü Partisi", "left": 540, "top": 280,
             "fontSize": 90, "fontFamily": "Bebas Neue", "fill": "#ffd166",
             "textAlign": "center", "originX": "center", "width": 960},
            {"type": "textbox", "text": "Elif 7 Yaşında!", "left": 540, "top": 560,
             "fontSize": 70, "fontFamily": "Pacifico", "fill": "#ef476f",
             "textAlign": "center", "originX": "center", "width": 960},
        ],
    },
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
