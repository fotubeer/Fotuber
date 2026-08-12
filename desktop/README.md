# Fotuber Stüdyo — Masaüstü Uygulaması (Windows & macOS)

Bu klasör, mevcut **Stüdyo Panelini** Windows ve macOS için bir masaüstü
uygulamasına dönüştüren [Electron](https://www.electronjs.org/) sarmalayıcısıdır.
Uygulama, web panelini bir masaüstü penceresinde açar; tek örnek çalışır, harici
linkleri (WhatsApp, PayTR ödeme sayfası vb.) sistem tarayıcısında açar ve Türkçe menü sunar.

> Not: Bu paket web uygulamasını yeniden yazmaz; canlı paneli sarmalar. Panelde yaptığınız
> her güncelleme masaüstü uygulamasına da anında yansır (ayrı sürüm gerekmez).

## 1) Yapılandırma (ÖNEMLİ)
`config.js` içindeki `DEFAULT_APP_URL` değerini **kendi production alan adınızla** değiştirin:

```js
const DEFAULT_APP_URL = "https://panel.fotuber.com.tr"; // örnek
```
Alternatif olarak derleme/çalıştırma sırasında ortam değişkeni geçebilirsiniz:
```bash
FOTUBER_APP_URL="https://panel.fotuber.com.tr" yarn start
```
Uygulama `${APP_URL}/studyo` adresini açar.

## 2) İkonlar
`assets/` klasörüne şu ikonları koyun (kendi logonuzla):
- `assets/icon.ico`  → Windows (256×256 içeren .ico)
- `assets/icon.icns` → macOS
- `assets/icon.png`  → Linux/genel (512×512)

## 3) Geliştirme (uygulamayı çalıştır)
```bash
cd desktop
yarn install
yarn start
```

## 4) Kurulum paketi üretme (installer)
> Windows `.exe` (NSIS) yalnızca Windows'ta, macOS `.dmg` yalnızca macOS'ta derlenir.
> Kod imzalama (code signing) production dağıtımı için önerilir.

```bash
# Windows'ta:
yarn dist:win     # release/ altında Fotuber Stüdyo Setup x.y.z.exe

# macOS'ta:
yarn dist:mac     # release/ altında Fotuber Stüdyo-x.y.z.dmg
```

## Neden container içinde derlenmedi?
Bu geliştirme ortamı başsız (GUI yok) bir Linux container'ıdır; Electron penceresi açılamaz
ve platforma özel installer (özellikle imzalı macOS `.dmg`) burada üretilemez. Yukarıdaki
adımlarla kendi Windows/macOS makinenizde (veya bir CI runner'ında) derleyin.
