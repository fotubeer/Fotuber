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

### Session E addon — Cinematic Intro Splash + Admin Control Panel + Instagram Slideshow
- `components/IntroSplash.jsx` — luxury intro shown **once per browser session (per tab)** on Home page:
  - Guard: module flag `INTRO_ALREADY_PLAYED_THIS_TAB` + sessionStorage `fotuber_intro_seen_v4`.
  - Debug: append `?intro=1` (or `#intro`) to any URL to force play (bypasses session flag).
  - Same tab F5 / SPA back-to-home → NO replay. New tab / new session → replays.
  - Personalised greeting: template with `{ad}`/`{comma_name}` placeholders.
  - Waits for `useAuth().loading === false` && `useSettings().loading === false` before starting timers.
  - Timeline ≈ 13.5s: lens 0-1.4s, flash 1.4s (with shutter click fired at 1.15s), line 2.9-6.9s, brand 7.0-13.5s.
  - Web Audio API procedural sound: shutter click + xenon whine + heartbeat bass + mirror thunk + sizzle. Master gain node routes volume from admin setting.
  - Mute toggle button + skip button visible during intro.
  - AudioContext resume on any first user gesture (fights browser autoplay policy).
- **`pages/admin/AdminIntroSettings.jsx`** (route: `/admin/animasyon-ayarlari`, sidebar: "Açılış Animasyonu"):
  - Toggle intro on/off master switch.
  - Toggle sound on/off + volume slider.
  - Greeting text with `{ad}`/`{comma_name}` variables.
  - Brand top/bottom + domain label editing.
  - Font dropdowns (3 curated font stacks each: greeting/brand/cursive) with live preview.
  - Dedicated intro logo upload (separate from site logo; falls back if empty).
  - "Önizle" opens `/?intro=1` in new tab. "Varsayılana Dön" resets.
- Backend `SiteSettingsIn` extended: `intro_enabled`, `intro_sound_enabled`, `intro_volume`, `intro_greeting_text`, `intro_brand_top`, `intro_brand_bottom`, `intro_subtitle_domain`, `intro_font_greeting`, `intro_font_brand`, `intro_font_cursive`, `intro_logo_id`.
- Google Fonts extended: Playfair Display, Poppins, Poiret One, Dancing Script, Pinyon Script (in addition to prior Manrope/Great Vibes/Cormorant).

### Instagram Slideshow (Manual, admin-managed)
- Backend `instagram_posts` collection + `site_assets` for images.
- Endpoints: `GET /api/instagram-posts` (public active), `GET /api/instagram-posts/all` (admin), `POST /api/instagram-posts` (multipart file+form fields), `PATCH /api/instagram-posts/{id}`, `DELETE /api/instagram-posts/{id}`, `GET /api/instagram-posts/{id}/image`.
- **`pages/admin/AdminInstagramSlideshow.jsx`** (route: `/admin/instagram-slayt`, sidebar: "Instagram Slayt"):
  - Upload photo + set Instagram URL, account label (@fotuberphotography / @cankirinisanevii), caption, order, active.
  - Grid view with reorder (up/down arrows), active/inactive toggle, delete confirm.
- **`components/InstagramSlideshow.jsx`** — Home page section between FOMO banner and discount CTA:
  - Auto-rotating slideshow with 5.5s interval (pauses on hover).
  - Left column: heading, account chips linking to both Instagram profiles, slide counter.
  - Right column: 16:10 aspect card with cinematic fade+scale transitions, bottom gradient overlay showing account label + caption + "Instagram'da Aç" pill.
  - Prev/next arrows (shown on hover) + dot indicators.
  - Clicking anywhere on the slide opens the associated Instagram URL in a new tab.
  - Renders nothing when no posts exist.
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
