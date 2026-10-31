import { internalAction } from "./_generated/server";
// Retained until pre-migration callbacks drain. Cleanup now runs in the Bun worker.
export const clean = internalAction({ args: {}, handler: async () => null });
