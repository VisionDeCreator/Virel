import { v } from "convex/values";
import { action } from "../runtime/operation";
const env = process.env;
import { internal } from "../../../../packages/backend/convex/_generated/api";
import { storage } from "./r2";
export const publish = action({
  args: {
    jobId: v.id("generationJobs"),
    title: v.string(),
    description: v.string(),
    remixEnabled: v.boolean(),
  },
  handler: async (ctx, args): Promise<string> => {
    const { job, asset, video } = await ctx.runQuery(
      internal.generation.ownedJob,
      { jobId: args.jobId },
    );
    if (!asset || job.status !== "succeeded" || !video)
      throw new Error("Choose a completed result.");
    if (
      !args.title.trim() ||
      args.title.length > 100 ||
      args.description.length > 2000
    )
      throw new Error("Check the title and description.");
    storage();
    if (!env.API_PUBLIC_URL)
      throw new Error("Public API URL is not configured.");
    // The bucket remains private. Every stable playback request checks Convex visibility.
    return await ctx.runMutation(internal.generation.publish, {
      ...args,
      playbackUrl: `${env.API_PUBLIC_URL?.replace(/\/$/, "")}/media/${video._id}`,
    });
  },
});
