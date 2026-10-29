// Electron main process.

const { app, BrowserWindow, session } = require("electron");
const path = require("path");

const isDev = !!process.env.ELECTRON_START_URL;

// Expose the API URL to the preload script via process.env so preload.cjs
// can bridge it into the renderer without nodeIntegration.
// Priority: env var set by user → default localhost. In production set
// AIDA_API_URL to the deployed backend (the backend runs in the cloud; this
// app no longer bundles or spawns a local one).
process.env.AIDA_API_URL =
  process.env.AIDA_API_URL || "http://127.0.0.1:8000/api";

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#04070a",
    title: "A.I.D.A",
    // Window / taskbar icon (installers use build/icon.*; this covers dev runs and Linux).
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // Pass AIDA_API_URL into the preload's process.env
      additionalArguments: [],
    },
  });

  if (isDev) {
    win.loadURL(process.env.ELECTRON_START_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "media" || permission === "microphone");
  });
  ses.setPermissionCheckHandler(
    (_wc, permission) => permission === "media" || permission === "microphone",
  );

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
