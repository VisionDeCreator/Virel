# Virel worker

Run `bun run dev:worker` from the workspace root, or `bun run start` from this directory. The worker imports service implementations from `@virel/api` and loads the ignored root `.env` locally. Production must supply server environment variables through hosting secrets.

It claims durable Convex tasks with five-minute leases, renews leases every 30 seconds, and processes at most three tasks concurrently per process. Generation submission, provider polling, R2 ingestion, and cleanup run here. Convex keeps job state, task claims, ownership, and atomic credit settlement. Interrupted submissions without a provider ID require reconciliation; they are never automatically bought again.

Idle polling backs off to 15 seconds to reduce empty Convex calls. Shutdown waits for active tasks. An abrupt exit leaves tasks available after their lease expires. Stale workers cannot commit state after another worker has acquired their task.
