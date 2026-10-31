import { convexTest } from "convex-test";
import { expect, test, vi, afterEach } from "vitest";
import workpool from "@convex-dev/workpool/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  defaultStudioInput,
  compileRemix,
  validateUpload,
} from "@virel/shared";
const modules = import.meta.glob("../convex/**/*.{ts,js}");
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup() {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  workpool.register(t);
  const [aliceId, bobId] = await t.run(async (ctx) => [
    await ctx.db.insert("users", {}),
    await ctx.db.insert("users", {}),
  ]);
  const alice = t.withIdentity({ subject: `${aliceId}|alice-session` });
  const bob = t.withIdentity({ subject: `${bobId}|bob-session` });
  await t.mutation(internal.credits.grant, {
    userId: aliceId,
    credits: 100,
    operationKey: "alice-grant",
  });
  const assetIds = await t.run(async (ctx) => {
    const source = await ctx.db.insert("mediaAssets", {
      userId: aliceId,
      key: "private/source",
      name: "source",
      type: "video",
      contentType: "video/mp4",
      bytes: 100,
      duration: 5.1,
      status: "ready",
      generated: false,
    });
    const image = await ctx.db.insert("mediaAssets", {
      userId: aliceId,
      key: "private/image",
      name: "image",
      type: "image",
      contentType: "image/png",
      bytes: 100,
      status: "ready",
      generated: false,
    });
    return { source, image };
  });
  const input = {
    ...defaultStudioInput,
    mode: "remix" as const,
    prompt: "Use @image_1 for clothing",
    sourceVideoId: undefined,
    sourceAssetId: assetIds.source,
    referenceAssetIds: [assetIds.image],
  };
  const quote = await alice.mutation(internal.generation.saveQuote, {
    input,
    supplierMaximumUsdMicros: 100000,
    creditsPerUsd: 100,
    markupBps: 3000,
  });
  return { t, alice, bob, aliceId, bobId, input, quote, assetIds };
}
test("reserving, duplicate submission, and confirmed failure change balances exactly once", async () => {
  const { alice, t, quote } = await setup();
  expect(quote.credits).toBe(13);
  expect(quote.duration).toBe(6);
  const requestId = "request-000000000001";
  const jobId = await alice.mutation(api.generation.start, {
    quoteId: quote.quoteId,
    requestId,
  });
  expect((await alice.query(api.credits.balance))?.available).toBe(87);
  expect((await alice.query(api.credits.balance))?.reserved).toBe(13);
  expect(
    await alice.mutation(api.generation.start, {
      quoteId: quote.quoteId,
      requestId,
    }),
  ).toBe(jobId);
  expect(
    await alice.mutation(api.generation.start, {
      quoteId: quote.quoteId,
      requestId: "request-000000000002",
    }),
  ).toBe(jobId);
  await t.mutation(internal.generation.fail, {
    jobId,
    error: "Confirmed provider failure",
  });
  await t.mutation(internal.generation.fail, {
    jobId,
    error: "Duplicate failure",
  });
  expect((await alice.query(api.credits.balance))?.available).toBe(100);
  expect((await alice.query(api.credits.balance))?.reserved).toBe(0);
  expect(
    (await alice.query(api.credits.history)).filter(
      (e) => e.kind === "release",
    ),
  ).toHaveLength(1);
});
test("settlement creates one private output and charges once, separate from publication", async () => {
  const { alice, t, quote, aliceId } = await setup();
  const jobId = await alice.mutation(api.generation.start, {
    quoteId: quote.quoteId,
    requestId: "request-success-0001",
  });
  const output = {
    jobId,
    key: `private/${aliceId}/output.mp4`,
    bytes: 123,
    duration: 6,
    width: 720,
    height: 1280,
  };
  await t.mutation(internal.generation.complete, output);
  await t.mutation(internal.generation.complete, output);
  await t.mutation(internal.generation.fail, { jobId, error: "Late failure" });
  expect((await alice.query(api.credits.balance))?.available).toBe(87);
  expect((await alice.query(api.credits.balance))?.reserved).toBe(0);
  const [job] = await alice.query(api.generation.list);
  expect(job.status).toBe("succeeded");
  expect(job.video?.visibility).toBe("private");
  expect(
    (
      await t.query(api.feed.list, {
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).page,
  ).toHaveLength(0);
  expect(
    (await alice.query(api.credits.history)).filter((e) => e.kind === "charge"),
  ).toHaveLength(1);
  expect(
    await t.run((ctx) => ctx.db.query("royaltiesLedger").take(10)),
  ).toHaveLength(0);
});
test("quotes and assets belong to their owner; removed permissions block new remixes", async () => {
  const { t, alice, bob, quote, input, aliceId } = await setup();
  await expect(
    bob.mutation(api.generation.start, {
      quoteId: quote.quoteId,
      requestId: "request-unauthorized",
    }),
  ).rejects.toThrow("Quote unavailable");
  await expect(
    bob.query(internal.generation.context, { input }),
  ).rejects.toThrow("Reference image");
  const videoId = await t.run((ctx) =>
    ctx.db.insert("videos", {
      creatorId: aliceId,
      assetId: input.sourceAssetId,
      title: "Source",
      description: "",
      playbackUrl: "https://example.com/published.mp4",
      visibility: "public",
      status: "published",
      publishedAt: 1,
      remixEnabled: true,
      royaltyEligible: true,
    }),
  );
  const remixQuote = await alice.mutation(internal.generation.saveQuote, {
    input: { ...input, sourceVideoId: videoId },
    supplierMaximumUsdMicros: 100000,
    creditsPerUsd: 100,
    markupBps: 3000,
  });
  await t.run((ctx) => ctx.db.patch(videoId, { remixEnabled: false }));
  await expect(
    alice.mutation(api.generation.start, {
      quoteId: remixQuote.quoteId,
      requestId: "request-permission-race",
    }),
  ).rejects.toThrow("not available");
  expect((await alice.query(api.credits.balance))?.available).toBe(100);
});
test("expired quotes and insufficient funds cannot create jobs", async () => {
  const { t, alice, quote } = await setup();
  await t.run((ctx) =>
    ctx.db.patch(quote.quoteId, { expiresAt: Date.now() - 1 }),
  );
  await expect(
    alice.mutation(api.generation.start, {
      quoteId: quote.quoteId,
      requestId: "request-expired-0001",
    }),
  ).rejects.toThrow("expired");
  await t.run((ctx) =>
    ctx.db.patch(quote.quoteId, {
      expiresAt: Date.now() + 10000,
      credits: 1000,
    }),
  );
  await expect(
    alice.mutation(api.generation.start, {
      quoteId: quote.quoteId,
      requestId: "request-balance-0001",
    }),
  ).rejects.toThrow("Not enough credits");
  expect(await alice.query(api.generation.list)).toHaveLength(0);
});
test("uncertain submissions retain funds and cannot purchase another render", async () => {
  const { t, alice, quote } = await setup();
  const jobId = await alice.mutation(api.generation.start, {
    quoteId: quote.quoteId,
    requestId: "request-uncertain-001",
  });
  expect(await t.mutation(internal.generation.claimSubmission, { jobId })).toBe(
    true,
  );
  expect(await t.mutation(internal.generation.claimSubmission, { jobId })).toBe(
    false,
  );
  await t.mutation(internal.generation.update, {
    jobId,
    status: "reconciliation_required",
    error: "Unknown submission",
  });
  expect((await alice.query(api.credits.balance))?.reserved).toBe(13);
  await expect(
    alice.mutation(api.generation.resume, { jobId }),
  ).rejects.toThrow("operator reconciliation");
});
test("welcome allocation and operator grants are idempotent", async () => {
  const { alice, t, aliceId } = await setup();
  vi.stubEnv("WELCOME_CREDITS", "50");
  await alice.mutation(api.credits.initialize, {});
  await alice.mutation(api.credits.initialize, {});
  await t.mutation(internal.credits.grant, {
    userId: aliceId,
    credits: 100,
    operationKey: "alice-grant",
  });
  expect((await alice.query(api.credits.balance))?.available).toBe(150);
});
test("prompt references and media limits fail before provider submission", () => {
  expect(() =>
    compileRemix({
      ...defaultStudioInput,
      referenceAssetIds: ["one"],
      prompt: "Use @image_2",
    }),
  ).toThrow("missing");
  expect(() => validateUpload("image/png", 11 * 1024 * 1024)).toThrow("10 MB");
  expect(() => validateUpload("application/javascript", 100)).toThrow("Choose");
  expect(
    compileRemix({
      ...defaultStudioInput,
      referenceAssetIds: ["one"],
      prompt: "Use @image_1 and @video_1",
      referenceVideoAssetId: "video",
    }),
  ).toContain("Use image 1 and video 1");
});
test("public playback checks visibility; unpublishing blocks playback and new remixes", async () => {
  const { t, alice, bob, quote, aliceId } = await setup();
  const jobId = await alice.mutation(api.generation.start, {
    quoteId: quote.quoteId,
    requestId: "request-publication-001",
  });
  await t.mutation(internal.generation.complete, {
    jobId,
    key: "private/output",
    bytes: 100,
    duration: 6,
    width: 720,
    height: 1280,
  });
  const [job] = await alice.query(api.generation.list);
  expect(
    await t.query(internal.media.publishedAsset, { videoId: job.videoId! }),
  ).toBeNull();
  await alice.mutation(api.profiles.save, {
    username: "alice",
    displayName: "Alice",
    bio: "",
  });
  await alice.mutation(internal.generation.publish, {
    jobId,
    title: "My video",
    description: "",
    remixEnabled: true,
    playbackUrl: "https://example.convex.site/media/video",
  });
  expect(
    (await t.query(internal.media.publishedAsset, { videoId: job.videoId! }))
      ?.userId,
  ).toBe(aliceId);
  await expect(
    bob.mutation(api.generation.unpublish, { jobId }),
  ).rejects.toThrow("unavailable");
  await alice.mutation(api.generation.unpublish, { jobId });
  expect(
    await t.query(internal.media.publishedAsset, { videoId: job.videoId! }),
  ).toBeNull();
  expect(
    await alice.query(api.media.source, { videoId: job.videoId! }),
  ).toBeNull();
});
test("purchased-funded remix snapshots two beneficiaries and settles pending royalties once", async () => {
  const { t, alice, quote, input, aliceId } = await setup();
  const { root, parent, rootCreator, parentCreator } = await t.run(
    async (ctx) => {
      const rootCreator = await ctx.db.insert("users", {});
      const parentCreator = await ctx.db.insert("users", {});
      const root = await ctx.db.insert("videos", {
        creatorId: rootCreator,
        title: "Root",
        description: "",
        playbackUrl: "https://example.com/root.mp4",
        visibility: "public",
        status: "published",
        publishedAt: 1,
        remixEnabled: true,
        royaltyEligible: true,
      });
      const parent = await ctx.db.insert("videos", {
        creatorId: parentCreator,
        rootVideoId: root,
        assetId: input.sourceAssetId,
        title: "Parent",
        description: "",
        playbackUrl: "https://example.com/parent.mp4",
        visibility: "public",
        status: "published",
        publishedAt: 2,
        remixEnabled: true,
        royaltyEligible: true,
      });
      const lots = await ctx.db
        .query("creditLots")
        .withIndex("by_userId", (q) => q.eq("userId", aliceId))
        .take(10);
      for (const lot of lots)
        await ctx.db.patch(lot._id, { kind: "purchased" });
      return { root, parent, rootCreator, parentCreator };
    },
  );
  const remixQuote = await alice.mutation(internal.generation.saveQuote, {
    input: { ...input, sourceVideoId: parent },
    supplierMaximumUsdMicros: 100000,
    creditsPerUsd: 100,
    markupBps: 3000,
  });
  const jobId = await alice.mutation(api.generation.start, {
    quoteId: remixQuote.quoteId,
    requestId: "request-paid-remix-001",
  });
  const output = {
    jobId,
    key: "private/royalty-output.mp4",
    bytes: 100,
    duration: 6,
    width: 720,
    height: 1280,
  };
  await t.mutation(internal.generation.complete, output);
  await t.mutation(internal.generation.complete, output);
  const entries = await t.run((ctx) =>
    ctx.db
      .query("royaltiesLedger")
      .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
      .take(10),
  );
  expect(entries.map((e) => [e.userId, e.usdMicros])).toEqual([
    [rootCreator, 10000],
    [parentCreator, 5000],
  ]);
  const [job] = await alice.query(api.generation.list);
  expect(job.video?.rootVideoId).toBe(root);
  expect(job.video?.parentVideoId).toBe(parent);
  expect(job.video?.visibility).toBe("private");
});

test("balance supports anonymous sessions and signed-in users without a credit account", async () => {
  const t = convexTest(schema, modules);
  expect(await t.query(api.credits.balance, {})).toBeNull();
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  const user = t.withIdentity({ subject: `${userId}|session` });
  expect(await user.query(api.credits.balance, {})).toEqual({
    available: 0,
    reserved: 0,
    activeJobs: 0,
    welcomeGranted: false,
  });
});

test("Create reference videos accept 15 seconds and reject longer existing assets", async () => {
  const { t, alice, assetIds, input } = await setup();
  const createInput = {
    ...input,
    mode: "create" as const,
    sourceAssetId: undefined,
    referenceVideoAssetId: assetIds.source,
  };
  await t.run(async (ctx) => {
    await ctx.db.patch(assetIds.source, { duration: 15 });
  });
  await expect(
    alice.mutation(internal.generation.saveQuote, {
      input: createInput,
      supplierMaximumUsdMicros: 100000,
      creditsPerUsd: 100,
      markupBps: 3000,
    }),
  ).resolves.toBeDefined();
  await t.run(async (ctx) => {
    await ctx.db.patch(assetIds.source, { duration: 15.01 });
  });
  await expect(
    alice.mutation(internal.generation.saveQuote, {
      input: createInput,
      supplierMaximumUsdMicros: 100000,
      creditsPerUsd: 100,
      markupBps: 3000,
    }),
  ).rejects.toThrow("reference video between 4 and 15 seconds");
});

test("credit reservation atomically queues one worker task and expired leases cannot write", async () => {
  const { t, alice, quote } = await setup();
  const args = { quoteId: quote.quoteId, requestId: "worker-request-00001" };
  const jobId = await alice.mutation(api.generation.start, args);
  await alice.mutation(api.generation.start, args);
  expect(await t.run((ctx) => ctx.db.query("apiTasks").take(10))).toHaveLength(
    1,
  );
  const first = (await t.mutation(internal.tasks.claim, {}))!;
  expect(first.jobId).toBe(jobId);
  expect(await t.mutation(internal.tasks.claim, {})).toBeNull();
  await t.mutation(internal.tasks.commit, {
    taskId: first._id,
    token: first.leaseToken,
    operation: "generation:claimSubmission",
    args: { jobId },
  });
  vi.advanceTimersByTime(300001);
  const second = (await t.mutation(internal.tasks.claim, {}))!;
  expect(second.leaseToken).not.toBe(first.leaseToken);
  await expect(
    t.mutation(internal.tasks.commit, {
      taskId: first._id,
      token: first.leaseToken,
      operation: "generation:recordProvider",
      args: { jobId, providerJobId: "stale" },
    }),
  ).rejects.toThrow("lease expired");
  expect(
    await t.mutation(internal.tasks.commit, {
      taskId: second._id,
      token: second.leaseToken,
      operation: "generation:claimSubmission",
      args: { jobId },
    }),
  ).toBe(false);
  const [job] = await alice.query(api.generation.list);
  expect(job.status).toBe("reconciliation_required");
  expect((await alice.query(api.credits.balance))?.reserved).toBe(13);
});

test("poll tasks retain scheduling requested during their active lease", async () => {
  const { t, alice, quote } = await setup();
  const jobId = await alice.mutation(api.generation.start, {
    quoteId: quote.quoteId,
    requestId: "poll-request-000001",
  });
  const submit = (await t.mutation(internal.tasks.claim, {}))!;
  await t.mutation(internal.tasks.commit, {
    taskId: submit._id,
    token: submit.leaseToken,
    operation: "generation:recordProvider",
    args: { jobId, providerJobId: "provider-1" },
  });
  await t.mutation(internal.tasks.finish, {
    taskId: submit._id,
    token: submit.leaseToken,
  });
  vi.advanceTimersByTime(10001);
  const poll = (await t.mutation(internal.tasks.claim, {}))!;
  await t.mutation(internal.tasks.commit, {
    taskId: poll._id,
    token: poll.leaseToken,
    operation: "generation:update",
    args: { jobId, status: "generating", schedule: true },
  });
  await t.mutation(internal.tasks.finish, {
    taskId: poll._id,
    token: poll.leaseToken,
  });
  expect(await t.mutation(internal.tasks.claim, {})).toBeNull();
  vi.advanceTimersByTime(15001);
  expect((await t.mutation(internal.tasks.claim, {}))?.jobId).toBe(jobId);
});

test("upload completion claims protect ownership and keep uncertain copies recoverable", async () => {
  const { t, alice, bob } = await setup();
  const assetId = await alice.mutation(internal.media.createUpload, {
    name: "clip.mp4",
    contentType: "video/mp4",
    bytes: 100,
  });
  await expect(
    bob.mutation(internal.media.claimCompletion, { assetId }),
  ).rejects.toThrow("Media unavailable");
  const first = await alice.mutation(internal.media.claimCompletion, {
    assetId,
  });
  await expect(
    alice.mutation(internal.media.claimCompletion, { assetId }),
  ).rejects.toThrow("already in progress");
  vi.advanceTimersByTime(300001);
  const second = await alice.mutation(internal.media.claimCompletion, {
    assetId,
  });
  expect(second.asset.sealedKey).not.toBe(first.asset.sealedKey);
  const metadata = {
    assetId,
    token: first.token!,
    key: first.asset.sealedKey!,
    width: 720,
    height: 1280,
    duration: 15,
  };
  await expect(alice.mutation(internal.media.seal, metadata)).rejects.toThrow(
    "verification expired",
  );
  await alice.mutation(internal.media.seal, {
    ...metadata,
    token: second.token!,
    key: second.asset.sealedKey!,
  });
  const garbage = await t.run((ctx) => ctx.db.query("mediaGarbage").take(10));
  expect(garbage.some((row) => row.key === first.asset.sealedKey)).toBe(true);
  expect(garbage.some((row) => row.key === second.asset.sealedKey)).toBe(false);
  expect(
    (await alice.mutation(internal.media.claimCompletion, { assetId })).token,
  ).toBeNull();
});
