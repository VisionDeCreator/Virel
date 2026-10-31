import { afterEach, expect, test, vi } from "vitest";
import { ConvexHttpClient } from "convex/browser";
import { createApp } from "../src/app";
import { validateArgs } from "../src/runtime/validation";
import { services } from "../src/registry";
import { v } from "convex/values";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const url = "https://example.convex.cloud";
function request(operation: string, body: unknown, token = "test-token") {
  return new Request(
    `http://localhost/v1/studio/${encodeURIComponent(operation)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    },
  );
}
test("Studio operations reject anonymous requests and never expose internal worker services", async () => {
  const app = createApp({ convexUrl: url });
  const anonymous = await app.handle(
    new Request("http://localhost/v1/studio/mediaActions:beginUpload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
  );
  expect(anonymous.status).toBe(401);
  vi.spyOn(ConvexHttpClient.prototype, "query").mockResolvedValue({
    subject: "user|session",
    issuer: url,
    tokenIdentifier: "issuer|user",
  });
  const internal = await app.handle(
    request("generationActions:submit", { jobId: "job" }),
  );
  expect(internal.status).toBe(404);
});
test("API rejects malformed arguments and extra identity fields before privileged access", async () => {
  vi.spyOn(ConvexHttpClient.prototype, "query").mockResolvedValue({
    subject: "user|session",
    issuer: url,
    tokenIdentifier: "issuer|user",
  });
  const mutation = vi.spyOn(ConvexHttpClient.prototype, "mutation");
  const app = createApp({ convexUrl: url });
  const response = await app.handle(
    request("mediaActions:beginUpload", {
      name: "clip.mp4",
      contentType: "video/mp4",
      bytes: 100,
      userId: "victim",
    }),
  );
  expect(response.status).toBe(400);
  expect(mutation).not.toHaveBeenCalled();
});
test("service validation covers nested optional input fields and rejects invalid unions", () => {
  const fields = {
    mode: v.union(v.literal("create"), v.literal("remix")),
    config: v.object({
      duration: v.number(),
      optional: v.optional(v.string()),
    }),
  };
  expect(() =>
    validateArgs(fields, { mode: "create", config: { duration: 15 } }),
  ).not.toThrow();
  expect(() =>
    validateArgs(fields, { mode: "other", config: { duration: 15 } }),
  ).toThrow();
  expect(() =>
    validateArgs(services["mediaActions:beginUpload"].args, {
      name: "clip",
      contentType: "video/mp4",
      bytes: "100",
    }),
  ).toThrow();
});
test("CORS only permits configured browser origins", async () => {
  const app = createApp({ webOrigins: ["http://localhost:5175"] });
  const allowed = await app.handle(
    new Request("http://localhost/health", {
      headers: { Origin: "http://localhost:5175" },
    }),
  );
  expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(
    "http://localhost:5175",
  );
  const denied = await app.handle(
    new Request("http://localhost/health", {
      headers: { Origin: "https://unknown.example" },
    }),
  );
  expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
});
