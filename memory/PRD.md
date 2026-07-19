# Fotuber — Product Requirements & Progress

## Product
Fotuber Studio full-stack web app for photography/videography business. Live at https://fotuber.com.tr (Emergent Deploy + Cloudflare DNS).

## Roles (RBAC)
- customer — public booking flow
- staff — limited: only today's cash entries + kasa devir
- admin — full access: appointments, finance, exports, settings, users

## Completed (Feb 2026 — this session)
- Google Analytics 4 integration (admin sets GA ID in Site Ayarları → auto-injects gtag.js)
- Typography customization (heading font, body font, font scale slider) via Site Ayarları
- Role-based finance access: staff can only add cash entries for today; admin sees full cash flow, exports, summaries
- Kasa Devir Defteri (Daily Cash Register): opening balance + closing balance + auto-carryover to next day
- Staff account management (admin creates/edits/deletes staff or admin users with role selector)
- Staff dedicated portal at `/personel/gunluk` with simplified daily UI

## Previously Completed
- Public booking flow, dynamic calendar, blocked slots
- Admin dashboard, appointments (walkin + online), contract uploads
- Gallery, Services, Discount codes, Fotuber Medya (B2B portfolio)
- Cash flow with PDF/Excel exports (weekly/monthly/yearly/all)
- Twilio WhatsApp Sandbox notifications
- Site settings (branding, hero, socials, Google Maps, contract terms)
- Custom domain via Cloudflare DNS

## Backlog (P1/P2)
- P1: 24-hour appointment reminder cron
- P1: Twilio WhatsApp Business Sender (out of Sandbox)
- P2: Twilio SMS with Turkish number
- P2: Discount code usage analytics
- P2: Online kapora payment (Stripe/Iyzico)
- P2: Customer reviews/testimonials module

## Admin credentials
- admin@fotuber.com.tr / FTB.2024 (also alias: admin@fotuber.com)
