"""Print-ready invitation PDF generation (vector, embedded fonts) via reportlab.
Free feature — produces a high quality, print-ready A5/A6/10x15/DL PDF with 3mm
bleed and subtle crop marks. Fonts are embedded so any print shop renders it 1:1.
"""
import io
import os
import textwrap as _tw
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

MM = 72.0 / 25.4
BLEED_MM = 3.0

_FONT_DIR = os.path.join(os.path.dirname(__file__), "assets", "fonts")
_SCRIPT = "Helvetica-Oblique"
_SERIF = "Helvetica"
_SERIF_BOLD = "Helvetica-Bold"


def _try_font(name, filename):
    try:
        pdfmetrics.registerFont(TTFont(name, os.path.join(_FONT_DIR, filename)))
        return name
    except Exception:
        return None


_SCRIPT = _try_font("GreatVibes", "GreatVibes-Regular.ttf") or _SCRIPT
_SERIF = _try_font("Cardo", "Cardo-Regular.ttf") or _SERIF
_SERIF_BOLD = _try_font("Cardo-Bold", "Cardo-Bold.ttf") or _SERIF_BOLD

SIZES = {
    "a5": (148.0, 210.0),
    "a6": (105.0, 148.0),
    "10x15": (100.0, 150.0),
    "dl": (99.0, 210.0),
}
SIZE_LABELS = {"a5": "A5 (148×210mm)", "a6": "A6 (105×148mm)",
               "10x15": "10×15 cm", "dl": "DL (99×210mm)"}

EVENT_LABELS = {
    "dugun": "Düğün", "nisan": "Nişan", "kina": "Kına Gecesi", "sunnet": "Sünnet",
    "dogumgunu": "Doğum Günü", "nikah": "Nikah", "diger": "Özel Davet",
}
SYMBOLS = ["heart", "rings", "floral", "star", "crescent", "none"]


def _tr_upper(s: str) -> str:
    return (s or "").replace("i", "İ").replace("ı", "I").upper()


def _hex(c: str, fallback: str) -> Color:
    try:
        return HexColor(c if (c or "").startswith("#") else "#" + c)
    except Exception:
        return HexColor(fallback)


