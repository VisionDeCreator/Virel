# Studio implementation

Updated October 31, 2026. Code implemented; live integration acceptance remains pending.

## User flow

Both authenticated clients use one creation editor. Starting without a platform base creates a new video; selecting an existing platform video activates Remix, with a visible source card and explicit Change/Remove actions. The backend retains Create and Remix as generation modes. Create uses Seedance 2.5 with a required script and optional image guidance in the editor; legacy optional video-guided jobs remain readable; text-only and image-guided generation share this single mode. Create permits 4–15 second outputs, up to 30 image references, and one optional video reference. Remix requires an existing platform video and reference images; uploaded files cannot be remix bases. Your private generated videos and published community videos with remixes enabled are eligible. Remix accepts a whole 4–15 second source and 1–8 image references. Upload limits are 200 MiB per video and 10 MiB per image. All uploaded reference videos and Remix sources must be 4–15 seconds. Videos must contain H.264 and have dimensions between 64 and 4,096 pixels. Images are JPEG, PNG, or WebP up to 8,192 pixels per dimension. Metadata is inspected server-side, not trusted from the client.

Users write a prompt with @image_1 references, select optional transformation targets, preserve source camera/motion, review a live credit quote, and submit. Uploaded source duration determines Remix billing (rounded up). A result stays private until explicit publication. Users can download, use a result as the next AI-edit source, publish, change publication settings, or unpublish. Each new render requires a new quote and credit reservation. There is no manual timeline editor or Google analysis integration.

Uploads are sent directly to signed R2 endpoints. Finalization checks size, MIME signature, and metadata, then seals a verified copy against reuse of the upload URL. Browser uploads show progress. Native uploads use Expo background upload tasks; interrupted finalization can be retried. Draft prompts/settings are saved locally per profile. Private source and result previews use signed URLs refreshed while the screen remains mounted. Users reopen versions to refresh expired URLs after extended suspension.

## Storage and delivery

The existing R2 bucket stays private and holds all media. No second/public bucket is required. Publishing records a stable URL at `${API_PUBLIC_URL}/media/<videoId>`. That API endpoint checks current publication status and returns a non-cacheable redirect to a five-minute signed R2 GET URL, supporting the R2 endpoint's byte-range video delivery. Unpublished or unavailable videos return 404. Previously issued links remain usable until expiry. Original uploads and private drafts are not made public through this endpoint.

Signed-in owners receive private preview/download links. Provider source links are short-lived signed R2 URLs. R2 CORS must allow the configured browser origins, GET/HEAD/PUT, and upload/range headers. Worker cleanup removes tracked abandoned uploads; configure R2 lifecycle rules to abort incomplete multipart uploads and remove untracked temporary objects according to an agreed retention policy.

## Credits and generation

The database contains accounts, promotional/purchased lots, an append-only ledger, immutable price quotes, generation jobs, media assets, and pending royalty entries. No public function grants purchased credits. Operator promotional grants have idempotency keys. The optional welcome allocation runs once per account and defaults to zero if unconfigured; local templates propose 1,000 promotional credits through WELCOME_CREDITS_V2.

Quotes expire after five minutes. Pricing is versioned with a snapshot of the supplier maximum, credits per USD, and markup. A free supplier estimate includes 5% headroom. Defaults are 1,000 credits/USD and 30% markup. Credits are integers. Supplier charges use integer microdollars.

Job acceptance atomically validates ownership/source permissions, reserves funding lots, creates the job, and enqueues a durable Bun worker task. Duplicate operation IDs or reuse of a quote return the existing job. Accounts allow at most three unresolved jobs. Submission checks the supplier price again and uses a stable provider idempotency key. Provider rejection releases credits; unknown submission outcomes retain them for operator reconciliation.

Worker polls collect final supplier receipts and ingest the result into R2 with a bounded-memory multipart upload before settlement. Ingestion failure retries retrieval, never generation. Settlement creates one private video, consumes the reservation, and records eligible pending royalties atomically. Duplicate/late completions or failures cannot double-charge, refund, or create awards. Wholly purchased-funded remixes can create the architecture's root/parent awards; promotional or mixed funding does not. Purchase, payout, royalty reversal, and operational finance UIs remain separate milestones.

A five-minute recovery cron handles interrupted submissions/polls. Unknown submissions without a provider ID need operator reconciliation: inspect the provider logs for idempotency key `virel-<jobId>`, then invoke internal `generation:reconcileProvider` with the verified provider ID. Only confirmed no-charge/failure outcomes should use internal `generation:fail` to release funds. Users can recheck known provider jobs from Studio. No automatic paid resubmission occurs.

## Configuration

API and worker load the ignored root `.env` for local development. Supply `CONVEX_URL`, the Virel deployment-specific `CONVEX_DEPLOY_KEY`, `API_PUBLIC_URL`, R2 credentials/bucket, provider settings, and optional pricing settings through server hosting secrets in production. Keep R2/provider secrets out of Convex and all client variables. The API verifies the user's bearer token before creating a privileged Convex service context, matching Cinakey's boundary. No user identity is accepted from request bodies.

