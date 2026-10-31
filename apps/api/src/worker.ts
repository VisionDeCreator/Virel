import { internal } from "../../../packages/backend/convex/_generated/api";
import { adminClient, createContext } from "./runtime/context";
import { submit, poll } from "./services/generationActions";
import { clean } from "./services/mediaCleanup";
import { storage } from "./services/r2";
import { providerConfig } from "./services/sume";
const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
  });
export async function runWorker(signal: AbortSignal) {
  storage();
  providerConfig();
  const client = adminClient();
  await client.query(internal.media.garbage, { before: 0 });
  console.log("Virel worker connected; processing durable development tasks.");
  let lastRecovery = 0;
  async function lane() {
    let idleDelay = 1000;
    while (!signal.aborted) {
      try {
        if (Date.now() - lastRecovery > 60000) {
          lastRecovery = Date.now();
          await client.mutation(internal.generation.recoverStale, {});
          await client.mutation(internal.media.queueCleanup, {});
        }
        const task = await client.mutation(internal.tasks.claim, {});
        if (!task) {
          await pause(idleDelay, signal);
          idleDelay = Math.min(15000, idleDelay * 2);
          continue;
        }
        idleDelay = 1000;
        const lease = { taskId: task._id, token: task.leaseToken };
        const ctx = createContext(undefined, lease);
        let retry = false;
        let heartbeat: Promise<unknown> = Promise.resolve();
        const timer = setInterval(() => {
          heartbeat = heartbeat
            .then(() => client.mutation(internal.tasks.heartbeat, lease))
            .catch(() => {});
        }, 30000);
        try {
          if (task.operation === "cleanup") await clean.handler(ctx, {});
          else if (task.jobId)
            await (task.operation === "submit" ? submit : poll).handler(ctx, {
              jobId: task.jobId,
            });
        } catch {
          retry = true;
          console.error("Worker task interrupted; durable retry retained.");
        } finally {
          clearInterval(timer);
          await heartbeat;
        }
        await client.mutation(internal.tasks.finish, { ...lease, retry });
      } catch {
        console.error("Worker backend unavailable; retrying.");
        await pause(5000, signal);
      }
    }
  }
  // Bounded independently leased tasks, matching the previous generation concurrency.
  await Promise.all(Array.from({ length: 3 }, () => lane()));
}
