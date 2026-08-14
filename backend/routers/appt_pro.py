"""
Fiziki (walk-in) randevu — Admin/Personel yetkisindeki gelişmiş katalog + sözleşme.

FAZ 1: Hizmet/Etkinlik türleri + alt seçenekler (ikramlı/ikramsız/klipli/fotoğraflı…) + fiyat + mekan alanı.
FAZ 2: Ürün kataloğu (Albüm tekli/aile, Poster, Kanvas, Fine tablo tekli/üçlü, Baskı 10x15→A3+, Dergi).
FAZ 4: Sözleşme ayarları (admin düzenlenebilir maddeler) + kaydedilen sözleşmeler (KVKK kişisel veri).

Yalnızca admin/personel erişimi (require_staff_or_admin). Katalog YÖNETİMİ (ekle/sil) yalnızca admin.
"""
from typing import Optional, List
from pydantic import BaseModel, Field


# ── Varsayılan tohum verileri (contract örneğinden) ─────────────────────────
DEFAULT_SERVICES = [
    {"name": "İsteme / Nişan", "venue_enabled": True,
     "options": ["İkramlı", "İkramsız", "Fotoğraflı", "Klipli"]},
    {"name": "Doğum Günü", "venue_enabled": True,
     "options": ["İkramlı", "İkramsız", "Fotoğraflı", "Klipli"]},
    {"name": "Bride", "venue_enabled": True,
     "options": ["İkramlı", "İkramsız", "Fotoğraflı", "Klipli"]},
    {"name": "Davet / Toplantı", "venue_enabled": True,
     "options": ["İkramlı", "İkramsız", "Fotoğraflı", "Klipli"]},
    {"name": "Dış Çekim", "venue_enabled": False, "options": []},
    {"name": "Reels Çekimi", "venue_enabled": False, "options": []},
    {"name": "Klip Çekimi", "venue_enabled": False, "options": []},
    {"name": "Drone", "venue_enabled": False, "options": []},
]

DEFAULT_PRODUCTS = [
    # Albüm — Tekli & Aile
    ("album", "Albüm", "Tekli", "30x50"), ("album", "Albüm", "Tekli", "25x70"), ("album", "Albüm", "Tekli", "30x60"),
    ("album", "Albüm", "Aile Paketi", "30x50"), ("album", "Albüm", "Aile Paketi", "25x70"), ("album", "Albüm", "Aile Paketi", "30x60"),
    # Kanvas Tablo
    ("canvas", "Kanvas Tablo", "", "50x70"), ("canvas", "Kanvas Tablo", "", "60x90"), ("canvas", "Kanvas Tablo", "", "70x100"),
    # Fine Tablo — Tekli / Üçlü
    ("fine", "Fine Tablo", "Tekli", "50x70"), ("fine", "Fine Tablo", "Üçlü", "3x (30x40)"), ("fine", "Fine Tablo", "Üçlü", "3x (40x50)"),
    # Poster
    ("poster", "Statik Duvar Posteri", "", "70x100"), ("poster", "Duvar Posteri", "", "100x150"),
    # Baskı 10x15 → A3+
    ("print", "Baskı", "", "10x15"), ("print", "Baskı", "", "13x18"), ("print", "Baskı", "", "15x21"),
    ("print", "Baskı", "", "20x30"), ("print", "Baskı", "", "30x40"), ("print", "Baskı", "", "A3"), ("print", "Baskı", "", "A3+"),
    # Dergi
    ("magazine", "Dergi", "10 Yaprak", "20 Sayfa"), ("magazine", "Dergi", "15 Yaprak", "30 Sayfa"), ("magazine", "Dergi", "20 Yaprak", "40 Sayfa"),
]

PRODUCT_CATEGORIES = {
    "album": "Albüm", "canvas": "Kanvas Tablo", "fine": "Fine Tablo",
    "poster": "Poster", "print": "Baskı", "magazine": "Dergi",
}

