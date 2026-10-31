import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { resolve, join } from "node:path";
const root = resolve(import.meta.dir, "../../..");
const values = parseEnv(await readFile(join(root, ".env"), "utf8"));
const required = [
  "CONVEX_URL",
  "CONVEX_DEPLOY_KEY",
  "API_PUBLIC_URL",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "SUME_API_KEY",
  "SUME_BASE_URL",
];
const missing = required.filter((name) => !values[name]?.trim());
if (!values.R2_ENDPOINT?.trim() && !values.R2_ACCOUNT_ID?.trim())
  missing.push("R2_ENDPOINT or R2_ACCOUNT_ID");
if (!values.R2_BUCKET?.trim() && !values.R2_BUCKET_NAME?.trim())
  missing.push("R2_BUCKET or R2_BUCKET_NAME");
if (missing.length)
  throw new Error(
    `Fill in root .env settings: ${missing.join(", ")}. No values were logged.`,
  );
if (
  process.argv.includes("--configure-cors") ||
  process.argv.includes("--sync-only")
)
  throw new Error(
    "Studio secrets now belong to the API/worker. This command no longer changes R2 CORS or syncs credentials to Convex.",
  );
for (const name of ["CONVEX_URL", "API_PUBLIC_URL", "SUME_BASE_URL"])
  new URL(values[name]!);
console.log(
  "Studio API/worker settings are present. No secrets were copied to Convex and no bucket settings were changed.",
);
