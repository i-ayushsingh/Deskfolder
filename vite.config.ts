import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite config tuned for Tauri v2.
// - clearScreen false: keep Rust panic output visible
// - server.host / strictPort: fixed port so Tauri can find the dev server
// - envPrefix: expose TAURI_ vars to frontend
// - server.watch.ignored: don't reload when Rust source changes
export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
    hmr: {
      protocol: "ws",
      host: "127.0.0.1",
      port: 1421,
    },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
  },
}));
