# Virel Admin

The admin app supports email-code sign-in, exact-email user lookup, promotional credit grants, recent generation summaries, paginated credit history, and filtered audit history. Production hosting remains unprovisioned.

## Run locally

1. Deploy the backend schema/functions to the intended Virel development deployment using `bun run dev:convex --once`.
2. Run `bun run setup:clients` to configure the web/admin/mobile backend and API URLs.
3. Configure SMTP in the ignored root `.env`, set `EMAIL_NOTIFICATIONS_ENABLED=true`, and restart the API. Run the API with `bun run dev:api` and the admin app with `bun run dev:admin`.
4. Sign in at http://localhost:5174 with your email and the six-digit code. The same flow signs in existing users or creates new verified users. Password sign-in is retired.
5. Promote the first verified account using `bun run admin:promote vision@galliun.com --reason "Initial operator setup"`, then reload the admin app.

The promotion command follows Cinakey's operator-command structure: an existing verified unique account, private deployment credentials, an operator audit entry, and safe repeat execution. It does not create accounts, grant credits, or send mail. No administrator is promoted automatically.

## Email sign-in matches Cinakey

The client requests a code from `POST /auth/email/request` on the Bun API. The API generates a random six-digit code and separate 256-bit challenge, stores only hashes in Convex, sends through Nodemailer, and marks the challenge delivered only after SMTP accepts the recipient. The client submits the code and challenge to Convex's `email-otp` provider, which verifies email possession and establishes the session.

Configure these values in the root `.env` locally or the API hosting environment:

```dotenv
EMAIL_NOTIFICATIONS_ENABLED=false
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=true
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_NAME=
SMTP_FROM_EMAIL=
SMTP_REPLY_TO=
```

Set `EMAIL_NOTIFICATIONS_ENABLED=true` when ready. As in Cinakey, `false` disables SMTP delivery and email sign-in cannot complete. Blank ports default to 465 for implicit TLS or 587 with required STARTTLS when `SMTP_SECURE=false`. SMTP credentials stay on the API. Sender/reply-to validation, bounded connection timeouts, disabled file/URL access, sanitized errors, and deterministic Message-IDs follow Cinakey's SMTP pattern.

No `setup:email`, `AUTH_EMAIL_VERIFICATION`, shared email-delivery secret, or cloud-to-local callback is needed. Local clients can use `http://localhost:3101` as their API URL; the API contacts Convex directly using its existing deployment credentials. `API_PUBLIC_URL` remains relevant to media delivery, not email verification. Native physical devices require a device-accessible API hostname.

Allow browser origins with `AUTH_WEB_ORIGINS` (comma separated). Defaults include http://localhost:5173 and http://localhost:5174. If using another port, add its exact origin (for example, http://localhost:5176) to the root `.env` AUTH_WEB_ORIGINS list and restart the API. The admin dev server uses strict ports: if its requested port is occupied, free it or choose an explicit port instead of relying on automatic fallback. Studio origins are also allowed. CORS does not replace rate limits. If deployed behind a proxy, set `AUTH_TRUSTED_PROXY_IPS` only to actual proxy peers; untrusted forwarded-IP headers are ignored. Codes expire after ten minutes, allow five guesses, and are single-use. Resends replace the previous code after a 60-second cooldown. Limits are five sends/email/hour, ten/email/day, 100/client-address/hour, and 1,000 globally/hour. Expired challenge cleanup runs every ten minutes in bounded batches.

Browser challenges survive reload in session storage; plaintext codes are never stored. Native challenges remain in memory and a new code can be requested after an app restart. Failed verification keeps the challenge available for retry. Both clients show cooldown and expiry states.

## Existing accounts

The cutover's internal `authOtp:normalizeExistingEmails` operation normalizes existing user emails in pages. It preserves user IDs, profiles, ownership, credits, roles, and sessions. Duplicate normalized emails are not merged: sign-in refuses ambiguous accounts until they are resolved. Successful email-code sign-in verifies the existing matching user. Existing password credential rows are inactive because the password provider is no longer registered; no password fallback exists. Existing signed-in sessions remain usable.

## Credit workflow

Search an existing email, verify the recipient, enter 1–1,000,000 whole credits and a 3–500 character reason, review, then confirm. Current balances are live; the review estimate can change while generations run. The success message reports the balance immediately after the grant.

Each grant atomically updates available credits, creates a promotional lot, and appends the credit ledger and audit record. Reserved credits, active jobs, and welcome allocation are untouched. Promotional credits retain existing royalty eligibility rules. Grants are limited to twenty per administrator per minute. Both `platform_admin` and `billing` roles can administer credits; the bootstrap command grants `platform_admin`. Role-management UI, deductions, purchases, and grants to unregistered emails are outside this release.

If submission fails, use **Retry same grant**. The original request ID and payload fingerprint prevent duplicate allocation. Keep the review open until the outcome is known: reloading or cancelling creates a new request on the next submission, so check history before replacing an uncertain grant.

Audit history records actor/recipient emails and IDs, reason, amount, time, and before/after balances. Filter by actor, recipient, action, and local dates. Credit/audit results load in pages of twenty; recent generation summaries show ten jobs without private media or provider credentials.

## Validation

`bun run test`, `bun run typecheck`, `bun run build`, and `bun run format:check` cover backend accounting/auth, SMTP and API issuance, shared sign-in state, and builds. `PLAYWRIGHT_CHANNEL=chrome bun run test:admin` exercises isolated desktop/mobile admin workflows. `PLAYWRIGHT_CHANNEL=chrome bun run test:auth` exercises real Convex sign-in and sessions with a loopback-only test server that intercepts SMTP for labeled example.invalid recipients; it sends no real email. Traces/video/screenshots are disabled for live auth.

Actual SMTP delivery and physical-device acceptance still require configured infrastructure. Verify the first admin account through its inbox, promote it, grant a small development allocation, and confirm Studio balance and both histories. Never run live acceptance against Cinakey or production.

## Generation finance

Virel uses 1,000 credits per USD of standard generation value. User details show the latest jobs with their provider job ID, pricing version/snapshot, supplier maximum and final captured amount, plus reservation/settlement/release state. A refunded/failed job returns its reservation; unknown outcomes require provider reconciliation, not a replacement generation.

The `credits:migrate` operator command performs the historical 10× denomination cutover without minting promotional value or rewriting historical ledger rows. It refuses outstanding jobs and checks account/lot consistency before completion. If interrupted, rerun it to continue from the saved phase. Do not manually release unknown-charge reservations merely to unblock migration.
