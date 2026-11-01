import { CREDITS_PER_USD, currentCredits } from "@virel/shared";
import { assertCreditWrites, assertCurrentAccount } from "./creditPricing";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  query,
  mutation,
  internalMutation,
  env,
  type MutationCtx,
} from "./_generated/server";
import { requireUser } from "./studioAccess";
import type { Id } from "./_generated/dataModel";
export async function accountFor(ctx: MutationCtx, userId: Id<"users">) {
  const current = await ctx.db
    .query("creditAccounts")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (current) return current;
  const id = await ctx.db.insert("creditAccounts", {
    userId,
    creditsPerUsd: CREDITS_PER_USD,
    available: 0,
    reserved: 0,
    activeJobs: 0,
    welcomeGranted: false,
  });
  return (await ctx.db.get(id))!;
}
export const balance = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const account = await ctx.db
      .query("creditAccounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return {
      ...(account ?? {
        available: 0,
        reserved: 0,
        activeJobs: 0,
        welcomeGranted: false,
      }),
      available: currentCredits(
        account?.available ?? 0,
        account?.creditsPerUsd,
      ),
      reserved: currentCredits(account?.reserved ?? 0, account?.creditsPerUsd),
      creditsPerUsd: CREDITS_PER_USD,
    };
  },
});
export const history = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("creditLedger")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(30);
    return rows.map((row) => ({
      ...row,
      originalAmount: row.amount,
      originalCreditsPerUsd: row.creditsPerUsd ?? 100,
      amount: currentCredits(row.amount, row.creditsPerUsd),
      creditsPerUsd: CREDITS_PER_USD,
    }));
  },
});
export const initialize = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    await assertCreditWrites(ctx);
    const account = await accountFor(ctx, userId);
    assertCurrentAccount(account);
    if (account.welcomeGranted) return;
    const credits =
      env.WELCOME_CREDITS_V2 !== undefined
        ? Number(env.WELCOME_CREDITS_V2)
        : currentCredits(Number(env.WELCOME_CREDITS ?? "0"));
    if (!Number.isSafeInteger(credits) || credits < 0 || credits > 100000)
      throw new Error("Welcome credits are not configured correctly.");
    // Zero does not consume the allocation, allowing operators to configure it later.
    if (!credits) return;
    if (!Number.isSafeInteger(account.available + credits + account.reserved))
      throw new Error("Credit balance exceeds the supported limit.");
    await ctx.db.patch(account._id, {
      available: account.available + credits,
      welcomeGranted: true,
    });
    await ctx.db.insert("creditLots", {
      userId,
      creditsPerUsd: CREDITS_PER_USD,
      kind: "promotional",
      available: credits,
      reserved: 0,
    });
    await ctx.db.insert("creditLedger", {
      userId,
      creditsPerUsd: CREDITS_PER_USD,
      kind: "grant",
      amount: credits,
      operationKey: `welcome:${userId}`,
      note: "Welcome promotional credits",
    });
  },
});
// Operator-only development grants. Purchased lots require verified payment integration.
export const grant = internalMutation({
  args: {
    userId: v.id("users"),
    credits: v.number(),
    operationKey: v.string(),
  },
  handler: async (ctx, args) => {
    if (
      !Number.isSafeInteger(args.credits) ||
      args.credits <= 0 ||
      args.credits > 10000000 ||
      !args.operationKey.trim()
    )
      throw new Error("Invalid promotional allocation.");
    if (!(await ctx.db.get(args.userId))) throw new Error("User not found.");
    if (
      await ctx.db
        .query("creditLedger")
        .withIndex("by_operationKey", (q) =>
          q.eq("operationKey", args.operationKey),
        )
        .unique()
    )
      return;
    await assertCreditWrites(ctx);
    const account = await accountFor(ctx, args.userId);
    assertCurrentAccount(account);
    if (
      !Number.isSafeInteger(account.available + args.credits + account.reserved)
    )
      throw new Error("Credit balance exceeds the supported limit.");
    await ctx.db.patch(account._id, {
      available: account.available + args.credits,
    });
    await ctx.db.insert("creditLots", {
      userId: args.userId,
      creditsPerUsd: CREDITS_PER_USD,
      kind: "promotional",
      available: args.credits,
      reserved: 0,
    });
    await ctx.db.insert("creditLedger", {
      userId: args.userId,
      creditsPerUsd: CREDITS_PER_USD,
      kind: "grant",
      amount: args.credits,
      operationKey: args.operationKey,
      note: "Operator promotional allocation",
    });
  },
});
