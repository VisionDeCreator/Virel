import { v } from "convex/values";
export const studioInput = v.object({
  mode: v.union(
    v.literal("create"),
    v.literal("text"),
    v.literal("image"),
    v.literal("remix"),
  ),
  referenceVideoAssetId: v.optional(v.id("mediaAssets")),
  referenceVideoId: v.optional(v.id("videos")),
  referenceBindings: v.optional(
    v.array(v.object({ alias: v.string(), assetId: v.id("mediaAssets") })),
  ),
  segmentId: v.optional(v.id("studioSegments")),
  scriptVersion: v.optional(v.number()),
  segmentTitle: v.optional(v.string()),
  prompt: v.string(),
  sourceAssetId: v.optional(v.id("mediaAssets")),
  sourceVideoId: v.optional(v.id("videos")),
  referenceAssetIds: v.array(v.id("mediaAssets")),
  duration: v.number(),
  resolution: v.union(v.literal("720p"), v.literal("1080p")),
  aspectRatio: v.union(v.literal("9:16"), v.literal("16:9"), v.literal("1:1")),
  targets: v.array(v.string()),
  preserveCamera: v.boolean(),
  preserveMotion: v.boolean(),
});
export const jobStatus = v.union(
  ...[
    "reserved",
    "submitting",
    "queued",
    "generating",
    "ingesting",
    "succeeded",
    "failed",
    "reconciliation_required",
  ].map(v.literal),
);
