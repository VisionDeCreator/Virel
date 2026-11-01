import { paginationOptsValidator } from "convex/server";
import { v, type Infer } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { requireUser } from "./studioAccess";
import { timelineDocument } from "./timelineValidators";
import {
  emptyTimeline,
  newTimelineClip,
  validateTimeline,
  timelineDuration,
  timelineLimits,
} from "@virel/shared";
import type { Id, Doc } from "./_generated/dataModel";
type Ctx = QueryCtx | MutationCtx;
async function ownProject(ctx: Ctx, id: Id<"timelineProjects">) {
  const userId = await requireUser(ctx),
    project = await ctx.db.get(id);
  if (!project || project.userId !== userId)
    throw new Error("Timeline unavailable.");
  return project;
}
async function generatedSource(
  ctx: Ctx,
  userId: Id<"users">,
  videoId?: Id<"videos">,
) {
  const source = videoId ? await ctx.db.get(videoId) : null;
  const asset = source?.assetId ? await ctx.db.get(source.assetId) : null;
  const job = asset
    ? await ctx.db
        .query("generationJobs")
        .withIndex("by_outputAssetId", (q) => q.eq("outputAssetId", asset._id))
        .unique()
    : null;
  if (
    !source ||
    source.creatorId !== userId ||
    !asset ||
    asset.userId !== userId ||
    asset.type !== "video" ||
    asset.status !== "ready" ||
    !asset.duration ||
    !asset.generated ||
    !job ||
    job.userId !== userId ||
    job.videoId !== source._id ||
    job.status !== "succeeded" ||
    job.financialState !== "settled"
  )
    throw new Error(
      "Choose your completed generated video. Other videos cannot be added to the editor.",
    );
  return { source, asset };
}
async function validateAssets(
  ctx: Ctx,
  project: Doc<"timelineProjects">,
  document: Infer<typeof timelineDocument>,
  allowEmpty = false,
) {
  validateTimeline(document, allowEmpty);
  const { source, asset: sourceAsset } = await generatedSource(
    ctx,
    project.userId,
    project.sourceVideoId,
  );
  const assets: Doc<"mediaAssets">[] = [];
  const ids = [
    ...new Set([...document.clips, ...document.audio].map((c) => c.assetId)),
  ];
  if (ids.length > timelineLimits.assets)
    throw new Error("Use up to 12 source files in one project.");
  for (const id of ids) {
    const asset = await ctx.db.get(id);
    if (!asset || asset.userId !== project.userId || asset.status !== "ready")
      throw new Error("Use only verified media you own in this timeline.");
    if (asset.type === "video" && asset._id !== sourceAsset._id)
      throw new Error(
        "Only this project's generated video can be used in the editor.",
      );
    assets.push(asset);
  }
  if (assets.reduce((sum, a) => sum + a.bytes, 0) > timelineLimits.bytes)
    throw new Error("Keep timeline source files under 500 MB combined.");
  for (const clip of document.clips) {
    const asset = assets.find((a) => a._id === clip.assetId)!;
    if (
      asset.type !== "video" ||
      !asset.duration ||
      clip.end > asset.duration + 0.001
    )
      throw new Error("Clip trim exceeds the source video.");
  }
  for (const track of document.audio) {
    const asset = assets.find((a) => a._id === track.assetId)!;
    if (
      asset.type !== "audio" ||
      !asset.duration ||
      track.end > asset.duration + 0.001
    )
      throw new Error("Music trim exceeds the source audio.");
  }
  return { source, assets };
}
export const create = mutation({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const { source, asset } = await generatedSource(ctx, userId, args.videoId);
    const document: Infer<typeof timelineDocument> = {
      ...emptyTimeline,
      clips: [],
      texts: [],
      audio: [],
    };
    if (source?.assetId) {
      document.clips.push(
        newTimelineClip(
          asset._id,
          asset.duration!,
          crypto.randomUUID(),
        ) as Infer<typeof timelineDocument>["clips"][number],
      );
      const ratio = (asset.width ?? 9) / (asset.height ?? 16);
      document.aspectRatio =
        ratio > 1.2 ? "16:9" : ratio < 0.8 ? "9:16" : "1:1";
    }
    return ctx.db.insert("timelineProjects", {
      userId,
      title: source?.title ?? "Untitled edit",
      revision: 0,
      document,
      sourceVideoId: source?._id,
      updatedAt: Date.now(),
    });
  },
});
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return ctx.db
      .query("timelineProjects")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
