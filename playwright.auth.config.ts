import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Live tests create clearly labeled test accounts on the selected dev deployment.
// Never run this suite against production or capture credential-bearing traces.
const configuration = readFileSync("packages/backend/.env.local", "utf8");
if (!/^CONVEX_DEPLOYMENT=dev:/m.test(configuration)) {
  throw new Error(
    "Live auth tests require an explicitly configured development deployment.",
  );
}
const convexUrl = configuration
  .match(/^(?:VITE_)?CONVEX_URL=(.+)$/m)?.[1]
  ?.trim();
if (!convexUrl || !/^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(convexUrl)) {
  throw new Error("A Convex cloud development URL is required.");
}
export default defineConfig({
  testDir: "./tests/auth",
  timeout: 150_000,
  workers: 1,
  retries: 0,
  expect: { timeout: 20_000 },
  use: {
    ...devices["Desktop Chrome"],
    channel: process.env.PLAYWRIGHT_CHANNEL,
    baseURL: "http://localhost:5190",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: [
    {
      command: "bun run dev:web --host localhost --port 5190 --strictPort",
      url: "http://localhost:5190",
      env: {
        VITE_CONVEX_URL: convexUrl,
        VITE_API_URL: "http://127.0.0.1:3190",
      },
      reuseExistingServer: false,
    },
    {
      command: "bun --no-env-file apps/api/test/auth-server.ts",
      url: "http://127.0.0.1:3190/health",
      env: { PORT: "3190", HOST: "127.0.0.1", CONVEX_URL: convexUrl },
      reuseExistingServer: false,
    },
  ],
});
