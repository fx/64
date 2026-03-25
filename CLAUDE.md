# CLAUDE.md

## Project Overview

Hono + Vite 8 + React 19 SPA monolith. Single-process server serving API routes and the React frontend.

- **Dev:** `bun run dev` (Vite with Hono dev server, single port)
- **Build:** `bun run build` (client + server builds)
- **Production:** `bun dist/index.js` (serves API + SPA)

## Stack

- **Server:** Hono (API routes under `/api/*`)
- **Client:** React 19, TanStack Router (file-based), TanStack Query
- **Styling:** Tailwind CSS 4, Base UI
- **Build:** Vite 8, `@hono/vite-dev-server`, `@hono/vite-build/bun`
- **Runtime:** Bun

## Project Structure

```
src/server/          # Hono server entry + API routes
src/client/          # React SPA (main.tsx, router, routes, components)
src/client/routes/   # TanStack Router file-based routes
src/client/styles/   # C64 CSS (palette, base, components)
src/client/lib/      # API client (hc), query client, PETSCII helpers
src/shared/          # Shared types between server and client
public/fonts/        # C64 Pro Mono font files (DO NOT rename or modify)
```

## Design System — C64 Aesthetic (MANDATORY)

This project uses an authentic Commodore 64 visual design. ALL UI code MUST follow these rules:

### Font
- Use `C64 Pro Mono` everywhere. No other fonts. No fallback rendering — `font-display: block`.
- Font files are in `public/fonts/`. NEVER rename or modify them (license requirement).
- To render PETSCII graphics: use `&#xEExx;` (screen code) or `&#xEFxx;` (PETSCII code) HTML entities.

### Colors
- ONLY the 16 VIC-II colors from CSS variables `--c64-0-black` through `--c64-15-light-grey`.
- NO gradients. NO opacity/alpha. NO box-shadow. NO transparency.
- Default scheme: blue background (`--c64-6-blue`), light blue text (`--c64-14-light-blue`).

### Layout
- NO `border-radius` anywhere. Everything is sharp rectangles.
- NO CSS `border` for UI panels — use PETSCII box-drawing characters instead.
- Design for 40-column width. Keep text dense and compact.
- All text UPPERCASE for UI labels (the C64 default charset).

### Components
- Buttons: inverse video (swap fg/bg colors). No rounded corners, no shadows.
- Focus indicator: blinking solid block cursor, not outline.
- Loading: PETSCII spinner (rotating block characters), not CSS spinner.
- Panels/cards: bordered with PETSCII box-drawing characters.
- Selected/active items: reverse video (light-on-dark becomes dark-on-light).

### CSS
- `font-smooth: never` / `-webkit-font-smoothing: none` — pixel-perfect, no antialiasing.
- `image-rendering: pixelated` on everything.
- `line-height: 1` and `letter-spacing: 0` — the 8x8 grid must be preserved.
- Font size: `16px` base (2x scale of 8px character cell).

### Tailwind
- Override border-radius to 0, replace shadows with none, use C64 color variables only.
- Tailwind utilities available: `text-c64-*`, `bg-c64-*`, `border-c64-*` for each of the 16 colors.

## Hono RPC

Use `hc` client from `src/client/lib/api.ts` for type-safe API calls. Types are inferred from the Hono route definitions — no manual type duplication needed.

## Conventions

- Use Bun for all commands (`bun run`, `bun install`, `bun test`)
- TypeScript strict mode with `jsxImportSource: "react"`
- Path aliases: `@/*` → `./src/*`, `@server/*`, `@client/*`, `@shared/*`

**Task Completion:** Every PR must mark completed task(s) as done (`- [x]`) in the relevant tracking file (`docs/PROJECT.md` or the spec file in `docs/specs/`). Include the task-list update in the PR.
