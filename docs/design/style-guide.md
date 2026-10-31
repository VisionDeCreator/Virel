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
- Studio: prompt, creation mode, duration, and aspect ratio remain legible and operable. Generation stays disabled until provider and credit integrations exist. Image selection on web validates type and size and does not upload the file. Native upload behavior remains pending generation integration.
- Profile: shared field styles support existing authentication and profile mutations. Unconfigured previews show disabled fields rather than accepting credentials that cannot be submitted.

The studio illustration is visual inspiration, not a generated result. Settings are provisional capability examples; final provider-supported choices must replace them when generation is integrated. The original and glossy concept images remain available in samples for historical comparison; the glossy treatment is not approved.

## Validation

Review mobile browser, desktop, and physical native devices separately. Browser checks cover routing, creation-mode interaction, image validation, disabled operations, and overflow. Native JavaScript bundle export validates compilation only; real-device keyboard, text scaling, playback, and session behavior still require testing.
