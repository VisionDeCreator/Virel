import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { studioInput, jobStatus } from "./studioValidators";
export default defineSchema({
  ...authTables,
  users: defineTable({
    ...authTables.users.validator.fields,
    adminRole: v.optional(
      v.union(v.literal("platform_admin"), v.literal("billing")),
    ),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),
  adminAudit: defineTable({
    creditsPerUsd: v.optional(v.number()),
    actorUserId: v.optional(v.id("users")),
    actorEmail: v.string(),
    targetUserId: v.id("users"),
    targetEmail: v.string(),
    action: v.union(v.literal("admin.promote"), v.literal("credits.grant")),
    reason: v.string(),
    amount: v.optional(v.number()),
    before: v.optional(v.number()),
    after: v.optional(v.number()),
    requestId: v.string(),
    fingerprint: v.string(),
  })
    .index("by_actorUserId_and_requestId", ["actorUserId", "requestId"])
    .index("by_targetUserId", ["targetUserId"])
    .index("by_actorEmail", ["actorEmail"])
    .index("by_targetEmail", ["targetEmail"])
    .index("by_action", ["action"]),
  loginChallenges: defineTable({
    email: v.string(),
    challengeHash: v.string(),
    codeHash: v.string(),
    expiresAt: v.number(),
    attempts: v.number(),
    delivered: v.boolean(),
  })
    .index("by_email", ["email"])
    .index("by_challengeHash", ["challengeHash"])
    .index("by_expiresAt", ["expiresAt"]),
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
  creditPricingState: defineTable({
    key: v.string(),
    phase: v.union(
      v.literal("lots"),
      v.literal("accounts"),
      v.literal("complete"),
    ),
    cursor: v.union(v.string(), v.null()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_key", ["key"]),
  creditMigrations: defineTable({
    userId: v.id("users"),
    fromRate: v.number(),
    toRate: v.number(),
    before: v.number(),
    after: v.number(),
    migratedAt: v.number(),
  }).index("by_userId", ["userId"]),
  creditAccounts: defineTable({
    creditsPerUsd: v.optional(v.number()),
    userId: v.id("users"),
    available: v.number(),
    reserved: v.number(),
    activeJobs: v.number(),
    welcomeGranted: v.boolean(),
  }).index("by_userId", ["userId"]),
  creditLots: defineTable({
    creditsPerUsd: v.optional(v.number()),
    userId: v.id("users"),
    kind: v.union(v.literal("promotional"), v.literal("purchased")),
    available: v.number(),
    reserved: v.number(),
  }).index("by_userId", ["userId"]),
  creditLedger: defineTable({
    creditsPerUsd: v.optional(v.number()),
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
    royaltyEligible: v.optional(v.boolean()),
    surchargeUsdMicros: v.optional(v.number()),
    royaltyRuleVersion: v.optional(v.string()),
    fundingKind: v.optional(
      v.union(
        v.literal("purchased"),
        v.literal("promotional"),
        v.literal("mixed"),
        v.literal("insufficient"),
      ),
    ),
    userId: v.id("users"),
    input: studioInput,
    inputKey: v.string(),
    credits: v.number(),
    supplierMaximumUsdMicros: v.number(),
    creditsPerUsd: v.number(),
    markupBps: v.number(),
    pricingVersion: v.string(),
    supplierEstimateUsdMicros: v.optional(v.number()),
    bufferBps: v.optional(v.number()),
    expiresAt: v.number(),
  }).index("by_userId", ["userId"]),
  generationJobs: defineTable({
    surchargeUsdMicros: v.optional(v.number()),
    royaltyRuleVersion: v.optional(v.string()),
    fundingKind: v.optional(
      v.union(
        v.literal("purchased"),
        v.literal("promotional"),
        v.literal("mixed"),
        v.literal("insufficient"),
      ),
    ),
    creditsPerUsd: v.optional(v.number()),
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
      v.literal("refunded"),
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
    .index("by_financialState", ["financialState"])
    .index("by_outputAssetId", ["outputAssetId"])
    .index("by_status_and_updatedAt", ["status", "updatedAt"]),
  royaltiesLedger: defineTable({
    userId: v.id("users"),
    jobId: v.id("generationJobs"),
    usdMicros: v.number(),
    status: v.literal("pending"),
  })
    .index("by_jobId", ["jobId"])
    .index("by_userId", ["userId"]),
  rewardAccounts: defineTable({
    userId: v.id("users"),
    pendingUsdMicros: v.number(),
    availableUsdMicros: v.number(),
    earnedUsdMicros: v.number(),
    hidden: v.boolean(),
    historySynced: v.boolean(),
  }).index("by_userId", ["userId"]),
  rewardEvents: defineTable({
    occurredAt: v.number(),
    userId: v.id("users"),
    jobId: v.id("generationJobs"),
    awardId: v.id("royaltiesLedger"),
    kind: v.union(
      v.literal("award"),
      v.literal("release"),
      v.literal("reversal"),
    ),
    usdMicros: v.number(),
    operationKey: v.string(),
    note: v.string(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_occurredAt", ["userId", "occurredAt"])
    .index("by_operationKey", ["operationKey"]),
  generationDistributions: defineTable({
    jobId: v.id("generationJobs"),
    kind: v.union(v.literal("settlement"), v.literal("reversal")),
    surchargeUsdMicros: v.number(),
    creatorUsdMicros: v.number(),
    platformUsdMicros: v.number(),
    fundingKind: v.string(),
    royaltyRuleVersion: v.string(),
    reason: v.optional(v.string()),
  }).index("by_jobId_and_kind", ["jobId", "kind"]),
  follows: defineTable({
    followerId: v.id("users"),
    followingId: v.id("users"),
  }).index("by_follower_and_following", ["followerId", "followingId"]),
  profiles: defineTable({
    userId: v.id("users"),
    username: v.string(),
    displayName: v.string(),
    bio: v.string(),
    avatarAssetId: v.optional(v.id("mediaAssets")),
    avatarVersion: v.optional(v.number()),
    followerCount: v.optional(v.number()),
    followingCount: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_username", ["username"]),
  postReactions: defineTable({
    userId: v.id("users"),
    videoId: v.id("videos"),
    kind: v.union(
      v.literal("like"),
      v.literal("bookmark"),
      v.literal("dismiss"),
    ),
  })
    .index("by_userId_and_videoId_and_kind", ["userId", "videoId", "kind"])
    .index("by_userId_and_kind", ["userId", "kind"])
    .index("by_userId", ["userId"]),
  postComments: defineTable({
    userId: v.id("users"),
    videoId: v.id("videos"),
    body: v.string(),
    parentId: v.optional(v.id("postComments")),
    deleted: v.optional(v.boolean()),
  }).index("by_videoId", ["videoId"]),
  postReports: defineTable({
    userId: v.id("users"),
    videoId: v.id("videos"),
    reason: v.string(),
  }).index("by_userId_and_videoId", ["userId", "videoId"]),
  videoSignals: defineTable({
    userId: v.id("users"),
    videoId: v.id("videos"),
    creatorId: v.id("users"),
    completion: v.number(),
    deliberate: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_userId_and_videoId", ["userId", "videoId"])
    .index("by_userId_and_updatedAt", ["userId", "updatedAt"]),
  videos: defineTable({
    likeCount: v.optional(v.number()),
    commentCount: v.optional(v.number()),
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
