import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 5173);

export default defineConfig({
  testDir: "./tests/web",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: process.env.PLAYWRIGHT_CHANNEL,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile-web",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: `bun run dev:web --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    env: { VITE_CONVEX_URL: "" },
    reuseExistingServer: false,
  },
});
