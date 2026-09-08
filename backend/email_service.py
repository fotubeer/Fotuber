"""Gmail SMTP transactional email (low volume, App Password).

All SMTP credentials come from the environment. The frontend never touches these.
Templates are Turkish and branded for Fotuber.
"""
import os
from email.message import EmailMessage
from email.utils import formataddr
from html import escape

import aiosmtplib
import asyncio

GMAIL_USER = os.environ.get("GMAIL_USER", "")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")
EMAIL_SENDER_NAME = os.environ.get("EMAIL_SENDER_NAME", "Fotuber")
EMAIL_TIMEZONE = os.environ.get("EMAIL_TIMEZONE", "Europe/Istanbul")

# Preferred provider: Resend (verified custom domain) → higher deliverability.
# Falls back to Gmail SMTP when Resend is not configured.
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
EMAIL_FROM = os.environ.get("EMAIL_FROM", "")  # e.g. bilgi@fotuber.com.tr (verified domain)

BRAND_COLOR = "#4f46e5"


def provider() -> str:
    if RESEND_API_KEY and EMAIL_FROM:
        return "resend"
    if GMAIL_USER and GMAIL_APP_PASSWORD:
        return "gmail"
    return ""


def sender_address() -> str:
    if provider() == "resend":
        return EMAIL_FROM
    return GMAIL_USER


def email_configured() -> bool:
    return provider() != ""


def _make_message(to: str, subject: str, html: str, text: str) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = formataddr((EMAIL_SENDER_NAME, GMAIL_USER))
    msg["To"] = to
    msg["Subject"] = subject
    msg["Auto-Submitted"] = "auto-generated"
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    return msg


async def _send_resend(to: str, subject: str, html: str, text: str) -> None:
    import resend
    resend.api_key = RESEND_API_KEY
    params = {
        "from": formataddr((EMAIL_SENDER_NAME, EMAIL_FROM)),
        "to": [to],
        "subject": subject,
        "html": html,
        "text": text,
    }
    await asyncio.to_thread(resend.Emails.send, params)


async def send_email(to: str, subject: str, html: str, text: str) -> None:
    prov = provider()
    if not prov:
        raise RuntimeError("E-posta sağlayıcısı yapılandırılmamış (Resend veya Gmail)")
    if prov == "resend":
        await _send_resend(to, subject, html, text)
        return
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


def password_reset(name: str, link: str):
    n = escape(name or "Değerli üyemiz")
    lu = escape(link)
    inner = f"""
      <h2 style="margin:0 0 12px;font-size:18px;">Şifre sıfırlama talebi</h2>
      <p style="margin:0 0 14px;">Merhaba {n}, davetiye panelinize erişim için şifre sıfırlama talebinde bulundunuz.
      Yeni bir şifre belirlemek için aşağıdaki butona tıklayın:</p>
      <a href="{lu}" style="display:inline-block;background:{BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;">Şifremi Sıfırla</a>
      <p style="margin:16px 0 0;color:#64748b;font-size:13px;">Bu bağlantı <b>1 saat</b> geçerlidir ve yalnızca bir kez kullanılabilir.
      Eğer bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz; şifreniz değişmez.</p>
      <p style="margin:10px 0 0;color:#94a3b8;font-size:12px;word-break:break-all;">Buton çalışmazsa: {lu}</p>"""
    text = (f"Şifre sıfırlama talebi\n\nMerhaba {name}, yeni şifre belirlemek için: {link}\n\n"
            f"Bağlantı 1 saat geçerlidir ve tek kullanımlıktır. Bu talebi siz yapmadıysanız yok sayın.")
    return "Fotuber · Şifre Sıfırlama", _wrap(inner, "Şifre sıfırlama bağlantınız"), text



# ── Fotuber Medya (B2B firma) bildirimleri ───────────────────────────────
def credit_request_admin(partner_name: str, partner_email: str, amount: int, note: str, admin_url: str):
    pn, pe, nt, au = map(escape, [partner_name or "-", partner_email or "-", note or "-", admin_url])
    subject = f"Yeni kampanya kredisi talebi · {partner_name}"
    inner = f"""
      <h2 style="margin:0 0 12px;font-size:18px;">Yeni kredi talebi 🪙</h2>
      <p style="margin:0 0 12px;"><b>{pn}</b> firması kampanya görseli için kredi talep etti.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0;">
        <tr><td style="padding:8px 0;color:#64748b;">Firma</td><td style="text-align:right;font-weight:600;">{pn}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">E-posta</td><td style="text-align:right;">{pe}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Talep Edilen</td><td style="text-align:right;font-weight:600;">{amount} kredi</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Not</td><td style="text-align:right;">{nt}</td></tr>
      </table>
      <a href="{au}" style="display:inline-block;background:{BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Talebi İncele</a>"""
    text = (f"Yeni kampanya kredisi talebi\n\nFirma: {partner_name} ({partner_email})\n"
            f"Talep: {amount} kredi\nNot: {note or '-'}\n\nYönet: {admin_url}")
    return subject, _wrap(inner, "Yeni kampanya kredisi talebi"), text


