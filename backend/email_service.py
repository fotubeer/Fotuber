"""Gmail SMTP transactional email (low volume, App Password).

All SMTP credentials come from the environment. The frontend never touches these.
Templates are Turkish and branded for Fotuber.
"""
import os
from email.message import EmailMessage
from email.utils import formataddr
from html import escape

import aiosmtplib

GMAIL_USER = os.environ.get("GMAIL_USER", "")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")
EMAIL_SENDER_NAME = os.environ.get("EMAIL_SENDER_NAME", "Fotuber")
EMAIL_TIMEZONE = os.environ.get("EMAIL_TIMEZONE", "Europe/Istanbul")

BRAND_COLOR = "#4f46e5"


def email_configured() -> bool:
    return bool(GMAIL_USER and GMAIL_APP_PASSWORD)


def _make_message(to: str, subject: str, html: str, text: str) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = formataddr((EMAIL_SENDER_NAME, GMAIL_USER))
    msg["To"] = to
    msg["Subject"] = subject
    msg["Auto-Submitted"] = "auto-generated"
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    return msg


async def send_email(to: str, subject: str, html: str, text: str) -> None:
    if not email_configured():
        raise RuntimeError("Gmail SMTP credentials are not configured")
    message = _make_message(to, subject, html, text)
    await aiosmtplib.send(
        message,
        hostname="smtp.gmail.com",
        port=587,
        username=GMAIL_USER,
        password=GMAIL_APP_PASSWORD,
        start_tls=True,
        timeout=25,
    )


def _wrap(inner_html: str, preheader: str = "") -> str:
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
<span style="display:none;max-height:0;overflow:hidden;">{escape(preheader)}</span>
<div style="max-width:560px;margin:0 auto;padding:24px;">
  <div style="background:{BRAND_COLOR};color:#fff;padding:20px 24px;border-radius:14px 14px 0 0;">
    <div style="font-size:20px;font-weight:800;letter-spacing:.5px;">Fotuber</div>
    <div style="font-size:12px;opacity:.85;">Vesikalık · fotuber.com.tr</div>
  </div>
  <div style="background:#fff;padding:24px;border-radius:0 0 14px 14px;border:1px solid #e2e8f0;border-top:none;">
    {inner_html}
  </div>
  <div style="text-align:center;color:#94a3b8;font-size:11px;padding:16px 8px;">
    Bu e-posta Fotuber Vesikalık üyeliğiniz için otomatik gönderilmiştir.<br>fotuber.com.tr
  </div>
</div></body></html>"""


def receipt_subscription(name: str, plan_label: str, amount: str, ref: str, until: str):
    n, pl, am, rf, un = map(escape, [name or "Değerli üyemiz", plan_label, amount, ref, until])
    subject = "Fotuber üyelik ödemeniz alındı"
    inner = f"""
      <h2 style="margin:0 0 12px;font-size:18px;">Ödemeniz alındı 🎉</h2>
      <p style="margin:0 0 12px;">Merhaba {n}, <b>{pl}</b> üyelik ödemeniz başarıyla alındı.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0;">
        <tr><td style="padding:8px 0;color:#64748b;">Plan</td><td style="text-align:right;font-weight:600;">{pl}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Tutar</td><td style="text-align:right;font-weight:600;">{am}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Geçerlilik</td><td style="text-align:right;font-weight:600;">{un} tarihine kadar</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Referans</td><td style="text-align:right;font-family:monospace;">{rf}</td></tr>
      </table>
      <p style="margin:12px 0 0;color:#64748b;font-size:13px;">Teşekkür ederiz. İyi çalışmalar!</p>"""
    text = (f"Fotuber üyelik ödemeniz alındı\n\nMerhaba {name},\n{plan_label} üyelik ödemeniz alındı.\n"
            f"Tutar: {amount}\nGeçerlilik: {until} tarihine kadar\nReferans: {ref}\n\nTeşekkür ederiz.")
    return subject, _wrap(inner, "Üyelik ödemeniz alındı"), text


def receipt_credits(name: str, credits: int, amount: str, ref: str):
    n, am, rf = escape(name or "Değerli üyemiz"), escape(amount), escape(ref)
    subject = "Fotuber AI kredi yüklemeniz alındı"
    inner = f"""
      <h2 style="margin:0 0 12px;font-size:18px;">Kredi yüklemeniz tamamlandı ✅</h2>
      <p style="margin:0 0 12px;">Merhaba {n}, hesabınıza <b>{credits} AI kredisi</b> yüklendi.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0;">
        <tr><td style="padding:8px 0;color:#64748b;">Yüklenen Kredi</td><td style="text-align:right;font-weight:600;">{credits}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Tutar</td><td style="text-align:right;font-weight:600;">{am}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Referans</td><td style="text-align:right;font-family:monospace;">{rf}</td></tr>
      </table>
      <p style="margin:12px 0 0;color:#64748b;font-size:13px;">Kredileriniz AI özelliklerinde kullanılabilir.</p>"""
    text = (f"Fotuber AI kredi yüklemeniz alındı\n\nMerhaba {name},\n{credits} AI kredisi yüklendi.\n"
            f"Tutar: {amount}\nReferans: {ref}\n")
    return subject, _wrap(inner, "AI kredi yüklemeniz alındı"), text


def expiry_reminder(name: str, days: int, trial: bool, monthly_price, yearly_price, portal_url: str):
    n = escape(name or "Değerli üyemiz")
    kind = "Ücretsiz deneme süreniz" if trial else "Üyeliğiniz"
    subject = (f"{'Deneme süreniz' if trial else 'Üyeliğiniz'} {days} gün içinde sona eriyor")
    inner = f"""
      <h2 style="margin:0 0 12px;font-size:18px;">{escape(subject)}</h2>
      <p style="margin:0 0 12px;">Merhaba {n}, {kind} <b>{days} gün</b> içinde sona erecek.
      Kesintisiz devam etmek için üyeliğinizi yenileyin.</p>
      <p style="margin:0 0 12px;color:#64748b;font-size:14px;">Aylık {escape(str(monthly_price))}₺ · Yıllık {escape(str(yearly_price))}₺ (2 ay bedava)</p>
      <a href="{escape(portal_url)}" style="display:inline-block;background:{BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Üyeliğimi Yenile</a>"""
    text = (f"{subject}\n\nMerhaba {name},\n{kind} {days} gün içinde sona erecek. "
            f"Yenilemek için: {portal_url}\nAylık {monthly_price} TL · Yıllık {yearly_price} TL")
    return subject, _wrap(inner, subject), text


