import { storage } from "./services/r2";
import { providerConfig } from "./services/sume";
import { adminClient } from "./runtime/context";
import { loadRootEnvironment } from "./runtime/env";
import { createApp } from "./app";
loadRootEnvironment();
// Fail clearly at startup instead of serving an unusable Studio integration.
adminClient();
storage();
providerConfig();
if (!process.env.API_PUBLIC_URL) throw new Error("API_PUBLIC_URL is required.");
const port = Number(Bun.env.PORT ?? 3101);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be between 1 and 65535");
createApp({
  convexUrl: Bun.env.CONVEX_URL,
  webOrigins: (Bun.env.STUDIO_WEB_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((value) => value.trim()),
}).listen({
  port,
  hostname: Bun.env.HOST ?? "127.0.0.1",
});
console.log(`Virel API listening on port ${port}`);
