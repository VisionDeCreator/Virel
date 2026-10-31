import { loadRootEnvironment } from "@virel/api/env";
import { runWorker } from "@virel/api/worker";
loadRootEnvironment();
const controller = new AbortController();
process.on("SIGINT", () => controller.abort());
process.on("SIGTERM", () => controller.abort());
await runWorker(controller.signal);
