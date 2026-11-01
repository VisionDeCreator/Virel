import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/admin-runtime",
  use: {
    baseURL: "http://127.0.0.1:5196",
    channel: process.env.PLAYWRIGHT_CHANNEL,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: "bun run --cwd apps/admin dev --host 127.0.0.1 --port 5196",
    url: "http://127.0.0.1:5196",
    reuseExistingServer: false,
    env: {
      VIREL_VITE_CACHE_DIR: "node_modules/.vite-admin-runtime",
      VITE_CONVEX_URL: "https://fixture.convex.cloud",
      VITE_API_URL: "http://127.0.0.1:3101",
    },
  },
});