`setup:studio` validates required settings without changing bucket configuration or copying secrets. Configure R2 CORS in Cloudflare for the exact web origins. Run `check:studio-storage` to verify signed PUT, HEAD, immutable copy, range GET, and browser CORS using temporary objects. Clients need their public Convex URL and `VITE_API_URL` / `EXPO_PUBLIC_API_URL`. Physical devices require a reachable API hostname.

The non-secret Convex `API_PUBLIC_URL` setting preserves old Convex `/media/` links as redirects to the API. `WELCOME_CREDITS` remains a Convex configuration setting. Authentication configuration remains managed in Convex.

## Acceptance

- [x] Backend/provider tests cover idempotent reservations, settlement, refunds, ownership, quote expiry, insufficient funds, unknown submissions, promotional allocations, purchased-funding royalty snapshots, public delivery visibility, unpublishing, provider request construction, and removed-reference safety.
- [x] Workspace typechecks; 15 backend/provider tests, 2 API tests, 5 authenticated Studio component tests, and 6 offline browser checks passed.
- [x] iOS and Android bundle exports passed after native dependency changes. Physical-device validation remains pending.
- [ ] Sync configuration, verify R2 CORS/private bucket access, and deploy backend to development.
- [ ] Confirm free provider estimates and actual source-video/reference request contract against the configured service.
- [ ] Run a controlled real upload → quote → generate → private preview → AI revision → publish → feed/profile → remix → unpublish acceptance journey.
- [ ] Verify playback seeking/range redirects, cross-device balances, suspension/reopen, interrupted upload recovery, and downloads on physical iOS/Android devices.

No live paid renders or successful R2 checks have been performed in this implementation session. Public beta still needs moderation/abuse controls, upload scanning, verified payments, signup abuse limits for promotional credits, provider quality measurements, and production operating policies.

## Two-mode Studio update — October 31, 2026

Create and Remix each open a single script directly, with generation settings, version history, and local recovery drafts. Segment selection, creation, and title controls are removed from web and mobile. Existing storage IDs and history are preserved for compatibility; Studio uses the existing default script for each mode. Switching modes flushes pending saves and restores that mode's script. Serial autosaves preserve edits made during a save; server revision checks prevent another session's changes from being silently overwritten. Saved script history can be previewed and explicitly restored as a new draft. Conflicting local recovery copies can also be restored explicitly.

Web supports mixed video/image file drops and multi-file picking, media thumbnails, and dragging library media into the script. Typing @ opens reference suggestions. References have stable aliases with rename-everywhere, replacement, and missing-reference validation. Create does not switch modes when video is attached and does not interpret the first image as a start frame. Native clients use multi-image picking, video picking, reference insertion/renaming/replacement, script history, and the same backend contracts.

Create quotes and submissions pass optional video guidance through Seedance's reference_video_urls and images through reference_image_urls. Legacy image jobs retain their image_url start-frame interpretation; stored old job snapshots are not rewritten. Legacy local text/image drafts normalize to Create. New jobs snapshot segment identity, script revision, title, reference bindings, and generation settings. Both modes enforce source ownership and platform remix permissions. Adding or removing a base preserves the current prompt and invalidates the reviewed cost. The library defaults to Ready, followed by All and In progress; failed records remain available for recovery and accounting but are hidden from the library. Credit activity is under Settings.

The updated backend was deployed successfully to development deployment nautical-goat-396. Automated checks cover 4–15 second Create requests, optional/no media, required Remix sources, permission enforcement in Create, immutable script history and save conflicts, stable named references, mixed drops, and serialized autosave. No paid provider render was triggered during this revision; source/provider quality, seeking, and physical-device acceptance still require live checks. Convex reported the account is above its Free plan limits during deployment; review account usage to avoid service interruption.

Final checks for the two-mode revision: workspace typechecking/build passed; 23 backend/provider tests, 2 API tests, 10 Studio interaction tests, and 6 offline browser checks passed. Both iOS and Android bundle exports passed. A live free Seedance 2.5 estimate against the configured Sume gateway succeeded without creating a generation job or logging credentials. Paid rendering, full media-backed provider acceptance, and physical-device validation remain pending.

## Generation duration cap — October 31, 2026

New Create and Remix generations are limited to 4–15 seconds so newly created outputs fit the Remix duration requirement. Web, preview, and native controls share the same duration options. Server quote validation, draft saves, and the provider submission boundary enforce the cap. Restored longer drafts normalize to 15 seconds and save as a new version; historical snapshots remain unchanged. Previously accepted longer provider jobs may finish under their original request, but new submissions above 15 seconds are rejected. Optional Create reference videos must also be 4–15 seconds; they do not determine the output duration.

## API and worker migration — October 31, 2026

R2 operations now live in `apps/api/src/services/r2.ts` and media services; provider estimates and rendering operations live alongside them. `apps/worker` runs the shared submission, polling, ingestion, and cleanup implementations. Clients use authenticated API requests for media, quotes, generation start/resume, publishing, and unpublishing; Convex subscriptions still provide live state and autosave.