# Sözleşme varsayılan maddeleri — "kapora" → "cayma bedeli" olarak düzenlendi.
DEFAULT_CLAUSES = [
    {"title": "MADDE 1 - SÖZLEŞMENİN KAPSAMI",
     "body": "İşbu sözleşme stüdyoda düzenlenecek program öncesinde, program esnasında ve sonrasında tarafların hak ve yükümlülüklerinin belirlenmesi amacıyla hazırlanmıştır."},
    {"title": "MADDE 2 - İŞLETMENİN YÜKÜMLÜLÜKLERİ",
     "body": "Programda kullanılan işletmeye ait organizasyon ürünlerinin müşteriye program günü uygun kiralanması ile hizmet içeriğine uygun olarak stüdyonun müşterinin kullanımının tahsisidir."},
    {"title": "MADDE 3 - MÜŞTERİNİN YÜKÜMLÜLÜKLERİ",
     "body": "Belirtilen hizmet içeriğinin gerektirdiği sözleşmede belirlenen hizmet bedelinin ödenmesi ile program sonunda stüdyo ve eklentileri ile işletmeye ait organizasyon malzemelerinin zararsız/eksiksiz işletmeye teslimidir."},
    {"title": "MADDE 4 - ÜCRET VE ÖDEME ŞEKLİ",
     "body": "1 - Hizmet bedeli fiyatı KDV dahil {{toplam}} TL'dir. Bu bedel hizmet kapsamının tamamını içermektedir.\n2 - İşbu sözleşmede belirlenen {{cayma}} TL cayma bedeli, sözleşmenin imzalandığı gün peşin olarak ödenecektir. Kalan son tutar olan {{kalan}} TL ise program günü ödenecektir. Hizmet bedelinin cayma bedeli tutarı, sözleşmede belirlenen stüdyonun program tarihi için rezerve bedeli olup bu tutar, stüdyonun bu tarih için bir başkasına kiralanmaması sebebiyle olası mahrum kalınan kazanç kapsamında alınmakta olup her halde müşteriye geri ödenmeyecektir. Cayma bedeli, 6098 sayılı Türk Borçlar Kanunu madde 178 kapsamında cayma parası hükmündedir."},
    {"title": "MADDE 5 - ÖZEL ŞARTLAR",
     "body": "1. Program sırasında organizasyon idaresi işletme tarafından yapılacak olup müşteri tarafından programın idaresine müdahale edilmeyecektir.\n2. Program başlama saatinden itibaren 3 saat sürecek olup ekstra 30 dakikada salondan ayrılma süresidir.\n3. Dışarıdan profesyonel fotoğrafçı veya video hizmeti getirilmesi yasaktır.\n4. Rezervasyon yapılırken %25 cayma bedeli alınmaktadır. Kalan ödeme en geç organizasyon bitimine kadar müşteriden alınacaktır.\n5. Konfeti, sis, kar spreyi, havai fişek kullanılması yasaktır.\n6. Organizasyonun gerçekleştirildiği stüdyo katı haricindeki diğer katlar kullanıma kapalı olup, diğer tüm katlarda bulunan konseptler, oturma alanları, personel çalışma alanları, depo alanları ve elektronik teçhizatlar (bilgisayar, kameralar, ışıklandırma ekipmanları vs.) oluşabilecek her türlü zarar sözleşme yapan müşteri tarafından organizasyon bitimine müteakip zararı karşılanacaktır.\n7. Müşteri, en son konuk salonundan çıkana kadar işbu sözleşme şartlarından sorumludur.\n8. Program süresi buyunca tabak ve bardak dışında kırılan/kaybolan dekoratif ürünlerin sorumluluğu müşteriye aittir.\n9. İşletme, organizasyon boyunca ve organizasyon sonunda unutulan kaybolan eşyalardan sorumlu tutulamaz.\n10. İşletmemiz 7/24 kamera sistemi ile kayıt altına alınmaktadır."},
    {"title": "MADDE 6 - SÖZLEŞMENİN SÜRESİ",
     "body": "1. Bu sözleşme tarafların imzaladıkları tarihte yürürlüğe girecek olup, sözleşme konusu organizasyonun gerçekleştirilmesi ve hizmet bedelinin tamamının ödenmesine müteakiben müşterinin son misafiri salondan ayrılıncaya kadar yürürlükte kalacaktır.\n2. Müşterinin işbu sözleşmede kararlaştırılan hizmet şartlarıyla erteleme hakkını kullanması durumunda sözleşme süre erteleme ile belirlenen yeni organizasyon tarihi bitiminde önceki bentte belirlenen zamana kadar devam edecektir."},
]

DEFAULT_ACCEPTANCE = "Müşteri, işbu sözleşmenin yukarıda belirtilen tüm maddelerini okumuş, anlamış ve tüm şartları kabul ederek imzalamıştır."

# Sözleşme görsel tasarımı — tamamı admin tarafından yönetilebilir.
DEFAULT_DESIGN = {
    "accent_color": "#111827",
    "text_color": "#1a1a1a",
    "title_font": "'Great Vibes', cursive",
    "body_font": "'Manrope', sans-serif",
    "header_align": "left",       # left | center
    "show_emblem": True,
    "emblem_letter": "F",
    "emblem_top_text": "STUDIO",
    "emblem_bottom_text": "Görsel Sanat",
    "subtitle": "HİZMET SÖZLEŞMESİ",
    "title_size": 30,
}
DEFAULT_BRAND_VENUE = "FOTUBER Photography & Davet Evi"
DEFAULT_BRAND_PHOTO = "FOTUBER Photography"


