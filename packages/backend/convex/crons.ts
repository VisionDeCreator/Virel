import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval(
  "recover interrupted generation",
  { minutes: 5 },
  internal.generation.recoverStale,
  {},
);
crons.interval(
  "clean abandoned uploads",
  { hours: 1 },
  internal.media.queueCleanup,
  {},
);
export default crons;
