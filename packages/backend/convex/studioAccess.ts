import { getAuthUserId } from "@convex-dev/auth/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { Infer } from "convex/values";
import { studioInput } from "./studioValidators";
import { validateStudioInput, compileRemix } from "@virel/shared";
export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Sign in to use Studio.");
  return userId;
}
export async function resolveInput(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  supplied: Infer<typeof studioInput>,
) {
  const input = {
    ...supplied,
    referenceAssetIds: [...supplied.referenceAssetIds],
  };
  validateStudioInput(input);
  for (const id of input.referenceAssetIds) {
    const asset = await ctx.db.get(id);
    if (
      !asset ||
      asset.userId !== userId ||
      asset.status !== "ready" ||
      asset.type !== "image"
    )
      throw new Error("Reference image is unavailable.");
  }
  const videoAssetId =
    input.mode === "remix" ? input.sourceAssetId : input.referenceVideoAssetId;
  const videoId =
    input.mode === "remix" ? input.sourceVideoId : input.referenceVideoId;
  let source = videoAssetId ? await ctx.db.get(videoAssetId) : null;
  let parent = videoId ? await ctx.db.get(videoId) : null;
  if (videoId) {
    if (
      !parent ||
      !(
        parent.creatorId === userId ||
        (parent.visibility === "public" &&
          parent.status === "published" &&
          parent.remixEnabled)
      ) ||
      !parent.assetId
    )
      throw new Error("This video is not available for remixing.");
    if (videoAssetId && videoAssetId !== parent.assetId)
      throw new Error(
        "Source video does not match the selected creator video.",
      );
    source = await ctx.db.get(parent.assetId);
    if (input.mode === "remix") input.sourceAssetId = parent.assetId;
    else input.referenceVideoAssetId = parent.assetId;
  } else if (source && source.userId !== userId)
    throw new Error(
      "Choose your own source or a published remix-enabled video.",
    );
  if (source) {
    if (
      source.status !== "ready" ||
      source.type !== "video" ||
      !source.duration ||
      source.duration < 4 ||
      source.duration > 15
    )
      throw new Error(
        input.mode === "remix"
          ? "Choose a verified source video between 4 and 15 seconds."
          : "Choose a verified reference video between 4 and 15 seconds.",
      );
    if (input.mode === "remix") input.duration = Math.ceil(source.duration);
    // Preserve published lineage even when the owner selects the underlying asset.
    if (!parent && source.generated) {
      const job = await ctx.db
        .query("generationJobs")
        .withIndex("by_outputAssetId", (q) =>
          q.eq("outputAssetId", source!._id),
        )
        .unique();
      if (job?.videoId) parent = await ctx.db.get(job.videoId);
    }
  }
  if (input.mode === "remix" && (!source || (!source.generated && !parent)))
    throw new Error(
      "Choose an existing platform video as the remix base. Uploaded files cannot be remix bases.",
    );
  if (input.mode === "remix" && source?.width && source.height) {
    const ratio = source.width / source.height;
    input.aspectRatio = ratio > 1.2 ? "16:9" : ratio < 0.8 ? "9:16" : "1:1";
  }
  if (videoAssetId && !source)
    throw new Error("Video reference is unavailable.");
  if (input.segmentId) {
    const segment = await ctx.db.get(input.segmentId);
    if (
      !segment ||
      segment.userId !== userId ||
      segment.mode !== input.mode ||
      input.scriptVersion !== segment.revision ||
      input.prompt !== segment.input.prompt
    )
      throw new Error(
        "Save the current script before reviewing its credit cost.",
      );
    input.segmentTitle = segment.title;
  }
  compileRemix(input);
  return { input, source, parent };
}
