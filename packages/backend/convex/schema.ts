import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { studioInput, jobStatus } from "./studioValidators";
export default defineSchema({
  ...authTables,
  apiTasks: defineTable({
    operation: v.union(
      v.literal("submit"),
      v.literal("poll"),
      v.literal("cleanup"),
    ),
    jobId: v.optional(v.id("generationJobs")),
    dedupeKey: v.string(),
    runAt: v.number(),
    leaseToken: v.optional(v.string()),
    leaseUntil: v.optional(v.number()),
    nextRunAt: v.optional(v.number()),
    attempts: v.number(),
  })
    .index("by_dedupeKey", ["dedupeKey"])
    .index("by_runAt", ["runAt"]),

  studioSegments: defineTable({
    userId: v.id("users"),
    mode: v.union(v.literal("create"), v.literal("remix")),
    title: v.string(),
    input: studioInput,
    revision: v.number(),
    updatedAt: v.number(),
  }).index("by_userId_and_mode", ["userId", "mode"]),
  studioScriptVersions: defineTable({
    userId: v.id("users"),
    segmentId: v.id("studioSegments"),
    revision: v.number(),
    title: v.string(),
    input: studioInput,
  }).index("by_segmentId", ["segmentId"]),
  creditAccounts: defineTable({
    userId: v.id("users"),
    available: v.number(),
    reserved: v.number(),
    activeJobs: v.number(),
    welcomeGranted: v.boolean(),
  }).index("by_userId", ["userId"]),
  creditLots: defineTable({
    userId: v.id("users"),
    kind: v.union(v.literal("promotional"), v.literal("purchased")),
    available: v.number(),
    reserved: v.number(),
  }).index("by_userId", ["userId"]),
  creditLedger: defineTable({
    userId: v.id("users"),
    kind: v.string(),
    amount: v.number(),
    jobId: v.optional(v.id("generationJobs")),
    operationKey: v.string(),
    note: v.string(),
  })
    .index("by_userId", ["userId"])
    .index("by_operationKey", ["operationKey"]),
  mediaGarbage: defineTable({ key: v.string(), deleteAfter: v.number() })
    .index("by_key", ["key"])
    .index("by_deleteAfter", ["deleteAfter"]),
  mediaAssets: defineTable({
    userId: v.id("users"),
    key: v.string(),
    name: v.string(),
    type: v.union(v.literal("image"), v.literal("video")),
    contentType: v.string(),
    bytes: v.number(),
    status: v.union(
      v.literal("uploading"),
      v.literal("ready"),
      v.literal("deleted"),
    ),
    duration: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    generated: v.boolean(),
    expiresAt: v.optional(v.number()),
    completionToken: v.optional(v.string()),
    completionUntil: v.optional(v.number()),
    sealedKey: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_status_and_expiresAt", ["status", "expiresAt"]),
  generationQuotes: defineTable({
    userId: v.id("users"),
    input: studioInput,
    inputKey: v.string(),
    credits: v.number(),
    supplierMaximumUsdMicros: v.number(),
    creditsPerUsd: v.number(),
    markupBps: v.number(),
    pricingVersion: v.string(),
    expiresAt: v.number(),
  }).index("by_userId", ["userId"]),
  generationJobs: defineTable({
    userId: v.id("users"),
    input: studioInput,
    quoteId: v.id("generationQuotes"),
    requestId: v.string(),
    status: jobStatus,
    credits: v.number(),
    financialState: v.union(
      v.literal("reserved"),
      v.literal("settled"),
      v.literal("released"),
    ),
    allocations: v.array(
      v.object({
        lotId: v.id("creditLots"),
        credits: v.number(),
        kind: v.union(v.literal("promotional"), v.literal("purchased")),
      }),
    ),
    supplierMaximumUsdMicros: v.number(),
    providerJobId: v.optional(v.string()),
    supplierActualUsdMicros: v.optional(v.number()),
    outputAssetId: v.optional(v.id("mediaAssets")),
    videoId: v.optional(v.id("videos")),
    parentVideoId: v.optional(v.id("videos")),
    rootVideoId: v.optional(v.id("videos")),
    royaltyBeneficiaries: v.array(
      v.object({ userId: v.id("users"), usdMicros: v.number() }),
    ),
    error: v.optional(v.string()),
    updatedAt: v.number(),
    pollCount: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_requestId", ["userId", "requestId"])
    .index("by_quoteId", ["quoteId"])
    .index("by_outputAssetId", ["outputAssetId"])
    .index("by_status_and_updatedAt", ["status", "updatedAt"]),
  royaltiesLedger: defineTable({
    userId: v.id("users"),
    jobId: v.id("generationJobs"),
    usdMicros: v.number(),
    status: v.literal("pending"),
  }).index("by_jobId", ["jobId"]),
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
    assetId: v.optional(v.id("mediaAssets")),
    jobId: v.optional(v.id("generationJobs")),
    parentVideoId: v.optional(v.id("videos")),
    rootVideoId: v.optional(v.id("videos")),
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
