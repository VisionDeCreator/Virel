import { afterEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { submit } from "../src/services/generationActions";
import type { ServiceContext } from "../src/runtime/operation";
import type { Id } from "@virel/backend";
import { defaultStudioInput } from "@virel/shared";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function context(claim = true) {
  const writes: { operation: string; args: Record<string, unknown> }[] = [];
  const ctx = {
    runQuery: vi.fn().mockResolvedValue({
      job: {
        _id: "job-1",
        input: { ...defaultStudioInput, prompt: "A sunrise" },
        supplierMaximumUsdMicros: 105000,
      },
      source: null,
      references: [],
    }),
    runMutation: vi.fn().mockImplementation(async (ref, args) => {
      const operation = getFunctionName(ref);
      writes.push({ operation, args });
      return operation === "generation:claimSubmission" ? claim : null;
    }),
  } as unknown as ServiceContext;
  return { ctx, writes };
}
function provider() {
  vi.stubEnv("SUME_BASE_URL", "https://provider.example");
  vi.stubEnv("SUME_API_KEY", "fixture");
}
function estimate() {
  return new Response(
    JSON.stringify({
      data: { model: "seedance-2.5", currency: "USD", usd_micros: 100000 },
    }),
  );
}
test("a task that cannot claim submission never contacts the paid provider", async () => {
  const { ctx } = context(false);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await submit.handler(ctx, { jobId: "job-1" as Id<"generationJobs"> });
  expect(fetch).not.toHaveBeenCalled();
});
test("an unknown paid submission outcome keeps credits reserved for reconciliation", async () => {
  provider();
  const { ctx, writes } = context();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(estimate())
    .mockRejectedValueOnce(new Error("connection lost"));
  vi.stubGlobal("fetch", fetch);
  await submit.handler(ctx, { jobId: "job-1" as Id<"generationJobs"> });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(writes.some((w) => w.operation === "generation:fail")).toBe(false);
  expect(writes.at(-1)).toMatchObject({
    operation: "generation:update",
    args: { status: "reconciliation_required" },
  });
});
test("a definite provider rejection releases the reservation instead of repurchasing", async () => {
  provider();
  const { ctx, writes } = context();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(estimate())
    .mockResolvedValueOnce(new Response("sensitive body", { status: 422 }));
  vi.stubGlobal("fetch", fetch);
  await submit.handler(ctx, { jobId: "job-1" as Id<"generationJobs"> });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(writes.at(-1)).toMatchObject({ operation: "generation:fail" });
  expect(JSON.stringify(writes)).not.toContain("sensitive body");
});