export const get = query({
  args: { projectId: v.id("timelineProjects") },
  handler: async (ctx, args) => {
    const project = await ownProject(ctx, args.projectId);
    const latestExport = await ctx.db
      .query("timelineExports")
      .withIndex("by_projectId_and_revision", (q) =>
        q.eq("projectId", project._id),
      )
      .order("desc")
      .first();
    return { ...project, latestExport };
  },
});
export const assets = query({
  args: { projectId: v.id("timelineProjects") },
  handler: async (ctx, args) => {
    const project = await ownProject(ctx, args.projectId);
    const rows = await ctx.db
      .query("mediaAssets")
      .withIndex("by_userId", (q) => q.eq("userId", project.userId))
      .order("desc")
      .take(100);
    const { asset } = await generatedSource(
      ctx,
      project.userId,
      project.sourceVideoId,
    );
    return [
      asset,
      ...rows.filter((a) => a.status === "ready" && a.type === "audio"),
    ];
  },
});
export const save = mutation({
  args: {
    projectId: v.id("timelineProjects"),
    revision: v.number(),
    title: v.string(),
    document: timelineDocument,
  },
  handler: async (ctx, args) => {
    const project = await ownProject(ctx, args.projectId);
    if (project.revision !== args.revision)
      throw new Error(
        "Timeline changed on another device. Reopen the saved version before editing.",
      );
    if (!args.title.trim() || args.title.length > 100)
      throw new Error("Use a title of 1–100 characters.");
    await validateAssets(ctx, project, args.document, true);
    if (
      project.title === args.title.trim() &&
      JSON.stringify(project.document) === JSON.stringify(args.document)
    )
      return project.revision;
    await ctx.db.patch(project._id, {
      document: args.document,
      title: args.title.trim(),
      revision: project.revision + 1,
      updatedAt: Date.now(),
    });
    return project.revision + 1;
  },
});
export const queueExport = mutation({
  args: { projectId: v.id("timelineProjects"), revision: v.number() },
  handler: async (ctx, args) => {
    const project = await ownProject(ctx, args.projectId);
    if (project.revision !== args.revision)
      throw new Error("Save the latest timeline before exporting.");
    await validateAssets(ctx, project, project.document);
    const existing = await ctx.db
      .query("timelineExports")
      .withIndex("by_projectId_and_revision", (q) =>
        q.eq("projectId", project._id).eq("revision", project.revision),
      )
      .unique();
    if (existing && existing.status !== "failed") return existing._id;
    // Only one in-flight export per owner. Manual rendering never touches credits or royalty settlement.
    for (const status of ["queued", "rendering"] as const) {
      const active = await ctx.db
        .query("timelineExports")
        .withIndex("by_userId_and_status", (q) =>
          q.eq("userId", project.userId).eq("status", status),
        )
        .first();
      if (active) throw new Error("Wait for your current export to finish.");
    }
    const exportId =
      existing?._id ??
      (await ctx.db.insert("timelineExports", {
        userId: project.userId,
        projectId: project._id,
        revision: project.revision,
        document: project.document,
        status: "queued",
        progress: 0,
        attempts: 0,
      }));
    if (existing)
      await ctx.db.patch(exportId, {
        status: "queued",
        progress: 0,
        attempts: 0,
        error: undefined,
      });
    const task = await ctx.db
      .query("apiTasks")
      .withIndex("by_dedupeKey", (q) =>
        q.eq("dedupeKey", `timeline:${exportId}`),
      )
      .unique();
    if (task)
      await ctx.db.patch(
        task._id,
        task.leaseToken ? { nextRunAt: Date.now() } : { runAt: Date.now() },
      );
    else
      await ctx.db.insert("apiTasks", {
        operation: "timeline",
        exportId,
        dedupeKey: `timeline:${exportId}`,
        runAt: Date.now(),
        attempts: 0,
      });
    return exportId;
  },
});
export const beginRender = internalMutation({
  args: { exportId: v.id("timelineExports") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.exportId);
    if (!job || job.status === "ready" || job.status === "failed") return null;
    if (job.attempts >= 3) {
      await ctx.db.patch(job._id, {
        status: "failed",
        error: "Export was interrupted. Please try again later.",
      });
      return null;
    }
    const project = (await ctx.db.get(job.projectId))!;
    let assets: Doc<"mediaAssets">[];
    try {
      ({ assets } = await validateAssets(ctx, project, job.document));
    } catch {
      await ctx.db.patch(job._id, {
        status: "failed",
        error: "Source media is no longer available for this timeline.",
      });
      return null;
    }
    const key = `private/${job.userId}/edit-${job._id}-${crypto.randomUUID()}.mp4`;
    await ctx.db.insert("mediaGarbage", {
      key,
      deleteAfter: Date.now() + 24 * 3600000,
    });
    await ctx.db.patch(job._id, {
      status: "rendering",
      key,
      progress: 0.02,
      attempts: job.attempts + 1,
      error: undefined,
    });
    return { job, assets, key };
  },
});
export const progress = internalMutation({
  args: { exportId: v.id("timelineExports"), progress: v.number() },
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.progress))
      throw new Error("Invalid export progress.");
    const job = await ctx.db.get(args.exportId);
    if (job?.status === "rendering")
      await ctx.db.patch(job._id, {
        progress: Math.max(job.progress, Math.min(0.98, args.progress)),
      });
  },
});
export const failExport = internalMutation({
  args: { exportId: v.id("timelineExports"), error: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.exportId);
    if (job && job.status !== "ready")
      await ctx.db.patch(job._id, {
        status: "failed",
        error: args.error.slice(0, 300),
      });
  },
});
export const completeExport = internalMutation({
  args: {
    exportId: v.id("timelineExports"),
    key: v.string(),
    bytes: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.exportId);
    if (!job || job.status === "ready") return;
    if (
      job.status !== "rendering" ||
      args.key !== job.key ||
      !Number.isSafeInteger(args.bytes) ||
      args.bytes <= 0
    )
      throw new Error("Export output unavailable.");
    const project = (await ctx.db.get(job.projectId))!;
    const { source } = await validateAssets(ctx, project, job.document);
    const [width, height] =
      job.document.aspectRatio === "9:16"
        ? [720, 1280]
        : job.document.aspectRatio === "16:9"
          ? [1280, 720]
          : [720, 720];
    const assetId = await ctx.db.insert("mediaAssets", {
      userId: job.userId,
      key: args.key,
      bytes: args.bytes,
      name: project.title,
      type: "video",
      contentType: "video/mp4",
      status: "ready",
      generated: false,
      purpose: "editor",
      duration: timelineDuration(job.document),
      width,
      height,
    });
    const videoId = await ctx.db.insert("videos", {
      creatorId: job.userId,
      assetId,
      timelineProjectId: project._id,
      rootVideoId: source ? (source.rootVideoId ?? source._id) : undefined,
      parentVideoId: source?.parentVideoId,
      lineageDepth: source
        ? (source.lineageDepth ?? (source.rootVideoId ? 1 : 0))
        : 0,
      title: project.title,
      description: "",
      playbackUrl: "",
      visibility: "private",
      status: "draft",
      publishedAt: 0,
      remixEnabled: false,
      royaltyEligible: source?.royaltyEligible ?? false,
    });
    await ctx.db.patch(assetId, { timelineVideoId: videoId });
    const garbage = await ctx.db
      .query("mediaGarbage")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (garbage) await ctx.db.delete(garbage._id);
    await ctx.db.patch(job._id, {
      status: "ready",
      progress: 1,
      assetId,
      videoId,
    });
  },
});
export const publish = internalMutation({
  args: {
    exportId: v.id("timelineExports"),
    title: v.string(),
    description: v.string(),
    remixEnabled: v.boolean(),
    playbackBase: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx),
      job = await ctx.db.get(args.exportId);
    if (!job || job.userId !== userId || job.status !== "ready" || !job.videoId)
      throw new Error("Choose a completed timeline export.");
    const project = await ctx.db.get(job.projectId);
    if (!project || project.revision !== job.revision)
      throw new Error("Export the latest saved timeline before publishing.");
    await validateAssets(ctx, project, job.document);
    if (args.remixEnabled && timelineDuration(job.document) > 15)
      throw new Error(
        "Use a video of 15 seconds or less to enable AI remixes.",
      );
    if (
      !args.title.trim() ||
      args.title.length > 100 ||
      args.description.length > 2000
    )
      throw new Error("Check the title and description.");
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
      playbackUrl: `${args.playbackBase}/media/${job.videoId}`,
      visibility: "public",
      status: "published",
      publishedAt: Date.now(),
    });
    return job.videoId;
  },
});
