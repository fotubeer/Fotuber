// electron-builder afterPack hook — macOS ad-hoc (sertifikasız) imzalama.
//
// KÖK NEDEN (önceki çökme): imzalama --entitlements ve --options runtime OLMADAN
// yapılıyordu; bu yüzden entitlements.mac.plist içindeki JIT / executable-memory
// izinleri Apple Silicon'a UYGULANMIYOR ve V8 motoru açılışta EXC_BREAKPOINT
// (SIGTRAP) ile çöküyordu.
//
// ÇÖZÜM (güncel): hardened runtime KAPALI. Ad-hoc imza tam güvenilir sayılmadığı
// için hardened runtime açıkken JIT yine engellenip V8 çöküyordu. Hardened runtime'ı
// kapatıp tüm iç bileşenleri (frameworks, dylib, Helper .app'ler) ÖNCE, ana .app'i
// EN SON olacak şekilde (inside-out) ad-hoc + entitlements ile imzalıyoruz.
const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const ent = path.join(__dirname, "entitlements.mac.plist");

  const sign = (target) => {
    execFileSync(
      "codesign",
      [
        "--force",
        "--timestamp=none",
        "--entitlements", ent,
        "--sign", "-",
        target,
      ],
      { stdio: "inherit" }
    );
  };

  // İç bileşenleri derinlemesine topla (inside-out imzalamak için).
  const targets = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      let stat;
      try { stat = fs.lstatSync(full); } catch { continue; }
      if (stat.isSymbolicLink()) continue;
      if (name.endsWith(".app") || name.endsWith(".framework")) {
        // Önce içine gir (daha derin bileşenler önce imzalanmalı), sonra kendisini ekle.
        walk(full);
        targets.push(full);
      } else if (name.endsWith(".dylib") || name.endsWith(".node")) {
        targets.push(full);
      } else if (stat.isDirectory()) {
        walk(full);
      }
    }
  };

  try {
    walk(path.join(appPath, "Contents", "Frameworks"));
    // İç bileşenler (en derin → en sığ), sonra ana uygulama.
    for (const t of targets) sign(t);
    sign(appPath);
    console.log(`[afterPack] Ad-hoc (hardened runtime KAPALI + entitlements, inside-out) imzalandı: ${appPath}`);
    // Doğrulama (bilgi amaçlı; hata verse de build'i kırma).
    try {
      execFileSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath], { stdio: "inherit" });
    } catch (v) {
      console.warn(`[afterPack] Doğrulama uyarısı (kritik değil): ${v.message}`);
    }
  } catch (e) {
    console.warn(`[afterPack] Ad-hoc imzalama başarısız (kritik değil): ${e.message}`);
  }
};
