# API deployment

Run `bun run --cwd apps/api start` with Bun and workspace dependencies. Supply `HOST`, `PORT`, `CONVEX_URL`, a deployment-specific `CONVEX_DEPLOY_KEY`, `API_PUBLIC_URL`, `STUDIO_WEB_ORIGINS`, private R2 S3 credentials, and provider/pricing configuration as hosting secrets. Root `.env` is a local-development convenience only. The HTTP host must be reachable by mobile devices; localhost only works for local web/simulator use.

The API validates user bearer tokens with Convex before executing its explicit Studio service allowlist. It signs direct R2 uploads, verifies immutable copies, prepares credit quotes, publishes results, and redirects authorized media requests. It never proxies whole video uploads or playback through HTTP handlers. Run the separate worker for generation and cleanup.

Configure browser origins in both API CORS and R2 bucket CORS. Keep the bucket private. Set the non-secret `API_PUBLIC_URL` in Convex for compatibility redirects from old `/media/<videoId>` links; R2/provider credentials are not needed there. New published links use the API URL directly.

`GET /health` is process liveness. `bun run setup:studio` checks required local settings; `bun run check:studio-storage` verifies temporary R2 writes, copies, reads, and CORS without modifying bucket configuration. A successful health response alone does not validate R2 or provider access.

## Email-code sign-in

Nodemailer uses Cinakey's SMTP variable/TLS/sender pattern. Configure SMTP in the root `.env` or API hosting secrets and set `EMAIL_NOTIFICATIONS_ENABLED=true`, then restart the API. No extra email setup command or Convex-to-API shared secret is needed. See [admin setup](../admin/README.md).

`POST /auth/email/request` accepts a bounded email-only request, applies email/address/global limits in Convex, generates the code/challenge, sends SMTP, and returns the challenge after delivery. Browser origins must be allowed by `AUTH_WEB_ORIGINS` or `STUDIO_WEB_ORIGINS`. Only configured proxy peers may supply forwarded client addresses through `AUTH_TRUSTED_PROXY_IPS`. Keep auth request bodies out of access logs. SMTP credentials, plaintext codes, provider errors, and deployment credentials never reach clients. The retired `/internal/auth/email` delivery bridge is removed.