def test_email(name: str = "Fotuber"):
    subject = "Fotuber e-posta testi ✅"
    inner = """<h2 style="margin:0 0 12px;font-size:18px;">E-posta ayarları çalışıyor</h2>
      <p style="margin:0;">Bu bir test e-postasıdır. Gmail SMTP entegrasyonu başarıyla yapılandırıldı.</p>"""
    return subject, _wrap(inner, "E-posta testi"), "Fotuber e-posta testi: Gmail SMTP çalışıyor."


def welcome_email(name: str, trial: bool, monthly_price, yearly_price, portal_url: str):
    n = escape(name or "Değerli üyemiz")
    pu = escape(portal_url)
    if trial:
        offer = "🎁 İlk ayınız <b>ücretsiz</b>! Hemen tüm özellikleri denemeye başlayabilirsiniz."
        offer_txt = "İlk ayınız ücretsiz! Hemen kullanmaya başlayın."
    else:
        offer = (f"Başlamak için bir plan seçin: Aylık <b>{escape(str(monthly_price))}₺</b> "
                 f"veya Yıllık <b>{escape(str(yearly_price))}₺</b> (2 ay bedava).")
        offer_txt = f"Başlamak için plan seçin: Aylık {monthly_price} TL / Yıllık {yearly_price} TL."
    inner = f"""
      <h2 style="margin:0 0 12px;font-size:18px;">Fotuber'e hoş geldiniz, {n}! 👋</h2>
      <p style="margin:0 0 14px;">Vesikalık üyeliğiniz oluşturuldu. {offer}</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:12px 0;">
        <div style="font-weight:700;margin-bottom:10px;">🚀 Hızlı Başlangıç</div>
        <ol style="margin:0;padding-left:18px;line-height:1.9;font-size:14px;color:#334155;">
          <li>Portala girin ve fotoğrafınızı yükleyin.</li>
          <li>Arka plan otomatik temizlenir, biyometrik ölçülere göre kırpılır.</li>
          <li>AI ile kıyafet ve renk değiştirin, kırmızı göz/göz netleştirme uygulayın.</li>
          <li>Baskıya hazır şablonu (filigran + kesim çizgileri) tek tıkla indirin.</li>
        </ol>
      </div>
      <a href="{pu}" style="display:inline-block;background:{BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;">Hemen Başla</a>
      <p style="margin:16px 0 0;color:#64748b;font-size:13px;">Sorularınız için bize her zaman yazabilirsiniz. İyi çalışmalar!</p>"""
    text = (f"Fotuber'e hoş geldiniz, {name}!\n\nVesikalık üyeliğiniz oluşturuldu. {offer_txt}\n\n"
            f"Hızlı Başlangıç:\n1) Portala girip fotoğraf yükleyin\n2) Arka plan otomatik temizlenir ve biyometrik kırpılır\n"
            f"3) AI ile kıyafet/renk değiştirin\n4) Baskıya hazır şablonu indirin\n\nBaşla: {portal_url}\n")
    return "Fotuber'e hoş geldiniz 🎉", _wrap(inner, "Fotuber'e hoş geldiniz"), text
