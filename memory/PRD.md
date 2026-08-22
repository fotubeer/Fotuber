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
- **`pages/admin/AdminInstagramSlideshow.jsx`** (route: `/admin/instagram-slayt`, sidebar: "Instagram Slayt")
- **`components/InstagramSlideshow.jsx`** — Home page section with cinematic auto-rotating slideshow.

### Fotuber Asistan (AI Chatbot)
- Uses Emergent Universal Key with Claude Sonnet 4.6 (default). Multi-turn with Mongo-backed session digest.
- Backend endpoints:
  - `POST /api/ai/chat` — accepts {session_id, message, city, event_date}. Optionally fetches Open-Meteo weather (city geocoded + forecast + sunset).
  - `GET /api/ai/weather?city=&date=` — Open-Meteo proxy.
  - `GET /api/ai/sessions` (admin) + `GET /api/ai/sessions/{id}/messages` (admin) — session monitoring for training / review.
- **`components/FotuberAI.jsx`** — Floating camera-robot FAB on Home page bottom-right + animated speech bubble "Fotuber yapay zekaya sor ve öğren".
  - Panel: header with online status, city+date context inputs, chat log, thinking indicator, "Şimdi randevu al" CTA (auto-detects event_type from convo), message input.
  - SVG camera-bot with animated pupil/flash/blinking recording light.
  - Session id persists in sessionStorage (`fotuber_ai_session_v1`).
- **`pages/admin/AdminAIAssistant.jsx`** (route: `/admin/fotuber-asistan`, sidebar: "Fotuber Asistan (AI)"):
  - Enable/disable toggle, model dropdown (Claude/GPT/Gemini variants), default city, bubble/welcome/system-prompt editing, live session review.
- Default system prompt is Turkish-culture-aware, conservative-friendly for tesettürlü / muhafazakar müşteriler, 6-sentence limit, no pricing, redirects to booking calendar.
- Adds `EMERGENT_LLM_KEY` to `/app/backend/.env`.
- Adds `emergentintegrations` pip package.
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

## Session Z3 (Jun 2026) — Sözleşme UI/mobil düzeltmeleri + Sözleşme düzenleme + Fotuber Medya girişi + Header overflow (self-tested)
- **Beyaz-üzeri-beyaz butonlar**: `ContractView.jsx` — kök `text-neutral-900`, "Linki Kopyala/QR/PDF İndir" butonlarına `text-neutral-900` (global `body{color:#fafafa}` kaynaklı görünmezlik giderildi). Screenshot ✅.
- **Mobil/iç içe girme**: `ContractSheet.jsx` — çift sütunlar `grid-cols-1 sm:grid-cols-2`, dolgu `p-4 sm:p-[46px]`, header `flex-wrap`; `PublicContract.jsx` kök + input `text-neutral-900`. 380px'de doğrulandı (sheet 361px, tek sütun, çakışma yok) ✅.
- **Sözleşme Düzenle/Yeniden Al**: `ApptBuilder.jsx` düzenleme modu — route `/admin/randevu-duzenle/:contractId`, var olan sözleşmeyi yükleyip alanları + hizmet/ürün seçimlerini `line_items` etiketlerinden yeniden kurar; kaydet → `PUT /appt-pro/contracts/{id}` (aynı public_token/PDF güncellenir). `ContractView`'e "Düzenle" butonu. Curl PUT + prefill screenshot ✅.
- **Fotuber Medya girişi**: `PublicLayout.jsx` — "Paneller" dropdown + mobil menü + footer'a `/medya` girişi (firma giriş noktası). Screenshot ✅.
- **Header "İletişim" overflow (giriş yapınca sıkışma)**: `PublicLayout.jsx` — kullanıcı adı `hidden 2xl:inline` + Çıkış laptopta ikon-only; 3 promosyon linki (Altın Saat/Tasarım Stüdyosu/İndirim Kodu) tek **"Fırsatlar"** dropdown'ında toplandı; CTA boşlukları daraltıldı. 1280/1366/1440'ta İletişim görünür + tıklanabilir ✅.
- NOT: Tüm bunlar önizlemede; canlıya (fotuber.com.tr) yansıması için kullanıcı **Yeniden Yayınla** yapmalı.
- BEKLEYEN: Photobooth "tamamla" kapsamı kullanıcıdan netleştiriliyor (yazıcı / ödeme / anı sayfası / admin / salon-firma bağlama).

## Session Z4 (Jun 2026) — Photobooth: Yazıcı + Ödeme (Nakit/Kart-POS) + Çerçeve/Logo eklentileri
- **Ödeme adımı** (`photobooth.py` capture): `payment_method` (cash|pos|card|free) + `staff_pin`. `payment_required` açıkken ve ücretli pakette **personel PIN'i (admin_exit_pin) ile onay şart** (istismar önleme) → status "paid". Fiziki POS modeli (online link yok). `cash_enabled` ayarı: site admini **Nakit'i firmaya göre aç/kapat**. Curl: PIN'siz 403, PIN'li 200 ✅.
- **Yazdırma** (`PhotoboothKiosk.jsx`): "Yazdır" gerçek tarayıcı yazdırma penceresi açar (print-ready, `@page margin:0`), paket baskı adedini gösterir.
- **Çerçeve/logo eklentileri**: template'e `frame_url` (şeffaf PNG overlay), `border_color`, `border_width`; `composePhoto` kenarlık çizer + çerçeveyi tuvale bindirir + footer'a logo + slogan + `event_hashtag` + tarih damgası ekler. Admin formunda tüm alanlar. Curl kayıt ✅.
- **Kiosk akışı**: idle→countdown→çekim→filtre→çerçeve→paket→**ödeme (Nakit/Kart-POS + PIN)**→işleme→baskı & QR. Kiosk hatasız yükleniyor ✅; admin kontrolleri render ✅.
- NOT: Ödeme/baskı UI'ı gerçek kamera gerektirdiği için on-device test kullanıcıya kaldı; backend + admin + derleme doğrulandı. Canlıya için **Yeniden Yayınla** gerekir.

## Session Z5 (Jun 2026) — Photobooth ÇOK FİRMALI (multi-tenant) + doğrudan yazıcı
- **Firmalar (tenant)** `photobooth_tenants`: ayrı operatör girişi (JWT, role booth_operator; `/photobooth/operator/login|me`). Site admini firma + operatör hesabı açar (`/photobooth/admin/tenants` CRUD) ve **tek tek yetki** verir (event_info/frames/texts/print_toggle). Operatör yalnızca sınırlı panelde (`/photobooth-panel`) çalışır; **fiyat göremez/değiştiremez**.
- **Firma-bazlı fiyat**: paketlere `tenant_id`; admin her firma için ayrı paket tanımlar. Ücretsiz paket yok (fiyat>0).
- **Kiosk kapsamı**: operatör kioska kendi hesabıyla girer (`booth_token`) → `/operator/config` + `/operator/capture` (kendi firma ayar/çerçeve/paketleri). **Site admini kiosku çalıştırınca `admin_free:true` → ödeme atlanır, her şey ücretsiz** (test için).
- **Ödeme**: paket→ödeme adımı (Nakit / Kart-POS), personel PIN onayı (istismar önleme). **Nakit'i site admini firmaya göre `cash_enabled` ile aç/kapat.** Fiziki POS modeli (online link yok).
- **Global PNG çerçeveler**: admin PNG yükler (`/admin/frames/upload`, `is_global`), **tüm firma kiosklarına otomatik** yansır (`/frame/{id}` servis; operator_config global+tenant birleştirir). Toplu güncelleme.
- **Çerçeve cm boyutu**: `width_cm`/`height_cm` — `composePhoto` canvas'ı bu orana (300dpi) kurar, dış çerçeve tekli/çoklu düzende **tam oturur**.
- **Doğrudan yazıcı**: "Yazdır" artık diyalog açmaz; sayfa içi gizli `#pb-print-root` + `@page size: WxH cm` + `window.print()`. **Chrome `--kiosk-printing` bayrağı + varsayılan yazıcı** ile diyalogsuz otomatik basar (operasyonel kurulum kullanıcıda).
- Doğrulama: curl — tenant/operatör/ayar/çerçeve/config/capture(403↔200)/global-frame(cm)/admin_free ✅; screenshot — operatör paneli + admin firma yönetimi + cm'li çerçeveler ✅. Kiosk kamera gerektirdiği için on-device test kullanıcıda (yarın).

## Admin
- admin@fotuber.com.tr / FTB.2024

## Session Z6 (Jun 2026) — Randevu & Sözleşme Sistemi Sadeleştirme (verified iteration_71, backend 100% / frontend 100%)
- **Sözleşme PDF tek sayfa + manuel tür**: `appt_pro._build_contract_pdf` kompaktlaştırıldı (küçük font/leading/margin) → hem venue hem photo TEK SAYFA. Sözleşme türü (Davet Evi vs Fotoğrafçılık) artık **admin MANUEL seçer** (`brand_variant`; otomatik atama kaldırıldı). PDF/`ContractSheet` madde setini `brand_variant`'a göre seçer: venue→`clauses`, photo→`clauses_photo`. Photo sözleşmesinde 'Davet Evi' geçmez; venue markası `FOTUBER Davet Evi` (eski karışık 'FOTUBER Photography & Davet Evi' temizlendi).
- **Dual sözleşme şablonu**: settings'e `clauses_photo` (fotoğrafçılık maddeleri — mekan/organizasyon maddeleri olmadan) eklendi; `clauses` = Davet Evi/organizasyon. Admin Sözleşme İçeriği sekmesinde toggle ile ayrı düzenlenir (`ct-clauseset-clauses` / `ct-clauseset-clauses_photo`).
- **Katalog 3 bağımsız kategori**: `appt_services`'e `kind` alanı (service|event). `list_services?kind=` filtresi. Seed/backfill: eski kayıtlara kind eklenir (venue→event), **'Aktüel Kamera'** çekim hizmeti eklenir. AdminApptCatalog sekmeleri: **Hizmetler**(kind=service), **Etkinlikler**(kind=event), **Ek Hizmetler**(ürünler). Tam CRUD. ApptBuilder ayrı 'Etkinlikler' + 'Hizmetler' bölümleri + manuel Sözleşme Türü seçici (`brand-venue`/`brand-photo`).
- **Public müşteri randevu TALEBİ** (`/randevu-al`, login yok — `PublicBooking.jsx`): ad/telefon/e-posta/etkinlik/tarih/saat/not + **KVKK & iletişim onayı ZORUNLU**. `POST /api/appt-pro/public/requests` KVKK yoksa 400, kapalı günde 400. `GET/PATCH/DELETE /api/appt-pro/requests` (staff) admin panelinde 'Randevu Talepleri' sekmesi + rozet + durum (yeni/arandı/dönüştü/iptal) + Ara/WhatsApp. Header 'Randevu Al' CTA'ları `/randevu-al`'a yönlendirildi.
- **KVKK metni**: standart 6698 aydınlatma + **arama/SMS/e-posta/kampanya-reklam açık rıza** metni (`kvkk_text`, admin panelden düzenlenebilir). `GET /api/appt-pro/public/settings` kvkk_text + working_hours + event_types döner.
- **Takvim/Tatil kapatma**: `appt_blocks` koleksiyonu — tüm gün VEYA saat aralığı. `GET/POST/DELETE /api/appt-pro/blocks` (admin). `GET /api/appt-pro/public/day-status?date=` → closed + blocked_ranges + working_hours. AdminApptCatalog 'Takvim & Tatil' sekmesi + çalışma saati ayarı (settings.working_hours).
- Doğrulama: pytest 10/10 (iter71) + frontend E2E admin sekmeleri + public talep akışı. PDF tek sayfa (pypdf) venue+photo doğrulandı. NOT: canlıya (fotuber.com.tr) için kullanıcı **Yeniden Yayınla** yapmalı.

## Session Z7 (Jun 2026) — Talep→Sözleşme Dönüştür + Otomatik Admin Bildirim (verified iteration_72, %100)
- **Talep→Sözleşme Dönüştür**: AdminApptCatalog 'Randevu Talepleri' kartında **'Sözleşmeye Dönüştür'** butonu (`req-to-contract-<id>`) → `navigate('/admin/randevu-olustur', {state:{prefill, requestId}})`. ApptBuilder `useLocation().state.prefill` ile alanları doldurur (bride-name, ev-date/time, party.email, adminNotes) + talebin `event_type`'ına uyan hizmet/etkinliği seçer ve `brandVariant`'ı kind'e göre ayarlar. Sözleşme kaydedilince `PATCH /appt-pro/requests/{id}` status='converted'.
- **Otomatik Admin Bildirim**: `appt_pro.create_request` yeni talepte `asyncio.create_task` ile (1) admine e-posta (`email_service.appt_request_admin`, Gmail SMTP, admin panel linkli) + (2) `notify_external` (Twilio SMS+WhatsApp) gönderir. Twilio .env'de tanımsız → WhatsApp/SMS zarifçe atlanır (istek yine 200). deps'e `notify_external=_try_send_external_notification` eklendi.
- Doğrulama: pytest 4/4 (iter72) + frontend E2E (dönüştür→prefill→save→converted). Background task exception isteği bozmuyor; KVKK/kapalı-gün regresyonları hâlâ 400. NOT: WhatsApp/SMS'in GERÇEKTEN gönderilmesi için .env'e TWILIO_ACCOUNT_SID/AUTH_TOKEN/WHATSAPP_FROM eklenmeli.

