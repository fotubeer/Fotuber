# Fotuber – Randevu & Personel Yönetim Sistemi (fotuber.com.tr)

## Problem Statement (özet)
Fotoğraf/video stüdyosu için full-stack web uygulaması: halka açık marka sitesi + randevu akışı + korumalı personel yönetim paneli (kapora onay iş akışı, finans, personel, hizmet ve kategori bazlı galeri yönetimi).

## User Personas
1. Müşteri (customer): kayıt olur, hizmet seçer, dolu saatleri göremeden randevu talebi bırakır (durum "Beklemede").
2. Personel/Yönetici (admin): korumalı `/admin/*` panelinden randevuları onaylar (kapora ile), takvimi manuel kapatır, hizmet/personel/galeri yönetir, ciro ve rapor izler.

## Architecture
- Backend: FastAPI + MongoDB + JWT (bcrypt + httpOnly cookie + Bearer fallback), Emergent Object Storage entegrasyonu (galeri media).
- Frontend: React 19 + React Router v7 + Tailwind + shadcn/ui + framer-motion + recharts.
- Public site: koyu, sinematik, Cormorant Garamond başlıklar, altın (#d4af37) aksan.
- Admin panel: aydınlık, yoğun veri odaklı, Outfit/Manrope, slate palet.

## Core Requirements (static)
- İki rol: customer, admin. RBAC.
- Randevu durumları: pending / approved / cancelled.
- Onaylı randevu -> takvimde otomatik "dolu" (public API 409 döner).
- Manuel kapama (blocked_slots) admin panelden.
- Dolu saat yanında telefon + WhatsApp CTA (0501 000 25 23 / 90 5010002523).
- KVKK aydınlatma metni onayı ZORUNLU, pazarlama izni opsiyonel (User modelinde consent + tarih tutuluyor).
- Kapora & ödenen tutar admin onay dialog'unda; finans ekranında ciro/kapora özet + son 7 gün grafiği.
- Galeri: 6 kategori (nişan evi, fotoğraf çekimi, stüdyo çekimi, podcast alanı, klip çekimleri, karaoke alanı) — image/video yükleme.
- Route Guard: `/admin/*` giriş yapmamış veya customer olan kullanıcıyı ana sayfaya yönlendirir.

## Implemented (2026-02-18)
- ✅ Auth: register (+ KVKK/marketing consent), login, logout, /me
- ✅ Public site: Home hero + bento services + gallery preview, Services, Gallery (kategori filtre + lightbox), About, Contact, Booking flow (calendar + slots + summary + CTA)
- ✅ Randevu akışı: pending -> admin approve (kapora + paid dialog) -> slot artık müşteri tarafında görünmüyor
- ✅ Admin: Dashboard (stats + chart), Randevular (tabs pending/approved/cancelled + approve/cancel), Takvim & Kapatma, Finans (bar chart + tablo), Hizmetler CRUD, Personel CRUD, Galeri (upload/list/delete)
- ✅ Object storage entegrasyonu (Emergent) — image/video download endpoint public
- ✅ Floating WhatsApp/telefon butonları
- ✅ Test: 14/14 backend integration testleri geçti (auth, RBAC, availability, booking workflow, upload/download, admin CRUD)

## Backlog / Next
- P1: Email/SMS bildirim (kapora onayı + hatırlatma) — Twilio veya Resend entegrasyonu
- P1: Müşteri panelinde randevu iptal etme talebi
- P2: Personel maaş ödeme takibi + aylık PDF rapor
- P2: Çoklu personelli randevu ataması
- P2: KVKK sayfası ve gizlilik politikası içerik sayfaları
- P2: SEO meta + og:image + sitemap.xml

## Update — 2026-02-18 (iteration 2 & 3)
- ✅ **Site Ayarları** (`/admin/ayarlar`): Logo yükleme, marka (isim + tagline), hero başlıkları, hero arka plan görsel URL'si, iletişim (telefon/whatsapp/email/adres), hakkımızda metni — hepsi live siteyi güncelliyor (SettingsContext ile).
- ✅ **Nakit Akışı** (`/admin/nakit-akisi`): Gelir/gider hareket girişi. Nakit/kart/havale bazlı Bugün-Bu Hafta-Bu Ay büyük stat kartları + günlük (7 gün), haftalık (4 hafta), aylık (6 ay) bar grafiği + ödeme yöntemi dağılımı. Sadece admin görebilir ("Sadece Yetkili Admin" rozeti).
- ✅ **Sosyal medya**: Instagram (ana + ikinci), YouTube, TikTok, Facebook alanları. Admin panelden yönetilir, footer'da ikon olarak, iletişim sayfasında rozet olarak görüntülenir. Kullanıcı `@handle` veya tam URL girebilir — sistem otomatik normalleştirir.
- ✅ **Google Haritalar**: Adres alanı + iframe embed URL + paylaşım URL'si. İletişim sayfasında "Yol Tarifi Al" butonu ve site içi harita gösterimi. iframe HTML kodu yapıştırıldığında src otomatik çıkarılır.
- ✅ Login trim whitespace ile daha esnek.
- ✅ Backend: 30/30 test PASS (16 yeni + 14 regression).

