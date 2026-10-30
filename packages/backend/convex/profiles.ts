import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { normalizeUsername, profileRules } from "@virel/shared";
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});
export const save = mutation({
  args: { username: v.string(), displayName: v.string(), bio: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to update your profile.");
    const username = normalizeUsername(args.username);
    const displayName = args.displayName.trim();
    if (
      !displayName ||
      displayName.length > 60 ||
      args.bio.length > profileRules.maxBioLength
    )
      throw new Error("Check your display name and biography.");
    const taken = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (taken && taken.userId !== userId)
      throw new Error("That username is already taken.");
    const current = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const fields = { userId, username, displayName, bio: args.bio.trim() };
    if (current) {
      await ctx.db.patch(current._id, fields);
      return current._id;
    }
    return await ctx.db.insert("profiles", fields);
  },
});
