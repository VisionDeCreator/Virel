# Virel Implementation Plan

Status: foundation source implemented; live integration and device validation pending. Updated October 30, 2026.

The first milestone proves that web and native mobile can authenticate against the same backend and display the same profile and feed. Subsequent milestones establish the complete discovery and remix loop before expanding paid access. Foundation implementation was authorized and started on October 30, 2026; see foundation-status.md for progress and outstanding validation.

## Current baseline

The Bun/Turborepo workspace, React web/admin shells, Expo app, Elysia API, Convex Auth source, profile functions, and paginated feed source are implemented. Local typechecks, builds, backend/API tests, browser checks, and iOS/Android JavaScript exports have passed. These checks do not establish live authentication, cloud deployment, signed native builds, or physical-device performance.

Keep the existing architecture and build on this foundation. Do not recreate the workspace or copy Cinakey application code. See [foundation status](foundation-status.md) for the verification record.

## Next delivery sequence

| Order | Work package                                          | Depends on                                       | Result                                                  |
| ----- | ----------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| 1     | Connect the development backend                       | Convex project/team selection and account access | Deployed schema, generated types, configured clients    |
| 2     | Verify authentication and profile synchronization     | Work package 1                                   | Same account and profile working on web and mobile      |
| 3     | Complete account security and recovery                | Work package 2 and email/OAuth configuration     | Verified identity, recovery, and session controls       |
| 4     | Validate controlled media and feed playback           | Work package 1 and authorized media              | Shared feed proven on browser and native devices        |
| 5     | Apply the Virel visual reference                      | Visual reference and screen decisions            | Consistent web/mobile layouts and interaction states    |
| 6     | Complete foundation acceptance and development checks | Work packages 2–5                                | Recorded evidence and a stable base for social features |

After backend connection, media validation can proceed independently of account recovery and visual refinement. Provider evaluation can begin separately, but generation implementation follows the social foundation and credit architecture described below.

## Work package 1 Connect the development backend

- [ ] Confirm whether Virel uses an existing Convex project or a new project, and identify the owning team. Keep it separate from Cinakey and production data.
- [ ] Configure a Virel development deployment and deploy the existing schema and functions.
- [ ] Configure Convex Auth signing keys, the web origin, and required deployment environment values using the auth setup tooling.
- [ ] Set development URLs for web, mobile, and Bun API. Use a phone-accessible address for native API testing.
- [ ] Run Convex code generation to replace the bootstrap references with CLI-generated files, then rerun typechecks and backend tests.
- [ ] Document reproducible setup and verify that client variables contain no server credentials.

Acceptance: all three clients/services target the same intended development deployment; Convex functions deploy and generated types compile; the API health endpoint works; no production or Cinakey deployment is changed.

## Work package 2 Verify shared accounts and profiles

- [ ] Create an account through web and sign into the same account through iOS and Android development builds.
- [ ] Verify profile creation and editing from both platforms. Confirm a change appears in another active client without manual refresh.
- [ ] Test duplicate username rejection and anonymous/cross-user update restrictions against the development backend.
- [ ] Test app restart and browser reload, token refresh, local logout, and expired-session behavior.
- [ ] Call the Bun API with valid, missing, malformed, and expired bearer tokens. Confirm concurrent users cannot receive each other's profiles.
- [ ] Provide useful loading, session-expired, network-failure, and retry states without leaking internal errors.

Acceptance: a single identity owns one profile across clients; authorized updates synchronize; invalid credentials fail closed; session persistence works on actual iOS and Android devices. Document local logout separately from any global session revocation behavior.

## Work package 3 Complete account security and recovery

- [ ] Select a transactional email service and configure a development sender for verification and password recovery.
- [ ] Implement email verification, password reset, expiry, replay protection, and request throttling. Avoid account enumeration in public responses.
- [ ] Configure and validate Google and Apple sign-in as previously proposed, including web/native redirects and secure token storage. This requires provider accounts and app identifiers.
- [ ] Define explicit account linking behavior for verified identities; prevent accidental account takeover through a matching email alone.
- [ ] Validate session revocation and behavior after password reset. Add targeted tests for the intended policies.
- [ ] Record any Convex Auth capability gaps and decide whether to retain it or evaluate an alternative before public accounts are accepted.

