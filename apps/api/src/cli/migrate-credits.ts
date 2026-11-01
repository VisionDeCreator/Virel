import { loadRootEnvironment } from "../runtime/env";
import { adminClient } from "../runtime/context";
import { internal } from "../../../../packages/backend/convex/_generated/api";
try {
  loadRootEnvironment();
  const client = adminClient();
  console.log(
    `Credit migration deployment: ${new URL(process.env.CONVEX_URL!).origin}`,
  );
  let phase = await client.mutation(internal.creditPricing.beginMigration, {});
  while (phase !== "complete")
    phase = await client.mutation(internal.creditPricing.migrateBatch, {});
  console.log(
    "Credit migration complete. Existing value preserved at 1,000 credits per USD.",
  );
} catch (error) {
  const text = error instanceof Error ? error.message : "";
  const reason = text.match(
    /(Finish or reconcile outstanding generations before migrating credits|Reserved credit lots need reconciliation|Account reservations need reconciliation|Account balance and funding lots need reconciliation|Credit lots are not ready for migration completion|Credit amount exceeds the supported limit)[^\n]*/,
  )?.[0];
  if (reason) console.error(reason);
  console.error(
    "Migration did not complete. Finish/reconcile outstanding jobs and check account/lot consistency before retrying. The migration can be safely resumed.",
  );
  process.exitCode = 1;
}
