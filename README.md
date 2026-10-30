# Virel

AI video discovery and remix platform. The initial foundation includes a Bun workspace, web and admin shells, an Expo mobile app, a Bun API, and Convex profile/feed functions. Generation, purchases, royalties, and payouts are not enabled.

## Requirements

- Bun 1.3.14 (workspace package manager and dedicated service runtime).
- Node.js LTS where required by Expo tooling, plus Xcode/Android tooling for local native development builds.
- A Convex development deployment for live authentication and shared data.

## Install and preview

```sh
bun install
bun run dev
```

Web runs on http://localhost:5173 and the API on http://localhost:3001. Without Convex configuration, web and mobile show an explicit setup state. Admin runs separately with `bun run dev:admin` on port 5174.

## Connect the backend

1. Run `bun run dev:convex` and create/select a development deployment through the Convex CLI. This deploys the local schema and functions. Do not point local development at production.
2. Configure Convex Auth using its official setup CLI from `packages/backend`: `bunx @convex-dev/auth`. Follow its prompts to configure signing keys and SITE_URL for the web origin. Review [Convex Auth setup](https://labs.convex.dev/auth/setup).
3. Copy `apps/web/.env.example` to `apps/web/.env.local` and set `VITE_CONVEX_URL` to the deployment's .cloud URL. Set the same deployment in `apps/mobile/.env` as `EXPO_PUBLIC_CONVEX_URL`, and `apps/api/.env` as `CONVEX_URL`. Never copy signing keys into client variables.
4. Run `bun run --cwd packages/backend codegen` after backend changes, then restart clients.
5. Open Profile, create an account, and save a profile. Use that account on mobile against the same deployment.

Password authentication is a development foundation. Email verification/recovery, social login, session revocation, and account linking still require validation and implementation before public access. No admin privileges are granted through the client.

## Mobile

```sh
bun run dev:mobile
```

Use an Expo development build for native testing (`bun run --cwd apps/mobile ios` or `android`). Set device-accessible hostnames for API URLs: localhost on a physical phone refers to the phone. SecureStore holds native auth credentials. EAS profiles are included but no Expo project, app identifiers, signing credentials, or store listing has been provisioned.

## Controlled feed media

The feed is initially empty. After creating an account, an operator can invoke `feed:seed` through the Convex dashboard with that account's users ID, a title, and an HTTPS URL for authorized MP4 preview media. This is an internal function unavailable to clients. Imported fixtures have remixing disabled and are never royalty eligible. Do not use third-party media without permission.

## API

- `GET /health` reports process health.
- `GET /v1/me` requires a valid Convex Auth bearer token. It validates the session against Convex before returning the current profile.

Clients read reactive data directly from Convex. The API is reserved for integration operations; it is not a general proxy. Browser cross-origin API calls are not enabled yet. Deployment origins, CORS, webhook verification, and service authentication must be configured when those integrations are introduced.

## Checks

```sh
bun run typecheck
bun run test
bun run build
bun run format:check
bun run test:web
```

`build` builds web/admin and checks API source. Native bundle validation is explicit: `bun run --cwd apps/mobile export:ios` and `export:android`. Native device validation is still required; bundle generation does not verify session persistence or playback performance.

Browser tests require Playwright Chromium (`bunx playwright install chromium`) or an installed Chrome browser (`PLAYWRIGHT_CHANNEL=chrome bun run test:web`).

## Structure and planning

Applications live in `apps/`, shared packages in `packages/`, and environment guidance in `deployments/`. See [architecture](docs/architecture.md), [implementation milestones](docs/implementation-plan.md), and [foundation status](docs/foundation-status.md).
