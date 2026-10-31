import { query } from "./_generated/server";
// Called with the user's bearer token. The API never trusts identity from a request body.
export const identity = query({
  args: {},
  handler: async (ctx) => await ctx.auth.getUserIdentity(),
});
