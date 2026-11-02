// Electron main process.

const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");

const isDev = !!process.env.ELECTRON_START_URL;

// Expose the API URL to the preload script via process.env so preload.cjs
// can bridge it into the renderer without nodeIntegration.
// Priority: env var set by user → default localhost. In production set
// AIDA_API_URL to the deployed backend (the backend runs in the cloud; this
// app no longer bundles or spawns a local one).
process.env.AIDA_API_URL =
  process.env.AIDA_API_URL || "http://127.0.0.1:8000/api";

// The window has no native title bar: the app draws its own minimise / maximise / close
// buttons (components/WindowControls.jsx). Set AIDA_NATIVE_FRAME=1 to get the native frame back.
const customFrame = process.env.AIDA_NATIVE_FRAME !== "1";
process.env.AIDA_CUSTOM_FRAME = customFrame ? "1" : "";

function createWindow() {
  const win = new BrowserWindow({
    frame: !customFrame,
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#060818",
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

  // Window buttons <-> the renderer (only the window that asked is touched).
  const send = () => win.isDestroyed() || win.webContents.send("win:maximized", win.isMaximized());
  win.on("maximize", send);
  win.on("unmaximize", send);

  if (isDev) {
    win.loadURL(process.env.ELECTRON_START_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

const fromEvent = (e) => BrowserWindow.fromWebContents(e.sender);
ipcMain.on("win:minimize", (e) => fromEvent(e)?.minimize());
ipcMain.on("win:toggle-maximize", (e) => {
  const w = fromEvent(e);
  if (w) (w.isMaximized() ? w.unmaximize() : w.maximize());
});
ipcMain.on("win:close", (e) => fromEvent(e)?.close());
ipcMain.handle("win:is-maximized", (e) => !!fromEvent(e)?.isMaximized());

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
