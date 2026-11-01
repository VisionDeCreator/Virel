import { v } from "convex/values";
import { action } from "../runtime/operation";
import { internal } from "../../../../packages/backend/convex/_generated/api";
export const publishTimeline = action({
  args: {
    exportId: v.id("timelineExports"),
    title: v.string(),
    description: v.string(),
    remixEnabled: v.boolean(),
  },
  handler: async (ctx, args): Promise<string> => {
    const playbackBase = process.env.API_PUBLIC_URL?.replace(/\/$/, "");
    if (!playbackBase) throw new Error("Public API URL is not configured.");
    return ctx.runMutation(internal.timeline.publish, {
      ...args,
      playbackBase,
    });
  },
});
