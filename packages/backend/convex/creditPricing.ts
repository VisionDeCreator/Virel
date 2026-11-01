import {
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { CREDITS_PER_USD, currentCredits } from "@virel/shared";
export async function pricingState(ctx: QueryCtx | MutationCtx) {
  return ctx.db
    .query("creditPricingState")
    .withIndex("by_key", (q) => q.eq("key", "v2"))
    .unique();
}
export async function assertCreditWrites(ctx: MutationCtx) {
  const state = await pricingState(ctx);
  if (state && state.phase !== "complete")
    throw new Error("Credit pricing is updating. Please try again shortly.");
}
export function assertCurrentAccount(account: { creditsPerUsd?: number }) {
  if (account.creditsPerUsd !== CREDITS_PER_USD)
    throw new Error(
      "Credit denomination migration required. Please try again shortly.",
    );
}
export const status = query({
  args: {},
  handler: async (ctx) => {
    const state = await pricingState(ctx);
    return {
      creditsPerUsd: CREDITS_PER_USD,
      updating: !!state && state.phase !== "complete",
    };
  },
});
export const beginMigration = internalMutation({
  args: {},
  handler: async (ctx) => {
    const state = await pricingState(ctx);
    if (state) return state.phase;
    const job = await ctx.db
      .query("generationJobs")
      .withIndex("by_financialState", (q) => q.eq("financialState", "reserved"))
      .first();
    if (job)
      throw new Error(
        "Finish or reconcile outstanding generations before migrating credits.",
      );
    await ctx.db.insert("creditPricingState", {
      key: "v2",
      phase: "lots",
      cursor: null,
      startedAt: Date.now(),
    });
    return "lots";
  },
});
export const migrateBatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    const state = await pricingState(ctx);
    if (!state) throw new Error("Begin migration first.");
    if (state.phase === "complete") return "complete";
    if (state.phase === "lots") {
      const page = await ctx.db
        .query("creditLots")
        .paginate({ cursor: state.cursor, numItems: 100 });
      for (const lot of page.page)
        if (lot.creditsPerUsd !== CREDITS_PER_USD) {
          if (lot.reserved)
            throw new Error("Reserved credit lots need reconciliation.");
          await ctx.db.patch(lot._id, {
            available: currentCredits(lot.available, lot.creditsPerUsd),
            creditsPerUsd: CREDITS_PER_USD,
          });
        }
      await ctx.db.patch(state._id, {
        phase: page.isDone ? "accounts" : "lots",
        cursor: page.isDone ? null : page.continueCursor,
      });
      return page.isDone ? "accounts" : "lots";
    }
    const page = await ctx.db
      .query("creditAccounts")
      .paginate({ cursor: state.cursor, numItems: 50 });
    for (const account of page.page)
      if (account.creditsPerUsd !== CREDITS_PER_USD) {
        if (account.reserved || account.activeJobs)
          throw new Error("Account reservations need reconciliation.");
        const available = currentCredits(
          account.available,
          account.creditsPerUsd,
        );
        let funded = 0;
        for await (const lot of ctx.db
          .query("creditLots")
          .withIndex("by_userId", (q) => q.eq("userId", account.userId))) {
          if (lot.creditsPerUsd !== CREDITS_PER_USD || lot.reserved)
            throw new Error(
              "Credit lots are not ready for migration completion.",
            );
          funded += lot.available;
        }
        if (!Number.isSafeInteger(funded) || funded !== available)
          throw new Error(
            "Account balance and funding lots need reconciliation.",
          );
        await ctx.db.patch(account._id, {
          available,
          creditsPerUsd: CREDITS_PER_USD,
        });
        await ctx.db.insert("creditMigrations", {
          userId: account.userId,
          fromRate: account.creditsPerUsd ?? 100,
          toRate: CREDITS_PER_USD,
          before: account.available,
          after: available,
          migratedAt: Date.now(),
        });
      }
    await ctx.db.patch(state._id, {
      phase: page.isDone ? "complete" : "accounts",
      cursor: page.isDone ? null : page.continueCursor,
      ...(page.isDone ? { completedAt: Date.now() } : {}),
    });
    return page.isDone ? "complete" : "accounts";
  },
});

export const readiness = internalQuery({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db
      .query("generationJobs")
      .withIndex("by_financialState", (q) => q.eq("financialState", "reserved"))
      .take(10);
    return {
      phase: (await pricingState(ctx))?.phase ?? "not-started",
      outstanding: jobs.map((job) => ({
        jobId: job._id,
        status: job.status,
        providerJobId: job.providerJobId,
        createdAt: job._creationTime,
        error: job.error,
      })),
    };
  },
});