Generation reservation atomically inserts a deduplicated `apiTasks` record. Workers claim tasks with renewable five-minute leases and renew every 30 seconds. All worker state mutations check the lease in the same transaction. Follow-up polls survive completion of the active task. An interrupted submission with no recorded provider ID enters reconciliation rather than buying another render. Existing provider IDs and output keys are retained; the recovery sweep adopts stale jobs. Legacy scheduled Convex submission/poll callbacks are inert so they cannot race the new worker. The old Workpool component stays mounted temporarily to drain previously scheduled callbacks.

Upload finalization claims an asset before copying it to a unique immutable key. The registration mutation validates the claim and removes the copy's garbage intent atomically. Expired or failed copies remain reclaimable after 24 hours; staging deletion also has a durable fallback. Registered assets are not reclaimed as temporary media. A lost completion response cannot cause deletion of an already registered copy.

Run the API and worker against the same Convex deployment and bucket. Root `bun run dev` now includes both services. Earlier deployment-verification entries are historical; this migration supersedes their runtime architecture.

## Migration verification

The database/task migration was deployed to development `nautical-goat-396`. The server-only deploy key successfully authenticated the API/worker transport. Private R2 signed PUT, immutable copy, HEAD, range GET, and CORS checks passed after bucket access was updated. Browser acceptance passed real sign-up, cross-session state, authenticated API upload signing, a real 15-second H.264 upload and private range preview, and rejection of a 16-second upload. Test account/media records remain in development; temporary storage-smoke objects were removed. No paid provider render was triggered.

Virel's local API now uses port 3101 to avoid Cinakey's port 3001. The current Virel web origin on port 5175 is included in API CORS, and R2 CORS for both configured local origins passed. Physical-device acceptance and paid end-to-end provider rendering remain separate checks.

Final migration checks: 50 automated tests, workspace typechecks, builds, and formatting passed. The local API is healthy on port 3101, the running web client points to that API, and the Bun worker connected successfully. No generation jobs were pending at worker startup.

## Credit denomination and pricing v2 — November 1, 2026

New generation quotes use 1,000 Virel credits per USD, a 5% supplier buffer, and a configurable markup (30% default). Supplier estimates stay in integer microdollars. BigInt rational arithmetic computes the retail amount with one upward rounding; supplier headroom is calculated separately. The accepted quote stores its original estimate, supplier maximum, buffer, rate, markup, pricing version, exact input, and five-minute expiry. A changed model/input needs another quote; legacy v1 quotes are rejected at start. The submission recheck compares the current raw supplier estimate against the accepted supplier ceiling, rather than adding the buffer twice.

The cutover pauses new credit mutations and refuses unresolved generations. It converts legacy accounts and lots by 10× in resumable transaction batches, verifies each account's funding total, and records creditMigrations audit entries. Account/lot currency markers prevent double conversion. Historical credit ledger and admin audit records retain their stored units, while queries return normalized current values. Historical job costs are also displayed in current units. Old welcome-credit configuration is interpreted at its legacy 100-credit/USD scale; set WELCOME_CREDITS_V2 in Convex for an explicit new-scale allocation.

Credit reservation, confirmation, release, and idempotency remain transactional. Funding selection now iterates past depleted lots instead of failing after the first 100 records. Both clients show quoted credits, available balance after acceptance, expiration, and distinct reservation/charge/return activity. Admin generation summaries include provider IDs, supplier ceilings, actual captured USD, financial state, and pricing snapshots.

Sume's free live estimate confirmed Seedance 2.5 at 4 seconds/720p for $0.9248, producing a 1,263-credit customer quote. Model metadata confirmed the selected resolution, aspect ratio, references, and duration support. Sume's documented non-charged/refunded refusal codes are distinguished from unknown network/5xx outcomes. The latter keep reservations rather than purchasing replacement renders.

Two pre-existing Virel submissions without recorded provider IDs were matched by their exact Sume idempotency keys. Their final receipts confirmed failed status, full refunds, and zero captured cost. Provider IDs were attached and the reserved credits returned before migration. No Cinakey jobs were modified.

### Live pricing acceptance

The v2 migration completed on Virel development and verified legacy account/lot consistency. Real Create and Remix generations both completed, were copied into private R2 storage, and settled exactly once. Create charged 1,263 credits with $0.93 captured by Sume; Remix charged 1,365 credits with $1.00 captured. Total supplier spend was $1.93 against the approved $5 limit. The labeled acceptance account finished at 7,372 available credits from its 10,000-credit fixture grant, with zero reserved and one charge event per job. No unresolved jobs remained after acceptance.

A live concurrency race was also addressed: a duplicate claim during a fresh submission now returns without marking the active worker interrupted. A claim after the five-minute submission lease window still enters reconciliation; unknown submission outcomes never trigger a replacement purchase. Tests cover fresh concurrent claims and expired-lease fencing.

Final verification also passed an authenticated free quote through the actual API on port 3101 (1,263 credits), all workspace tests/typechecks/builds, six admin desktop/mobile browser checks, formatting, and iOS/Android bundle exports. Device interaction/playback acceptance still requires physical devices. The final live credit state had migration phase complete and no outstanding reservations.
