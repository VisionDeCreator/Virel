# Virel Visual System

Approved direction: warm dark surfaces, warm ivory typography, and solid orange actions. Buttons use no gradients, glow, glossy highlights, or decorative shadows.

## Shared tokens

| Role            | Value   |
| --------------- | ------- |
| Canvas          | #120e0c |
| Surface         | #1c1714 |
| Raised control  | #27201b |
| Border          | #3d332b |
| Primary text    | #fff4e1 |
| Supporting text | #b7aa9d |
| Primary action  | #ff641f |
| Text on orange  | #231006 |

Use a system sans-serif stack for this iteration. Display headings use tight spacing and a clear two-level hierarchy; body text stays comfortable and understated. Web uses fluid heading sizes and native uses platform text rendering. The wordmark symbol remains provisional.

Spacing follows 4, 8, 16, 24, 32, and 48 units. Controls use 12-unit corner radii, panels use 20, and avatars use circular shapes. Primary actions have at least 46 CSS pixels of height on web and 48 points on native. Selected modes use orange text and a fine orange border rather than an illuminated effect.

## Components and states

Shared web and native packages provide buttons, panels, labeled fields, and segmented selection controls. Web also provides avatars, text areas, notices, and empty states. Reuse semantic labels and theme tokens while retaining native platform controls and navigation.

Keep one primary action per form. Secondary actions use quiet raised surfaces; low-priority actions use plain text or ghost buttons. Focus remains visible. Selected, disabled, loading, success, and error states must communicate through text and semantics as well as color. Hover transitions respect reduced-motion preferences.

## Representative screens

- Feed: imagery dominates; real videos and creator attribution come from Convex. The unconfigured style preview labels its artwork as a concept, without invented engagement or earnings.
- Create opens the creations library across all scripts and modes. The first tile starts a video. Ready is the default filter, followed by All and In progress. Failed jobs are hidden from the library but retained for recovery and accounting. Pagination keeps previous work accessible. Credit activity lives under Settings, accessible from the library and profile.
- The unified editor uses a visible Starting point card instead of Create/Remix tabs. Choosing a platform video activates Remix; removing the base returns to a new video without discarding the prompt. Uploaded videos cannot be remix bases. The editor prioritizes the prompt, image references, and output settings. Required Remix image references open automatically. Generation requires an explicit review of the credit cost.
- Video details show generation status or playback, prompt, settings, and credit state. Running videos show elapsed time and explain that generation may take longer than five minutes. No percentage or completion deadline is invented. Users can leave and return while processing continues.
- Generated videos stay private until explicitly published. Publication controls open separately from playback. Failed jobs can reopen saved settings for a new cost review; a status check never starts a new paid render.
- Public profiles show the creator’s avatar, display name, bio, real follow counts, Follow/Unfollow or Edit profile actions, and public published videos. Public queries return an explicit safe projection without credit, billing, email, private video, or asset storage data.
- Settings is a separate owner-only page with Account, Billing, Credit activity, and Security sections, accessed from the bottom sidebar account area. Billing accurately reports unavailable paid features. Profile image uploads become public only after owner verification.
- Script mentions show image/video thumbnails in a caret-adjacent picker. Linked mentions use orange highlighting; editing an attachment updates every occurrence of that alias. Autosave runs after changed content settles, and the quote expiry uses one timeout rather than an idle one-second timer.

The studio illustration is visual inspiration, not a generated result. Settings are provisional capability examples; final provider-supported choices must replace them when generation is integrated. The original and glossy concept images remain available in samples for historical comparison; the glossy treatment is not approved.

## Validation

Review mobile browser, desktop, and physical native devices separately. Browser checks cover routing, creation-mode interaction, image validation, disabled operations, and overflow. Native JavaScript bundle export validates compilation only; real-device keyboard, text scaling, playback, and session behavior still require testing.
