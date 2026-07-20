# Fotuber — Product Requirements & Progress

## Product
Fotuber Studio full-stack web app for photography/videography business. Live at https://fotuber.com.tr.

## Roles
- Customer (public) — books, views, pays
- Staff — daily cash, limited financials
- Admin — full access, RBAC

## Session E (Feb 2026) — Appointment Overhaul (10-point request) + Intro Splash

### Backend (server.py)
- Appointment schema extended with: `notes`, `admin_notes`, `phone_2`, `event_type`, `event_addons[]`,
  `extra_services_note`, `mid_payments[]` (list of {id, amount, date, method, note, created_at, created_by, created_by_name}).
- `_enrich_appointment` now computes `mid_payments_total`, `paid_total`, `remaining_amount`.
- New endpoints:
  - `GET  /api/appointments/{aid}` (staff/admin) — single appointment fetch
  - `POST /api/appointments/{aid}/mid-payments` (admin) — add mid-payment
  - `DELETE /api/appointments/{aid}/mid-payments/{pid}` (admin) — remove mid-payment
- `PATCH /api/appointments/{aid}` now accepts date/time reschedule with 30-min slot & double-book validation.
- Slot system rewritten:
  - `_generate_slots(start, end)` produces 30-minute grid.
  - `PUBLIC_SLOTS` = 08:00 → 23:30, `FULL_SLOTS` = 00:00 → 23:30.
  - `/api/availability` detects auth: admin/staff → full 24h with booked visibility; public → 08:00-23:30 with booked slots HIDDEN (no availability info leaks).
- `POST /api/appointments` public validation switched to `PUBLIC_SLOTS` and accepts event_type/addons/phone_2/extra_services_note.
- `POST /api/appointments/walkin` accepts phone_2, event_type, event_addons, extra_services_note, admin_notes, and validates against FULL_SLOTS.

### Frontend — Phase 1 (Admin Randevu Yönetimi)
- `pages/admin/Appointments.jsx` rewritten:
  - Row click opens **Randevu Detay modalı** (fetches from `/appointments/{id}`).
  - Table shows Toplam / Kapora (ödenmiş toplam) / Kalan columns (admin-only).
  - Row shows: 2 telefon numarası, etkinlik türü + addon özet, "Not" rozet.
  - Detail modal supports editing name/phone/phone_2/email/date/time/event_type/event_addons/extra_services_note/notes/admin_notes.
  - Admin-only financial panel with Total / Deposit / Paid inputs + Toplam/Ödenmiş/Kalan cards.
  - Admin-only **Ara Ödemeler** list with add form (amount/date/method/note) + delete confirm.
- Walk-in dialog now accepts phone_2, event_type, event_addons, extra_services_note, admin_notes. Time select uses ADMIN_TIME_SLOTS (00:00-23:30 @30min).
- Removed manual `Content-Type: multipart/form-data` (axios auto-generates boundary).

### Frontend — Phase 2 (Dinamik Hizmetler & Public Booking)
- `pages/Booking.jsx` rewritten:
  - Prices HIDDEN publicly (service cards show only name / duration / description; summary shows no ₺).
  - Slots at 30-minute intervals for 08:00-23:30. Booked slots simply not returned by API (no "dolu" visibility).
  - New **Etkinlik Türü** step with pill buttons (`EVENT_TYPES` exported).
  - Conditional addon checkboxes: `wedding` → klip/albüm/tablo/baskı/düğün hikayesi; `engagement_venue` → ikramlı/ikramsız/fotoğraflı/klipli.
  - "Ekstra hizmet talebi" textarea.
  - 2. Telefon input added to booking form.
  - Summary shows event type + addons.
- `pages/Services.jsx` — prices removed publicly.
- `pages/Home.jsx` service bento removed price line.
- Time validation exclusively 30-min grid; public restricted to 08:00-23:30, admin/staff full 24h.

### Frontend — Phase 3 (Home CTAs + Calendar Blocking)
- `pages/Home.jsx`:
  - **FOMO banner** with pulsing icon: "Aktif randevu oluşturmak için acele edin — müsait tarihler hızla doluyor." + "Hemen Ara" (white pill) & "WhatsApp" (green) CTA buttons. Uses `settings.phone/whatsapp`.
  - **İndirim Kodu CTA** section: animated gift box with float+rotate, gold gradient card, dynamic percent, links to `/indirim-kodu`.
- `pages/admin/CalendarBlock.jsx` rewritten:
  - Monthly calendar highlights days with approved appointments (emerald ring/fill).
  - Selected date shows summary card of approved appointments (time + name + service).
  - Slot grid: 30-min grid, approved appointments render as GREEN "locked" cells with customer name; empty cells stay clickable "block" buttons.
  - Explains blocking behavior via footer note.

### Session E addon — Cinematic Intro Splash
- `components/IntroSplash.jsx` — luxury intro shown **once per browser session (per tab)** on Home page:
  - Guard: module flag `INTRO_ALREADY_PLAYED_THIS_TAB` + sessionStorage `fotuber_intro_seen_v3`.
  - Same tab F5 / SPA back-to-home → NO replay. New tab / new session → replays.
  - Personalised greeting: if user is logged in, line reads "Bugün harika görünüyorsunuz, {ilk_ad}." else generic.
  - Waits for `useAuth().loading === false` before starting phase timers to guarantee correct greeting.
  - Camera lens SVG animates in (aperture blades, gold engraving "FOTUBER · f/1.4").
  - Procedurally synthesised sound via Web Audio API (mechanical shutter click + high-freq flash whine decay + mirror thunk) — no external asset.
  - White flash burst overlay + expanding gold ring on shutter fire.
  - "Bugün harika görünüyorsunuz." in Cormorant Garamond, blur-in transition.
  - Logo (customer's uploaded logo from `settings.logo_id` with API_BASE) + "Fotuber" Manrope 900 + "Görsel Sanat" Great Vibes cursive gold.
  - Fully responsive (mobile 9:16, desktop 16:9), stacked composition.
  - "Atla →" skip button and click-anywhere-to-skip.
  - Body scroll locked during play; auto-unmounts after 5.4s with fade-out.
- Google Fonts extended: Great Vibes + Cormorant Garamond + Manrope (weights 300–900) preconnected in `public/index.html`.

## Prior Sessions
- Photo Selection Albums, Guest Uploads with QR/venue, Product Options, Kasa Devir, Analytics, SEO, PDF/Excel exports, Twilio WhatsApp Sandbox.

## Backlog (P1/P2)
- P1: 24-hour appointment reminder cron
- P1: Twilio WhatsApp Business Sender
- P2: Turkish SMS number
- P2: Streaming ZIP for very large events
- P2: Password-protect couple download link
- P2: Slideshow view for couple download page
- P2: Refactor `server.py` (>3200 lines) into `/routes` modules

## Admin
- admin@fotuber.com.tr / FTB.2024

## Notes
- Live site cache: user must "Re-publish changes" from Emergent to reflect preview → production.
- Response language: TURKISH always.
- CSS override for Radix Dialog/AlertDialog forces dark text — DO NOT add `role="dialog"` on non-modal fixed overlays (learned from IntroSplash gold-text bug).
