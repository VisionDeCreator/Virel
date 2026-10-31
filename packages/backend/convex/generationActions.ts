// Compatibility for scheduled callbacks from before the API/worker migration.
// No provider or R2 work runs in Convex. Durable recovery adopts pending jobs.
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
export const submit = internalAction({
  args: { jobId: v.id("generationJobs") },
  handler: async () => null,
});
export const poll = internalAction({
  args: { jobId: v.id("generationJobs") },
  handler: async () => null,
});
