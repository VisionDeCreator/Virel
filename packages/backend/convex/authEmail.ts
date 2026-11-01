import { ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server";
export function normalizeEmail(value: unknown) {
  if (typeof value !== "string")
    throw new ConvexError("Enter a valid email address.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))
    throw new ConvexError("Enter a valid email address.");
  return email;
}
export async function authDigest(value: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export async function verifiedEmailUser(ctx: MutationCtx, email: string) {
  const users = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .take(2);
  if (users.length > 1 || users[0]?.isAnonymous)
    throw new ConvexError(
      "This email needs account assistance. Contact support.",
    );
  if (users[0]) {
    await ctx.db.patch(users[0]._id, { emailVerificationTime: Date.now() });
    return users[0]._id;
  }
  return ctx.db.insert("users", { email, emailVerificationTime: Date.now() });
}
