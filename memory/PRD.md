# Fotuber — Product Requirements & Progress

## Product
Fotuber Studio full-stack web app for photography/videography business. Live at https://fotuber.com.tr.

## Roles (RBAC)
- customer, staff (limited), admin (full)

## Completed Modules

### Session Feb 2026 (session A) — Personalization + Analytics
- Google Analytics 4 via GA ID field in Site Ayarları (auto gtag.js injection)
- Dynamic typography: 10 font choices + 0.8×–1.3× scale slider
- Role-based finance: staff can only add today's cash; admin sees exports/summary
- Kasa Devir Defteri (daily open/close, auto-carryover)
- Monthly discrepancy report (aylık eksik/fazla çıkan günler)
- Staff account management (admin creates staff/admin users)
- SEO: dynamic per-page meta, LocalBusiness JSON-LD, robots.txt, sitemap.xml, Google Search Console verification, OG image, Google preview widget

### Session Feb 2026 (session B) — Photo Selection & Guest Uploads
- Photo Selection Albums:
  - Admin creates per-couple album, uploads up to 1500 preview-quality photos (server auto-resizes to 1600px JPEG 82%)
  - Photo codes auto-extracted from filename (DSC00123.JPG → DSC00123)
  - Shareable token link; auth REQUIRED to view
  - Customer picks photos → sepet dialog → chooses Albüm/Baskı(5 sizes)/Tablo + boyut/adet/not
  - Only codes are stored (no re-uploads) with couple names + event date
  - WhatsApp notification sent to admin on selection submit
  - Native lazy loading + batched 20-file uploads to stay stable at scale
- Product Options admin CRUD (canvas + album models with size/price/description)
- Guest Event QR Upload:
  - Admin creates event → gets QR code (downloadable PNG) to place on tables
  - Guests scan QR → register (KVKK checkbox mandatory) → upload up to 200MB/user photos+videos
  - Server-side quota enforcement (413 on exceed)
  - Auto-delete task runs hourly, purges files past `delete_at`
  - Admin can extend retention (+3/+7 days) or download all files as UTF-8-safe ZIP

### Prior Sessions
- Booking flow, dynamic calendar, blocked slots, walkin appts, contract uploads, gallery, services, discount codes, Fotuber Medya, PDF/Excel cashflow exports, Twilio WhatsApp Sandbox, Cloudflare custom domain

## Backlog (P1/P2)
- P1: 24-hour appointment reminder cron
- P1: Twilio WhatsApp Business Sender (out of Sandbox)
- P2: Turkish SMS number
- P2: Discount code usage analytics
- P2: Online kapora payment (Stripe/Iyzico)
- P2: Customer reviews module
- P2: Streaming ZIP download for very large guest events (>2GB)

## Admin
- admin@fotuber.com.tr / FTB.2024
