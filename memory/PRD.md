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
