import { RateLimiter, MINUTE, HOUR, DAY } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";
export const limits = new RateLimiter(components.rateLimiter, {
  adminGrant: { kind: "token bucket", rate: 20, period: MINUTE, capacity: 20 },
  otpEmailHour: { kind: "token bucket", rate: 5, period: HOUR, capacity: 5 },
  otpEmailDay: { kind: "token bucket", rate: 10, period: DAY, capacity: 10 },
  otpIp: { kind: "token bucket", rate: 100, period: HOUR, capacity: 100 },
  otpGlobal: { kind: "token bucket", rate: 1000, period: HOUR, capacity: 1000 },
});
