# Virel Implementation Plan

Status: proposed milestones for review. Updated October 30, 2026.

The first milestone proves that web and native mobile can authenticate against the same backend and display the same profile and feed. Subsequent milestones establish the complete discovery and remix loop before expanding paid access. Foundation implementation was authorized and started on October 30, 2026; see foundation-status.md for progress and outstanding validation.

## Milestone 0 Resolve foundation choices

- Review the architecture blueprint and the previous Virel visual concept.
- Validate Convex Auth across web, iOS, and Android with an isolated prototype once coding is authorized.
- Select a Bun-compatible API framework and pin compatible toolchain versions, including Expo's required React and React Native versions.
- Identify environments and hosting candidates. Keep production credentials separate from local development.
- Record unresolved providers and policies without inventing final pricing or payout terms.

Completion: foundation decisions are documented, auth risks have an actionable outcome, and web/mobile routes and primary screens have an agreed direction.

## Milestone 1 Shared application foundation

Establish Bun workspaces and Turborepo using Cinakey's organization. Add web, mobile, admin, and minimal API shells, shared configuration, backend, API client, tokens, and platform UI foundations. Reserve worker placement; implement the service when a workload needs it.

Connect Convex Auth and profiles. Add a paginated feed backed by controlled seed media, explicit empty/loading/error states, and a minimal authenticated API operation. Use shared types without leaking server modules into clients. Document local setup and required environment variables.

Completion:

- The same account signs into web and mobile and sees the same profile and published feed.
- Profile changes propagate to both clients.
- Private profile operations reject unauthenticated and unauthorized requests.
- Sign-in persistence and logout work on browser, physical iOS, and physical Android.
- The API verifies authentication on its protected operation.
- Workspace checks and reproducible installs run through Bun commands.

## Milestone 2 Usable social feed

Build vertical playback, sound controls, pagination, follows, likes, comments, bookmarks, profiles, basic discovery, and activity notifications. Add reporting and minimal admin review. Apply the visual direction across web and mobile while using platform-appropriate navigation.

Completion: users can discover and interact with published content; pagination avoids unrestricted scans; moderation can hide reported content; real-device feed testing covers scrolling, preloading, memory, and background playback behavior.

## Milestone 3 Generation and publishing

Evaluate and integrate one provider supporting the intended remix input. Define capability contracts before exposing settings. Implement asynchronous jobs, credit lots and reservations using controlled development allocations, private asset ingestion, previews, explicit publishing, and downloads. Add text-to-video and image-to-video within the chosen provider's validated capabilities.

Completion: a generation survives client disconnect, surfaces progress on both clients, creates a private usable result, and can be published intentionally. Confirmed failure releases credits. Duplicate callbacks and uncertain submissions do not cause duplicate purchases or settlement. No public paid generation launches at this milestone.

## Milestone 4 Remix and attribution

Implement source-video transformations, immutable root and parent attribution, lineage display, remix permissions, and royalty eligibility. Exercise the accounting engine using test funding and pending awards. Preserve existing descendants when a source is unpublished and enforce moderation restrictions.

Completion: users discover another creator's video, generate a meaningful remix, publish it, and inspect attribution. Multi-generation chains and self-remix exclusions produce the agreed royalty outcomes. Permission races and deleted-source behavior have explicit tests.

## Milestone 5 Paid credits and pending earnings

Select payment integrations after business-country and mobile purchase requirements are known. Add verified purchase events, purchased/promotional credit allocation, immutable quotes, charge settlement, earnings views, financial reconciliation, and refund/chargeback handling. Add fraud holds, generation spending limits, and operational monitoring before paid beta.

Completion: a verified purchase grants credits once; entirely purchased funding qualifies correctly; a qualifying remix creates pending royalties once; reversals remain auditable. Operators can reconcile provider jobs, payments, credit balances, and royalty liabilities. Withdrawals remain disabled until their separate operational requirements are satisfied.

## Milestone 6 Controlled beta

Release to invited creators with configurable generation and spending caps. Complete privacy and account deletion flows, moderation and abuse tooling, public link previews/deep links, failure alerts, recovery procedures, release checks, and mobile store submission requirements. Measure infrastructure and media costs before final public pricing.

Completion: operators can investigate stuck jobs and financial mismatches, moderate content and chains, and disable risky operations. Users can complete the discovery-to-remix loop on web and mobile. Validate signup-to-first-generation, first-remix conversion, repeat remixing, retention, generation cost, and gross margin.

## Withdrawal activation

Treat operational payouts as a separate release gate. Configure and test identity verification, supported markets, minimum withdrawal, hold duration, fraud review, reversal recovery, payout reconciliation, and withdrawal idempotency before enabling requests that move funds.

## Verification strategy

Use targeted unit and Convex tests for authorization, lineage, credit reservations, exact arithmetic, settlement deduplication, and reversals. Cover provider integration boundaries with controlled fixtures and sandbox calls. Use Playwright for critical web journeys and choose a native end-to-end tool before beta. Test video playback and auth on physical devices; browser tests alone do not establish mobile quality.

Maintain a short decision log as milestones resolve open choices. Keep production launch and payout activation conditional on their concrete acceptance criteria rather than assumed dates.
