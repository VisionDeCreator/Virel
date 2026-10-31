import { v } from "convex/values";
import { internalAction } from "../runtime/operation";
import { internal } from "../../../../packages/backend/convex/_generated/api";
import { readUrl } from "./r2";
export const publishedUrl = internalAction({
  args: { videoId: v.string() },
  handler: async (ctx, args): Promise<string | null> => {
    const asset = await ctx.runQuery(internal.media.publishedAsset, args);
    return asset ? await readUrl(asset.key, undefined, 300) : null;
  },
});
