import { parseArgs, parseEnv } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { defaultStudioInput, type StudioInput } from "@virel/shared";
import { authDigest } from "../../../../packages/backend/convex/authEmail";
import {
  api,
  internal,
} from "../../../../packages/backend/convex/_generated/api";
import type { Id } from "../../../../packages/backend/convex/_generated/dataModel";
import { loadRootEnvironment } from "../runtime/env";
import { adminClient, createContext } from "../runtime/context";
import { quote, submit, poll } from "../services/generationActions";
import { beginUpload, finishUpload } from "../services/mediaActions";
import { pricing } from "../services/sume";

type Run = {
  id: string;
  userId: Id<"users">;
  imageId?: Id<"mediaAssets">;
  tests: {
    mode: "create" | "remix";
    quoteId: Id<"generationQuotes">;
    requestId: string;
    maximumUsdMicros: number;
    credits: number;
    jobId?: Id<"generationJobs">;
    actualUsdMicros?: number;
    status?: string;
  }[];
};
async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "max-usd": { type: "string" },
      state: {
        type: "string",
        default: ".local/generation-acceptance.json",
      },
    },
  });
  const budget = Number(values["max-usd"]);
  if (!Number.isFinite(budget) || budget <= 0 || budget > 5)
    throw new Error(
      "Provide --max-usd between 0 and 5 for the approved acceptance budget.",
    );
  loadRootEnvironment();
  const root = resolve(import.meta.dir, "../../../..");
  const development = parseEnv(
    await readFile(resolve(root, "packages/backend/.env.local"), "utf8"),
  );
  if (
    !development.CONVEX_DEPLOYMENT?.startsWith("dev:") ||
    (development.CONVEX_URL ?? development.VITE_CONVEX_URL) !==
      process.env.CONVEX_URL
  )
    throw new Error("Acceptance requires the matching development deployment.");
  const path = resolve(root, values.state!);
  await mkdir(resolve(path, ".."), { recursive: true });
  const operator = adminClient();
  let state: Run | null = null;
  try {
    state = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!state) {
    const id = randomUUID();
    const challenge = randomBytes(32).toString("hex");
    const email = `virel-e2e-gen${randomBytes(6).toString("hex")}@example.invalid`;
    const args = {
      email,
      challengeHash: await authDigest(challenge),
      codeHash: await authDigest(randomBytes(32).toString("hex")),
    };
    const issued = await operator.mutation(internal.authOtp.issue, {
      ...args,
      ipHash: await authDigest("generation-acceptance"),
    });
    await operator.mutation(internal.authOtp.delivered, { id: issued.id });
    const identity = await operator.mutation(internal.authOtp.consume, args);
    if (!identity.userId)
      throw new Error("Cannot create labeled acceptance identity.");
    state = { id, userId: identity.userId, tests: [] };
  }
  const run = state;
  const save = () => writeFile(path, JSON.stringify(run, null, 2));
  await save();
  await operator.mutation(internal.credits.grant, {
    userId: run.userId,
    credits: 10000,
    operationKey: `acceptance:${run.id}`,
  });
  const issuer = process.env.CONVEX_URL!.replace(".cloud", ".site");
  const identity = {
    issuer,
    subject: `${run.userId}|acceptance`,
    tokenIdentifier: `${issuer}|${run.userId}|acceptance`,
  };
  const user = adminClient(identity);
  const ctx = createContext(identity);
  const worker = createContext();
  for (const mode of ["create", "remix"] as const) {
    let record = run.tests.find((test) => test.mode === mode);
    if (record?.status === "settled") continue;
    let input: Parameters<typeof quote.handler>[1]["input"] = {
      ...defaultStudioInput,
      mode: "create",
      duration: 4,
      resolution: "720p",
      aspectRatio: "16:9",
      prompt:
        "A small red ball rolls slowly across a clean white table. Static camera, simple studio lighting.",
    };
    if (mode === "remix") {
      const create = run.tests.find((test) => test.mode === "create");
      if (!create?.jobId || create.status !== "settled")
        throw new Error("Create must settle before Remix acceptance.");
      const source = await worker.runQuery(internal.generation.jobContext, {
        jobId: create.jobId,
      });
      if (!source.job.outputAssetId)
        throw new Error("Create output is unavailable.");
      if (!run.imageId) {
        const bytes = execFileSync("ffmpeg", [
          "-hide_banner",
          "-loglevel",
          "error",
          "-f",
          "lavfi",
          "-i",
          "color=c=blue:s=512x512",
          "-frames:v",
          "1",
          "-f",
          "image2pipe",
          "-c:v",
          "png",
          "-",
        ]);
        const upload = await beginUpload.handler(ctx, {
          name: "acceptance-blue-reference.png",
          contentType: "image/png",
          bytes: bytes.length,
        });
        const response = await fetch(upload.url, {
          method: "PUT",
          headers: { "Content-Type": "image/png" },
          body: bytes,
        });
        if (!response.ok) throw new Error("Fixture upload failed.");
        run.imageId = (await finishUpload.handler(ctx, {
          assetId: upload.assetId as Id<"mediaAssets">,
        })) as Id<"mediaAssets">;
        await save();
      }
      input = {
        ...input,
        mode: "remix",
        sourceAssetId: source.job.outputAssetId,
        referenceAssetIds: [run.imageId],
        prompt:
          "Replace the red ball with a blue ball matching @image_1. Preserve the table, camera and movement.",
      };
    }
    if (!record) {
      const reviewed = await quote.handler(ctx, { input });
      const maximum =
        Math.ceil(
          (reviewed.credits * 1000000 * 10000) /
            (1000 * (10000 + pricing().markupBps)),
        ) + 1;
      const spent = run.tests.reduce(
        (sum, test) => sum + (test.actualUsdMicros ?? test.maximumUsdMicros),
        0,
      );
      if (spent + maximum > Math.floor(budget * 1000000)) {
        console.log(
          JSON.stringify({
            mode,
            skipped: "quote exceeds remaining approved supplier budget",
            maximumUsdMicros: maximum,
            remainingUsdMicros: Math.floor(budget * 1000000) - spent,
          }),
        );
        return;
      }
      record = {
        mode,
        quoteId: reviewed.quoteId,
        requestId: `acceptance-${run.id}-${mode}`,
        maximumUsdMicros: maximum,
        credits: reviewed.credits,
      };
      run.tests.push(record);
      await save();
    }
    if (
      run.tests.reduce(
        (sum, test) => sum + (test.actualUsdMicros ?? test.maximumUsdMicros),
        0,
      ) >
      budget * 1000000
    )
      throw new Error("Saved acceptance budget exceeds this run's limit.");
    if (!record.jobId) {
      record.jobId = await user.mutation(api.generation.start, {
        quoteId: record.quoteId,
        requestId: record.requestId,
      });
      await save();
    }
    await submit.handler(worker, { jobId: record.jobId });
    const deadline = Date.now() + 10 * 60000;
    while (Date.now() < deadline) {
      const { job } = await worker.runQuery(internal.generation.jobContext, {
        jobId: record.jobId,
      });
      if (job.financialState !== "reserved") {
        record.status = job.financialState;
        record.actualUsdMicros = job.supplierActualUsdMicros;
        await save();
        const balance = await user.query(api.credits.balance, {});
        const history = await user.query(api.credits.history, {});
        const charges = history.filter(
          (row) => row.jobId === record!.jobId && row.kind === "charge",
        );
        if (
          job.financialState === "settled" &&
          (charges.length !== 1 || balance?.reserved !== 0)
        )
          throw new Error("Acceptance accounting invariant failed.");
        console.log(
          JSON.stringify({
            mode,
            status: job.financialState,
            credits: record.credits,
            supplierActualUsdMicros: job.supplierActualUsdMicros,
            chargeCount: charges.length,
            reservedBalance: balance?.reserved,
          }),
        );
        if (job.financialState !== "settled") return;
        break;
      }
      if (job.status === "reconciliation_required") {
        console.log(
          JSON.stringify({ mode, status: job.status, reason: job.error }),
        );
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10000));
      await poll.handler(worker, { jobId: record.jobId });
    }
    if (record.status !== "settled") {
      console.log(
        "Generation still pending; rerun with the same state file to resume without buying a duplicate.",
      );
      return;
    }
  }
}
main().catch(() => {
  console.error(
    "Generation acceptance stopped. Inspect persisted job IDs and provider receipts before retrying; no automatic replacement render was purchased.",
  );
  process.exitCode = 1;
});
