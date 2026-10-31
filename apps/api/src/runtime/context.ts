import { ConvexHttpClient } from "convex/browser";
import { getFunctionName, type UserIdentity } from "convex/server";
import { internal } from "../../../../packages/backend/convex/_generated/api";
import type { Id } from "../../../../packages/backend/convex/_generated/dataModel";
import type { ActionCtx } from "../../../../packages/backend/convex/_generated/server";
import type { ServiceContext } from "./operation";
export function adminClient(identity?: UserIdentity) {
  const url = process.env.CONVEX_URL;
  const key = process.env.CONVEX_DEPLOY_KEY;
  if (!url || !key)
    throw new Error("API backend credentials are not configured.");
  const client = new ConvexHttpClient(url);
  // Same server-only administrative transport used by Cinakey.
  (
    client as unknown as {
      setAdminAuth(key: string, identity?: UserIdentity): void;
    }
  ).setAdminAuth(key, identity);
  return client as unknown as Omit<ConvexHttpClient, "query" | "mutation"> & {
    query: ActionCtx["runQuery"];
    mutation: ActionCtx["runMutation"];
  };
}
export function createContext(
  identity?: UserIdentity,
  lease?: { taskId: Id<"apiTasks">; token: string },
): ServiceContext {
  const client = adminClient(identity);
  return {
    runQuery: (ref, args) => client.query(ref, args),
    runMutation: (ref, args) =>
      lease
        ? client.mutation(internal.tasks.commit, {
            ...lease,
            operation: getFunctionName(ref),
            args,
          })
        : client.mutation(ref, args),
  };
}
