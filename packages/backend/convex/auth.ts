import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { convexAuth } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { authDigest, normalizeEmail } from "./authEmail";
import type { Id } from "./_generated/dataModel";
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    ConvexCredentials({
      id: "email-otp",
      authorize: async (params, ctx): Promise<{ userId: Id<"users"> }> => {
        const email = normalizeEmail(params.email);
        if (
          typeof params.challenge !== "string" ||
          !/^[a-f0-9]{64}$/.test(params.challenge) ||
          typeof params.code !== "string" ||
          !/^\d{6}$/.test(params.code)
        )
          throw new Error("Code is incorrect or expired. Request a new code.");
        const result = await ctx.runMutation(internal.authOtp.consume, {
          email,
          challengeHash: await authDigest(params.challenge),
          codeHash: await authDigest(
            `${params.challenge}:${email}:${params.code}`,
          ),
        });
        if (!result.userId)
          throw new Error("Code is incorrect or expired. Request a new code.");
        return { userId: result.userId };
      },
    }),
  ],
});
