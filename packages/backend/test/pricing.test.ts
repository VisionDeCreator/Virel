import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  generationPrice,
  currentCredits,
  defaultStudioInput,
} from "@virel/shared";
const modules = import.meta.glob("../convex/**/*.{ts,js}");
test("exact arithmetic rounds retail once and supports large intermediate products", () => {
  expect(generationPrice(500000)).toEqual({
    credits: 698,
    supplierMaximumUsdMicros: 525000,
  });
  expect(generationPrice(1)).toEqual({
    credits: 16,
    supplierMaximumUsdMicros: 2,
  });
  expect(generationPrice(999999999)).toEqual({
    credits: 1365015,
    supplierMaximumUsdMicros: 1049999999,
  });
  expect(() => generationPrice(-1)).toThrow();
  expect(() => generationPrice(1.5)).toThrow();
  expect(currentCredits(100)).toBe(1000);
  expect(() => currentCredits(Number.MAX_SAFE_INTEGER)).toThrow();
});
async function legacy() {
  const t = convexTest(schema, modules);
  const id = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    await ctx.db.insert("creditAccounts", {
      userId,
      available: 100,
      reserved: 0,
      activeJobs: 0,
      welcomeGranted: true,
    });
    await ctx.db.insert("creditLots", {
      userId,
      kind: "promotional",
      available: 100,
      reserved: 0,
    });
    await ctx.db.insert("creditLedger", {
      userId,
      kind: "grant",
      amount: 100,
      operationKey: "legacy",
      note: "Legacy grant",
    });
    return userId;
  });
  return { t, id, user: t.withIdentity({ subject: `${id}|session` }) };
}
test("migration is auditable, repeat-safe, preserves value and historical originals", async () => {
  const { t, id, user } = await legacy();
  await t.mutation(internal.creditPricing.beginMigration, {});
  await expect(
    t.mutation(internal.credits.grant, {
      userId: id,
      credits: 1,
      operationKey: "blocked",
    }),
  ).rejects.toThrow("updating");
  let phase: string = "";
  do {
    phase = await t.mutation(internal.creditPricing.migrateBatch, {});
  } while (phase !== "complete");
  await t.mutation(internal.creditPricing.migrateBatch, {});
  expect((await user.query(api.credits.balance))?.available).toBe(1000);
  expect(
    await t.run((ctx) => ctx.db.query("creditLots").unique()),
  ).toMatchObject({ available: 1000, creditsPerUsd: 1000 });
  expect(
    await t.run((ctx) => ctx.db.query("creditMigrations").collect()),
  ).toHaveLength(1);
  const history = await user.query(api.credits.history);
  expect(history[0]).toMatchObject({
    amount: 1000,
    originalAmount: 100,
    originalCreditsPerUsd: 100,
  });
  expect(
    (await t.run((ctx) => ctx.db.query("creditLedger").unique()))?.amount,
  ).toBe(100);
});
test("migration refuses unresolved generations and funding mismatches", async () => {
  const { t, id } = await legacy();
  const quoteId = await t.run((ctx) =>
    ctx.db.insert("generationQuotes", {
      userId: id,
      input: defaultStudioInput,
      inputKey: "",
      credits: 1,
      supplierMaximumUsdMicros: 1,
      creditsPerUsd: 100,
      markupBps: 3000,
      pricingVersion: "v1",
      expiresAt: 1,
    }),
  );
  const job = await t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId: id,
      input: defaultStudioInput,
      quoteId,
      requestId: "legacy-job",
      status: "reserved",
      credits: 1,
      financialState: "reserved",
      allocations: [],
      supplierMaximumUsdMicros: 1,
      royaltyBeneficiaries: [],
      updatedAt: 1,
      pollCount: 0,
    }),
  );
  await expect(
    t.mutation(internal.creditPricing.beginMigration, {}),
  ).rejects.toThrow("outstanding");
  await t.run((ctx) => ctx.db.patch(job, { financialState: "released" }));
  await t.mutation(internal.creditPricing.beginMigration, {});
  await t.mutation(internal.creditPricing.migrateBatch, {});
  await t.run(async (ctx) => {
    const lot = (await ctx.db.query("creditLots").unique())!;
    await ctx.db.patch(lot._id, { available: 999 });
  });
  await expect(
    t.mutation(internal.creditPricing.migrateBatch, {}),
  ).rejects.toThrow("reconciliation");
  expect((await t.query(api.creditPricing.status)).updating).toBe(true);
});
test("pre-surcharge quotes cannot start under current pricing", async () => {
  const t = convexTest(schema, modules);
  const id = await t.run((ctx) => ctx.db.insert("users", {}));
  const quoteId = await t.run((ctx) =>
    ctx.db.insert("generationQuotes", {
      userId: id,
      input: defaultStudioInput,
      inputKey: "",
      credits: 1,
      supplierMaximumUsdMicros: 1,
      creditsPerUsd: 100,
      markupBps: 3000,
      pricingVersion: "v1",
      expiresAt: Date.now() + 60000,
    }),
  );
  await expect(
    t
      .withIdentity({ subject: `${id}|session` })
      .mutation(api.generation.start, {
        quoteId,
        requestId: "legacy-quote-request",
      }),
  ).rejects.toThrow("pricing changed");
});
test("funding remains usable after more than one hundred depleted lots", async () => {
  const t = convexTest(schema, modules);
  const id = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    for (let i = 0; i < 110; i++)
      await ctx.db.insert("creditLots", {
        userId,
        kind: "promotional",
        available: 0,
        reserved: 0,
        creditsPerUsd: 1000,
      });
    return userId;
  });
  await t.mutation(internal.credits.grant, {
    userId: id,
    credits: 1000,
    operationKey: "fund-after-empty-lots",
  });
  const user = t.withIdentity({ subject: `${id}|session` });
  const quote = await user.mutation(internal.generation.saveQuote, {
    input: { ...defaultStudioInput, prompt: "A sunrise" },
    supplierEstimateUsdMicros: 100000,
    supplierMaximumUsdMicros: 105000,
    creditsPerUsd: 1000,
    markupBps: 3000,
    bufferBps: 500,
  });
  expect(quote.credits).toBe(152);
  await user.mutation(api.generation.start, {
    quoteId: quote.quoteId,
    requestId: "many-lots-request-001",
  });
  expect((await user.query(api.credits.balance))?.available).toBe(848);
});
test("duplicate claims do not mark an active submission uncertain", async () => {
  const t = convexTest(schema, modules);
  const id = await t.run((ctx) => ctx.db.insert("users", {}));
  await t.mutation(internal.credits.grant, {
    userId: id,
    credits: 1000,
    operationKey: "concurrent-claim-funding",
  });
  const user = t.withIdentity({ subject: `${id}|session` });
  const quote = await user.mutation(internal.generation.saveQuote, {
    input: { ...defaultStudioInput, prompt: "A sunrise" },
    supplierMaximumUsdMicros: 100000,
    creditsPerUsd: 1000,
    markupBps: 3000,
  });
  const jobId = await user.mutation(api.generation.start, {
    quoteId: quote.quoteId,
    requestId: "concurrent-claim-request",
  });
  const claims = await Promise.all([
    t.mutation(internal.generation.claimSubmission, { jobId }),
    t.mutation(internal.generation.claimSubmission, { jobId }),
  ]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  expect(
    (await t.query(internal.generation.jobContext, { jobId })).job.status,
  ).toBe("submitting");
});