def credit_approved_partner(company_name: str, amount: int, total: int, portal_url: str):
    cn, pu = escape(company_name or "Değerli iş ortağımız"), escape(portal_url)
    subject = "Kampanya kredisi talebiniz onaylandı 🎉"
    inner = f"""
      <h2 style="margin:0 0 12px;font-size:18px;">Krediniz tanımlandı ✅</h2>
      <p style="margin:0 0 12px;">Merhaba {cn}, kampanya kredisi talebiniz onaylandı.
      Hesabınıza <b>{amount} kredi</b> eklendi.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0;">
        <tr><td style="padding:8px 0;color:#64748b;">Eklenen Kredi</td><td style="text-align:right;font-weight:600;">{amount}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Toplam Krediniz</td><td style="text-align:right;font-weight:600;">{total}</td></tr>
      </table>
      <a href="{pu}" style="display:inline-block;background:{BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Kampanya Görseli Üret</a>"""
    text = (f"Kampanya kredisi talebiniz onaylandı\n\nMerhaba {company_name},\n"
            f"{amount} kredi eklendi. Toplam: {total} kredi.\nPortal: {portal_url}")
    return subject, _wrap(inner, "Kampanya krediniz onaylandı"), text


def special_day_reminder(company_name: str, day_name: str, day_label: str, days: int, portal_url: str):
    cn, dn, dl, pu = map(escape, [company_name or "Değerli iş ortağımız", day_name, day_label, portal_url])
    when = "bugün" if days <= 0 else f"{days} gün sonra ({dl})"
    subject = f"'{day_name}' yaklaşıyor — paylaşımınızı hazırlayın"
    inner = f"""
      <h2 style="margin:0 0 12px;font-size:18px;">{dn} {('bugün! 🎉' if days<=0 else 'yaklaşıyor 📅')}</h2>
      <p style="margin:0 0 12px;">Merhaba {cn}, <b>{dn}</b> {when}. Bu özel gün için firmanızın logosu
      ve marka kimliğiyle 3 farklı sosyal medya görselini tek tıkla üretebilirsiniz.</p>
      <a href="{pu}" style="display:inline-block;background:{BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Görselimi Üret</a>
      <p style="margin:14px 0 0;color:#64748b;font-size:13px;">Fotuber Medya · Özel Gün Takvimi</p>"""
    text = (f"{day_name} {when}\n\nMerhaba {company_name}, bu özel gün için logolu görsellerinizi üretin.\n"
            f"Portal: {portal_url}")
    return subject, _wrap(inner, f"{day_name} için görselinizi hazırlayın"), text



def appt_request_admin(name: str, phone: str, email: str, event_type: str, date: str, time: str, note: str, admin_url: str):
    n, p, e, et, nt, au = map(escape, [name or "-", phone or "-", email or "-", event_type or "-", note or "-", admin_url])
    when = " ".join([x for x in [date, time] if x]) or "-"
    subject = f"Yeni randevu talebi · {name}"
    inner = f"""
      <h2 style="margin:0 0 12px;font-size:18px;">Yeni randevu talebi 📅</h2>
      <p style="margin:0 0 12px;"><b>{n}</b> web sitesinden randevu talebi gönderdi. En kısa sürede geri dönün.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0;">
        <tr><td style="padding:8px 0;color:#64748b;">Ad Soyad</td><td style="text-align:right;font-weight:600;">{n}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Telefon</td><td style="text-align:right;font-weight:600;">{p}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">E-posta</td><td style="text-align:right;">{e}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Hizmet / Etkinlik</td><td style="text-align:right;">{et}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Tercih Edilen Zaman</td><td style="text-align:right;">{escape(when)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Not</td><td style="text-align:right;">{nt}</td></tr>
      </table>
      <a href="{au}" style="display:inline-block;background:{BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Talebi Görüntüle</a>"""
    text = (f"Yeni randevu talebi\n\nAd: {name}\nTelefon: {phone}\nE-posta: {email or '-'}\n"
            f"Hizmet: {event_type or '-'}\nZaman: {when}\nNot: {note or '-'}\n\nYönet: {admin_url}")
    return subject, _wrap(inner, "Yeni randevu talebi"), text
