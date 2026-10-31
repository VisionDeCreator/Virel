import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./studioAccess";
import { studioInput } from "./studioValidators";
import {
  defaultStudioInput,
  scriptReferences,
  referenceLimit,
  MAX_GENERATION_DURATION,
} from "@virel/shared";
const modeValidator = v.union(v.literal("create"), v.literal("remix"));
export const list = query({
  args: { mode: modeValidator },
  handler: async (ctx, { mode }) => {
    const userId = await requireUser(ctx);
    return await ctx.db
      .query("studioSegments")
      .withIndex("by_userId_and_mode", (q) =>
        q.eq("userId", userId).eq("mode", mode),
      )
      .order("asc")
      .take(50);
  },
});
export const create = mutation({
  args: { mode: modeValidator, title: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const segments = await ctx.db
      .query("studioSegments")
      .withIndex("by_userId_and_mode", (q) =>
        q.eq("userId", userId).eq("mode", args.mode),
      )
      .take(50);
    if (segments.length >= 50)
      throw new Error("Use up to 50 script segments per mode.");
    const title = args.title?.trim() || `Segment ${segments.length + 1}`;
    if (title.length > 120)
      throw new Error("Use a segment title under 120 characters.");
    return await ctx.db.insert("studioSegments", {
      userId,
      mode: args.mode,
      title,
      input: { ...defaultStudioInput, mode: args.mode },
      revision: 0,
      updatedAt: Date.now(),
    });
  },
});
export const save = mutation({
  args: {
    segmentId: v.id("studioSegments"),
    expectedRevision: v.number(),
    title: v.string(),
    input: studioInput,
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const segment = await ctx.db.get(args.segmentId);
    if (!segment || segment.userId !== userId)
      throw new Error("Script segment unavailable.");
    if (segment.revision !== args.expectedRevision)
      throw new Error(
        "This script changed in another session. Reload the segment before saving.",
      );
    const title = args.title.trim();
    if (
      !title ||
      title.length > 120 ||
      args.input.prompt.length > 4000 ||
      segment.mode !== args.input.mode
    )
      throw new Error("Check the script title, mode, and length.");
    if (args.input.referenceAssetIds.length > referenceLimit(args.input.mode))
      throw new Error("Too many image references for this mode.");
    if (
      !Number.isInteger(args.input.duration) ||
      args.input.duration < 4 ||
      args.input.duration > MAX_GENERATION_DURATION
    )
      throw new Error("Use a duration between 4 and 15 seconds.");
    scriptReferences(args.input);
    const input = {
      ...args.input,
      segmentId: args.segmentId,
      scriptVersion: undefined,
      segmentTitle: undefined,
    };
    const version = segment.revision + 1;
    await ctx.db.patch(segment._id, {
      title,
      input,
      revision: version,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("studioScriptVersions", {
      userId,
      segmentId: segment._id,
      title,
      input,
      revision: version,
    });
    return version;
  },
});
export const versions = query({
  args: { segmentId: v.id("studioSegments") },
  handler: async (ctx, { segmentId }) => {
    const userId = await requireUser(ctx);
    const segment = await ctx.db.get(segmentId);
    if (!segment || segment.userId !== userId)
      throw new Error("Script segment unavailable.");
    return await ctx.db
      .query("studioScriptVersions")
      .withIndex("by_segmentId", (q) => q.eq("segmentId", segmentId))
      .order("desc")
      .take(30);
  },
});
export const ensure = mutation({
  args: { mode: modeValidator },
  handler: async (ctx, { mode }) => {
    const userId = await requireUser(ctx);
    const first = await ctx.db
      .query("studioSegments")
      .withIndex("by_userId_and_mode", (q) =>
        q.eq("userId", userId).eq("mode", mode),
      )
      .first();
    if (first) return first._id;
    return await ctx.db.insert("studioSegments", {
      userId,
      mode,
      title: "Segment 1",
      input: { ...defaultStudioInput, mode },
      revision: 0,
      updatedAt: Date.now(),
    });
  },
});