Acceptance: verification and recovery complete on web and native clients; supported social logins resolve to the intended account; linking and revocation behavior are documented and tested. Public account access remains gated until this work is complete.

## Work package 4 Validate the shared video feed

- [ ] Import a small set of authorized HTTPS preview videos through the internal seed operation. Keep fixtures ineligible for royalties and remixing disabled.
- [ ] Verify identical publication visibility and pagination on web and mobile, including empty and exhausted-feed states.
- [ ] Build vertical feed playback with one active video, deliberate sound controls, bounded preloading, and pause behavior when content leaves view or the app enters the background.
- [ ] Handle unavailable media, buffering, connection loss, and playback errors without breaking navigation.
- [ ] Test real iOS and Android devices for scrolling, memory behavior, playback, and app background/foreground transitions.
- [ ] Confirm hidden/private videos never appear in the public feed and that newly hidden content updates connected clients.

Acceptance: the controlled feed plays reliably across platforms, pagination does not duplicate or skip records in the tested flows, only the intended video plays, and private/hidden content is excluded. Record devices and observed limitations; do not infer native quality from JavaScript exports.

## Work package 5 Apply the visual reference

- [ ] Obtain the previous Virel concept and review feed, sign-in/onboarding, profile, and navigation screens.
- [ ] Map colors, typography, spacing, and interaction states to shared tokens while retaining platform-specific UI components.
- [ ] Refine mobile tabs and desktop navigation, keyboard/safe-area behavior, focus indicators, contrast, and accessible labels.
- [ ] Review narrow mobile, tablet, and desktop layouts and capture representative previews.

Acceptance: the core screens follow the agreed concept and remain usable with keyboard navigation, native safe areas, larger text, and loading/error states. Backend work can continue while the reference is outstanding; final visual alignment cannot be claimed without it.

## Work package 6 Close foundation acceptance

- [ ] Configure CI for a frozen Bun install, formatting, typechecks, backend/API tests, web/admin builds, and browser tests.
- [ ] Add authenticated end-to-end coverage against an isolated test deployment once that environment is available. Keep anonymous setup-state coverage as a separate suite.
- [ ] Verify native bundle exports and document development-build/device checks. Choose a native end-to-end tool before beta.
- [ ] Review server/client import boundaries, environment handling, and API origin/CORS policy before browser API integrations are enabled.
- [ ] Update README and foundation status with exact commands, environment prerequisites, verification results, and remaining limitations.

Acceptance: automated checks are repeatable; work packages 1–5 have evidence for their acceptance criteria; remaining production-specific work is explicitly tracked. No deployment keys, OAuth secrets, or signing credentials are committed.

## Inputs needed to complete the next delivery

| Input                                                    | Needed for                                 |
| -------------------------------------------------------- | ------------------------------------------ |
| Convex account access and project/team choice            | Development deployment and live validation |
| Previous Virel visual reference                          | Final alignment of core screens            |
| Physical iOS/Android devices and development-build setup | Native session and playback acceptance     |
| Email provider and verified sender                       | Verification and recovery                  |
| Google/Apple configuration and app identifiers           | Social authentication and redirects        |
| CI repository/platform choice                            | Automated checks on pull requests          |

Use environment configuration or the provider setup flow for credentials rather than putting secrets in chat or documentation. Final AI provider, payment provider, business-country details, hosting, and payout policies remain later dependencies; they do not block the initial live profile/feed validation.

## Milestone 2 Usable social feed

After the foundation acceptance work above, extend the validated feed with follows, likes, comments, bookmarks, public creator profiles, basic discovery, and activity notifications. Add reporting, server-enforced admin roles, moderation actions, and minimal admin review. Preserve platform-appropriate navigation and the agreed visual direction.

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
