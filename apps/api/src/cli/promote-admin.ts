import { parseArgs } from "node:util";
import { ConvexError } from "convex/values";
import { adminClient } from "../runtime/context";
import { loadRootEnvironment } from "../runtime/env";
import { internal } from "../../../../packages/backend/convex/_generated/api";

const usage =
  'Usage: bun run admin:promote <email> [--reason "Reason for access"]';
try {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      reason: { type: "string", default: "Operator admin setup" },
    },
  });
  if (values.help) console.log(usage);
  else {
    const email = positionals[0]?.trim().toLowerCase();
    const reason = values.reason!.trim();
    if (
      positionals.length !== 1 ||
      !email ||
      !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ||
      email.length > 254 ||
      reason.length < 3 ||
      reason.length > 500
    )
      throw new ConvexError(
        usage + "\nProvide one valid email and a reason of 3–500 characters.",
      );
    loadRootEnvironment();
    const client = adminClient();
    console.log(`Deployment: ${new URL(process.env.CONVEX_URL!).origin}`);
    const result = await client.mutation(internal.admin.promoteAdmin, {
      email,
      reason,
    });
    console.log(
      result.alreadyAdmin
        ? `${result.email} is already an administrator.`
        : `Promoted ${result.email}. Audit entry recorded.`,
    );
  }
} catch (error) {
  console.error(
    error instanceof ConvexError && typeof error.data === "string"
      ? error.data
      : "Promotion failed. Check arguments, deployment configuration, and backend deployment.",
  );
  process.exitCode = 1;
}
