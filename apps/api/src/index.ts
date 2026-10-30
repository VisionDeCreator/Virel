import { createApp } from "./app";
const port = Number(Bun.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be between 1 and 65535");
createApp({ convexUrl: Bun.env.CONVEX_URL }).listen({
  port,
  hostname: Bun.env.HOST ?? "127.0.0.1",
});
console.log(`Virel API listening on port ${port}`);
