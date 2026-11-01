import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
export async function enqueue(
  ctx: MutationCtx,
  operation: "submit" | "poll" | "cleanup",
  jobId?: Id<"generationJobs">,
  delay = 0,
) {
  const dedupeKey = `${operation}:${jobId ?? "all"}`;
  const task = await ctx.db
    .query("apiTasks")
    .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", dedupeKey))
    .unique();
  const runAt = Date.now() + delay;
  if (task) {
    if (task.leaseToken)
      await ctx.db.patch(task._id, {
        nextRunAt: Math.min(task.nextRunAt ?? runAt, runAt),
      });
    else await ctx.db.patch(task._id, { runAt: Math.min(task.runAt, runAt) });
    return task._id;
  }
  return await ctx.db.insert("apiTasks", {
    operation,
    jobId,
    dedupeKey,
    runAt,
    attempts: 0,
  });
}
export const claim = internalMutation({
  args: {},
  handler: async (ctx) => {
    const task = await ctx.db
      .query("apiTasks")
      .withIndex("by_runAt", (q) => q.lte("runAt", Date.now()))
      .first();
    if (!task) return null;
    const token = crypto.randomUUID();
    const leaseUntil = Date.now() + 300000;
    await ctx.db.patch(task._id, {
      leaseToken: token,
      leaseUntil,
      runAt: leaseUntil,
      nextRunAt: undefined,
      attempts: task.attempts + 1,
    });
    return { ...task, leaseToken: token, leaseUntil };
  },
});
async function assertLease(
  ctx: MutationCtx,
  taskId: Id<"apiTasks">,
  token: string,
) {
  const task = await ctx.db.get(taskId);
  if (
    !task ||
    task.leaseToken !== token ||
    !task.leaseUntil ||
    task.leaseUntil <= Date.now()
  )
    throw new Error("Worker lease expired.");
  return task;
}
export const heartbeat = internalMutation({
  args: { taskId: v.id("apiTasks"), token: v.string() },
  handler: async (ctx, args) => {
    await assertLease(ctx, args.taskId, args.token);
    const leaseUntil = Date.now() + 300000;
    await ctx.db.patch(args.taskId, { leaseUntil, runAt: leaseUntil });
  },
});
export const finish = internalMutation({
  args: {
    taskId: v.id("apiTasks"),
    token: v.string(),
    retry: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const task = await assertLease(ctx, args.taskId, args.token);
    if (args.retry || task.nextRunAt !== undefined) {
      await ctx.db.patch(task._id, {
        runAt:
          task.nextRunAt ??
          Date.now() + Math.min(300000, 10000 * task.attempts),
        leaseToken: undefined,
        leaseUntil: undefined,
        nextRunAt: undefined,
      });
    } else await ctx.db.delete(task._id);
  },
});
// All worker writes are fenced by the task lease in the same transaction.
export const commit = internalMutation({
  args: {
    taskId: v.id("apiTasks"),
    token: v.string(),
    operation: v.string(),
    args: v.any(),
  },
  handler: async (ctx, args): Promise<any> => {
    const task = await assertLease(ctx, args.taskId, args.token);
    const allowed = {
      "timeline:beginRender": internal.timeline.beginRender,
      "timeline:progress": internal.timeline.progress,
      "timeline:completeExport": internal.timeline.completeExport,
      "timeline:failExport": internal.timeline.failExport,
      "generation:claimSubmission": internal.generation.claimSubmission,
      "generation:recordProvider": internal.generation.recordProvider,
      "generation:update": internal.generation.update,
      "generation:fail": internal.generation.fail,
      "generation:complete": internal.generation.complete,
      "media:markDeleted": internal.media.markDeleted,
      "media:removeGarbage": internal.media.removeGarbage,
    };
    const ref = allowed[args.operation as keyof typeof allowed];
    if (
      !ref ||
      (task.operation !== "cleanup" &&
        task.operation !== "timeline" &&
        (args.args?.jobId !== task.jobId ||
          !args.operation.startsWith("generation:"))) ||
      (task.operation === "timeline" &&
        (args.args?.exportId !== task.exportId ||
          !args.operation.startsWith("timeline:"))) ||
      (task.operation === "cleanup" && !args.operation.startsWith("media:"))
    )
      throw new Error("Task operation unavailable.");
    return await ctx.runMutation(ref, args.args);
  },
});
