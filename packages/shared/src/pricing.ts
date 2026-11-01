export const CREDITS_PER_USD = 1000;
export const PRICING_VERSION = "v3";
export const GENERATION_SURCHARGE_USD_MICROS = 15000;
export const GENERATION_SURCHARGE_CREDITS = 15;
export const ROYALTY_RULE_VERSION = "root-parent-v1";
export const ROOT_REWARD_USD_MICROS = 10000;
export const PARENT_REWARD_USD_MICROS = 5000;
export const DEFAULT_BUFFER_BPS = 500;
function integer(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`Invalid ${name}.`);
  return BigInt(value);
}
export function ceilRatio(numerator: bigint, denominator: bigint) {
  const value = (numerator + denominator - 1n) / denominator;
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Credit amount exceeds the supported limit.");
  return Number(value);
}
export function generationPrice(
  supplierUsdMicros: number,
  markupBps = 3000,
  bufferBps = DEFAULT_BUFFER_BPS,
) {
  const cost = integer(supplierUsdMicros, "supplier estimate");
  const markup = integer(markupBps, "markup");
  const buffer = integer(bufferBps, "buffer");
  if (!cost || markup > 100000n || buffer > 10000n)
    throw new Error("Invalid generation pricing.");
  return {
    credits:
      ceilRatio(
        cost * (10000n + buffer) * (10000n + markup) * BigInt(CREDITS_PER_USD),
        100000000000000n,
      ) + GENERATION_SURCHARGE_CREDITS,
    supplierMaximumUsdMicros: ceilRatio(cost * (10000n + buffer), 10000n),
  };
}
export function currentCredits(amount: number, rate = 100) {
  if (rate !== 100 && rate !== CREDITS_PER_USD)
    throw new Error("Unknown credit denomination.");
  if (!Number.isSafeInteger(amount)) throw new Error("Invalid credit amount.");
  const converted = amount * (CREDITS_PER_USD / rate);
  if (!Number.isSafeInteger(converted))
    throw new Error("Credit amount exceeds the supported limit.");
  return converted;
}
export function creditEventLabel(kind: string) {
  return (
    (
      {
        reserve: "Credits reserved",
        charge: "Generation charged",
        release: "Credits returned",
        refund: "Generation refunded",
        grant: "Credits added",
        migration: "Credit denomination updated",
      } as Record<string, string>
    )[kind] ?? kind
  );
}

export function formatRewardUsd(usdMicros: number) {
  if (!Number.isSafeInteger(usdMicros))
    throw new Error("Invalid reward amount.");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(usdMicros / 1000000);
}
