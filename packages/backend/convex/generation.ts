import {
  CREDITS_PER_USD,
  PRICING_VERSION,
  generationPrice,
  currentCredits,
  GENERATION_SURCHARGE_USD_MICROS,
  GENERATION_SURCHARGE_CREDITS,
  ROYALTY_RULE_VERSION,
  ROOT_REWARD_USD_MICROS,
  PARENT_REWARD_USD_MICROS,
} from "@virel/shared";
import { assertCreditWrites, assertCurrentAccount } from "./creditPricing";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import { enqueue } from "./tasks";
import { studioInput } from "./studioValidators";
import { requireUser, resolveInput } from "./studioAccess";
import { accountFor } from "./credits";
import { settleRewards, reverseRewards } from "./rewards";
import type { Id, Doc } from "./_generated/dataModel";
// Convex can normalize object key order when persisting input. Compare values, not insertion order.
function inputKey(input: unknown): string {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .filter(([, v]) => v !== undefined)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, canonical(v)]),
          )
        : value;
  return JSON.stringify(canonical(input));
}
type FundingKind = "purchased" | "promotional" | "mixed" | "insufficient";
function fundingKind(
  allocations: { kind: "purchased" | "promotional" }[],
  remaining = 0,
): FundingKind {
  if (remaining || !allocations.length) return "insufficient";
  return allocations.every((a) => a.kind === "purchased")
    ? "purchased"
    : allocations.every((a) => a.kind === "promotional")
      ? "promotional"
      : "mixed";
}
async function previewFunding(
  ctx: MutationCtx,
  userId: Id<"users">,
  credits: number,
) {
  let remaining = credits;
  const allocations: { kind: "purchased" | "promotional" }[] = [];
  for await (const lot of ctx.db
    .query("creditLots")
    .withIndex("by_userId", (q) => q.eq("userId", userId))) {
    const amount = Math.min(
      remaining,
      currentCredits(lot.available, lot.creditsPerUsd),
    );
    if (amount > 0) {
      remaining -= amount;
      allocations.push({ kind: lot.kind });
    }
    if (!remaining) break;
  }
  return fundingKind(allocations, remaining);
}
export const context = internalQuery({
  args: { input: studioInput },
  handler: async (ctx, { input }) => {
    const userId = await requireUser(ctx);
    const resolved = await resolveInput(ctx, userId, input);
    const references = await Promise.all(
      input.referenceAssetIds.map((id) => ctx.db.get(id)),
    );
    return { userId, ...resolved, references };
  },
});
export const saveQuote = internalMutation({
  args: {
    input: studioInput,
    supplierMaximumUsdMicros: v.number(),
    creditsPerUsd: v.number(),
    markupBps: v.number(),
    supplierEstimateUsdMicros: v.optional(v.number()),
    bufferBps: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const { input, parent: resolvedParent } = await resolveInput(
      ctx,
      userId,
      args.input,
    );
    const parent = input.mode === "remix" ? resolvedParent : null;
    await assertCreditWrites(ctx);
    if (args.creditsPerUsd !== CREDITS_PER_USD)
      throw new Error("Generation pricing must use 1,000 credits per USD.");
    const calculated = generationPrice(
      args.supplierEstimateUsdMicros ?? args.supplierMaximumUsdMicros,
      args.markupBps,
      args.supplierEstimateUsdMicros === undefined
        ? 0
        : (args.bufferBps ?? 500),
    );
    if (calculated.supplierMaximumUsdMicros !== args.supplierMaximumUsdMicros)
      throw new Error("Supplier maximum does not match the quote.");
    const credits = calculated.credits;
    if (!Number.isSafeInteger(credits) || credits <= 0 || credits > 1000000)
      throw new Error("Invalid generation quote.");
    const funding = await previewFunding(ctx, userId, credits);
    const rootId = parent?.rootVideoId ?? parent?._id;
    const root = rootId ? await ctx.db.get(rootId) : null;
    const royaltyEligible =
      funding === "purchased" &&
      Boolean(root?.royaltyEligible) &&
      Boolean(
        root?.creatorId !== userId ||
        (parent &&
          (parent.lineageDepth ?? (parent._id !== root?._id ? 1 : 0)) > 0 &&
          parent.creatorId !== userId),
      );
    const rewardMessage = !parent
      ? "This creation has no remix beneficiaries."
      : funding !== "purchased"
        ? "Only generations funded entirely with purchased credits earn creator rewards; promotional or mixed funding does not qualify."
        : !root?.royaltyEligible
          ? "This source is not eligible for creator rewards."
          : !royaltyEligible
            ? "Self-remix rewards are excluded."
            : "This remix qualifies for creator rewards using your purchased credits.";
    const id = await ctx.db.insert("generationQuotes", {
      ...args,
      input,
      inputKey: inputKey(input),
      userId,
      credits,
      pricingVersion: PRICING_VERSION,
      surchargeUsdMicros: GENERATION_SURCHARGE_USD_MICROS,
      royaltyRuleVersion: ROYALTY_RULE_VERSION,
      fundingKind: funding,
      royaltyEligible,
      expiresAt: Date.now() + 5 * 60000,
    });
    return {
      quoteId: id,
      credits,
      surchargeCredits: GENERATION_SURCHARGE_CREDITS,
      royaltyEligible,
      rewardMessage,
      duration: input.duration,
      expiresAt: Date.now() + 5 * 60000,
    };
  },
});
export const start = mutation({
  args: { quoteId: v.id("generationQuotes"), requestId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (!/^[a-zA-Z0-9-]{16,100}$/.test(args.requestId))
      throw new Error("Invalid request identifier.");
    const existing = await ctx.db
      .query("generationJobs")
      .withIndex("by_userId_and_requestId", (q) =>
        q.eq("userId", userId).eq("requestId", args.requestId),
      )
      .unique();
    if (existing) {
      if (existing.quoteId !== args.quoteId)
        throw new Error("Request identifier already used.");
      return existing._id;
    }
    const quote = await ctx.db.get(args.quoteId);
    if (!quote || quote.userId !== userId)
      throw new Error("Quote unavailable.");
    const quotedJob = await ctx.db
      .query("generationJobs")
      .withIndex("by_quoteId", (q) => q.eq("quoteId", args.quoteId))
      .unique();
    if (quotedJob) return quotedJob._id;
    if (quote.expiresAt < Date.now())
      throw new Error("Quote expired. Review the new credit cost.");
    await assertCreditWrites(ctx);
    if (
      quote.pricingVersion !== PRICING_VERSION ||
      quote.creditsPerUsd !== CREDITS_PER_USD ||
      quote.surchargeUsdMicros !== GENERATION_SURCHARGE_USD_MICROS ||
      quote.royaltyRuleVersion !== ROYALTY_RULE_VERSION
    )
      throw new Error("Quote pricing changed. Review the new credit cost.");
    const { input, parent: resolvedParent } = await resolveInput(
      ctx,
      userId,
      quote.input,
    );
    const parent = input.mode === "remix" ? resolvedParent : null;
    if (inputKey(input) !== quote.inputKey)
      throw new Error("Source changed. Request a new quote.");
    const account = await accountFor(ctx, userId);
    assertCurrentAccount(account);
    if (account.activeJobs >= 3)
      throw new Error("Wait for a current generation to finish.");
    if (account.available < quote.credits)
      throw new Error("Not enough credits for this video.");
    const lots = ctx.db
      .query("creditLots")
      .withIndex("by_userId", (q) => q.eq("userId", userId));
    let remaining = quote.credits;
    const allocations: Doc<"generationJobs">["allocations"] = [];
    for await (const lot of lots) {
      if (lot.creditsPerUsd !== CREDITS_PER_USD)
        throw new Error("Credit funding needs denomination migration.");
      const credits = Math.min(remaining, lot.available);
      if (!credits) continue;
      allocations.push({ lotId: lot._id, credits, kind: lot.kind });
      await ctx.db.patch(lot._id, {
        available: lot.available - credits,
        reserved: lot.reserved + credits,
      });
      remaining -= credits;
      if (!remaining) break;
    }
    if (remaining) throw new Error("Credit funding needs reconciliation.");
    const funding = fundingKind(allocations);
    if (parent && funding !== quote.fundingKind)
      throw new Error(
        "Funding changed. Review the new quote and reward eligibility.",
      );
    const beneficiaries = new Map<Id<"users">, number>();
    const rootId = parent?.rootVideoId ?? parent?._id;
    const root = rootId ? await ctx.db.get(rootId) : null;
    if (
      allocations.every((a) => a.kind === "purchased") &&
      root?.royaltyEligible
    ) {
      if (root.creatorId !== userId)
        beneficiaries.set(root.creatorId, ROOT_REWARD_USD_MICROS);
      if (
        parent &&
        (parent.lineageDepth ?? (parent._id !== root._id ? 1 : 0)) > 0 &&
        parent.creatorId !== userId
      )
        beneficiaries.set(
          parent.creatorId,
          (beneficiaries.get(parent.creatorId) ?? 0) + PARENT_REWARD_USD_MICROS,
        );
    }
    if (parent && Boolean(beneficiaries.size) !== quote.royaltyEligible)
      throw new Error("Reward eligibility changed. Review the new quote.");
    const jobId = await ctx.db.insert("generationJobs", {
      userId,
      input,
      quoteId: quote._id,
      requestId: args.requestId,
      status: "reserved",
      credits: quote.credits,
      surchargeUsdMicros: quote.surchargeUsdMicros,
      royaltyRuleVersion: quote.royaltyRuleVersion,
      fundingKind: funding,
      creditsPerUsd: CREDITS_PER_USD,
      financialState: "reserved",
      allocations,
      supplierMaximumUsdMicros: quote.supplierMaximumUsdMicros,
      parentVideoId: parent?._id,
      rootVideoId: rootId,
      royaltyBeneficiaries: [...beneficiaries].map(([userId, usdMicros]) => ({
        userId,
        usdMicros,
      })),
      updatedAt: Date.now(),
      pollCount: 0,
    });
    await ctx.db.patch(account._id, {
      available: account.available - quote.credits,
      reserved: account.reserved + quote.credits,
      activeJobs: account.activeJobs + 1,
    });
    await ctx.db.insert("creditLedger", {
      userId,
      creditsPerUsd: CREDITS_PER_USD,
      kind: "reserve",
      amount: -quote.credits,
      jobId,
      operationKey: `reserve:${jobId}`,
      note: "Video generation reserved",
    });
    await enqueue(ctx, "submit", jobId);
    return jobId;
  },
});
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const jobs = await ctx.db
      .query("generationJobs")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(30);
    return await Promise.all(
      jobs.map(async (job) => ({
        ...job,
        credits: currentCredits(job.credits, job.creditsPerUsd),
        video: job.videoId ? await ctx.db.get(job.videoId) : null,
      })),
    );
  },
});
// The creation library spans every mode and script, with no history cutoff.
export const library = query({
  args: {
    paginationOpts: paginationOptsValidator,
    filter: v.union(
      v.literal("all"),
      v.literal("progress"),
      v.literal("ready"),
      v.literal("failed"),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    let jobs = ctx.db
      .query("generationJobs")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc");
    if (args.filter === "all")
      jobs = jobs.filter((q) => q.neq(q.field("status"), "failed"));
    if (args.filter === "ready")
      jobs = jobs.filter((q) => q.eq(q.field("status"), "succeeded"));
    if (args.filter === "failed")
      jobs = jobs.filter((q) => q.eq(q.field("status"), "failed"));
    if (args.filter === "progress")
      jobs = jobs.filter((q) =>
        q.and(
          q.neq(q.field("status"), "succeeded"),
          q.neq(q.field("status"), "failed"),
        ),
      );
    const page = await jobs.paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (job) => ({
          ...job,
          credits: currentCredits(job.credits, job.creditsPerUsd),
          video: job.videoId ? await ctx.db.get(job.videoId) : null,
        })),
      ),
    };
  },
});
export const detail = query({
  args: { jobId: v.string() },
  handler: async (ctx, { jobId }) => {
    const userId = await requireUser(ctx);
    const id = ctx.db.normalizeId("generationJobs", jobId);
    const job = id ? await ctx.db.get(id) : null;
    if (!job || job.userId !== userId) return null;
    return {
      ...job,
      credits: currentCredits(job.credits, job.creditsPerUsd),
      video: job.videoId ? await ctx.db.get(job.videoId) : null,
    };
  },
});
export const jobContext = internalQuery({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Job unavailable.");
    return {
      job,
      source:
        (job.input.sourceAssetId ?? job.input.referenceVideoAssetId)
          ? await ctx.db.get(
              (job.input.sourceAssetId ?? job.input.referenceVideoAssetId)!,
            )
          : null,
      references: await Promise.all(
        job.input.referenceAssetIds.map((id) => ctx.db.get(id)),
      ),
    };
  },
});
export const ownedJob = internalQuery({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, { jobId }) => {
    const userId = await requireUser(ctx);
    const job = await ctx.db.get(jobId);
    if (!job || job.userId !== userId) throw new Error("Job unavailable.");
    return {
      job,
      asset: job.outputAssetId ? await ctx.db.get(job.outputAssetId) : null,
      video: job.videoId ? await ctx.db.get(job.videoId) : null,
    };
  },
});
export const claimSubmission = internalMutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job || job.financialState !== "reserved") return false;
    // A duplicate claim can arrive while the first worker is still submitting.
    // Leave that worker in control; the stale-job sweep handles actual interruptions.
    if (
      job.status === "submitting" &&
      !job.providerJobId &&
      Date.now() - job.updatedAt >= 300000
    ) {
      await ctx.db.patch(jobId, {
        status: "reconciliation_required",
        updatedAt: Date.now(),
        error:
          "Submission lease expired. Reconcile the provider request before retrying.",
      });
      return false;
    }
    if (job.status !== "reserved") return false;
    await ctx.db.patch(jobId, { status: "submitting", updatedAt: Date.now() });
    return true;
  },
});
export const recordProvider = internalMutation({
  args: { jobId: v.id("generationJobs"), providerJobId: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.financialState !== "reserved") return;
    if (job.providerJobId && job.providerJobId !== args.providerJobId)
      throw new Error("Provider job mismatch.");
    await ctx.db.patch(args.jobId, {
      providerJobId: args.providerJobId,
      status: "queued",
      updatedAt: Date.now(),
      error: undefined,
    });
    await enqueue(ctx, "poll", args.jobId, 10000);
  },
});
export const update = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    status: v.union(
      v.literal("generating"),
      v.literal("ingesting"),
      v.literal("reconciliation_required"),
    ),
    error: v.optional(v.string()),
    supplierActualUsdMicros: v.optional(v.number()),
    schedule: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.financialState !== "reserved") return;
    await ctx.db.patch(job._id, {
      status: args.status,
      error: args.error,
      supplierActualUsdMicros:
        args.supplierActualUsdMicros ?? job.supplierActualUsdMicros,
      updatedAt: Date.now(),
      pollCount: job.pollCount + 1,
    });
    if (args.schedule) await enqueue(ctx, "poll", job._id, 15000);
  },
});
export const fail = internalMutation({
  args: { jobId: v.id("generationJobs"), error: v.string() },
  handler: async (ctx, { jobId, error }) => {
    const job = await ctx.db.get(jobId);
    if (!job || job.financialState !== "reserved") return;
    const account = await accountFor(ctx, job.userId);
    for (const allocation of job.allocations) {
      const lot = await ctx.db.get(allocation.lotId);
      if (!lot) throw new Error("Credit lot missing.");
      await ctx.db.patch(lot._id, {
        available: lot.available + allocation.credits,
        reserved: lot.reserved - allocation.credits,
      });
    }
    await ctx.db.patch(account._id, {
      available: account.available + job.credits,
      reserved: account.reserved - job.credits,
      activeJobs: account.activeJobs - 1,
    });
    await ctx.db.insert("creditLedger", {
      userId: job.userId,
      jobId,
      creditsPerUsd: job.creditsPerUsd ?? 100,
      kind: "release",
      amount: job.credits,
      operationKey: `release:${jobId}`,
      note: "Generation failed; reserved credits returned",
    });
    await ctx.db.patch(jobId, {
      status: "failed",
      financialState: "released",
      error,
      updatedAt: Date.now(),
    });
  },
});
export const complete = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    key: v.string(),
    bytes: v.number(),
    duration: v.number(),
    width: v.number(),
    height: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.financialState !== "reserved") return;
    const assetId = await ctx.db.insert("mediaAssets", {
      userId: job.userId,
      key: args.key,
      bytes: args.bytes,
      name: `Version ${new Date(job._creationTime).toISOString()}`,
      type: "video",
      contentType: "video/mp4",
      status: "ready",
      generated: true,
      duration: args.duration,
      width: args.width,
      height: args.height,
    });
    const videoId = await ctx.db.insert("videos", {
      creatorId: job.userId,
      assetId,
      jobId: job._id,
      rootVideoId: job.rootVideoId,
      parentVideoId: job.parentVideoId,
      lineageDepth: job.parentVideoId
        ? ((await ctx.db.get(job.parentVideoId))?.lineageDepth ??
            (job.parentVideoId !== job.rootVideoId ? 1 : 0)) + 1
        : 0,
      title: job.input.prompt.slice(0, 100),
      description: "",
      playbackUrl: "",
      visibility: "private",
      status: "draft",
      publishedAt: 0,
      remixEnabled: false,
      royaltyEligible: job.parentVideoId
        ? Boolean((await ctx.db.get(job.rootVideoId!))?.royaltyEligible)
        : true,
    });
    const account = await accountFor(ctx, job.userId);
    for (const allocation of job.allocations) {
      const lot = await ctx.db.get(allocation.lotId);
      if (!lot) throw new Error("Credit lot missing.");
      await ctx.db.patch(lot._id, {
        reserved: lot.reserved - allocation.credits,
      });
    }
    await ctx.db.patch(account._id, {
      reserved: account.reserved - job.credits,
      activeJobs: account.activeJobs - 1,
    });
    await ctx.db.insert("creditLedger", {
      userId: job.userId,
      jobId: job._id,
      creditsPerUsd: job.creditsPerUsd ?? 100,
      kind: "charge",
      amount: -job.credits,
      operationKey: `charge:${job._id}`,
      note: "Video completed (reserved credits spent)",
    });
    await settleRewards(ctx, job);
    await ctx.db.patch(job._id, {
      status: "succeeded",
      financialState: "settled",
      outputAssetId: assetId,
      videoId,
      updatedAt: Date.now(),
      error: undefined,
    });
  },
});
export const publish = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    playbackUrl: v.string(),
    title: v.string(),
    description: v.string(),
    remixEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const job = await ctx.db.get(args.jobId);
    if (
      !job ||
      job.userId !== userId ||
      job.status !== "succeeded" ||
      job.financialState === "refunded" ||
      !job.videoId
    )
      throw new Error("Result unavailable.");
    if (
      !args.title.trim() ||
      args.title.length > 100 ||
      args.description.length > 2000
    )
      throw new Error(
        "Use a title under 100 characters and description under 2,000 characters.",
      );
    if (
      !(await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique())
    )
      throw new Error("Create your profile before publishing.");
    await ctx.db.patch(job.videoId, {
      title: args.title.trim(),
      description: args.description.trim(),
      remixEnabled: args.remixEnabled,
      playbackUrl: args.playbackUrl,
      visibility: "public",
      status: "published",
      publishedAt: Date.now(),
    });
    return job.videoId;
  },
});
export const resume = mutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, { jobId }) => {
    const userId = await requireUser(ctx);
    const job = await ctx.db.get(jobId);
    if (
      !job ||
      job.userId !== userId ||
      job.financialState !== "reserved" ||
      !job.providerJobId
    )
      throw new Error(
        "This job needs operator reconciliation before it can resume.",
      );
    if (Date.now() - job.updatedAt < 15000)
      throw new Error("Please wait before checking again.");
    await ctx.db.patch(jobId, { updatedAt: Date.now() });
    await enqueue(ctx, "poll", jobId);
  },
});
export const myPublished = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return (
      await ctx.db
        .query("videos")
        .withIndex("by_creator", (q) => q.eq("creatorId", userId))
        .order("desc")
        .take(50)
    ).filter(
      (video) => video.visibility === "public" && video.status === "published",
    );
  },
});
// Operators reconcile an uncertain submission against the provider's request logs.
// Attaching a known job resumes polling; it never submits another paid render.
export const reconcileProvider = internalMutation({
  args: { jobId: v.id("generationJobs"), providerJobId: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (
      !job ||
      job.financialState !== "reserved" ||
      job.status !== "reconciliation_required" ||
      job.providerJobId ||
      !args.providerJobId.trim()
    )
      throw new Error("Job is not awaiting provider reconciliation.");
    await ctx.db.patch(job._id, {
      providerJobId: args.providerJobId,
      status: "queued",
      updatedAt: Date.now(),
    });
    await enqueue(ctx, "poll", job._id);
  },
});
export const recoverStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const status of [
      "reserved",
      "submitting",
      "queued",
      "generating",
      "ingesting",
    ] as const) {
      const jobs = await ctx.db
        .query("generationJobs")
        .withIndex("by_status_and_updatedAt", (q) =>
          q.eq("status", status).lt("updatedAt", Date.now() - 10 * 60000),
        )
        .take(10);
      for (const job of jobs) {
        if (job.financialState !== "reserved") continue;
        if (status === "reserved") await enqueue(ctx, "submit", job._id);
        else if (!job.providerJobId)
          await ctx.db.patch(job._id, {
            status: "reconciliation_required",
            updatedAt: Date.now(),
            error:
              "Submission was interrupted. Support must reconcile the provider request before any retry.",
          });
        else await enqueue(ctx, "poll", job._id);
        if (job.providerJobId || status === "reserved")
          await ctx.db.patch(job._id, { updatedAt: Date.now() });
      }
    }
  },
});
export const unpublish = mutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, { jobId }) => {
    const userId = await requireUser(ctx);
    const job = await ctx.db.get(jobId);
    if (!job || job.userId !== userId || !job.videoId)
      throw new Error("Video unavailable.");
    await ctx.db.patch(job.videoId, {
      visibility: "private",
      status: "draft",
      remixEnabled: false,
    });
  },
});

