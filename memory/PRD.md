# Fotuber — Product Requirements & Progress

## Product
Fotuber Studio full-stack web app for photography/videography business. Live at https://fotuber.com.tr.

## Recent Session (Feb 2026 — Session C) — Venues, Couple Downloads, Animated Welcome

### Venue-Based Fixed QR Codes (Mekanlar)
- Admin creates a Venue (e.g., "Fotuber Nişanevi", "Düğün Salonu Ankara") once
- Each Venue has a PERMANENT QR code that never changes
- Admin activates the day's couple with couple_names + event_type (Düğün/Nişan/Kına/Nikah/DoğumGünü/Diğer) + date + welcome_message + quota + retention days
- Same venue QR resolves to whoever is the currently active couple
- Route: `/mekan/{venue_qr_token}` → auto-resolves to currently active event's upload flow

### Couple Download Link
- Admin generates a per-event download link with self-selectable expiry (2, 3, 4, 5, 6, or 7 days)
- Public route: `/paylas/{download_token}` — beautiful landing page showing couple names + event type + date + total files + days remaining + ZIP download button
- Admin can extend/revoke link anytime; expiry countdown shown to couple

### Enhanced Guest Upload UX
- Animated welcome overlay after guest login: golden radial gradient, spring-animated event type badge, couple names with letter-spacing entrance, date, motivational quote, "Fotoğraflarımı Yükleyeyim" CTA (session-persistent, shown once per event)
- Guidance texts: "Nasıl çalışır?" (1-2-3-4 flow), quota, auto-delete date, KVKK reassurance
- Works for both `/etkinlik/:token` (direct event) and `/mekan/:venueToken` (venue → resolved event)
- Event type-specific accent copy for each organization type

## Prior Sessions (already shipped)
- Photo Selection Albums (up to 1500 photos, share links, codes-only submission, WhatsApp notify)
- Guest Uploads with 200MB per-user quota, KVKK, auto-delete via hourly cron
- Product Options (canvas & album models CRUD)
- Role-based finance + Kasa Devir Defteri + monthly discrepancy report
- Staff account management
- Google Analytics + dynamic typography + SEO (meta, sitemap, robots, LocalBusiness JSON-LD, GSC)
- Cash flow PDF/Excel exports, discount codes, Fotuber Medya B2B page
- Twilio WhatsApp Sandbox
- Cloudflare custom domain

## Backlog (P1/P2)
- P1: 24-hour appointment reminder cron
- P1: Twilio WhatsApp Business Sender
- P2: Turkish SMS number
- P2: Streaming ZIP for very large events (>2GB)
- P2: Password-protect couple download link
- P2: Slideshow view for couple download page

## Admin
- admin@fotuber.com.tr / FTB.2024
