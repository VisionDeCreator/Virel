const env = process.env;
import {
  compileRemix,
  MAX_GENERATION_DURATION,
  type StudioInput,
} from "@virel/shared";
export class ProviderFailure extends Error {
  constructor(
    public definite: boolean,
    message: string,
  ) {
    super(message);
  }
}
export function providerConfig() {
  const base = env.SUME_BASE_URL?.replace(/\/$/, "");
  if (!base || !env.SUME_API_KEY || new URL(base).protocol !== "https:")
    throw new Error("Rendering provider is not configured.");
  return { base, key: env.SUME_API_KEY };
}
export async function request(
  path: string,
  body?: unknown,
  idempotencyKey?: string,
) {
  const { base, key } = providerConfig();
  const response = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(45000),
    redirect: "error",
  });
  if (!response.ok)
    throw new ProviderFailure(
      [400, 401, 403, 404, 422].includes(response.status),
      `Rendering service returned HTTP ${response.status}.`,
    );
  const envelope = (await response.json()) as {
    data?: Record<string, unknown>;
  };
  if (!envelope.data || typeof envelope.data !== "object")
    throw new ProviderFailure(
      false,
      "Rendering service returned an invalid response.",
    );
  return envelope.data;
}
export function buildRequest(
  input: StudioInput,
  sourceUrl: string | undefined,
  images: string[],
) {
  if (
    !Number.isInteger(input.duration) ||
    input.duration < 4 ||
    input.duration > MAX_GENERATION_DURATION
  )
    throw new Error("Use a duration between 4 and 15 seconds.");
  const prompt = compileRemix(input);
  if (input.mode === "remix")
    return {
      model: "sume-remix-lite-object-swap",
      endpoint: "/v1/sume/remix-lite/object-swap/v1.0",
      body: {
        video_url: sourceUrl,
        image_urls: images,
        prompt,
        duration: input.duration,
        resolution: input.resolution,
      },
    };
  return {
    model: "seedance-2.5",
    endpoint: "/v1/video-router/generate",
    body: {
      model: "seedance-2.5",
      prompt,
      duration: input.duration,
      resolution: input.resolution,
      aspect_ratio: input.mode === "image" ? "adaptive" : input.aspectRatio,
      generate_audio: true,
      ...(sourceUrl ? { reference_video_urls: [sourceUrl] } : {}),
      ...(input.mode === "image"
        ? {
            image_url: images[0],
            ...(images.length > 1
              ? { reference_image_urls: images.slice(1) }
              : {}),
          }
        : images.length
          ? { reference_image_urls: images }
          : {}),
    },
  };
}
export async function estimate(model: string, input: unknown) {
  const quote = await request("/v1/open/estimate", { model, input });
  const amount = quote.usd_micros;
  if (
    quote.model !== model ||
    quote.currency !== "USD" ||
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount <= 0
  )
    throw new Error("The provider could not verify a generation price.");
  // Keep the accepted supplier maximum separate from retail credits.
  return Math.ceil(amount * 1.05);
}
export function pricing() {
  const creditsPerUsd = Number(env.CREDITS_PER_USD ?? "100");
  const markupBps = Number(env.GENERATION_MARKUP_BPS ?? "3000");
  if (
    !Number.isSafeInteger(creditsPerUsd) ||
    creditsPerUsd < 1 ||
    creditsPerUsd > 100000 ||
    !Number.isSafeInteger(markupBps) ||
    markupBps < 0 ||
    markupBps > 100000
  )
    throw new Error("Generation pricing is not configured correctly.");
  return { creditsPerUsd, markupBps };
}
