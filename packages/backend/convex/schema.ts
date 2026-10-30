import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
export default defineSchema({
  ...authTables,
  profiles: defineTable({
    userId: v.id("users"),
    username: v.string(),
    displayName: v.string(),
    bio: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_username", ["username"]),
  videos: defineTable({
    creatorId: v.id("users"),
    title: v.string(),
    description: v.string(),
    playbackUrl: v.string(),
    visibility: v.union(v.literal("public"), v.literal("private")),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("hidden"),
    ),
    publishedAt: v.number(),
    remixEnabled: v.boolean(),
    royaltyEligible: v.boolean(),
  })
    .index("by_feed", ["visibility", "status", "publishedAt"])
    .index("by_creator", ["creatorId", "publishedAt"]),
});
