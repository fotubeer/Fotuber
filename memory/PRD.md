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

## Admin
- admin@fotuber.com.tr / FTB.2024

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

