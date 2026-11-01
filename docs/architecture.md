# Virel Architecture Blueprint

Status: planning baseline for review. Updated October 30, 2026.

Virel connects video discovery, AI generation, remixing, and creator royalties. Web and native mobile clients share one Convex backend and the same financial rules. The user approved this blueprint and authorized implementation on October 30, 2026.

## Approved stack

| Area              | Choice                                                                          |
| ----------------- | ------------------------------------------------------------------------------- |
| Language          | TypeScript                                                                      |
| Workspace tooling | Bun workspaces and Turborepo                                                    |
| Web               | React, Vite, React Router, Tailwind CSS, shadcn/ui                              |
| Mobile            | React Native, Expo, Expo Router                                                 |
| Administration    | Separate React web application                                                  |
| API service       | Bun and Elysia                                                                  |
| Backend           | Convex database, queries, mutations, actions, and real-time subscriptions       |
| Authentication    | Convex Auth, subject to web and mobile validation                               |
| Job orchestration | Durable Convex tasks executed by the Bun worker                                 |
| Dedicated workers | Bun services when workloads require them                                        |
| Media             | Private Cloudflare R2 for all media; Convex-authorized signed playback delivery |
| Testing           | Vitest, convex-test, and Playwright; native end-to-end tool remains open        |

Bun replaces pnpm for dependency management, scripts, utilities, and dedicated API and worker execution. Browser code runs in the browser, native mobile code in the mobile JavaScript engine, and Convex functions in Convex-supported runtimes. Expo tooling may still require Node.js LTS for specific commands. Shared client packages must avoid Bun-only APIs.

## Repository structure

Use Cinakey's apps, packages, deployments, docs, and scripts organization as the base. Reuse the organizational approach rather than copying its product code, secrets, infrastructure state, or dependencies wholesale.

```text
Virel/
├── apps/
│   ├── web/                 # public/ and src/{app,features,components,lib,test}
│   ├── mobile/              # app/ routes, assets/, src/{features,components,lib,test}
│   ├── admin/               # src/{app,features,components,lib,test}
│   ├── api/                 # src/{config,routes,providers,services,lib}
│   └── worker/              # src/{config,jobs,services,lib}
├── packages/
│   ├── backend/            # convex/{schema,auth,http,domain functions,lib,adapters}
│   │                       # src/ public exports and test/
│   ├── api-client/         # platform-compatible API integration and hooks
│   ├── shared/             # domain types, validation, pure utilities
│   ├── design-tokens/      # colors, typography, spacing
│   ├── ui/                 # web components for web and admin
│   ├── ui-native/          # native mobile components
│   └── config/             # shared TypeScript and lint configuration
├── deployments/
│   ├── api/
│   ├── web/
│   ├── admin/
│   ├── convex/
│   ├── worker/
│   ├── mobile/             # release guidance; Expo config stays with mobile app
│   └── scripts/
├── docs/
├── scripts/
├── package.json
├── bun.lock
├── turbo.json
├── .env.example
└── README.md
```

Use feature folders such as feed, generation, remix, profile, credits, earnings, and moderation. Routes compose features; reusable components belong outside feature-specific screens. Introduce directories when they have a purpose rather than populating empty infrastructure.

Client imports from backend must expose generated API references and safe types only. Server implementations, credentials, and provider SDKs must not enter client bundles. The shared API client must support browser and React Native consumers without requiring React DOM. Platform-specific session persistence and upload behavior belong in explicit adapters. Web UI and native UI share tokens, not DOM components.

## Service ownership

| Component                   | Owns                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Web and mobile              | Presentation, playback, authenticated requests, local interaction state                                       |
| Admin                       | Moderation and operations interfaces; backend authorization remains mandatory                                 |
| Bun API                     | Integration endpoints, verified provider webhooks, ingestion coordination, worker communication               |
| Convex                      | Identity integration, profiles, authorization, social data, job state, lineage, credit and royalty settlement |
| Convex tasks and Bun worker | Durable claims, bounded execution, retry scheduling, recovery                                                 |
| Bun workers                 | Provider submission/polling, media processing, ingestion, and cleanup                                         |
| R2                          | Private durable media assets, signed uploads, and authorized playback delivery                                |

