import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.{ts,js}");
async function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const [adminId, userId] = await t.run(async (ctx) => [
    await ctx.db.insert("users", {
      email: "admin@example.com",
      emailVerificationTime: 1,
      adminRole: "platform_admin",
    }),
    await ctx.db.insert("users", { email: "creator@example.com" }),
  ]);
  const admin = t.withIdentity({ subject: `${adminId}|session` });
  const user = t.withIdentity({ subject: `${userId}|session` });
  const args = {
    userId,
    email: "creator@example.com",
    amount: 100,
    reason: "Creator trial",
    requestId: "test-request-00001",
  };
  return { t, admin, user, adminId, userId, args };
}
test("administrative queries and grants reject anonymous, regular, and unverified staff", async () => {
  const { t, user, admin, adminId, args } = await setup();
  for (const client of [t, user]) {
    await expect(
      client.query(api.admin.lookupUser, { email: args.email }),
    ).rejects.toThrow("Administrator");
    await expect(client.mutation(api.admin.grantCredits, args)).rejects.toThrow(
      "Administrator",
    );
    await expect(
      client.query(api.admin.creditHistory, {
        userId: args.userId,
        paginationOpts: { cursor: null, numItems: 20 },
      }),
    ).rejects.toThrow("Administrator");
    await expect(
      client.query(api.admin.audit, {
        paginationOpts: { cursor: null, numItems: 20 },
      }),
    ).rejects.toThrow("Administrator");
  }
  await t.run((ctx) =>
    ctx.db.patch(adminId, { emailVerificationTime: undefined }),
  );
  expect(await admin.query(api.admin.me)).toBeNull();
  await expect(admin.mutation(api.admin.grantCredits, args)).rejects.toThrow(
    "Administrator",
  );
});
test("promotion requires an existing verified unique account and is safe to rerun", async () => {
  const { t, userId } = await setup();
  const args = { email: " CREATOR@example.com ", reason: "Operator setup" };
  await expect(
    t.mutation(internal.admin.promoteAdmin, {
      ...args,
      email: "missing@example.com",
    }),
  ).rejects.toThrow("not found");
  await expect(t.mutation(internal.admin.promoteAdmin, args)).rejects.toThrow(
    "Verify",
  );
  await t.run((ctx) => ctx.db.patch(userId, { emailVerificationTime: 1 }));
  expect(
    (await t.mutation(internal.admin.promoteAdmin, args)).alreadyAdmin,
  ).toBe(false);
  expect(
    (await t.mutation(internal.admin.promoteAdmin, args)).alreadyAdmin,
  ).toBe(true);
  expect(
    await t.run((ctx) => ctx.db.query("adminAudit").collect()),
  ).toHaveLength(1);
  await t.run((ctx) =>
    ctx.db.insert("users", { email: "creator@example.com" }),
  );
  await expect(t.mutation(internal.admin.promoteAdmin, args)).rejects.toThrow(
    "Multiple accounts",
  );
});
test("grants atomically create promotional lots, ledger and audit; retry deduplicates", async () => {
  const { t, admin, user, args } = await setup();
  expect(await admin.mutation(api.admin.grantCredits, args)).toEqual({
    balance: 100,
    duplicate: false,
  });
  expect(await admin.mutation(api.admin.grantCredits, args)).toEqual({
    balance: 100,
    duplicate: true,
  });
  await expect(
    admin.mutation(api.admin.grantCredits, { ...args, amount: 101 }),
  ).rejects.toThrow("different details");
  const state = await t.run(async (ctx) => ({
    lots: await ctx.db.query("creditLots").collect(),
    ledger: await ctx.db.query("creditLedger").collect(),
    audit: await ctx.db.query("adminAudit").collect(),
  }));
  expect(state.lots).toHaveLength(1);
  expect(state.lots[0].kind).toBe("promotional");
  expect(state.ledger).toHaveLength(1);
  expect(state.audit).toHaveLength(1);
  expect(state.audit[0]).toMatchObject({
    actorEmail: "admin@example.com",
    targetEmail: args.email,
    before: 0,
    after: 100,
    reason: args.reason,
  });
  expect((await user.query(api.credits.balance))?.available).toBe(100);
});
test("invalid grants leave no partial writes", async () => {
  const { t, admin, args } = await setup();
  for (const amount of [0, -1, 1.5, 1_000_001])
    await expect(
      admin.mutation(api.admin.grantCredits, { ...args, amount }),
    ).rejects.toThrow("whole credits");
  await expect(
    admin.mutation(api.admin.grantCredits, { ...args, reason: " " }),
  ).rejects.toThrow("reason");
  await expect(
    admin.mutation(api.admin.grantCredits, { ...args, requestId: "short" }),
  ).rejects.toThrow("request ID");
  await expect(
    admin.mutation(api.admin.grantCredits, {
      ...args,
      email: "other@example.com",
    }),
  ).rejects.toThrow("Recipient changed");
  expect(
    await t.run((ctx) => ctx.db.query("creditAccounts").collect()),
  ).toHaveLength(0);
  expect(
    await t.run((ctx) => ctx.db.query("adminAudit").collect()),
  ).toHaveLength(0);
});
test("concurrent grants and duplicate requests preserve reserved credits", async () => {
  const { t, admin, userId, args } = await setup();
  await t.run((ctx) =>
    ctx.db.insert("creditAccounts", {
      creditsPerUsd: 1000,
      userId,
      available: 10,
      reserved: 20,
      activeJobs: 1,
      welcomeGranted: true,
    }),
  );
  await Promise.all([
    admin.mutation(api.admin.grantCredits, args),
    admin.mutation(api.admin.grantCredits, args),
    admin.mutation(api.admin.grantCredits, {
      ...args,
      requestId: "test-request-00002",
    }),
  ]);
  expect(
    await t.run((ctx) => ctx.db.query("creditAccounts").unique()),
  ).toMatchObject({
    available: 210,
    reserved: 20,
    activeJobs: 1,
    welcomeGranted: true,
  });
  expect(
    await t.run((ctx) => ctx.db.query("creditLedger").collect()),
  ).toHaveLength(2);
});
test("overflow rolls back and audit and ledger pagination work", async () => {
  const { t, admin, userId, args } = await setup();
  const id = await t.run((ctx) =>
    ctx.db.insert("creditAccounts", {
      creditsPerUsd: 1000,
      userId,
      available: Number.MAX_SAFE_INTEGER,
      reserved: 0,
      activeJobs: 0,
      welcomeGranted: true,
    }),
  );
  await expect(admin.mutation(api.admin.grantCredits, args)).rejects.toThrow(
    "supported limit",
  );
  expect(
    await t.run((ctx) => ctx.db.query("creditLots").collect()),
  ).toHaveLength(0);
  await t.run((ctx) => ctx.db.patch(id, { available: 0 }));
  await admin.mutation(api.admin.grantCredits, args);
  await admin.mutation(api.admin.grantCredits, {
    ...args,
    requestId: "test-request-00002",
  });
  const page = await admin.query(api.admin.audit, {
    targetEmail: args.email,
    action: "credits.grant",
    paginationOpts: { cursor: null, numItems: 1 },
  });
  expect(page.page).toHaveLength(1);
  expect(page.isDone).toBe(false);
  const next = await admin.query(api.admin.audit, {
    targetEmail: args.email,
    action: "credits.grant",
    paginationOpts: { cursor: page.continueCursor, numItems: 1 },
  });
  expect(next.page).toHaveLength(1);
  expect(next.page[0]._id).not.toBe(page.page[0]._id);
  const history = await admin.query(api.admin.creditHistory, {
    userId,
    paginationOpts: { cursor: null, numItems: 1 },
  });
  expect(history.page).toHaveLength(1);
  const filtered = await admin.query(api.admin.audit, {
    actorEmail: "ADMIN@example.com",
    targetEmail: args.email,
    action: "credits.grant",
    from: 0,
    to: Number.MAX_SAFE_INTEGER,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(filtered.page).toHaveLength(2);

  await expect(
    admin.query(api.admin.audit, {
      from: 2,
      to: 1,
      paginationOpts: { cursor: null, numItems: 10 },
    }),
  ).rejects.toThrow("date range");
});
test("billing role can grant and revoked roles fail immediately", async () => {
  const { t, admin, adminId, args } = await setup();
  await t.run((ctx) => ctx.db.patch(adminId, { adminRole: "billing" }));
  await admin.mutation(api.admin.grantCredits, args);
  await t.run((ctx) => ctx.db.patch(adminId, { adminRole: undefined }));
  await expect(admin.mutation(api.admin.grantCredits, args)).rejects.toThrow(
    "Administrator",
  );
});
test("grant rate limit rejects excess writes but still allows a safe retry", async () => {
  const { t, admin, args } = await setup();
  for (let i = 0; i < 20; i++)
    await admin.mutation(api.admin.grantCredits, {
      ...args,
      requestId: `rate-request-${String(i).padStart(6, "0")}`,
    });
  await expect(
    admin.mutation(api.admin.grantCredits, {
      ...args,
      requestId: "rate-request-overflow",
    }),
  ).rejects.toThrow();
  expect(
    (
      await admin.mutation(api.admin.grantCredits, {
        ...args,
        requestId: "rate-request-000000",
      })
    ).duplicate,
  ).toBe(true);
  expect(
    await t.run((ctx) => ctx.db.query("creditLedger").collect()),
  ).toHaveLength(20);
});
