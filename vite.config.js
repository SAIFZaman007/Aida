import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" so the production build also works when Electron loads it from
// disk via file:// instead of a dev server.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 5173, strictPort: false },
  build: { outDir: "dist" },
});