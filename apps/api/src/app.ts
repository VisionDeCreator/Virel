import {
  requestEmailOtp,
  readEmailRequest,
  authClientAddress,
} from "./services/authEmail";
import { Elysia } from "elysia";
import { ConvexHttpClient } from "convex/browser";
import { v } from "convex/values";
import { api } from "@virel/backend";
import { services } from "./registry";
import { createContext } from "./runtime/context";
import { validateArgs } from "./runtime/validation";
import { publishedUrl } from "./services/mediaDelivery";
export function createApp(
  config: { convexUrl?: string; webOrigins?: string[] } = {},
) {
  async function authenticate(request: Request) {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ") || !authorization.slice(7).trim())
      throw new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
      });
    if (!config.convexUrl)
      throw new Response(
        JSON.stringify({ error: "Backend is not configured" }),
        { status: 503 },
      );
    const client = new ConvexHttpClient(config.convexUrl);
    client.setAuth(authorization.slice(7));
    try {
      const identity = await client.query(api.serviceAuth.identity, {});
      if (!identity) throw new Error("Invalid session");
      return { client, identity };
    } catch {
      throw new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
      });
    }
  }
  return new Elysia()
    .onRequest(({ request, set }) => {
      const origin = request.headers.get("origin");
      if (origin && config.webOrigins?.includes(origin)) {
        set.headers["Access-Control-Allow-Origin"] = origin;
        set.headers["Vary"] = "Origin";
        set.headers["Access-Control-Allow-Headers"] =
          "Authorization, Content-Type";
        set.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
      }
      if (request.method === "OPTIONS")
        return new Response(null, {
          status: 204,
          headers: set.headers as HeadersInit,
        });
    })
    .post(
      "/auth/email/request",
      async ({ request, server }) => {
        const origin = request.headers.get("origin");
        if (origin && !(config.webOrigins ?? []).includes(origin))
          return Response.json(
            { message: "Origin not allowed" },
            { status: 403, headers: { "Cache-Control": "no-store" } },
          );
        let email: unknown;
        try {
          email = await readEmailRequest(request);
        } catch {
          return Response.json(
            { message: "Enter a valid email address." },
            { status: 400, headers: { "Cache-Control": "no-store" } },
          );
        }
        return requestEmailOtp(
          createContext(),
          email,
          authClientAddress(
            request,
            server?.requestIP(request)?.address ?? "unknown",
          ),
        );
      },
      { parse: "none" },
    )
    .get("/health", () => ({ service: "virel-api", status: "ok" }))
    .get("/v1/me", async ({ request }) => {
      try {
        const { client } = await authenticate(request);
        return { profile: await client.query(api.profiles.me, {}) };
      } catch (error) {
        if (error instanceof Response) return error;
        return new Response(null, { status: 503 });
      }
    })
    .post("/v1/studio/:operation", async ({ request, params, body, set }) => {
      set.headers["Cache-Control"] = "no-store";
      try {
        const { client, identity } = await authenticate(request);
        const operation = params.operation;
        if (Object.hasOwn(services, operation)) {
          const service = services[operation as keyof typeof services];
          try {
            validateArgs(service.args, body);
          } catch {
            set.status = 400;
            return { error: "Invalid Studio request." };
          }
          return {
            value: await service.handler(
              createContext(identity),
              body as never,
            ),
          };
        }
        const mutations = {
          "generation:start": {
            ref: api.generation.start,
            args: { quoteId: v.id("generationQuotes"), requestId: v.string() },
          },
          "generation:resume": {
            ref: api.generation.resume,
            args: { jobId: v.id("generationJobs") },
          },
          "generation:unpublish": {
            ref: api.generation.unpublish,
            args: { jobId: v.id("generationJobs") },
          },
        };
        if (!Object.hasOwn(mutations, operation)) {
          set.status = 404;
          return { error: "Unknown Studio operation." };
        }
        const mutation = mutations[operation as keyof typeof mutations];
        try {
          validateArgs(mutation.args, body);
        } catch {
          set.status = 400;
          return { error: "Invalid Studio request." };
        }
        return { value: await client.mutation(mutation.ref, body as never) };
      } catch (error) {
        if (error instanceof Response) return error;
        // Do not expose stack traces, signed URLs, credentials, or upstream response bodies.
        const text =
          error instanceof Error
            ? error.message
                .replace(/^[\s\S]*Uncaught Error: /, "")
                .split("\n")[0]
            : "";
        const safe =
          /^(Choose |Use |Wait |Upload |File |Image |Media |Source |This |That |Check |Quote |Credit |Not enough |Too many |Reference |Script |Invalid |Create your |Result |Remove |The provider could not verify|Generation pricing |Rendering provider is not configured|R2 storage is not configured|API backend credentials are not configured|Public API URL is not configured)/.test(
            text,
          );
        set.status = safe ? 400 : 503;
        return {
          error: safe
            ? text
            : "Studio service is temporarily unavailable. Try again.",
        };
      }
    })
    .get("/media/:videoId", async ({ params, set }) => {
      set.headers["Cache-Control"] = "no-store";
      set.headers["Access-Control-Allow-Origin"] = "*";
      try {
        const url = await publishedUrl.handler(createContext(), {
          videoId: params.videoId,
        });
        if (!url) return new Response("Video unavailable", { status: 404 });
        return new Response(null, {
          status: 307,
          headers: {
            Location: url,
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch {
        return new Response("Playback temporarily unavailable", {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        });
      }
    });
}
