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
