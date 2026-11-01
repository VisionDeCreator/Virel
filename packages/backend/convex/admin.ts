import { CREDITS_PER_USD, currentCredits } from "@virel/shared";
import { assertCreditWrites, assertCurrentAccount } from "./creditPricing";
import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { limits } from "./adminLimits";
import { normalizeEmail } from "./authEmail";
import { accountFor } from "./credits";

function reasonFor(value: string) {
  const reason = value.trim();
  if (reason.length < 3 || reason.length > 500)
    throw new ConvexError("A reason of 3–500 characters is required.");
  return reason;
}
async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const id = await getAuthUserId(ctx);
  const user = id ? await ctx.db.get(id) : null;
  if (
    !user?.adminRole ||
    user.isAnonymous ||
    user.emailVerificationTime === undefined
  )
    throw new ConvexError("Administrator access required.");
  return user;
}
async function findEmail(ctx: QueryCtx | MutationCtx, email: string) {
  const matches = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .take(2);
  if (matches.length > 1)
    throw new ConvexError(
      "Multiple accounts match this email. Resolve duplicates first.",
    );
  return matches[0] ?? null;
}
export const me = query({
  args: {},
  handler: async (ctx) => {
    const id = await getAuthUserId(ctx);
    const user = id ? await ctx.db.get(id) : null;
    return user?.adminRole &&
      !user.isAnonymous &&
      user.emailVerificationTime !== undefined
      ? { email: user.email, role: user.adminRole }
      : null;
  },
});
export const promoteAdmin = internalMutation({
  args: { email: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const reason = reasonFor(args.reason);
    const user = await findEmail(ctx, email);
    if (!user)
      throw new ConvexError("Account not found. Create an account first.");
    if (user.isAnonymous || user.emailVerificationTime === undefined)
      throw new ConvexError("Verify this account's email before promoting it.");
    if (user.adminRole === "platform_admin")
      return { email, alreadyAdmin: true };
    await ctx.db.patch(user._id, { adminRole: "platform_admin" });
    await ctx.db.insert("adminAudit", {
      actorEmail: "deployment operator",
      targetUserId: user._id,
      targetEmail: email,
      action: "admin.promote",
      reason,
      requestId: `promote:${user._id}`,
      fingerprint: JSON.stringify({ email, reason }),
    });
    return { email, alreadyAdmin: false };
  },
});
export const lookupUser = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const user = await findEmail(ctx, normalizeEmail(args.email));
    if (!user) return null;
    const account = await ctx.db
      .query("creditAccounts")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const jobs = await ctx.db
      .query("generationJobs")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(10);
    return {
      userId: user._id,
      email: user.email!,
      name: profile?.displayName ?? user.name ?? "",
      username: profile?.username,
      available: currentCredits(
        account?.available ?? 0,
        account?.creditsPerUsd,
      ),
      reserved: currentCredits(account?.reserved ?? 0, account?.creditsPerUsd),
      jobs: await Promise.all(
        jobs.map(async (j) => ({
          id: j._id,
          status: j.status,
          credits: currentCredits(j.credits, j.creditsPerUsd),
          providerJobId: j.providerJobId,
          supplierMaximumUsdMicros: j.supplierMaximumUsdMicros,
          supplierActualUsdMicros: j.supplierActualUsdMicros,
          pricing: await ctx.db.get(j.quoteId),
          financialState: j.financialState,
          createdAt: j._creationTime,
        })),
      ),
    };
  },
});
export const grantCredits = mutation({
  args: {
    userId: v.id("users"),
    email: v.string(),
    amount: v.number(),
    reason: v.string(),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const reason = reasonFor(args.reason);
    const email = normalizeEmail(args.email);
    if (
      !Number.isSafeInteger(args.amount) ||
      args.amount < 1 ||
      args.amount > 1_000_000
    )
      throw new ConvexError("Grant between 1 and 1,000,000 whole credits.");
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(args.requestId))
      throw new ConvexError("Invalid request ID.");
    const fingerprint = JSON.stringify({
      userId: args.userId,
      email,
      amount: args.amount,
      reason,
    });
    const previous = await ctx.db
      .query("adminAudit")
      .withIndex("by_actorUserId_and_requestId", (q) =>
        q.eq("actorUserId", actor._id).eq("requestId", args.requestId),
      )
      .unique();
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new ConvexError(
          "Request ID was already used with different details.",
        );
      return {
        balance: currentCredits(previous.after!, previous.creditsPerUsd),
        duplicate: true,
      };
    }
    await limits.limit(ctx, "adminGrant", { key: actor._id, throws: true });
    const target = await findEmail(ctx, email);
    if (!target || target._id !== args.userId)
      throw new ConvexError("Recipient changed. Search for the user again.");
    await assertCreditWrites(ctx);
    const account = await accountFor(ctx, target._id);
    assertCurrentAccount(account);
    const balance = account.available + args.amount;
    if (
      !Number.isSafeInteger(balance) ||
      !Number.isSafeInteger(balance + account.reserved)
    )
      throw new ConvexError("Credit balance exceeds the supported limit.");
    await ctx.db.patch(account._id, { available: balance });
    await ctx.db.insert("creditLots", {
      userId: target._id,
      creditsPerUsd: CREDITS_PER_USD,
      kind: "promotional",
      available: args.amount,
      reserved: 0,
    });
    await ctx.db.insert("creditLedger", {
      userId: target._id,
      creditsPerUsd: CREDITS_PER_USD,
      kind: "grant",
      amount: args.amount,
      operationKey: `admin:${actor._id}:${args.requestId}`,
      note: reason,
    });
    await ctx.db.insert("adminAudit", {
      actorUserId: actor._id,
      actorEmail: actor.email!,
      targetUserId: target._id,
      targetEmail: email,
      creditsPerUsd: CREDITS_PER_USD,
      action: "credits.grant",
      amount: args.amount,
      before: account.available,
      after: balance,
      reason,
      requestId: args.requestId,
      fingerprint,
    });
    return { balance, duplicate: false };
  },
});
export const creditHistory = query({
  args: { userId: v.id("users"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    checkPage(args.paginationOpts.numItems);
    const result = await ctx.db
      .query("creditLedger")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((row) => ({
        ...row,
        amount: currentCredits(row.amount, row.creditsPerUsd),
        originalAmount: row.amount,
        originalCreditsPerUsd: row.creditsPerUsd ?? 100,
      })),
    };
  },
});
function checkPage(size: number) {
  if (!Number.isInteger(size) || size < 1 || size > 100)
    throw new ConvexError("Page size must be 1–100.");
}
export const audit = query({
  args: {
    paginationOpts: paginationOptsValidator,
    actorEmail: v.optional(v.string()),
    targetEmail: v.optional(v.string()),
    action: v.optional(
      v.union(v.literal("admin.promote"), v.literal("credits.grant")),
    ),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    checkPage(args.paginationOpts.numItems);
    if (
      (args.from !== undefined && !Number.isFinite(args.from)) ||
      (args.to !== undefined && !Number.isFinite(args.to)) ||
      (args.from !== undefined && args.to !== undefined && args.from > args.to)
    )
      throw new ConvexError("Invalid date range.");
    const actorEmail = args.actorEmail?.trim().toLowerCase();
    const targetEmail = args.targetEmail
      ? normalizeEmail(args.targetEmail)
      : undefined;
    const from = args.from ?? 0;
    const to = args.to ?? Number.MAX_SAFE_INTEGER;
    const table = ctx.db.query("adminAudit");
    let rows = actorEmail
      ? table.withIndex("by_actorEmail", (q) =>
          q
            .eq("actorEmail", actorEmail)
            .gte("_creationTime", from)
            .lte("_creationTime", to),
        )
      : targetEmail
        ? table.withIndex("by_targetEmail", (q) =>
            q
              .eq("targetEmail", targetEmail)
              .gte("_creationTime", from)
              .lte("_creationTime", to),
          )
        : args.action
          ? table.withIndex("by_action", (q) =>
              q
                .eq("action", args.action!)
                .gte("_creationTime", from)
                .lte("_creationTime", to),
            )
          : table.withIndex("by_creation_time", (q) =>
              q.gte("_creationTime", from).lte("_creationTime", to),
            );
    if (actorEmail && targetEmail)
      rows = rows.filter((q) => q.eq(q.field("targetEmail"), targetEmail));
    if (args.action && (actorEmail || targetEmail))
      rows = rows.filter((q) => q.eq(q.field("action"), args.action!));
    const result = await rows.order("desc").paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((row) => ({
        ...row,
        ...(row.amount === undefined
          ? {}
          : { amount: currentCredits(row.amount, row.creditsPerUsd) }),
        ...(row.before === undefined
          ? {}
          : { before: currentCredits(row.before, row.creditsPerUsd) }),
        ...(row.after === undefined
          ? {}
          : { after: currentCredits(row.after, row.creditsPerUsd) }),
      })),
    };
  },
});
