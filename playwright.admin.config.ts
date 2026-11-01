import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/admin",
  use: {
    baseURL: "http://127.0.0.1:5194",
    channel: process.env.PLAYWRIGHT_CHANNEL,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command:
      "bun run --cwd apps/admin dev --config vite.test.config.ts --host 127.0.0.1 --port 5194",
    url: "http://127.0.0.1:5194",
    reuseExistingServer: false,
  },
});
