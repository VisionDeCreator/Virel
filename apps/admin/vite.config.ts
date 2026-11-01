import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  cacheDir: process.env.VIREL_VITE_CACHE_DIR ?? "node_modules/.vite",
  // Linked workspace packages must share the renderer's React instance.
  resolve: { dedupe: ["react", "react-dom"] },
  plugins: [react(), tailwindcss()],
  server: { strictPort: true },
});
