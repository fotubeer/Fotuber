// Fotuber Stüdyo masaüstü uygulaması yapılandırması.
// CANLIYA ALIRKEN: aşağıdaki APP_URL değerini kendi PRODUCTION alan adınızla değiştirin
// (örn. "https://panel.fotuber.com.tr"). İsterseniz FOTUBER_APP_URL ortam değişkeni ile de geçebilirsiniz.
const DEFAULT_APP_URL = "https://fotuber-photo-repair.preview.emergentagent.com";

module.exports = {
  // Uygulama açıldığında yüklenecek adres (Stüdyo giriş/panel).
  APP_URL: (process.env.FOTUBER_APP_URL || DEFAULT_APP_URL).replace(/\/$/, "") + "/studyo",
  // Pencerenin kalması gereken origin(ler); bu origin dışına gidilirse harici tarayıcıda açılır.
  ALLOWED_ORIGIN: (process.env.FOTUBER_APP_URL || DEFAULT_APP_URL).replace(/^https?:\/\//, "").replace(/\/$/, ""),
  WINDOW: { width: 1440, height: 900, minWidth: 1024, minHeight: 700 },
};