Clients call Convex directly for reactive application data and the Bun API for integration operations. Do not proxy every Convex request through the API. Convex auth callback routes remain with the auth integration; each external webhook has exactly one configured owner. Provider adapters execute server-side near their orchestration, with shared contracts preventing business rules from being duplicated across services.

API and worker calls into Convex use narrowly scoped server operations. Validate user tokens for user requests, signatures for webhooks, and service credentials for worker requests. Never trust a supplied user ID as authentication. Workers report results; Convex validates and commits authoritative state changes.

## Data model

The specification's primary entities remain: users, follows, videos, generationJobs, videoLikes, comments, bookmarks, creditsLedger, royaltiesLedger, wallets, withdrawals, notifications, hashtags, videoHashtags, reports, moderationActions, and payments.

Add supporting records as needed for credit lots and reservations, media assets, processed external events, versioned pricing and royalty rules, and admin audit history. These are logical requirements; exact table names and indexes will be finalized with the schema.

Videos store creator, root video, immediate parent, job reference, visibility, publication state, remix permission, royalty eligibility, moderation state, and media metadata. Root identity is immutable. Server code resolves ancestry and beneficiaries from stored records. Preserve historical lineage when public content becomes unavailable.

Generation jobs store owner, input assets, source, provider/model, immutable request and price snapshot, funding allocation, operation key, provider job ID, processing state, financial state, output reference, and timestamps. Keep generation success distinct from publication and royalty availability.

Use indexed, paginated feed and relationship queries. Start discovery with transparent recency and engagement rules. Defer advanced personalized ranking until usage supports it.

## Generation lifecycle

Proposed processing states are reserved, submitting, queued, generating, ingesting, succeeded, failed, and reconciliation_required. Track credit reservation, settlement, and reversal separately from processing status.

1. Authenticate the user, validate inputs and source permissions, enforce limits, and calculate a server-side quote.
2. Atomically create the job and reserve credits. Snapshot funding sources, royalty configuration, price, and validated lineage.
3. Submit through a provider adapter using an idempotency key where supported. Persist the external job reference.
4. Wait through signed callbacks or scheduled checks. Deduplicate events and prevent stale callbacks from regressing terminal state.
5. Ingest output into controlled storage, establish private preview access, and verify that the result is usable.
6. In one authoritative Convex mutation, finalize the charge, record the generated video, create pending royalties, and mark settlement complete.
7. Let the user preview, download, publish, or discard the private result. Publishing requires explicit user action.

An unknown submission outcome enters reconciliation before another paid request is attempted. Retries must not create duplicate provider charges, credit charges, videos, or royalties. A confirmed failure releases reserved credits exactly once. An ingestion failure after provider completion requires recovery or an explicit terminal policy, rather than an automatic second generation purchase.

The remix workflow uses the selected video as a real generation input with user instructions. Provider capabilities govern available controls. Prompt copying alone does not satisfy the intended remix experience.

## Financial rules

Credits and earnings are separate ledgers. Track purchased and promotional funding through credit lots. Only generations funded entirely by purchased credits earn royalties. Promotional generations can create eligible platform originals but earn no royalty on that generation. Mixed funding does not qualify under this rule; display qualification before confirmation.

Each new generation includes a fixed $0.015 surcharge (15 credits at 1,000 credits/USD), added after supplier buffer and markup. Eligible remix awards come from this amount; the platform retains any undistributed share, including the entire fee for originals. A confirmed failure returns the fee along with the generation reservation.

Store USD earnings as integer microdollars: $0.01 is 10,000 and $0.005 is 5,000. Keep payment-provider currency units explicit and convert exactly at integration boundaries. Guard integer ranges. Wallet totals are maintained atomically with ledger entries and can be reconciled against history.

| Successful paid generation                             | Royalty                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| Original generation                                    | None                                                                  |
| First remix                                            | Root creator receives $0.01                                           |
| Deeper remix                                           | Root creator receives $0.01; immediate parent creator receives $0.005 |
| Root and parent are the same creator on a deeper remix | Combine applicable awards to $0.015                                   |
| Generator is a beneficiary                             | Exclude that person's award; other eligible awards remain             |
| Failed or refunded generation                          | No final royalty; reverse any recorded award where applicable         |

