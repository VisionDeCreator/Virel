import { generationPrice } from "@virel/shared";
import { v } from "convex/values";
import { action, internalAction } from "../runtime/operation";
import { internal } from "../../../../packages/backend/convex/_generated/api";
import { studioInput } from "../../../../packages/backend/convex/studioValidators";
import {
  readUrl,
  storage,
  Upload,
  inspectVideo,
  HeadObjectCommand,
} from "./r2";
import {
  request,
  estimate,
  pricing,
  buildRequest,
  ProviderFailure,
} from "./sume";
import { Readable } from "node:stream";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Id } from "../../../../packages/backend/convex/_generated/dataModel";
export const quote = action({
  args: { input: studioInput },
  handler: async (
    ctx,
    args,
  ): Promise<{
    quoteId: Id<"generationQuotes">;
    credits: number;
    duration: number;
    expiresAt: number;
  }> => {
    const context = await ctx.runQuery(internal.generation.context, args);
    const source = context.source
      ? await readUrl(context.source.key)
      : undefined;
    const images = await Promise.all(
      context.references.map((a) => readUrl(a!.key)),
    );
    const payload = buildRequest(context.input, source, images);
    const supplierEstimateUsdMicros = await estimate(
      payload.model,
      payload.body,
    );
    const price = pricing();
    const { supplierMaximumUsdMicros } = generationPrice(
      supplierEstimateUsdMicros,
      price.markupBps,
      price.bufferBps,
    );
    return await ctx.runMutation(internal.generation.saveQuote, {
      input: context.input,
      supplierMaximumUsdMicros,
      supplierEstimateUsdMicros,
      ...price,
    });
  },
});
export const submit = internalAction({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    if (!(await ctx.runMutation(internal.generation.claimSubmission, args)))
      return;
    let submitted = false;
    try {
      const { job, source, references } = await ctx.runQuery(
        internal.generation.jobContext,
        args,
      );
      const payload = buildRequest(
        job.input,
        source ? await readUrl(source.key) : undefined,
        await Promise.all(references.map((a) => readUrl(a!.key))),
      );
      // Estimates are free and must still fit the accepted supplier maximum.
      const current = await estimate(payload.model, payload.body);
      if (current > job.supplierMaximumUsdMicros) {
        await ctx.runMutation(internal.generation.fail, {
          ...args,
          error:
            "Provider price increased. Credits returned; request a new quote.",
        });
        return;
      }
      submitted = true;
      const data = await request(
        payload.endpoint,
        payload.body,
        `virel-${job._id}`,
      );
      const providerJob = data.job as { id?: unknown } | undefined;
      const id = providerJob?.id ?? data.request_id;
      if (typeof id !== "string" || !id)
        throw new Error("Provider job reference is missing.");
      await ctx.runMutation(internal.generation.recordProvider, {
        ...args,
        providerJobId: id,
      });
    } catch (error) {
      if (!submitted || (error instanceof ProviderFailure && error.definite))
        await ctx.runMutation(internal.generation.fail, {
          ...args,
          error: "Generation could not start. Reserved credits returned.",
        });
      else
        await ctx.runMutation(internal.generation.update, {
          ...args,
          status: "reconciliation_required",
          error:
            "Submission outcome is uncertain. Credits remain reserved while support reconciles the provider job.",
        });
    }
  },
});
async function outputResponse(url: string): Promise<Response> {
  // Provider artifacts must resolve to public HTTPS endpoints, including redirects.
  let current = url;
  for (let redirect = 0; redirect < 4; redirect++) {
    const parsed = new URL(current);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      (parsed.port && parsed.port !== "443")
    )
      throw new Error("Invalid media endpoint.");
    const addresses = isIP(parsed.hostname)
      ? [{ address: parsed.hostname }]
      : await lookup(parsed.hostname, { all: true });
    if (
      !addresses.length ||
      addresses.some(({ address }) => !isPublicAddress(address))
    )
      throw new Error("Invalid media endpoint.");
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(180000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get("location");
      await response.body?.cancel();
      if (!next) throw new Error("Invalid redirect.");
      current = new URL(next, current).href;
      continue;
    }
    if (!response.ok || !response.body)
      throw new Error("Output download failed.");
    return response;
  }
  throw new Error("Too many media redirects.");
}
function isPublicAddress(ip: string) {
  if (ip.includes(":")) return !/^(::|fc|fd|fe[89ab]|ff|2001:db8)/i.test(ip);
  const [a, b] = ip.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
export const poll = internalAction({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const { job } = await ctx.runQuery(internal.generation.jobContext, args);
    if (job.financialState !== "reserved" || !job.providerJobId) return;
    try {
      const id = encodeURIComponent(job.providerJobId);
      const statusData = await request(`/v1/jobs/${id}/status`);
      const nested = statusData.job as { status?: string } | undefined;
      const status = String(
        statusData.sume_status ?? nested?.status ?? statusData.status ?? "",
      ).toLowerCase();
      if (["failed", "canceled", "cancelled", "expired"].includes(status)) {
        await ctx.runMutation(internal.generation.fail, {
          ...args,
          error: "Rendering failed. Reserved credits returned.",
        });
        return;
      }
      if (!["completed", "succeeded"].includes(status)) {
        if (
          ![
            "queued",
            "pending",
            "processing",
            "running",
            "in_progress",
          ].includes(status)
        )
          throw new Error("Unrecognized provider status.");
        if (Date.now() - job._creationTime > 24 * 3600000)
          throw new Error("Provider job needs review.");
        await ctx.runMutation(internal.generation.update, {
          ...args,
          status: "generating",
          schedule: true,
        });
        return;
      }
      const receipt = await request(`/v1/jobs/${id}`);
      const usage = (
        receipt.job as
          | {
              usage_summary?: {
                final?: boolean;
                status?: string;
                captured_usd_micros?: number;
                captured_usd_cents?: number;
              };
            }
          | undefined
      )?.usage_summary;
      const amount =
        usage?.captured_usd_micros ??
        (typeof usage?.captured_usd_cents === "number"
          ? usage.captured_usd_cents * 10000
          : undefined);
      if (
        !usage?.final ||
        usage.status !== "captured" ||
        amount === undefined ||
        !Number.isSafeInteger(amount) ||
        amount < 0 ||
        amount > job.supplierMaximumUsdMicros
      )
        throw new Error("Final provider billing needs review.");
      await ctx.runMutation(internal.generation.update, {
        ...args,
        status: "ingesting",
        supplierActualUsdMicros: amount,
      });
      const key = `private/${job.userId}/outputs/${job._id}.mp4`;
      const { client, bucket } = storage();
      let existing = false;
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        existing = true;
      } catch {
        /* Resume ingestion only if the durable object is absent. */
      }
      if (!existing) {
        const result = await request(`/v1/jobs/${id}/result`);
        const artifacts = (
          result.result as
            { artifacts?: { type?: string; url?: string }[] } | undefined
        )?.artifacts;
        const output = artifacts?.find(
          (a) => a.type === "video" && typeof a.url === "string",
        )?.url;
        if (!output) throw new Error("Output is not available yet.");
        const response = await outputResponse(output);
        let total = 0;
        const limited = response.body!.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              total += chunk.byteLength;
              if (total > 200 * 1024 * 1024)
                throw new Error("Output exceeds the media limit.");
              controller.enqueue(chunk);
            },
          }),
        );
        const upload = new Upload({
          client,
          params: {
            Bucket: bucket,
            Key: key,
            ContentType: "video/mp4",
            Body: Readable.from(
              (async function* () {
                const reader = limited.getReader();
                try {
                  for (;;) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    yield value;
                  }
                } finally {
                  reader.releaseLock();
                }
              })(),
            ),
          },
          queueSize: 2,
          partSize: 8 * 1024 * 1024,
          leavePartsOnError: false,
        });
        await upload.done();
      }
      const head = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      if (!head.ContentLength) throw new Error("Generated output is empty.");
      const metadata = await inspectVideo(
        key,
        4,
        job.input.duration > 15 ? 30 : 15,
      );
      await ctx.runMutation(internal.generation.complete, {
        ...args,
        key,
        bytes: head.ContentLength,
        ...metadata,
      });
    } catch {
      const retry =
        job.pollCount < 12 && Date.now() - job._creationTime < 24 * 3600000;
      await ctx.runMutation(internal.generation.update, {
        ...args,
        status: "reconciliation_required",
        error: retry
          ? "Checking provider status or recovering the result. Credits remain reserved."
          : "This job needs support review. Credits remain reserved; no new render was purchased.",
        schedule: retry,
      });
    }
  },
});
