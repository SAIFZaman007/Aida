// Electron main process.

const { app, BrowserWindow, session } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const isDev = !!process.env.ELECTRON_START_URL;
let backendProc = null;

// Expose the API URL to the preload script via process.env so preload.cjs
// can bridge it into the renderer without nodeIntegration.
// Priority: env var set by user → default localhost.
process.env.AIDA_API_URL =
  process.env.AIDA_API_URL || "http://127.0.0.1:8000/api";

function startBackend() {
  if (isDev || !app.isPackaged) return;
  const exe = process.platform === "win32" ? "aida-backend.exe" : "aida-backend";
  const exePath = path.join(process.resourcesPath, "backend", exe);
  if (!fs.existsSync(exePath)) return;
  backendProc = spawn(exePath, [], {
    cwd: path.dirname(exePath),
    windowsHide: true,
    env: { ...process.env },
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

  startBackend();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (backendProc) {
    try { backendProc.kill(); } catch { /* ignore */ }
  }
});