def _build_contract_pdf(c: dict, s: dict) -> bytes:
    """Sunucu tarafı PDF üretir (reportlab)."""
    import io
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle)

    def money(n):
        try: return f"{float(n or 0):,.0f} ₺".replace(",", ".")
        except Exception: return "0 ₺"

    def fill(body):
        return (body or "").replace("{{toplam}}", f"{float(c.get('total',0)):,.0f}".replace(",", ".")) \
            .replace("{{cayma}}", f"{float(c.get('deposit_amount',0)):,.0f}".replace(",", ".")) \
            .replace("{{kalan}}", f"{float(c.get('remaining_amount',0)):,.0f}".replace(",", "."))

    d = s.get("design") or {}
    accent = colors.HexColor(d.get("accent_color") or "#111827")
    brand = (s.get("brand_name_photo") if c.get("brand_variant") == "photo" else s.get("brand_name_venue")) or s.get("company_name") or "Fotuber"
    couple = f"{c.get('bride_name','')}{' & ' if c.get('bride_name') and c.get('groom_name') else ''}{c.get('groom_name','')}".strip() or c.get("customer_name") or "—"
    role = {"gelin": "Gelin", "damat": "Damat", "diger": "Diğer"}.get(c.get("party_role"), "—")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16*mm, rightMargin=16*mm, topMargin=14*mm, bottomMargin=14*mm)
    styles = getSampleStyleSheet()
    h_title = ParagraphStyle("t", parent=styles["Title"], fontSize=20, textColor=accent, spaceAfter=2)
    sub = ParagraphStyle("s", parent=styles["Normal"], fontSize=9, textColor=colors.grey, spaceAfter=8)
    body = ParagraphStyle("b", parent=styles["Normal"], fontSize=8.5, leading=12)
    clause_t = ParagraphStyle("ct", parent=styles["Normal"], fontSize=9, textColor=accent, spaceBefore=6, spaceAfter=1, fontName="Helvetica-Bold")
    sec = ParagraphStyle("sec", parent=styles["Normal"], fontSize=10, textColor=colors.white, alignment=1, spaceBefore=4, spaceAfter=4)

    el = []
    el.append(Paragraph(brand, h_title))
    el.append(Paragraph((d.get("subtitle") or "HİZMET SÖZLEŞMESİ") + f" &nbsp;&nbsp;·&nbsp;&nbsp; {(c.get('created_at') or '')[:10]}", sub))

    info = [
        ["Çiftin İsmi", couple, "Tarih", c.get("event_date") or "—"],
        ["Sözleşme Sahibi", f"{c.get('party_name','—')} ({role})", "Saat", c.get("event_time") or "—"],
        ["T.C. No", c.get("party_tc") or "—", "Mekan", c.get("venue") or "—"],
        ["Telefon", c.get("party_phone") or "—", "Toplam", money(c.get("subtotal"))],
        ["E-posta", c.get("party_email") or "—", f"İndirim (%{c.get('discount_percent',0)})", "- " + money(c.get("discount_amount"))],
        ["Adres", c.get("party_address") or "—", "Net Tutar", money(c.get("total"))],
        ["Gelin/Damat Tel", f"{c.get('bride_phone','—')} / {c.get('groom_phone','—')}", "Cayma / Kalan", money(c.get("deposit_amount")) + " / " + money(c.get("remaining_amount"))],
        ["Ödeme Şekli", ("Kart" if c.get("payment_method") == "card" else "Nakit"), "", ""],
    ]
    t = Table([[Paragraph(f"<b>{a}</b>", body), Paragraph(str(b), body), Paragraph(f"<b>{cc}</b>", body), Paragraph(str(dd), body)] for a, b, cc, dd in info],
              colWidths=[32*mm, 58*mm, 34*mm, 54*mm])
    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e5e7eb")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    el.append(t)
    el.append(Spacer(1, 6))

    # Hizmet seçimi
    bar = Table([[Paragraph("HİZMET SEÇİMİ", sec)]], colWidths=[178*mm]); bar.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), accent)]))
    el.append(bar)
    for it in (c.get("line_items") or []):
        el.append(Paragraph(f"☑ {it.get('label','')} &nbsp;&nbsp; <font color='#888'>{money(it.get('price')) if it.get('price') else ''}</font>", body))
    el.append(Spacer(1, 4))
    el.append(Paragraph(f"Görsel İzni — Sosyal medya: <b>{'EVET' if c.get('consent_social') else 'HAYIR'}</b> &nbsp;·&nbsp; Ürün/Kampanya: <b>{'EVET' if c.get('consent_marketing') else 'HAYIR'}</b>", body))
    el.append(Spacer(1, 6))

    bar2 = Table([[Paragraph("SÖZLEŞME MADDELERİ VE ÖDEME PLANI", sec)]], colWidths=[178*mm]); bar2.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), accent)]))
    el.append(bar2)
    for cl in (s.get("clauses") or []):
        el.append(Paragraph(cl.get("title", ""), clause_t))
        el.append(Paragraph(fill(cl.get("body", "")).replace("\n", "<br/>"), body))
    if s.get("acceptance_text"):
        el.append(Spacer(1, 4)); el.append(Paragraph(f"<b>{s['acceptance_text']}</b>", body))
    if c.get("approval_status") == "approved":
        el.append(Spacer(1, 4)); el.append(Paragraph(f"<font color='#059669'><b>✔ Dijital olarak onaylandı — {c.get('approver_name','')} ({(c.get('approved_at') or '')[:10]})</b></font>", body))
    el.append(Spacer(1, 14))
    # İmza görseli (varsa) — HİZMET ALAN üstüne
    sig_img = None
    sig_data = c.get("signature") or ""
    if sig_data.startswith("data:image") and "," in sig_data:
        try:
            import base64 as _b64
            from reportlab.platypus import Image as _Image
            raw = _b64.b64decode(sig_data.split(",", 1)[1])
            sig_img = _Image(io.BytesIO(raw), width=55*mm, height=22*mm, kind="proportional")
        except Exception:
            sig_img = None
    right_cell = sig_img if sig_img else ""
    sig = Table([[ "", right_cell ], ["HİZMET VEREN", "HİZMET ALAN"]], colWidths=[89*mm, 89*mm])
    sig.setStyle(TableStyle([
        ("LINEABOVE", (0, 1), (-1, 1), 0.6, colors.grey),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, 0), "BOTTOM"),
        ("FONTSIZE", (0, 1), (-1, 1), 9), ("TOPPADDING", (0, 1), (-1, 1), 4),
    ]))
    el.append(sig)

    doc.build(el)
    return buf.getvalue()


