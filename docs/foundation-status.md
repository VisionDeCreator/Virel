# Virel Foundation Status

Updated October 30, 2026.

## Implemented source

- Bun workspaces and Turborepo tasks using Cinakey's project organization.
- React/Vite web shell with responsive navigation, indexed feed integration, native video controls, and profile forms.
- Expo mobile shell with five routes, secure auth storage, profile editing, and native video playback.
- Convex Auth password foundation, profile ownership and username validation, and indexed public feed pagination.
- Elysia/Bun API with health and protected current-profile endpoints.
- Admin shell with no privileged data access and a reserved worker directory.
- Backend and API tests focused on ownership, visibility, and failed authentication.

## Decisions

Elysia follows Cinakey's Bun API convention. Profiles use a separate table linked to auth users, keeping product fields separate from authentication internals. The foundation initially used bootstrap API/type files; CLI-generated references are now present for the configured development project. No provider or production credentials are copied from Cinakey.

## Local verification

- Workspace typechecks pass across all ten packages with TypeScript tasks.
- Web and admin production builds pass; API build checks pass.
- Two backend tests pass for profile authorization/username uniqueness and feed visibility/pagination.
- Two API tests pass for anonymous rejection and failure without backend configuration.
- Four Playwright checks pass in installed Chrome at desktop and mobile browser widths for navigation, direct routes, setup state, and horizontal overflow.
- iOS and Android JavaScript bundle exports pass with Expo SDK 58. These are bundle exports, not signed native builds or physical-device tests.
- A temporary server running in Bun returns HTTP 200 for health and HTTP 401 for anonymous profile access.
- Offline Expo dependency validation reports packages up to date; online validation remains pending.

The initial foundation had no deployment selected. The later matte visual implementation section records the currently configured development project and live read-only checks.

## Remaining milestone acceptance work

Email/password authentication is configured and browser validation has passed; native device validation remains pending. Physical iOS/Android verification, password recovery, verified email, OAuth, linking, and full session revocation acceptance are pending. Real-time synchronization between independent browser sessions is verified. The user supplied three visual references and approved the matte orange direction. Feed autoplay/preloading and production-grade error recovery belong to the next iteration. No generation provider, payment integration, hosted environment, or operational worker is enabled.

## Matte visual implementation

The approved warm dark/ivory/orange direction is implemented in shared design tokens, web/native components, and representative feed, creation, and profile screens. The studio has working prompt/settings controls but generation remains disabled. Offline concept media is explicitly labeled. Native tab icons, shared fields, and pause-on-navigation/background behavior are included.

Web/mobile/API environment files now target the existing Virel development deployment (vision-galliun / virel). Read-only live checks passed for the public feed and anonymous profile isolation. The user confirmed the destination and authorized authentication configuration. Signing keys and the development site URL are now configured, and the backend was deployed successfully. Live browser sign-up, sign-in, profile synchronization, persistence, logout, and authenticated API checks passed.

Six desktop/mobile-width browser tests and the four backend/API tests passed after the visual changes. Typechecks, web/admin/API builds, and native iOS/Android bundle exports also passed. See the visual style guide in docs/design/style-guide.md. The local setup command `bun run setup:clients` copies only the configured public deployment URL to ignored client/service environment files.

## Live authentication validation

Convex Auth is configured on the confirmed vision-galliun / virel development project, deployment nautical-goat-396. The official setup tool configured JWT_PRIVATE_KEY and JWKS without printing key material, and SITE_URL is http://localhost:5173. Backend deployment succeeded.

The opt-in command `PLAYWRIGHT_CHANNEL=chrome bun run test:auth` runs against the explicitly configured development deployment. It creates a labeled account with an example.invalid email address and random credentials; no emails are sent. Traces, screenshots, and video capture are disabled for this suite. Test accounts remain in development data and are identifiable by the virel-e2e email prefix.

The live test verified signup, password sign-in in an independent session, profile creation, real-time updates between sessions, reload persistence, valid-token API access, anonymous/invalid-token rejection, and logout persistence. Logging out one session did not sign out the independent session. Physical native device behavior and global revocation are not established by this browser test.

Convex reported that the team is above Free plan limits during deployment. Deployment and authentication succeeded, but team usage should be reviewed to avoid service interruption. No plan or billing changes were made.

## Studio implementation — October 31, 2026

Added shared web/native Studio operations, R2 upload and media verification, provider quotes/submission/polling, private previews and version history, AI revisions, publishing/unpublishing, feed remix links, profile publication listings, and promotional credit accounting. Runtime server configuration, development deployment, real provider/media acceptance, and physical-device validation remain pending. Google analysis is deferred. The R2 bucket remains private; publication is authorized from Convex metadata on each stable playback request. See studio-implementation.md.

## Two-mode Studio revision — October 31, 2026

Replaced the three creation modes with Create (Seedance 2.5, optional image/video guidance) and Remix (required source video). Added server-backed script segments, serial autosave with revision conflicts and local recovery, immutable script history, named @ references with replacement/rename, and web drag-and-drop for mixed media and script linking. Create output controls cover 4–15 seconds, 720p/1080p, and 16:9/9:16/1:1. The updated functions/schema are deployed to nautical-goat-396. Existing job snapshots remain readable. No paid render or physical-device acceptance was performed in this revision.

