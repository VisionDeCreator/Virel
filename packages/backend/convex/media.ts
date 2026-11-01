import type { Doc } from "./_generated/dataModel";
import { enqueue } from "./tasks";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { requireUser } from "./studioAccess";
import { validateUpload, validateEditorUpload } from "@virel/shared";
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return (
      await ctx.db
        .query("mediaAssets")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .order("desc")
        .take(100)
    ).filter(
      (a): a is Doc<"mediaAssets"> & { type: "image" | "video" } =>
        a.status === "ready" && a.type !== "audio",
    );
  },
});
export const createUpload = internalMutation({
  args: {
    name: v.string(),
    contentType: v.string(),
    bytes: v.number(),
    purpose: v.optional(v.literal("editor")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const type =
      args.purpose === "editor"
        ? validateEditorUpload(args.contentType, args.bytes)
        : validateUpload(args.contentType, args.bytes);
    const recent = await ctx.db
      .query("mediaAssets")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(30);
    if (recent.filter((a) => a._creationTime > Date.now() - 60000).length >= 20)
      throw new Error("Upload limit reached. Try again in a minute.");
    return await ctx.db.insert("mediaAssets", {
      ...args,
      name: args.name.slice(0, 120),
      userId,
      type,
      key: `private/${userId}/${crypto.randomUUID()}`,
      status: "uploading",
      generated: false,
      expiresAt: Date.now() + 3600000,
    });
  },
});
export const owned = internalQuery({
  args: { assetId: v.id("mediaAssets") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.userId !== userId || asset.status === "deleted")
      throw new Error("Media unavailable.");
    return asset;
  },
});
export const source = query({
  args: { videoId: v.string() },
  handler: async (ctx, { videoId }) => {
    await requireUser(ctx);
    const id = ctx.db.normalizeId("videos", videoId);
    if (!id) return null;
    const video = await ctx.db.get(id);
    if (
      !video ||
      video.status !== "published" ||
      video.visibility !== "public" ||
      !video.remixEnabled ||
      !video.assetId
    )
      return null;
    const creator = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", video.creatorId))
      .unique();
    const asset = await ctx.db.get(video.assetId);
    return { ...video, creator, duration: asset?.duration };
  },
});
export const seal = internalMutation({
  args: {
    assetId: v.id("mediaAssets"),
    key: v.string(),
    token: v.string(),
    duration: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  handler: async (ctx, { assetId, token, ...metadata }) => {
    const userId = await requireUser(ctx);
    const asset = await ctx.db.get(assetId);
    if (!asset || asset.userId !== userId || asset.status !== "uploading")
      return false;
    if (
      asset.completionToken !== token ||
      !asset.completionUntil ||
      asset.completionUntil <= Date.now() ||
      asset.sealedKey !== metadata.key
    )
      throw new Error("Upload verification expired. Try again.");
    if (!metadata.key.startsWith(`private/${userId}/verified-${assetId}-`))
      throw new Error("Invalid media key.");
    const garbage = await ctx.db
      .query("mediaGarbage")
      .withIndex("by_key", (q) => q.eq("key", metadata.key))
      .unique();
    if (garbage) await ctx.db.delete(garbage._id);
    // Staging deletion survives API interruption after the registration commits.
    await ctx.db.insert("mediaGarbage", {
      key: asset.key,
      deleteAfter: Date.now() + 3600000,
    });
    await ctx.db.patch(assetId, {
      ...metadata,
      status: "ready",
      expiresAt: undefined,
      completionToken: undefined,
      completionUntil: undefined,
    });
    return true;
  },
});
export const expiredUploads = internalQuery({
  args: { before: v.number() },
  handler: async (ctx, { before }) =>
    await ctx.db
      .query("mediaAssets")
      .withIndex("by_status_and_expiresAt", (q) =>
        q.eq("status", "uploading").lt("expiresAt", before),
      )
      .take(25),
});
export const markDeleted = internalMutation({
  args: { assetId: v.id("mediaAssets") },
  handler: async (ctx, { assetId }) => {
    const asset = await ctx.db.get(assetId);
    if (asset?.status === "uploading")
      await ctx.db.patch(assetId, { status: "deleted" });
  },
});
export const publishedAsset = internalQuery({
  args: { videoId: v.string() },
  handler: async (ctx, { videoId }) => {
    const id = ctx.db.normalizeId("videos", videoId);
    if (!id) return null;
    const video = await ctx.db.get(id);
    if (
      !video ||
      video.visibility !== "public" ||
      video.status !== "published" ||
      !video.assetId
    )
      return null;
    const asset = await ctx.db.get(video.assetId);
    return asset?.status === "ready" ? asset : null;
  },
});

export const queueCleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    await enqueue(ctx, "cleanup");
  },
});
export const claimCompletion = internalMutation({
  args: { assetId: v.id("mediaAssets") },
  handler: async (ctx, { assetId }) => {
    const userId = await requireUser(ctx);
    const asset = await ctx.db.get(assetId);
    if (!asset || asset.userId !== userId || asset.status === "deleted")
      throw new Error("Media unavailable.");
    if (asset.status === "ready") return { asset, token: null };
    if (!asset.expiresAt || asset.expiresAt <= Date.now())
      throw new Error("Upload expired. Select the file again.");
    if (asset.completionUntil && asset.completionUntil > Date.now())
      throw new Error(
        "Upload verification is already in progress. Try again shortly.",
      );
    const token = crypto.randomUUID();
    const sealedKey = `private/${userId}/verified-${assetId}-${crypto.randomUUID()}`;
    await ctx.db.insert("mediaGarbage", {
      key: sealedKey,
      deleteAfter: Date.now() + 24 * 3600000,
    });
    await ctx.db.patch(assetId, {
      completionToken: token,
      completionUntil: Date.now() + 300000,
      sealedKey,
    });
    return { asset: { ...asset, sealedKey }, token };
  },
});
export const releaseCompletion = internalMutation({
  args: { assetId: v.id("mediaAssets"), token: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const asset = await ctx.db.get(args.assetId);
    if (
      asset?.userId === userId &&
      asset.completionToken === args.token &&
      asset.status === "uploading"
    )
      await ctx.db.patch(asset._id, {
        completionToken: undefined,
        completionUntil: undefined,
      });
  },
});

