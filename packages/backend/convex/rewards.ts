import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  env,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id, Doc } from "./_generated/dataModel";
import { requireUser } from "./studioAccess";

function safe(value: number) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("Reward balance needs reconciliation.");
  return value;
}
async function accountFor(ctx: MutationCtx, userId: Id<"users">) {
  const account = await ctx.db
    .query("rewardAccounts")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (account) return account;
  const id = await ctx.db.insert("rewardAccounts", {
    userId,
    pendingUsdMicros: 0,
    availableUsdMicros: 0,
    earnedUsdMicros: 0,
    hidden: false,
    historySynced: false,
  });
  return (await ctx.db.get(id))!;
}
async function eventFor(ctx: MutationCtx, key: string) {
  return ctx.db
    .query("rewardEvents")
    .withIndex("by_operationKey", (q) => q.eq("operationKey", key))
    .unique();
}
/** The original royalty entry is immutable. A unique receipt makes historical imports repeat-safe. */
export async function postAward(
  ctx: MutationCtx,
  award: Doc<"royaltiesLedger">,
) {
  const operationKey = `award:${award._id}`;
  if (await eventFor(ctx, operationKey)) return;
  safe(award.usdMicros);
  const account = await accountFor(ctx, award.userId);
  await ctx.db.patch(account._id, {
    pendingUsdMicros: safe(account.pendingUsdMicros + award.usdMicros),
    earnedUsdMicros: safe(account.earnedUsdMicros + award.usdMicros),
  });
  await ctx.db.insert("rewardEvents", {
    userId: award.userId,
    jobId: award.jobId,
    awardId: award._id,
    occurredAt: award._creationTime,
    kind: "award",
    usdMicros: award.usdMicros,
    operationKey,
    note: "Pending remix reward",
  });
}
/** Run inside generation settlement, alongside the credit charge and video creation. */
export async function settleRewards(
  ctx: MutationCtx,
  job: Doc<"generationJobs">,
) {
  const beneficiaries = job.royaltyBeneficiaries;
  const creatorUsdMicros = beneficiaries.reduce(
    (sum, b) => safe(sum + b.usdMicros),
    0,
  );
  if (
    beneficiaries.length > 2 ||
    new Set(beneficiaries.map((b) => b.userId)).size !== beneficiaries.length ||
    beneficiaries.some((b) => b.userId === job.userId)
  )
    throw new Error("Invalid reward distribution.");
  if (job.surchargeUsdMicros !== undefined) {
    safe(job.surchargeUsdMicros);
    if (creatorUsdMicros > job.surchargeUsdMicros)
      throw new Error("Rewards exceed the generation surcharge.");
    await ctx.db.insert("generationDistributions", {
      jobId: job._id,
      kind: "settlement",
      surchargeUsdMicros: job.surchargeUsdMicros,
      creatorUsdMicros,
      platformUsdMicros: job.surchargeUsdMicros - creatorUsdMicros,
      fundingKind: job.fundingKind ?? "legacy",
      royaltyRuleVersion: job.royaltyRuleVersion ?? "legacy",
    });
  }
  for (const beneficiary of beneficiaries) {
    const id = await ctx.db.insert("royaltiesLedger", {
      ...beneficiary,
      jobId: job._id,
      status: "pending",
    });
    await postAward(ctx, (await ctx.db.get(id))!);
  }
}
export async function reverseRewards(
  ctx: MutationCtx,
  jobId: Id<"generationJobs">,
  reason: string,
) {
  const awards = await ctx.db
    .query("royaltiesLedger")
    .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
    .take(3);
  if (awards.length > 2)
    throw new Error("Reward distribution needs reconciliation.");
  for (const award of awards) {
    const operationKey = `reversal:${award._id}`;
    if (await eventFor(ctx, operationKey)) continue;
    await postAward(ctx, award);
    const released = await eventFor(ctx, `release:${award._id}`);
    const account = await accountFor(ctx, award.userId);
    await ctx.db.patch(account._id, {
      pendingUsdMicros: safe(
        account.pendingUsdMicros - (released ? 0 : award.usdMicros),
      ),
      availableUsdMicros: safe(
        account.availableUsdMicros - (released ? award.usdMicros : 0),
      ),
      earnedUsdMicros: safe(account.earnedUsdMicros - award.usdMicros),
    });
    await ctx.db.insert("rewardEvents", {
      userId: award.userId,
      jobId,
      awardId: award._id,
      kind: "reversal",
      occurredAt: Math.max(Date.now(), award._creationTime),
      usdMicros: -award.usdMicros,
      operationKey,
      note: reason,
    });
  }
  const distribution = await ctx.db
    .query("generationDistributions")
    .withIndex("by_jobId_and_kind", (q) =>
      q.eq("jobId", jobId).eq("kind", "settlement"),
    )
    .unique();
  const reversed = await ctx.db
    .query("generationDistributions")
    .withIndex("by_jobId_and_kind", (q) =>
      q.eq("jobId", jobId).eq("kind", "reversal"),
    )
    .unique();
  if (distribution && !reversed)
    await ctx.db.insert("generationDistributions", {
      jobId,
      kind: "reversal",
      surchargeUsdMicros: -distribution.surchargeUsdMicros,
      creatorUsdMicros: -distribution.creatorUsdMicros,
      platformUsdMicros: -distribution.platformUsdMicros,
      fundingKind: distribution.fundingKind,
      royaltyRuleVersion: distribution.royaltyRuleVersion,
      reason,
    });
}
export const balance = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const account = await ctx.db
      .query("rewardAccounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const hidden = account?.hidden ?? false;
    return {
      hidden,
      pendingUsdMicros: hidden ? null : (account?.pendingUsdMicros ?? 0),
      availableUsdMicros: hidden ? null : (account?.availableUsdMicros ?? 0),
      earnedUsdMicros: hidden ? null : (account?.earnedUsdMicros ?? 0),
      syncing: !account?.historySynced,
      withdrawalsEnabled: false,
    };
  },
});
export const history = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const account = await ctx.db
      .query("rewardAccounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const page = await ctx.db
      .query("rewardEvents")
      .withIndex("by_userId_and_occurredAt", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((e) => ({
        _id: e._id,
        createdAt: e.occurredAt,
        kind: e.kind,
        usdMicros: account?.hidden ? null : e.usdMicros,
        note: e.note,
      })),
    };
  },
});
export const setHidden = mutation({
  args: { hidden: v.boolean() },
  handler: async (ctx, args) => {
    const account = await accountFor(ctx, await requireUser(ctx));
    await ctx.db.patch(account._id, { hidden: args.hidden });
  },
});
async function syncBatch(
  ctx: MutationCtx,
  userId: Id<"users">,
  cursor: string | null,
) {
  const account = await accountFor(ctx, userId);
  if (account.historySynced) return;
  const page = await ctx.db
    .query("royaltiesLedger")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .paginate({ cursor, numItems: 50 });
  for (const award of page.page) await postAward(ctx, award);
  if (page.isDone) await ctx.db.patch(account._id, { historySynced: true });
  else
    await ctx.scheduler.runAfter(0, internal.rewards.syncUser, {
      userId,
      cursor: page.continueCursor,
    });
}
export const initialize = mutation({
  args: {},
  handler: async (ctx): Promise<null> => {
    await syncBatch(ctx, await requireUser(ctx), null);
    return null;
  },
});
export const syncUser = internalMutation({
  args: { userId: v.id("users"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args): Promise<null> => {
    await syncBatch(ctx, args.userId, args.cursor);
    return null;
  },
});
// No automatic release or withdrawal. An operator may release a reviewed award only after the configured hold.
export const release = internalMutation({
  args: { awardId: v.id("royaltiesLedger"), reviewReference: v.string() },
  handler: async (ctx, args) => {
    const hours =
      env.REWARD_HOLD_HOURS === undefined ? NaN : Number(env.REWARD_HOLD_HOURS);
    if (!Number.isFinite(hours) || hours < 0 || !env.REWARD_HOLD_HOURS?.trim())
      throw new Error("Reward release policy is not configured.");
    if (!args.reviewReference.trim() || args.reviewReference.length > 500)
      throw new Error("A review reference is required.");
    const award = await ctx.db.get(args.awardId);
    if (!award) throw new Error("Reward unavailable.");
    if (await eventFor(ctx, `release:${award._id}`)) return;
    if (await eventFor(ctx, `reversal:${award._id}`))
      throw new Error("This reward was reversed.");
    if (Date.now() < award._creationTime + hours * 3600000)
      throw new Error("Reward is still on hold.");
    await postAward(ctx, award);
    const account = await accountFor(ctx, award.userId);
    await ctx.db.patch(account._id, {
      pendingUsdMicros: safe(account.pendingUsdMicros - award.usdMicros),
      availableUsdMicros: safe(account.availableUsdMicros + award.usdMicros),
    });
    await ctx.db.insert("rewardEvents", {
      userId: award.userId,
      jobId: award.jobId,
      awardId: award._id,
      kind: "release",
      occurredAt: Math.max(Date.now(), award._creationTime),
      usdMicros: award.usdMicros,
      operationKey: `release:${award._id}`,
      note: `Reward released after review: ${args.reviewReference.trim()}`,
    });
  },
});