Maximum two unique beneficiaries receive royalties. External uploads do not automatically establish royalty-eligible roots. Successful qualifying generations create pending royalties even if their outputs are never published. Rates are configurable and versioned; changes apply prospectively using the job's snapshot.

Maintain append-only accounting events. Refunds, chargebacks, fraud holds, moderation reversals, and withdrawals have explicit events and references to their originals. Beneficiary deduplication and settlement keys prevent duplicate awards. Pending funds become available only under configured hold and review rules. Negative adjustments after withdrawal require a defined recovery policy before payouts launch.

Withdrawals remain disabled until the payout provider, identity requirements, supported markets, thresholds, hold policy, and fraud controls are configured. Public generation pricing remains open pending measured economics.

## Permissions and moderation

Disabling remixing blocks new requests against that video. Unpublishing removes it from public discovery and blocks new remixes against it. Existing descendants retain attribution and may remain public and remixable under their own permissions. Moderation may restrict a whole chain when required. Historical accounting and attribution persist subject to the eventual retention and account-deletion policy.

At generation acceptance, validate permissions and snapshot lineage. Proposed race policy: ordinary unpublishing after acceptance does not cancel an accepted job; a moderation block may halt processing or publication. Confirm this policy before generation implementation.

Private outputs use authorized access. Media URLs are delivery mechanisms, not proof of ownership. Enforce upload limits, allowed file types, ownership checks, generation limits, moderation controls, and provider safety settings. Add royalty-farming detection before paid remix access.

## Mobile and public links

Web and mobile use the same accounts, profiles, social graph, jobs, and balances. Store native credentials using the auth integration's secure storage mechanism. Plan deep links for login callbacks, videos, profiles, and notification destinations. Test feed playback on physical iOS and Android devices early.

Rich social previews and search indexing for public URLs need a server-rendering or metadata-serving strategy beyond the Vite client alone. Select that strategy before public sharing launches. Mobile digital purchases require an app-store purchasing design and receipt verification; a web checkout integration alone does not settle that design.

## Open integration decisions

| Decision                   | Required evidence or input                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| Bun API framework          | Small service requirements and Bun compatibility evaluation                                       |
| Convex Auth production use | Cross-platform login, recovery, linking, persistence, and revocation validation                   |
| First AI provider          | Source-video transformation quality, input rights, costs, latency, safety, idempotency, callbacks |
| R2 ingestion and delivery  | Private previews, export fidelity, provider input access, lifecycle and cost tests                |
| Payments and payouts       | Business country, creator markets, provider eligibility, mobile purchase requirements             |
| Web/API/worker hosting     | Deployment regions, persistent worker needs, operational cost                                     |
| Public metadata rendering  | Sharing requirements and deployment approach                                                      |
| Observability and CI       | Error reporting, event correlation, metrics, secret handling, release checks                      |
| Visual system              | Previous Virel visual concept and key screen review                                               |

## Technical references

- [Cinakey workspace configuration](../../../Cinakey/Cinakey/package.json) and [task configuration](../../../Cinakey/Cinakey/turbo.json).
- [Expo guidance for Bun](https://docs.expo.dev/guides/using-bun/).
- [Convex Auth](https://docs.convex.dev/auth/convex-auth).
- [Convex actions and external calls](https://docs.convex.dev/functions/actions).
- [Convex Workflow](https://www.convex.dev/components/workflow).
- [Cloudflare video delivery](https://developers.cloudflare.com/use-cases/media-streaming/video-delivery/).

## Studio implementation update — October 31, 2026

Storage and generation use the Cinakey API/worker service boundary. The Bun API authenticates clients, signs direct R2 transfers, verifies uploads, prepares quotes, and publishes results. A separate Bun worker executes durable leased Convex tasks for provider submission, polling, R2 ingestion, and cleanup. Convex owns permissions, asset/script/job metadata, credit reservation and settlement, and real-time subscriptions. R2 and provider credentials exist only in API/worker server environments.

All media lives in one private R2 bucket. Stable API playback routes verify current Convex publication status before issuing five-minute signed redirects. Legacy Convex URLs redirect to the API. Unknown submissions are reconciled rather than automatically resubmitted; worker lease checks fence stale state updates. See studio-implementation.md for operational details and live acceptance status.
