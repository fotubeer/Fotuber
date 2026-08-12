"""
Etkinlik Galerisi (Event Gallery) — additive Studio Suite module.

Studio-authenticated management (events, chunked photo upload, service packs,
orders + PDF) plus PUBLIC client selection via a share token. Reuses studio auth
via studio.build_get_current_studio. No existing routes are touched.
"""
import io
import os
import secrets
import zipfile
from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Request
from pydantic import BaseModel, Field
from starlette.responses import Response as StarletteResponse, StreamingResponse

from routers.studio import build_get_current_studio, _studio_state, _merged_plan


def _gallery_durations(plan):
    mp = _merged_plan(plan or "trial")
    return (mp.get("link_days", 2), mp.get("del_days", 4))


def _quota_error(message: str):
    """402 with an [UPGRADE] marker so the frontend can show the upgrade screen."""
    return HTTPException(status_code=402, detail=f"[UPGRADE] {message}")

RAW_EXTS = {"cr2", "cr3", "nef", "arw", "dng", "raf", "orf", "rw2", "sr2", "pef", "raw"}

# Package-based durations now come from the (editable) plan config via _merged_plan.

# Order lifecycle (client-visible). Keys are stored; labels shown to client.
ORDER_FLOW = ["new", "preparing", "printing", "shipping", "completed"]
ORDER_LABELS = {"new": "İnceleniyor", "preparing": "Hazırlanıyor", "printing": "Baskıda",
                "shipping": "Kargoda", "completed": "Tamamlandı"}

# In-memory chunk buffer for resumable uploads (single-process dev/preview).
_UPLOADS: dict = {}


class EventIn(BaseModel):
    name: str = Field(min_length=1)
    client_name: str = ""
    client_phone: str = ""
    client_email: str = ""
    event_date: str = ""
    album_limit: int = 0     # 0 = sınırsız
    canvas_limit: int = 0
    retouch_limit: int = 0


class ServicePackIn(BaseModel):
    name: str = Field(min_length=1)
    price: float = Field(ge=0)
    description: str = ""
    active: bool = True
    kind: str = "Diğer"          # Baskı / Çerçeve / Ahşap Tablo / Cam Tablo / Albüm / Diğer
    max_qty: int = 0             # 0 = sınırsız; müşterinin bu hizmet için seçebileceği maks. adet


class SelectionItem(BaseModel):
    photo_id: str
    album: bool = False
    canvas: bool = False
    retouch: bool = False
    packs: list[str] = []          # bu fotoğrafa atanan özel hizmet paketi id'leri


