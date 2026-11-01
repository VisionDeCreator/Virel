import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { internal } from "../../../../packages/backend/convex/_generated/api";
import { authDigest } from "../../../../packages/backend/convex/authEmail";
import { requestEmailOtp, authClientAddress } from "./authEmail";
import { createApp } from "../app";
import type { ServiceContext } from "../runtime/operation";
const state = vi.hoisted(() => ({
  send: vi.fn(),
  configure: vi.fn(),
  mutation: vi.fn(),
}));
vi.mock("./smtp", () => ({
  smtpConfiguration: state.configure,
  sendSmtpEmail: state.send,
}));
vi.mock("../runtime/context", () => ({
  createContext: () => ({ runMutation: state.mutation }),
}));
const context = {
  runMutation: state.mutation,
  runQuery: vi.fn(),
} as ServiceContext;
beforeEach(() => {
  vi.resetAllMocks();
  state.configure.mockReturnValue({});
  state.send.mockResolvedValue({ sent: true });
  state.mutation.mockImplementation(async (ref) =>
    getFunctionName(ref) === "authOtp:issue"
      ? { id: "test-challenge", expiresAt: Date.now() + 600_000 }
      : null,
  );
});
afterEach(() => vi.unstubAllEnvs());
test("API creates random code/challenge, stores only hashes and marks delivery after SMTP succeeds", async () => {
  const response = await requestEmailOtp(
    context,
    " Creator@Example.com ",
    "127.0.0.1",
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const result = await response.json();
  expect(result.challenge).toMatch(/^[a-f0-9]{64}$/);
  expect(result.email).toBe("creator@example.com");
  const code = state.send.mock.calls[0][0].text.match(/code is (\d{6})/)[1];
  expect(state.mutation.mock.calls[0][1]).toMatchObject({
    email: result.email,
    challengeHash: await authDigest(result.challenge),
    codeHash: await authDigest(`${result.challenge}:${result.email}:${code}`),
    ipHash: await authDigest("127.0.0.1"),
  });
  expect(getFunctionName(state.mutation.mock.calls[1][0])).toBe(
    "authOtp:delivered",
  );
  expect(JSON.stringify(result)).not.toContain(code);
});
test("disabled or failed SMTP never marks a challenge delivered and never exposes diagnostics", async () => {
  state.configure.mockReturnValue(null);
  expect(
    (await requestEmailOtp(context, "creator@example.com", "local")).status,
  ).toBe(503);
  expect(state.mutation).not.toHaveBeenCalled();
  state.configure.mockReturnValue({});
  state.send.mockRejectedValue(new Error("password private SMTP error"));
  const response = await requestEmailOtp(
    context,
    "creator@example.com",
    "local",
  );
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("password");
  expect(state.mutation).toHaveBeenCalledTimes(1);
});
test("rate limits return 429 before mail is sent", async () => {
  state.mutation.mockRejectedValue(
    new ConvexError({ code: "OTP_RATE_LIMIT", retryAfterSeconds: 60 }),
  );
  const response = await requestEmailOtp(
    context,
    "creator@example.com",
    "local",
  );
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("60");
  expect(state.send).not.toHaveBeenCalled();
});
test("public request route accepts only bounded email requests from configured browser origins", async () => {
  const app = createApp({ webOrigins: ["http://localhost:5174"] });
  const request = (origin: string, body: string) =>
    new Request("http://localhost/auth/email/request", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body,
    });
  expect(
    (
      await app.handle(
        request("https://untrusted.example", '{"email":"creator@example.com"}'),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await app.handle(
        request(
          "http://localhost:5174",
          JSON.stringify({ email: "a".repeat(2000) }),
        ),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await app.handle(
        request(
          "http://localhost:5174",
          '{"email":"creator@example.com","code":"123456"}',
        ),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await app.handle(
        request("http://localhost:5174", '{"email":"creator@example.com"}'),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await app.handle(
        new Request("http://localhost/internal/auth/email", { method: "POST" }),
      )
    ).status,
  ).toBe(404);
});
test("forwarded client IPs are used only behind configured trusted peers", () => {
  const request = new Request("http://localhost", {
    headers: { "x-forwarded-for": "198.51.100.5, 127.0.0.1" },
  });
  expect(authClientAddress(request, "192.0.2.1")).toBe("192.0.2.1");
  vi.stubEnv("AUTH_TRUSTED_PROXY_IPS", "127.0.0.1");
  expect(authClientAddress(request, "127.0.0.1")).toBe("198.51.100.5");
});

test("email preflight echoes only an explicitly allowed admin origin", async () => {
  const app = createApp({ webOrigins: ["http://localhost:5176"] });
  const preflight = (origin: string) =>
    new Request("http://localhost/auth/email/request", {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
  const allowed = await app.handle(preflight("http://localhost:5176"));
  expect(allowed.status).toBe(204);
  expect(allowed.headers.get("access-control-allow-origin")).toBe(
    "http://localhost:5176",
  );
  expect(allowed.headers.get("access-control-allow-methods")).toContain("POST");
  expect(allowed.headers.get("access-control-allow-headers")).toContain(
    "Content-Type",
  );
  expect(
    (await app.handle(preflight("https://untrusted.example"))).headers.has(
      "access-control-allow-origin",
    ),
  ).toBe(false);
});
