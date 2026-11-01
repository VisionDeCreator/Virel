import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query, mutation, internalQuery } from "./_generated/server";
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

export const publicProfile = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username.toLowerCase()))
      .unique();
    if (!profile) return null;
    const userId = await getAuthUserId(ctx);
    const following = userId
      ? await ctx.db
          .query("follows")
          .withIndex("by_follower_and_following", (q) =>
            q.eq("followerId", userId).eq("followingId", profile.userId),
          )
          .unique()
      : null;
    // Deliberate public projection. Never spread account or credit documents here.
    return {
      username: profile.username,
      displayName: profile.displayName,
      bio: profile.bio,
      hasAvatar: Boolean(profile.avatarAssetId),
      avatarVersion: profile.avatarVersion ?? 0,
      followers: profile.followerCount ?? 0,
      following: profile.followingCount ?? 0,
      isOwner: userId === profile.userId,
      isFollowing: Boolean(following),
    };
  },
});
export const videos = query({
  args: { username: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) =>
        q.eq("username", args.username.toLowerCase()),
      )
      .unique();
    if (!profile) return { page: [], isDone: true, continueCursor: "" };
    const page = await ctx.db
      .query("videos")
      .withIndex("by_creator", (q) => q.eq("creatorId", profile.userId))
      .order("desc")
      .filter((q) =>
        q.and(
          q.eq(q.field("visibility"), "public"),
          q.eq(q.field("status"), "published"),
        ),
      )
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((video) => ({
        _id: video._id,
        title: video.title,
        description: video.description,
        playbackUrl: video.playbackUrl,
        remixEnabled: video.remixEnabled,
      })),
    };
  },
});
export const setFollowing = mutation({
  args: { username: v.string(), following: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to follow creators.");
    const me = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const other = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) =>
        q.eq("username", args.username.toLowerCase()),
      )
      .unique();
    if (!me) throw new Error("Create your profile before following creators.");
    if (!other || other.userId === userId)
      throw new Error("Choose another creator to follow.");
    const existing = await ctx.db
      .query("follows")
      .withIndex("by_follower_and_following", (q) =>
        q.eq("followerId", userId).eq("followingId", other.userId),
      )
      .unique();
    if (Boolean(existing) === args.following) return;
    if (existing) await ctx.db.delete(existing._id);
    else
      await ctx.db.insert("follows", {
        followerId: userId,
        followingId: other.userId,
      });
    const delta = args.following ? 1 : -1;
    await ctx.db.patch(me._id, {
      followingCount: Math.max(0, (me.followingCount ?? 0) + delta),
    });
    await ctx.db.patch(other._id, {
      followerCount: Math.max(0, (other.followerCount ?? 0) + delta),
    });
  },
});
export const setAvatar = mutation({
  args: { assetId: v.id("mediaAssets") },
  handler: async (ctx, { assetId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to change your profile picture.");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const asset = await ctx.db.get(assetId);
    if (
      !profile ||
      !asset ||
      asset.userId !== userId ||
      asset.type !== "image" ||
      asset.status !== "ready"
    )
      throw new Error("Choose a verified image you own.");
    await ctx.db.patch(profile._id, {
      avatarAssetId: assetId,
      avatarVersion: Date.now(),
    });
  },
});
export const avatar = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username.toLowerCase()))
      .unique();
    const asset = profile?.avatarAssetId
      ? await ctx.db.get(profile.avatarAssetId)
      : null;
    return asset?.type === "image" && asset.status === "ready" ? asset : null;
  },
});