// Operator-only confirmed refund. Credit return and reward reversals commit together.
export const refund = internalMutation({
  args: { jobId: v.id("generationJobs"), reason: v.string() },
  handler: async (ctx, args) => {
    const reason = args.reason.trim();
    if (!reason || reason.length > 500)
      throw new Error("A refund reason is required.");
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Generation unavailable.");
    if (job.financialState === "refunded") return;
    if (job.financialState !== "settled")
      throw new Error("Only settled generations can be refunded.");
    await assertCreditWrites(ctx);
    const account = await accountFor(ctx, job.userId);
    assertCurrentAccount(account);
    const credits = currentCredits(job.credits, job.creditsPerUsd);
    if (!Number.isSafeInteger(account.available + account.reserved + credits))
      throw new Error("Credit balance exceeds the supported limit.");
    const allocated = job.allocations.reduce(
      (total, a) => total + currentCredits(a.credits, job.creditsPerUsd),
      0,
    );
    if (!Number.isSafeInteger(allocated) || allocated !== credits)
      throw new Error("Credit funding needs reconciliation.");
    for (const allocation of job.allocations) {
      const lot = await ctx.db.get(allocation.lotId);
      if (!lot || lot.creditsPerUsd !== CREDITS_PER_USD)
        throw new Error("Credit funding needs reconciliation.");
      const available =
        lot.available + currentCredits(allocation.credits, job.creditsPerUsd);
      if (!Number.isSafeInteger(available))
        throw new Error("Credit balance exceeds the supported limit.");
      await ctx.db.patch(lot._id, { available });
    }
    await reverseRewards(ctx, job._id, reason);
    await ctx.db.patch(account._id, { available: account.available + credits });
    await ctx.db.insert("creditLedger", {
      userId: job.userId,
      jobId: job._id,
      creditsPerUsd: CREDITS_PER_USD,
      kind: "refund",
      amount: credits,
      operationKey: `refund:${job._id}`,
      note: reason,
    });
    await ctx.db.patch(job._id, {
      financialState: "refunded",
      updatedAt: Date.now(),
    });
    if (job.videoId)
      await ctx.db.patch(job.videoId, {
        status: "hidden",
        visibility: "private",
        remixEnabled: false,
      });
  },
});
