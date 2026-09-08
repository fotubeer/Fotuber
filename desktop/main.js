const { app, BrowserWindow, shell, Menu, dialog, session } = require("electron");
const path = require("path");
const config = require("./config");

let mainWindow = null;

// Tek örnek (aynı anda birden fazla pencere açılmasını engelle)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: config.WINDOW.width,
    height: config.WINDOW.height,
    minWidth: config.WINDOW.minWidth,
    minHeight: config.WINDOW.minHeight,
    backgroundColor: "#0a0a0a",
    title: "Fotuber Stüdyo",
    icon: path.join(__dirname, "assets", process.platform === "win32" ? "icon.ico" : "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      // Kalıcı oturum: giriş yapan firma/şahıs uygulamayı kapatıp açsa da oturumu açık kalır
      // (localStorage + çerezler diske yazılır).
      partition: "persist:fotuber",
    },
  });

  mainWindow.loadURL(config.APP_URL);

  // Uygulama dışı linkleri (target=_blank vb.) sistem tarayıcısında aç
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Navigasyon kilidi: uygulama YALNIZCA Stüdyo Paneli'nde kalır.
  // - Farklı origin (WhatsApp, PayTR vb.) → sistem tarayıcısında açılır.
  // - Aynı origin ama /studyo dışı bir yol → engellenir, /studyo'ya döner.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const u = new URL(url);
      if (u.host !== config.ALLOWED_ORIGIN) {
        event.preventDefault();
        shell.openExternal(url);
        return;
      }
      if (!u.pathname.startsWith("/studyo")) {
        event.preventDefault();
        mainWindow.loadURL(config.APP_URL);
      }
    } catch (_) { /* noop */ }
  });

  mainWindow.webContents.on("did-fail-load", (_e, code, desc) => {
    if (code === -3) return; // aborted (normal)
    dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "Bağlantı sorunu",
      message: "Fotuber Stüdyo paneline ulaşılamadı.",
      detail: `İnternet bağlantınızı kontrol edip tekrar deneyin.\n(${desc})`,
      buttons: ["Yeniden Dene", "Kapat"],
    }).then((r) => { if (r.response === 0) mainWindow.reload(); });
  });

  mainWindow.on("closed", () => { mainWindow = null; });
}

function buildMenu() {
  const template = [
    {
      label: "Fotuber",
      submenu: [
        { label: "Yeniden Yükle", accelerator: "CmdOrCtrl+R", click: () => mainWindow && mainWindow.reload() },
        { label: "Geri", accelerator: "Alt+Left", click: () => mainWindow && mainWindow.webContents.canGoBack() && mainWindow.webContents.goBack() },
        { label: "İleri", accelerator: "Alt+Right", click: () => mainWindow && mainWindow.webContents.canGoForward() && mainWindow.webContents.goForward() },
        { type: "separator" },
        {
          label: "Oturumu Sıfırla (Çıkış)",
          click: async () => {
            const r = await dialog.showMessageBox(mainWindow, {
              type: "question", buttons: ["Vazgeç", "Oturumu Kapat"], defaultId: 1, cancelId: 0,
              title: "Oturumu Sıfırla",
              message: "Kayıtlı oturum silinsin mi?",
              detail: "Bu işlem sizi uygulamadan çıkarır; başka bir firma/şahıs hesabıyla giriş yapabilirsiniz.",
            });
            if (r.response === 1 && mainWindow) {
              await session.fromPartition("persist:fotuber").clearStorageData();
              mainWindow.loadURL(config.APP_URL);
            }
          },
        },
        { type: "separator" },
        { role: "quit", label: "Çıkış" },
      ],
    },
    { label: "Düzen", submenu: [{ role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    {
      label: "Görünüm",
      submenu: [
        { role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" },
        { type: "separator" }, { role: "togglefullscreen", label: "Tam Ekran" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
