// electron-builder afterPack hook: macOS uygulamasını ad-hoc (sertifikasız) imzalar.
// V8 JIT ve kütüphane yüklemesi için gerekli entitlements + hardened runtime ile imzalanır;
// böylece uygulama Apple Silicon'da "bozuk" hatası vermeden ve çökmeden açılır.
// (Apple notarization olmadığı için ilk açılışta "bilinmeyen geliştirici" → sağ tık → Aç normaldir.)
const { execSync } = require("child_process");
const path = require("path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const ent = path.join(__dirname, "entitlements.mac.plist");
  try {
    execSync(
      `codesign --force --deep --timestamp=none --options runtime --entitlements "${ent}" -s - "${appPath}"`,
      { stdio: "inherit" }
    );
    console.log(`[afterPack] Ad-hoc (hardened+entitlements) imzalandı: ${appPath}`);
  } catch (e) {
    console.warn(`[afterPack] Ad-hoc imzalama başarısız (kritik değil): ${e.message}`);
  }
};
