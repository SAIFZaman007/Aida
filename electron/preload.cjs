// Preload runs in an isolated context. We expose only what the UI needs.
// The backend base URL lives here so the renderer never hardcodes it.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("avatar", {
  apiBase: "http://127.0.0.1:8000/api",
  platform: process.platform,
});