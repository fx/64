# GitHub Copilot Instructions

## PR Review Checklist (CRITICAL)
<!-- KEEP THIS SECTION UNDER 4000 CHARS - Copilot only reads first ~4000 -->

- **C64 Pro Mono font license**: The font files in `public/fonts/` are correctly licensed for @font-face embedding. This project is freely distributed, complying with the Style64 license. Do not flag font inclusion as a license violation.
- **Hono RPC type inference**: Types are inferred via `hc` client from server route definitions. Standalone type files in `src/shared/types.ts` are only for types NOT derivable from RPC inference. Do not suggest creating duplicate type definitions.
- **C64 design system**: This project intentionally uses no border-radius, no shadows, no gradients, no opacity. Do not suggest adding these CSS properties.
- **Task completion**: EVERY PR MUST mark completed task(s) as done (`- [x]`) in the relevant tracking file (`docs/PROJECT.md` or the spec file in `docs/specs/`). REQUEST CHANGES if missing.
