import { defineApp } from "convex/server";
import { v } from "convex/values";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import workpool from "@convex-dev/workpool/convex.config";
const app = defineApp({
  env: {
    REWARD_HOLD_HOURS: v.optional(v.string()),
    API_PUBLIC_URL: v.optional(v.string()),
    WELCOME_CREDITS_V2: v.optional(v.string()),
    WELCOME_CREDITS: v.optional(v.string()),
  },
});
app.use(workpool);
app.use(rateLimiter);
export default app;
