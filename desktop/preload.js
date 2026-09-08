const { contextBridge } = require("electron");

// Web tarafına güvenli, minimal bir köprü. Uygulamanın masaüstünde çalıştığını
// (örn. "Masaüstü Uygulaması" rozeti göstermek için) anlamak isterseniz kullanılabilir.
contextBridge.exposeInMainWorld("fotuberDesktop", {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,
});
