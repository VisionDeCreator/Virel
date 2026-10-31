# Worker deployment

Run a persistent Bun process with workspace dependencies installed: `bun run --cwd apps/worker start`. It shares the API service code, but runs separately from HTTP request handling. Supply `CONVEX_URL`, a deployment-specific `CONVEX_DEPLOY_KEY`, private R2 S3 credentials, and `SUME_BASE_URL`/`SUME_API_KEY` as hosting secrets. Pricing settings must match the API. No credentials belong in a client bundle or Convex environment.

Use the same Convex deployment and R2 bucket as the corresponding API. Start the API and worker only after deploying the matching Convex schema/functions. Allow graceful shutdown for active tasks; leases recover abrupt exits. The current worker has three concurrent lanes per process. Scale instance count deliberately to control total provider concurrency.
