"""
Etkinlik Galerisi (Event Gallery) — additive Studio Suite module.

Studio-authenticated management (events, chunked photo upload, service packs,
orders + PDF) plus PUBLIC client selection via a share token. Reuses studio auth
via studio.build_get_current_studio. No existing routes are touched.
"""
import io
import os
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Request
from pydantic import BaseModel, Field
from starlette.responses import Response as StarletteResponse, StreamingResponse

from routers.studio import build_get_current_studio

RAW_EXTS = {"cr2", "cr3", "nef", "arw", "dng", "raf", "orf", "rw2", "sr2", "pef", "raw"}

# In-memory chunk buffer for resumable uploads (single-process dev/preview).
_UPLOADS: dict = {}


class EventIn(BaseModel):
    name: str = Field(min_length=1)
    client_name: str = ""
    event_date: str = ""
    album_limit: int = 0     # 0 = sınırsız
    canvas_limit: int = 0
    retouch_limit: int = 0


class ServicePackIn(BaseModel):
    name: str = Field(min_length=1)
    price: float = Field(ge=0)
    description: str = ""
    active: bool = True


class SelectionItem(BaseModel):
    photo_id: str
    album: bool = False
    canvas: bool = False
    retouch: bool = False


class SelectionIn(BaseModel):
    selections: list[SelectionItem] = []
    upsells: list[str] = []
    note: str = ""


def _thumb_bytes(data: bytes):
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(data))
        im = im.convert("RGB")
        im.thumbnail((640, 640))
        out = io.BytesIO()
        im.save(out, format="JPEG", quality=80)
        return out.getvalue()
    except Exception:
        return None


