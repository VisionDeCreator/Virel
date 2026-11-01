import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { limits } from "./adminLimits";
import { normalizeEmail, verifiedEmailUser } from "./authEmail";
export const OTP_TTL_MS = 10 * 60_000;
export const OTP_COOLDOWN_MS = 60_000;
const hash = v.string();
export const issue = internalMutation({
  args: {
    email: v.string(),
    challengeHash: hash,
    codeHash: hash,
    ipHash: hash,
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    if (
      ![args.challengeHash, args.codeHash, args.ipHash].every((s) =>
        /^[a-f0-9]{64}$/.test(s),
      )
    )
      throw new Error("Invalid login challenge");
    const now = Date.now();
    const previous = await ctx.db
      .query("loginChallenges")
      .withIndex("by_email", (q) => q.eq("email", email))
      .order("desc")
      .first();
    if (previous && previous._creationTime + OTP_COOLDOWN_MS > now)
      throw new ConvexError({
        code: "OTP_RATE_LIMIT",
        retryAfterSeconds: Math.ceil(
          (previous._creationTime + OTP_COOLDOWN_MS - now) / 1000,
        ),
      });
    await limits.limit(ctx, "otpEmailHour", { key: email, throws: true });
    await limits.limit(ctx, "otpEmailDay", { key: email, throws: true });
    await limits.limit(ctx, "otpIp", { key: args.ipHash, throws: true });
    await limits.limit(ctx, "otpGlobal", { throws: true });
    if (previous)
      await ctx.db.patch(previous._id, { expiresAt: now, delivered: false });
    const expiresAt = now + OTP_TTL_MS;
    const id = await ctx.db.insert("loginChallenges", {
      email,
      challengeHash: args.challengeHash,
      codeHash: args.codeHash,
      expiresAt,
      attempts: 0,
      delivered: false,
    });
    return { id, expiresAt };
  },
});
export const delivered = internalMutation({
  args: { id: v.id("loginChallenges") },
  handler: async (ctx, { id }) => {
    const challenge = await ctx.db.get(id);
    if (challenge && challenge.expiresAt > Date.now())
      await ctx.db.patch(id, { delivered: true });
  },
});
export const consume = internalMutation({
  args: { email: v.string(), challengeHash: hash, codeHash: hash },
  handler: async (ctx, args): Promise<{ userId: Id<"users"> | null }> => {
    const email = normalizeEmail(args.email);
    const challenge = await ctx.db
      .query("loginChallenges")
      .withIndex("by_challengeHash", (q) =>
        q.eq("challengeHash", args.challengeHash),
      )
      .unique();
    if (
      !challenge ||
      challenge.email !== email ||
      !challenge.delivered ||
      challenge.expiresAt <= Date.now() ||
      challenge.attempts >= 5
    )
      return { userId: null };
    // Commit failed guesses; throwing here would roll the attempt counter back.
    await ctx.db.patch(challenge._id, { attempts: challenge.attempts + 1 });
    if (challenge.codeHash !== args.codeHash) return { userId: null };
    const userId = await verifiedEmailUser(ctx, email);
    await ctx.db.delete(challenge._id);
    return { userId };
  },
});
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("loginChallenges")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", Date.now()))
      .take(100);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});
// Preserve user IDs, ownership, balances, roles, and existing sessions during cutover.
export const normalizeExistingEmails = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("users")
      .paginate({ cursor: args.cursor, numItems: 100 });
    let normalized = 0;
    for (const user of page.page)
      if (user.email) {
        const email = normalizeEmail(user.email);
        if (email !== user.email) {
          await ctx.db.patch(user._id, { email });
          normalized++;
        }
      }
    return { isDone: page.isDone, cursor: page.continueCursor, normalized };
  },
});
