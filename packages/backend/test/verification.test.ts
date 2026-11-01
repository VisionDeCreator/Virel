import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { authDigest } from "../convex/authEmail";
const modules = import.meta.glob("../convex/**/*.{ts,js}");
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup(
  email = "creator@example.com",
  challenge = "a".repeat(64),
  code = "001234",
) {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const args = {
    email,
    challengeHash: await authDigest(challenge),
    codeHash: await authDigest(`${challenge}:${email}:${code}`),
  };
  const issued = await t.mutation(internal.authOtp.issue, {
    ...args,
    ipHash: await authDigest("127.0.0.1"),
  });
  return { t, email, challenge, code, args, issued };
}
test("delivery is required; successful OTP preserves account identity, roles and credits and prevents replay", async () => {
  const { t, email, args, issued } = await setup();
  const id = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email,
      adminRole: "platform_admin",
    });
    await ctx.db.insert("creditAccounts", {
      creditsPerUsd: 1000,
      userId,
      available: 50,
      reserved: 10,
      activeJobs: 1,
      welcomeGranted: true,
    });
    return userId;
  });
  expect((await t.mutation(internal.authOtp.consume, args)).userId).toBeNull();
  await t.mutation(internal.authOtp.delivered, { id: issued.id });
  expect((await t.mutation(internal.authOtp.consume, args)).userId).toBe(id);
  expect(
    (await t.run((ctx) => ctx.db.get(id)))?.emailVerificationTime,
  ).toBeDefined();
  expect((await t.run((ctx) => ctx.db.get(id)))?.adminRole).toBe(
    "platform_admin",
  );
  expect(
    await t.run((ctx) => ctx.db.query("creditAccounts").unique()),
  ).toMatchObject({ userId: id, available: 50, reserved: 10 });
  expect((await t.mutation(internal.authOtp.consume, args)).userId).toBeNull();
});
test("five failed guesses commit and lock out the correct code", async () => {
  const { t, args, issued } = await setup();
  await t.mutation(internal.authOtp.delivered, { id: issued.id });
  for (let i = 0; i < 5; i++)
    expect(
      (
        await t.mutation(internal.authOtp.consume, {
          ...args,
          codeHash: "0".repeat(64),
        })
      ).userId,
    ).toBeNull();
  expect((await t.run((ctx) => ctx.db.get(issued.id)))?.attempts).toBe(5);
  expect((await t.mutation(internal.authOtp.consume, args)).userId).toBeNull();
});
test("resend cooldown, replacement, expiry and cleanup", async () => {
  vi.useFakeTimers();
  const { t, args, issued } = await setup();
  const next = {
    email: args.email,
    challengeHash: await authDigest("b".repeat(64)),
    codeHash: "b".repeat(64),
    ipHash: "c".repeat(64),
  };
  await expect(t.mutation(internal.authOtp.issue, next)).rejects.toThrow();
  await t.mutation(internal.authOtp.delivered, { id: issued.id });
  vi.advanceTimersByTime(60_001);
  const fresh = await t.mutation(internal.authOtp.issue, next);
  expect((await t.mutation(internal.authOtp.consume, args)).userId).toBeNull();
  await t.mutation(internal.authOtp.delivered, { id: fresh.id });
  vi.advanceTimersByTime(600_001);
  expect(
    (
      await t.mutation(internal.authOtp.consume, {
        email: next.email,
        challengeHash: next.challengeHash,
        codeHash: next.codeHash,
      })
    ).userId,
  ).toBeNull();
  expect(await t.mutation(internal.authOtp.cleanup, {})).toBe(2);
});
test("new users are verified without receiving staff privileges; duplicate emails fail closed", async () => {
  const { t, args, issued } = await setup();
  await t.mutation(internal.authOtp.delivered, { id: issued.id });
  const result = await t.mutation(internal.authOtp.consume, args);
  const user = await t.run((ctx) => ctx.db.get(result.userId!));
  expect(user?.email).toBe(args.email);
  expect(user?.emailVerificationTime).toBeDefined();
  expect(user?.adminRole).toBeUndefined();
  const second = await setup("duplicate@example.com");
  await second.t.run(async (ctx) => {
    await ctx.db.insert("users", { email: second.email });
    await ctx.db.insert("users", { email: second.email });
  });
  await second.t.mutation(internal.authOtp.delivered, { id: second.issued.id });
  await expect(
    second.t.mutation(internal.authOtp.consume, second.args),
  ).rejects.toThrow("assistance");
});
test("challenge/email binding and concurrent consumption prevent cross-account use and replay", async () => {
  const { t, args, issued } = await setup();
  await t.mutation(internal.authOtp.delivered, { id: issued.id });
  expect(
    (
      await t.mutation(internal.authOtp.consume, {
        ...args,
        email: "other@example.com",
      })
    ).userId,
  ).toBeNull();
  const results = await Promise.all([
    t.mutation(internal.authOtp.consume, args),
    t.mutation(internal.authOtp.consume, args),
  ]);
  expect(results.filter((result) => result.userId)).toHaveLength(1);
  expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(1);
});
test("email OTP is the only sign-in provider and preserves leading zeros", async () => {
  const { t, email, challenge, code, issued } = await setup();
  const keys = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", keys.privateKey),
  );
  vi.stubEnv(
    "JWT_PRIVATE_KEY",
    `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...bytes))}\n-----END PRIVATE KEY-----`,
  );
  vi.stubEnv("CONVEX_SITE_URL", "https://test.convex.site");
  await expect(
    t.action(api.auth.signIn, {
      provider: "password",
      params: { email, password: "old-password", flow: "signIn" },
    }),
  ).rejects.toThrow();
  await t.mutation(internal.authOtp.delivered, { id: issued.id });
  const result = await t.action(api.auth.signIn, {
    provider: "email-otp",
    params: { email, challenge, code },
  });
  expect(!!result.tokens?.token).toBe(true);
  await expect(
    t.action(api.auth.signIn, {
      provider: "email-otp",
      params: { email, challenge, code },
    }),
  ).rejects.toThrow("incorrect or expired");
});
test("cutover normalizes emails without replacing user IDs or merging duplicates", async () => {
  const { t } = await setup();
  const id = await t.run((ctx) =>
    ctx.db.insert("users", {
      email: " Mixed@Example.com ",
      adminRole: "billing",
    }),
  );
  const result = await t.mutation(internal.authOtp.normalizeExistingEmails, {
    cursor: null,
  });
  expect(result.normalized).toBe(1);
  expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
    email: "mixed@example.com",
    adminRole: "billing",
  });
});
