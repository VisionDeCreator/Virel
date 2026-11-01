import { convexTest } from "convex-test";
import { expect, test, vi, afterEach } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { defaultStudioInput, formatRewardUsd } from "@virel/shared";
import type { Id } from "../convex/_generated/dataModel";
const modules = import.meta.glob("../convex/**/*.{ts,js}");
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup(
  options: {
    generator?: "a" | "b" | "c";
    funding?: "purchased" | "promotional" | "mixed";
    eligible?: boolean;
  } = {},
) {
  const t = convexTest(schema, modules);
  const data = await t.run(async (ctx) => {
    const users = {
      a: await ctx.db.insert("users", {}),
      b: await ctx.db.insert("users", {}),
      c: await ctx.db.insert("users", {}),
      d: await ctx.db.insert("users", {}),
    };
    const generator = users[options.generator ?? "c"];
    await ctx.db.insert("creditAccounts", {
      userId: generator,
      creditsPerUsd: 1000,
      available: 1000,
      reserved: 0,
      activeJobs: 0,
      welcomeGranted: true,
    });
    await ctx.db.insert("creditLots", {
      userId: generator,
      creditsPerUsd: 1000,
      kind: options.funding === "promotional" ? "promotional" : "purchased",
      available: options.funding === "mixed" ? 100 : 1000,
      reserved: 0,
    });
    if (options.funding === "mixed")
      await ctx.db.insert("creditLots", {
        userId: generator,
        creditsPerUsd: 1000,
        kind: "promotional",
        available: 900,
        reserved: 0,
      });
    const image = await ctx.db.insert("mediaAssets", {
      userId: generator,
      key: "image.png",
      name: "image",
      type: "image",
      contentType: "image/png",
      bytes: 100,
      status: "ready",
      generated: false,
    });
    const asset = await ctx.db.insert("mediaAssets", {
      userId: users.a,
      key: "root.mp4",
      name: "root",
      type: "video",
      contentType: "video/mp4",
      bytes: 100,
      duration: 5,
      width: 720,
      height: 1280,
      status: "ready",
      generated: true,
    });
    const base = {
      assetId: asset,
      title: "Base",
      description: "",
      playbackUrl: "https://example.com/base.mp4",
      visibility: "public" as const,
      status: "published" as const,
      publishedAt: 1,
      remixEnabled: true,
      royaltyEligible: options.eligible ?? true,
    };
    const root = await ctx.db.insert("videos", { ...base, creatorId: users.a });
    const parent = await ctx.db.insert("videos", {
      ...base,
      creatorId: users.b,
      rootVideoId: root,
      parentVideoId: root,
    });
    const deeper = await ctx.db.insert("videos", {
      ...base,
      creatorId: users.d,
      rootVideoId: root,
      parentVideoId: parent,
    });
    const sameCreator = await ctx.db.insert("videos", {
      ...base,
      creatorId: users.a,
      rootVideoId: root,
      parentVideoId: root,
    });
    return { users, generator, image, root, parent, deeper, sameCreator };
  });
  const client = t.withIdentity({ subject: `${data.generator}|session` });
  async function generate(source?: Id<"videos">, asReference = false) {
    const quote = await client.mutation(internal.generation.saveQuote, {
      input: {
        ...defaultStudioInput,
        mode: source && !asReference ? "remix" : "create",
        prompt: "A new creative scene",
        referenceAssetIds: [data.image],
        ...(source
          ? asReference
            ? { referenceVideoId: source }
            : { sourceVideoId: source }
          : {}),
      },
      supplierMaximumUsdMicros: 100000,
      creditsPerUsd: 1000,
      markupBps: 3000,
    });
    const jobId = await client.mutation(api.generation.start, {
      quoteId: quote.quoteId,
      requestId: `reward-request-${Math.random().toString(36).slice(2)}-001`,
    });
    const output = {
      jobId,
      key: `private/${jobId}.mp4`,
      bytes: 100,
      duration: 5,
      width: 720,
      height: 1280,
    };
    return { quote, jobId, output };
  }
  return { t, ...data, client, generate };
}
for (const scenario of [
  { name: "original", source: undefined, expected: [], platform: 15000 },
  {
    name: "original with a video reference",
    source: "root",
    reference: true,
    expected: [],
    platform: 15000,
  },
  {
    name: "first remix",
    source: "root",
    expected: [["a", 10000]],
    platform: 5000,
  },
  {
    name: "remix of a remix",
    source: "parent",
    expected: [
      ["a", 10000],
      ["b", 5000],
    ],
    platform: 0,
  },
  {
    name: "deeper chain excludes intermediate ancestors",
    source: "deeper",
    expected: [
      ["a", 10000],
      ["d", 5000],
    ],
    platform: 0,
  },
  {
    name: "same creator root and parent",
    source: "sameCreator",
    expected: [["a", 15000]],
    platform: 0,
  },
  {
    name: "generator owns root",
    generator: "a",
    source: "parent",
    expected: [["b", 5000]],
    platform: 10000,
  },
  {
    name: "generator owns parent",
    generator: "b",
    source: "parent",
    expected: [["a", 10000]],
    platform: 5000,
  },
  {
    name: "generator owns both",
    generator: "a",
    source: "sameCreator",
    expected: [],
    platform: 15000,
  },
  {
    name: "promotional funding",
    funding: "promotional",
    source: "parent",
    expected: [],
    platform: 15000,
  },
  {
    name: "mixed funding",
    funding: "mixed",
    source: "parent",
    expected: [],
    platform: 15000,
  },
  {
    name: "ineligible external root",
    eligible: false,
    source: "parent",
    expected: [],
    platform: 15000,
  },
] as const) {
  test(`${scenario.name}: fee and distribution settle exactly once`, async () => {
    const s = await setup({
      generator: "generator" in scenario ? scenario.generator : undefined,
      funding: "funding" in scenario ? scenario.funding : undefined,
      eligible: "eligible" in scenario ? scenario.eligible : undefined,
    });
    const source = scenario.source ? s[scenario.source] : undefined;
    const generated = await s.generate(
      source,
      "reference" in scenario && scenario.reference,
    );
    expect(generated.quote.credits).toBe(145);
    expect(generated.quote.surchargeCredits).toBe(15);
    await Promise.all(
      [1, 2].map(() =>
        s.t.mutation(internal.generation.complete, generated.output),
      ),
    );
    const awards = await s.t.run((ctx) =>
      ctx.db
        .query("royaltiesLedger")
        .withIndex("by_jobId", (q) => q.eq("jobId", generated.jobId))
        .take(3),
    );
    expect(awards.map((a) => [a.userId, a.usdMicros])).toEqual(
      scenario.expected.map(([user, amount]) => [s.users[user], amount]),
    );
    const distributions = await s.t.run((ctx) =>
      ctx.db
        .query("generationDistributions")
        .withIndex("by_jobId_and_kind", (q) => q.eq("jobId", generated.jobId))
        .take(3),
    );
    expect(distributions).toHaveLength(1);
    expect(distributions[0]).toMatchObject({
      surchargeUsdMicros: 15000,
      platformUsdMicros: scenario.platform,
      creatorUsdMicros: 15000 - scenario.platform,
    });
    expect((await s.client.query(api.credits.balance))?.available).toBe(855);
    for (const award of awards) {
      const recipient = s.t.withIdentity({
        subject: `${award.userId}|recipient`,
      });
      expect(await recipient.query(api.rewards.balance)).toMatchObject({
        pendingUsdMicros: award.usdMicros,
        availableUsdMicros: 0,
        earnedUsdMicros: award.usdMicros,
      });
    }
  });
}
test("failed generation returns all credits including the surcharge and creates no distribution", async () => {
  const s = await setup();
  const generated = await s.generate(s.parent);
  await s.t.mutation(internal.generation.fail, {
    jobId: generated.jobId,
    error: "Confirmed failure",
  });
  await s.t.mutation(internal.generation.fail, {
    jobId: generated.jobId,
    error: "Duplicate failure",
  });
  expect((await s.client.query(api.credits.balance))?.available).toBe(1000);
  expect(
    await s.t.run((ctx) => ctx.db.query("generationDistributions").take(10)),
  ).toHaveLength(0);
  expect(
    await s.t.run((ctx) => ctx.db.query("rewardEvents").take(10)),
  ).toHaveLength(0);
});
test("confirmed refund reverses awards and platform retention, preserves audit history and refunds once", async () => {
  const s = await setup();
  const generated = await s.generate(s.root);
  await s.t.mutation(internal.generation.complete, generated.output);
  await s.t.mutation(internal.generation.refund, {
    jobId: generated.jobId,
    reason: "Confirmed provider refund",
  });
  await s.t.mutation(internal.generation.refund, {
    jobId: generated.jobId,
    reason: "Duplicate refund",
  });
  expect((await s.client.query(api.credits.balance))?.available).toBe(1000);
  const alice = s.t.withIdentity({ subject: `${s.users.a}|a` });
  expect(await alice.query(api.rewards.balance)).toMatchObject({
    pendingUsdMicros: 0,
    availableUsdMicros: 0,
    earnedUsdMicros: 0,
  });
  expect(
    (
      await alice.query(api.rewards.history, {
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).page.map((e) => e.kind),
  ).toEqual(["reversal", "award"]);
  expect(
    await s.t.run((ctx) => ctx.db.query("royaltiesLedger").take(10)),
  ).toHaveLength(1);
  const distributions = await s.t.run((ctx) =>
    ctx.db.query("generationDistributions").take(10),
  );
  expect(distributions.reduce((sum, d) => sum + d.surchargeUsdMicros, 0)).toBe(
    0,
  );
  expect(distributions.reduce((sum, d) => sum + d.platformUsdMicros, 0)).toBe(
    0,
  );
  await expect(
    s.client.mutation(internal.generation.publish, {
      jobId: generated.jobId,
      title: "Refunded",
      description: "",
      remixEnabled: true,
      playbackUrl: "https://example.com/output",
    }),
  ).rejects.toThrow("unavailable");
});
test("private reward balances and history are isolated, and hiding masks server responses", async () => {
  const s = await setup();
  const generated = await s.generate(s.parent);
  await s.t.mutation(internal.generation.complete, generated.output);
  const alice = s.t.withIdentity({ subject: `${s.users.a}|a` });
  expect(await s.t.query(api.rewards.balance)).toBeNull();
  await expect(
    s.t.query(api.rewards.history, {
      paginationOpts: { numItems: 10, cursor: null },
    }),
  ).rejects.toThrow("Sign in");
  expect(
    (
      await s.client.query(api.rewards.history, {
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).page,
  ).toHaveLength(0);
  await alice.mutation(api.rewards.setHidden, { hidden: true });
  expect(await alice.query(api.rewards.balance)).toMatchObject({
    hidden: true,
    pendingUsdMicros: null,
    availableUsdMicros: null,
    earnedUsdMicros: null,
  });
  expect(
    (
      await alice.query(api.rewards.history, {
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).page[0].usdMicros,
  ).toBeNull();
  expect(await s.client.query(api.rewards.balance)).toMatchObject({
    hidden: false,
    pendingUsdMicros: 0,
  });
  await alice.mutation(api.rewards.setHidden, { hidden: false });
  expect(await alice.query(api.rewards.balance)).toMatchObject({
    pendingUsdMicros: 10000,
  });
  await alice.mutation(api.profiles.save, {
    username: "rewardalice",
    displayName: "Alice",
    bio: "",
  });
  const publicProfile = await s.client.query(api.profiles.publicProfile, {
    username: "rewardalice",
  });
  expect(publicProfile).not.toHaveProperty("pendingUsdMicros");
  expect(publicProfile).not.toHaveProperty("hidden");
});
test("historical pending awards sync in batches without double-counting current awards", async () => {
  vi.useFakeTimers();
  const s = await setup();
  const generated = await s.generate(s.root);
  await s.t.mutation(internal.generation.complete, generated.output);
  await s.t.run(async (ctx) => {
    for (let i = 0; i < 73; i++)
      await ctx.db.insert("royaltiesLedger", {
        userId: s.users.a,
        jobId: generated.jobId,
        usdMicros: 5000,
        status: "pending",
      });
  });
  const alice = s.t.withIdentity({ subject: `${s.users.a}|a` });
  await alice.mutation(api.rewards.initialize, {});
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  await alice.mutation(api.rewards.initialize, {});
  expect(await alice.query(api.rewards.balance)).toMatchObject({
    pendingUsdMicros: 375000,
    earnedUsdMicros: 375000,
    syncing: false,
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("rewardEvents").take(100)),
  ).toHaveLength(74);
});
test("release requires configured hold and review, and released rewards can be reversed", async () => {
  const s = await setup();
  const generated = await s.generate(s.root);
  await s.t.mutation(internal.generation.complete, generated.output);
  const award = (
    await s.t.run((ctx) => ctx.db.query("royaltiesLedger").take(10))
  )[0];
  await expect(
    s.t.mutation(internal.rewards.release, {
      awardId: award._id,
      reviewReference: "review-1",
    }),
  ).rejects.toThrow("not configured");
  vi.stubEnv("REWARD_HOLD_HOURS", "24");
  await expect(
    s.t.mutation(internal.rewards.release, {
      awardId: award._id,
      reviewReference: "review-1",
    }),
  ).rejects.toThrow("still on hold");
  vi.useFakeTimers();
  vi.advanceTimersByTime(1000);
  vi.stubEnv("REWARD_HOLD_HOURS", "0");
  await expect(
    s.t.mutation(internal.rewards.release, {
      awardId: award._id,
      reviewReference: " ",
    }),
  ).rejects.toThrow("review reference");
  await s.t.mutation(internal.rewards.release, {
    awardId: award._id,
    reviewReference: "review-1",
  });
  await s.t.mutation(internal.rewards.release, {
    awardId: award._id,
    reviewReference: "review-1",
  });
  const alice = s.t.withIdentity({ subject: `${s.users.a}|a` });
  expect(await alice.query(api.rewards.balance)).toMatchObject({
    pendingUsdMicros: 0,
    availableUsdMicros: 10000,
  });
  await s.t.mutation(internal.generation.refund, {
    jobId: generated.jobId,
    reason: "Confirmed refund",
  });
  expect(await alice.query(api.rewards.balance)).toMatchObject({
    pendingUsdMicros: 0,
    availableUsdMicros: 0,
  });
});
test("a changed funding source requires another reward eligibility review", async () => {
  const s = await setup();
  const quote = await s.client.mutation(internal.generation.saveQuote, {
    input: {
      ...defaultStudioInput,
      mode: "remix",
      prompt: "A new scene",
      sourceVideoId: s.root,
      referenceAssetIds: [s.image],
    },
    supplierMaximumUsdMicros: 100000,
    creditsPerUsd: 1000,
    markupBps: 3000,
  });
  expect(quote.royaltyEligible).toBe(true);
  await s.t.run(async (ctx) => {
    const lot = (await ctx.db
      .query("creditLots")
      .withIndex("by_userId", (q) => q.eq("userId", s.generator))
      .unique())!;
    await ctx.db.patch(lot._id, { kind: "promotional" });
  });
  await expect(
    s.client.mutation(api.generation.start, {
      quoteId: quote.quoteId,
      requestId: "changed-funding-request-001",
    }),
  ).rejects.toThrow("Funding changed");
  expect((await s.client.query(api.credits.balance))?.available).toBe(1000);
});
test("USD presentation preserves half-cent awards", () => {
  expect(formatRewardUsd(5000)).toBe("$0.005");
  expect(formatRewardUsd(15000)).toBe("$0.015");
});

test("pre-surcharge in-flight jobs settle at their original price and historical awards are preserved", async () => {
  const s = await setup();
  const jobId = await s.t.run(async (ctx) => {
    const quoteId = await ctx.db.insert("generationQuotes", {
      userId: s.generator,
      input: defaultStudioInput,
      inputKey: "legacy",
      credits: 130,
      supplierMaximumUsdMicros: 100000,
      creditsPerUsd: 1000,
      markupBps: 3000,
      pricingVersion: "v2",
      expiresAt: 1,
    });
    const account = (await ctx.db
      .query("creditAccounts")
      .withIndex("by_userId", (q) => q.eq("userId", s.generator))
      .unique())!;
    const lot = (await ctx.db
      .query("creditLots")
      .withIndex("by_userId", (q) => q.eq("userId", s.generator))
      .unique())!;
    await ctx.db.patch(account._id, {
      available: 870,
      reserved: 130,
      activeJobs: 1,
    });
    await ctx.db.patch(lot._id, { available: 870, reserved: 130 });
    return ctx.db.insert("generationJobs", {
      userId: s.generator,
      input: defaultStudioInput,
      quoteId,
      requestId: "legacy-inflight",
      status: "ingesting",
      credits: 130,
      creditsPerUsd: 1000,
      financialState: "reserved",
      allocations: [{ lotId: lot._id, credits: 130, kind: "purchased" }],
      supplierMaximumUsdMicros: 100000,
      parentVideoId: s.root,
      rootVideoId: s.root,
      royaltyBeneficiaries: [{ userId: s.users.a, usdMicros: 10000 }],
      updatedAt: 1,
      pollCount: 0,
    });
  });
  await s.t.mutation(internal.generation.complete, {
    jobId,
    key: "legacy/output.mp4",
    bytes: 100,
    duration: 5,
    width: 720,
    height: 1280,
  });
  expect((await s.client.query(api.credits.balance))?.available).toBe(870);
  expect((await s.client.query(api.credits.balance))?.reserved).toBe(0);
  expect(
    await s.t.run((ctx) => ctx.db.query("generationDistributions").take(10)),
  ).toHaveLength(0);
  const alice = s.t.withIdentity({ subject: `${s.users.a}|a` });
  expect(await alice.query(api.rewards.balance)).toMatchObject({
    pendingUsdMicros: 10000,
  });
});

test("v2 quotes require re-review instead of silently adding the surcharge", async () => {
  const s = await setup();
  const quote = await s.client.mutation(internal.generation.saveQuote, {
    input: { ...defaultStudioInput, prompt: "A sunrise" },
    supplierMaximumUsdMicros: 100000,
    creditsPerUsd: 1000,
    markupBps: 3000,
  });
  await s.t.run((ctx) =>
    ctx.db.patch(quote.quoteId, {
      pricingVersion: "v2",
      credits: 130,
      surchargeUsdMicros: undefined,
      royaltyRuleVersion: undefined,
    }),
  );
  await expect(
    s.client.mutation(api.generation.start, {
      quoteId: quote.quoteId,
      requestId: "old-quote-review-request",
    }),
  ).rejects.toThrow("pricing changed");
  expect((await s.client.query(api.credits.balance))?.available).toBe(1000);
});