def get_router(db, deps):
    router = APIRouter(prefix="/api", tags=["event-gallery"])
    get_current_studio = build_get_current_studio(db, deps["JWT_SECRET"], deps["JWT_ALGORITHM"])
    new_id = deps["new_id"]
    now_iso = deps["now_iso"]
    put_object = deps["put_object"]
    get_object = deps["get_object"]

    def _event_out(ev, counts=None):
        return {
            "id": ev["id"], "name": ev["name"], "client_name": ev.get("client_name", ""),
            "event_date": ev.get("event_date", ""), "album_limit": ev.get("album_limit", 0),
            "canvas_limit": ev.get("canvas_limit", 0), "retouch_limit": ev.get("retouch_limit", 0),
            "share_token": ev["share_token"], "status": ev.get("status", "open"),
            "submitted": ev.get("submitted", False), "created_at": ev.get("created_at"),
            "photo_count": (counts or {}).get("photos", 0),
            "order_status": ev.get("order_status"),
        }

    # ==================== STUDIO: EVENTS ====================
    @router.post("/studio/gallery/events")
    async def create_event(payload: EventIn, acc: dict = Depends(get_current_studio)):
        doc = {
            "id": new_id(), "studio_id": acc["id"], "name": payload.name,
            "client_name": payload.client_name, "event_date": payload.event_date,
            "album_limit": payload.album_limit, "canvas_limit": payload.canvas_limit,
            "retouch_limit": payload.retouch_limit,
            "share_token": secrets.token_urlsafe(9), "status": "open",
            "submitted": False, "order_status": None, "created_at": now_iso(),
        }
        await db.gallery_events.insert_one(doc)
        return _event_out(doc)

    @router.get("/studio/gallery/events")
    async def list_events(acc: dict = Depends(get_current_studio)):
        evs = await db.gallery_events.find({"studio_id": acc["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
        out = []
        for ev in evs:
            pc = await db.gallery_photos.count_documents({"event_id": ev["id"]})
            out.append(_event_out(ev, {"photos": pc}))
        return out

    @router.get("/studio/gallery/events/{event_id}")
    async def get_event(event_id: str, acc: dict = Depends(get_current_studio)):
        ev = await db.gallery_events.find_one({"id": event_id, "studio_id": acc["id"]}, {"_id": 0})
        if not ev:
            raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
        photos = await db.gallery_photos.find({"event_id": event_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
        for p in photos:
            p["url"] = f"/api/gallery/photo/{p['id']}"
            p["thumb"] = f"/api/gallery/thumb/{p['id']}" if p.get("thumb_path") else None
        pc = len(photos)
        return {"event": _event_out(ev, {"photos": pc}), "photos": photos}

    @router.delete("/studio/gallery/events/{event_id}")
    async def delete_event(event_id: str, acc: dict = Depends(get_current_studio)):
        ev = await db.gallery_events.find_one({"id": event_id, "studio_id": acc["id"]})
        if not ev:
            raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
        await db.gallery_photos.delete_many({"event_id": event_id})
        await db.gallery_orders.delete_many({"event_id": event_id})
        await db.gallery_events.delete_one({"id": event_id})
        return {"ok": True}

    # ==================== STUDIO: CHUNKED UPLOAD ====================
    @router.post("/studio/gallery/events/{event_id}/upload-init")
    async def upload_init(event_id: str, filename: str = Form(...), size: int = Form(0),
                          total_chunks: int = Form(...), acc: dict = Depends(get_current_studio)):
        ev = await db.gallery_events.find_one({"id": event_id, "studio_id": acc["id"]})
        if not ev:
            raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
        upload_id = new_id()
        ext = (filename.rsplit(".", 1)[-1] if "." in filename else "").lower()
        _UPLOADS[upload_id] = {
            "event_id": event_id, "studio_id": acc["id"], "filename": filename,
            "ext": ext, "size": size, "total": total_chunks, "chunks": {},
        }
        return {"upload_id": upload_id, "is_raw": ext in RAW_EXTS,
                "warning": "RAW dosyalar büyüktür ve tarayıcıda önizlenemez." if ext in RAW_EXTS else None}

    @router.post("/studio/gallery/upload-chunk/{upload_id}")
    async def upload_chunk(upload_id: str, index: int = Form(...), chunk: UploadFile = File(...),
                           acc: dict = Depends(get_current_studio)):
        u = _UPLOADS.get(upload_id)
        if not u or u["studio_id"] != acc["id"]:
            raise HTTPException(status_code=404, detail="Yükleme oturumu bulunamadı")
        u["chunks"][index] = await chunk.read()
        return {"received": index, "count": len(u["chunks"]), "total": u["total"]}

    @router.post("/studio/gallery/upload-complete/{upload_id}")
    async def upload_complete(upload_id: str, acc: dict = Depends(get_current_studio)):
        u = _UPLOADS.get(upload_id)
        if not u or u["studio_id"] != acc["id"]:
            raise HTTPException(status_code=404, detail="Yükleme oturumu bulunamadı")
        if len(u["chunks"]) != u["total"]:
            raise HTTPException(status_code=400, detail="Eksik parça var, yükleme tamamlanamadı")
        data = b"".join(u["chunks"][i] for i in sorted(u["chunks"].keys()))
        ext = u["ext"] or "bin"
        is_raw = ext in RAW_EXTS
        photo_id = new_id()
        content_type = f"image/{'jpeg' if ext in ('jpg','jpeg') else ext}" if not is_raw else "application/octet-stream"
        path = f"gallery/{u['studio_id']}/{u['event_id']}/{photo_id}.{ext}"
        put_object(path, data, content_type)
        thumb_path = None
        if not is_raw:
            tb = _thumb_bytes(data)
            if tb:
                thumb_path = f"gallery/{u['studio_id']}/{u['event_id']}/{photo_id}_thumb.jpg"
                put_object(thumb_path, tb, "image/jpeg")
        doc = {
            "id": photo_id, "event_id": u["event_id"], "studio_id": u["studio_id"],
            "filename": u["filename"], "path": path, "thumb_path": thumb_path,
            "content_type": content_type, "size": len(data), "is_raw": is_raw,
            "sel_album": False, "sel_canvas": False, "sel_retouch": False,
            "created_at": now_iso(),
        }
        await db.gallery_photos.insert_one(doc)
        del _UPLOADS[upload_id]
        return {"id": photo_id, "is_raw": is_raw, "filename": u["filename"],
                "url": f"/api/gallery/photo/{photo_id}",
                "thumb": f"/api/gallery/thumb/{photo_id}" if thumb_path else None}

    @router.delete("/studio/gallery/photos/{photo_id}")
    async def delete_photo(photo_id: str, acc: dict = Depends(get_current_studio)):
        r = await db.gallery_photos.delete_one({"id": photo_id, "studio_id": acc["id"]})
        if r.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Fotoğraf bulunamadı")
        return {"ok": True}

    # ==================== STUDIO: SERVICE PACKS (UPSELL) ====================
    @router.get("/studio/gallery/service-packs")
    async def list_packs(acc: dict = Depends(get_current_studio)):
        return await db.gallery_service_packs.find({"studio_id": acc["id"]}, {"_id": 0}).sort("created_at", 1).to_list(100)

    @router.post("/studio/gallery/service-packs")
    async def create_pack(payload: ServicePackIn, acc: dict = Depends(get_current_studio)):
        doc = payload.model_dump()
        doc.update({"id": new_id(), "studio_id": acc["id"], "created_at": now_iso()})
        await db.gallery_service_packs.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.put("/studio/gallery/service-packs/{pid}")
    async def update_pack(pid: str, payload: ServicePackIn, acc: dict = Depends(get_current_studio)):
        r = await db.gallery_service_packs.update_one({"id": pid, "studio_id": acc["id"]}, {"$set": payload.model_dump()})
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Paket bulunamadı")
        return await db.gallery_service_packs.find_one({"id": pid}, {"_id": 0})

    @router.delete("/studio/gallery/service-packs/{pid}")
    async def delete_pack(pid: str, acc: dict = Depends(get_current_studio)):
        r = await db.gallery_service_packs.delete_one({"id": pid, "studio_id": acc["id"]})
        if r.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Paket bulunamadı")
        return {"ok": True}

    # ==================== STUDIO: ORDERS ====================
    @router.get("/studio/gallery/orders")
    async def list_orders(acc: dict = Depends(get_current_studio)):
        return await db.gallery_orders.find({"studio_id": acc["id"]}, {"_id": 0}).sort("created_at", -1).to_list(300)

    @router.put("/studio/gallery/orders/{order_id}/status")
    async def update_order_status(order_id: str, request: Request, acc: dict = Depends(get_current_studio)):
        body = await request.json()
        status = body.get("status")
        if status not in {"new", "processing", "ready", "delivered"}:
            raise HTTPException(status_code=400, detail="Geçersiz durum")
        order = await db.gallery_orders.find_one({"id": order_id, "studio_id": acc["id"]})
        if not order:
            raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
        await db.gallery_orders.update_one({"id": order_id}, {"$set": {"status": status}})
        await db.gallery_events.update_one({"id": order["event_id"]}, {"$set": {"order_status": status}})
        return {"ok": True, "status": status}

    @router.get("/studio/gallery/orders/{order_id}/pdf")
    async def order_pdf(order_id: str, acc: dict = Depends(get_current_studio)):
        order = await db.gallery_orders.find_one({"id": order_id, "studio_id": acc["id"]}, {"_id": 0})
        if not order:
            raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
        pdf = _build_order_pdf(order, acc)
        return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                                 headers={"Content-Disposition": f'attachment; filename="siparis-{order.get("order_no","")}.pdf"'})

    # ==================== PUBLIC: CLIENT SELECTION ====================
    @router.get("/gallery/public/{token}")
    async def public_event(token: str):
        ev = await db.gallery_events.find_one({"share_token": token}, {"_id": 0})
        if not ev:
            raise HTTPException(status_code=404, detail="Galeri bulunamadı")
        photos = await db.gallery_photos.find({"event_id": ev["id"]}, {"_id": 0}).sort("created_at", 1).to_list(1000)
        clean = []
        for p in photos:
            has_thumb = bool(p.get("thumb_path")) and not p.get("is_raw")
            clean.append({
                "id": p["id"], "filename": p.get("filename", ""), "is_raw": p.get("is_raw", False),
                "url": f"/api/gallery/photo/{p['id']}",
                "thumb": f"/api/gallery/thumb/{p['id']}" if has_thumb else None,
            })
        photos = clean
        packs = await db.gallery_service_packs.find({"studio_id": ev["studio_id"], "active": True}, {"_id": 0}).to_list(100)
        studio = await db.studio_accounts.find_one({"id": ev["studio_id"]}, {"_id": 0, "firma_adi": 1})
        return {
            "event": {"name": ev["name"], "client_name": ev.get("client_name", ""),
                      "event_date": ev.get("event_date", ""), "album_limit": ev.get("album_limit", 0),
                      "canvas_limit": ev.get("canvas_limit", 0), "retouch_limit": ev.get("retouch_limit", 0),
                      "submitted": ev.get("submitted", False), "status": ev.get("status", "open")},
            "firma_adi": (studio or {}).get("firma_adi", "Stüdyo"),
            "photos": photos, "service_packs": packs,
        }

    @router.post("/gallery/public/{token}/select")
    async def public_select(token: str, payload: SelectionIn):
        ev = await db.gallery_events.find_one({"share_token": token})
        if not ev:
            raise HTTPException(status_code=404, detail="Galeri bulunamadı")
        if ev.get("submitted"):
            raise HTTPException(status_code=400, detail="Seçim zaten gönderilmiş")
        # Only count/apply selections for photos that actually belong to this event
        valid_ids = set(await db.gallery_photos.distinct("id", {"event_id": ev["id"]}))
        sels = [s for s in payload.selections if s.photo_id in valid_ids]
        album_n = sum(1 for s in sels if s.album)
        canvas_n = sum(1 for s in sels if s.canvas)
        retouch_n = sum(1 for s in sels if s.retouch)
        # Katı albüm/kanvas/retouch limitleri (0 = sınırsız)
        if ev.get("album_limit", 0) and album_n > ev["album_limit"]:
            raise HTTPException(status_code=400, detail=f"Albüm limiti {ev['album_limit']}. {album_n} seçtiniz.")
        if ev.get("canvas_limit", 0) and canvas_n > ev["canvas_limit"]:
            raise HTTPException(status_code=400, detail=f"Kanvas limiti {ev['canvas_limit']}. {canvas_n} seçtiniz.")
        if ev.get("retouch_limit", 0) and retouch_n > ev["retouch_limit"]:
            raise HTTPException(status_code=400, detail=f"Retouch limiti {ev['retouch_limit']}. {retouch_n} seçtiniz.")

        for s in sels:
            await db.gallery_photos.update_one(
                {"id": s.photo_id, "event_id": ev["id"]},
                {"$set": {"sel_album": s.album, "sel_canvas": s.canvas, "sel_retouch": s.retouch}})

        packs = []
        upsell_total = 0.0
        if payload.upsells:
            docs = await db.gallery_service_packs.find({"id": {"$in": payload.upsells}}, {"_id": 0}).to_list(100)
            for d in docs:
                packs.append({"name": d["name"], "price": d["price"]})
                upsell_total += float(d.get("price", 0))

        order_no = "SIP-" + secrets.token_hex(3).upper()
        order = {
            "id": new_id(), "order_no": order_no, "event_id": ev["id"], "studio_id": ev["studio_id"],
            "event_name": ev["name"], "client_name": ev.get("client_name", ""),
            "album_count": album_n, "canvas_count": canvas_n, "retouch_count": retouch_n,
            "upsells": packs, "upsell_total": upsell_total, "note": payload.note,
            "status": "new", "created_at": now_iso(),
        }
        await db.gallery_orders.insert_one(order)
        await db.gallery_events.update_one({"id": ev["id"]}, {"$set": {"submitted": True, "order_status": "new"}})
        order.pop("_id", None)
        return {"ok": True, "order_no": order_no}

    # ==================== PUBLIC: PHOTO SERVING ====================
    @router.get("/gallery/photo/{photo_id}")
    async def serve_photo(photo_id: str):
        p = await db.gallery_photos.find_one({"id": photo_id}, {"_id": 0})
        if not p:
            raise HTTPException(status_code=404, detail="Fotoğraf bulunamadı")
        data, ctype = get_object(p["path"])
        return StarletteResponse(content=data, media_type=ctype or "application/octet-stream",
                                 headers={"Cache-Control": "public, max-age=86400"})

    @router.get("/gallery/thumb/{photo_id}")
    async def serve_thumb(photo_id: str):
        p = await db.gallery_photos.find_one({"id": photo_id}, {"_id": 0})
        if not p or not p.get("thumb_path"):
            raise HTTPException(status_code=404, detail="Önizleme yok")
        data, ctype = get_object(p["thumb_path"])
        return StarletteResponse(content=data, media_type="image/jpeg",
                                 headers={"Cache-Control": "public, max-age=86400"})

    return router


def _build_order_pdf(order: dict, acc: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as pdfcanvas

    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=A4)
    w, h = A4
    y = h - 30 * mm
    c.setFont("Helvetica-Bold", 18)
    c.drawString(25 * mm, y, "Siparis Formu")
    c.setFont("Helvetica", 10)
    c.drawRightString(w - 25 * mm, y, acc.get("firma_adi", "Studio"))
    y -= 6 * mm
    c.setStrokeColorRGB(0.8, 0.8, 0.8)
    c.line(25 * mm, y, w - 25 * mm, y)
    y -= 12 * mm

    def row(label, value):
        nonlocal y
        c.setFont("Helvetica-Bold", 11)
        c.drawString(25 * mm, y, f"{label}:")
        c.setFont("Helvetica", 11)
        c.drawString(70 * mm, y, str(value))
        y -= 8 * mm

    row("Siparis No", order.get("order_no", ""))
    row("Etkinlik", order.get("event_name", ""))
    row("Musteri", order.get("client_name", "") or "-")
    row("Tarih", (order.get("created_at", "") or "")[:10])
    row("Durum", order.get("status", ""))
    y -= 4 * mm
    c.setFont("Helvetica-Bold", 12)
    c.drawString(25 * mm, y, "Secimler")
    y -= 9 * mm
    row("Album", order.get("album_count", 0))
    row("Kanvas", order.get("canvas_count", 0))
    row("Retouch", order.get("retouch_count", 0))

    if order.get("upsells"):
        y -= 4 * mm
        c.setFont("Helvetica-Bold", 12)
        c.drawString(25 * mm, y, "Ek Hizmetler")
        y -= 9 * mm
        for up in order["upsells"]:
            row(up.get("name", ""), f"{up.get('price', 0)} TL")
        row("Ek Hizmet Toplam", f"{order.get('upsell_total', 0)} TL")

    if order.get("note"):
        y -= 4 * mm
        c.setFont("Helvetica-Bold", 12)
        c.drawString(25 * mm, y, "Not")
        y -= 8 * mm
        c.setFont("Helvetica", 10)
        c.drawString(25 * mm, y, str(order["note"])[:120])

    c.showPage()
    c.save()
    return buf.getvalue()
