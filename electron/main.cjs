// Electron main process.
//
// - Grants the microphone permission (Chromium blocks getUserMedia otherwise).
// - In a PACKAGED build, auto-starts the bundled backend if it's present
//   (resources/backend/aida-backend[.exe]); in dev you run uvicorn yourself.
const { app, BrowserWindow, session } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const isDev = !!process.env.ELECTRON_START_URL;
let backendProc = null;

function startBackend() {
  // Only relevant for a packaged app that ships a PyInstaller backend exe.
  if (isDev || !app.isPackaged) return;
  const exe = process.platform === "win32" ? "aida-backend.exe" : "aida-backend";
  const exePath = path.join(process.resourcesPath, "backend", exe);
  if (!fs.existsSync(exePath)) return; // not bundled -> assume backend runs separately
  backendProc = spawn(exePath, [], {
    cwd: path.dirname(exePath),
    windowsHide: true,
  });
  backendProc.on("error", (e) => console.error("backend failed to start:", e));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#04070a",
    title: "A.I.D.A",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
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

  startBackend();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Make sure the bundled backend doesn't outlive the app.
app.on("before-quit", () => {
  if (backendProc) {
    try {
      backendProc.kill();
    } catch {
      /* ignore */
    }
  }
});