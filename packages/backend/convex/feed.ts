import { paginationOptsValidator } from "convex/server";
import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("videos")
      .withIndex("by_feed", (q) =>
        q.eq("visibility", "public").eq("status", "published"),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (video) => {
          const root = video.rootVideoId
            ? await ctx.db.get(video.rootVideoId)
            : null;
          const parent = video.parentVideoId
            ? await ctx.db.get(video.parentVideoId)
            : null;
          const profileFor = async (id: typeof video.creatorId | undefined) =>
            id
              ? await ctx.db
                  .query("profiles")
                  .withIndex("by_user", (q) => q.eq("userId", id))
                  .unique()
              : null;
          return {
            ...video,
            creator: await profileFor(video.creatorId),
            rootCreator: await profileFor(root?.creatorId),
            parentCreator: await profileFor(parent?.creatorId),
          };
        }),
      ),
    };
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
