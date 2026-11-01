import { paginationOptsValidator } from "convex/server";
import {
  query,
  mutation,
  internalMutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id, Doc } from "./_generated/dataModel";

const kind = v.union(
  v.literal("like"),
  v.literal("bookmark"),
  v.literal("dismiss"),
);
async function publicVideo(ctx: QueryCtx | MutationCtx, id: Id<"videos">) {
  const video = await ctx.db.get(id);
  if (!video || video.visibility !== "public" || video.status !== "published")
    throw new Error("This post is unavailable.");
  return video;
}
async function viewer(ctx: MutationCtx) {
  const id = await getAuthUserId(ctx);
  if (!id) throw new Error("Sign in to interact with posts.");
  return id;
}
async function reaction(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  videoId: Id<"videos">,
  type: "like" | "bookmark" | "dismiss",
) {
  return ctx.db
    .query("postReactions")
    .withIndex("by_userId_and_videoId_and_kind", (q) =>
      q.eq("userId", userId).eq("videoId", videoId).eq("kind", type),
    )
    .unique();
}
async function profileFor(ctx: QueryCtx, userId?: Id<"users">) {
  if (!userId) return null;
  const p = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  return p
    ? { _id: p._id, username: p.username, displayName: p.displayName }
    : null;
}
async function hydrate(
  ctx: QueryCtx,
  video: Doc<"videos">,
  userId: Id<"users"> | null,
) {
  const root = video.rootVideoId ? await ctx.db.get(video.rootVideoId) : null;
  const parent = video.parentVideoId
    ? await ctx.db.get(video.parentVideoId)
    : null;
  const following = userId
    ? await ctx.db
        .query("follows")
        .withIndex("by_follower_and_following", (q) =>
          q.eq("followerId", userId).eq("followingId", video.creatorId),
        )
        .unique()
    : null;
  return {
    _id: video._id,
    creatorId: video.creatorId,
    title: video.title,
    description: video.description,
    playbackUrl: video.playbackUrl,
    remixEnabled: video.remixEnabled,
    royaltyEligible: video.royaltyEligible,
    creator: await profileFor(ctx, video.creatorId),
    rootCreator: await profileFor(ctx, root?.creatorId),
    parentCreator: await profileFor(ctx, parent?.creatorId),
    likeCount: video.likeCount ?? 0,
    commentCount: video.commentCount ?? 0,
    liked: userId
      ? Boolean(await reaction(ctx, userId, video._id, "like"))
      : false,
    bookmarked: userId
      ? Boolean(await reaction(ctx, userId, video._id, "bookmark"))
      : false,
    isFollowing: Boolean(following),
    isOwner: userId === video.creatorId,
  };
}
// Capture these preferences once per refresh so reactive updates cannot reorder a session.
export const preferences = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { affinities: [], seen: [] };
    const signals = await ctx.db
      .query("videoSignals")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200);
    const weights = new Map<Id<"users">, number>();
    for (const s of signals)
      weights.set(
        s.creatorId,
        (weights.get(s.creatorId) ?? 0) +
          (s.deliberate
            ? s.completion * 2
            : s.completion < 0.15
              ? -0.5
              : s.completion * 0.25),
      );
    const reactions = await ctx.db
      .query("postReactions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);
    for (const r of reactions) {
      const video = await ctx.db.get(r.videoId);
      if (video)
        weights.set(
          video.creatorId,
          (weights.get(video.creatorId) ?? 0) +
            (r.kind === "dismiss" ? -4 : r.kind === "bookmark" ? 3 : 2),
        );
    }
    const follows = await ctx.db
      .query("follows")
      .withIndex("by_follower_and_following", (q) => q.eq("followerId", userId))
      .take(100);
    for (const follow of follows)
      weights.set(
        follow.followingId,
        (weights.get(follow.followingId) ?? 0) + 3,
      );
    const jobs = await ctx.db
      .query("generationJobs")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(30);
    for (const job of jobs) {
      if (job.parentVideoId && job.status === "succeeded") {
        const parent = await ctx.db.get(job.parentVideoId);
        if (parent)
          weights.set(
            parent.creatorId,
            (weights.get(parent.creatorId) ?? 0) + 4,
          );
      }
    }
    return {
      affinities: [...weights].map(([creatorId, weight]) => ({
        creatorId,
        weight: Math.max(-10, Math.min(10, weight)),
      })),
      seen: signals.map((s) => s.videoId),
    };
  },
});
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    mode: v.optional(
      v.union(v.literal("for-you"), v.literal("following"), v.literal("saved")),
    ),
    session: v.optional(
      v.object({
        startedAt: v.number(),
        affinities: v.array(
          v.object({ creatorId: v.id("users"), weight: v.number() }),
        ),
        seen: v.array(v.id("videos")),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > 50 ||
      (args.session &&
        (args.session.affinities.length > 500 ||
          args.session.seen.length > 200))
    )
      throw new Error("Invalid feed request.");
    const userId = await getAuthUserId(ctx);
    if (args.mode === "following") {
      const follow = userId
        ? await ctx.db
            .query("follows")
            .withIndex("by_follower_and_following", (q) =>
              q.eq("followerId", userId),
            )
            .first()
        : null;
      if (!follow) return { page: [], isDone: true, continueCursor: "" };
    }
    if (args.mode === "saved") {
      if (!userId) return { page: [], isDone: true, continueCursor: "" };
      const page = await ctx.db
        .query("postReactions")
        .withIndex("by_userId_and_kind", (q) =>
          q.eq("userId", userId).eq("kind", "bookmark"),
        )
        .order("desc")
        .paginate(args.paginationOpts);
      const videos = await Promise.all(
        page.page.map((r) => ctx.db.get(r.videoId)),
      );
      return {
        ...page,
        page: await Promise.all(
          videos
            .filter((v): v is Doc<"videos"> =>
              Boolean(
                v && v.visibility === "public" && v.status === "published",
              ),
            )
            .map((v) => hydrate(ctx, v, userId)),
        ),
      };
    }
    const page = await ctx.db
      .query("videos")
      .withIndex("by_feed", (q) =>
        q
          .eq("visibility", "public")
          .eq("status", "published")
          .lte(
            "publishedAt",
            args.session?.startedAt ?? Number.MAX_SAFE_INTEGER,
          ),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const eligible: Doc<"videos">[] = [];
    for (const video of page.page) {
      if (userId && (await reaction(ctx, userId, video._id, "dismiss")))
        continue;
      if (args.mode === "following") {
        if (
          !userId ||
          !(await ctx.db
            .query("follows")
            .withIndex("by_follower_and_following", (q) =>
              q.eq("followerId", userId).eq("followingId", video.creatorId),
            )
            .unique())
        )
          continue;
      }
      eligible.push(video);
    }
    // Rerank bounded chronological batches. Frozen preferences and stable ties keep pagination predictable.
    if (args.session && args.mode !== "following") {
      const session = args.session;
      const score = (v: Doc<"videos">) =>
        (session.affinities.find((a) => a.creatorId === v.creatorId)?.weight ??
          0) +
        (session.seen.includes(v._id) ? -12 : 0) +
        2 / (1 + Math.max(0, session.startedAt - v.publishedAt) / 86400000);
      eligible.sort(
        (a, b) =>
          score(b) - score(a) ||
          b.publishedAt - a.publishedAt ||
          a._id.localeCompare(b._id),
      );
      // Interleave creators and reserve regular discovery slots for unfamiliar creators.
      const ordered: Doc<"videos">[] = [];
      while (eligible.length) {
        let index =
          ordered.length % 4 === 3
            ? eligible.findIndex(
                (v) =>
                  !session.affinities.some(
                    (a) => a.creatorId === v.creatorId && a.weight > 0,
                  ),
              )
            : -1;
        if (index < 0)
          index = eligible.findIndex(
            (v) => v.creatorId !== ordered.at(-1)?.creatorId,
          );
        ordered.push(eligible.splice(Math.max(0, index), 1)[0]);
      }
      eligible.push(...ordered);
    }
    return {
      ...page,
      page: await Promise.all(eligible.map((v) => hydrate(ctx, v, userId))),
    };
  },
});
export const setReaction = mutation({
  args: { videoId: v.id("videos"), kind, active: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await viewer(ctx);
    const video = await publicVideo(ctx, args.videoId);
    const existing = await reaction(ctx, userId, args.videoId, args.kind);
    if (Boolean(existing) === args.active) return;
    if (existing) await ctx.db.delete(existing._id);
    else
      await ctx.db.insert("postReactions", {
        userId,
        videoId: args.videoId,
        kind: args.kind,
      });
    if (args.kind === "like")
      await ctx.db.patch(video._id, {
        likeCount: Math.max(0, (video.likeCount ?? 0) + (args.active ? 1 : -1)),
      });
  },
});
export const comments = query({
  args: { videoId: v.id("videos"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await publicVideo(ctx, args.videoId);
    const userId = await getAuthUserId(ctx);
    const page = await ctx.db
      .query("postComments")
      .withIndex("by_videoId", (q) => q.eq("videoId", args.videoId))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (c) => ({
          _id: c._id,
          body: c.deleted ? "Comment deleted" : c.body,
          parentId: c.parentId,
          deleted: Boolean(c.deleted),
          creator: await profileFor(ctx, c.userId),
          isOwner: c.userId === userId,
        })),
      ),
    };
  },
});
export const addComment = mutation({
  args: {
    videoId: v.id("videos"),
    body: v.string(),
    parentId: v.optional(v.id("postComments")),
  },
  handler: async (ctx, args) => {
    const userId = await viewer(ctx);
    const video = await publicVideo(ctx, args.videoId);
    const body = args.body.trim();
    if (!body || body.length > 2000)
      throw new Error("Write a comment of 1–2,000 characters.");
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.videoId !== args.videoId || parent.deleted)
        throw new Error("This comment is unavailable.");
    }
    await ctx.db.insert("postComments", {
      userId,
      videoId: video._id,
      body,
      parentId: args.parentId,
    });
    await ctx.db.patch(video._id, {
      commentCount: (video.commentCount ?? 0) + 1,
    });
  },
});
export const deleteComment = mutation({
  args: { commentId: v.id("postComments") },
  handler: async (ctx, args) => {
    const userId = await viewer(ctx);
    const c = await ctx.db.get(args.commentId);
    if (!c || c.userId !== userId)
      throw new Error("You can only delete your own comments.");
    if (c.deleted) return;
    await ctx.db.patch(c._id, { body: "", deleted: true });
    const video = await ctx.db.get(c.videoId);
    if (video)
      await ctx.db.patch(video._id, {
        commentCount: Math.max(0, (video.commentCount ?? 0) - 1),
      });
  },
});
export const report = mutation({
  args: { videoId: v.id("videos"), reason: v.string() },
  handler: async (ctx, args) => {
    const userId = await viewer(ctx);
    await publicVideo(ctx, args.videoId);
    const reason = args.reason.trim();
    if (!reason || reason.length > 1000)
      throw new Error("Please provide a reason (up to 1,000 characters).");
    const existing = await ctx.db
      .query("postReports")
      .withIndex("by_userId_and_videoId", (q) =>
        q.eq("userId", userId).eq("videoId", args.videoId),
      )
      .unique();
    if (!existing)
      await ctx.db.insert("postReports", {
        userId,
        videoId: args.videoId,
        reason,
      });
  },
});
export const hide = mutation({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    const userId = await viewer(ctx);
    const video = await publicVideo(ctx, args.videoId);
    if (video.creatorId !== userId)
      throw new Error("You can only hide your own posts.");
    await ctx.db.patch(video._id, { status: "hidden" });
  },
});
export const watch = mutation({
  args: {
    videoId: v.id("videos"),
    completion: v.number(),
    deliberate: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const video = await publicVideo(ctx, args.videoId);
    if (
      !Number.isFinite(args.completion) ||
      args.completion < 0 ||
      args.completion > 1
    )
      throw new Error("Invalid viewing signal.");
    const existing = await ctx.db
      .query("videoSignals")
      .withIndex("by_userId_and_videoId", (q) =>
        q.eq("userId", userId).eq("videoId", video._id),
      )
      .unique();
    const fields = {
      userId,
      videoId: video._id,
      creatorId: video.creatorId,
      completion: args.completion,
      deliberate: args.deliberate,
      updatedAt: Date.now(),
    };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("videoSignals", fields);
  },
});
// Operator-only fixture import. Seed media is never royalty eligible.
export const seed = internalMutation({
  args: {
    creatorId: v.id("users"),
    title: v.string(),
    playbackUrl: v.string(),
  },
  handler: async (ctx, args) => {
    if (!(await ctx.db.get(args.creatorId)))
      throw new Error("Creator does not exist.");
    const url = new URL(args.playbackUrl);
    if (url.protocol !== "https:") throw new Error("Use an HTTPS media URL.");
    return await ctx.db.insert("videos", {
      ...args,
      description: "Foundation preview",
      visibility: "public",
      status: "published",
      publishedAt: Date.now(),
      remixEnabled: false,
      royaltyEligible: false,
    });
  },
});

export const post = query({
  args: { videoId: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("videos", args.videoId);
    if (!id) return null;
    const video = await ctx.db.get(id);
    if (!video || video.visibility !== "public" || video.status !== "published")
      return null;
    return hydrate(ctx, video, await getAuthUserId(ctx));
  },
});
