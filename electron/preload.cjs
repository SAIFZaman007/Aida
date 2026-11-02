const { contextBridge, ipcRenderer } = require("electron");

// __VITE_API_URL__ is replaced by the build:inject script below.
// It will be the literal value of VITE_API_URL from the .env at build time.
const apiBase = process.env.AIDA_API_URL || "http://127.0.0.1:8000/api";

// Window buttons for the frameless desktop window (see components/WindowControls.jsx).
// `win` is only offered while the app draws its own title bar.
const win =
  process.env.AIDA_CUSTOM_FRAME === "1"
    ? {
        minimize: () => ipcRenderer.send("win:minimize"),
        toggleMaximize: () => ipcRenderer.send("win:toggle-maximize"),
        close: () => ipcRenderer.send("win:close"),
        isMaximized: () => ipcRenderer.invoke("win:is-maximized"),
        onMaximizeChange: (cb) => {
          const h = (_e, v) => cb(v);
          ipcRenderer.on("win:maximized", h);
          return () => ipcRenderer.removeListener("win:maximized", h);
        },
      }
    : null;

contextBridge.exposeInMainWorld("avatar", {
  apiBase,
  platform: process.platform,
  win,
});