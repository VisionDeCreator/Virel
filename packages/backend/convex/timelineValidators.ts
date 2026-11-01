import { v } from "convex/values";
export const timelineDocument = v.object({
  aspectRatio: v.union(v.literal("9:16"), v.literal("16:9"), v.literal("1:1")),
  clips: v.array(
    v.object({
      id: v.string(),
      assetId: v.id("mediaAssets"),
      start: v.number(),
      end: v.number(),
      volume: v.number(),
      zoom: v.number(),
      x: v.number(),
      y: v.number(),
      transition: v.union(
        v.literal("cut"),
        v.literal("fade"),
        v.literal("crossfade"),
      ),
      transitionDuration: v.number(),
    }),
  ),
  texts: v.array(
    v.object({
      id: v.string(),
      text: v.string(),
      start: v.number(),
      end: v.number(),
      x: v.number(),
      y: v.number(),
      size: v.number(),
      color: v.string(),
      font: v.union(v.literal("sans"), v.literal("serif"), v.literal("mono")),
    }),
  ),
  audio: v.array(
    v.object({
      id: v.string(),
      assetId: v.id("mediaAssets"),
      start: v.number(),
      end: v.number(),
      at: v.number(),
      volume: v.number(),
      fadeIn: v.number(),
      fadeOut: v.number(),
    }),
  ),
});
