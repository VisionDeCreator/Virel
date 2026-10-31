// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import {
  buildRequest,
  estimate,
  request,
  ProviderFailure,
} from "../src/services/sume";
import {
  defaultStudioInput,
  removeReference,
  compileRemix,
  normalizeStudioDraft,
  generationDurations,
} from "@virel/shared";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function provider() {
  vi.stubEnv("SUME_BASE_URL", "https://provider.example");
  vi.stubEnv("SUME_API_KEY", "test-credential");
}
test("remix payload uses the actual source and ordered reference images", () => {
  const payload = buildRequest(
    {
      ...defaultStudioInput,
      mode: "remix",
      prompt: "Use @image_1",
      referenceAssetIds: ["a", "b"],
    },
    "https://storage.example/source",
    ["https://storage.example/a", "https://storage.example/b"],
  );
  expect(payload.endpoint).toBe("/v1/sume/remix-lite/object-swap/v1.0");
  expect(payload.body).toMatchObject({
    video_url: "https://storage.example/source",
    image_urls: ["https://storage.example/a", "https://storage.example/b"],
    duration: 5,
    resolution: "720p",
  });
});
test("estimates validate model, currency, and integer supplier cost", async () => {
  provider();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { model: "model", currency: "USD", usd_micros: 100000 },
        }),
      ),
    ),
  );
  expect(await estimate("model", {})).toBe(105000);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { model: "wrong", currency: "USD", usd_micros: 100000 },
        }),
      ),
    ),
  );
  await expect(estimate("model", {})).rejects.toThrow("verify");
});
test("submission includes stable idempotency and never exposes provider error bodies", async () => {
  provider();
  const transport = vi
    .fn()
    .mockResolvedValue(
      new Response("sensitive upstream body", { status: 422 }),
    );
  vi.stubGlobal("fetch", transport);
  await expect(
    request("/generate", { prompt: "hello" }, "stable-id"),
  ).rejects.toMatchObject({
    definite: true,
    message: "Rendering service returned HTTP 422.",
  });
  expect(transport.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
    "stable-id",
  );
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("server error", { status: 503 })),
  );
  try {
    await request("/generate", {});
  } catch (error) {
    expect(error).toBeInstanceOf(ProviderFailure);
    expect((error as ProviderFailure).definite).toBe(false);
  }
});
test("removing references cannot silently redirect prompt instructions to another image", () => {
  const input = {
    ...defaultStudioInput,
    prompt: "Use @image_1 and @image_2",
    referenceAssetIds: ["a", "b"],
  };
  const changed = { ...input, ...removeReference(input, "a") };
  expect(changed.referenceAssetIds).toEqual(["b"]);
  expect(changed.prompt).toBe("Use @missing_image_1 and @image_2");
  expect(() => compileRemix(changed)).toThrow("missing reference");
});

test("Create uses Seedance with optional media and never silently turns an image into a start frame", () => {
  const plain = buildRequest(
    { ...defaultStudioInput, prompt: "A sunrise", duration: 15 },
    undefined,
    [],
  );
  expect(plain.model).toBe("seedance-2.5");
  expect(plain.body).toMatchObject({
    duration: 15,
    aspect_ratio: "9:16",
    prompt: "A sunrise",
  });
  expect(plain.body).not.toHaveProperty("image_url");
  expect(plain.body).not.toHaveProperty("reference_video_urls");
  const guided = buildRequest(
    {
      ...defaultStudioInput,
      prompt: "Use @image_1 and @video_1",
      referenceAssetIds: ["image"],
      referenceVideoAssetId: "video",
      duration: 15,
    },
    "https://media.example/video",
    ["https://media.example/image"],
  );
  expect(guided.body).toMatchObject({
    reference_video_urls: ["https://media.example/video"],
    reference_image_urls: ["https://media.example/image"],
    duration: 15,
  });
  expect(guided.body).not.toHaveProperty("image_url");
});
test("legacy image jobs preserve their original starting-frame request", () => {
  const legacy = buildRequest(
    {
      ...defaultStudioInput,
      mode: "image",
      prompt: "A sunrise",
      referenceAssetIds: ["image"],
    },
    undefined,
    ["https://media.example/image"],
  );
  expect(legacy.body).toMatchObject({
    image_url: "https://media.example/image",
    aspect_ratio: "adaptive",
  });
});

test("the provider submission boundary enforces the 15-second cap and old drafts normalize to it", () => {
  expect(() =>
    buildRequest(
      { ...defaultStudioInput, prompt: "A scene", duration: 16 },
      undefined,
      [],
    ),
  ).toThrow("4 and 15 seconds");
  expect(
    normalizeStudioDraft({ ...defaultStudioInput, duration: 30 }).duration,
  ).toBe(15);
  expect(generationDurations).toEqual(
    Array.from({ length: 12 }, (_, i) => i + 4),
  );
});
