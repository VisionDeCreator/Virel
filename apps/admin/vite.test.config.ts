import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  cacheDir: "node_modules/.vite-admin-fixtures",
  plugins: [react()],
  define: {
    "import.meta.env.VITE_CONVEX_URL": JSON.stringify(
      "https://fixture.convex.cloud",
    ),
  },
  resolve: {
    alias: [
      {
        find: /^@virel\/api-client$/,
        replacement: fileURLToPath(
          new URL("./test/api-client.tsx", import.meta.url),
        ),
      },
      {
        find: /^@virel\/api-client\/provider$/,
        replacement: fileURLToPath(
          new URL("./test/provider.tsx", import.meta.url),
        ),
      },
    ],
  },
});
