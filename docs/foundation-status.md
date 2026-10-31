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
