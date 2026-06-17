import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const apiUrl =
    process.env.VITE_API_URL ||   
    fileEnv.VITE_API_URL ||       
    "http://127.0.0.1:8000/api"; 

  return {
    plugins: [react()],
    base: "./",
    server: { port: 5173, strictPort: false },
    build:  { outDir: "dist" },
    define: {
      "import.meta.env.VITE_API_URL": JSON.stringify(apiUrl),
    },
  };
});