export const garbage = internalQuery({
  args: { before: v.number() },
  handler: async (ctx, { before }) =>
    await ctx.db
      .query("mediaGarbage")
      .withIndex("by_deleteAfter", (q) => q.lt("deleteAfter", before))
      .take(25),
});
export const removeGarbage = internalMutation({
  args: { id: v.id("mediaGarbage") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

export const base = query({
  args: { assetId: v.optional(v.string()), videoId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const videoId = args.videoId
      ? ctx.db.normalizeId("videos", args.videoId)
      : null;
    let video = videoId ? await ctx.db.get(videoId) : null;
    const assetId =
      video?.assetId ??
      (args.assetId ? ctx.db.normalizeId("mediaAssets", args.assetId) : null);
    const asset = assetId ? await ctx.db.get(assetId) : null;
    if (
      !asset ||
      asset.status !== "ready" ||
      asset.type !== "video" ||
      !asset.duration ||
      asset.duration < 4 ||
      asset.duration > 15
    )
      return null;
    const owns =
      asset.userId === userId &&
      (asset.generated || Boolean(asset.timelineVideoId));
    if (owns && !video && asset.timelineVideoId)
      video = await ctx.db.get(asset.timelineVideoId);
    if (owns && !video) {
      const job = await ctx.db
        .query("generationJobs")
        .withIndex("by_outputAssetId", (q) => q.eq("outputAssetId", asset._id))
        .unique();
      if (job?.videoId) video = await ctx.db.get(job.videoId);
    }

    const published =
      video &&
      video.visibility === "public" &&
      video.status === "published" &&
      video.remixEnabled &&
      video.assetId === asset._id;
    if (!owns && !published) return null;
    const creator = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", asset.userId))
      .unique();
    const ratio = (asset.width ?? 9) / (asset.height ?? 16);
    return {
      assetId: asset._id,
      ...(video ? { videoId: video._id } : {}),
      title: video?.title ?? asset.name,
      creator: creator?.username ?? "you",
      duration: asset.duration,
      aspectRatio:
        ratio > 1.2
          ? ("16:9" as const)
          : ratio < 0.8
            ? ("9:16" as const)
            : ("1:1" as const),
      ...(published && video ? { playbackUrl: video.playbackUrl } : {}),
    };
  },
});
export const bases = query({
  args: {
    scope: v.union(v.literal("mine"), v.literal("community")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const page =
      args.scope === "mine"
        ? await ctx.db
            .query("videos")
            .withIndex("by_creator", (q) => q.eq("creatorId", userId))
            .order("desc")
            .filter((q) => q.neq(q.field("assetId"), undefined))
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("videos")
            .withIndex("by_feed", (q) =>
              q.eq("visibility", "public").eq("status", "published"),
            )
            .order("desc")
            .filter((q) =>
              q.and(
                q.eq(q.field("remixEnabled"), true),
                q.neq(q.field("assetId"), undefined),
              ),
            )
            .paginate(args.paginationOpts);
    const bases = await Promise.all(
      page.page.map(async (video) => {
        const asset = video.assetId ? await ctx.db.get(video.assetId) : null;
        if (
          !asset ||
          asset.status !== "ready" ||
          !asset.duration ||
          asset.duration < 4 ||
          asset.duration > 15 ||
          (args.scope === "mine" && !asset.generated && !asset.timelineVideoId)
        )
          return null;
        const creator = await ctx.db
          .query("profiles")
          .withIndex("by_user", (q) => q.eq("userId", video.creatorId))
          .unique();
        const ratio = (asset.width ?? 9) / (asset.height ?? 16);
        return {
          assetId: asset._id,
          videoId: video._id,
          title: video.title,
          creator: creator?.username ?? "you",
          duration: asset.duration,
          aspectRatio:
            ratio > 1.2
              ? ("16:9" as const)
              : ratio < 0.8
                ? ("9:16" as const)
                : ("1:1" as const),
          ...(args.scope === "community"
            ? { playbackUrl: video.playbackUrl }
            : {}),
        };
      }),
    );
    return { ...page, page: bases.filter((base) => base !== null) };
  },
});
