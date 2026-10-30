import { Elysia } from "elysia";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@virel/backend";
export function createApp(config: { convexUrl?: string } = {}) {
  return new Elysia()
    .get("/health", () => ({ service: "virel-api", status: "ok" }))
    .get("/v1/me", async ({ request, set }) => {
      const authorization = request.headers.get("authorization");
      if (
        !authorization?.startsWith("Bearer ") ||
        !authorization.slice(7).trim()
      ) {
        set.status = 401;
        return { error: "Authentication required" };
      }
      if (!config.convexUrl) {
        set.status = 503;
        return { error: "Backend is not configured" };
      }
      // Per-request clients prevent credentials leaking between concurrent users.
      const client = new ConvexHttpClient(config.convexUrl);
      client.setAuth(authorization.slice(7));
      try {
        const authenticated = await client.query(api.auth.isAuthenticated, {});
        if (!authenticated) {
          set.status = 401;
          return { error: "Invalid session" };
        }
        return { profile: await client.query(api.profiles.me, {}) };
      } catch {
        set.status = 401;
        return { error: "Unable to verify session" };
      }
    });
}