def get_router(db, deps):
    from fastapi import APIRouter, HTTPException, Depends
    router = APIRouter(prefix="/api/appt-pro", tags=["appt-pro"])
    require_admin = deps["require_admin"]
    staff = deps["require_staff_or_admin"]
    new_id = deps["new_id"]
    now_iso = deps["now_iso"]

    # ── Seeders ──────────────────────────────────────────────────────────
    async def _seed():
        if await db.appt_services.count_documents({}) == 0:
            for i, s in enumerate(DEFAULT_SERVICES):
                await db.appt_services.insert_one({
                    "id": new_id(), "name": s["name"], "active": True, "sort": i,
                    "base_price": 0, "venue_enabled": s["venue_enabled"],
                    "options": [{"id": new_id(), "label": o, "price": 0} for o in s["options"]],
                    "created_at": now_iso(),
                })
        if await db.appt_products.count_documents({}) == 0:
            for i, (cat, name, variant, size) in enumerate(DEFAULT_PRODUCTS):
                await db.appt_products.insert_one({
                    "id": new_id(), "category": cat, "name": name, "variant": variant,
                    "size": size, "price": 0, "active": True, "sort": i, "created_at": now_iso(),
                })
        if not await db.appt_contract_settings.find_one({"id": "global"}):
            await db.appt_contract_settings.insert_one({
                "id": "global", "company_name": DEFAULT_BRAND_VENUE,
                "brand_name_venue": DEFAULT_BRAND_VENUE, "brand_name_photo": DEFAULT_BRAND_PHOTO,
                "logo_url": "", "clauses": DEFAULT_CLAUSES, "acceptance_text": DEFAULT_ACCEPTANCE,
                "design": DEFAULT_DESIGN, "require_signature": True, "created_at": now_iso(),
            })
        else:
            # Eski kayıtları yeni alanlarla tamamla (backfill)
            doc = await db.appt_contract_settings.find_one({"id": "global"})
            patch = {}
            if "design" not in doc: patch["design"] = DEFAULT_DESIGN
            else:
                merged = {**DEFAULT_DESIGN, **(doc.get("design") or {})}
                if merged != doc.get("design"): patch["design"] = merged
            if "brand_name_venue" not in doc: patch["brand_name_venue"] = doc.get("company_name") or DEFAULT_BRAND_VENUE
            if "brand_name_photo" not in doc: patch["brand_name_photo"] = DEFAULT_BRAND_PHOTO
            if "require_signature" not in doc: patch["require_signature"] = True
            if patch:
                await db.appt_contract_settings.update_one({"id": "global"}, {"$set": patch})

    def _svc_out(s):
        return {"id": s["id"], "name": s.get("name"), "active": s.get("active", True),
                "sort": s.get("sort", 0), "base_price": s.get("base_price", 0),
                "venue_enabled": s.get("venue_enabled", False), "options": s.get("options", [])}

    def _prod_out(p):
        return {"id": p["id"], "category": p.get("category"), "name": p.get("name"),
                "variant": p.get("variant", ""), "size": p.get("size", ""),
                "price": p.get("price", 0), "active": p.get("active", True), "sort": p.get("sort", 0)}

    # =====================================================================
    # FAZ 1 — SERVICES (events + shooting) with priced sub-options
    # =====================================================================
    class OptionIn(BaseModel):
        id: Optional[str] = None
        label: str
        price: float = 0

    class ServiceIn(BaseModel):
        name: str = Field(min_length=1, max_length=120)
        active: bool = True
        sort: int = 0
        base_price: float = 0
        venue_enabled: bool = False
        options: List[OptionIn] = []

    @router.get("/services")
    async def list_services(active_only: bool = False, acc: dict = Depends(staff)):
        await _seed()
        q = {"active": True} if active_only else {}
        rows = await db.appt_services.find(q, {"_id": 0}).sort("sort", 1).to_list(500)
        return {"services": [_svc_out(s) for s in rows]}

    @router.post("/services")
    async def create_service(payload: ServiceIn, admin: dict = Depends(require_admin)):
        doc = {"id": new_id(), "name": payload.name.strip(), "active": payload.active,
               "sort": payload.sort, "base_price": payload.base_price,
               "venue_enabled": payload.venue_enabled,
               "options": [{"id": o.id or new_id(), "label": o.label.strip(), "price": o.price} for o in payload.options],
               "created_at": now_iso()}
        await db.appt_services.insert_one(doc)
        return {"service": _svc_out(doc)}

    @router.patch("/services/{sid}")
    async def update_service(sid: str, payload: ServiceIn, admin: dict = Depends(require_admin)):
        upd = {"name": payload.name.strip(), "active": payload.active, "sort": payload.sort,
               "base_price": payload.base_price, "venue_enabled": payload.venue_enabled,
               "options": [{"id": o.id or new_id(), "label": o.label.strip(), "price": o.price} for o in payload.options]}
        r = await db.appt_services.update_one({"id": sid}, {"$set": upd})
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Hizmet bulunamadı")
        return {"ok": True}

    @router.delete("/services/{sid}")
    async def delete_service(sid: str, admin: dict = Depends(require_admin)):
        await db.appt_services.delete_one({"id": sid})
        return {"ok": True}

    # =====================================================================
    # FAZ 2 — PRODUCTS (album / poster / canvas / fine / print / magazine)
    # =====================================================================
    class ProductIn(BaseModel):
        category: str
        name: str = Field(min_length=1, max_length=120)
        variant: str = ""
        size: str = ""
        price: float = 0
        active: bool = True
        sort: int = 0

    @router.get("/products")
    async def list_products(active_only: bool = False, acc: dict = Depends(staff)):
        await _seed()
        q = {"active": True} if active_only else {}
        rows = await db.appt_products.find(q, {"_id": 0}).sort("sort", 1).to_list(1000)
        return {"products": [_prod_out(p) for p in rows], "categories": PRODUCT_CATEGORIES}

    @router.post("/products")
    async def create_product(payload: ProductIn, admin: dict = Depends(require_admin)):
        if payload.category not in PRODUCT_CATEGORIES:
            raise HTTPException(status_code=400, detail="Geçersiz kategori")
        doc = {"id": new_id(), "category": payload.category, "name": payload.name.strip(),
               "variant": payload.variant.strip(), "size": payload.size.strip(),
               "price": payload.price, "active": payload.active, "sort": payload.sort, "created_at": now_iso()}
        await db.appt_products.insert_one(doc)
        return {"product": _prod_out(doc)}

    @router.patch("/products/{pid}")
    async def update_product(pid: str, payload: ProductIn, admin: dict = Depends(require_admin)):
        if payload.category not in PRODUCT_CATEGORIES:
            raise HTTPException(status_code=400, detail="Geçersiz kategori")
        r = await db.appt_products.update_one({"id": pid}, {"$set": {
            "category": payload.category, "name": payload.name.strip(), "variant": payload.variant.strip(),
            "size": payload.size.strip(), "price": payload.price, "active": payload.active, "sort": payload.sort}})
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Ürün bulunamadı")
        return {"ok": True}

    @router.delete("/products/{pid}")
    async def delete_product(pid: str, admin: dict = Depends(require_admin)):
        await db.appt_products.delete_one({"id": pid})
        return {"ok": True}

    # =====================================================================
    # FAZ 4 — CONTRACT settings (admin-editable) + saved contracts (KVKK)
    # =====================================================================
    class ClauseIn(BaseModel):
        title: str
        body: str

    class ContractSettingsIn(BaseModel):
        company_name: Optional[str] = None
        brand_name_venue: Optional[str] = None
        brand_name_photo: Optional[str] = None
        logo_url: Optional[str] = None
        clauses: Optional[List[ClauseIn]] = None
        acceptance_text: Optional[str] = None
        design: Optional[dict] = None
        require_signature: Optional[bool] = None

    @router.get("/contract-settings")
    async def get_contract_settings(acc: dict = Depends(staff)):
        await _seed()
        s = await db.appt_contract_settings.find_one({"id": "global"}, {"_id": 0})
        return {"settings": s}

    @router.put("/contract-settings")
    async def put_contract_settings(payload: ContractSettingsIn, admin: dict = Depends(require_admin)):
        upd = {}
        if payload.company_name is not None: upd["company_name"] = payload.company_name
        if payload.brand_name_venue is not None: upd["brand_name_venue"] = payload.brand_name_venue
        if payload.brand_name_photo is not None: upd["brand_name_photo"] = payload.brand_name_photo
        if payload.logo_url is not None: upd["logo_url"] = payload.logo_url
        if payload.acceptance_text is not None: upd["acceptance_text"] = payload.acceptance_text
        if payload.clauses is not None: upd["clauses"] = [{"title": c.title, "body": c.body} for c in payload.clauses]
        if payload.design is not None: upd["design"] = {**DEFAULT_DESIGN, **payload.design}
        if payload.require_signature is not None: upd["require_signature"] = payload.require_signature
        await db.appt_contract_settings.update_one({"id": "global"}, {"$set": upd}, upsert=True)
        s = await db.appt_contract_settings.find_one({"id": "global"}, {"_id": 0})
        return {"settings": s}

    class ContractIn(BaseModel):
        appointment_id: Optional[str] = None
        # Taraf: gelin | damat | diger
        party_role: str = "diger"
        party_name: str = ""
        party_tc: str = ""
        party_email: str = ""
        party_address: str = ""
        party_phone: str = ""
        # Çift bilgileri (KVKK kişisel veri)
        bride_name: str = ""
        groom_name: str = ""
        bride_phone: str = ""
        groom_phone: str = ""
        event_date: str = ""
        event_time: str = ""
        venue: str = ""
        # Seçim anlık görüntüsü + fiyat
        line_items: List[dict] = []       # [{type, label, price}]
        subtotal: float = 0
        discount_percent: float = 0
        discount_amount: float = 0
        total: float = 0
        deposit_amount: float = 0         # cayma bedeli (peşinat)
        remaining_amount: float = 0
        # Medya izinleri
        consent_social: bool = False
        consent_marketing: bool = False
        brand_variant: str = "venue"   # venue (Davet Evi) | photo (Photography)
        payment_method: str = "cash"   # cash | card

    def _contract_out(c):
        return {k: v for k, v in c.items() if k != "_id"}

    @router.post("/contracts")
    async def create_contract(payload: ContractIn, acc: dict = Depends(staff)):
        import secrets
        doc = payload.model_dump()
        doc["id"] = new_id()
        doc["public_token"] = secrets.token_urlsafe(9)
        doc["approval_status"] = "pending"
        doc["approved_at"] = None
        doc["approver_name"] = ""
        doc["created_at"] = now_iso()
        doc["created_by"] = acc.get("email") or acc.get("id")
        await db.appt_contracts.insert_one(doc)
        return {"contract": _contract_out(doc)}

    @router.get("/contracts")
    async def list_contracts(acc: dict = Depends(staff)):
        rows = await db.appt_contracts.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
        return {"contracts": rows}

    @router.get("/contracts/{cid}")
    async def get_contract(cid: str, acc: dict = Depends(staff)):
        c = await db.appt_contracts.find_one({"id": cid}, {"_id": 0})
        if not c:
            raise HTTPException(status_code=404, detail="Sözleşme bulunamadı")
        settings = await db.appt_contract_settings.find_one({"id": "global"}, {"_id": 0})
        return {"contract": c, "settings": settings}

    @router.put("/contracts/{cid}")
    async def update_contract(cid: str, payload: ContractIn, acc: dict = Depends(staff)):
        upd = payload.model_dump()
        r = await db.appt_contracts.update_one({"id": cid}, {"$set": upd})
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Sözleşme bulunamadı")
        c = await db.appt_contracts.find_one({"id": cid}, {"_id": 0})
        return {"contract": _contract_out(c)}

    @router.delete("/contracts/{cid}")
    async def delete_contract(cid: str, admin: dict = Depends(require_admin)):
        c = await db.appt_contracts.find_one({"id": cid}, {"_id": 0, "appointment_id": 1})
        await db.appt_contracts.delete_one({"id": cid})
        # Zincir: bağlı randevu + nakit akışı kayıtlarını da kaldır
        if c and c.get("appointment_id"):
            await db.appointments.delete_one({"id": c["appointment_id"]})
            await db.transactions.delete_many({"contract_id": cid})
        return {"ok": True}

    # ── PUBLIC: müşteri sözleşmeyi link/QR ile görüntüler ve onaylar ──────
    @router.get("/public/contracts/{token}")
    async def public_get_contract(token: str):
        c = await db.appt_contracts.find_one({"public_token": token}, {"_id": 0, "created_by": 0})
        if not c:
            raise HTTPException(status_code=404, detail="Sözleşme bulunamadı")
        settings = await db.appt_contract_settings.find_one({"id": "global"}, {"_id": 0})
        return {"contract": c, "settings": settings}

    class ApproveIn(BaseModel):
        approver_name: str = ""
        accepted: bool = True
        signature: str = ""   # dataURL (image/png) — parmakla/fareyle çizilen imza

    @router.post("/public/contracts/{token}/approve")
    async def public_approve_contract(token: str, payload: ApproveIn):
        if not payload.accepted:
            raise HTTPException(status_code=400, detail="Sözleşmeyi kabul etmelisiniz")
        c = await db.appt_contracts.find_one({"public_token": token})
        if not c:
            raise HTTPException(status_code=404, detail="Sözleşme bulunamadı")
        settings = await db.appt_contract_settings.find_one({"id": "global"}, {"_id": 0}) or {}
        has_sig = bool(payload.signature and payload.signature.startswith("data:image"))
        if settings.get("require_signature", True) and not has_sig:
            raise HTTPException(status_code=400, detail="İmza zorunludur")
        approver = (payload.approver_name or c.get("party_name") or "").strip()
        upd = {
            "approval_status": "approved", "approved_at": now_iso(),
            "approver_name": approver, "approval_seen": False,
        }
        # İmza (data URL) — makul boyut sınırı
        if payload.signature and payload.signature.startswith("data:image") and len(payload.signature) < 400000:
            upd["signature"] = payload.signature
        await db.appt_contracts.update_one({"public_token": token}, {"$set": upd})
        # Panel bildirimi (mevcut notifications koleksiyonu)
        couple = f"{c.get('bride_name','')}{' & ' if c.get('bride_name') and c.get('groom_name') else ''}{c.get('groom_name','')}".strip() or c.get("customer_name") or "Müşteri"
        await db.notifications.insert_one({
            "id": new_id(), "type": "contract_approved",
            "title": "Sözleşme Onaylandı",
            "message": f"{couple} sözleşmeyi dijital olarak onayladı.",
            "contract_id": c.get("id"), "read": False, "created_at": now_iso(),
        })
        return {"ok": True}

    # ── Onay bildirimleri feed (admin/personel panelinde) ────────────────
    @router.get("/approvals")
    async def approvals_feed(acc: dict = Depends(staff)):
        rows = await db.appt_contracts.find(
            {"approval_status": "approved"}, {"_id": 0}).sort("approved_at", -1).to_list(200)
        unseen = sum(1 for r in rows if r.get("approval_seen") is False)
        return {"approvals": rows, "unseen": unseen}

    @router.post("/approvals/seen")
    async def approvals_seen(acc: dict = Depends(staff)):
        await db.appt_contracts.update_many(
            {"approval_status": "approved", "approval_seen": False}, {"$set": {"approval_seen": True}})
        return {"ok": True}

    # ── Sunucu tarafı PDF (tek tıkla indir) ──────────────────────────────
    @router.get("/contracts/{cid}/pdf")
    async def contract_pdf(cid: str, acc: dict = Depends(staff)):
        c = await db.appt_contracts.find_one({"id": cid}, {"_id": 0})
        if not c:
            raise HTTPException(status_code=404, detail="Sözleşme bulunamadı")
        s = await db.appt_contract_settings.find_one({"id": "global"}, {"_id": 0}) or {}
        pdf = _build_contract_pdf(c, s)
        from fastapi import Response
        fname = f"sozlesme-{cid[:8]}.pdf"
        return Response(content=pdf, media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="{fname}"'})

    # =====================================================================
    # FAZ 3 — Birleşik: fiziki randevu + sözleşme oluştur (tek çağrı)
    # =====================================================================
    class BuilderIn(BaseModel):
        # Randevu
        customer_name: str = ""       # çiftin adı (gelin & damat)
        customer_phone: str = ""
        service_name_snapshot: str = ""  # liste görünümü için özet
        date: str = ""
        time: str = ""
        venue: str = ""
        admin_notes: str = ""
        # Fiyat
        line_items: List[dict] = []
        subtotal: float = 0
        discount_percent: float = 0
        discount_amount: float = 0
        total: float = 0
        deposit_amount: float = 0
        paid_amount: float = 0
        payment_method: str = "cash"    # cash | card
        # Sözleşme + çift + KVKK
        contract: ContractIn

    @router.post("/appointments")
    async def create_appt_with_contract(payload: BuilderIn, acc: dict = Depends(staff)):
        import secrets
        now = now_iso()
        # 1) Sözleşme kaydı (KVKK kişisel veri)
        c = payload.contract.model_dump()
        # Ödeme şekli tutarlılığı: nested değer varsayılansa üst seviyeden doldur.
        if c.get("payment_method", "cash") == "cash" and payload.payment_method:
            c["payment_method"] = payload.payment_method
        c["id"] = new_id()
        c["public_token"] = secrets.token_urlsafe(9)
        c["approval_status"] = "pending"
        c["approved_at"] = None
        c["approver_name"] = ""
        c["created_at"] = now
        c["created_by"] = acc.get("email") or acc.get("id")
        # 2) Randevu kaydı (takvimde görünsün)
        appt_id = new_id()
        c["appointment_id"] = appt_id
        appt = {
            "id": appt_id, "user_id": None,
            "customer_name": payload.customer_name or (payload.contract.bride_name + " & " + payload.contract.groom_name).strip(" &"),
            "customer_phone": payload.customer_phone or payload.contract.bride_phone or payload.contract.groom_phone or "",
            "customer_email": payload.contract.party_email or "",
            "phone_2": payload.contract.groom_phone or "",
            "service_id": None,
            "service_name_snapshot": payload.service_name_snapshot or "Fiziki Randevu",
            "date": payload.date, "time": payload.time,
            "venue": payload.venue or "",
            "notes": "Fiziki randevu + sözleşme (katalog)",
            "admin_notes": payload.admin_notes or "",
            "event_type": "", "event_addons": [],
            "line_items": payload.line_items,
            "subtotal": payload.subtotal,
            "discount_percent": payload.discount_percent,
            "discount_amount": payload.discount_amount,
            "extra_services_note": "",
            "status": "approved",
            "deposit_amount": payload.deposit_amount,
            "total_amount": payload.total,
            "paid_amount": payload.paid_amount,
            "payment_method": payload.payment_method,
            "mid_payments": [],
            "origin": "walkin",
            "contract_accepted": True,
            "contract_accepted_at": now,
            "physical_contract_needed": False,
            "contract_id": c["id"],
            "contract_file_id": None,
            "created_at": now,
            "approved_at": now,
        }
        await db.appointments.insert_one(appt)
        await db.appt_contracts.insert_one(c)
        # 3) Nakit akışına (transactions) gelir kaydı — kart/nakit
        paid = float(payload.paid_amount or 0)
        if paid > 0:
            method = "card" if (payload.payment_method == "card") else "cash"
            await db.transactions.insert_one({
                "id": new_id(), "kind": "income", "amount": paid,
                "payment_method": method, "category": "Randevu / Sözleşme",
                "description": f"{appt['customer_name']} — {payload.service_name_snapshot or 'Fiziki Randevu'}",
                "date": (payload.date or now[:10]),
                "appointment_id": appt_id, "contract_id": c["id"], "source": "appointment",
                "created_at": now, "created_by": acc.get("id"),
                "created_by_name": acc.get("name"), "created_by_role": acc.get("role"),
            })
        appt.pop("_id", None)
        return {"appointment_id": appt_id, "contract_id": c["id"]}

    return router
