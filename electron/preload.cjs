const { contextBridge } = require("electron");

// __VITE_API_URL__ is replaced by the build:inject script below.
// It will be the literal value of VITE_API_URL from the .env at build time.
const apiBase = process.env.AIDA_API_URL || "http://127.0.0.1:8000/api";

contextBridge.exposeInMainWorld("avatar", {
  apiBase,
  platform: process.platform,
});