## Generation duration cap — October 31, 2026

New Create and Remix generations are limited to 4–15 seconds so newly created outputs fit the Remix duration requirement. Web, preview, and native controls share the same duration options. Server quote validation, draft saves, and the provider submission boundary enforce the cap. Restored longer drafts normalize to 15 seconds and save as a new version; historical snapshots remain unchanged. Previously accepted longer provider jobs may finish under their original request, but new submissions above 15 seconds are rejected. Optional Create reference videos may still be up to 30 seconds; they do not determine the output duration.

## API/worker migration — October 31, 2026

Studio storage/provider operations moved out of Convex actions into Bun API services and a separate worker. Both clients route side effects through authenticated API requests. Convex retains metadata, subscriptions, durable task claims, and financial transactions. Upload completion claims and worker lease fencing cover concurrent completion and restart recovery. R2/provider credentials are no longer required in Convex. Live storage and integration results are recorded in studio-implementation.md.

## Admin credit operations — October 31, 2026

The admin shell now has verified administrator sign-in, exact-email user lookup, promotional credit grant review/confirmation, recent generation summaries, paginated credit history, and filtered audit history. Backend authorization, role checks, rate limits, safe-integer validation, atomic lot/account/ledger/audit updates, and request-ID fingerprint deduplication protect credit grants. The deployment-key-authorized `admin:promote` command follows Cinakey's operator structure and requires an existing verified unique account.

Email verification uses Convex Auth codes and a protected API delivery bridge. Nodemailer follows Cinakey's SMTP environment/TLS/sender pattern; SMTP credentials stay in the Bun API environment. The `setup:email` command validates configuration and configures the bridge without printing secrets. Web, mobile, and admin support verification-code entry. Email delivery remains disabled until SMTP and a public HTTPS API origin are configured.

The final schema/functions were deployed to the configured Virel development deployment. All workspace tests, typechecks, builds, and formatting checks passed. Backend coverage includes 33 tests; API coverage includes 20 tests. Six isolated admin browser checks passed across desktop/mobile widths, including lost-response grant retries, and both layouts were visually inspected. Verification tests intercept delivery; SMTP tests mock Nodemailer. Real email delivery, full live admin grant acceptance, and physical-device verification remain pending.

The requested first administrator, `vision@galliun.com`, exists but is unverified. Promotion correctly refused it without changing roles. After configuring SMTP, run `setup:email`, restart the API, verify the account by signing in, then rerun `admin:promote`. See [admin setup](../deployments/admin/README.md).

## Cinakey email-code alignment — October 31, 2026

Supersedes the password-verification bridge described above. Virel now uses Cinakey's API-owned email-code sign-in structure on web, mobile, and admin. The API generates the six-digit code and random challenge, stores only hashes in Convex, sends Nodemailer SMTP, and marks accepted delivery. Convex consumes single-use challenges and preserves existing account IDs, balances, roles, and content. Five-attempt limits, ten-minute expiry, resend cooldown, email/IP/global limits, trusted proxy handling, and bounded cleanup are implemented. Password authentication, the internal email relay, the verification flag, and the setup:email command are removed.

SMTP configuration and EMAIL_NOTIFICATIONS_ENABLED=true on the API are sufficient for email sending. Localhost API URLs work for local browser clients; SMTP credentials stay out of Convex. Existing email normalization is a paginated internal cutover operation, with ambiguous normalized accounts refusing sign-in rather than merging.

The updated backend was deployed successfully to Virel development. Existing-email normalization completed with zero changes required. All workspace tests, typechecks, builds, and formatting checks passed; six desktop/mobile admin browser checks passed. The live email-code/session test passed against Convex using the loopback-only SMTP interceptor, covering independent sessions, profile synchronization, persistence, API authorization, and logout without sending real mail. Real SMTP delivery and physical-device acceptance remain pending sender/device configuration.

## Generation credit pricing v2 — November 1, 2026

Implemented and deployed 1,000-credit/USD pricing with exact rational arithmetic, one upward retail rounding, 30% default markup and a separate 5% supplier buffer. Quotes snapshot the rate/estimate/buffer/markup and expire after five minutes. The resumable legacy conversion preserved value by multiplying balances and funding lots by ten, retained original historical ledger units, and created migration audit records. The migration refused two pre-existing unknown submissions until their exact Sume idempotency keys and final refunded/zero-capture receipts were verified; those reservations were returned without purchasing replacement renders.

Real acceptance completed Create and Remix generations with private output ingestion and exactly-once settlement. Customer charges were 1,263 and 1,365 credits; supplier captures were $0.93 and $1.00, totaling $1.93 within the approved $5 budget. Final acceptance balance was 7,372 of its 10,000 promotional test credits with zero reserved. No unresolved generations remained. The resumable acceptance state is kept in ignored .local/generation-acceptance.json; it contains job IDs and receipts, not credentials or signed URLs.

Backend coverage includes 44 tests for accounting, currency migration, many funding lots, stale quotes, and concurrent worker claims. Workspace tests, typechecks and builds passed, as did six desktop/mobile admin browser checks. Physical-device acceptance and selling credit packages remain separate work.

Both iOS and Android bundle exports passed after the pricing/UI update. An authenticated quote through the running API returned the expected 1,263-credit price without submitting another generation.
