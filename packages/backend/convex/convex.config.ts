import { defineApp } from "convex/server";
import { v } from "convex/values";
import workpool from "@convex-dev/workpool/convex.config";
const app = defineApp({
  env: {
    API_PUBLIC_URL: v.optional(v.string()),
    WELCOME_CREDITS: v.optional(v.string()),
  },
});
app.use(workpool);
export default app;
