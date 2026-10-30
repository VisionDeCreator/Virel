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

Elysia follows Cinakey's Bun API convention. Profiles use a separate table linked to auth users, keeping product fields separate from authentication internals. Bootstrap Convex API/type files allow local compilation; refresh with codegen when a deployment is connected. No provider or production credentials are copied from Cinakey.

## Local verification

- Workspace typechecks pass across all ten packages with TypeScript tasks.
- Web and admin production builds pass; API build checks pass.
- Two backend tests pass for profile authorization/username uniqueness and feed visibility/pagination.
- Two API tests pass for anonymous rejection and failure without backend configuration.
- Four Playwright checks pass in installed Chrome at desktop and mobile browser widths for navigation, direct routes, setup state, and horizontal overflow.
- iOS and Android JavaScript bundle exports pass with Expo SDK 58. These are bundle exports, not signed native builds or physical-device tests.
- A temporary server running in Bun returns HTTP 200 for health and HTTP 401 for anonymous profile access.
- Offline Expo dependency validation reports packages up to date; online validation remains pending.

Convex code generation was attempted and reported that CONVEX_DEPLOYMENT is unset. No cloud deployment has been created or changed.

## Remaining milestone acceptance work

A Convex deployment and auth signing keys must be configured before live sign-in and shared-data validation. Physical iOS/Android verification, password recovery, verified email, OAuth, linking, revocation, and real-time cross-device acceptance are pending. The existing visual concept has not been provided. Feed autoplay/preloading and production-grade error recovery belong to the next iteration. No generation provider, payment integration, hosted environment, or operational worker is enabled.
