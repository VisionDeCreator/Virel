import { randomBytes, randomInt } from "node:crypto";
import { ConvexError } from "convex/values";
import { internal } from "../../../../packages/backend/convex/_generated/api";
import {
  authDigest,
  normalizeEmail,
} from "../../../../packages/backend/convex/authEmail";
import type { ServiceContext } from "../runtime/operation";
import { sendSmtpEmail, smtpConfiguration } from "./smtp";
export function authClientAddress(request: Request, peer: string) {
  const trusted = new Set(
    (process.env.AUTH_TRUSTED_PROXY_IPS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (!trusted.has(peer)) return peer;
  const chain = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((value) => value.trim());
  if (
    !chain.length ||
    chain.some((value) => !value || !/^[0-9a-f:.]+$/i.test(value))
  )
    return peer;
  return chain.reverse().find((value) => !trusted.has(value)) ?? peer;
}
export async function requestEmailOtp(
  ctx: ServiceContext,
  rawEmail: unknown,
  address: string,
) {
  const response = (body: object, status: number, retryAfter?: number) =>
    Response.json(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
      },
    });
  let email: string;
  try {
    email = normalizeEmail(rawEmail);
  } catch {
    return response({ message: "Enter a valid email address." }, 400);
  }
  try {
    if (!smtpConfiguration()) throw new Error("SMTP unavailable");
    const challenge = randomBytes(32).toString("hex");
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const { id, expiresAt } = await ctx.runMutation(internal.authOtp.issue, {
      email,
      challengeHash: await authDigest(challenge),
      codeHash: await authDigest(`${challenge}:${email}:${code}`),
      ipHash: await authDigest(address),
    });
    const delivered = await sendSmtpEmail({
      to: email,
      subject: "Your Virel sign-in code",
      text: `Your Virel sign-in code is ${code}.\n\nIt expires in 10 minutes and can only be used once. Enter it in the app or browser where you requested it.\n\nIf you did not request this code, ignore this email. Never share your code with anyone.`,
      idempotencyKey: `login:${id}`,
    });
    if (!delivered.sent) throw new Error("SMTP unavailable");
    await ctx.runMutation(internal.authOtp.delivered, { id });
    return response(
      { challenge, email, expiresAt, resendAt: Date.now() + 60_000 },
      200,
    );
  } catch (error) {
    const data = error instanceof ConvexError ? error.data : null;
    const limited =
      data &&
      typeof data === "object" &&
      (("code" in data && data.code === "OTP_RATE_LIMIT") ||
        ("kind" in data && data.kind === "RateLimited"));
    if (
      limited ||
      (error instanceof Error && /Rate limit exceeded/.test(error.message))
    ) {
      const retry =
        data && typeof data === "object" && "retryAfterSeconds" in data
          ? Number(data.retryAfterSeconds)
          : data && typeof data === "object" && "retryAfter" in data
            ? Math.max(1, Math.ceil(Number(data.retryAfter) / 1000))
            : 3600;
      return response(
        {
          message: "Please wait before requesting another code.",
          retryAfterSeconds: retry,
        },
        429,
        retry,
      );
    }
    return response(
      {
        message: "We couldn’t send a code. Please try again shortly.",
        retryAfterSeconds: 60,
      },
      503,
      60,
    );
  }
}
export async function readEmailRequest(request: Request): Promise<unknown> {
  if (!request.body) throw new Error("Missing body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) {
        await reader.cancel();
        throw new Error("Body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (
    !body ||
    typeof body !== "object" ||
    !("email" in body) ||
    Object.keys(body).some((key) => key !== "email")
  )
    throw new Error("Invalid body");
  return body.email;
}