class SelectionIn(BaseModel):
    selections: list[SelectionItem] = []
    upsells: list[str] = []        # geriye dönük uyumluluk (foto'ya atanmamış genel paketler)
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
    send_email = deps.get("send_email")
    email_configured = deps.get("email_configured")

    def _event_out(ev, counts=None):
        return {
            "id": ev["id"], "name": ev["name"], "client_name": ev.get("client_name", ""),
            "client_phone": ev.get("client_phone", ""),
            "client_email": ev.get("client_email", ""),
            "event_date": ev.get("event_date", ""), "album_limit": ev.get("album_limit", 0),
            "canvas_limit": ev.get("canvas_limit", 0), "retouch_limit": ev.get("retouch_limit", 0),
            "share_token": ev["share_token"], "status": ev.get("status", "open"),
            "submitted": ev.get("submitted", False), "created_at": ev.get("created_at"),
            "photo_count": (counts or {}).get("photos", 0),
            "order_status": ev.get("order_status"),
            "order_status_label": ORDER_LABELS.get(ev.get("order_status"), None),
            "link_expires_at": ev.get("link_expires_at"),
            "originals_delete_at": ev.get("originals_delete_at"),
            "extra_link_used": ev.get("extra_link_used", False),
            "originals_purged": ev.get("originals_purged", False),
            "link_expired": _is_past(ev.get("link_expires_at")),
        }

    def _is_past(iso):
        if not iso:
            return False
        try:
            return datetime.now(timezone.utc) > datetime.fromisoformat(iso)
        except Exception:
            return False

    def _add_days(days):
        from datetime import timedelta
        return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()

    async def _purge_if_due(ev):
        """After the package deletion window, delete only the ORIGINAL hi-res files.
        Thumbnails, filenames (selection codes) and all order/selection metadata are
        preserved so the studio can still reference which photo was which."""
        if ev.get("originals_purged"):
            return ev
        if not _is_past(ev.get("originals_delete_at")):
            return ev
        photos = await db.gallery_photos.find({"event_id": ev["id"]}, {"_id": 0, "id": 1, "path": 1, "original_purged": 1}).to_list(5000)
        for p in photos:
            if p.get("original_purged"):
                continue
            if p.get("path"):
                try:
                    deps.get("delete_object", lambda *_: None)(p["path"])
                except Exception:
                    pass
            await db.gallery_photos.update_one({"id": p["id"]}, {"$set": {"original_purged": True}})
        await db.gallery_events.update_one({"id": ev["id"]}, {"$set": {"originals_purged": True, "status": "expired"}})
        ev["originals_purged"] = True
        ev["status"] = "expired"
        return ev

    # ==================== STUDIO: EVENTS ====================
    @router.post("/studio/gallery/events")
    async def create_event(payload: EventIn, acc: dict = Depends(get_current_studio)):
        state = _studio_state(acc)
        if not state["active"]:
            raise _quota_error("Deneme/abonelik süreniz doldu. Devam etmek için bir paket seçin.")
        max_events = state["limits"].get("max_events", 0)
        current = await db.gallery_events.count_documents({"studio_id": acc["id"]})
        if max_events and current >= max_events:
            raise _quota_error(f"Paket etkinlik limitine ulaştınız ({max_events}). Daha fazlası için paketinizi yükseltin.")
        link_days, del_days = _gallery_durations(acc.get("plan"))
        doc = {
            "id": new_id(), "studio_id": acc["id"], "name": payload.name,
            "client_name": payload.client_name, "client_phone": (payload.client_phone or "").strip(),
            "client_email": (payload.client_email or "").strip(),
            "event_date": payload.event_date,
            "album_limit": payload.album_limit, "canvas_limit": payload.canvas_limit,
            "retouch_limit": payload.retouch_limit,
            "share_token": secrets.token_urlsafe(9), "status": "open",
            "submitted": False, "order_status": None, "created_at": now_iso(),
            "link_expires_at": _add_days(link_days),
            "originals_delete_at": _add_days(del_days),
            "extra_link_used": False, "originals_purged": False,
            "reminder_sent": False,
        }
        await db.gallery_events.insert_one(doc)
        return _event_out(doc)

    @router.post("/studio/gallery/events/{event_id}/extend-link")
    async def extend_link(event_id: str, acc: dict = Depends(get_current_studio)):
        ev = await db.gallery_events.find_one({"id": event_id, "studio_id": acc["id"]}, {"_id": 0})
        if not ev:
            raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
        if ev.get("originals_purged"):
            raise HTTPException(status_code=400, detail="Orijinal dosyalar silindiği için link yenilenemez.")
        link_days, _ = _gallery_durations(acc.get("plan"))
        base = datetime.now(timezone.utc)
        try:
            cur = datetime.fromisoformat(ev["link_expires_at"])
            if cur > base:
                base = cur
        except Exception:
            pass
        from datetime import timedelta
        new_exp = base + timedelta(days=link_days)
        # Client link can never outlive the originals-deletion date (studio window).
        capped = False
        try:
            odel = datetime.fromisoformat(ev["originals_delete_at"])
            if new_exp > odel:
                new_exp = odel
                capped = True
        except Exception:
            pass
        new_exp_iso = new_exp.isoformat()
        await db.gallery_events.update_one({"id": event_id}, {"$set": {"link_expires_at": new_exp_iso, "extra_link_used": True}})
        note = "Müşteri linki yenilendi. Orijinal dosya silinme tarihi değişmedi."
        if capped:
            note = "Link, orijinal dosya silinme tarihine kadar uzatıldı (bu tarihi aşamaz)."
        return {"ok": True, "link_expires_at": new_exp_iso, "note": note}

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
        ev = await _purge_if_due(ev)
        photos = await db.gallery_photos.find({"event_id": event_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
        for p in photos:
            purged = p.get("original_purged", False)
            p["original_purged"] = purged
            p["url"] = None if purged else f"/api/gallery/photo/{p['id']}"
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
        # Per-event storage quota (package-based, e.g. trial 10 GB/event)
        limits = _studio_state(acc)["limits"]
        cap_bytes = int(limits.get("storage_gb", 0)) * 1024 * 1024 * 1024
        if cap_bytes:
            agg = await db.gallery_photos.aggregate([
                {"$match": {"event_id": event_id}},
                {"$group": {"_id": None, "total": {"$sum": "$size"}}},
            ]).to_list(1)
            used = (agg[0]["total"] if agg else 0) or 0
            if used + max(0, size) > cap_bytes:
                raise _quota_error(f"Etkinlik yükleme limitine ulaştınız ({limits.get('storage_gb')} GB). Daha fazlası için paketinizi yükseltin.")
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

    @router.get("/studio/gallery/events/{event_id}/download")
    async def download_originals(event_id: str, acc: dict = Depends(get_current_studio)):
        """Studio-only ZIP of ORIGINAL hi-res files (no watermark). Filenames = selection codes."""
        ev = await db.gallery_events.find_one({"id": event_id, "studio_id": acc["id"]}, {"_id": 0})
        if not ev:
            raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
        if ev.get("originals_purged"):
            raise HTTPException(status_code=400, detail="Orijinal dosyalar silme süresi dolduğu için indirilemez.")
        photos = await db.gallery_photos.find({"event_id": event_id}, {"_id": 0}).sort("created_at", 1).to_list(5000)
        if not photos:
            raise HTTPException(status_code=404, detail="Bu etkinlikte fotoğraf yok.")
        buf = io.BytesIO()
        used = set()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
            for p in photos:
                if p.get("original_purged") or not p.get("path"):
                    continue
                try:
                    data, _ct = get_object(p["path"])
                except Exception:
                    continue
                name = p.get("filename") or f"{p['id']}.jpg"
                # de-dupe filenames inside the zip
                base_name, i = name, 1
                while name in used:
                    stem, dot, ext = base_name.rpartition(".")
                    name = f"{stem}_{i}.{ext}" if dot else f"{base_name}_{i}"
                    i += 1
                used.add(name)
                zf.writestr(name, data)
        buf.seek(0)
        safe = "".join(ch for ch in (ev.get("name") or "etkinlik") if ch.isalnum() or ch in "-_") or "etkinlik"
        return StreamingResponse(buf, media_type="application/zip",
                                 headers={"Content-Disposition": f'attachment; filename="{safe}-orijinaller.zip"'})

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
        q = {"studio_id": acc["id"]}
        # Employees see only orders assigned to them; owner sees all.
        if not acc.get("_is_owner", True):
            q["assigned_to"] = acc.get("_emp_id")
        orders = await db.gallery_orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(300)
        for o in orders:
            o["status_label"] = ORDER_LABELS.get(o.get("status"), o.get("status"))
        return orders

    @router.get("/studio/gallery/order-flow")
    async def order_flow(acc: dict = Depends(get_current_studio)):
        return {"flow": [{"key": k, "label": ORDER_LABELS[k]} for k in ORDER_FLOW]}

    @router.put("/studio/gallery/orders/{order_id}/status")
    async def update_order_status(order_id: str, request: Request, acc: dict = Depends(get_current_studio)):
        body = await request.json()
        status = body.get("status")
        # Accept new 5-step flow + legacy values for backward compatibility.
        if status not in set(ORDER_FLOW) | {"ready", "delivered", "processing"}:
            raise HTTPException(status_code=400, detail="Geçersiz durum")
        order = await db.gallery_orders.find_one({"id": order_id, "studio_id": acc["id"]})
        if not order:
            raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
        await db.gallery_orders.update_one({"id": order_id}, {"$set": {"status": status}})
        await db.gallery_events.update_one({"id": order["event_id"]}, {"$set": {"order_status": status}})
        return {"ok": True, "status": status, "status_label": ORDER_LABELS.get(status, status)}

    @router.put("/studio/gallery/orders/{order_id}/assign")
    async def assign_order(order_id: str, request: Request, acc: dict = Depends(get_current_studio)):
        if not acc.get("_is_owner", True):
            raise HTTPException(status_code=403, detail="Yalnızca firma sahibi personel atayabilir.")
        body = await request.json()
        emp_id = body.get("employee_id") or None
        assigned_name = None
        if emp_id:
            emp = await db.studio_employees.find_one({"id": emp_id, "studio_id": acc["id"]}, {"_id": 0})
            if not emp:
                raise HTTPException(status_code=404, detail="Çalışan bulunamadı")
            assigned_name = emp.get("name") or emp.get("username")
        r = await db.gallery_orders.update_one({"id": order_id, "studio_id": acc["id"]},
                                               {"$set": {"assigned_to": emp_id, "assigned_name": assigned_name}})
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
        return {"ok": True, "assigned_to": emp_id, "assigned_name": assigned_name}

    # ==================== STUDIO: GALLERY SETTINGS (watermark / originals) ====================
    @router.get("/studio/gallery/settings")
    async def get_gallery_settings(acc: dict = Depends(get_current_studio)):
        trial = (acc.get("plan") or "trial") == "trial"
        return {
            "watermark": True if trial else acc.get("gallery_watermark", True),
            "allow_originals": False if trial else acc.get("gallery_allow_originals", False),
            "watermark_forced": trial,
        }

    @router.put("/studio/gallery/settings")
    async def set_gallery_settings(request: Request, acc: dict = Depends(get_current_studio)):
        if not acc.get("_is_owner", True):
            raise HTTPException(status_code=403, detail="Yalnızca firma sahibi değiştirebilir.")
        body = await request.json()
        upd = {}
        if "watermark" in body:
            upd["gallery_watermark"] = bool(body["watermark"])
        if "allow_originals" in body:
            upd["gallery_allow_originals"] = bool(body["allow_originals"])
        if upd:
            await db.studio_accounts.update_one({"id": acc["id"]}, {"$set": upd})
        trial = (acc.get("plan") or "trial") == "trial"
        return {"ok": True, "watermark_forced": trial}

    # ==================== STUDIO: EXPIRY REMINDERS (24h before deletion) ====================
    @router.get("/studio/gallery/reminders")
    async def gallery_reminders(acc: dict = Depends(get_current_studio)):
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        horizon = now + timedelta(hours=24)
        evs = await db.gallery_events.find(
            {"studio_id": acc["id"], "originals_purged": {"$ne": True}}, {"_id": 0}
        ).to_list(500)
        firma = acc.get("firma_adi", "Stüdyo")
        out = []
        for ev in evs:
            dstr = ev.get("originals_delete_at")
            if not dstr:
                continue
            try:
                dt = datetime.fromisoformat(dstr)
            except Exception:
                continue
            if dt > horizon:  # not within the next 24h yet
                continue
            msg = (f"Merhaba, {ev.get('name')} etkinliği fotoğraflarınızın indirme süresi yakında sona erecek. "
                   f"Fotoğraflarınızı indirmediyseniz lütfen süre bitmeden işleminizi tamamlayın. "
                   f"Süreyi uzatmak için paket satın alabilirsiniz. — {firma}")
            digits = "".join(ch for ch in (ev.get("client_phone") or "") if ch.isdigit())
            wa = None
            if digits:
                num = digits if digits.startswith("90") else "90" + digits.lstrip("0")
                wa = f"https://wa.me/{num}?text={quote(msg)}"
            emailed = ev.get("reminder_sent", False)
            if not emailed and ev.get("client_email") and send_email and email_configured and email_configured():
                try:
                    await send_email(ev["client_email"], f"İndirme süreniz sona eriyor — {ev.get('name')}",
                                     f"<p>Merhaba,</p><p>{msg}</p>", msg)
                    await db.gallery_events.update_one({"id": ev["id"]}, {"$set": {"reminder_sent": True}})
                    emailed = True
                except Exception:
                    pass
            out.append({
                "id": ev["id"], "name": ev.get("name"), "client_name": ev.get("client_name", ""),
                "client_phone": ev.get("client_phone", ""), "client_email": ev.get("client_email", ""),
                "originals_delete_at": dstr, "reminder_sent": emailed,
                "whatsapp_url": wa, "whatsapp_message": msg, "overdue": dt < now,
            })
        out.sort(key=lambda x: x["originals_delete_at"])
        return {"reminders": out}


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
        ev = await _purge_if_due(ev)
        # Link expiry: block access to photos when the client link window has passed.
        link_expired = _is_past(ev.get("link_expires_at"))
        studio = await db.studio_accounts.find_one({"id": ev["studio_id"]}, {"_id": 0, "firma_adi": 1, "plan": 1, "gallery_watermark": 1, "gallery_allow_originals": 1})
        trial = ((studio or {}).get("plan") or "trial") == "trial"
        watermark = True if trial else (studio or {}).get("gallery_watermark", True)
        allow_originals = False if trial else (studio or {}).get("gallery_allow_originals", False)
        base = {
            "event": {"name": ev["name"], "client_name": ev.get("client_name", ""),
                      "event_date": ev.get("event_date", ""), "album_limit": ev.get("album_limit", 0),
                      "canvas_limit": ev.get("canvas_limit", 0), "retouch_limit": ev.get("retouch_limit", 0),
                      "submitted": ev.get("submitted", False), "status": ev.get("status", "open"),
                      "order_status": ev.get("order_status"),
                      "order_status_label": ORDER_LABELS.get(ev.get("order_status")),
                      "link_expires_at": ev.get("link_expires_at")},
            "firma_adi": (studio or {}).get("firma_adi", "Stüdyo"),
            "order_flow": [{"key": k, "label": ORDER_LABELS[k]} for k in ORDER_FLOW],
            "watermark": watermark, "allow_originals": allow_originals,
            "link_expired": link_expired, "originals_purged": ev.get("originals_purged", False),
        }
        if link_expired or ev.get("originals_purged"):
            base["photos"] = []
            base["service_packs"] = []
            base["message"] = "Galeri görüntüleme/indirme süresi doldu. Yeni erişim için fotoğrafçınızla iletişime geçin."
            return base
        photos = await db.gallery_photos.find({"event_id": ev["id"]}, {"_id": 0}).sort("created_at", 1).to_list(1000)
        clean = []
        for p in photos:
            has_thumb = bool(p.get("thumb_path")) and not p.get("is_raw")
            clean.append({
                "id": p["id"], "filename": p.get("filename", ""), "is_raw": p.get("is_raw", False),
                "url": f"/api/gallery/photo/{p['id']}",
                "thumb": f"/api/gallery/thumb/{p['id']}" if has_thumb else None,
            })
        packs = await db.gallery_service_packs.find({"studio_id": ev["studio_id"], "active": True}, {"_id": 0}).to_list(100)
        base["photos"] = clean
        base["service_packs"] = packs
        return base

    @router.post("/gallery/public/{token}/select")
    async def public_select(token: str, payload: SelectionIn):
        ev = await db.gallery_events.find_one({"share_token": token})
        if not ev:
            raise HTTPException(status_code=404, detail="Galeri bulunamadı")
        if _is_past(ev.get("link_expires_at")) or ev.get("originals_purged"):
            raise HTTPException(status_code=403, detail="Galeri süresi doldu. Fotoğrafçınızla iletişime geçin.")
        if ev.get("submitted"):
            raise HTTPException(status_code=400, detail="Seçim zaten gönderilmiş")
        # Photo id -> filename (selection code) map for photos belonging to this event
        photo_docs = await db.gallery_photos.find({"event_id": ev["id"]}, {"_id": 0, "id": 1, "filename": 1}).to_list(5000)
        code_of = {p["id"]: (p.get("filename") or p["id"]) for p in photo_docs}
        valid_ids = set(code_of.keys())
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

        # Persist per-photo album/canvas/retouch flags
        for s in sels:
            await db.gallery_photos.update_one(
                {"id": s.photo_id, "event_id": ev["id"]},
                {"$set": {"sel_album": s.album, "sel_canvas": s.canvas, "sel_retouch": s.retouch}})

        # Selection codes for the studio (filenames)
        album_codes = [code_of[s.photo_id] for s in sels if s.album]
        canvas_codes = [code_of[s.photo_id] for s in sels if s.canvas]
        retouch_codes = [code_of[s.photo_id] for s in sels if s.retouch]

        # Per-photo custom service pack assignments → {pack_id: [photo_ids]}
        pack_map: dict = {}
        for s in sels:
            for pid in (s.packs or []):
                pack_map.setdefault(pid, []).append(s.photo_id)
        # Merge legacy global upsells (no photo assigned)
        for pid in (payload.upsells or []):
            pack_map.setdefault(pid, [])

        pack_details = []
        upsell_total = 0.0
        if pack_map:
            pdocs = await db.gallery_service_packs.find(
                {"id": {"$in": list(pack_map.keys())}, "studio_id": ev["studio_id"]}, {"_id": 0}).to_list(200)
            pdoc_by_id = {d["id"]: d for d in pdocs}
            for pid, photo_ids in pack_map.items():
                d = pdoc_by_id.get(pid)
                if not d:
                    continue
                max_qty = int(d.get("max_qty") or 0)
                qty = len(photo_ids)
                if max_qty and qty > max_qty:
                    raise HTTPException(status_code=400,
                                        detail=f"{d['name']} için en fazla {max_qty} fotoğraf seçebilirsiniz ({qty} seçtiniz).")
                unit = float(d.get("price", 0) or 0)
                billed_qty = qty if qty > 0 else 1
                line_total = unit * billed_qty
                upsell_total += line_total
                pack_details.append({
                    "id": pid, "name": d.get("name", ""), "kind": d.get("kind") or "Diğer",
                    "price": unit, "qty": qty, "total": line_total,
                    "codes": [code_of[x] for x in photo_ids],
                })

        # Backward-compatible flat upsells list
        packs = [{"name": p["name"], "price": p["price"]} for p in pack_details]

        order_no = "SIP-" + secrets.token_hex(3).upper()
        order = {
            "id": new_id(), "order_no": order_no, "event_id": ev["id"], "studio_id": ev["studio_id"],
            "event_name": ev["name"], "client_name": ev.get("client_name", ""),
            "album_count": album_n, "canvas_count": canvas_n, "retouch_count": retouch_n,
            "album_codes": album_codes, "canvas_codes": canvas_codes, "retouch_codes": retouch_codes,
            "pack_details": pack_details,
            "upsells": packs, "upsell_total": upsell_total, "note": payload.note,
            "status": "new", "created_at": now_iso(),
        }
        await db.gallery_orders.insert_one(order)
        await db.gallery_events.update_one({"id": ev["id"]}, {"$set": {"submitted": True, "order_status": "new"}})
        order.pop("_id", None)

        # Central admin notification (critical) with firma tag
        try:
            _st = await db.studio_accounts.find_one({"id": ev["studio_id"]}, {"_id": 0, "firma_adi": 1})
            _firma = (_st or {}).get("firma_adi", "Stüdyo")
            await db.notifications.insert_one({
                "id": new_id(), "kind": "gallery_order",
                "title": "Yeni galeri seçimi",
                "message": f"{_firma} · {ev['name']} ({order_no}) · Albüm {album_n}, Kanvas {canvas_n}, Rötuş {retouch_n}",
                "severity": "critical", "firma_adi": _firma,
                "link": "/studyo/galeri", "read": False, "read_at": None, "created_at": now_iso(),
            })
        except Exception:
            pass

        # Notify the studio by email (best-effort; never blocks the client)
        try:
            if send_email and email_configured and email_configured():
                studio = await db.studio_accounts.find_one({"id": ev["studio_id"]}, {"_id": 0, "email": 1, "firma_adi": 1, "notify_email": 1, "notify_enabled": 1})
                to = (studio or {}).get("notify_email") or (studio or {}).get("email")
                if to and (studio or {}).get("notify_enabled", True):
                    firma = (studio or {}).get("firma_adi", "Stüdyo")
                    def _codes(lst):
                        return ", ".join(lst) if lst else "-"
                    up = "".join(
                        f"<li><b>{d['name']}</b> ({d['kind']}) — {d['qty']} adet · {d['total']:.0f}₺"
                        f"<br/><span style='color:#666'>Kodlar: {_codes(d['codes'])}</span></li>"
                        for d in pack_details) or "<li>-</li>"
                    subject = f"Yeni galeri seçimi: {ev['name']} ({order_no})"
                    html = (
                        f"<h2>Yeni müşteri seçimi geldi</h2>"
                        f"<p><b>{firma}</b> · Etkinlik: <b>{ev['name']}</b></p>"
                        f"<p>Müşteri: {ev.get('client_name','-')}<br/>Sipariş No: <b>{order_no}</b></p>"
                        f"<ul>"
                        f"<li>Albüm: {album_n} — <span style='color:#666'>{_codes(album_codes)}</span></li>"
                        f"<li>Kanvas: {canvas_n} — <span style='color:#666'>{_codes(canvas_codes)}</span></li>"
                        f"<li>Rötuş: {retouch_n} — <span style='color:#666'>{_codes(retouch_codes)}</span></li>"
                        f"</ul>"
                        f"<p>Ek Hizmetler (fotoğraf kodlarıyla):</p><ul>{up}</ul>"
                        f"<p>Not: {payload.note or '-'}</p>"
                        f"<p>Fotuber Stüdyo Paneli</p>"
                    )
                    text = f"Yeni seçim: {ev['name']} ({order_no}) - Albüm {album_n}, Kanvas {canvas_n}, Rötuş {retouch_n}"
                    await send_email(to, subject, html, text)
        except Exception:
            pass

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

    def codes_block(title, codes):
        nonlocal y
        if not codes:
            return
        c.setFont("Helvetica-Bold", 9)
        c.drawString(70 * mm, y, f"{title} kodlari:")
        y -= 5 * mm
        c.setFont("Helvetica", 8)
        line, chars = "", 0
        for code in codes:
            piece = (", " if line else "") + str(code)
            if chars + len(piece) > 85:
                c.drawString(72 * mm, y, line)
                y -= 4.5 * mm
                line, chars = str(code), len(str(code))
            else:
                line += piece
                chars += len(piece)
        if line:
            c.drawString(72 * mm, y, line)
            y -= 5 * mm

    y -= 4 * mm
    c.setFont("Helvetica-Bold", 12)
    c.drawString(25 * mm, y, "Secimler")
    y -= 9 * mm
    row("Album", order.get("album_count", 0))
    codes_block("Album", order.get("album_codes"))
    row("Kanvas", order.get("canvas_count", 0))
    codes_block("Kanvas", order.get("canvas_codes"))
    row("Retouch", order.get("retouch_count", 0))
    codes_block("Retouch", order.get("retouch_codes"))

    pack_details = order.get("pack_details")
    if pack_details:
        y -= 4 * mm
        c.setFont("Helvetica-Bold", 12)
        c.drawString(25 * mm, y, "Ek Hizmetler")
        y -= 9 * mm
        for d in pack_details:
            row(f"{d.get('name','')} ({d.get('kind','')})", f"{d.get('qty',0)} adet · {d.get('total',0):.0f} TL")
            codes_block(d.get("name", ""), d.get("codes"))
        row("Ek Hizmet Toplam", f"{order.get('upsell_total', 0):.0f} TL")
    elif order.get("upsells"):
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
