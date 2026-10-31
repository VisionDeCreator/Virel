# API deployment

Run `bun run --cwd apps/api start` with Bun and workspace dependencies. Supply `HOST`, `PORT`, `CONVEX_URL`, a deployment-specific `CONVEX_DEPLOY_KEY`, `API_PUBLIC_URL`, `STUDIO_WEB_ORIGINS`, private R2 S3 credentials, and provider/pricing configuration as hosting secrets. Root `.env` is a local-development convenience only. The HTTP host must be reachable by mobile devices; localhost only works for local web/simulator use.

The API validates user bearer tokens with Convex before executing its explicit Studio service allowlist. It signs direct R2 uploads, verifies immutable copies, prepares credit quotes, publishes results, and redirects authorized media requests. It never proxies whole video uploads or playback through HTTP handlers. Run the separate worker for generation and cleanup.

Configure browser origins in both API CORS and R2 bucket CORS. Keep the bucket private. Set the non-secret `API_PUBLIC_URL` in Convex for compatibility redirects from old `/media/<videoId>` links; R2/provider credentials are not needed there. New published links use the API URL directly.

`GET /health` is process liveness. `bun run setup:studio` checks required local settings; `bun run check:studio-storage` verifies temporary R2 writes, copies, reads, and CORS without modifying bucket configuration. A successful health response alone does not validate R2 or provider access.
