// electron-builder afterPack hook: macOS uygulamasını ad-hoc (sertifikasız) imzalar.
// Bu, Apple Silicon'da imzasız uygulamalardaki "bozuk / kötü amaçlı yazılım" hatasını
// giderir; kullanıcı yine de ilk açılışta "sağ tık → Aç" yapmalıdır (Apple notarization
// olmadığı için "bilinmeyen geliştirici" uyarısı normaldir).
const { execSync } = require("child_process");
const path = require("path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  try {
    execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: "inherit" });
    console.log(`[afterPack] Ad-hoc imzalandı: ${appPath}`);
  } catch (e) {
    console.warn(`[afterPack] Ad-hoc imzalama başarısız (kritik değil): ${e.message}`);
  }
};