def _wrap(c, text, font, size, max_w):
    words = (text or "").split()
    lines, cur = [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if c.stringWidth(trial, font, size) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def _draw_symbol(c, kind, cx, cy, size, accent, bg):
    c.saveState()
    c.setFillColor(accent)
    c.setStrokeColor(accent)
    s = size
    if kind == "heart":
        p = c.beginPath()
        p.moveTo(cx, cy - s * 0.55)
        p.curveTo(cx - s * 0.9, cy + s * 0.35, cx - s * 0.45, cy + s * 0.9, cx, cy + s * 0.45)
        p.curveTo(cx + s * 0.45, cy + s * 0.9, cx + s * 0.9, cy + s * 0.35, cx, cy - s * 0.55)
        c.drawPath(p, fill=1, stroke=0)
    elif kind == "rings":
        c.setLineWidth(1.4)
        c.circle(cx - s * 0.35, cy, s * 0.55, fill=0, stroke=1)
        c.circle(cx + s * 0.35, cy, s * 0.55, fill=0, stroke=1)
    elif kind == "floral":
        c.setLineWidth(1.0)
        c.line(cx - s * 1.6, cy, cx - s * 0.35, cy)
        c.line(cx + s * 0.35, cy, cx + s * 1.6, cy)
        # center diamond
        p = c.beginPath()
        p.moveTo(cx, cy + s * 0.35); p.lineTo(cx + s * 0.28, cy)
        p.lineTo(cx, cy - s * 0.35); p.lineTo(cx - s * 0.28, cy); p.close()
        c.drawPath(p, fill=1, stroke=0)
        c.circle(cx - s * 0.35, cy, s * 0.08, fill=1, stroke=0)
        c.circle(cx + s * 0.35, cy, s * 0.08, fill=1, stroke=0)
    elif kind == "star":
        import math
        p = c.beginPath()
        for i in range(10):
            r = s * (0.9 if i % 2 == 0 else 0.4)
            a = math.pi / 2 + i * math.pi / 5
            x = cx + r * math.cos(a); y = cy + r * math.sin(a)
            (p.moveTo if i == 0 else p.lineTo)(x, y)
        p.close()
        c.drawPath(p, fill=1, stroke=0)
    elif kind == "crescent":
        c.circle(cx, cy, s * 0.7, fill=1, stroke=0)
        c.setFillColor(bg)
        c.circle(cx + s * 0.28, cy + s * 0.08, s * 0.62, fill=1, stroke=0)
        c.setFillColor(accent)
        import math
        p = c.beginPath()
        for i in range(10):
            r = s * (0.28 if i % 2 == 0 else 0.12)
            a = math.pi / 2 + i * math.pi / 5
            x = cx + s * 0.95 + r * math.cos(a); y = cy + s * 0.2 + r * math.sin(a)
            (p.moveTo if i == 0 else p.lineTo)(x, y)
        p.close()
        c.drawPath(p, fill=1, stroke=0)
    c.restoreState()


def _centred_spaced(c, x, y, text, font, size, color, char_space=0.0):
    c.saveState()
    c.setFont(font, size)
    c.setFillColor(color)
    total = sum(c.stringWidth(ch, font, size) for ch in text) + char_space * max(0, len(text) - 1)
    cur = x - total / 2.0
    for ch in text:
        c.drawString(cur, y, ch)
        cur += c.stringWidth(ch, font, size) + char_space
    c.restoreState()


def render_invitation_pdf(data: dict) -> bytes:
    size_key = (data.get("size") or "a5").lower()
    tw_mm, th_mm = SIZES.get(size_key, SIZES["a5"])
    pw = (tw_mm + 2 * BLEED_MM) * MM
    ph = (th_mm + 2 * BLEED_MM) * MM
    bleed = BLEED_MM * MM

    bg = _hex(data.get("bg_color"), "#FFF7F0")
    accent = _hex(data.get("accent_color"), "#B76E79")
    text_c = _hex(data.get("text_color"), "#4A2F33")

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(pw, ph))

    # Background across full bleed
    c.setFillColor(bg)
    c.rect(0, 0, pw, ph, fill=1, stroke=0)

    # Trim rectangle helpers
    tx0, ty0 = bleed, bleed
    tx1, ty1 = pw - bleed, ph - bleed
    cx = pw / 2.0

    # Double frame inside trim
    c.setStrokeColor(accent)
    c.setLineWidth(1.6)
    m1 = 8 * MM
    c.rect(tx0 + m1, ty0 + m1, (tx1 - tx0) - 2 * m1, (ty1 - ty0) - 2 * m1, fill=0, stroke=1)
    c.setLineWidth(0.6)
    m2 = 10 * MM
    c.rect(tx0 + m2, ty0 + m2, (tx1 - tx0) - 2 * m2, (ty1 - ty0) - 2 * m2, fill=0, stroke=1)

    symbol = (data.get("symbol") or "heart").lower()
    sym_size = 9 * MM

    # Top ornament
    top_y = ty1 - 20 * MM
    if symbol != "none":
        _draw_symbol(c, symbol, cx, top_y, sym_size, accent, bg)

    y = top_y - 14 * MM

    # Event label
    label = _tr_upper(EVENT_LABELS.get(data.get("event_type"), "Davet"))
    _centred_spaced(c, cx, y, label, _SERIF_BOLD, 13, accent, char_space=4)
    y -= 12 * MM

    # Small serif line
    _centred_spaced(c, cx, y, "Sizleri aramızda görmekten mutluluk duyarız", _SERIF, 11, text_c, char_space=0.4)
    y -= 20 * MM

    # Names in script
    p1 = (data.get("person1") or "").strip()
    p2 = (data.get("person2") or "").strip()
    names = f"{p1} & {p2}" if p2 else (p1 or "İsimler")
    name_size = 44
    while c.stringWidth(names, _SCRIPT, name_size) > (tx1 - tx0) - 26 * MM and name_size > 22:
        name_size -= 2
    c.setFont(_SCRIPT, name_size)
    c.setFillColor(accent)
    c.drawCentredString(cx, y - name_size * 0.35, names)
    y -= (name_size * 0.6 + 14 * MM)

    # Divider with dot
    c.setStrokeColor(accent); c.setLineWidth(0.8)
    c.line(cx - 22 * MM, y, cx - 4 * MM, y)
    c.line(cx + 4 * MM, y, cx + 22 * MM, y)
    c.setFillColor(accent); c.circle(cx, y, 1.4, fill=1, stroke=0)
    y -= 12 * MM

    # Date / time
    date_str = (data.get("event_date") or "").strip()
    pretty = date_str
    try:
        from datetime import datetime as _dt
        months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz",
                  "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
        d = _dt.fromisoformat(date_str)
        pretty = f"{d.day:02d} {months[d.month - 1]} {d.year}"
    except Exception:
        pass
    if pretty:
        _centred_spaced(c, cx, y, _tr_upper(pretty), _SERIF, 13, text_c, char_space=2)
        y -= 9 * MM
    if data.get("event_time"):
        _centred_spaced(c, cx, y, str(data.get("event_time")), _SERIF, 12, text_c, char_space=2)
        y -= 12 * MM
    else:
        y -= 3 * MM

    # Venue
    if data.get("venue_name"):
        c.setFont(_SERIF_BOLD, 14); c.setFillColor(text_c)
        c.drawCentredString(cx, y, data.get("venue_name")); y -= 7 * MM
    if data.get("venue_address"):
        c.setFont(_SERIF, 11); c.setFillColor(text_c)
        for ln in _wrap(c, data.get("venue_address"), _SERIF, 11, (tx1 - tx0) - 30 * MM):
            c.drawCentredString(cx, y, ln); y -= 5.5 * MM
    y -= 6 * MM

    # Message
    msg = (data.get("message") or "").strip()
    if msg:
        c.setFont(_SERIF, 12); c.setFillColor(text_c)
        for ln in _wrap(c, msg, _SERIF, 12, (tx1 - tx0) - 30 * MM)[:6]:
            c.drawCentredString(cx, y, ln); y -= 6 * MM

    # Bottom ornament
    if symbol != "none":
        _draw_symbol(c, symbol, cx, ty0 + 20 * MM, sym_size * 0.8, accent, bg)

    # Footer
    c.setFont(_SERIF, 8); c.setFillColor(text_c)
    c.drawCentredString(cx, ty0 + 8 * MM, "Fotuber ile hazırlanmıştır · fotuber.com.tr")

    # Crop marks (subtle gray) at trim corners
    c.setStrokeColor(Color(0.6, 0.6, 0.6)); c.setLineWidth(0.4)
    ml = 4 * MM
    for (mx, my, dx, dy) in [
        (tx0, ty0, -1, 0), (tx0, ty0, 0, -1),
        (tx1, ty0, 1, 0), (tx1, ty0, 0, -1),
        (tx0, ty1, -1, 0), (tx0, ty1, 0, 1),
        (tx1, ty1, 1, 0), (tx1, ty1, 0, 1),
    ]:
        c.line(mx, my, mx + dx * ml, my + dy * ml)

    c.showPage()
    c.save()
    return buf.getvalue()