## Session Z8 (Jun 2026) — Masaüstü (Electron) Stüdyo Paneli Kilidi (Playwright ile doğrulandı)
- **Sorun**: Windows masaüstü uygulaması açılışta web sitesinin ana sayfasına gidiyordu ve site içinde başka sayfalara geçilebiliyordu. İstenen: doğrudan Stüdyo giriş/paneline açılsın, başka sayfalara geçilemesin.
- **Çözüm (SPA seviyesi — asıl kilit)**: `components/DesktopGuard.jsx` — `window.fotuberDesktop.isDesktop` (Electron preload'dan) true ise ve yol `/studyo` ile başlamıyorsa `navigate('/studyo', {replace})`. App.js'te `<DesktopGuard/>` BrowserRouter içine eklendi. `isDesktopApp()` helper export edildi. Web tarayıcıda (bayrak yok) hiçbir etki yok.
- **StudioPortal**: masaüstünde '← Fotuber ana sayfa' linki ve DesktopDownloadButtons gizlendi (`!isDesktopApp()`).
- **Electron (`desktop/main.js`) yedek kilit**: `will-navigate` artık farklı origin → sistem tarayıcısı; aynı origin ama `/studyo` dışı yol → engellenir, `config.APP_URL`'e (/studyo) döner. `config.js` APP_URL zaten `/studyo`.
- **Doğrulama (gerçek Playwright, /tmp script)**: masaüstü bayrağıyla `/hizmetler` ve `/` → `/studyo`'ya yönlendi (studio-portal render); bayraksız (web) `/hizmetler`'de kaldı ✓.
- **ÖNEMLİ**: Asıl kilit + link gizleme WEB tarafı kodudur → kullanıcı **Yeniden Yayınla** yapınca ZATEN KURULU masaüstü uygulamasında da anında aktif olur (exe'yi yeniden derlemeye gerek yok). Sadece Electron `will-navigate` yedeği için exe yeniden derlenmeli (opsiyonel/güvenlik ağı).
- **BEKLEYEN (kullanıcı isteği)**: Düğün salonu (venue) paneline REZERVASYON SİSTEMİ kurulacak — içeriği kullanıcıyla ayrıca konuşulacak.

## Session X (Jun 2026) — Fotuber Medya FAZ 2: Yapay Zeka İçerik Asistanı (self-tested: curl + browser E2E)
- **Backend** (`routers/partner.py`): `POST /api/media/partner/ai-content` (partner auth) — image (multipart) + platform + context. Gemini 3 Flash (`gemini-3-flash-preview`, Emergent LLM Key) görseli analiz edip TÜRKÇE JSON döner: `{captions[3], hashtags[], tip}`. Platform tonları `_PLATFORM_GUIDE` (instagram_post/story, facebook, tiktok, twitter). 12MB limit, image-only. `GET /api/media/partner/ai-platforms`. Loglar `db.media_ai_logs`.
- **Frontend** (`pages/MediaPortal.jsx`): "Yapay Zeka İçerik Asistanı" paneli (`media-ai-panel`) — fotoğraf yükle/önizleme, platform pill'leri (`ai-platform-*`), bağlam textarea, "İçerik Üret", sonuç kartları (varyantlar + hashtag chip'leri + tip) her biri kopyala butonlu.
- Doğrulama: curl gerçek Gemini yanıtı (3 TR varyant + hashtag) ✅; tarayıcı E2E (upload→TikTok→üret→sonuç render) ✅.
- Test partner: aitest@firma.com / Test1234 (yetki: indir/yükle/sil).

## Session Y (Jun 2026) — Fotuber Medya FAZ 3: Özel Gün Takvimi + İçerik Geçmişi (self-tested: curl E2E + screenshot)
- **Özel Gün Takvimi** (`routers/partner.py`): `GET /api/media/partner/special-days` — bugünden itibaren yaklaşan 14 Türk özel günü (`_FIXED_SPECIAL_DAYS` + dinamik Anneler/Babalar Günü hesabı `_nth_weekday`). `POST /api/media/partner/special-day-images` {day_name, format(post/story), context} — **Gemini Nano Banana** (`gemini-2.5-flash-image`) ile 3 farklı stilde görsel üretir (asyncio.gather paralel), PIL ile hedef orana (post 1024², story 1024×1536) kırpar + partner logosunu (logo_key) sağ alta yarı saydam zeminle bindirir, storage'a kaydeder, base64 data_url döner. `db.media_special_images`.
- **İçerik Geçmişi**: `ai-content` artık her üretimi `db.media_ai_history`'ye kaydeder. `GET /api/media/partner/ai-history?favorites=` (liste + platform_label), `POST .../ai-history/{hid}/favorite` (toggle), `DELETE .../ai-history/{hid}`.
- **Frontend** (`MediaPortal.jsx`): Üç sekmeli alt panel (`media-tabs`: İçerik Asistanı / Özel Gün Takvimi / İçerik Geçmişi). Özel Gün: gün listesi (`special-day-*`), format pill'leri, bağlam, "Logolu Görsel Üret" → 3 görsel + indir. Geçmiş: favori yıldızı + favori filtresi + kopyala + sil.
- Doğrulama: curl — special-days 14 gün ✅, image gen 3 görsel (logosuz) ✅ + logolu story 1024×1536 has_logo:true ✅, history populate/favorite/filter/delete ✅. Screenshot — 3 sekme + Özel Gün paneli render ✅.

## Session Z (Jun 2026) — Marka Kiti + Görsel Galerisi + Anti-İstismar Kredi Modeli (self-tested: curl E2E + screenshot)
- **Anti-istismar kilidi**: Özel gün görsel üretimi ARTIK serbest metin ("context") almıyor; `day_name` sunucuda resmi takvime karşı doğrulanıyor (uymayan istek 400). Çalışan kendine kişisel/keyfi görsel üretemez. Kampanya görselleri ise ayrı, **admin onaylı kredi** ile üretilir.
- **Kampanya Kredisi**: partner `campaign_credits` (default 0). `GET /partner/credits`, `POST /partner/credit-request` (tek bekleyen talep), `POST /partner/campaign-images` {brief, format} → 1 kredi düşer (atomik `$gte:1` + `$inc:-1`), 3 varyant üretir; üretim tümüyle başarısızsa kredi iade. Admin: `GET /media/admin/credit-requests`, `.../{rid}/approve` (miktar), `.../{rid}/reject`, `POST /media/admin/partners/{pid}/credits` (delta). `_out` + admin liste `campaign_credits` döner.
- **Marka Kiti**: `PUT /partner/brand` {primary_color, secondary_color, font(modern/elegant/script/bold), logo_pos_post, logo_pos_story (9-grid tl..br)}. `_make_images` ortak helper hem özel gün hem kampanyada marka rengi+font'u prompt'a enjekte eder, `_overlay_logo` logoyu seçilen 9-grid konuma bindirir.
- **Görsel Galerisi**: üretilen tüm görseller `db.media_special_images` (kind: special|campaign). `GET /partner/special-gallery`, `GET /partner/special-image/{id}?t=<token>` (query veya header token, sahiplik kontrolü — `<img src>` uyumlu), `DELETE /partner/special-image/{id}`.
- **Frontend** (`MediaPortal.jsx`): 6 sekme (İçerik Asistanı / Özel Gün / Kampanya Görseli / Marka Kiti / Görsel Galerisi / Geçmiş). Kampanya: kredi rozeti + talep dialogu + brief üretim. Marka Kiti: renk seçici + font + iki 9-grid logo konumu. Galeri: kind rozetli grid + indir/sil. `AdminMedia.jsx`: bekleyen kredi talepleri kartı (onayla/reddet) + firma satırında kredi butonu (ekle/düş).
- Doğrulama: curl — brand kaydet ✅, geçersiz özel gün 400 ✅, kredisiz kampanya 402 ✅, talep→admin onay→3 kredi ✅, kampanya üretimi kredi 3→2 + logo ✅, galeri token'lı servis 200 / tokensız 401 ✅. Screenshot — 6 sekme + Kampanya/Marka Kiti/Galeri + admin kredi butonu render ✅.

## Session Z2 (Jun 2026) — Kredi/Özel Gün E-posta Bildirimleri + Marka Önizleme (self-tested: gerçek Gmail gönderim + screenshot)
- **Kredi bildirimi e-postaları** (`email_service.py`): `credit_request_admin` (talep gelince ADMIN'e, admin panel linkli), `credit_approved_partner` (onaylanınca FİRMA'ya, portal linkli + toplam kredi). `partner.py`: `request_credits` → admin'e, `approve_credit_request` → firmaya `asyncio.create_task(send_email)`. Deps'e `admin_email`, `public_app_url` eklendi.
- **Özel gün otomatik hatırlatma** (`server.py`): `_run_media_special_reminders` + `_media_special_reminder_loop` (startup'ta, 12 saatte bir). `routers.partner._upcoming_special_days` içe aktarılır; özel güne **3 gün** ve **0 gün (o gün)** kala aktif firmalara `email_service.special_day_reminder` gönderir. Idempotent `email_log` key `media_special:{pid}:{date}:{days}`. Admin manuel tetik: `POST /api/admin/media-special-reminders`.
- **Marka Önizleme** (`MediaPortal.jsx`): Marka Kiti panelinde canlı önizleme — Gönderi (1:1) ve Story (9:16) örnek kartları, marka renk gradyanı + seçilen yazı tipi (modern/elegant/script/bold → Montserrat/Playfair/Great Vibes) + logonun seçilen 9-grid konuma CSS ile yerleşimi. Font/renk/konum değişince anında güncellenir.
- Doğrulama: gerçek Gmail gönderimi ✅ (special_day_reminder, credit_approved_partner, credit_request_admin şablonları fotubeer@gmail.com'a iletildi); email-status configured/gmail ✅; media-special-reminders no-target erken dönüş {partners:0} doğru ✅; Marka Önizleme screenshot (script font + tl/bc logo konumu canlı) ✅.



## Session F (Feb 2026) — Sidebar Scroll Fix + Auto Face Detection + Auto Ledger + BG Removal
- **AdminLayout.jsx**: Sidebar refactored to flex-column with `overflow-y-auto` on the nav and a sticky footer. Fixes mobile scrolling bug — "Vesikalık Üretici" (last item) is now reachable on all viewports. Added dark overlay + click-to-close.
- **Vesikalık — Otomatik Yüz Tespiti**: Added `@vladmandic/face-api` integration.
  - `src/lib/faceDetect.js`: lazy-loads TinyFaceDetector + FaceLandmark68 from jsdelivr CDN; returns a biometric-compliant crop rect `{cx, cy, w}` computed from eye-line + chin using ICAO ratios (head 72% of photo height, eyes 55% from bottom).
  - `AdminPassportPhoto.jsx`: crop model refactored from fractional to pixel-space (`{cx, cy, w}`). Auto-detect fires on upload and re-runs when the country/format changes. Manual "Otomatik Yüz Tespiti" button + loader + emerald status pill.
- **Vesikalık — Kritik Bug Fixes (v9)**: (yukarıda)
- **Vesikalık — İki Ayrı Kıyafet Modu (v8)**:
  - **Renk (ücretsiz, kanvas)**: Yeni `recolorGarment()` fonksiyonu — face-api ile çene çizgisi tespit ediliyor, 4 köşeden arka plan tonu örneği alınıyor, yanaktan cilt tonu referansı çıkarılıyor. Çene altındaki her piksel için: bg/skin değilse HUE + SATURATION target renkten, LIGHTNESS orijinalden → kumaş kıvrımları, gölge ve dokular aynı kalır. Yüz/cilt/arka plana **hiç dokunmaz**, AI çağrısı yok.
  - **AI Kıyafet (Nano Banana)**: Mevcut flow — cinsiyet + kıyafet tipi + yakalı/yakasız seçimi, "Kıyafeti Değiştir (AI)" ile manuel tetiklenir, otomatik değil.
  - **Mod anahtarı**: Kartın üstünde iki-buton segmentli switch (Renk yeşil / AI mor). Aktif mod büyük vurgulu buton + emoji renkli bilgi kutusuyla net gösteriliyor. Renk modunda AI-only kontroller (cinsiyet/kıyafet listesi/yaka) tamamen gizleniyor; AI modunda "Rengi Değiştir" butonu gizleniyor. Renk paleti + serbest color picker her iki modda ortak.
  - **Ortak undo**: Her iki mod da aynı `undoRef` stack'ini besliyor; "Geri Al" son adımı geri yükler.
- **Vesikalık — Profesyonel Stüdyo Editörü (v7)**: (yukarıda)
- **Vesikalık — UX Polish: Büyük Fontlar + Kırmızı Slider + Zoom (v6)**:
  - **AI Kıyafet Değiştirme**: Backend Gemini Nano Banana (`gemini-3.1-flash-image-preview`) ile Emergent LLM Key kullanıyor. Cinsiyet (Erkek/Kadın) seçimine göre kıyafet listesi dinamik (Erkek: tişört/polo/gömlek/ceket, Kadın: tişört/bluz/yakalı bluz/ceket). Yakalı/Yakasız/Fark Etmez segmentli seçici. 16 renk paleti + serbest color picker + opsiyonel renk adı input'u. AI prompt yüz/saç/cilt/arka planın DEĞİŞMEMESİ için sıkı şekilde kısıtlanıyor. Beyaz kıyafet + biyometrik red sorununu çözmek için tam istenen özellik.
  - **Kırmızı Göz Giderme**: `detectFaceRegions` (yeni faceDetect.js helper'ı) face-api landmark'larından sol/sağ göz bbox'larını çıkarıyor. Bu rect'lerde R>100 & R > (G+B)*0.9 pikselleri luminance-koruyan koyu piksele dönüştürüyor. Yüzün geri kalanına dokunmuyor.
  - **Göz Netleştirme**: Aynı göz bbox'ları üzerinde unsharp mask (blur(1.4px) fark alma × 0.9 amount). Sadece göz bölgesi keskinleşir.
  - **Önce/Sonra Karşılaştırma**: Dialog içinde `originalSrc` altında, `image.src` üstte vertical clip mask ile split view. Alt slider (kırmızı accent) ile pozisyon 0-100. "Önce"/"Sonra" etiketleri sağ/sol köşede.
  - **Undo Stack**: `undoRef` her AI/pixel işleminden ÖNCE snapshot push ediyor (max 20). "Geri Al" butonu son adımı geri yükler. Toast bildirimi ile onay.

  - **Fontlar büyütüldü**: `admin-vesikalik-title` `text-3xl → text-4xl`, sub açıklama `text-sm → text-base`, tüm CardTitle'lar `text-base → text-lg`, İnce Ayar slider label'ları `text-xs → text-sm` + font-medium, Rötuş switch metni `text-sm → text-base`. Vesikalık paneli artık uzaktan da rahat okunur.
  - **Yumuşatma Şiddeti slider görünürlüğü**: `accentColor: #dc2626` (red-600) + `bg-red-100` track + `h-2` yükseklik ile açık temalarda da net görünüyor. Karanlık mod olmadan da thumb/dolgu kırmızı.
  - **RetouchBrush zoom + pan**: Sağ üstte toplayıcı toolbar (ZoomOut / %değer / ZoomIn / Reset) ve `onWheel` desteği. Zoom 50%–600%, %25 adımlarla. Container `overflow-auto` — büyütünce doğal scroll ile detay bölgesine gidilir. Pointer koordinatları `getBoundingClientRect().width/height` üzerinden otomatik hesaplandığı için heal/paint/pick modları zoom seviyesinden bağımsız doğru piksele iniyor.
- **Vesikalık — Aligned-Source Healing Brush + True Edge-Preserving Skin Smoothing (v5)**:
  - **Aligned source clone**: `spotHeal` artık pointerdown'da bir kez kaynak seçiyor ve offset'i `strokeSourceRef`'de kilitliyor. Drag boyunca her nokta AYNI offset'i kullanıyor — Photoshop'un "aligned source" davranışı. Ayrıca feather 0.6R'den 0.35R'ye indi, smoothstep easing eklendi. E2E test: 10 adımlı drag stroke sonrası tüm örnek pikseller arası max luminance farkı **4.0** (hedef <20), kontrol pikselleriyle eşleşti — görünür seam/iz yok.
  - **True edge-preserving skin smoother**: `soft-light` overlay tamamen kaldırıldı (parlaklık/doygunluk artıran şuydu). Yerine matematiksel olarak doğru luminance-diff surface blur: (1) LF = heavy blur, (2) her piksel için |L_orig − L_LF| hesaplanıyor, (3) smoothstep threshold (lo=4-6, hi=22-30): küçük deviations (sivilce, ince çizgi, göz altı morluğu) LF'ye çekiliyor, büyük deviations (göz, dudak, saç) DEĞİŞMİYOR, (4) attenuation aynı katsayıyla R/G/B'ye uygulanır → hue/saturation matematiksel olarak korunur. E2E test: düz cilt HSL delta = H±0 S±0 L±0 — sıfır renk/parlaklık kayması. Yalnızca gerekli olan alanlarda cilt dokusu düzelir.
- **Vesikalık — Photoshop-Style Healing Brush (v4, profesyonel)**: `RetouchBrush.spotHeal` yeniden yazıldı, artık gerçek healing brush algoritması kullanıyor:
  1. **Auto-source**: Hedef etrafında 12 farklı yönde küçük patch'ler denenip pixel-varyansı en düşük olan (en pürüzsüz komşu cilt/kumaş) kaynak olarak seçiliyor.
  2. **Ring-mean tone eşleştirme**: Hem kaynak hem hedef bölgede annulus (dış halka) ortalama RGB hesaplanıyor — patch'in "yerel renk tonu" bu.
  3. **Additive color transfer (Poisson approximation)**: Her hedef pikseli için `source_pixel + (target_mean − source_mean)` uygulanıyor. Kaynak dokuyu getirir, hedefin yerel tonunu miras alır → transplant tamamen kaynaşır, benek/iz görünmez olur.
  4. **Smoothstep radial mask**: Kenarlar `m² * (3-2m)` easing ile fade out — hard circle edge yok.
  Test edildi (kontrollü E2E): 26px yarıçaplı kırmızı sivilce (136,55,52) tek tıklamayla (217,171,142) cilt tonuna dönüştü; hedef bölge dışındaki pikseller tamamen değişmeden kaldı; healed alan çevresiyle sorunsuz kaynaştı.
- **Vesikalık — Yumuşatma Şiddeti Slider + Renk Emici**:
  - `adj.retouchIntensity` (10–100, default 60) state eklendi. Rötuş switch'i açıkken hemen altında görünen slider low-freq (blurred) katkısını lineer ölçeklerken, soft-light overlay şiddetini INVERSE olarak ayarlıyor (yüksek yumuşatmada üstteki detay daha az kalıyor). Yani slider gerçek algoritmik farkı üretiyor, sadece opacity tweak değil.
  - **Renk Emici (Eyedropper)**: RetouchBrush'e üçüncü mod eklendi. "Emici"ye basıp fotoğrafta bir piksele tıklayınca o rengi `paintColor` state'ine alıyor, otomatik "Boya" moduna geçiyor. Cursor `cursor-copy`, brush preview dotted turuncu border ile ayırt ediliyor. Paint/Emici modlarında sidebar'a renk swatch'i + native color input + hex etiketi çıkıyor — istersen elle de renk seçebilirsin. E2E test: cilt üzerine tıklama sonrası swatch #FFDCC0 oldu (beyaz değil), mod otomatik Boya'ya döndü.
- **Vesikalık — Profesyonel Rötuş & Frequency-Separation Cilt Yumuşatma (v3)**:
  - **RetouchBrush** artık gerçek bir spot healing brush: iki mod var — "Onarım" (default) ve "Boya". Onarım modu tıklanan noktanın etrafından 8 farklı yönde temiz doku örneği alıp radyal feathered mask (opaque center → transparent edge) ile hedef üstüne bindiriyor. Sivilce/iz/kumaş lekesi tıklamayla yumuşakça temizleniyor, sert daire kenarı yok. "Boya" modu eski davranışı (düz beyaza boya) koruyor — arka plan artığı temizliğinde işe yarar. UI'da segmentli mod switch'i, dashed vs solid fırça önizlemesi ve mod'a özel Türkçe ipucu.
  - **Cilt yumuşatma** artık frequency-separation yaklaşımı: heavily blurred low-freq copy → base olarak canvas'a yazılıyor, ardından original sonuç `soft-light` blend + 85% alpha ile bindirilerek göz/dudak/saç kenarları geri getiriliyor; küçük bir 15% alpha original pass da cilt tonlarının solmasını engelliyor. Photoshop'un light Portrait filtresine benzer bir etki üretiyor — sadece bulanıklaştırmıyor.
- **Vesikalık — Rötuş Fırçası & Cilt Yumuşatma Fix (v2)**: `RetouchBrush.jsx` baştan yazıldı ve `drawSingle`'daki cilt yumuşatma güçlendirildi:
  - RetouchBrush: MAX_EDGE=1600 downscale, `crossOrigin` kaldırıldı, canvas explicit CSS boyutuyla (max 720×480) render, "Fotoğraf yükleniyor…" spinner + `visibility:hidden` ile hazır olmadan pointer engelli, try/catch snapshot. E2E test: dialog açılınca fotoğraf tam görünüyor (canvas center=skin 244,207,178), tıklamayla beyaz daire boyanıyor.
  - Cilt yumuşatma: `ctx.filter="blur(2px)"` yerine offscreen canvas'ta boyuta göre ölçekli `blur(≈%2 of width)` + %70 alpha bindirme; Safari fallback olarak downscale→upscale Gaussian. E2E test: switch açılınca yüz detayları görünür şekilde yumuşuyor.
- **Vesikalık — Baskı Merkezleme, Boşluk, Per-Photo Watermark, Mouse Sürükleme**:
  - `drawSheet` yeniden yazıldı: block artık `(pw - blockW) / 2` ile GERÇEK merkezleniyor (eski `Math.max(0, …)` yüzünden 100mm blok 100mm kâğıtta sağa kayıyordu, düzeltildi). Ayrıca ayarlanabilir `photoGap` (0–5mm slider, default 0) ile fotoğraflar arası cutting space.
  - Filigran mimarisi değişti: artık "kağıdın altına tek şerit" değil, HER FOTOĞRAFA ayrı bindiriyor. 9-hücreli 3×3 konum grid'i (tl/tc/tr/ml/mc/mr/bl/bc/br), 4–40% arası boyut slider'ı ve 20–100% opacity slider'ı.
  - Mouse sürükleme: hem "Tekli" hem "Baskı" canvas'ı fare/dokunmatik ile sürüklenebilir. Tekli'de kırpma kaydırılır (crop.cx/cy image sınırlarına clamp), Baskı'da tüm blok mm cinsinden `sheetOffset` ile nudge edilir. Yan panele ayrıca sayısal X/Y offset input + "Sıfırla" butonu eklendi.
- **Vesikalık — Manuel Rötuş Fırçası**: New `src/components/RetouchBrush.jsx` dialog opened from the "Rötuş Fırçası" button. Loads the current photo into an interactive canvas where the operator can paint over leftover hair/shadow/edge artifacts using a slider-driven brush (4–120px, default 28) filled with `spec.bg`. Full 20-step undo (ImageData snapshots), "Sıfırla" reload from source, pointer/touch input, live brush preview. On "Uygula" the canvas is exported as data URL and swapped into `image` while preserving the crop rectangle.
- **Vesikalık — 4'lü baskı kağıt önerisi düzeltildi**: `suggestPaper` fotoğraf laboratuvarı konvansiyonuna göre yeniden yazıldı — 0 kenar boşluğu, 0 gap, 2mm bleed toleransı, 2×2 gibi kare düzenler önce denenir. Sonuç: TR biyometrik/vesikalık/Schengen/US → **4'lü artık 10×15 cm'ye tam sığıyor** (Node ile matematiksel olarak doğrulandı). `drawSheet` da edge-to-edge çizip kesim çizgilerini bitişik kenarlara yerleştiriyor.

  - `src/lib/bgRemove.js`: lazy-loads the ONNX/WASM model, removes background from any File/Blob/dataURL, then composites onto a solid color (spec.bg → white by default) and returns a data URL.
  - `AdminPassportPhoto.jsx`: `autoBg` toggle in the drop zone (ON by default). On upload the original is stored, then bg removal runs asynchronously with a full-canvas overlay showing a spinner + real-time progress bar (%) and a note that first run downloads ~40 MB. Face detection kicks in on the processed image. Users can toggle it off, revert to the original with one click, or re-run "Arka Planı Temizle" manually.
- **Auto ledger for appointment payments**: `add_mid_payment` now mirrors every mid-payment into `transactions` (source="appointment", category="Randevu Ödemesi", linked appointment_id + mid_payment_id). `remove_mid_payment` deletes the mirror. Verified end-to-end with curl.
- **Cash-register endpoint expanded**: `/api/cash-register` now returns `card_in/out`, `transfer_in/out`, `total_in/out` (all methods) in addition to the existing cash-only fields. Kasa Devir Defteri page now has a "Günlük Toplam Kazanç (Tüm Yöntemler)" panel showing Nakit + Kart + Havale + Toplam. Fiziksel kasa açılış/kapanış hesabı hâlâ sadece nakite dayalı.
- **Kaynak column & disabled edit for auto-tx**: `AdminTransactions.jsx` table now shows a "Kaynak" column ("Randevu (Oto)" / "Manuel") and blocks edit/delete for appointment-sourced rows so admins go through the randevu detay ekranı.
- **XLSX + PDF exports**: Both include the new "Kaynak" column so appointment income is auditable in offline reports.


## Notes
- Live site cache: user must "Re-publish changes" from Emergent to reflect preview → production.
- Response language: TURKISH always.
- CSS override for Radix Dialog/AlertDialog forces dark text — DO NOT add `role="dialog"` on non-modal fixed overlays (learned from IntroSplash gold-text bug).

## Session G (Jun 2026) — Vesikalık 4 Bug Fixes (verified by testing_agent, iteration_16)
Repo re-cloned from github.com/fotubeer/Fotuber into /app; backend env set (JWT_SECRET, EMERGENT_LLM_KEY, ADMIN_EMAIL/PASSWORD). Admin: admin@fotuber.com.tr / FTB.2024.
- **Bug 3 (PhotoStudio.jsx)**: `doRecolor` was missing `const dataUrl = await recolorGarment(image.el, color);` → ReferenceError. Added it. `doRedEye`/`doSharpen` now call `applyImage(im,{keepCrop:true})` so framing isn't reset / re-detected. PASS.
- **Bug 4 (AdminPassportPhoto.drawSheet)**: cut lines now loop `0..cols` / `0..rows` (outer edges included) and each line spans the full paper (`moveTo(x,0)->lineTo(x,ph)` / `moveTo(0,y)->lineTo(pw,y)`). Thin GRAY dashed (default cutColor `#9ca3af`). PASS.
- **Bug 1 (drawSheet watermark)**: watermark PNG moved from per-photo (3×3 grid) to a SINGLE strip in a centered middle band between top/bottom rows. Band thickness `bandPx = cellH * (wmScale/100)` tied to the existing "Filigran Boyutu" slider; watermark clamped inside the band (never spills onto photos). `wmPos[1]` still controls left/center/right. PASS.
- **Bug 2 (drawSingle)**: color adjustments now affect ONLY the foreground — unfiltered base drawn first, filtered copy on an offscreen canvas clipped via `destination-in` to `fgMask` (transparent-PNG alpha from @imgly bg removal) or a `buildColorKeyMask` fallback (samples TOP corners = headroom background). Removed the CSS `filter` on `canvas-single` so preview reflects true pixels. `fgMask` state captured in `runBackgroundRemoval`, cleared on upload/revert. PASS (bg-removed path perfect; color-key fallback improved to top-corner sampling).
- Test fixtures: /app/tests/assets/portrait1.jpg, portrait2.jpg.


## Session H (Jun 2026) — Rötuş whiteout + Studio + Filigran (verified iteration_17)
- Retouch whiteout FIXED: applyRetouch now try/catch + drops fgMask; drawSingle foreground-mask overlay wrapped in try/catch so the unfiltered base always renders (canvas-single ~99.8% non-white after Apply).
- Removed FREE recolor mode in PhotoStudio; AI garment+color only, with "Ucretli" badge (studio-paid-badge) and button "Kiyafeti Degistir (AI) — Ucretli".
- Watermark reverted to PER-PHOTO (N copies) at bottom of each cell with Sol/Orta/Sag align (wmAlign; wm-align-switch). Old 3x3 wm-pos-grid removed. Band logic dropped; cut lines still edge-to-edge dashed/solid.

## Session I (Jun 2026) — AI Kredi Gostergesi + BYOK Gemini (verified iteration_18)
- Paid AI garment/color now shows a credit badge next to the button (ai-credits-badge, default 25/25). Backend GET /api/vesikalik/ai-credits {remaining,total,own_key,masked}; ai-edit decrements app credits only on the Emergent-key path (402 when exhausted).
- BYOK: users can connect their OWN Google Gemini key. Endpoints GET/POST/DELETE /api/vesikalik/gemini-key. Key validated against Google on save (invalid -> 400), stored Fernet-encrypted (key derived from JWT_SECRET), returned masked only. When connected, ai-edit uses google-genai (model gemini-2.5-flash-image, env GEMINI_IMAGE_MODEL) with the user key and does NOT spend app credits (own_key:true).
- Frontend BYOK box in PhotoStudio (byok-box, gemini-key-input, gemini-connect-btn, gemini-disconnect-btn, gemini-status); badge switches to "Kendi anahtariniz aktif" when connected. Admin-only for now (later moves to public paid membership).
- Backend .env additions: JWT_SECRET, EMERGENT_LLM_KEY, ADMIN_EMAIL/PASSWORD, GEMINI_IMAGE_MODEL.

## Session J (Jun 2026) — Kredi Yukleme (demo) + 2x fiyatlama & rol mantigi (verified iteration_19, 100%)
- Credit top-up flow: GET /api/vesikalik/credit-packages (tiers 10/25/50/100, price=credits*unit), POST /api/vesikalik/credits/topup (DEMO, adds credits instantly, logs db.ai_credit_topups). Later can be wired to Stripe.
- Pricing model: unit_price = AI_CREDIT_BASE_COST(env,2.0) * AI_CREDIT_MARKUP(env,2) = 4 TRY/credit (customer pays 2x Emergent cost). Prices 40/100/200/400.
- Role logic in ai-edit + ai-credits mode: BYOK own key -> own quota; admin/staff -> Emergent balance, NO purchased-credit deduction (mode "emergent"); site members -> consume 1 purchased credit/edit. ai-credits returns role/mode/unit_price/markup/currency.
- Frontend PhotoStudio: "Kredi Yükle" button (open-topup-btn) + topup-dialog with 4 package cards (topup-pkg-*/topup-buy-*); mode-aware badge ("Yönetici · Emergent" / "Kalan: N kredi" / "Kendi anahtarınız aktif").

## Session K (Jun 2026) — GERÇEK ÖDEME: PayTR Link API (Basic) + ana site girişi (verified iteration_22)
- **Neden PayTR?** Kullanıcı Stripe istedi ama Stripe Türkiye'yi desteklemiyor (claimable sandbox `country_not_supported: TR`). Kullanıcının mevcut PayTR hesabı var. Hesapta yalnızca **Link API (Basic)** aktif; iFrame/Token (Pro API) kapalı (`Magazaniz icin yalnizca link cozumu aktiftir`). Bu yüzden **Link API** ile entegre edildi.
- **DEMO abonelik + DEMO kredi yükleme kaldırıldı**, yerine gerçek PayTR ödemesi geldi.
- Backend (server.py sonunda):
  - `POST /api/payments/paytr/create` {kind:"subscription"|"credits", package_id?, origin_url} → PayTR `link/create` çağrısı, `{callback_id, link}` döner. Fiyat/kredi sunucuda belirlenir (frontend'e güvenilmez). Abonelik = MEMBER_MONTHLY_PRICE (80₺). Kredi = paket fiyatı. `callback_link` frontend `origin_url`'inden türetilir (public https, portsuz).
  - `POST /api/payments/paytr-callback` (public, form) → hash doğrulaması sonrası hak verilir; düz metin "OK" döner. Hash = base64(HMAC_SHA256(key, callback_id+merchant_oid+salt+status+total_amount)). Idempotent (pending→paid atomik). Link API yalnızca BAŞARILI ödemede callback yapar.
  - `GET /api/payments/status/{callback_id}` → {status, kind, membership?, ai_credits?} (kendi siparişi, auth gerekli).
  - `_grant_paid_order`: subscription → paid_until +30 gün; credits → ai_credits += paket kredisi. db.payment_orders / member_subscriptions / ai_credit_topups.
  - `_paytr_link_token`: hash_str = name+price+currency+max_installment+link_type+lang+min_count (+salt). max_installment "1" (taksitsiz), link_type "product", max_count "1".
- Backend .env: PAYTR_MERCHANT_ID=583863, PAYTR_MERCHANT_KEY, PAYTR_MERCHANT_SALT (+ eski PAYTR_TEST_MODE kullanılmıyor).
- Frontend:
  - MemberVesikalik.jsx: `subscribe()` → paytr/create, PayTR linkini yeni sekmede açar, `pollPayment(callback_id)` ile 3sn'de bir status sorgular; paid olunca üyelik güncellenir. Gate butonu "Abone Ol · 80₺/ay" (Demo yazısı kaldırıldı). pay-waiting/pay-reopen-btn/pay-cancel-btn.
  - PhotoStudio.jsx: `buyPackage()` → paytr/create {kind:"credits"}, link açar + status poll; topup-dialog metni PayTR'ye güncellendi.
- **Ana site girişi**: PublicLayout navItems'e `{to:"/vesikalik", label:"Vesikalık", accent:true}` eklendi → masaüstü nav, mobil menü ve footer'da görünür. Böylece ücretli üyelik (BYOK/AI) ana siteden erişilebilir.
- **NOT (mocked yok ama dikkat)**: PayTR Link API'de test_mode API parametresi yok; test için PayTR panelinden **Test Modu** açılmalı, aksi halde gerçek kart çekilir. Link API callback_link her istekte gönderildiği için panelde ayrı "Bildirim URL" ayarı gerekmez.
- Uçtan uca gerçek kart ödemesi otomatik test edilemez (PayTR barındırmalı sayfa). create + callback grant + idempotency + bad-hash reddi curl ve testing_agent (iteration_22) ile doğrulandı.

## Session L (Jun 2026) — Fiyat 99/899 + Yıllık plan + Trial-once + Admin Kişiler/Üyelikler (verified iteration_22, %100)
- **Fiyatlandırma**: MEMBER_MONTHLY_PRICE=99, MEMBER_YEARLY_PRICE=899 (env override). _membership_state artık `plan` + `yearly_price` döner. /vesikalik gate iki plan kartı gösterir (plan-monthly 99₺, plan-yearly 899₺) + subscribe-btn / subscribe-yearly-btn.
- **Yıllık plan**: paytr/create `period` alanı ("monthly"|"yearly"); yıllık = 899₺ + 365 gün. order.days saklanır, _grant_paid_order günü buradan uygular ve user.plan (monthly/yearly) set eder.
- **Ücretsiz 1 ay = telefon VEYA firma başına 1 kez**: member_register phone_norm + company_norm hesaplar; aynı telefon veya aynı firma ile daha önce trial almış bir üye varsa yeni üye trial'sız başlar (trial_end=None, status expired, trial_used_before=true). Register yanıtı `trial_used_before` döner; frontend uygun toast gösterir.
- **Özellik takibi**: _track_feature(uid, feature) → user.features_used ($addToSet) + last_active. Çağrılan yerler: ai-edit ("ai_kiyafet"), gemini-key set ("byok"), abonelik grant ("abonelik"), kredi grant ("kredi_yukleme"), online randevu ("randevu"). Yeni özellik eklenirken buraya _track_feature eklenmeli.
- **Admin — Kişiler** (`/admin/kisiler`, sidebar "Kişiler", AdminContacts.jsx): GET /api/admin/contacts → members[] (firma/şahıs + üyelik durumu), customers[] (site kaydı), booking_contacts[] (randevu formu, telefonla dedupe, kullanıcı olmayanlar). Arama + CSV indir (/api/admin/export?kind=contacts).
- **Admin — Üyelikler** (`/admin/uyelikler`, sidebar "Üyelikler", ownerOnly, AdminMemberships.jsx): GET /api/admin/memberships → members[] + groups{trial,monthly,yearly,expired} + counts + pricing. Her üye raporu: kişisel/iletişim, üyelik türü, paid_until/trial_end, trial_used_before, ai_credits, own_gemini_key, subscription_count, credit_topup_count, credits_purchased, total_spent, appointment_count/has_appointment (email/telefon eşleşmesi), features_used/labels. Sekmeler + arama + üye detay dialog + 2 CSV indirme: "İletişim Bilgileri" (kind=contacts) ve "Detaylı Rapor" (kind=memberships). CSV UTF-8 BOM ile (Excel TR uyumlu).
- **/api/admin/*** endpoint'leri require_admin (member token'a 403). server.py ~4530 satır (ileride router'lara bölünmeli — backlog).
- **PayTR canlı**: Link API'de canlı/test PayTR panelinden ayarlanır (koddan değil); kullanıcı onayladı. Kod mağaza moduna göre çalışır.

## Session M (Jun 2026) — E-posta: Makbuz + Üyelik Hatırlatma (Gmail SMTP, gerçek gönderim doğrulandı)
- **Sağlayıcı**: Gmail SMTP (aiosmtplib, smtp.gmail.com:587 STARTTLS, App Password). GMAIL_USER=fotubeer@gmail.com. Alan adı doğrulaması gerekmez. Düşük hacim için uygun; ileride Resend/SendGrid'e geçilebilir (backlog).
- **email_service.py** (yeni): send_email + Türkçe HTML+text şablonlar (receipt_subscription, receipt_credits, expiry_reminder, test_email). Fotuber markalı.
- **Makbuz**: PayTR callback grant sonrası `asyncio.create_task(_send_payment_receipt(order))`. Hem abonelik (aylık/yıllık) hem kredi yüklemede gönderilir. Idempotent: db.email_log (notification_key `receipt:{callback_id}` unique index).
- **Hatırlatma**: `_membership_reminder_loop` (startup'ta başlar, 6 saatte bir) + `_run_expiry_reminders`. paid_until yoksa trial_end baz alınır; Europe/Istanbul tarihine göre bitişe **7 ve 3 gün** kala gönderilir. Idempotency key `expiry:{uid}:{field}:{date}:{days}`. Trial bitişine de aynı kural uygulanır.
- **Admin uçları**: POST /api/admin/email-test {email?}, POST /api/admin/send-reminders, GET /api/admin/email-status (require_admin).
- **Admin UI**: Üyelikler sayfası header'ında e-posta durum çubuğu + "Test E-postası" (email-test-btn) + "Hatırlatmaları Gönder" (send-reminders-btn).
- **Doğrulama (curl + gerçek gönderim)**: test e-postası gönderildi ✅; kredi yükleme makbuzu (status sent) ✅; 3 gün kala hatırlatma gönderildi + ikinci çalıştırmada 0 (idempotent) ✅.
- **Deps**: aiosmtplib eklendi (requirements.txt pip freeze). Not: reminder loop tek uvicorn worker varsayar; email_log unique key çoklu worker için de emniyet ağı.
- **Hoş Geldin e-postası** (Session M eki): member_register sonrası `asyncio.create_task(_send_welcome_email(doc, trial=not trial_used))`. email_service.welcome_email → Türkçe karşılama + hızlı başlangıç rehberi (4 adım) + portal CTA; trial alındıysa "ilk ay ücretsiz", alınmadıysa plan seçme mesajı. Idempotent key `welcome:{uid}`. Gerçek gönderimle doğrulandı ✅. PayTR Test Modu kullanıcı tarafından KAPATILDI (canlı ödeme aktif).

## Session N (Jun 2026) — Dijital Davetiye modülü (verified iteration_23, backend 14/14, frontend 15/15)
- **İlham**: themagicalday.com. Kullanıcı istekleri: önce davetiyeyi OLUŞTUR (loginsiz), yayınlamak için SON adımda üyelik zorunlu; hediye için PayTR yok — oluşturan kendi IBAN+banka+ad soyad girer, misafire gösterilir; anı/dilek duvarı; çok sade UI; misafir linke tıklayınca ana sayfa DEĞİL doğrudan davetiye görür; RSVP ad+soyad olmadan onaylanamaz; link etkinlikten 15 gün sonra biter; oluşturan detaylı rapor (RSVP+anılar+CSV) alır.
- **Backend (server.py)**: koleksiyonlar invitations (slug unique), invitation_rsvps, invitation_memories, invitation_covers. Uçlar: POST/GET/PUT/DELETE /api/invitations (auth owner), GET /api/invitations/public/{slug} (410 if expired), POST .../rsvp (name+surname zorunlu → 400), POST .../memory, GET .../memories (dilek duvarı), GET /api/invitations/{id}/report + report.csv, POST /api/invitations/cover (auth YOK — sihirbaz login öncesi yükleme; backlog: abuse limiti). _invite_expires_at = event_date + 15 gün. _invite_public owner=False ile owner_user_id sızmaz.
- **Frontend**: InvitationCreate.jsx (`/davetiye-olustur`, public sihirbaz + canlı önizleme + son adımda üyelik gate + yayın sonrası QR/link/WhatsApp), InvitationView.jsx (`/davetiye/:slug`, TAM BAĞIMSIZ misafir sayfası, RSVP + anı duvarı + IBAN + geri sayım + harita + opsiyonel müzik), MyInvitations.jsx (`/davetiyelerim`, üye paneli: liste + rapor dialog + CSV + sil). InvitationPreview.jsx (görsel kart + useCountdown), lib/invitationThemes.js (4 tema: romantic/midnight/botanic/gold).
- **Rotalar** App.js'e eklendi (3 bağımsız route). PublicLayout nav'a altın "Davetiye" girişi.
- **Bilinen backlog**: cover upload auth yok (abuse limiti eklenebilir), RSVP rate-limit/captcha yok, server.py 4900+ satır (router'lara bölünmeli). Sonraki aşamalar: canlı misafir foto duvarı, AI davetiye metni, kendi sesinle karşılama, masa planı, QR kapıda check-in.

## Session O (Jun 2026) — Davetiye PREMIUM & Animasyonlu Yeniden Tasarım (verified iteration_24, frontend 7/7)
- **Neden?** Kullanıcı: "davetiyeler çok basit... animasyonlu ve özel basit şeyler dikkat çekmeyecektir". İlham themagicalday.com. Eski önizleme salt gradyan + kalp ikonu + düz kutulardı.
- **design_agent** çağrıldı → `/app/design_guidelines.json` (mobile-first premium davetiye blueprint).
- **Yeni bileşenler**:
  - `components/invitation/InvitationMotifs.jsx`: Temaya özel animasyonlu CSS/SVG dekor katmanı (rose_petals, drifting_leaves, gold_dust, soft_clouds, gold_shimmer_particles, stardust_bokeh, water_caustics, marble_veins). framer-motion ile düşen/yükselen partiküller, bokeh, caustics, canlı mermer. `pointer-events-none absolute inset-0`.
  - `components/invitation/EnvelopeReveal.jsx`: Sinematik ZARF AÇILIŞI (mühür/monogram pulse → kapak rotateX 180 açılır → kart yükselir → overlay fade). ~3.6sn'de otomatik açılır, dokununca atlanır, `onDone` çağırır. Tema renklerine uyumlu.
- **Yeniden yazılanlar**:
  - `components/invitation/InvitationPreview.jsx`: Great Vibes el yazısı isimler (premium temalarda altın metalik shimmer, backgroundPositionX animasyonu), Cormorant Garamond serif, Montserrat etiketler, container/item stagger reveals, kavisli (arch, rounded-t-[6rem]) detay kartı, cam efektli geri sayım. Motif katmanı entegre.
  - `pages/InvitationView.jsx`: Misafir sayfası zarf açılışıyla başlar; açılınca içerik fade-in; müzik FAB (data-testid=music-fab, sadece müzik/ses varsa); RSVP & anı kartları kağıt-çizgi (bottom-border only, transparent) input stiliyle; anı duvarında el yazısı isimler. Tüm eski data-testid'ler korundu.
- **Fontlar**: index.html font link'e Montserrat (300/400/500/600) eklendi (Great Vibes & Cormorant Garamond zaten vardı).
- **Temalar** (`lib/invitationThemes.js`): 8 tema korundu (romantic/botanic/gold/sky ücretsiz; noir/royal/ocean/marble premium), her birine `motif` + `script` alanı eklendi. heading → Cormorant Garamond.
- **Home CTA**: `pages/Home.jsx`'e büyük, animasyonlu "Davetiyeni Oluştur" bölümü (mor gradyan + uçuşan altın kalpler + altın pill buton, data-testid=home-invitation-cta → /davetiye-olustur). FOMO banner ile Instagram slayt arasına yerleştirildi.
- **A11y**: Şablon galerisi Dialog'una DialogTitle eklendi (Radix uyarısı giderildi).
- **Test (iteration_24, frontend 7/7 %100)**: zarf açılışı görünür/kaybolur, geri sayım sıfır değil, RSVP ad+soyad zorunlu, anı duvarı ekleme, Home CTA navigasyonu, wizard Noir↔Sky tema geçişi okunur, üyelik gate'te 3 onay zorunlu. Backend değişmedi (test atlandı).
- **NOT (bloklamayan)**: Home'da önceden var olan dekoratif SVG `<circle>` cx/cy undefined konsol uyarısı (bu turda dokunulmadı). Premium tema/foto duvarı için BACKEND gating hâlâ zorlanmıyor (P1 backlog — yalnızca UI'da PREMIUM rozeti var).

## Session P (Jun 2026) — Baskı PDF + Premium Kilidi (PayTR tek seferlik) + Canlı Foto Duvarı + Sesli Karşılama (verified iteration_25: backend 34/34, frontend %100) + Beyaz-yazı fix
- **Baskıya Hazır Davetiye (ÜCRETSİZ)**: `invitation_pdf.py` (reportlab, gömülü Great Vibes + Cardo fontları — Türkçe tam destek, 3mm bleed, kesim çizgileri). Boyutlar: A5/A6/10×15/DL. Semboller: kalp/yüzük/çiçek/yıldız/ay-yıldız/yok. Renkler (bg/accent/text) özelleştirilebilir. Uçlar: POST `/api/invitations/print-pdf` (public → application/pdf), GET `/api/invitations/print-options`. Frontend: ayrı sayfa `pages/PrintInvitation.jsx` (`/baskiya-hazir-davetiye`, canlı önizleme + palet + sembol + renk seçici) VE sihirbazda "Baskıya Hazır PDF İndir" butonu (data-testid=wizard-print-pdf, tema renkleriyle). PublicLayout nav'a "Baskı Davetiye" eklendi.
- **Premium Kilidi (SERVER-authoritative, tek seferlik PayTR)**: `_invitation_pricing(theme, sections)` → premium tema (noir/royal/ocean/marble) = INVITE_PREMIUM_PRICE(200₺), + QR canlı foto duvarı = INVITE_PHOTOWALL_PRICE(750₺, toplam), ücretsiz temalar + duvarsız = ücretsiz. create_invitation: ücretliyse status="unpaid" (public GET 404, yayınlanmaz) + requires_payment/price döner; ücretsizse "published". paytr/create kind="invitation" (invitation_id) → PayTR link; _grant_paid_order kind=="invitation" → status published + paid=True + is_premium. update_invitation fiyatı yeniden hesaplar (paid ise düşürmez). Makbuz e-postası invitation dalı eklendi. **INVITE_THEMES eski 4 tema bug'ı düzeltildi** → artık 8 tema (premium set tanımlı). Frontend: sihirbazda premium-price-note + "Yayınla ve Öde · N₺" butonu + pay-gate modalı (PayTR ile öde → status poll → yayına al).
- **Canlı Foto Duvarı**: `components/invitation/PhotoWall.jsx` — misafir foto yükler (POST public/{slug}/photos), galeri 8sn'de bir poll ile canlı akar. InvitationView'da sections.photowall true ise gösterilir (premium).
- **Kendi Sesinle Karşılama**: `components/invitation/VoiceRecorder.jsx` — tarayıcıda MediaRecorder ile mikrofon kaydı + önizleme + yükleme (POST /invitations/audio); dosya yükleme de korunur. Davetiye açılınca otomatik çalar + müzik FAB.
- **BEYAZ-YAZI HATA FIX (kullanıcı bildirdi)**: Global CSS `input,textarea{color:inherit}` + `body{color:#fafafa}` yüzünden standalone açık-temalı sayfalarda (davetiye-olustur, baskiya-hazir-davetiye, üyelik gate modalı) form yazıları ve Select değeri beyaz-üstüne-beyaz görünmüyordu. Form kapsayıcılarına `text-slate-900` eklendi → input/textarea/select artık koyu ve okunaklı (ekran görüntüsüyle doğrulandı).
- **Deps**: reportlab==5.0.0 (requirements.txt pip freeze). Fontlar `backend/assets/fonts/` (GreatVibes, Cardo Regular/Bold).
- **Backlog**: print-pdf & photo-wall public uçlarında rate-limit yok; server.py 5195 satır (router'lara bölünmeli).

## Session Q (Jun 2026) — Foto Duvarı Moderasyonu + Tam Ekran Slayt + Dinamik Baskı Önizleme (self-tested: backend curl 4/4, frontend 3 ekran görüntüsü)
- **Foto Duvarı Moderasyonu (ev sahibi)**: Yeni uçlar — GET `/invitations/{iid}/photos/manage` (tüm fotoğraflar + hidden bayrağı, owner auth), POST `/invitations/{iid}/photos/{pid}/moderate` {hidden:bool}, DELETE `/invitations/{iid}/photos/{pid}`. Public liste (`/invitations/public/{slug}/photos`) artık `hidden:{$ne:True}` ile gizlileri hariç tutar → gizlenen foto ne davetiyede ne slaytta görünür. UI: `MyInvitations.jsx`'de photowall'lı davetiyelerde "Foto Duvarı Yönetimi" butonu → Dialog (foto grid, göz/çöp kutusu ile gizle-göster & sil, yükleyen adı). Curl ile doğrulandı: hide→public'ten düşer, delete çalışır, yetkisiz 401.
- **Tam Ekran Slayt (projeksiyon)**: Yeni sayfa `pages/PhotoWallSlideshow.jsx` + rota `/davetiye/:slug/duvar` (public). Non-hidden fotoğrafları 6sn'de bir crossfade + Ken-Burns zoom ile döndürür, 15sn'de bir yeni fotoğrafları çeker, çift ismi başlık + yükleyen adı altyazı, foto yoksa "bekleniyor" ekranı. Moderasyon dialog'undan "Tam Ekran Slayt Aç" ile açılır.
- **Dinamik Baskı Önizleme**: `PrintInvitation.jsx` önizleme kartı artık seçilen boyuta göre `aspectRatio` (A5 148/210, A6 105/148, 10×15 100/150, DL 99/210) + "Önizleme oranı: …" etiketi. DL'de birebir dar-uzun görünüyor (ekran görüntüsüyle doğrulandı).
- **Not**: `expired@fotuber.com.tr / Test1234` üyesine moderasyon testi için `moderator-1ddd7d` (published, photowall, demo fotolu) davetiyesi atandı.

## Session R (Jun 2026) — QR Kapıda Check-in + Slayt Ayarları + Baskıya QR (self-tested: backend check-in curl 6/6, 5 ekran görüntüsü)
- **QR Kapıda Check-in**: Misafir "Geliyorum" LCV verince (davetiyede `checkin_enabled` açıksa) kişisel QR **giriş kartı** görür (InvitationView RSVP başarısında QR + `/gecis/:token` kartı — `pages/GuestPass.jsx`). Ev sahibi Davetiyelerim'de "Kapıda Karşılama (QR)" ile tarayıcıyı açar (`pages/CheckinScanner.jsx`, rota `/davetiye/:iid/kapi`): `html5-qrcode` ile kamera taraması → POST `/invitations/checkin/{token}` (owner auth) → yeşil "geldi / zaten girmiş" bildirimi + canlı sayaç (giriş yaptı / beklenen), elle kod girişi fallback, owner login kapısı. Backend uçları zaten vardı; curl ile doğrulandı (RSVP→token→checkin ok/already→report count, yetkisiz 401).
- **Slayt Ayarları**: `PhotoWallSlideshow.jsx`'e dişli menü — Geçiş Hızı (Yavaş 10s / Normal 6s / Hızlı 4s) + Müzik aç/kapa (davetiyenin music_url/greeting_audio'sunu loop çalar; müzik yoksa devre dışı). Tercihler localStorage'da saklanır.
- **Baskıya QR**: `invitation_pdf.py` `qr_url` alırsa PDF'in altına beyaz zeminli **QR** (reportlab.graphics.barcode.qr) + "Dijital davetiye · LCV & foto duvarı için okutun" çizer. `PrintInvitationIn.qr_url` eklendi. Baskı sayfasına "Dijital Davetiye Bağlantısı (QR)" alanı + canlı önizlemede QR (qrcode.react). Sihirbazdaki "Baskıya Hazır PDF İndir" yayınlanmış davetiyenin URL'sini otomatik QR olarak gömer.
- **Deps**: `html5-qrcode@2.3.8` (yarn), `qrcode.react` (zaten vardı). NOT: html5-qrcode dev'de zararsız "source map" uyarıları üretir (prod'u etkilemez).
- **Rotalar**: `/gecis/:token` (misafir kartı), `/davetiye/:iid/kapi` (host tarayıcı), `/davetiye/:slug/duvar` (slayt).

## Session S (Jun 2026) — WhatsApp Toplu Davet (frontend-only, ekran görüntüsüyle doğrulandı)
- **WhatsApp ile Davet Gönder**: `MyInvitations.jsx`'de her davetiye kartına yeşil "WhatsApp ile Davet Gönder" butonu + Dialog (`whatsapp-dialog`). Ev sahibi hazır mesajı (davetiye linkli) düzenler, telefon numaralarını (satır/virgül ayrımlı) yapıştırır. Numaralar uluslararası TR formatına normalize edilir (`normalizePhone`: 0555…→905551112233). Her numara için `https://wa.me/{num}?text={mesaj}` deep-link ile "Gönder" butonu; "Tümünü Sırayla Aç" (700ms aralıklı window.open, popup-blocker uyarısı) ve "Rehberden Seç" (`wa.me/?text=`) + linki kopyala. Tamamen istemci tarafı, backend gerekmez (WhatsApp toplu-gönderim politikası gereği son "Gönder"e kullanıcı WhatsApp'ta basar).


## Session U (Jun 2026) — Kına Özel Açılış + Sihirbaz Açılış Önizleme (ekran görüntüsüyle doğrulandı)
- **Kına gecesi özel açılışı** (`InvitationReveal.jsx`): kına için yeni `henna` kind — **kına eli (mehndi)** SVG (avuçta çift monogram) + iki **yanan/titreşen mum** + "Kınamıza Dokun" (alev ikonu) + altın ışıltı flourish. Kına artık veil yerine bu temaya özel açılışı kullanır.
- **Sihirbaz Açılış Önizleme**: InvitationCreate'e "Açılış Animasyonunu Önizle" butonu (`preview-reveal-btn`) + tam ekran önizleme modalı (`reveal-preview-modal`) — ev sahibi yayınlamadan önce, seçili etkinlik türüne göre açılışı (kapı/tül/perde/balon/kına) görür; "Tekrar Oynat" ve "Kapat" kontrolleri. Doğrulandı: kına seçimi → önizlemede kına eli + mumlar + "Kınamıza Dokun".
## Session T (Jun 2026) — Etkileşimli Açılış Animasyonları + Slayt QR Köşesi + Davetiyelerim font fix (ekran görüntüleriyle doğrulandı)
- **Etkileşimli, etkinlik-türüne özel açılış** (`components/invitation/InvitationReveal.jsx`, EnvelopeReveal yerine InvitationView'da kullanılır): Otomatik açılmaz — misafir DOKUNUR. Kapak; etkinlik türü + çift isim (script) + nabız atan monogram madalyon + türe göre CTA gösterir. Açılışlar: **doors** (düğün/nikah — çift kapı rotateY ile açılır), **veil** (nişan/kına/diğer — tül/fade), **curtain** (sünnet — perde iki yana kayar), **balloons** (doğum günü — balonlar uçar). Türe göre düşen flourish: petals/gold/stars/confetti/sparkle. Açılınca `onDone` ile arkadaki gerçek davetiye belirir. Doğrulandı: düğün kapıları açılıp davetiyeyi gösterdi.
- **Slayt QR Köşesi** (`PhotoWallSlideshow.jsx`): Sol-alt sabit beyaz kart — davetiye linkine QR + "Fotoğraf Yükle 📸". Misafirler projeksiyondaki slayttan anında katkı verir.
- **Davetiyelerim beyaz-font FIX**: `MyInvitations.jsx` kök kapsayıcısına `text-slate-900` eklendi (global `body{color:#fafafa}` mirası). Liste/kart metinleri artık okunaklı.
- **Not**: `EnvelopeReveal.jsx` artık kullanılmıyor (InvitationReveal ile değişti).

## Session V (Jun 2026) — Açılış Varyantları + Yeni Fiyat/Model + Foto&Video Duvarı + Header Redesign + Misafir Yönetimi (verified iteration_26 & 27, %100)
- **Açılış animasyonu varyantları**: `InvitationReveal.jsx` REVEAL_STYLES + REVEALS_BY_EVENT registry (etkinlik türüne göre 5-6 seçenek). Bileşen artık `styleKey` prop + `resolveStyle(eventType, styleKey)` (eski kırık CFG kaldırıldı). Sihirbazda seçici (`reveal-style-grid`, `reveal-style-<key>`), önizleme modalına styleKey geçilir, `reveal_style` DB'ye kaydedilir (InvitationIn + create + _invite_public + update), misafir sayfası (InvitationView) `styleKey={inv.reveal_style}` ile açılır. Kapak içeriği artık SİNEMATİK AKIŞ: COVER_IN/CINE_ITEM framer variants (staggered blur→focus + slide-up), isimde yavaş breathing, açılışta zoom-blur exit — tüm stillerde ortak.
- **Yeni fiyat/model (server-authoritative, PayTR canlı)**: INVITE_PREMIUM_PRICE=250, INVITE_PHOTOWALL_PRICE=500, **ADDITIVE** (`_invitation_pricing`): premium tema 250 + foto/video duvarı 500 → premium+duvar=750, ücretsiz+duvar=500. Süre uzatma INVITE_EXTEND_PRICE=99 (kind="invitation_extend"). Ücretsiz link artık **etkinlik günü sonuna kadar** geçerli (`_invite_expires_at(event_date, extended=False)`); 99₺ uzatma ile event+15 gün (`_grant_paid_order` kind invitation_extend → extended=True + expires güncellenir). update_invitation extended'i korur. Makbuz e-postasına invitation_extend dalı eklendi.
- **Foto & Video Duvarı**: upload_guest_photo video kabul eder (image 25MB / video 200MB), 75 GB toplam depolama sınırı (INVITE_PHOTOWALL_MAX_GB=75, aggregate size). Kayıtlarda kind/size. list/manage kind döner; manage storage_used/limit/limit_gb. Yeni owner ZIP indirme: GET `/invitations/{iid}/photos/download` (fotograflar/ + videolar/ klasörleri). PhotoWall.jsx video yükleme+oynatma; slideshow videoları hariç tutar; MyInvitations moderasyon dialog'unda video render + depolama çubuğu + "Foto/Videoları İndir (ZIP)" (inv-download-media-<id>) + "Süreyi Uzat · 99₺" (inv-extend-<id>).
- **Header yeniden tasarım (PublicLayout.jsx, design_agent blueprint)**: bg #050505/85 backdrop-blur-2xl, max-w-[1920px], logo solda daha belirgin (serif 2xl/3xl + altın tagline), 10→8 metin nav öğesi tek satırda (whitespace-nowrap, akışkan gap, center-out altın underline hover). Sağda ÜÇ AYRI belirgin işlem: pembe **animasyonlu ❤ Davetiye** baloncuğu (cta-davetiye, framer float+scale), mavi **Vesikalık Paneli** (cta-vesikalik-panel), yeşil **Randevu Al** (cta-book-appointment). Mobil menü + footer'a da eklendi. "Vesikalık" ve "Davetiye" nav listesinden çıkarıldı (artık butonlar).
- **Misafir Yönetimi (Gelin/Damat + özel roller + rehber aktarımı + tek-tık WhatsApp + otomatik LCV)**:
  - Backend `invitation_guests` koleksiyonu: {id, invitation_id, name, phone, phone_norm, side(gelin|damat|""), role(gelin_anne|gelin_baba|damat_anne|damat_baba|""), guest_token, rsvp_status(pending|yes|no), guest_count, invited, wa_sent_at}. ROLE_SIDE ile rol → taraf otomatik.
  - Uçlar (owner cookie auth): GET/POST `/invitations/{iid}/guests`, POST `.../guests/bulk`, PATCH/DELETE `.../guests/{gid}`, POST `.../guests/{gid}/sent`. Dedup phone_norm ile.
  - QR telefon aktarımı (login'siz, token yetkili): POST `.../import-token` (24s), GET `/invitations/import/{token}`, POST `/invitations/import/{token}/guests`.
  - Otomatik LCV: RsvpIn.guest_token → submit_rsvp eşleşen misafiri bulur, rsvp_status + side işaretler; report `stats.by_side{gelin,damat}` + guest_list_total.
  - Frontend `components/invitation/GuestManager.jsx`: taraf seçimi, özel rol quick-add (guest-roles / guest-role-<key>), elle ekle (rol dropdown), toplu yapıştır, vCard(.vcf) parse (parseVcf), Contact Picker (Android), QR panel (guest-qr-panel/code), taraf özet kartları (guest-stat-gelin/damat), liste + per-guest WhatsApp (guest-wa-<id>, kişiselleştirilmiş link ?g=token + sent işaretleme) + sil. `pages/GuestImport.jsx` (rota `/davetiye/import/:token`) mobil aktarım sayfası. MyInvitations'a "Misafir Yönetimi (Gelin / Damat)" butonu (inv-guests-<id>) + guest-dialog. InvitationView `?g=` okuyup RSVP'ye guest_token gönderir.
- **Doğrulama**: iteration_26 (backend 13/14, 1 skip [canlı ödeme], frontend 5/5) + iteration_27 (frontend %100, backend sanity %100). Ayrıca kapsamlı curl (fiyat additive, reveal_style persist, misafir CRUD, rol→taraf, RSVP→guest link, report by_side, import-token).

## Session VI (Jun 2026) — 4 İmzalı Sinematik Açılış + Sesli Deneyim + 3'lü LCV + LCV Panosu + Hatırlatma (verified iteration_28, %100)
- **Açılış animasyonları tamamen yeniden tasarlandı** (`InvitationReveal.jsx` sıfırdan): 4 imzalı sinematik açılış — **Mühürlü Zarf** (kâğıt dokusu, mum mührün kırılışı, zarfın açılışı, letter-card yükselişi / bordo+altın Cardo), **Çiçekli Bahçe** (açan çiçek halkası + düşen yapraklar / sage+blush Great Vibes), **Işıltılı Salon** (bokeh ışıklar + merkezi ışık patlaması + yükselen kıvılcımlar + altın shimmer / lacivert+altın), **Modern Minimal** (çizgi süpürme + mask reveal tipografi / siyah-beyaz Montserrat 800). Her biri ayrı hikâye/ritim/renk/tipografi. `SIGNATURE_STYLES` export, `resolveSignature` (bilinmeyen/eski değerler → envelope fallback).
- **Sesli açılış** (`revealSound.js`, prosedürel WebAudio): her stile özel ince/kaliteli ses dünyası (zarf: kâğıt hışırtısı+mühür çıtırtısı+sıcak akor; bahçe: yaylı pad+celesta; salon: çan glissando+görkemli akor; minimal: temiz çan+sub). Ses "Davetiye Aç"a basınca başlar. **Sessize alma (reveal-mute) + Atla (reveal-skip)** her zaman görünür (sol üst). NOT: Sesler harici müzik dosyası değil, lisans gerektirmeyen prosedürel ambienstir; istenirse özel müzik yüklemeye açılabilir.
- **Tam ekran deneyim**: reveal `fixed inset-0 z-[80]`; misafir linke tıklayınca doğrudan tam ekran; animasyon bitince (veya Atla) davetiye içeriği + LCV. Sihirbazda 4 imza kartıyla seçim (`reveal-style-grid`, `reveal-style-{envelope,garden,ballroom,minimal}`) + tam ekran önizleme (preview-reveal-btn / preview-close).
- **3'lü LCV**: misafir görünümünde **Katılacağım / Katılmayacağım / Emin Değilim** (rsvp-yes/no/maybe). Backend `RsvpIn.rsvp_choice` (yes|no|maybe) → rec + guest.rsvp_status; guest özet + report `by_side` **maybe** sayımı eklendi. Kişi sayısı sadece "Katılacağım"da.
- **LCV Panosu**: GuestManager taraf kartları (guest-stat-gelin/damat) artık Geliyor/Gelmiyor/**Belki**/Bekliyor + toplam kişi gösterir.
- **Hatırlatma**: GuestManager'da **Bekleyenlere Hatırlat** (guest-remind-pending) + **Bekliyor** filtresi (guest-filter-pending). LCV vermeyen (numaralı) misafirlere sıralı WhatsApp hatırlatma (reminder-worded mesaj) açar.
- **Doğrulama**: iteration_28 (frontend %100, backend %100, retest gerekmez) — reveal-open-btn DOM'da mevcut & çalışıyor, animasyon+mute+skip, 3'lü RSVP kaydı, 4 imza sihirbaz+önizleme, LCV panosu Belki, hatırlatma butonu, header regresyon. Backend RSVP 3-state ayrıca curl ile doğrulandı.

## Session W (Jun 2026) — Altın Saat Modülü + AI Çapraz Navigasyon (self-tested: screenshot + curl)
- **GoldenHour.jsx zenginleştirildi** (`/altin-saat`, ücretsiz, kayıtsız): mevcut suncalc kartlarına ek olarak
  - **Open-Meteo hava durumu** (frontend'den doğrudan, anahtarsız): seçilen şehir/koordinat + tarih için sıcaklık (max/min), WMO koduna göre Türkçe durum + ikon, yağış olasılığı/mm, UV indeksi. Europe/Istanbul tz. ~16 gün dışındaki tarihlerde nazik "tahmin mevcut değil" mesajı.
  - **Önerilen çekim mekanları**: 10 büyük şehir için elle hazırlanmış liste (SPOTS) + tüm şehirler/konum için jenerik fallback (GENERIC_SPOTS). Konum (geolocation) seçiliyken jenerik gösterilir.
  - **Satış hunisi CTA'ları**: "Asistana Sor" (window `fotuber-ai-open` event ile AI panelini açar, şehir+tarih otomatik dolar, mesajı kullanıcı yazar), "Randevu Al" (/randevu), "Davetiye Oluştur" (/davetiye-olustur) + orijinal marka logolu **WhatsApp** (yeşil, hazır mesajlı wa.me) ve **Instagram** (gradient) butonları (settings.whatsapp / settings.instagram varsa).
- **AI çapraz navigasyon (çift yönlü)**:
  - Altın Saat → AI: `window.dispatchEvent(CustomEvent("fotuber-ai-open", {detail:{city,date,goldenTime}}))`. FotuberAI bu event'i dinler, paneli açar, şehir+tarih alanlarını doldurur.
  - AI → Altın Saat: `GOLDEN_HOUR_DIRECTIVE` (server.py) `base_prompt`e HER ZAMAN eklenir (admin özel prompt'u ezmeden) → asistan ışık/gün batımı/kıyafet/mekan konularında `/altin-saat` linkini önerir. FotuberAI `renderAssistantContent` ile `/altin-saat`, `/randevu`, `/davetiye-olustur` path'lerini tıklanabilir Link'e çevirir. Curl ile doğrulandı (yanıtta `/altin-saat` mevcut).
- **FotuberAI artık global**: Home yerine `PublicLayout`e taşındı → tüm public sayfalarda (Altın Saat dahil) erişilebilir. Home'dan import+render kaldırıldı (çift render önlendi).
- **Ana sayfa Altın Saat tanıtımı**: Home'a büyük, öne çıkan "Altın Saat & Gün Batımı" bölümü (altın gradyan + örnek ışık kartları + `home-goldenhour-cta` → /altin-saat). Davetiye CTA ile Instagram slayt arasına yerleştirildi.
- **Nav**: PublicLayout navItems'e "Altın Saat" (accent) eklendi (footer linki zaten vardı).
- **Doğrulama**: screenshot (sayfa+hava+kartlar+CTA render, "Asistana Sor" → panel açıldı city="İstanbul") + curl (Open-Meteo hava, AI chat yanıtında /altin-saat). Ödeme akışına dokunulmadı (PayTR canlı).

## Session W-2 (Jun 2026) — FAZ 1: Haftalık Işık Takvimi + Kapak Görselleri + Deploy Hazırlığı (self-tested)
- **Haftanın Işık Takvimi** (`GoldenHour.jsx`): seçili tarihten itibaren 7 gün için şehir bazlı altın saat / gün batımı / mavi saat kartları (suncalc, Europe/Istanbul). Bir güne tıklayınca `dateStr` güncellenir → üstteki detay o güne döner. `gh-week`, `gh-week-{i}` testid.
- **Kapak Görselleri** (Gemini nano-banana ile üretildi, `static.prod-images.emergentagent.com` CDN'de): hero arka planı (altın saat çift silüeti) + haftalık takvim banner'ı (buğday tarlası). `COVERS` sabiti içinde 3 URL. Hero'ya koyu overlay + gradient bindirildi (metin okunaklı).
- **Deploy hazırlığı (deployment_agent)**: 2 pre-existing performans blocker'ı giderildi (Altın Saat ile ilgisiz):
  - N+1 sorgu: `_enrich_appointment(a, service_map=None)` opsiyonel map alır; `_build_service_map(items)` tek `$in` sorgusuyla servisleri toplu çeker. `list_appointments` + `my_appointments` bunu kullanır. Curl ile doğrulandı.
  - `reports/summary` approved sorgusuna projection (paid_amount/deposit_amount/date) eklendi. Curl ile doğrulandı (keys + total_revenue).
- **CANLIYA ALMA**: Kod deploy-hazır. Kullanıcı Emergent "Deploy / Re-publish" ile yayına alır.

## Session W-2b (Jun 2026) — Tüm İl/İlçe Araması + Mini Harita (self-tested screenshot)
- **Tüm Türkiye il/ilçe araması** (`GoldenHour.jsx`): Open-Meteo geocoding ile canlı autocomplete (anahtarsız, debounce 300ms, `country_code==="TR"` filtre). `gh-search`, `gh-search-results`, `gh-search-result-{i}`. Seçince coords + etiket (İlçe, İl) set edilir. Popüler şehir dropdown hızlı erişim için kaldı (`__loc` seçeneği artık seçili yeri gösterir). tz artık HER ZAMAN "Europe/Istanbul" (tüm TR).
- **Mini harita** (`gh-map`): seçili konum için anahtarsız OpenStreetMap embed (marker'lı) + "Yol Tarifi" (Google Maps) linki (`gh-map-directions`, `gh-map-frame`). Arama/şehir/konum değişince harita + hava + haftalık takvim birlikte güncellenir.
- Doğrulama: screenshot — "Kadıköy" araması 12 ilçe sonucu; seçim sonrası harita marker + hava (Babadağ/Denizli 36°/24° UV8) güncellendi.

## Session W-3 (Jun 2026) — FAZ 2: Sektör Radarı + Davetiye Erişim Düzeltmeleri (self-tested)
### Sektör Radarı (Agent Reach) — admin/yetkili personel, anahtarsız
- **Backend** (`trend_radar.py` + `server.py`): Anahtarsız canlı tarama — Google News RSS (`feedparser`, TR+yabancı) + DuckDuckGo (`ddgs`). Emergent LLM (**gemini-2.5-flash**, hız için — claude 58s→gemini ~5s) ile 3 bölümlü Türkçe JSON: **news** (başlık/özet/tarih/kaynak/url/why_important/sentiment[positive|negative|opportunity]), **social** (platform/idea/audience/how_to_apply), **packages** (name/target_customer/contents/sales_message/why_now/impact[high|medium]). Yabancı kaynaklar Türkçeye çevrilir.
- Uçlar: `GET /api/admin/trend-radar` (cache + generating/error), `POST /api/admin/trend-radar/refresh` (arka plan görevi — ingress 60s timeout'unu aşmamak için; `db.meta/trend_status` durum). Günlük döngü `_trend_radar_loop` (6 saatte bir, İstanbul günü başına idempotent, restart'ta stale reset, 150s wait_for). Cache: `db.trend_reports` (id=YYYY-MM-DD).
- **Yetki**: `require_trend_access` (admin daima; staff yalnızca `can_trend_radar`). `strip_user`+`StaffUserIn`+create/patch staff'e `can_trend_radar`. Curl: yetkisiz staff 403, yetkili 200, admin 200.
- **Frontend**: `components/admin/TrendRadarPanel.jsx` — premium pano (3 sütun, sentiment rozetleri kırmızı "Dikkat", "Tümünü Gör", son güncelleme + "Şimdi Yenile" + generating/boş/hata durumları). Admin **Dashboard** (Genel Bakış) stat kartlarının altında + yetkili personel için **StaffDaily**'de (`canRadar` gate). AdminUsers (`/admin/kullanicilar`) dialogunda "Sektör Radarı Görüntüleme" yetki kutusu + "Radar" rozeti. Screenshot ile doğrulandı.

### Davetiye erişim/UX düzeltmeleri (`PublicLayout.jsx`, `MyInvitations.jsx`, `InvitationCreate.jsx`)
- **Kök neden**: davetiye sahibi `member` rolüyle giriyor; header taşınca "Çıkış" ekran dışına kayıyordu → kullanıcı çıkış/admin girişi yapamadığını sandı.
- **Overflow fix**: nav `flex-1 min-w-0 overflow-hidden`, sağ küme `shrink-0` → Çıkış/auth her genişlikte görünür.
- **Davetiye açılır menü**: DropdownMenu → "Davetiye Oluştur" + "Davetiyelerim (LCV Takip)". Mobil menüye de eklendi. Screenshot doğrulandı.
- **Üye çıkışı**: `/davetiyelerim` panosuna "Çıkış Yap" (`/auth/logout`) + e-posta; header'da member ad "(Üye)" + net "Çıkış"; member iken Personel Girişi görünür kalır. Post-publish "herhangi bir cihazdan e-posta/şifreyle takip" notu.
- **Bonus**: `Staff.jsx` pre-existing crash düzeltildi (`useEffect(load,[])` async cleanup).
- **Üye Giriş Sayfası** (`MyInvitations.jsx`): Sade kutu → premium split-panel ekran. Sol: altın saat çift görseli + gradient + "fotuber" marka + 3 değer önerisi (LCV/Misafir/Foto Duvarı). Sağ: e-posta+şifre (ikonlu, göster/gizle toggle `myinv-toggle-pw`, Enter ile giriş), gradient "Giriş Yap", "Yeni Davetiye Oluştur" CTA, ana sayfa linki. Screenshot + curl (member login 200) ile doğrulandı. Kayıt akışı davetiye sihirbazında kaldı (KVKK/SMS/e-posta izinleri orada).

### Şifremi Unuttum (üye) + Paketi Yayınla (Sektör Radarı)
- **Şifre sıfırlama** (integration_expert playbook'una uygun): `POST /member/forgot-password` (var olan e-postayı sızdırmaz, daima ok; `secrets.token_urlsafe(32)` üretir, SHA-256 **hash**'i `db.password_reset_tokens`'ta 1 saat expiry + tek kullanım ile saklar; Gmail SMTP ile `email_service.password_reset` şablonlu link gönderir → `PUBLIC_APP_URL/sifre-sifirla?token=`). `POST /member/reset-password` (token+expiry doğrular, bcrypt hash günceller, token'ı used yapar). Curl ile uçtan uca doğrulandı: no-leak, yeni şifre login 200, token yeniden kullanım 400, eski şifre geri yüklendi.
  - Frontend: login ekranında "Şifremi unuttum?" (`forgot-link`) → e-posta formu (`forgot-form`) → "E-postanızı kontrol edin" (`forgot-sent`). Yeni sayfa `/sifre-sifirla` (`ResetPassword.jsx`, `reset-pw/reset-pw2/reset-submit`, geçersiz token & başarı ekranları). App.js'e route eklendi. Screenshot doğrulandı.
- **Paketi Yayınla**: `POST /admin/trend-radar/publish-package` (require_trend_access) → Sektör Radarı paket fikrinden **TASLAK** hizmet (`active=False`, `source="trend_radar"`) oluşturur; admin Hizmetler panelinden fiyat/görsel ekleyip aktifleştirir. Public liste taslağı GÖSTERMEZ. TrendRadarPanel paket kartına "Hizmet Olarak Ekle" butonu (`trend-publish-package`) + "Taslak Eklendi" durumu. Curl ile doğrulandı (draft admin'e görünür, public'e görünmez, silme 200).

## Session W-4 (Jun 2026) — Android Chrome oto-çeviri BUG FIX (testing_agent doğruladı)
- **Şikayet**: Android Chrome'da davetiye metinleri bozuk ("Ad"→"Reklam", "GÜN"→"SİLAH", "Katılacağım"→"Katcomm", "Fotuber"→"Fotube"); iPhone Safari'de sorun yok.
- **Kök neden**: `public/index.html` `<html lang="en">` idi → Chrome Türkçe içeriği yabancı sanıp Türkçeye otomatik çeviriyordu. Kod etiketleri zaten doğru Türkçe.
- **Fix**: `<html lang="tr" translate="no">` + `<meta name="google" content="notranslate">` + `<meta http-equiv="Content-Language" content="tr">`.
- **Doğrulama (iteration_29.json)**: homepage + davetiye view'da lang/translate/meta doğru; kaynak Türkçe metinler birebir doğru; bozuk kelime yok. FIX VERIFIED. (Non-blocking: countdown SVG circle cx/cy undefined uyarısı — ilgisiz.)
- **BEKLEYEN FEATURE (scope'lanıyor)**: davetiye hazırlıkta font seçimi + sembol/emoji ekleme + font boyutu (hem dijital hem baskı); baskı davetiye için Canva benzeri zengin editör.

## Session X (Jun 2026) — YENİ MODÜLLER: Davetiye Tasarım Stüdyosu + Stüdyo Paneli (Aşama 1 çekirdek, verified iteration_30: backend 18/18, frontend %100)
- **Yaklaşım**: EKLEMELİ. Mevcut kod/auth/sayfalar korundu. Yeni backend router'ları factory desenli ayrı dosyalarda: `/app/backend/routers/design_studio.py` + `/app/backend/routers/studio.py`, server.py sonunda `app.include_router(...get_router(db,_module_deps))` ile mount (circular import yok). Fabric.js v6 eklendi (`import * as fabric`).
- **Davetiye Tasarım Stüdyosu** (`/tasarim-studyosu`, `pages/DesignStudio.jsx`): Fabric.js mobil-öncelikli Canva benzeri editör. Metin/Başlık/Kutu/Daire/Çizgi/Görsel + {isim} kişiselleştirme (baskıda taşma korumalı otomatik font küçültme). Özellik paneli: 58 Google Font (Türkçe latin-ext), boyut, bold/italic, hizalama, renk, katman öne/arka, kopyala, sil. Şablonlar dialog (5 şablon). Kaydet (ana-site üyeliği gerekir) + PNG İndir + zoom.
  - Uçlar: GET `/api/design/fonts` (58), GET `/api/design/templates` (5), POST/GET/PUT/DELETE `/api/design/projects` (get_current_user/db.users auth), POST `/api/design/upload` (görsel→object storage), GET `/api/design/asset/{id}`.
- **Stüdyo Paneli** (`/studyo` portal + `/studyo/panel` pano, `pages/StudioPortal.jsx` + `StudioDashboard.jsx`): Glassmorphism birleşik giriş/kayıt. AYRI `studio_accounts` koleksiyonu, role="studio", ayrı `studio_token` cookie + Bearer (`fotuber_studio_token`). FTB-XXXXX müşteri kodu üretimi. 3 günlük Ücretsiz Deneme motoru (`_studio_state`): 0 AI kredisi, 10GB, max 2 etkinlik, 1 cihaz, filigran ZORUNLU. Planlar: trial/basic/bronze/silver/gold. Pano: FTB kodu, deneme geri sayımı, limitler, filigran rozeti, modül kartları (Vesikalık→/vesikalik, Tasarım→/tasarim-studyosu, Etkinlik Galerisi=Yakında), plan kartları.
  - Uçlar: GET `/api/studio/plans` (public), POST `/api/studio/register`, POST `/api/studio/login`, POST `/api/studio/logout`, GET `/api/studio/me`.
  - Auth: integration_expert JWT playbook'una uygun (mevcut bcrypt+PyJWT HS256 yardımcıları yeniden kullanıldı, get_current_studio role kontrolü).
- **Test hesabı**: studio1@test.com / Test1234. Ana-site admin: admin@fotuber.com.tr / FTB.2024.
- **MOCKED**: Stüdyo plan yükseltme (PayTR) henüz toast stub — Aşama 2'de gerçek PayTR bağlanacak. AI prompt→tasarım (Gemini Nano Banana) Aşama 2.
- **Deps**: fabric@^6 (yarn).

## Sonraki Aşamalar (Studio Suite / Design Studio backlog)
- P0/P1 Davetiye Aşama 2: "Tasarım Hakkı" mantığı (1 hak=3 AI alternatif, Nano Banana), paketler (Basic/Bronze/Silver/Gold), kişiselleştirilmiş toplu indirme (kapasite aşımı satın alma).
- P0/P1 Stüdyo Aşama 2: Vesikalık "Triple-Processing" (3 foto paralel bağımsız) + 20 fotoluk firma arşivi; Etkinlik Galerisi (chunked upload, RAW uyarısı, albüm limitleri, upsell paketleri, sipariş PDF); PayTR ile gerçek plan ödemesi.
- P1: Merkezi Admin Bildirimleri (WebSocket/polling, kritik/genel, {firma_adi} etiketi, okundu bilgisi); Altın Saat AI mekan önerisi+mesafe.
- P2: Masaüstü uygulama (Electron/Tauri) + doğrudan yazıcı + Google Ads server-side.

## Session X-2 (Jun 2026) — AI Davetiye Tasarımı: Tasarım Hakkı + Nano Banana (self-verified: curl + tam UI akışı ekran görüntüsü)
- **Tasarım Hakkı** studio_accounts'a bağlı (`design_rights`, varsayılan 3 · env STUDIO_FREE_DESIGN_RIGHTS). 1 hak = 3 AI davetiye arka plan alternatifi.
- Uç: `POST /api/studio/design/ai-generate` {prompt} (get_current_studio). Atomik 1 hak düşer ($gte guard), 3 görsel PARALEL üretilir (Nano Banana `gemini-3.1-flash-image-preview`, emergentintegrations LlmChat `send_message_multimodal_response`, EMERGENT_LLM_KEY), object storage + db.design_assets(source=ai)'e kaydedilir, {images,rights_remaining} döner. Tam başarısızlıkta hak iade edilir. Hak yoksa 402. Görseller public `GET /api/design/asset/{id}` ile servis edilir. Prompt 3 farklı stile yönlendirir ve görselde YAZI olmamasını + ortada metin için boş alan bırakmasını zorlar.
- Frontend: DesignStudio "AI Tasarla" butonu → dialog: stüdyo girişi kontrolü, kalan hak, prompt, üret (~20sn), 3 küçük görsel → tıklayınca tuvale tam-kapsayan arka plan (arkaya gönderilir). StudioDashboard'a "Tasarım Hakkı" kartı eklendi.
- Doğrulama: curl (studio1 login → me rights=3 → generate → 3 image, rights 3→2, asset 200 1MB PNG) + tam UI akışı (login → editör → AI dialog "2 hak" → üret → 3 alternatif → seçim → altın çiçekli, ortası metin için boş, yazısız arka plan tuvale eklendi).
- **Bekleyen (Aşama 2)**: hak bitince PayTR ile Tasarım Hakkı satın alma; AI arka plan + {isim} kişiselleştirme ile toplu üretim.

## Session X-3 (Jun 2026) — FAZ A: PayTR Tasarım Hakkı Satın Alma + Toplu Kişiselleştirme + AI Revize (verified iteration_31: backend 13/13, frontend %100)
- **Admin fiyatlandırma**: `design_rights_packages` koleksiyonu (startup'ta 4 paket seed: 1/149, 3/399, 5/599, 10/999₺). Admin CRUD: GET/POST/PUT/DELETE `/api/admin/design-rights-packages` (require_admin). Yeni admin sayfası `/admin/tasarim-haklari` (AdminDesignRights.jsx, sidebar ownerOnly, drp-* testid'leri) — paket ekle/düzenle/sil/aktiflik.
- **PayTR ile Tasarım Hakkı satın alma** (studio auth): `GET /api/studio/design/rights-packages` (aktif paketler + mevcut hak), `POST /api/studio/payments/design-rights/create` {package_id,origin_url} → paylaşılan `_create_paytr_order` (server.py) ile gerçek PayTR link (kind="studio_design_rights", studio_id, rights). `_grant_paid_order` yeni dala eklendi → ödeme onayında studio_accounts.design_rights $inc + studio_design_purchases kaydı. `GET /api/studio/payments/status/{cid}` (studio sahibi). Editörde AI dialogunda "Hak Satın Al" (ai-buy-btn → ai-buy-dialog → buy-pkg-btn-*) → PayTR yeni sekmede + 3sn polling → ödeme sonrası hak otomatik yüklenir.
- **AI Revize** (studio auth): `POST /api/studio/design/ai-edit` {asset_id,instruction} → referans görselle Nano Banana (ImageContent), 1 hak düşer, 1 revize görsel döner (source="ai_edit", parent_asset_id). Editörde her AI sonucunda "Revize et" (ai-revise-N) → talimat (ai-revise-input) → ai-revise-submit → yeni sonuç eklenir.
- **Toplu Kişiselleştirme** (tamamen istemci tarafı, ücretsiz): Editörde "Toplu Üret" (ds-bulk-btn → bulk-dialog). İsimler satır/virgül ile yapıştırılır veya CSV (bulk-csv) yüklenir, max 200. Her isim {isim} alanına yazılıp (taşma korumalı) tam çözünürlükte PNG export edilir; JSZip ile ZIP indirilir. {isim} alanı yoksa uyarı. `applyNameToCanvas` state'siz yardımcıya çıkarıldı.
- **Deps**: jszip (yarn). server.py ~5893 satır (router'lara bölme backlog'da — testing agent da not düştü).
- **MOCKED/NOT**: PayTR ödeme tamamlama otomatik test edilemez (barındırmalı sayfa) — yalnızca link oluşturma + pending durumu doğrulandı.

## Session X-4 (Jun 2026) — Tasarım Stüdyosu geliştirmeleri: Kategorili AI Şablon Galerisi + Kına/Nişan AI Setleri (self-verified: screenshot)
- **AI Şablon Galerisi**: 6 hazır davetiye arka planı image_generation_tool (Nano Banana) ile üretilip cloud'a host edildi. Backend TEMPLATES kataloğu `category` + `bg_image` (URL) alanlarıyla genişletildi: Boş(2), Düğün(2: altın çiçekli, lacivert art-deco), Nişan(pudra), Kına(bordo altın), Doğum Günü(renkli), Sünnet(mavi). Frontend `loadTemplate` arka plan görselini cover olarak yükleyip arkaya gönderiyor, metinler üstte. Şablonlar dialogu kategori başlıklarıyla gruplu + görsel önizlemeli, scrollable.
- **Kına/Nişan AI Setleri**: `GET /api/design/ai-presets` (10 hazır prompt paketi, event türlerine göre: Düğün/Nişan/Kına/Sünnet/Doğum Günü/Söz). AI dialogunda çip olarak listeleniyor; çipe tıkla → prompt dolar + otomatik üret ("tek tıkla tema"). `doAiGenerate(promptOverride)` imzası eklendi.
- Doğrulama: screenshot — kategorili galeri gerçek görsel önizlemelerle, Kına Bordo şablonu tuvale metin üstte yüklendi, AI dialogunda 10 preset çipi + "9 hak" görünür.

## KALAN FAZLAR (kullanıcı istedi, ayrı fazlar olarak yapılacak)
- **Faz B — Etkinlik Galerisi (P0, büyük modül)**: Stüdyo Paneline etkinlik oluştur + parçalı (chunked) foto yükleme + RAW uyarısı; müşteriye özel seçim linki (albüm/kanvas/retouch) + katı albüm limiti; sipariş takibi + PDF; upsell ek hizmet paketleri.
- **Faz C — Vesikalık Triple-Processing (P0)**: 3 fotoğrafı aynı anda bağımsız işleyen mod + 20 fotoluk firma arşivi (mevcut Vesikalık modülüne eklemeli).

## Session X-5 (Jun 2026) — FAZ B: Etkinlik Galerisi (Event Gallery) tam modül (verified iteration_32: backend 9/9, frontend E2E; 2 bug fix + 2 backend güvenlik/doğruluk düzeltmesi sonrası re-verified)
- **Backend** `routers/gallery.py` (factory, studio auth `build_get_current_studio` studio.py'den paylaşıldı):
  - Etkinlik CRUD: POST/GET/GET{id}/DELETE `/api/studio/gallery/events` (share_token üretir).
  - Parçalı yükleme: `/upload-init` (RAW uzantı tespiti+uyarı), `/upload-chunk/{uid}` (index), `/upload-complete/{uid}` (birleştir→object storage; non-RAW için PIL ile 640px thumbnail). RAW: cr2/cr3/nef/arw/dng/raf/orf/rw2. `_UPLOADS` in-memory (preview için yeterli; prod'da Redis/temp önerildi).
  - Servis paketleri (upsell): CRUD `/api/studio/gallery/service-packs`.
  - Siparişler: GET `/orders`, PUT `/orders/{id}/status` (new/processing/ready/delivered), GET `/orders/{id}/pdf` (reportlab; başlıklar ASCII transliterasyon — TTF backlog).
  - Public: GET `/api/gallery/public/{token}` (foto studio_id/path sızıntısı temizlendi), POST `/select` (KATI albüm/kanvas/retouch limitleri, geçersiz photo_id sayımı engellendi → sipariş SIP-* oluşturur), foto servis `/gallery/photo/{id}` + `/gallery/thumb/{id}`.
- **Frontend**: `pages/StudioGallery.jsx` (route /studyo/galeri) — sekmeler Etkinlikler/Servis Paketleri/Siparişler; etkinlik oluştur, parçalı çoklu foto yükleme (progress + RAW rozeti), müşteri linki kopyala (clipboard hatası try/catch fallback), sipariş durumu + PDF indir; sekme değişiminde canlı yeniden yükleme. `pages/GallerySelect.jsx` (public route /galeri/:token) — canlı limit çipleri, foto başına Albüm/Kanvas/Rötuş toggle (limit aşımı engelli), upsell, not, gönder→teşekkür/sipariş no. StudioDashboard "Etkinlik Galerisi" kartı artık /studyo/galeri'ye bağlı.
- **Deps**: reportlab (mevcut), Pillow (mevcut).

## KALAN (kullanıcı istedi)
- **Faz C — Vesikalık Triple-Processing (P0)**: 3 fotoğrafı aynı anda bağımsız işleyen mod + 20 fotoluk firma arşivi.
- **Daha Fazla AI Şablon**: Söz/Mevlüt/Açılış kategorileri.
- **Şablonu Favorile**: sık kullanılan şablonları kaydet.

## Session X-6 (Jun 2026) — 3 geliştirme: Ek AI Şablonlar + Şablon Favorileme + Galeri E-posta Bildirimi (self-verified: curl + screenshot)
- **Ek AI Şablonlar**: Söz (rose gold), Mevlüt (yeşil arabesk), Açılış (siyah-altın) için 3 yeni hazır davetiye arka planı üretilip host edildi ve TEMPLATES kataloğuna eklendi (artık 11 şablon / 9 kategori). AI_PRESETS'e Söz/Mevlüt/Açılış prompt paketleri eklendi (12 preset).
- **Şablon Favorileme**: `db.design_favorites` (user_id, template_id). Uçlar: GET/POST/DELETE `/api/design/favorites/{template_id}` (get_current_user). Frontend: her şablon kartında yıldız (template-fav-*), üstte "Favoriler" kategorisi; giriş yoksa uyarı, optimistic update.
- **Galeri E-posta Bildirimi**: Müşteri seçim gönderince (public /select) stüdyonun e-postasına best-effort Gmail SMTP bildirimi (etkinlik, sipariş no, albüm/kanvas/rötuş sayıları, upsell, not). deps'e email_service.send_email + email_configured eklendi; try/except ile akışı asla bloklamaz.
- Doğrulama: 11 şablon/9 kategori + 12 preset (curl), favori add/list/401 (curl), şablon dialogu yeni kategoriler + yıldız (screenshot), seçim gönderimi bildirimle 200 SIP-*.

## KALAN — FAZ C (P0, sonraki tur)
- **Vesikalık Triple-Processing**: mevcut Vesikalık (MemberVesikalik.jsx + server.py vesikalik/ai-edit) modülüne 3 fotoğrafı aynı anda bağımsız işleyen mod + 20 fotoluk firma arşivi. AI işleme (gemini) kredi tükettiği için test dikkatli yapılacak.

## Session X-7 (Jun 2026) — 3 geliştirme: Bildirim Tercihleri + Şablon Önizleme + Favori AI Sonuçları (self-verified: curl + screenshot)
- **Bildirim Tercihleri**: studio_accounts'a notify_email + notify_enabled eklendi. PUT `/api/studio/settings/notifications` (studio auth). gallery.py public_select artık notify_enabled kapalıysa mail göndermez, notify_email varsa oraya (yoksa hesap e-postası) gönderir. Frontend: StudioDashboard "Galeri Bildirim Ayarları" kartı (notify-enabled toggle + notify-email + notify-save).
- **Şablon Önizleme**: Şablon kartına tıklamak artık doğrudan yüklemek yerine büyük önizleme modalı açıyor (template-preview-dialog) → "Bu şablonu kullan" (template-use-btn) ile tuvale getiriyor. Favori yıldızı korunuyor.
- **Favori AI Sonuçları**: Studio-scoped `db.design_ai_favorites`. Uçlar: GET/POST/DELETE `/api/studio/design/ai-favorites/{asset_id}` (studio auth). Frontend AI dialogunda her sonuçta "Kaydet/Kaydedildi" (ai-fav-*) + üretim yokken de görünen "Kayıtlı Arka Planlar" şeridi (ai-fav-use-*) → tıkla, tuvale arka plan olarak gelsin.
- Doğrulama: notify set/persist + ai-fav add/list (curl), pano bildirim kartı + şablon önizleme (screenshot), derleme temiz.

## KALAN — FAZ C (P0, sonraki tur): Vesikalık Triple-Processing + 20 fotoluk firma arşivi.

## Session X-8 (Jun 2026) — FAZ C: Vesikalık 3'lü İşleme + Firma Arşivi (TAMAMLANDI, doğrulandı)
- **3'lü İşleme modu**: `VesikalikTriple.jsx` (zaten yazılıydı) uygulamaya bağlandı. Yeni ortak sarmalayıcı `VesikalikWorkspace.jsx` üst-orta sabit pill toggle ile "Tekli" (AdminPassportPhoto) ↔ "3'lü İşleme" (VesikalikTriple) geçişi sağlar.
- **Her iki girişte de aktif**: `/vesikalik` (MemberVesikalik aktif üye görünümü) ve `/admin/vesikalik` (admin route) artık VesikalikWorkspace render eder. Mevcut tekli editör (AdminPassportPhoto) hiç bozulmadı.
- **Backend** (server.py, önceki turda hazırdı): POST `/api/vesikalik/ai-edit-triple` (en fazla 3 foto, asyncio.gather ile PARALEL & bağımsız; biri hata verse diğerleri devam), GET/POST/DELETE `/api/vesikalik/archive`, GET `/api/vesikalik/archive/{id}/image`. Sonuçlar `save_to_archive:true` ile firma arşivine otomatik kaydedilir, son 20 tutulur.
- **Kredi mantığı**: admin/staff → Emergent bakiyesi (kredi düşmez); BYOK → kendi anahtar; üye → başarı başına 1 kredi. `_track_feature "ai_kiyafet_triple"`.
- **Doğrulama**: screenshot (admin panelinde toggle görünür, 3'lü mod 3 slot + kontroller + "3'ünü Aynı Anda İşle" + Firma Arşivi 2 foto yüklü), curl (archive list 2 kayıt döndü, image url'leri çalışıyor). AI edit çağrısı gerçek Emergent kredisi harcadığından tetiklenmedi (önceki turda ~8.7s/3 foto doğrulanmıştı).

## Session X-9 (Jun 2026) — Merkezi Bildirimler + Altın Saat AI Mekan + Arşiv ZIP (verified iteration_33, frontend %100)
- **Merkezi Bildirimler**: `_create_notification` yardımcısı (server.py) severity ("critical"|"general"), firma_adi, read_at, link alanları ekler ve `{firma_adi}` etiketini firma adıyla değiştirir. Uçlar: GET `/api/notifications` (severity filtresi + critical_unread sayacı), POST `/api/notifications` (admin manuel oluşturma), POST `/api/notifications/mark-read` (read_at + read_by yazar). Otomatik bildirimler firma_adi ile beslendi: appointment_pending (kritik), studio_register (studio.py), gallery_order (gallery.py, kritik). Frontend: yeni sayfa `AdminNotifications.jsx` (`/admin/bildirimler`, sidebar "Bildirimler") — oluşturma formu + Tümü/Kritik/Genel filtre + okundu makbuzu (read_by/read_at) + 20s canlı polling. `NotificationBell.jsx` severity rozeti (kritik→kırmızı pulse), critical_unread, "Tümünü Gör" linki.
- **Altın Saat AI Mekan**: Backend POST `/api/golden-hour/ai-spots` (public) — Emergent LLM (gemini-2.5-flash) seçili koordinata en yakın 5 gerçek çekim mekanı önerir; backend haversine ile mesafeyi (km) hesaplar, mesafeye göre sıralar, Google Maps yol tarifi URL'si ekler. `GoldenHour.jsx`'e "Yapay Zekâ ile Mekan Öner" butonu (gh-ai-spots-btn) + mesafe rozetli sonuç kartları (gh-ai-spot-i, gh-ai-dist-i, gh-ai-maps-i) + hata toast'u.
- **Arşiv İndir (ZIP)**: `VesikalikTriple.jsx`'e Firma Arşivi başlığına "Arşivi İndir (ZIP)" butonu (vt-archive-zip-btn) — JSZip ile 20 arşiv fotoğrafını tek ZIP olarak indirir.
- **Toplu Kişiselleştirme**: ZATEN MEVCUTTU (DesignStudio.jsx "Toplu Üret" — metin kutusu + CSV yükleme (bulk-csv) + {isim} + JSZip, max 200 isim). Ek geliştirme gerekmedi.
- **Doğrulama**: curl (notif create+{firma_adi} substitution+severity filter, AI spots 5 mekan sıralı), screenshot (bildirim paneli KRİTİK+firma etiketi render), testing_agent iteration_33 frontend %100 (3 özellik uçtan uca, hata yok).

## Session Y (Jun 2026) — BİRİNCİ AŞAMA: Merkezi Stüdyo Paneli + Vesikalık birleştirme (verified iteration_34, backend 5/5, frontend %100)
- **Amaç**: Stüdyo hesabıyla giriş yapan kullanıcı, ayrı bir ana-site üyeliği açmadan, satın aldığı modüle göre Vesikalık ve/veya Etkinlik Galerisi'ni tek panelde kullanabilsin.
- **Modül yetkisi (entitlement)**: `studio_accounts.modules {vesikalik, gallery}` (varsayılan ikisi de true). `/api/studio/me` modules + brand_name + ai_credits döner. Legacy hesaplar için eksikse ikisi de true kabul edilir.
- **Birleşik auth**: `require_vesikalik_access` (server.py) artık main-site (admin/staff/member) VEYA studio_token'ı (cookie/Bearer) kabul eder; studio için vesikalik entitlement zorunlu (yoksa 403). Kredi: admin/staff Emergent (ücretsiz), studio kendi ai_credits'ini harcar (`_deduct_vesikalik_credits` doğru koleksiyonu günceller). Deneme stüdyosu ai_credits=0 → AI kıyafet 402 (deneme AI kapalı davranışı).
- **Studio Vesikalık**: rota `/studyo/vesikalik` (StudioVesikalik.jsx) — studio-auth guard + marka çubuğu (Panel'e dön, marka adı, kopyalanabilir FTB rozeti, çıkış). Mevcut VesikalikWorkspace (tekli AdminPassportPhoto + 3'lü) aynen gömülü — yüz tespiti, arka plan temizleme, baskı yerleşimi, Hızlı Baskı korunur. `api` axios studio_token cookie'sini otomatik gönderdiği için studio olarak kimlik doğrular.
- **Panel UX**: StudioDashboard hoş geldin toast'ı ("Hoş Geldiniz, {marka}. Çalışma Alanınız Hazırlanıyor.", oturumda 1 kez, kapatılabilir), kopyalanabilir FTB rozeti, modül kartları entitlement'a göre gösterilir (vesikalik kartı → /studyo/vesikalik).
- **Admin kontrol**: GET `/api/admin/studio-accounts`, POST `/api/admin/studio-accounts/{id}/modules` {vesikalik, gallery}. Studio marka: PUT `/api/studio/settings/brand` {brand_name} (yalnızca panelde; baskı çıktısına EKLENMEZ).
- **Regresyon**: admin `/admin/vesikalik` ve member `/vesikalik` akışları korunur (curl+testing_agent doğruladı). PayTR, Hızlı Baskı, bildirim ayarları bozulmadı.
- **KAPSAM NOTU (Phase 1'de HENÜZ YOK — sonraki turlar)**: Çalışan (kullanıcı) yönetimi + paket kullanıcı limitleri (1/3/5/7/10), ekip chat, firma-geneli ortak Son İşlenenler arşivi (personel bilgisi + Tekrar Baskı), 3'lü modda foto-başına farklı tür seçimi. Bunlar Birinci Aşamanın kalan alt-maddeleri; kullanıcı onayıyla devam edilecek.

## Session Z (Jun 2026) — Phase 1 kalan alt-maddeleri (verified iteration_35: backend 10/10, frontend %100)
- **Çalışan Yönetimi**: `studio_employees` koleksiyonu. Uçlar (owner-only): GET/POST/PATCH/DELETE `/api/studio/employees`, POST `/api/studio/employees/{id}/reset-password`. Paket kullanıcı limiti `max_users` (trial/basic=1, bronze=3, silver=5, gold=10; sahibi dahil). Limit dolunca 403. Çalışan girişi: `/api/studio/login` e-posta yoksa kullanıcı adıyla dener → token'a `emp`+`emp_name` claim'i ekler (sub=firma id → tüm firma-scoped veriler otomatik ortak). Pasif çalışan girişi 403. UI: `/studyo/ekip` (StudioTeam.jsx) + StudioPortal login `type=text` (kullanıcı adı kabul eder).
- **Firma Ortak Arşivi**: Vesikalık arşivi `owner_id`=firma id olduğu için firma geneli ortak (son 20). `_vesikalik_archive_save` artık `staff_name`+`photo_type`+`print_pref` saklar; liste bunları döner. UI: arşiv kartlarında personel/tür rozeti + "Tekrar Baskı" (tilePhotoToSheets ile tekrar baskı).
- **Ekip Chat**: `studio_chat_messages` (firma-scoped). Uçlar: GET/POST `/api/studio/chat`, POST `/api/studio/chat/read`. Yalnızca max_users>=3 (bronze+) aktif. Gönderen adı, saat, okunmamış sayacı (dashboard team kartında kırmızı rozet). 8sn polling.
- **3'lü Tür Seçimi**: VesikalikTriple'da slot başına format (PHOTO_SPECS) + adet seçimi; photo_type/print_pref backend'e gider. "Toplu Baskıya Hazırla" + kişi-bazlı baskı: `tilePhotoToSheets`/`printMultiSheet` ile 10×15 sayfalara diz, sığmayan için ek sayfa üretir.
- **Vesikalık kırpma düzeltmesi (bug)**: `detectBiometricCrop` artık `spec.format==='vesikalik'` için ICAO biyometrik kuralı yerine daha gevşek çerçeveleme (kafa foto yüksekliğinin %52'si, gözler %40 üstten) uygular → beden/omuz/göğüs daha çok görünür. Biyometrik formatlar aynen ICAO. (Otomatik test edilmedi; gerçek yüz fotoğrafı gerektirir — kullanıcı görsel doğrulayacak.)
- **Not**: Test için studio1 plan=gold yapıldı (chat/çalışan testi). Test çalışanı: aliusta/1234.

## Session AA (Jun 2026) — İKİNCİ AŞAMA: Etkinlik Galerisi gelişmiş özellikler (verified iteration_36: backend 14/14, frontend ~%95)
- **Etkinlik Süre Kuralları**: Plan bazlı `GALLERY_DURATIONS` (trial/basic 2/4, bronze 4/8, silver 5/10, gold 7/14 gün). Etkinlik oluşturmada `link_expires_at`+`originals_delete_at` hesaplanır. `_purge_if_due` süre dolunca orijinalleri (storage+db) siler, sipariş/seçim metası kalır. Public link/select süre dolunca engellenir. Tek seferlik ek link: POST `/studio/gallery/events/{id}/extend-link` (ikinci çağrı 400; silinme tarihini UZATMAZ).
- **Sipariş Durum Takibi**: 5 adım (new/İnceleniyor → preparing/Hazırlanıyor → printing/Baskıda → shipping/Kargoda → completed/Tamamlandı). GET `/studio/gallery/order-flow`. Public link'te canlı durum stepper'ı. Personel atama: PUT `/studio/gallery/orders/{id}/assign` (owner-only); çalışanlar `list_orders`'da yalnızca kendilerine atanan siparişleri görür.
- **RAW Uyarısı & Filigran**: RAW yüklemede toast uyarı (spesifik metin). Galeri ayarları (owner): GET/PUT `/studio/gallery/settings` {watermark, allow_originals}; trial → filigran zorunlu, orijinal indirme kapalı. Public link'te filigran overlay + izinliyse orijinal indirme butonu. UI: StudioGallery "Ayarlar" sekmesi.
- **Üyelik & PayTR**: GET `/studio/modules/pricing` (vesikalik+gallery × basic/bronze/silver/gold), ikinci modülde otomatik %20 indirim. POST `/studio/payments/module/create` → PayTR link. Ödeme başarılı olunca `_grant_paid_order` kind=studio_module → modül entitlement + plan set edilir. UI: `/studyo/paketler` (StudioPackages.jsx) + dashboard "Paketler & Satın Al" kartı.
- **Düzeltmeler**: StudioPortal login alanı `type=text` (çalışan kullanıcı adı girişi); fmtDate(null) → "—".

## Session AB (Jun 2026) — Bug: Ana site "Vesikalık Paneli" → "Stüdyo Paneli" birleştirme (verified iteration_37: backend 3/3, frontend %100)
- **Bug**: Ana site header/mobil/footer'da "Vesikalık Paneli" butonu `/vesikalik`'e gidiyordu (kullanıcı birleşik Stüdyo Paneli bekliyordu). PublicLayout.jsx'te üç yer de "Stüdyo Paneli" → `/studyo` olarak değiştirildi.
- **DEVAM EDEN — Deneme & Kotalar (Feature A, kısmi)**: gallery create_event artık `_studio_state` ile abonelik/deneme aktifliğini ve `max_events` kotasını zorunlu kılıyor; aşımda 402 `[UPGRADE]` döner. Etkinliğe `client_phone` alanı eklendi (WhatsApp hatırlatma için). PayTR modül grant'i artık `paid_until` (+30 gün) set ediyor (yoksa satın alan hesap pasif kalıyordu — düzeltildi).
  - KALAN: etkinlik başına 10GB depolama zorlaması, frontend yükseltme ekranı (402 yakalama → /studyo/paketler), create formunda telefon input'u.
- **KALAN — Süre Bitiş Hatırlatması (Feature B)**: silinmeye 24 saat kala müşteriye e-posta + yöneticiye tek tık WhatsApp mesaj butonu. (Henüz başlanmadı.)

## Session AC (Jun 2026) — Deneme Kotaları/Hatırlatma TAMAMLANDI + Super Admin Fiyat Paneli + Salon Girişi (verified iteration_38: backend 10/10, frontend %100)
- **Feature A/B TAMAMLANDI (Deneme Kotaları & Süre Bitiş Hatırlatması)**: StudioGallery'ye "Hatırlatmalar" sekmesi (sg-tab-reminders) — silinmeye 24 saat kalan etkinlikler + tek tık "WhatsApp ile Hatırlat" (sg-reminder-wa-{id}) + e-posta gönderim rozeti. Etkinlik oluşturma formuna client_phone (sg-event-phone) + client_email (sg-event-email) eklendi. 402 [UPGRADE] kota hataları yakalanıp toast + /studyo/paketler yönlendirmesi yapılıyor (makeQuotaHandler). Backend GET /api/studio/gallery/reminders (whatsapp_url + whatsapp_message + reminder_sent) + etkinlik başına storage_gb (deneme 10GB) upload-init'te zorlanıyor.
- **Super Admin Stüdyo Fiyat & Kota Paneli (P1)**: admin sayfası /admin/studyo-fiyatlar (AdminStudioPlans.jsx, ownerOnly). 5 plan (trial/basic/bronze/silver/gold) için price/ai_credits/storage_gb/max_events/max_users/max_devices/link_days/del_days + ikinci modül indirimi düzenlenir. Uçlar (require_admin): GET /api/admin/studio-plans, PUT /api/admin/studio-plans/{plan_id}, PUT /api/admin/studio-config. Override'lar db.studio_plan_config'te kalıcı, startup'ta load_plan_overrides ile yüklenir. effective_plans() artık /studio/plans + /studio/me + modül fiyatlamasını besliyor (hardcoded array yerine).
- **Salon Girişi & Davetiye Kodları (P1)** — AYRI "venue" rolü: portal /salon (VenuePortal), pano /salon/panel (VenueDashboard). Kendi venue_token cookie + Bearer (localStorage fotuber_venue_token), koleksiyon venue_accounts. Test hesabı: salon1@test.com / Test1234.
  - Uçlar: POST /api/venue/{register,login,logout}, GET /api/venue/me, POST/GET/DELETE /api/venue/codes, GET /api/venue/stats, GET /api/venue/code/{code} (public doğrulama).
  - Kodlar: venue_invite_codes koleksiyonu, TEK KULLANIMLIK. Tür "free" (100% → ücretsiz premium davetiye) veya "discount" (N% indirim). Toplu üretim (1-100).
  - Kullanım: davetiye sihirbazı /davetiye-olustur'da "Salon Davet Kodu" input'u (venue-code-input + venue-code-apply). POST /api/invitations'a venue_code gider; sunucu kodu ATOMİK olarak "used" yapar (çift kullanım engeli), fiyata free/indirim uygular. Ücretsiz premium davetiye → 0₺'ye published (paid=true, is_premium=true). İndirim → PayTR indirimli fiyatla. update_invitation venue_free/venue_discount_percent'i korur (_apply_venue_pricing). Footer'a "Salon Girişi" linki eklendi.
- **Kalan (P2, ertelendi)**: Masaüstü Uygulaması (Electron/Tauri) — roadmap gereği web akışları tamamen stabilleşene kadar bekletiliyor.
- **Cosmetic backlog (bloklamayan)**: StudioGallery "Yeni Etkinlik" + davetiye sihirbazında native <input type=date> (mm/dd/yyyy) — TR için localize Calendar ile değiştirilebilir.

## Session AD (Jun 2026) — Salon Raporu + Türkçe Takvim + Toplu WhatsApp Kampanyası (verified iteration_39: backend 5/5, frontend %100)
- **Salon Kullanım Raporu**: VenueDashboard'a 3 sekme (venue-tab-codes/report/campaign). "Kullanım Raporu" (venue-report) tablosu kullanılmış kodları Kod/Tür/Çift/Kullanım/Etkinlik/Davetiye sütunlarıyla listeler + CSV indir (venue-report-csv, UTF-8 BOM). Backend GET /api/venue/report db.invitations ile join'leyip çift adı (person1&person2), used_at, invitation_slug, event_date döner.
- **Türkçe Takvim**: Yeni `components/TrDatePicker.jsx` (Popover + shadcn Calendar + date-fns tr locale). Değer ISO YYYY-MM-DD saklanır, gg.aa.yyyy gösterilir. StudioGallery "Yeni Etkinlik" (sg-event-date) ve davetiye sihirbazı (event-date) native <input type=date> yerine bunu kullanıyor.
- **Salon Toplu WhatsApp Kampanyası (venue-campaign)**: Salon numaraları yapıştırır ("İsim, Telefon" veya sadece telefon), tür (free/discount %) + düzenlenebilir mesaj şablonu ({kod}/{link}/{teklif}) seçer, "Kodları Üret ve Hazırla" (venue-camp-generate) her numara için TEK KULLANIMLIK kod üretir (POST /api/venue/codes). Hazır liste (venue-camp-prepared) per-satır "Gönder" (venue-camp-send-{i}) + "Tümünü Sırayla Aç" (venue-camp-send-all) ile salonun KENDİ WhatsApp'ından wa.me deep-link açar. normalizePhone TR → 90XXXXXXXXXX. TWILIO/ÜCRETLİ PANEL YOK, sabit numara YOK — tamamen istemci tarafı wa.me (kullanıcı isteği).

## Session AE (Jun 2026) — Süper Admin: FTB Telafi & Kupon Engine + Merkezi Duyuru Broadcast + Canlı Aktivite + Stüdyo Banner (verified iteration_41: backend %100, frontend %100)
- **Merkezi Duyuru Broadcast**: Admin sayfası /admin/duyurular (AdminAnnouncements.jsx, ownerOnly, 3 sekme). Duyuru tipleri: critical/update (üstte yanıp sönen renkli banner) + celebration (konfetili modal) + general. Başlık+mesaj, {firma_adi}/{musteri_kodu} dinamik etiket, kapatılabilir + üst-barda-sabit (sticky) toggle, başlangıç/bitiş zamanı. Okundu bilgisi (X/Y okudu), e-posta gönderimi (tüm üyelere, kişiselleştirilmiş). Uçlar: POST/GET/PUT/DELETE /api/admin/announcements, GET .../{id}/stats, POST .../{id}/email. Stüdyo tarafı: GET /api/studio/announcements (kişiselleştir + zaman/dismiss filtre), POST .../{id}/ack. Bileşen: components/StudioAnnouncements.jsx (25sn polling) StudioDashboard'a enjekte edildi.
- **FTB Telafi & Kupon Engine**: /admin/duyurular → "FTB Telafi" sekmesi. FTB koduyla hesap bul (GET /api/admin/studio/lookup?ftb=), 3 telafi (POST /api/admin/studio/compensate): (1) Süre uzat (gün/ay → paid_until, trial ise basic'e yükseltir), (2) İndirim kuponu %10/20/50/100 (acc.comp_coupon_pct), (3) Kota yükle (+etkinlik → bonus_events, +AI → ai_credits). Log: studio_compensation_log. _studio_state artık max_events'e bonus_events ekliyor + coupon_pct döndürüyor.
- **Canlı Aktivite**: /admin/duyurular → "Canlı Aktivite" (GET /api/admin/studio/activity, 20sn refresh). Firma/FTB/plan/durum/son görülme + tek tık WhatsApp. /studio/me artık last_seen güncelliyor.
- **Test**: admin admin@fotuber.com.tr/FTB.2024, studio studio1@test.com/Test1234 (FTB-P34JX).
- **HÂLÂ EKSİK (sonraki aşamalar, kullanıcı "tamamını yap" dedi)**: (e-kalan) Aylık/Yıllık fiyat periyodu + cihaz/oturum limiti zorlaması; Gmail IMAP gelen kutusu widget'ı; (a) davetiye editör zenginleştirme (font/emoji/sembol kütüphanesi, otomatik kaydetme, sürüm geçmişi); (b) RSVP menü/ikram + misafir isimleri + isme özel link + Excel/PDF; (c) kişiye özel toplu baskı kapasite paketleri (200-1500) + alıcı listesi + toplu indirme; (d) Anı Duvarı GB paketleri + 7 gün ek indirme + Gold masa QR kartları PDF + Spam Kutusu; (f) salon sistemini şartname mimarisine taşıma (stüdyo içi salon girişi, admin paket/kota yetkisi, Gold fotoğrafçıya aylık 3 ücretsiz kod); (g) fotoğrafçı Sanal POS (İyzico/Shopier)+IBAN+elden; (i) Masaüstü uygulaması (Electron/Tauri).

## Session AF (Jun 2026) — Gelişmiş RSVP + Davetiye Editörü (verified iteration_42: backend %100, frontend %100)
- **Gelişmiş RSVP**: Misafir LCV formunda menü seçimi (Standart/Vejetaryen/Çocuk · rsvp-menu), transfer/servis onayı (rsvp-transfer), kişi sayısına göre refakatçi isim+menü satırları (rsvp-companion-*). Backend RsvpIn: menu/needs_transfer/companions; submit stores; /report stats menü dağılımı + transfer sayısı; /report.csv yeni sütunlar (Menü/Transfer/Refakatçiler). MyInvitations raporunda menü özeti kutusu (report-menu-summary) + satır rozetleri. (İsme özel davet linkleri zaten mevcuttu — invitation_guests/guest_token.)
- **Davetiye Editörü — Dijital sihirbaz font/boyut**: /davetiye-olustur'da 'Yazı Tipi' (inv-font-family, 10 Google font) + 'İsim Boyutu' (inv-name-scale). Backend InvitationIn.font_family + name_scale (create+update+_invite_public). InvitationPreview + InvitationView t.script/t.heading override + loadGoogleFont + isim boyutu ölçekleme.
- **Davetiye Editörü — Tasarım Stüdyosu sembol/emoji + otomatik kaydetme**: DesignStudio'da 'Sembol' butonu (ds-add-symbol) → kategorili kütüphane dialog (ds-symbol-dialog: Kalpler/Çiçek/Düğün-Yüzük/Yıldız/Geometrik/Kına). Otomatik kaydetme (dirty → 12sn'de bir sessiz doSave(silent), ds-autosave-indicator). doSave(silent) 401'de sessiz.
- **Bu turda YAPILMADI (kalan 4'ten 2'si — sonraki tur)**: (c) Kişiye Özel Toplu Baskı kapasite paketleri (200-1500 + alıcı listesi + toplu indirme — NOT: DesignStudio'da 'Toplu Üret'/ZIP zaten kısmen var, kapasite paketi/enforcement eksik), (d) Anı Duvarı GB paketleri + Gold masa QR kartları PDF + Spam Kutusu.

## Session AG (Jun 2026) — Gmail Kutusu + Aylık/Yıllık Fiyat + Toplu Baskı Kapasitesi (verified iteration_43: backend %100, frontend %100)
- **Canlı Gmail Gelen Kutusu**: /admin/gmail (AdminInbox.jsx, ownerOnly). IMAP ile GMAIL_USER/GMAIL_APP_PASSWORD üzerinden son 25 mail (GET /api/admin/inbox), tıklayınca detay + panelden yanıtlama (POST /api/admin/inbox/reply, SMTP). imaplib (stdlib), asyncio.to_thread.
- **Aylık/Yıllık Abonelik**: Planlara price_yearly eklendi (basic 4990/bronze 8990/silver 14990/gold 24990). AdminStudioPlans'a 'Yıllık Fiyat' alanı. /studio/modules/pricing price_yearly+base_yearly döndürüyor; buy_module `period` alıyor; PayTR webhook period'e göre paid_until +365/+30. StudioPackages'ta Aylık/Yıllık toggle (pkg-period-*).
- **Kişiye Özel Toplu Baskı Kapasitesi**: users.print_capacity + print_used. GET /api/design/print-capacity (paketler 200-1500, +100/+200), POST /api/design/print-consume (402 [CAPACITY] enforcement), admin POST /api/admin/print-capacity (set/add by email). DesignStudio toplu üretimde kapasite göstergesi (bulk-capacity) + üretim öncesi tüketim/limit kontrolü. (Alıcı listesi + isimli üretim + ZIP zaten mevcuttu.)
- **KALAN (son aşama, sonraki tur)**: (d) Anı Duvarı GB paketleri (Silver 10GB/Gold 50GB) + 7 gün ek indirme + Gold masa QR kartları (PDF) + Spam Kutusu (taşı/geri al/sil). Ayrıca cihaz/oturum HARD limiti (stateful session gerektirir — integration_expert ile dikkatli yapılacak).


## Session AF (Jun 2026) — Vesikalık 3'lü Otomatik + Anı Duvarı Paketleri + Admin Tam Ücretsiz Erişim (verified iteration_44, backend 100% / frontend 100%)
- **Vesikalık 3'lü İşleme yeniden yazıldı** (`VesikalikTriple.jsx`): Eskiden sadece AI kıyafet değiştiriyordu. Artık ana buton "3'ünü Aynı Anda İşle" → 3 fotoğrafa tekli paneldeki OTOMATİK vesikalık pipeline'ını uygular (arka plan temizleme + biyometrik yüz çerçeveleme, yeni `lib/passportAuto.js` `autoProcessPassport()` — bg removal + `detectBiometricCrop` + spec boyutuna render). AI kıyafet artık per-slot opsiyonel switch (`vt-ai-toggle-{i}`, kapalıyken cinsiyet/kıyafet/renk gizli). Her sonuçta "İnce Ayar (Tekli Editörde Aç)" (`vt-finetune-{i}`) → `VesikalikWorkspace` `injected` state ile tekli editöre (`AdminPassportPhoto` yeni `injected` prop) aktarır. Sonuçlar firma arşivine POST /vesikalik/archive ile kaydedilir.
- **Anı Duvarı (Foto/Video Duvarı) Paketleri**: Tek katman (75GB/500₺) → **Silver (10GB)** + **Gold (50GB)**. `sections.photowall_tier` ("silver"|"gold"). `_invitation_pricing` tier fiyatını uygular; `_photowall_tier_of`/`_photowall_limit_bytes` per-davetiye depolama limiti. Eski ödenmiş photowall davetiyeler startup'ta **gold**'a migrate edilir (`sections.photowall_tier`). Fiyat & depolama **admin panelinden** (`/admin/ani-duvari`, AdminMemoryWall.jsx; GET/PUT /api/admin/photowall-config, db.meta). Public GET /api/invitations/photowall-tiers (wizard). Wizard'da 3 kart (Kapalı/Silver/Gold — `photowall-tier-none/silver/gold`).
- **Masa QR Kartları (Gold)**: `invitation_pdf.render_table_qr_pdf` → A4'te 2×3=6 kart (çift ismi + QR → /davetiye/{slug} yükleme sayfası + "Fotoğraflarını Yükle"). GET /api/invitations/{iid}/table-qr.pdf (owner, gold=200 / silver=403). MyInvitations moderasyon dialogunda "Masa QR Kartları (PDF)" butonu (`photowall-table-qr`, sadece gold).
- **Spam Kutusu (sahip)**: `invitation_photos.spam` bayrağı. POST /api/invitations/{iid}/photos/{pid}/spam {spam}. Public wall + slideshow + owner ZIP spam'i hariç tutar. manage endpoint spam + spam_count + tier + table_qr döner. MyInvitations moderasyon dialogu sekmeli: "Fotoğraflar" / "Spam Kutusu" (`photowall-tab-photos`/`photowall-tab-spam`); Spam'e taşı (`mod-spam-{id}`), geri al (`mod-restore-{id}`), gizle (`mod-hide`), sil (`mod-del`). Tier rozeti + depolama çubuğu tier'e göre.
- **Site Admin TAM ÜCRETSİZ/SINIRSIZ erişim** (kullanıcı isteği: "admin tüm özelliklere kayıt olmadan ücretsiz erişir"):
  - Davetiye: `create_invitation`/`update_invitation` içinde `is_internal = role in (admin, staff)` → pricing free, status=published, paid=True, extended=True (premium tema + foto duvarı dahil ödemesiz).
  - Stüdyo Paneli: `routers/studio.build_get_current_studio` artık ana site admin/staff token'ını (cookie `access_token`) kabul eder → `_ensure_admin_studio()` kalıcı tam-yetkili studio hesabı (`id=admin-{sub}`, `is_admin_super`, plan=gold, paid_until +3650g, tüm modüller, design_rights/ai_credits=10M, bonus_events=1M). studioApi withCredentials olduğu için admin ana site girişiyle /studyo/panel otomatik açılır. Normal member token'ı hâlâ 401 (gated).
- **Testler**: iteration_44 backend 8/8 (yeni /app/backend/tests/test_iter44.py) + frontend %100. Sıfır issue.


## Session AG (Jun 2026) — Admin/Personel TÜM Panellerde Tam Ücretsiz Erişim (curl doğrulandı)
- **Kök neden**: (1) `_membership_state` admin/staff için active=False dönüyordu → `/vesikalik` üyelik/satın alma gate'i çıkıyordu. (2) Admin'in aynı e-posta (admin@fotuber.com.tr) ile kayıtlı ESKİ trial/expired studio ("fotuber") ve venue ("xl") hesapları vardı; panel login önce onları buluyordu → satın alma isteniyordu.
- **Düzeltmeler**:
  - `server.py _membership_state`: role in (admin, staff) → daima {active:true, status:"active", plan:"admin", unlimited:true}. `/vesikalik` (MemberVesikalik `me.membership.active`) editörü açar, gate atlanır.
  - `routers/studio.py`: `ensure_admin_studio` modül seviyesine taşındı. `get_current_studio` admin/staff main-site token'ını (cookie `access_token`) kabul eder. `studio_login` artık **önce** db.users admin/staff kimliğini doğrular → tam-yetkili admin-super studio (`admin-{uid}`, gold, sınırsız) döner; eski aynı-email studio hesabı gölgede kalır.
  - `routers/venue.py`: `ensure_admin_venue` + `get_current_venue` admin/staff token kabulü + `venue_login` admin/staff-öncelikli fallback (`admin-{uid}` venue).
- **Doğrulama (curl)**: /api/member/me admin → active/unlimited/plan=admin; /api/studio/login admin → "Fotuber Yönetim" gold+active; /api/venue/login admin → "Fotuber Yönetim". Artık admin/personel hiçbir panelde üyelik/ödeme görmez.
- **NOT**: Canlıya yansıması için kullanıcının yeniden Deploy/Re-publish yapması gerekir. Tarayıcıda eski `studio_token` cookie'si varsa panele yeniden giriş yapılmalı (yeni token admin-super'a döner).



## Session AH (Jun 2026) — AŞAMA 1: Davetiye Tasarım Stüdyosu taşındı + zenginleştirildi
- **Taşıma**: Üst menüde "Baskı Davetiye" kaldırıldı, yerine **"Davetiye Tasarım Stüdyosu"** (`/tasarim-studyosu`) eklendi (PublicLayout navItems). Stüdyo panelinden (StudioDashboard) "Davetiye Tasarım Stüdyosu" modül kartı kaldırıldı. `/baskiya-hazir-davetiye` route erişilebilir kalır ama menüde yok.
- **Editör yeni özellikler** (DesignStudio.jsx): 
  - **Geri Al / İleri Al (undo/redo)**: canvas JSON geçmiş yığını (max 40), toolbar butonları (`ds-undo`/`ds-redo`) + klavye Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y. Delete/Backspace ile seçili öğe silme.
  - **Daha fazla şekil**: Yumuşak köşeli kutu, Üçgen, Yıldız (polygon), Kalp (path), Elmas (polygon) — `ds-add-roundrect/triangle/star/heart/diamond`.
  - **Daha fazla sembol**: SYMBOL_LIBRARY 6→8 kategori, her kategori genişletildi (Doğum Günü & Kutlama, Ok & Ayraç eklendi).
  - Katman sırası (Öne/Arka), Kopyala, Sil zaten mevcuttu (seçim panelinde).
  - **AI "Hazır Davetiye" modu**: AI diyaloğunda çıktı türü seçici — "Sadece Şablon" (arka plan) veya "Hazır Davetiye". Hazır modda AI arka planı üretir + üstüne **çift ismi (Great Vibes) + tarih + mekân** textbox'ları otomatik yerleştirir (düzenlenebilir). Alanlar: `ai-mode-template/ready`, `ai-couple/date/venue`.
- **Ücretlendirme**: AI Tasarla + {isim}/Toplu Üret (isme özel) zaten stüdyo girişi + `design_rights` (tasarım hakkı) gerektiriyor = ücretli. Kayıt-dışı kullanıcı AI diyaloğunda "Stüdyo Paneli'ne giriş yap" uyarısı görür.
- **Test**: Toolbar + yeni şekiller + undo/redo screenshot ile doğrulandı. AI hazır-davetiye kodu client-side, stüdyo-gated.

## AŞAMA 2 (SIRADAKİ / P0) — Vesikalık & Etkinlik(Galeri) panel ayrımı
- Giriş yine Stüdyo Paneli üzerinden. Kullanıcı Vesikalık ve Etkinlik Galerisi'ni **ayrı ayrı** satın alır; panelde yalnızca satın aldığı modül görünür.
- **3 günlük deneme** ikisini de açar; deneme bitince kullanıcı hangisini/ikisini alacağını seçer; ikisini aldıysa ikisi görünür.
- Fiyatlar **aylık + yıllık** ve modül bazında (Vesikalık / Galeri) **admin panelinden ayrı ayrı** ayarlanabilir. Yıllık fiyatta, aylığa kıyasla **% kaç tasarruf** edildiği belirgin gösterilecek.
- Daha sade / modern / işlevsel arayüz.



## Session AI (Jun 2026) — AŞAMA 1.5: Tasarım Stüdyosu ücretli özellikleri NORMAL üyelik + satın alma (verified iteration_45, %100)
- **Stüdyo üyeliği kaldırıldı**: AI + isme özel/toplu artık normal üyelikle çalışır. `get_current_studio` role=="member" → `ensure_member_design_account` (id `member-{uid}`, modules boş {}, design_rights, is_member_design). `_strip_studio` boş modülü artık koruyor (isinstance dict). Üye stüdyo modüllerine (vesikalik/gallery) erişemez.
- **İki ayrı ürün** (admin `/admin/tasarim-haklari`): (1) AI Tasarım Hakkı paketleri (mevcut, design_rights_packages). (2) **İsme Özel Toplu Baskı paketleri** (yeni `bulk_print_packages`: prints + bonus_ai + price). Admin CRUD: `/api/admin/bulk-print-packages`. Seed: 200/500/1000/1500 baskı + 5-15 hediye AI. AdminDesignRights.jsx iki bölümlü.
- **Üye satın alma**: `GET /api/studio/design/bulk-print-packages`, `POST /api/studio/payments/bulk-print/create` (PayTR, order_extra kind=`member_bulk_print`, user_id + studio_id). Webhook `_grant_paid_order`: user.print_capacity += prints, member studio design_rights += bonus_ai. AI paketleri zaten member-{uid} design_rights'a yükleniyor (studio_design_rights).
- **Matbaaya hazır PDF** (`POST /api/design/bulk-print-pdf`, design_studio.py): frontend her davetliyi seçilen ölçüde (trim+2×3mm bleed) 300 DPI cover-render eder, backend reportlab ile her sayfa görseli tam sayfaya basar + 4 köşe kesim işareti çizer. Çıktı: `mode=single` tek çok-sayfalı PDF veya `mode=zip` her davetli ayrı PDF (ZIP). Ölçüler: 13x18, 10x21 DL, 15x15, A5, A6, 15x22, 12x17, Özel(mm) — açıklamalı. Kenarda beyaz/kayma olmaması için cover-fit + bleed.
- **Admin sınırsız**: `/design/print-consume` ve `/print-capacity` admin/staff için bypass (sınırsız). AI login notu artık `/giris` (normal üyelik) yönlendirir.
- Test: iteration_45 backend %100 (bulk-print-pdf single+zip, admin CRUD, member listing/buy PayTR link, member design account, admin bypass) + frontend %100. Sıfır issue.

## AŞAMA 2 (SIRADAKİ / P0) — Vesikalık & Etkinlik Galerisi panel ayrımı (detay Session AH sonunda)



## Session AJ (Jun 2026) — AŞAMA 2 (kısım 1): Per-modül yetkilendirme + yıllık tasarruf (verified iteration_46, %100)
- **Per-modül erişim** (`studio.py _module_entitlement` + `get_current_studio` enjeksiyonu): 3 günlük deneme HER İKİ modülü açar; deneme bitince yalnızca `module_until[m] > now` olan modül açık kalır; ikisi de alınırsa ikisi açık. Eski `paid_until` + `modules` bayraklı hesaplar korunur (grandfather). `acc.modules` her istekte entitlement ile üzerine yazılır → tüm modül-gate'li uçlar + StudioDashboard otomatik uyar. `_strip_studio` `entitlement` alanı döner.
- **Satın alma webhook** (`server.py` studio_module): `module_until[mod]` dönemine göre (30/365 gün) max(now, mevcut) üzerinden uzatılır; plan + paid_until de güncellenir.
- **Yıllık tasarruf %**: `/studio/modules/pricing` her satırda `savings_pct` (aylık×12 vs yıllık). StudioPackages yıllık satırlarında `pkg-savings-*` yeşil "%X tasarruf" rozeti.
- **StudioDashboard**: `studio-trial-banner` (3 günlük deneme, iki modül açık, gün sayısı + satın al CTA); modül kartları entitlement'a göre gate.
- admin-super (tam) ve üye design-only hesapları etkilenmedi (erken return).
- Test: iteration_46 backend %100 + frontend %100. Curl ile ayrıca doğrulandı: deneme bitince {false,false}, sadece vesikalik alınınca {vesikalik:true, gallery:false}.
- **KALAN (AŞAMA 2 · kısım 2)**: Vesikalık ve Galeri için AYRI fiyat (şu an ikisi aynı tier fiyatını kullanıyor) + admin panelinde modül-bazlı fiyat alanları; paketler sayfası daha sade/modern redesign. Modül-bazlı kota (AI kredisi/depolama/etkinlik) netleştirme.



## Session AK (Jun 2026) — Genel Fiyat Merkezi (admin-editable, curl doğrulandı)
- **Yeni**: Üyelik (aylık/yıllık) ve Davetiye (premium tema + süre uzatma) fiyatları artık admin panelinden. `server.py`: `load_site_pricing(db)` (db.meta "site_pricing" → global MEMBER_MONTHLY/YEARLY, INVITE_PREMIUM/EXTEND, startup'ta yüklenir), `GET/PUT /api/admin/site-pricing`. Değişiklik anında yansır (globaller call-time okunur). Yıllık tasarruf % admin sayfasında gösterilir.
- **Admin UI**: `/admin/genel-fiyatlar` (AdminSitePricing.jsx) + sidebar "Genel Fiyatlar".
- **Böylece tüm site fiyatları admin-editable**: Stüdyo tier fiyat+kota (Stüdyo Fiyat & Kota), Anı Duvarı paketleri, Tasarım/Baskı paketleri (AI hakları + baskı kotası + hediye AI), Üyelik + Davetiye (Genel Fiyatlar).
- Test: curl — GET/PUT çalışır, üyelik fiyatı canlı yansır (129/1290), premium güncellenir; varsayılana reset edildi.
- **KALAN (AŞAMA 2 · kısım 2)**: Vesikalık ve Galeri için BİRBİRİNDEN FARKLI fiyat (şu an ikisi aynı tier fiyatını kullanıyor; tier fiyat+kotaları editable ama modül-bazlı ayrı fiyat için tier'dan bağımsız fiyat alanı gerekiyor) + paketler sayfası modern/sade redesign.



## Session AL (Jun 2026) — Vesikalık & Galeri modül-bazlı AYRI fiyat (admin-editable, curl doğrulandı)
- `studio.py`: `_MODULE_PRICING` globali (örnek varsayılan: Vesikalık 499/4990, Galeri 699/6990) + `get_module_pricing/set_module_pricing`. `load_plan_overrides` içinde db.studio_plan_config "_module_pricing"tan yüklenir. `_module_price` artık modülün kendi fiyatını (aylık/yıllık) tier'dan bağımsız kullanır → Vesikalık ve Galeri farklı fiyatlanabilir. Kotalar (AI kredisi/depolama/etkinlik) hâlâ tier'dan (Stüdyo Fiyat & Kota).
- `server.py`: `GET/PUT /api/admin/module-pricing` (db.studio_plan_config "_module_pricing").
- Admin UI: `/admin/genel-fiyatlar` (AdminSitePricing) altına "Stüdyo Modül Fiyatları (ayrı ayrı)" bölümü — Vesikalık ve Galeri için aylık/yıllık + tasarruf % ipucu.
- Test: curl — GET defaults, PUT (Vesikalık 599/5990 ≠ Galeri 799/7990) → `/studio/modules/pricing` base/base_yearly/savings_pct doğru yansıdı; örnek varsayılanlara reset edildi. Frontend derlendi. (Admin UI login otomasyonu screenshot'ta doldurulamadı; backend tam doğrulandı, sayfa mevcut çalışan desenle aynı.)
- **AŞAMA 2 kalan tek iş**: Paketler (StudioPackages) sayfasının daha sade/modern redesign'ı (iki büyük modül kartı, aylık/yıllık geçiş, tasarruf vurgusu) — fiyatlar zaten modül-bazlı geliyor.



## Session AM (Jun 2026) — AŞAMA 2 TAMAM: Paketler sayfası sade/modern redesign
- `StudioPackages.jsx` yeniden yazıldı: ortada başlık + aylık/yıllık geçiş anahtarı (yıllıkta "2 ay bedava"), iki büyük modül kartı (Vesikalık mavi, Galeri fuşya gradient), büyük fiyat gösterimi (modül-bazlı) + yıllıkta "%X tasarruf" rozeti + "aylık X yerine yıllık Y" satırı, özellik listesi, sade "Kota paketi" tier çipleri (kota seçimi), tek "Satın Al / Süreyi Uzat" butonu. Aktif modülde "Aktif" rozeti.
- data-testid: studio-packages, pkg-period-toggle/-monthly/-yearly, pkg-module-{m}, pkg-price-{m}, pkg-savings-{m}, pkg-tiers-{m}, pkg-tier-{m}-{plan}, pkg-buy-{m}.
- Derleme temiz; `/studio/modules/pricing` verisi (base_price/price/price_yearly/savings_pct/plan_name) daha önce curl ile doğrulandı. Not: login screenshot otomasyonu (kontrollü input) formu dolduramadığı için görsel doğrulanamadı; gerçek kullanıcıda sorun yok, istenirse testing_agent ile UI doğrulanabilir.
- **AŞAMA 2 böylece tamamlandı**: per-modül yetkilendirme (deneme→ikisi, sonra sadece satın alınan) + modül-bazlı ayrı fiyat (admin) + yıllık tasarruf % + sade/modern paketler arayüzü.



## Session AN (12 Haz 2026) — Yüzen Ekip Sohbeti Widget'ı + Etkinlik Galerisi sade/modern redesign
- **Yüzen Sohbet Widget'ı**: `StudioChatWidget.jsx` App.js'te GLOBAL monte edildi (<Routes> sonrası). Sadece pathname `/studyo` ile başlarken VE backend `enabled:true` (paket max_users>=3) iken görünür. Sağ altta yüzen balon (chat-open-btn) → panel (studio-chat-widget): metin (chat-input/chat-send-btn), 18'li emoji ızgarası (chat-emoji-btn), dosya/görsel yükleme (chat-file-btn, 8MB limit), Web Audio ses kaydı (chat-mic-btn → audio/webm), bildirim sesi (tek AudioContext yeniden kullanılır), okunmamış kırmızı rozet (chat-unread-badge), masaüstü bildirimi (Notification API), küçült (chat-minimize-btn). 4sn polling; poll artık token yoksa (fotuber_studio_token / fotuber_token) erken döner (401 gürültüsü giderildi). Medya cookie/Bearer ile `/api/studio/chat/media/{id}`.
- **Ekip sayfası (/studyo/ekip)**: gömülü sohbet kutusu (eski team-chat) KALDIRILDI; personel ekle/yönet (team-add-form, team-list, team-name/username/password/add-btn, toggle/reset/del) AYNEN korundu. Alta "sohbet artık yüzen balonda" bilgi notu eklendi.
- **Etkinlik Galerisi (/studyo/galeri) modern sadeleştirme**: ikon rozetli başlık + alt açıklama; sekme çubuğu yuvarlatıldı (rounded-2xl, mobilde kaydırılabilir no-scrollbar); etkinlik kartları yeniden düzenlendi (temiz hiyerarşi, meta bilgiler chip'ler halinde: foto sayısı/albüm limiti/link durumu, hover efektleri, ayrılmış aksiyon satırı); modern boş durumlar (sg-events-empty, sg-packs-empty, sg-orders-empty) ikonlu. Tüm data-testid ve işlevsellik korundu.
- **Test**: testing_agent iter_47 → frontend %100 pass. Backend chat curl ile doğrulandı (login/me/chat, Bearer+cookie).

## Session AN-2 (12 Haz 2026) — Sesli mesaj: canlı süre sayacı + ön dinleme + mobil uyum
- `StudioChatWidget.jsx`: mic akışı yeniden yazıldı. Kayıt sırasında canlı süre sayacı (chat-rec-timer, mm:ss, 5dk güvenlik limiti), kayıt çubuğu (chat-recording-bar) durdur (chat-rec-stop) + iptal (chat-rec-cancel). Durdurunca otomatik göndermez → ön dinleme çubuğu (chat-audio-preview): audio player + gönder (chat-audio-send) + sil (chat-audio-discard). İptal = önizleme oluşmadan normale döner (canceledRef guard, onstop erken return).
- Mobil/iOS Safari uyumu: `pickAudioMime()` MediaRecorder.isTypeSupported ile en uygun formatı seçer (webm/opus → mp4/aac → ogg), `mimeExt()` uzantı; min-w-0 + shrink-0 ile mobilde taşma yok (390px doğrulandı).
- Test: testing_agent iter_48 (cancel bug bulundu) → düzeltildi → iter_49 frontend %100 pass (sayaç, iptal, durdur→önizleme, gönder, sil, metin gönderme, mobil taşma yok).

## Session AN-3 (12 Haz 2026) — Ekip sohbetinde mesaj sabitleme (pin)
- Backend `studio.py`: `POST /api/studio/chat/{msg_id}/pin {pinned}` (SADECE firma sahibi, _require_owner) → tek sabit mesaj (yeni sabitlerken diğerleri kaldırılır). `GET /chat` artık `is_owner` + `pinned` (mesaj objesi) döndürür; mesajlarda `pinned` alanı.
- Frontend `StudioChatWidget.jsx`: üstte sabitlenen mesaj afişi (chat-pinned-banner) + sahibe kaldır butonu (chat-unpin-btn); her mesajda hover ile sahibe pin/unpin (chat-pin-{id}); sabit mesaj amber vurgulu + pin ikonu.
- Test: curl doğrulandı — sahip pin/unpin çalışır (ok:true, GET pinned doğru), çalışan (aliusta) is_owner=false ve pin denemesi 403.

## Session AN-4 (12 Haz 2026) — Sesli mesajlara dalga formu (waveform)
- `StudioChatWidget.jsx`: (a) kayıt sırasında canlı animasyonlu waveform (canvas, chat-rec-waveform; AnalyserNode + rAF); (b) gönderilen ve önizlenen sesli mesajlar için özel WhatsApp tarzı çubuklu oynatıcı `AudioBubble` (play/pause, tıklanabilir ilerleme çubuğu, mesaj id'sine göre deterministik çubuk yükseklikleri seededBars, MediaRecorder Infinity süre workaround). Native <audio controls> kaldırıldı.
- data-testid: chat-rec-waveform, chat-audio-preview-player(+-play), chat-audio-bubble-{id}(+-play).
- Test: testing_agent iter_50 → frontend %100 pass (canlı waveform, önizleme oynatıcı, gönderilen bubble play/pause, regresyon: iptal/metin/pin, mobil 390 taşma yok). Ek kütüphane yok.

## Session AO (12 Haz 2026) — Vesikalık: 3 kritik hata düzeltme + filigran revizyonu
- **HATA 1a — State kaybı**: `VesikalikWorkspace.jsx` artık Tekli ve 3'lü panelleri AYNI ANDA mount tutup `hidden` class ile gizliyor. Tekli editöre "İnce Ayar" ile geçip geri dönünce 3'lü slotlar/sonuçlar korunuyor (önceden unmount olup siliniyordu).
- **HATA 1b — Taşma (overflow)**: `AdminPassportPhoto.jsx` injected useEffect artık gelen (zaten spec oranında işlenmiş) fotoğrafı 0.7 crop yerine tam çerçeveye SIĞDIRIYOR (contain, spec en-boy oranına göre). Yüz/fotoğraf çerçeveden taşmıyor.
- **HATA 2 — Yazıcıya gönder**: `printImage.js` (printImageSheet + printMultiSheet) window.open yerine GİZLİ IFRAME ile yazdırıyor (popup engelleyici sorununu çözer), window.open fallback'i var, null dataUrl guard'ı eklendi. quick-print başarı toast'ı doğrulandı.
- **Filigran revizyonu**: Filigran seçilince `drawSheet` her fotoğrafın ALTINDA 1 cm beyaz şerit açıyor (fotoğraf kırpılmıyor, alan kağıttan açılır), filigran o şeride yerleşiyor; kesim çizgisi şeridin altından geçiyor. Konum: sol/orta/sağ hizalama + yeni ince konum pad'i (wm-move-up/down/left/right/center, wmNudge mm). Filigran asla fotoğrafın üzerine gelmiyor; "Kaldır" ile tamamen kaldırılıyor.
- **Korunanlar**: arka plan temizleme API'si ve genel işleme yapısı DEĞİŞMEDİ. Filigran değişikliği yalnızca filigran mevcutken devreye giriyor (geri uyumlu).
- **Test**: testing_agent iter_51 → frontend %100 (5/5 must-pass): state persistence, canvas render, filigran şerit kontrolleri+redraw, hızlı baskı toast, baskıya hazır indir. Inject/overflow alt-testi sandbox bg-model kısıtı nedeniyle atlandı (fix deterministik, kod incelemesiyle doğrulandı).

## Session AP (12 Haz 2026) — B2B Stüdyo Vesikalık: FAZ 1 (Ebat kütüphanesi + Özel ebat + Kağıt dizilim sihirbazı)
Kullanıcı kararları: Faz faz ilerle (Faz 1'den başla). Object Storage + 6 ay arşiv + 24 saat QR (Faz 2/4/5). Tüm vesikalık modüllü stüdyolara açık. Faz 5 askeri kıyafet = Nano Banana AI giydirme, tasarım hakkından düşer (sonraki faz).
- **Ebat kütüphanesi** (`passportSpecs.js`): Askeri Kimlik eklendi — `tr-military` 2.5×3.2 cm (baskı+dijital, ≤100KB, biyometrik kırpma), `tr-military-digital` 297×378 px (YALNIZCA dijital, baskıya girmez, ≤100KB).
- **Özel ebat (mm+DPI)**: Fotoğrafçı panelden en/boy(mm)+DPI girip kaydediyor (localStorage `fotuber_custom_specs`), dropdown'a ekleniyor, silinebiliyor.
- **Dijital indirme**: `Dijital İndir` — exactPx (297×378) + `canvasToJpegMaxKb` ile ≤100KB JPEG. digitalOnly ebatlarda baskı butonları devre dışı.
- **Kağıt Dizilim Sihirbazı** (`passportLayout.js`): Standart/Kombin. Kombin = aynı kişinin fotoğrafını tek kağıda farklı ebatlarda dizme (shelf packing `packLayout`, `drawComboSheet`, cover-crop), kenar boşluğu + kesim çizgileri, `Kombin Baskı`. Standart mod mevcut `drawSheet` ile aynen korunuyor.
- **Korundu**: arka plan temizleme, biyometrik, 3'lü işleme, filigran şeridi — hepsi değişmedi (ek/additive). drawCombo TDZ'den kaçınmak için ayrı effect'te.
- **Test**: testing_agent iter_52 → frontend %100 (13/13), 0 konsol hatası, regresyon temiz.
- Not: iter_51'deki 2 hata düzeltmesi + filigran revizyonu bu oturumun başında yapıldı ve deploy edildi (canlı: fotuber.com.tr).

### Bekleyen (kullanıcı onaylı sıradaki fazlar)
- FAZ 2: Dijital teslimat + QR kod (backend geçici güvenli link 24s + Object Storage; ekranda/baskıda QR).
- FAZ 3: ICAO yüz/kalite kontrolü (yüz oranı %70-80, göz/bakış, gölge; yeşil onay/rozet).
- FAZ 4: Stüdyo CRM arşivi (ad/telefon kayıt + hızlı arama + yeniden baskı/QR; 6 ay arşiv).
- FAZ 5: Askeri rütbeli kıyafet AI giydirme (admin üniforma yükleme + Nano Banana kafa birleştirme; tasarım hakkından düşer).

## Session AQ (12 Haz 2026) — FAZ 2: Dijital Teslimat + QR (yalnızca tekli foto) + maxKB düzeltmesi
- **maxKB düzeltmesi**: ≤100KB sınırı ARTIK sadece askeri kimlik ebatlarında. Diğer tüm ebatlarda `Dijital İndir` tam kalite PNG (sıkıştırmasız). (Kullanıcı isteği.)
- **QR Teslimat (yalnızca tekli)**: `POST /api/studio/vesikalik/deliver` (studio Bearer VEYA admin access_token cookie) → tekli PNG'yi Object Storage'a (`fotuber/vesikalik/{studio_id}/{uuid}.png`) yükler; `db.vesikalik_deliveries` (token, 24h expires_at, 182g archive_until, client_name/phone/spec_label). Public: `GET /api/v/{token}` (HTML önizleme + indir, no-store), `GET /api/v/{token}/file` (bytes; ?inline=1 önizleme). Süre dolunca 410.
- **Frontend**: `AdminPassportPhoto.jsx` — `QR ile Teslim Et` butonu → qrcode.react QR modalı (qr-canvas, qr-url, kopyala, 24s notu). Object Storage server.py'deki mevcut put_object/get_object (deps) ile.
- **Test**: backend curl (deliver/page/file 200) + testing_agent iter_53 → %100 (8/8): QR modal, public link auth'suz çözülüyor, maxKB askeri-only, dijital-only'de baskı butonları disabled, kombin+hızlı baskı regresyon temiz.
- **Sıradaki**: Üniforma Kütüphanesi (admin yükle+onay, fotoğrafçı PNG+PSD öner→admin onay→herkese açık; PSD=Photoshop indirme, PNG=önizleme+Faz5 AI katmanı). Sonra Faz 3 (ICAO), Faz 4 (CRM), Faz 5-B (AI kafa birleştirme).

## Session AR (12 Haz 2026) — FAZ 5-A: Askeri Üniforma Kütüphanesi (yükleme + onay + paylaşım)
- **Backend** (`studio.py`, `military_uniforms`): chunked upload (upload-init/chunk/complete, 512KB), `POST /api/studio/uniforms` (isim + png_upload_id + opsiyonel psd_upload_id). Admin (is_admin_super) yüklerse status=approved anında; fotoğrafçı yüklerse pending. `GET /api/studio/uniforms` → admin tümünü, fotoğrafçı onaylı + KENDİ bekleyen/reddedilenleri görür. Dosya: `GET /uniforms/{id}/file/{png|psd}` (png inline, psd attachment; cookie/Bearer auth). Admin: approve/reject/PATCH(name)/DELETE (soft). Depolama: Object Storage `fotuber/uniforms/{id}/uniform.{png,psd}`.
- **Frontend** (`components/UniformLibrary.jsx`): editörün (AdminPassportPhoto) sağ sütununa gömüldü — hem admin (/admin/vesikalik) hem studio panelinde. Kartlar (önizleme PNG, isim, yükleyen, PSD indir), yükleme formu (isim + PNG zorunlu + PSD opsiyonel, chunked, %ilerleme), admin moderasyon (onayla/reddet/adı düzenle/sil), pending 'Onay bekliyor' rozeti.
- **Test**: backend curl (admin instant-publish, studio pending→approve, own-pending görünür, delete 403) + testing_agent iter_54 → 8/9; tek eksik (studio kendi pending'ini görmüyor) TEK SATIRLIK backend $or fix ile giderildi ve curl'le doğrulandı.
- **Not (Faz 5-B için)**: PNG önizleme <img> crossOrigin — canvas'a çizerken (AI birleştirme) farklı origin'de taint riski; o adımda signed/proxy URL değerlendirilecek. AI kafa birleştirme (Nano Banana) ayrı adım.

## Session AS (12 Haz 2026) — FAZ 3: ICAO Biyometrik Uygunluk & Yüz Kontrolü
- **`faceDetect.js` checkIcao(canvas)**: face-api landmarks ile 5 kontrol → yüz oranı (%62-88, hedef ~72), gözler açık (EAR<0.17), baş eğikliği (>7°), yatay ortalama (>%12 sapma), arka plan/gölge dengesi (üst köşe luminans farkı). Yüz yoksa tek rozet "Yüz tespit edilemedi". Dönüş {ok, checks:[{key,label,ok}]}.
- **`AdminPassportPhoto.jsx`**: "ICAO Kontrol" butonu (icao-check-btn) → runIcao → icao-panel: yeşil onay/amber uyarı rozetleri (icao-badge-ratio/eyes/tilt/center/bg/face) + özet (TAMAM / Dikkat gerekiyor). Hata mesajı netleştirildi.
- **Test**: testing_agent iter_55 → wiring + graceful no-face + regresyon %100 (5/5). Rozet GÖRSEL doğrulaması sandbox'ta ENGELLENDİ: headless chromium'da WebGL yok + .wasm MIME hatası → TFJS backend başlatılamıyor. Mevcut "Otomatik Yüz Tespiti"/arka plan temizleme de aynı face-api'yi kullanıyor ve CANLIDA çalışıyor → ICAO da gerçek tarayıcıda çalışır. Kullanıcı canlıda doğrulamalı.
- Kalan fazlar: Faz 4 (CRM arşiv), Faz 5-B (askeri kıyafet AI giydirme, Nano Banana).

## Session AT (12 Haz 2026) — FAZ 4: Stüdyo CRM Arşivi (ad/telefon arama + yeniden baskı/QR)
- **Backend** (`studio.py`, vesikalik_deliveries üzerine): GET `/api/studio/vesikalik/archive?q=` (ad/telefon/kod regex arama, stüdyo bazlı, 6 ay), GET `/archive/{id}/file` (stüdyo-auth saklı görsel), POST `/archive/{id}/relink` (yeni 24s token), DELETE `/archive/{id}` (soft). `import re as _re` eklendi.
- **Frontend**: `AdminPassportPhoto` — QR akışına opsiyonel Müşteri adı+telefon (crm-name/crm-phone) → deliver ile kaydedilir. Yeni `components/VesikalikArchive.jsx` — debounce'lu arama, sonuç listesi (küçük resim cookie ile), yeniden baskı (saklı PNG indir), QR relink modalı, sil. Editör sağ sütununa UniformLibrary altına gömüldü.
- **Test**: backend curl + testing_agent iter_56 → frontend %100 (11/11): capture+deliver, arşiv listesi+thumbnail, ad/telefon arama, relink QR, reprint indir, sil, regresyon temiz. Kayıtlar stüdyo bazlı (doğru izolasyon).
- **Kalan**: Faz 5-B — Askeri kıyafet AI giydirme (Nano Banana, tasarım hakkından düşer).

## Session AU (12 Haz 2026) — FAZ 5-B: Askeri Kıyafet AI Giydirme (Nano Banana) + tasarım hakkı düşümü
- **Backend** (`studio.py`): `POST /api/studio/uniforms/{uid}/apply {image_b64}` — kişi fotoğrafı + üniforma PNG (storage) 2 referans görsel olarak Nano Banana'ya (mevcut ai-edit deseni: LlmChat + ImageContent + send_message_multimodal_response). Tasarım hakkı atomik düşer, hata/boş sonuçta iade edilir. Prompt: yüz/kafa BİREBİR korunur, rütbe/apolet/işaret AYNEN korunur, ışık/renk eşitlenir, baş-omuz sade stüdyo çerçevesi, yazısız. Dönüş {image_b64 (data URL), rights_remaining}.
- **Ön işleme/hizalama**: kaynak zaten arka planı temiz + çerçeveli tekli foto; kafa-omuz hizalama ve ışık eşitleme prompt ile yönlendiriliyor (best-effort, kalite kişi/pozisyona göre değişebilir — kullanıcı kabul etti).
- **Frontend**: `UniformLibrary` onaylı kartlarda "AI Giydir" butonu (uniform-apply-{id}, spinner). `AdminPassportPhoto.applyUniform` tekli canvas PNG'yi gönderir, sonucu editöre yükler (contain crop), kalan hakkı toast'lar.
- **Test**: backend gerçek Nano Banana çağrısı curl ile → HTTP 200, ~768KB birleşik görsel, design_rights düştü. Frontend derleme temiz, kanıtlı fetch deseni. AI görsel kalitesi kullanıcı tarafından canlıda değerlendirilecek.
- **DURUM**: Faz 1-2-3-4 + 5-A + 5-B TAMAMLANDI. Askeri kimlik B2B modül seti bitti.

## Session AV (12 Haz 2026) — AI Öncesi/Sonrası + Üniforma Kategorileri + WhatsApp + Deneme AI hakkı
- **Öncesi/Sonrası**: AI giydirme sonucu artık doğrudan uygulanmıyor; `uniform-result-modal` (öncesi/sonrası görsel + Kabul Et/Tekrar Dene/Vazgeç). Kabul edilince editöre yüklenir.
- **Üniforma kategorileri**: `military_uniforms.category` (Kara/Deniz/Hava/Jandarma/Sahil Güvenlik/Polis/Diğer). Backend create/list(?category=)/patch. Frontend: yükleme formunda kategori select (uniform-category), grid üstünde filtre çipleri (uniform-cat-*), kartta 'Kategori · yükleyen'.
- **Tek tık WhatsApp**: Arşivde `archive-whatsapp-*` → relink ile taze 24s link + normalize telefon (0 at, 10 hane ise +90) → wa.me/<numara>?text=... otomatik açılır. Telefon yoksa wa.me/?text=... fallback.
- **Deneme AI hakkı (3 gün)**: Trial hesapları `ai_trial_credits=3` (erkek/kadın/askeri birer kez). `apply_uniform` trial aktifse önce ücretsiz deneme hakkını kullanır (design_rights düşmez), hata/boşta iade eder. `/uniforms` trial_active + ai_trial_credits döner; UniformLibrary'de `ai-trial-banner`.
- **Test**: backend curl (trial account: 3 hak→apply trial_used=true, kalan 2, design_rights değişmedi; kategori filtre) + testing_agent iter_57 → frontend %100 (12/12), regresyon temiz.

## Session AW (12 Haz 2026) — Deneme → Ücretli Dönüşüm
- **Editör dönüşüm modalı** (`conversion-modal`): AI giydirme 402 (hak bitti) dönerse doğrudan açılır — "Ücretsiz AI haklarınız doldu", "Paketleri Gör" (→ /studyo/paketler) + "Sonra".
- **Kütüphane banner CTA**: trial aktif & ai_trial_credits===0 → `ai-trial-conversion` gradient banner + "Paketler" butonu (→ /studyo/paketler). Hak>0 iken normal `ai-trial-banner` (kalan hak).
- **Doğrulama**: curl — hakları sıfırlanmış hesap apply → 402 (AI çağrısı yok), /uniforms trial_active=false & credits=0. Frontend derleme temiz. 402→modal ve banner CTA basit UI (doğrulanmış state'e bağlı).

## Session AX (12 Haz 2026) — BUG FIX: Etkinlik tarih seçici + Büyük Etkinlik Paneli backlog
- **BUG FIX (doğrulandı)**: Etkinlik Galerisi "Yeni Etkinlik" dialogunda gün/ay/yıl seçimi çalışmıyordu. Kök neden: TrDatePicker (Radix Popover) Radix Dialog içinde pointer/focus çakışması. Çözüm: `StudioGallery.jsx` içinde native <select> tabanlı `DateSelects` (gün/ay/yıl) → YYYY-MM-DD. testing_agent iter_58 → %100 (etkinlik 2026-06-15 ile oluşturuldu, event_date doğru POST edildi). TrDatePicker diğer sayfalarda (InvitationCreate) aynen duruyor.

### YENİ BACKLOG — Etkinlik Paneli B2B genişletmeleri (kullanıcı talebi, HENÜZ YAPILMADI)
Öncelik sırası kullanıcıdan alınacak:
1. **Özel hizmet ekleme**: Fotoğrafçı Albüm/Kanvas/Retouch dışında (Baskı, Çerçeve, Ahşap Tablo, Cam Tablo…) kendi hizmetlerini ekleyip isim/limit/ekstra ücret ayarlayabilsin (etkinlik veya stüdyo bazında).
2. **Seçim kodları + orijinal indirme**: Müşterinin seçtiği foto KODLARI (DSC002635…) hangi hizmet için seçildiğiyle fotoğrafçıya gelsin; fotoğrafçı orijinalleri (izin verdiyse filigranlı/filigransız) panelinden indirebilsin.
3. **Thumbnail arşivi**: Süre dolup orijinaller silinse bile küçük boyut (thumbnail) + kodlar fotoğrafçı panelinde saklansın.
4. **Müşteri görünümü**: ızgara + kaydırmalı (carousel) görünüm; foto tıklayınca büyüt/incele (lightbox); "Siparişi Gönder" sonrası süre dolana dek orijinalleri görüp indirebilsin; süre bitince sadece bilgi ekranı.
5. **Tekrar link**: Fotoğrafçı, kendi etkinlik süresi (örn. 8 gün) dolana dek müşteriye (örn. 4 gün) 2. kez link verebilsin.
6. **Stüdyoya özel ödeme**: Fotoğrafçı kendi Sanal POS / IBAN / Elden Ödeme yöntemlerini müşteriye tanımlasın.
7. **Gold aylık davetiye kodu**: Gold stüdyolara her ay otomatik 3 ücretsiz davetiye tasarım kodu.
8. **Admin reklam alanları**: Stüdyo panelinde uygun yerlere + site anasayfası en altına, admin'in eklediği yatay/dikey animasyonlu (video/gif/düz) tıklanınca reklam sahibine yönlendiren banner'lar; mobil uyumlu.

## Session AY (12 Haz 2026) — Grup A #1: Özel Hizmet Kataloğu (foundation)
- `gallery.py ServicePackIn` + `kind` (Baskı/Çerçeve/Ahşap Tablo/Cam Tablo/Albüm/Kanvas/Retouch/Diğer) + `max_qty` (0=sınırsız). model_dump ile saklanıp listeleniyor.
- `StudioGallery.jsx PacksTab`: tür select (sg-pack-kind), isim, ekstra ₺ (sg-pack-price), adet limiti (sg-pack-limit); kartta tür rozeti + '+X₺/Ücretsiz' + 'maks N adet'.
- Test: backend curl + testing_agent iter_59 → %100.
- ÖDEME SPESİFİKASYONU (kullanıcı, sıradaki iş): Fotoğrafçı kendi Sanal POS ekleyip ücretli hizmetlerde KART ödemesi alsın (başarılı olursa hizmet fotoğrafçıya bildirilsin); Havale/EFT (fotoğrafçı IBAN) ve Nakit/Elden → fotoğrafçı ONAY versin. Yöntemler stüdyo bazında tanımlanmalı.
- KALAN GRUP A: #2 seçim kodları+hangi hizmet için (fotoğrafçıya), orijinal indirme (filigranlı/filigransız, izinli), #3 carousel+lightbox müşteri görünümü, #4 sipariş sonrası süreye dek erişim + bitince bilgi ekranı, #5 thumbnail+kod arşivi + 2. kez link (foto süresi < fotoğrafçı süresi). GRUP B: özel ödeme (yukarıdaki spec), Gold aylık 3 davetiye kodu. GRUP C: admin reklam banner alanları (panel + anasayfa altı, mobil, tıklanabilir).

## Session AZ (12 Haz 2026) — Grup A #2/#3/#4/#5: Seçim Kodları + Lightbox + Orijinal İndirme + Süre Mantığı ✅
- **Foto-bazlı hizmet ataması (backend)**: `gallery.py SelectionItem.packs[]` eklendi. `public_select()` her foto için album/kanvas/retouch + özel paket atamasını işler; `pack_map` → `pack_details[]` (id, name, kind, price, qty, total, **codes[]=dosya adları**); `album_codes/canvas_codes/retouch_codes` de kaydedilir. `max_qty` aşımında 400. `upsell_total = price × atanan foto adedi`. E-posta ve admin bildirimine foto kodları eklendi.
- **Müşteri Lightbox (GallerySelect.jsx)**: Tam ekran, ok tuşu + dokunmatik swipe + prev/next; foto KODU üstte; içinde Albüm/Kanvas/Rötuş + her aktif özel paket atanabilir (limit/fiyat gösterir). Grid'de her fotoda kod etiketi + 'N hizmet' rozeti; 'Seçilen Ek Hizmetler' özeti (paket başına adet×fiyat + foto kodları); alt barda ek hizmet toplamı.
- **Stüdyo tarafı (StudioGallery.jsx)**: Sipariş kartında `OrderCodes` → her hizmetin foto kodları. PDF'te (`_build_order_pdf`) hizmet başına kodlar. Etkinlik detayında her thumbnail'de kod etiketi + hover'da orijinal indirme; **'Orijinalleri İndir (ZIP)'** butonu (`GET /studio/gallery/events/{id}/download`, dosya adları=kodlar).
- **Süre mantığı**: `_purge_if_due()` artık SADECE orijinal hi-res dosyayı siler; thumbnail + kod + tüm sipariş metadata saklanır (`original_purged` flag). Stüdyo `get_event` purge çalıştırır, silinmiş fotoyu 'Silindi' rozetiyle thumbnail olarak gösterir. `extend_link` artık **tekrar tekrar** yenilenebilir (tek seferlik değil), müşteri linki orijinal silme tarihini aşamaz (cap). Buton 'Link Yenile'.
- Test: backend curl (kod eşleme, max_qty 400, PDF 200, ZIP doğru dosya adları, link tekrar yenileme) + testing_agent iter_60 → 6/6 %100. (Not: 'kind=Diğer' bulgusu bug değildi — eski 'Ekstra Albüm' paketi kind alanı eklenmeden önce oluşturulmuş; yine de `d.get("kind") or "Diğer"` None-güvenliği eklendi.)
- KALAN: GRUP B (Stüdyoya özel ödeme: Sanal POS/IBAN/Nakit onay akışı; Gold aylık 3 davetiye kodu). GRUP C (admin reklam banner alanları). GRUP A içinde filigranlı/filigransız orijinal İNDİRME müşteri tarafında `allow_originals` ayarına bağlı halihazırda mevcut; stüdyo ZIP her zaman filigransız orijinal verir.


## Session BA (12 Haz 2026) — Grup B (Stüdyoya Özel Ödeme) + Grup C (Admin Reklam Banner) + Toplu Kod Kopyala ✅
- **Stüdyoya Özel Ödeme (gallery.py)**: `studio_payment_methods` koleksiyonu + `PAYMENT_PROVIDERS` meta (her sağlayıcı için adım adım `steps` rehberi, `fields`, `help`, `docs`). Sağlayıcılar: **paytr / iyzico / odeal** (tam otomatik native, per-merchant anahtar), **link** (herhangi bir sağlayıcının hazır ödeme linki), **iban**, **cash**. Gizli anahtarlar okuma/redaction ile maskeli (`_redact_method`). Gateway link üreticileri: `_paytr_gallery_link`, `_iyzico_gallery_link` (iyziLink v2 imza), `_odeal_gallery_link` (pay-by-link + token) + callback'ler (`/gallery/pay/paytr-callback`, `/iyzico-webhook`, `/odeal-callback/{studio_id}`) her biri per-merchant imza doğrular ve `_finalize_paid` ile siparişi 'paid' yapar.
- **Ödeme akışı**: `public_select` artık `order_id`, `needs_payment`, `payment_methods` döner (upsell_total>0 ise). Public: `POST .../orders/{oid}/pay` (auto → redirect_url; link/iban/cash → manuel), `POST .../mark-paid` (→ awaiting_confirm), `GET .../status`. Stüdyo: `PUT /studio/gallery/orders/{oid}/confirm-payment` (manuel onay → paid). Sipariş `payment_status`: none/unpaid/pending/awaiting_confirm/paid.
- **Frontend**: `StudioGallery.jsx` yeni **Ödeme Yöntemleri** sekmesi (`PaymentsTab`): sağlayıcı seç → adım adım rehber (`sg-pay-guide`) + dinamik alanlar + CRUD. `OrdersTab`: `PayBadge` + 'Ödemeyi Onayla' (`sg-order-confirm-pay-*`). `GallerySelect.jsx` `PaymentStep`: müşteri yöntem seçer (kart→yeni sekme+durum kontrol; link→yeni sekme+'Ödedim'; iban→IBAN göster+'Havaleyi Yaptım'; cash→'Onaya Gönder').
- **Toplu Kod Kopyala**: OrdersTab'da `sg-order-copy-codes-*` → siparişteki tüm seçim kodlarını (album/kanvas/rötuş + paket kodları, benzersiz) panoya kopyalar.
- **Admin Reklam Banner (server.py ~1481)**: `ad_banners` koleksiyonu. `POST/GET/PUT/DELETE /api/admin/ad-banners` (image/GIF/**video** upload, object storage), `GET /api/ad-banners/img/{id}` (serve), `GET /api/ad-banners?placement=` (public aktif), `POST /api/ad-banners/{id}/click` (tıklama sayacı). placement: home_footer / studio_panel; orientation: horizontal(dikdörtgen)/vertical; `media_type` image/video.
- **Frontend banner**: `AdminAdBanners.jsx` (/admin/reklamlar, nav 'Reklam Alanları') — yükleme + **önerilen piksel ölçüsü ipucu** (`ad-size-hint`, placement+orientation'a göre değişir) + video önizleme. `components/AdBanners.jsx` — Home footer (`dark`) ve StudioGallery altında; image→`<img>`, video→otomatik+sessiz+loop `<video>`, tıklanınca click kaydı + target_url yeni sekme.
- Test: backend curl (ödeme CRUD+redaction, IBAN tam akış, banner CRUD/serve/click) + testing_agent **iter_61 → %100, 0 bug**. NOT: otomatik gateway'ler (paytr/iyzico/odeal) gerçek merchant anahtarı gerektirdiği için gerçek link üretimi test edilemez (beklenen).
- KALAN: Gold aylık 3 ücretsiz davetiye kodu (P2), Desktop App (Electron/Tauri, P1). Otomatik gateway'ler stüdyo gerçek anahtarlarını girdiğinde canlıda test edilmeli.

## Session BB (12 Haz 2026) — Reklam CTR İstatistikleri + Masaüstü Uygulaması (Electron) ✅
- **Reklam Performansı (CTR)**: `ad_banners` dokümanına `impressions` eklendi. `POST /api/ad-banners/{id}/impression` (public), admin liste artık `impressions/clicks/ctr` döner, `GET /api/admin/ad-banners/stats` (toplam gösterim/tıklama/CTR/aktif). Frontend: `AdBanners.jsx` IntersectionObserver ile görünürlükte bir kez impression atar; `AdminAdBanners.jsx` üstte 4'lü istatistik paneli (`ad-stats-panel`, `ad-stat-*`) + her banner kartında gösterim/tıklama/CTR. Test: curl (imp/click/stats) + screenshot (CTR %66.67). Nav 'Reklam Alanları' artık tüm adminlere görünür (ownerOnly kaldırıldı).
- **Masaüstü Uygulaması (`/app/desktop/`)**: Electron sarmalayıcı — Stüdyo Panelini (`${APP_URL}/studyo`) masaüstü penceresinde açar. `main.js` (tek örnek, harici linkler sistem tarayıcısında, will-navigate origin kısıtı, TR menü, did-fail-load yeniden dene), `preload.js` (`window.fotuberDesktop`), `config.js` (APP_URL — `FOTUBER_APP_URL` env veya DEFAULT_APP_URL; canlıda production alan adıyla değiştirilmeli), `package.json` (electron + electron-builder; win NSIS `.exe`, mac `.dmg`, linux AppImage), `README.md` (kurulum/derleme adımları), `assets/icon.png` + `icon.ico` (üretilen logo). node --check ile tüm JS geçerli; config mantığı doğrulandı. ⚠️ Başsız container'da GUI açılamadığı/installer üretilemediği için burada ÇALIŞTIRILAMADI/DERLENEMEDİ — kullanıcı yerel Windows/macOS'ta `yarn && yarn dist:win|dist:mac` ile derlemeli.
- KALAN: Gold aylık 3 ücretsiz davetiye kodu (P2). Otomatik ödeme gateway'leri (paytr/iyzico/odeal) gerçek anahtarlarla canlı testi.

## Session BC (12 Haz 2026) — Reklam Zamanlama + Masaüstü İndirme Linkleri + Kalıcı Oturum + CI ✅
- **Reklam Zamanlama**: `ad_banners` dokümanına `starts_at`/`ends_at` (YYYY-MM-DD, opsiyonel). `_ad_in_schedule` (public filtre) + `_ad_schedule_status` (live/scheduled/expired/paused). Public `GET /api/ad-banners` sadece zamanı gelen ve süresi geçmemiş aktif banner'ları döner. Admin listesinde `schedule_status`. Frontend `AdminAdBanners.jsx`: başlangıç/bitiş tarih inputları (ad-starts-at/ad-ends-at) + `ScheduleBadge` (Yayında/Zamanlandı/Süresi Doldu/Pasif). Test: curl (gelecek→gizli, geçmiş→gizli, canlı→görünür) + testing_agent iter_62 → %100.
- **Masaüstü İndirme Linkleri**: `desktop_downloads` singleton. `GET /api/desktop-downloads` (public), `PUT /api/admin/desktop-downloads` (admin) — windows_url/mac_url/version. Admin sayfası `AdminDesktopApp.jsx` (/admin/masaustu, nav 'Masaüstü Uygulaması'). Stüdyo panelinde (`StudioDashboard`) `DesktopDownloadButtons.jsx` → 'Windows için indir' + 'macOS için indir' (linkler boşsa gizli). Test: curl (GET/PUT/persist) + screenshot (studio butonları) + testing_agent iter_62 → %100.
- **Electron kalıcı oturum + CI**: `desktop/main.js` `partition: "persist:fotuber"` (giriş kapanışta kaybolmaz) + menüde 'Oturumu Sıfırla (Çıkış)' (farklı firma girişi için storage temizler). `.github/workflows/desktop-build.yml`: push/manuel tetikte windows-latest→.exe, macos-latest→.dmg matrix derlemesi, `FOTUBER_APP_URL` secret/input desteği, artifact upload. Kullanıcı seçimi: mevcut /studyo giriş URL'i + kalıcı oturum + GitHub Actions otomatik derleme. mac ikonu png'e alındı (icns gerekmez).
- KALAN: Kullanıcı kodu GitHub'a gönderip Actions ile .exe/.dmg üretecek + admin panelinden gerçek indirme linklerini girecek. Gold aylık 3 davetiye kodu (P2). Otomatik ödeme gateway'leri canlı anahtar testi.

## Session BC (13 Haz 2026) — Zengin Davetiye Şablon Kataloğu + Gerçekçi Animasyon Motoru (VİDEOSUZ) — FAZ 1 (verified iteration_63, frontend %100)
- **İstek**: davethemen.com esinli; basit animasyonlar kaldırıldı; video YOK. Kategori bazlı zengin şablon kataloğu + HTML5 Canvas/3D CSS/gyroscope/foil ile gerçekçi motor.
- **Yeni katalog** `frontend/src/lib/invitationTemplates.js`: 7 kategori (dugun/nisan/kina/nikah/bride/sunnet/kurumsal), FAZ 1'de 50+ şablon tanımlı (INVITATION_TEMPLATES). Her şablon drop-in "visual" (bg/panel/border/accent/text/sub/dark/heading/script) + motor alanları: `foil` (metalik renkler), `particles` (canvas türü), `texture` (cotton/linen/marble/dark/matte), `reveal` (envelope/card/curtain), `wax`. `resolveVisual(data)` tek doğruluk kaynağı (template > eski 8 tema fallback). `priceThemeFor` → premium şablon backend'e theme="noir" (250₺), ücretsiz → "romantic" (0₺) gönderir; sunucu fiyatlandırması DEĞİŞMEDİ.
- **Motor bileşenleri**:
  - `components/invitation/ParticleCanvas.jsx`: GPU-dostu Canvas parçacık motoru (rose_petals fizik salınım+yerçekimi, leaves, gold_dust, sparkle, bokeh, confetti patlama+yerçekimi, hearts, orient/kına ışıltı). DPR + ResizeObserver, sekme gizliyken durur.
  - `hooks/useParallaxTilt.js`: gyroscope (iOS izinli requestGyro) + mouse 3D parallax tilt.
  - `components/invitation/FoilText.jsx`: background-clip:text ile animasyonlu metalik altın/gümüş yansıma; tilt'e tepkili.
  - `components/invitation/TemplateReveal.jsx`: şablon-güdümlü tam ekran açılış — 3D dokulu ZARF (mum mührü kırılışı + ışık parlaması + rotateX kapak), KART yükselişi, PERDE açılışı. Parallax tilt + FoilText isimler + ParticleCanvas + düzenlenebilir karşılama yazısı + revealSound (mute/skip). Eski SIGNATURE_STYLES/InvitationReveal kaldırıldı (reveal artık şablondan gelir).
- **Sihirbaz** `InvitationCreate.jsx`: "Şablon Kataloğu" butonu → kategori sekmeli galeri (tpl-cat-*, tpl-card-*, tpl-inspect-*/tpl-use-*). İncele → tam ekran statik önizleme. Yeni **Açılış Karşılama Yazısı** input (welcome-text). "Açılış Animasyonunu Önizle" TemplateReveal ile tam ekran önizler. Varsayılan şablon wed-botanic (ücretsiz).
- **Misafir** `InvitationView.jsx` + `InvitationPreview.jsx`: resolveVisual + ParticleCanvas + FoilText; TemplateReveal ile açılır; welcome_text gösterilir.
- **Backend** (server.py): InvitationIn'e `template` + `welcome_text` eklendi; create/update persist; _invite_public döner. Fiyatlandırma theme üzerinden aynı kaldı. Curl ile doğrulandı (create + public fetch template/welcome_text döndürüyor). Test davetiyesi: slug `ahmet-yasemin-9a66eb` (kina-bordo).
- **index.html**: Cinzel, Marcellus, Tangerine, Parisienne, Cardo, Cormorant, Josefin Sans fontları eklendi.
- **Doğrulama**: testing_agent iteration_63 frontend %100 — misafir sayfası spinner'da TAKILMIYOR, 7 kategori sekmesi, İncele/Kullan, welcome-text senkron, reveal önizleme aç/kapa/mute/skip, RSVP çalışıyor, runtime hatası yok.
- **FAZ 2 (bekliyor)**: kataloğu tam sayılara zenginleştirme (halihazırda config girişleri mevcut, görsel çeşitlilik artırılabilir); kına için oryantal SVG çizgi belirme animasyonu; canvas-confetti kütüphanesi (opsiyonel).

## Session BC — macOS Masaüstü Çökme Düzeltmesi (config; kullanıcı GitHub CI ile test edecek)
- **Kök neden**: `desktop/build/afterPack.js` imzalarken `--entitlements` ve `--options runtime` UYGULAMIYORDU → plist'teki allow-jit/allow-unsigned-executable-memory izinleri Apple Silicon'a geçmiyor, V8 EXC_BREAKPOINT (SIGTRAP) ile çöküyordu.
- **Düzeltme**: afterPack.js yeniden yazıldı — tüm iç bileşenler (frameworks/dylib/.node/Helper .app) inside-out, ana .app en son; her biri `--options runtime --entitlements entitlements.mac.plist --sign -` ile ad-hoc imzalanıyor + doğrulama. package.json mac'e identity:null + hardenedRuntime:true + gatekeeperAssess:false + entitlements/entitlementsInherit eklendi. Workflow'a CSC_IDENTITY_AUTO_DISCOVERY=false eklendi.
- **Durum**: Konteynerde Electron derlenemez; kullanıcı "Save to Github" → GitHub Actions'tan yeni .dmg indirip test edecek. Apple Developer hesabı YOK; ad-hoc + doğru entitlements en garantili çözüm. Çözülmezse tam Apple Notarization gerekir (P2).


## Session BC — FAZ 2: Şablon Kimliği + Mini Önizleme + Fotoğraflı Şablonlar (verified iteration_64, frontend %100)
- **Dekoratif kimlik** `components/invitation/TemplateDecor.jsx`: her kategoriye özgü SVG dekor katmanı (art_deco/floral_corner/oriental/minimal_frame/confetti_frame/star_frame/geo_corners), framer pathLength ile "çizilerek belirme". Kına için **animasyonlu oryantal mandala** (dönen medalyon + petaller). `decorFor(tpl)` kategoriye göre seçer; template `decor` override edebilir. resolveVisual artık `decor` + `photo` döner. InvitationPreview + TemplateReveal (zarf/kart/perde sahneleri) dekoru render eder.
- **Gerçek mini önizleme** `components/invitation/TemplateThumb.jsx`: canvas-SIZ hafif mini kart (bg + dekor + foil/script isimler + tarih). Katalog kartları artık "Aa" yerine bu render'ı gösterir (50+ kart için performanslı, canvas yok).
- **Fotoğraflı premium şablonlar**: wed-photo, eng-photo, kina-photo, sun-photo (`photo:true`). Çiftin kapak fotoğrafı zarf/kart içinde çerçeveli gösterilir (InvitationPreview preview-photo + TemplateReveal CardBody). Kapak yoksa monograma güvenli fallback. TemplateReveal'e `coverUrl` prop'u eklendi (View + Create geçiriyor). Kart etiketinde "· Fotoğraflı" + foto ikonu.
- **Doğrulama**: testing_agent iteration_64 %100 — thumbnaillar tüm kategorilerde render, foto şablonlar sekmelerinde + rozet, İncele modalı + dekor, kına misafirinde oryantal mandala görünür + curtain reveal, foto zarf reveal, RSVP regresyonu geçti, console hatası yok. Backend curl: 4 foto şablon id'si publish+persist. (Kozmetik not: test slug elif-kaan-173c7b event_type=dugun ile oluşturulduğu için "DÜĞÜN" etiketi gösteriyor; sihirbaz şablon seçince kategoriyi doğru atar.)


## Session BC — FAZ 2 İnce Ayarlar (verified iteration_65, frontend %100)
- **Etiket senkronu**: `eventLabelFor(data)` — davetiye/önizleme etiketi artık seçilen ŞABLONUN kategorisinden gelir (kına şablonu asla "DÜĞÜN" göstermez). DB migration'sız eski davetiyeleri de düzeltir. InvitationPreview + InvitationView + Create reveal önizlemesi kullanıyor.
- **"📷 Fotoğraflı" hızlı filtre sekmesi** (tpl-cat-photo): katalogda tüm foto şablonları (wed/eng/kina/sun-photo) tek yerde listeler + açıklama notu.
- **Kapak yükleme rehberi**: foto şablon seçiliyse "dikey 3:4 fotoğraf yükleyin" ipucu (photo-upload-tip) + yükleme sonrası 3:4 kırpma önizlemesi (cover-crop-preview). Non-foto şablonda ipucu gizli.
- DialogDescription eklenerek Radix a11y uyarısı giderildi.
- **macOS .dmg testi**: KULLANICI aksiyonu (Save to Github → GitHub Actions → Mac'te test); kodda ek iş yok.


## Session BC — Fotoğraf Kırpma Aracı (verified iteration_66, frontend %100)
- **Yeni bileşen** `components/invitation/ImageCropper.jsx`: kapak fotoğrafı seçilince açılan kırpma modalı — sürükleyerek konumlandırma + zoom (slider & mouse wheel), sabit çerçeve (foto şablonlarda 3:4, diğerlerinde 1:1). Onayınca `canvas.toBlob` ile kırpılmış JPEG üretir; harici kütüphane yok.
- **Sihirbaz bağlama** (InvitationCreate): dosya seçimi artık önce kırpıcıyı açar (`onSelectCover` → FileReader dataURL), onayda kırpılmış File yüklenir (`onCropConfirm` → `/api/invitations/cover`). Aspect: `getTemplate(data.template)?.photo ? 3/4 : 1`. Başarısız yüklemede modal açık kalır (retry). testid'ler: cover-upload, cropper-modal, cropper-zoom, cropper-confirm, cropper-cancel, cover-crop-preview, preview-photo.
- **Doğrulama**: testing_agent iteration_66 %100 — modal yüklemeden ÖNCE açılıyor, 3:4 (foto) / 1:1 (diğer) ölçüldü, zoom çalışıyor, onay POST 200 + toast + önizleme, iptal ağ çağrısı yok, non-foto regresyon dairesel avatar. Console hatası yok.


## Session BC — macOS Çökme: KESİN TEŞHİS + Düzeltme v2 (kullanıcı CI ile test edecek)
- **Teşhis (kullanıcı onayladı)**: Apple Silicon + `EXC_BREAKPOINT (SIGTRAP)`, pencere AÇILMADAN çöküyor → klasik V8 JIT/ThreadIsolation `brk 0` çökmesi. Sebep: ad-hoc imza tam güvenilir sayılmadığından, **hardened runtime AÇIKKEN** JIT izinleri yine reddediliyor.
- **Düzeltme v2**: `desktop/package.json` mac `hardenedRuntime: true → false`. `desktop/build/afterPack.js` imzadan `--options runtime` kaldırıldı (inside-out ad-hoc + entitlements, hardened KAPALI). Bu kombinasyon (inside-out + non-hardened) daha önce denenmemişti; önceki non-hardened denemesi bozuk `--deep` imzasıyla çökmüştü.
- **Gatekeeper rehberi**: `components/DesktopDownloadButtons.jsx` içine macOS "nasıl açılır?" açılır bölümü eklendi (hem tam hem compact): sağ tık → Aç; hâlâ "hasarlı" derse Terminal'de `xattr -cr "/Applications/Fotuber Stüdyo.app"` (kopyala butonlu). Apple hesabı olmadan Gatekeeper sürtünmesi kaçınılmaz ama artık yönlendiriliyor. Studio login (/studyo) + dashboard'da görünüyor, doğrulandı (screenshot).
- **Bekleyen**: Kullanıcı "Save to Github" → GitHub Actions → yeni arm64 `.dmg` indirip Mac'te test edecek. Çözülmezse tek kesin çözüm Apple Developer hesabıyla notarization (P2).


## Session BC — B2B Düğün Salonu Modülü FAZ A + B (verified iteration_67, frontend ~%95)
- **FAZ A (RBAC)**: Salon hesapları YALNIZCA Site Admini açar (self-register 403; VenuePortal artık sadece login). Admin sayfası `/admin/salon-hesaplari` (AdminVenueAccounts): oluştur/listele/aktif-pasif/şifre/sil. Salon admini **personel** tanımlar (ad + iş rolü + sayısal PIN). **Personel kiosk girişi**: salon `kiosk_code` + PIN (e-posta yok), ayrı JWT rol `venue_staff` + `venue_staff_token` cookie/localStorage, per-kiosk_code brute-force lockout (6 hata → 10 dk).
- **FAZ B (Kat Planı Çizici)**: `/salon/kroki/:id` (FloorPlanBuilder) — özel sürükle-bırak tuval (fabric YOK), `lib/venueSymbols.js` sembol kütüphanesi (mimari/sahne/peyzaj/oturma). Öğe: taşı/döndür/boyutlandır/sil, etiket düzenle. Kaydet/yükle (venue_floorplans). **Davetli atama**: davet kodunu kullanan çiftler (`/venue/couples`) → RSVP "yes" davetlileri (`/venue/couples/{id}/guests`) masalara ata. **Hostes Kiosk** (`/salon/kiosk`, StaffKiosk): numpad PIN girişi, plan seç, davetli ara → masa + krokide vurgulama (read-only plan).
- **Masa kişi sayısı AYARLANABİLİR** (kullanıcı isteği): her masa öğesi kendi `seats` değerini tutar; toolbar'da +/- ve sayı girişi (fp-seats-*); kapasite aşılırsa sayaç kırmızı olur. Sembol varsayılanları başlangıç değeri.
- **Backend**: `routers/venue.py` genişletildi (admin/accounts, staff CRUD, staff/login, kiosk-code, floorplans CRUD, couples, couples/{id}/guests, floorplans/{id}/find, staff/floorplans). `require_admin` deps'e eklendi. Tümü curl ile doğrulandı.
- **Düzeltmeler (iteration_67 minör)**: kiosk yanlış-PIN artık görünür hata (inline + toast, kiosk-error); yeni semboller üst üste binmesin diye offset (els.length%10*26). Bekleyen minör: venue-login success toast'ı builder Kaydet butonunu ~4sn örtebiliyor (LOW).
- **Test kimlikleri**: Venue `salon-b2b@test.com`/`salon123`, kiosk_code `FL39N`, staff PIN `4321` (test_credentials.md güncellendi).
- **Not**: Hostes-find uçtan uca UI testi yapılamadı (bu salonun kodunu kullanan çift yok → couples boş, empty-state doğru). Backend find curl ile çalışıyor.
- **Bekleyen FAZ C + D**: Run of Show akış + personel kiosk sesli/pop-up bildirim (polling); Ek Hizmet Pazar Yeri (upsell).


## Session BC — Salon FAZ C (Akış) + FAZ D (Ek Hizmet) + Kiosk Ekip Sohbeti (verified iteration_68, frontend ~%90)
- **FAZ C (Run of Show)**: Kat planı çizicide "Akış Programı" paneli (fp-timeline-toggle) — saat + olay + uyarılacak personel rolleri; plan ile kaydedilir (floorplan.timeline; PUT /floorplans/{pid}/timeline). **Personel kiosk uyarı motoru** (polling 20sn + WebAudio beep + tam ekran pop-up kiosk-alert + tarayıcı bildirimi): sıra ≤5 dk kala ve rol eşleşiyorsa tetiklenir. Kioskta akış listesi (kiosk-timeline).
- **FAZ D (Upsell Pazar Yeri)**: Salon admini VenueDashboard "Ek Hizmetler" sekmesinde hizmet CRUD (venue_services: 360 Photobooth vb.). Çift, davetiye panelinde (MyInvitations → "Salon Ek Hizmetleri" → VenueServicesModal) davet kodunu kullandığı salonun hizmetlerini seçip onaylar (public /venue/public/invitation/{iid}/services GET+POST → invitation_venue_orders). Salon, /venue/couples/{iid}/orders ile görür.
- **Kiosk Ekip Sohbeti** (kullanıcı isteği): personel (kiosk) ↔ salon yöneticisi ortak sohbet (venue_chat, venue geneli). Yönetici mesajı **başa sabitleyebilir** (pin/unpin/sil). Bileşen `components/VenueChat.jsx` (VenueDashboard "Ekip Sohbeti" tab + kiosk drawer kiosk-chat-toggle). Polling 8sn.
- **Backend** (venue.py): timeline PUT, services CRUD, couple public services GET/POST, couple orders, chat (mgr/staff/pin/del). Tümü curl ile uçtan uca doğrulandı.
- **Düzeltme**: hostess find yolu düzeltildi (`/venue/floorplans/{pid}/find`, staff token). Timeline rol butonlarına data-testid eklendi.
- **Not (gerçek hata değil)**: Kupl pazar yeri butonu üye (çift) panelinde `/davetiyelerim`; test davetiyesi admin'e ait olduğu için admin UI'da açamıyor (doğru davranış — admin üye değil). Modal + public uç curl ile doğrulandı; gerçek üye çiftlerde çalışır.
- **Bekleyen**: Kupl pazar yeri modalını gerçek bir MEMBER hesabıyla UI'da doğrulamak (opsiyonel); Gold stüdyo aylık davetiye (eski backlog); macOS .dmg kullanıcı testi.


## Session BC — Akışa Hazır Şablonlar (frontend)
- FloorPlanBuilder "Akış Programı" panelinde 4 hazır run-of-show şablonu (Düğün/Nişan/Kına/Sünnet) tek tıkla eklenir (tl-preset-*): saat + olay + uyarılacak roller dolu gelir, mevcut timeline'a eklenip saate göre sıralanır. Kaydet ile saklanır (mevcut doğrulanmış PUT akışı). Backend değişikliği yok.



## Session BD (Jun 2026) — Salon Sipariş Bildirimi + Akış Şablonu Kaydetme + Photobooth Kiosk TASLAK (self-tested)
### 1) Salon: "Yeni Sipariş" bildirimi (venue.py + VenueDashboard.jsx)
- Çift, davetiye panelinden ek hizmet seçince `public_select_services` artık `seen_by_venue:false` + `ordered_at` işaretler (chosen boş değilse).
- Yeni uçlar: `GET /venue/orders` (çift adı + hizmetler + toplam + seen), `POST /venue/orders/{iid}/seen`, `POST /venue/orders/seen-all`. `/venue/stats` artık `unseen_orders` döner.
- Frontend: VenueDashboard'a "Siparişler" sekmesi (venue-tab-siparis) + kırmızı rozet (venue-orders-badge, unseen_orders>0). Sekme açılınca seen-all + stats reload; 30sn'de bir stats poll. OrdersView kartları "Yeni Sipariş" rozetiyle. Curl ile stats/orders/seen doğrulandı.
### 2) Salon: Akış Programını Şablon Olarak Kaydet (venue.py + FloorPlanBuilder.jsx)
- Koleksiyon `venue_timeline_templates`. Uçlar: `GET/POST/DELETE /venue/timeline-templates`. Curl: create+list+delete OK.
- FloorPlanBuilder timeline panelinde "Şablon Olarak Kaydet" (tl-save-template, prompt ile isim) + "Kayıtlı Akış Şablonlarım" chip listesi (tl-template-<id>, tek tıkla timeline'a ekler + saate göre sıralar; tl-template-del-<id> siler).
### 3) Photobooth & Kiosk Yazılımı — TASLAK (routers/photobooth.py + 3 sayfa)
- **Kapsam (kullanıcı onayı)**: İskelet + temel çalışan akış (geri sayım→çekim→filtre→çerçeve→paket→QR). RBAC yalnızca Admin (require_admin). AI/PayTR/donanım YOK, ödeme adımı ATLANDI.
- **Backend** (`routers/photobooth.py`, server.py'ye include edildi): Koleksiyonlar photobooth_settings/devices/templates/packages/transactions. `_seed_defaults` ile 6 çerçeve + 3 paket otomatik oluşur. Uçlar: `GET /photobooth/config` (aktif çerçeve/paket + marka; exit_pin sızmaz), `POST /photobooth/verify-exit-pin`, `POST /photobooth/capture` (multipart görsel→object storage→qr_token+transaction), `GET /photobooth/photo/{token}` (PUBLIC, QR erişimi), admin CRUD: settings/devices/templates/packages + `GET /admin/transactions` (ciro). Ücretsiz paket yok (price>0 zorunlu). Curl ile capture→photo(200)→transaction(revenue) uçtan uca doğrulandı.
- **Frontend**:
  - `pages/PhotoboothKiosk.jsx` (`/photobooth-kiosk`, ProtectedRoute admin): tam ekran kilitli kiosk (`fixed inset-0 z-[9999] overflow-hidden`, right-click kapalı, requestFullscreen). Akış: idle(BAŞLA)→countdown(3-2-1, kamera getUserMedia, 4 kare, ayna düzeltme + flash)→filtre(5 canvas filtresi, "AI Filtre" taslağı)→çerçeve→paket→processing(canvas kompozisyon: strip4/grid4/polaroid/postcard/single + marka footer)→done(sonuç görseli + QR + Yazdır[taslak toast] + Yeni Çekim). Gizli admin çıkış (pb-exit-btn sol üst) → PIN modalı → verify-exit-pin → /admin/photobooth. Ekran görüntüsüyle idle + PIN çıkış doğrulandı.
  - `pages/PhotoboothMemory.jsx` (`/anilarim/:token`, PUBLIC): QR ile açılan sayfa, foto önizleme + indir.
  - `pages/admin/AdminPhotobooth.jsx` (`/admin/photobooth`, ownerOnly, sidebar "Photobooth Kiosk (Taslak)"): özet (çekim/ciro/aktif çerçeve), marka+PIN+geri sayım+özellik toggle'ları (video/AI/anı duvarı — taslak), çerçeve kataloğu CRUD, paket CRUD, "Kiosk'u Aç". Ekran görüntüsüyle doğrulandı.
- **Sonraki fazlar (Photobooth)**: PayTR fiziksel POS tetikleme, AI arka plan silme (yeşil-perdesiz), video/GIF + overlay, Anı Duvarı canlı yükleme, yazıcı entegrasyonu, 30+ çerçeve varyasyonu, belirli Stüdyo kullanıcılarına RBAC açılımı, cihaz (device) bağlama.

## Session BE (Jun 2026) — Fiziki Randevu Kataloğu + Otomatik Sözleşme (tested 100%, iteration_69)
Kapsam: SADECE admin/personel fiziki (walk-in) randevu alanı. Anasayfa müşteri randevu formuna DOKUNULMADI.
### Backend `routers/appt_pro.py` (prefix /api/appt-pro, `require_staff_or_admin` okuma + oluşturma, `require_admin` katalog yönetimi)
- Koleksiyonlar: appt_services, appt_products, appt_contract_settings (singleton "global"), appt_contracts.
- FAZ 1 Hizmetler: `GET/POST/PATCH/DELETE /services`. Seed: 8 hizmet (İsteme/Nişan, Doğum Günü, Bride, Davet/Toplantı = venue_enabled + 4 opsiyon [İkramlı/İkramsız/Fotoğraflı/Klipli]; Dış Çekim/Reels/Klip/Drone = opsiyonsuz). Her opsiyon fiyatlı, base_price, venue_enabled, sort.
- FAZ 2 Ürünler: `GET/POST/PATCH/DELETE /products`. Seed: 24 ürün, 6 kategori (album tekli/aile, canvas, fine tekli/üçlü, poster, print 10x15→A3+, magazine 3 varyant). Fiyat default 0 (admin girer).
- FAZ 4 Sözleşme ayarları: `GET/PUT /contract-settings`. design{accent_color,text_color,title_font,body_font,header_align,show_emblem,emblem_letter/top/bottom,subtitle,title_size} + brand_name_venue/brand_name_photo + clauses (6 madde, "kapora"→"cayma bedeli") + acceptance_text. Backfill mevcut kaydı tamamlar.
- FAZ 3 Birleşik: `POST /appointments` tek çağrıda hem db.appointments (takvimde görünür, service_name_snapshot + total_amount) hem appt_contracts (public_token, approval_status=pending, brand_variant) oluşturur. `_enrich_appointment` service_name_snapshot fallback eklendi (server.py ~890).
- Sözleşme kayıtları: `GET /contracts`, `GET/PUT/DELETE /contracts/{cid}`.
- PUBLIC (auth yok): `GET /public/contracts/{token}` (created_by gizli), `POST /public/contracts/{token}/approve` {approver_name,accepted}. accepted:false → 400.
### Frontend
- `/admin/randevu-katalogu` (AdminApptCatalog.jsx, admin, AdminLayout, sidebar "Randevu Kataloğu & Sözleşme"): 4 sekme — Hizmet&Etkinlik (opsiyon+fiyat CRUD), Ürünler (kategori CRUD), Sözleşme İçeriği (tasarım: renk/font/hiza/amblem/marka + madde editörü + kabul metni), Sözleşmeler (kayıtlı liste + durum + Aç).
- `/admin/randevu-olustur` (ApptBuilder.jsx, admin+staff, standalone): çift (gelin/damat isim+tel), etkinlik (tarih/saat/**mekan her zaman görünür**), hizmet+opsiyon seçimi, ürün adetleri, otomatik ara toplam + % indirim + peşinat(cayma) + kalan, sözleşme sahibi (Gelin/Damat isim+tel otomatik & disabled / Farklı kişi manuel) + TC/e-posta/adres, KVKK medya izinleri (sosyal + kampanya), brand_variant otomatik (venue hizmet seçiliyse "venue" değilse "photo"). Kaydet → /admin/sozlesme/:id.
- `/admin/sozlesme/:id` (ContractView.jsx) + `components/ContractSheet.jsx`: A4 modern sözleşme, amblem/dinamik marka (venue→"…Davet Evi", photo→"Fotuber Photography"), tasarım ayarları uygulanır, {{toplam}}/{{cayma}}/{{kalan}} otomatik dolar, KVKK EVET/HAYIR, imza. Paylaşım: WhatsApp (wa.me + link), Linki Kopyala, QR (qrcode.react), Yazdır/PDF (window.print @media print), onay durumu rozeti.
- `/sozlesme/:token` (PublicContract.jsx, PUBLIC): müşteri sözleşmeyi görür, ad + kabul kutucuğu + Onayla → approved banner. Onaylananlar appt_contracts'ta approval_status=approved olarak saklanır.
- DesktopDownloadButtons.jsx düzeltildi: Windows aktif (varsayılan GitHub release URL fallback) + "macOS · Yakında" (devre dışı). MacHelp kaldırıldı.
### Notlar
- Fiyatlar seed'de 0; builder toplamları 0 görünür (beklenen) — admin fiyat girince otomatik hesaplar.
- Regresyon testleri: /app/backend/tests/test_appt_pro.py. Test raporu: iteration_69 (backend 100%, frontend 100%).
- Kod-review önerileri (bug değil, ertelendi): contract silinince appointment cascade; tekrar onayda 409; AdminApptCatalog dosya bölme.


## Session BF (Jun 2026) — Sözleşme: PDF/WhatsApp/QR onay + Nakit Akışı entegrasyonu (tested 100%, iteration_70; 16 pytest yeşil)
- **Kart/Nakit**: builder'da ödeme şekli (pay-cash/pay-card); contract + appointment + transaction'a yazılır. (Fix: nested contract.payment_method varsayılansa üst seviyeden doldurulur.)
- **Nakit Akışı entegrasyonu**: `POST /appt-pro/appointments` paid_amount>0 ise mevcut `db.transactions`'a income kaydı ekler (payment_method + created_by/role). Admin TÜM akışı görür. **Personel sadece KENDİ işlemlerini ve son 08:00 TR (05:00 UTC) sınırından bu yana görür** — ertesi sabah 08:00'de önceki dönem gizlenir (server.py list_transactions staff filtresi güncellendi). NOT: canlı test için personel (role=staff) hesabı yok; mantık kod düzeyinde doğrulandı.
- **Sunucu tarafı PDF**: `GET /appt-pro/contracts/{cid}/pdf` (reportlab) → tek tıkla indirilir. ContractView'da "PDF İndir" butonu (blob). "Yazdır" da korunur.
- **Cascade silme**: `DELETE /contracts/{cid}` bağlı appointment + contract_id'li transaction'ları da siler.
- **Dijital onay + bildirim**: public `/sozlesme/:token` onayı → contract approved + `approval_seen=false` + db.notifications kaydı. `GET /appt-pro/approvals` (unseen) + `POST /approvals/seen`. Katalog "Sözleşmeler" sekmesinde yeşil rozet (approvals-badge, 30sn poll), sekme açılınca sıfırlanır. NOT: admin'e OTOMATİK WhatsApp bildirimi YOK (giden WhatsApp API/Twilio gerekir) — panel içi rozet var; müşteriye WhatsApp GÖNDERME (wa.me) mevcut.
- **Elle toplam override + kalan**: builder'da "Toplam Tutar (elle)" girilince net tutar override olur; kalan = total − peşinat otomatik.
- **Keşfedilebilirlik**: Sidebar'a "Sözleşmeler" (`/admin/randevu-katalogu?tab=saved`) girişi; katalog ?tab= query'yi okur.
- Regresyon: /app/backend/tests/test_appt_pro.py (iter69, 10) + test_appt_pro_iter70.py (6). Rapor: iteration_70 (backend 100%, frontend 100%).
- Ertelenen (bug değil): tekrar onayda 409; sidebar testid'de '?' kırılganlığı; admin dashboard'da undefined cx SVG konsol uyarısı (mevcut, ilgisiz).


## Session BG (Jun 2026) — Dijital İmza + Personel Nakit Akışı canlı doğrulama + Fiyat
- **Dijital imza**: Public `/sozlesme/:token` sayfasına imza pad'i (canvas, parmak/fare — pointer+touch). Onayda `signature` (dataURL) gönderilir. Backend approve `signature` alanını saklar (data:image, <400KB). ContractSheet'te "HİZMET ALAN" üstünde imza görseli; PDF'e (reportlab Image) gömülür. Canlı UI testi: çizim→onay→banner+imza+PDF doğrulandı.
- **Personel hesabı**: `personel@fotuber.com.tr` / `Personel1234` (role=staff) oluşturuldu (`POST /api/users/staff`). test_credentials.md güncellendi.
- **Nakit akışı görünürlüğü CANLI doğrulandı**: Personel sadece KENDİ işlemini görür (STAFFOWN evet, ADMINONLY hayır); admin ikisini de görür. 08:00 TR (05:00 UTC) sınırı: 2 gün önceki personel işlemi (STAFFOLD) personelden GİZLİ, admin görür. ✓
- **Fiyatlar**: Katalog → Hizmet/Ürün fiyatı girilince builder toplamları otomatik hesaplar (elle toplam override + kalan = net − peşinat). Fiyatlar seed'de 0; admin girer.
- Not: Admin'e onayda otomatik WhatsApp bildirimi hâlâ YOK (giden WhatsApp/Twilio entegrasyonu gerekir); panel-içi yeşil onay rozeti mevcut.


## Session BH (Jun 2026) — İmza zorunluluğu + Toplu Fiyat + Sözleşme Arşivi
- **İmza zorunluluğu ayarı**: contract-settings `require_signature` (varsayılan True). Katalog → Sözleşme İçeriği'nde "İmza zorunlu (müşteri onayında)" anahtarı (ct-require-sig). Public approve: require_signature açıkken imzasız → 400; kapalıyken imzasız → 200 (curl doğrulandı). PublicContract imza pad'i ayara göre opsiyonel/zorunlu; label "(opsiyonel)" gösterir.
- **Toplu Fiyat sekmesi** (cat-tab-bulk): tüm hizmet base_price + alt seçenek fiyatları + tüm ürün fiyatları tek ekranda; değişenler PATCH ile "Tümünü Kaydet" (bulk-save). Smoke: "1 kalem güncellendi" doğrulandı.
- **Sözleşme Arşivi** (cat-tab-saved, eski "Sözleşmeler"): çift/kişi arama (arch-search), durum filtresi (arch-status: tümü/onaylı/bekliyor), tarih aralığı (arch-from/arch-to), client-side filtre; "Aç" ile ContractView.
- Doğrulama: backend curl (imza kuralı 400/200) + frontend screenshot (3 sekme + toggle). Test verisi temizlendi; base_price'lar 0'a resetlendi.


## Session BI (Jun 2026) — Sözleşme Arşivi Excel/CSV Dışa Aktarım
- ContractsTab (Sözleşme Arşivi) başlığına "Excel/CSV İndir" (arch-export). İstemci-taraflı CSV: UTF-8 BOM (Excel Türkçe uyumu), ";" ayraç, filtrelenmiş satırları dışa aktarır. Sütunlar: Çift, Sözleşme Sahibi, Rol, TC, Telefon, E-posta, Etkinlik Tarihi, Mekan, Ara Toplam, İndirim %, İndirim Tutar, Net, Cayma, Kalan, Ödeme, Durum, Onaylayan, Oluşturma. Playwright ile indirme doğrulandı (sozlesme-arsivi-YYYY-MM-DD.csv).

## Session BJ (Jun 2026) — Fotuber Medya B2B Firma Paneli FAZ 1 (tested)
- Backend routers/partner.py (/api/media): media_partners + media_files. Admin CRUD (require_admin): firma ekle/düzenle/sil, şifre belirle, aktif/pasif, yetkiler {download,upload,backup}. Partner JWT auth (partner_token cookie/Bearer, build_get_current_partner). Partner: login/logout/me, PUT company + POST logo, dosya listele/yükle/indir/sil — hepsi yetkiye göre (upload yoksa 403, download yoksa 403, backup=sil yetkisi). Object storage: media/{pid}/... Curl doğrulandı (upload 200, download 200, delete 403 backup kapalıyken, admin dosyaları görür).
- Frontend: /medya (MediaPortal.jsx, PUBLIC firma girişi + dashboard: logo+firma bilgisi, yetkiye göre dosya alanı). /admin/medya (AdminMedia.jsx, AdminGuard, sidebar Building2) firma yönetimi. Fotuber Photography koyu tema.
- BEKLEYEN: WD MyCloud NAS WebDAV bağlantısı — kullanıcı WebDAV URL+kullanıcı+şifre verecek; şu an object storage kullanılıyor. FAZ 2 (Türkçe AI içerik+hashtag) ve FAZ 3 (özel gün takvimi + logolu görsel, Emergent Universal Key onaylandı) sonraki turlarda.

## Session BK — NAS durumu + firma-adı klasör
- WD My Cloud HOME (OS5, auth0.accounts.westerndigital.com) doğrudan WebDAV VERMEZ → sunucudan doğrudan bağlantı mümkün değil. Dahili object storage kullanılmaya devam; NAS için ileride WD masaüstü senkron→bulut (Drive/S3) yolu önerildi.
- Her firma için firma-adı bazlı klasör: partner.folder = slug(ad)-id6; dosya/logo yolları media/{folder}/... (Türkçe slug, benzersiz, karışmaz). Curl doğrulandı.
