# 0001 — Project Scaffolding

## Overview

Set up the Hono + Vite + React SPA monolith from scratch. This is the foundation that every other spec builds on: a single-process server that serves both API routes and the React frontend, with full HMR in development and a single `bun dist/index.js` in production.

## Goals

- Working Hono server with Vite 8 dev integration (`@hono/vite-dev-server`)
- React 19 SPA with TanStack Router (client-side, file-based routing)
- shadcn/ui v4 initialized with Base UI base and Tailwind CSS 4
- TanStack Query provider wired up
- Hono RPC (`hc`) client configured for type-safe API calls
- Production build via `@hono/vite-build/bun` producing a single Bun entry
- Dev and prod parity: same port, same routing, same behavior
- **Authentic C64 visual design system** — real C64 font, VIC-II color palette, blocky/sprite aesthetic
- `CLAUDE.md` with design system rules so all future code follows the C64 aesthetic

## Non-Goals

- No actual API routes beyond a health-check endpoint
- No device communication — that's spec 0003
- No authentication
- No database or persistence

## Technical Design

### Project Structure

```
/
├── src/
│   ├── server/
│   │   ├── index.ts              # Hono app entry (API routes + static serving)
│   │   └── routes/
│   │       └── health.ts         # GET /api/health
│   ├── client/
│   │   ├── main.tsx              # React entry point
│   │   ├── router.tsx            # TanStack Router config
│   │   ├── routes/
│   │   │   └── __root.tsx        # Root layout
│   │   │   └── index.tsx         # Home page
│   │   ├── components/
│   │   │   └── ui/               # shadcn/ui components
│   │   └── lib/
│   │       ├── api.ts            # Hono RPC client (`hc`)
│   │       └── query.ts          # TanStack Query client
│   └── shared/
│       └── types.ts              # Shared types between server and client
├── vite.config.ts                # Vite 8 config with Hono dev server plugin
├── tailwind.config.ts            # Tailwind CSS 4 config
├── tsconfig.json
├── package.json
└── index.html                    # SPA entry HTML
```

### Vite Configuration

Two build modes:
- **Default:** Builds the Hono server entry via `@hono/vite-build/bun`
- **Client:** Builds the React SPA into `dist/static/`

`@hono/vite-dev-server` replaces Vite's dev server with the Hono app. Static asset patterns (`.tsx`, `.css`, `/@vite/*`, `/node_modules/*`) are excluded so Vite serves them with HMR.

### Hono Server

The Hono app:
1. Serves API routes under `/api/*`
2. In production, serves static files from `dist/static/` via `serveStatic` from `hono/bun`
3. Falls back to `index.html` for all non-API, non-static routes (SPA routing)

### React Client

- `jsxImportSource: "react"` in tsconfig (not `hono/jsx`)
- TanStack Router with file-based route generation via `@tanstack/router-vite-plugin`
- TanStack Query provider at root
- shadcn/ui initialized with `base` foundation, one of the Base UI styles (lyra/nova/maia)

### Build & Run

```bash
# Development
bun run dev          # → vite (single command, single port)

# Production build
bun run build        # → vite build --mode client && vite build

# Production run
bun dist/index.js    # → serves API + SPA on single port
```

### C64 Design System

The UI must look and feel like a Commodore 64 — blocky, pixel-perfect text, the VIC-II color palette, and the iconic blue-on-blue startup screen aesthetic. This isn't a retro "theme" — it's a real C64 font with PETSCII graphics, the exact measured color palette, and CSS that enforces the 8x8 pixel grid.

#### Font: C64 Pro Mono (Style64)

**This is a real C64 font** — pixel-perfect reproduction of the MOS 6581 character ROM, packaged as TrueType/WOFF2 by Style64.

- **Source:** http://style64.org/c64-truetype (v1.2.1, April 2019)
- **Download:** https://style64.org/file/C64_TrueType_v1.2.1-STYLE.zip
- **Files needed:** `C64ProMono.woff2`, `C64ProMono.woff`, `C64ProMono.ttf`
- **License:** Free for `@font-face` embedding. Do NOT rename, modify, or offer for direct download. See full license below.
- **Glyphs:** 304 unique C64 characters including all PETSCII graphics
- **PETSCII PUA mapping:**
  - `U+E000-E0FF` — Uppercase/Graphics charset (PETSCII mapping)
  - `U+E100-E1FF` — Lowercase/Uppercase charset (PETSCII mapping)
  - `U+E200-E2FF` — Reversed Uppercase/Graphics
  - `U+E300-E3FF` — Reversed Lowercase/Uppercase
  - `U+EE00-EEFF` — Character ROM index (screen codes) — use `&#xEExx;` to render by screen code
  - `U+EF00-EFFF` — PETSCII code index — use `&#xEFxx;` to render by PETSCII code

**License (verbatim):**
```
Fonts in this package are (c) 2010-2019 Style.

You MAY NOT: sell this font; include/redistribute the font in any font
collection regardless of pricing; provide the font for direct download
from any web site, modify or rename the font.

You MAY: link to "http://style64.org/c64-truetype" in order for others
to download and install the font; embed the font (without any
modification or file renaming) for display on any web site using
@font-face rules; use this font in static images and vector art;
include this font (without any modification or file renaming) as part
of a software package but ONLY if said software package is freely
provided to end users.
```

**Font setup:**
```css
@font-face {
  font-family: 'C64 Pro Mono';
  src: url('/fonts/C64ProMono.woff2') format('woff2'),
       url('/fonts/C64ProMono.woff') format('woff'),
       url('/fonts/C64ProMono.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: block; /* Block FOUT — the font IS the design */
}
```

Place font files in `public/fonts/` (served as static assets). Include the license file as `public/fonts/C64ProMono-LICENSE.txt`.

#### Color Palette: Colodore (Pepto)

The **Colodore** palette by Philip "Pepto" Timmermann is the most accurate measured reproduction of the VIC-II chip output. It is the default in VICE emulator v3+.

```css
:root {
  /* C64 VIC-II Colodore Palette — 16 colors */
  --c64-0-black:        #000000;
  --c64-1-white:        #FFFFFF;
  --c64-2-red:          #96282E;
  --c64-3-cyan:         #5BD6CE;
  --c64-4-purple:       #9F2DAD;
  --c64-5-green:        #41B936;
  --c64-6-blue:         #2724C4;
  --c64-7-yellow:       #EFF347;
  --c64-8-orange:       #9F4815;
  --c64-9-brown:        #5E3500;
  --c64-10-light-red:   #DA5F66;
  --c64-11-dark-grey:   #474747;
  --c64-12-grey:        #787878;
  --c64-13-light-green: #91FF84;
  --c64-14-light-blue:  #6864FF;
  --c64-15-light-grey:  #AEAEAE;

  /* Semantic aliases */
  --c64-bg:             var(--c64-6-blue);        /* Default background */
  --c64-fg:             var(--c64-14-light-blue);  /* Default text */
  --c64-border:         var(--c64-14-light-blue);  /* Default border */
  --c64-accent:         var(--c64-3-cyan);
  --c64-danger:         var(--c64-2-red);
  --c64-success:        var(--c64-5-green);
  --c64-warning:        var(--c64-7-yellow);
  --c64-muted:          var(--c64-11-dark-grey);
}
```

**Only use these 16 colors.** No gradients. No opacity/alpha blending. No shadows. The C64 has no transparency — every pixel is one of these 16 colors.

#### Screen Properties Reference

| Property | Value |
| --- | --- |
| Text mode | 40 columns x 25 rows |
| Character cell | 8x8 pixels |
| Visible area | 320x200 (content) + 32px border each side = 384x272 |
| Aspect ratio | 4:3 (PAL, non-square pixels) |
| Default border | Light Blue (14) `#6864FF` |
| Default background | Blue (6) `#2724C4` |
| Default text | Light Blue (14) `#6864FF` |

#### CSS Design Rules

```css
/* Pixel-perfect rendering — CRITICAL */
* {
  -webkit-font-smoothing: none;      /* No antialiasing */
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  image-rendering: pixelated;
}

/* Base text style */
body {
  font-family: 'C64 Pro Mono', monospace;
  font-size: 16px;        /* 2x scale of 8px character */
  line-height: 1;         /* No extra line spacing — 8px cells */
  letter-spacing: 0;      /* No extra letter spacing */
  background: var(--c64-bg);
  color: var(--c64-fg);
}
```

#### UI Design Principles

1. **Everything is text.** The C64 renders everything as 8x8 character cells. UI elements (borders, buttons, panels) should be built from PETSCII box-drawing characters and block graphics, not CSS borders or rounded corners.

2. **No border-radius.** Everything is rectangular, pixel-aligned. No rounded corners anywhere.

3. **No shadows, no gradients, no opacity.** Every pixel is one of 16 solid colors.

4. **Borders are characters.** Use PETSCII box-drawing characters (┌─┐│└─┘ or the C64 equivalents from the PUA) for panel borders, not CSS `border`.

5. **Buttons are inverse text.** The C64 highlights selected items with reverse video (swap foreground/background). Buttons and active states use `background: var(--c64-fg); color: var(--c64-bg)`.

6. **Cursor blink.** The C64 cursor is a blinking solid block. Use this for focus indicators.

7. **Uppercase default.** The C64 boots in uppercase+graphics mode. UI labels should be UPPERCASE. Use lowercase only for user-entered content.

8. **Status bar.** The bottom row of the C64 screen is often used for status. Reserve a bottom bar for status/now-playing info.

9. **40-column mindset.** Design for narrow, dense layouts. Content should work in roughly 40-character widths. Panels stack vertically or use a simple 2-column split.

10. **Loading states are PETSCII.** Use the C64 "cursor blink" or a PETSCII spinner (rotating block characters) for loading indicators. No CSS spinners.

#### CLAUDE.md Design System Rules

The following must be included in the project's `CLAUDE.md` so that all future development follows the C64 aesthetic:

```markdown
## Design System — C64 Aesthetic (MANDATORY)

This project uses an authentic Commodore 64 visual design. ALL UI code MUST follow these rules:

### Font
- Use `C64 Pro Mono` everywhere. No other fonts. No fallback rendering — `font-display: block`.
- Font files are in `public/fonts/`. NEVER rename or modify them (license requirement).
- To render PETSCII graphics: use `&#xEExx;` (screen code) or `&#xE0xx;` (charset 1) HTML entities.

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
- Loading: PETSCII spinner (rotating block characters ◜◝◞◟ or ▖▗▝▘), not CSS spinner.
- Panels/cards: bordered with PETSCII box-drawing characters.
- Selected/active items: reverse video (light-on-dark becomes dark-on-light).

### CSS
- `font-smooth: never` / `-webkit-font-smoothing: none` — pixel-perfect, no antialiasing.
- `image-rendering: pixelated` on everything.
- `line-height: 1` and `letter-spacing: 0` — the 8x8 grid must be preserved.
- Font size: `16px` base (2x scale of 8px character cell).

### Tailwind
- shadcn/ui components should be restyled to match. Override border-radius to 0, replace shadows with none, use C64 color variables only.
- Create Tailwind utilities: `text-c64-*` for each of the 16 colors, `bg-c64-*`, `border-c64-*`.
```

#### Project Structure Additions

```
public/
├── fonts/
│   ├── C64ProMono.woff2
│   ├── C64ProMono.woff
│   ├── C64ProMono.ttf
│   └── C64ProMono-LICENSE.txt
src/
├── client/
│   ├── styles/
│   │   ├── c64-palette.css          # CSS custom properties for all 16 colors
│   │   ├── c64-base.css             # Font-face, pixel-perfect rendering, base styles
│   │   └── c64-components.css       # PETSCII borders, inverse buttons, cursor blink
│   ├── lib/
│   │   └── petscii.ts               # Helper: render PETSCII chars by screen code
│   └── components/
│       └── ui/
│           └── c64-box.tsx           # Panel with PETSCII box-drawing border
```

## Dependencies

```json
{
  "dependencies": {
    "hono": "^4.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@base-ui/react": "^1.0.0",
    "@tanstack/react-router": "^1.0.0",
    "@tanstack/react-query": "^5.0.0",
    "tailwindcss": "^4.0.0"
  },
  "devDependencies": {
    "@hono/vite-dev-server": "^0.25.0",
    "@hono/vite-build": "^1.10.0",
    "@tanstack/router-vite-plugin": "^1.0.0",
    "vite": "^8.0.0",
    "typescript": "^5.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

## Acceptance Criteria

- [ ] `bun run dev` starts Vite with Hono, React SPA loads with HMR
- [ ] `GET /api/health` returns `{ "status": "ok" }` from Hono
- [ ] TanStack Router handles client-side navigation (at least root + one route)
- [ ] shadcn/ui Button component renders with Base UI + Tailwind styling
- [ ] `bun run build && bun dist/index.js` serves the production app
- [ ] Hono RPC client can call `/api/health` with full type inference in React
- [ ] C64 Pro Mono font loads and renders pixel-perfect (no antialiasing)
- [ ] All 16 VIC-II colors available as CSS variables and Tailwind utilities
- [ ] Home page renders with blue background, light blue text, PETSCII border
- [ ] `CLAUDE.md` exists with design system rules enforcing C64 aesthetic

## Tasks

- [ ] Initialize project with Bun, install core dependencies, and configure TypeScript
  - [ ] `bun init`, add `hono`, `react`, `react-dom`, `@base-ui/react`, `@tanstack/react-router`, `@tanstack/react-query`, `tailwindcss`
  - [ ] Add dev dependencies: `vite`, `@hono/vite-dev-server`, `@hono/vite-build`, `@tanstack/router-vite-plugin`, `typescript`, `@types/react`, `@types/react-dom`
  - [ ] Configure `tsconfig.json` with `jsxImportSource: "react"`, path aliases, strict mode
- [ ] Set up Vite 8 config with Hono dev server and build plugins
  - [ ] Create `vite.config.ts` with `@hono/vite-dev-server` pointing to `src/server/index.ts`
  - [ ] Configure `@hono/vite-build/bun` for production server build
  - [ ] Configure client build mode outputting to `dist/static/`
  - [ ] Add `@tanstack/router-vite-plugin` for file-based route generation
  - [ ] Add build scripts to `package.json`: `dev`, `build`, `start`
- [ ] Create Hono server entry with health endpoint and SPA fallback
  - [ ] Create `src/server/index.ts` with Hono app
  - [ ] Add `GET /api/health` route returning `{ "status": "ok" }`
  - [ ] Configure `serveStatic` from `hono/bun` for production static files
  - [ ] Add SPA fallback: serve `index.html` for all non-API, non-static routes
- [ ] Set up React SPA with TanStack Router and Query
  - [ ] Create `index.html` SPA entry
  - [ ] Create `src/client/main.tsx` React entry point with router and query providers
  - [ ] Create `src/client/router.tsx` TanStack Router configuration
  - [ ] Create `src/client/routes/__root.tsx` root layout
  - [ ] Create `src/client/routes/index.tsx` home page
  - [ ] Create `src/client/lib/query.ts` TanStack Query client setup
- [ ] Initialize shadcn/ui v4 with Base UI base and Tailwind CSS 4
  - [ ] Configure Tailwind CSS 4 (`tailwind.config.ts` or CSS config)
  - [ ] Run `shadcn init` with Base UI base and chosen style (lyra/nova/maia)
  - [ ] Override shadcn defaults: `border-radius: 0`, no shadows, C64 colors only
  - [ ] Add a Button component to verify shadcn + Base UI + Tailwind works
- [ ] Set up C64 design system: font, palette, and base styles
  - [ ] Download C64 Pro Mono font files from style64.org and place in `public/fonts/`
  - [ ] Include `C64ProMono-LICENSE.txt` alongside font files
  - [ ] Create `src/client/styles/c64-palette.css` with all 16 VIC-II color CSS variables (Colodore palette)
  - [ ] Create `src/client/styles/c64-base.css` with `@font-face`, pixel-perfect rendering rules, base body styles
  - [ ] Create `src/client/styles/c64-components.css` with inverse-video buttons, PETSCII box borders, cursor blink animation
  - [ ] Add Tailwind utilities: `text-c64-*`, `bg-c64-*`, `border-c64-*` for all 16 colors
  - [ ] Create `src/client/lib/petscii.ts` helper for rendering PETSCII characters by screen code
  - [ ] Create `src/client/components/ui/c64-box.tsx` — panel component with PETSCII box-drawing border
  - [ ] Verify: home page renders with blue bg, light blue text, PETSCII-bordered panel, no antialiasing
- [ ] Create CLAUDE.md with design system rules
  - [ ] Write project `CLAUDE.md` with mandatory C64 aesthetic rules (font, colors, layout, components, CSS)
  - [ ] Include task completion language for PR tracking
- [ ] Set up Hono RPC client for type-safe API calls
  - [ ] Create `src/client/lib/api.ts` with `hc` client typed against the Hono app
  - [ ] Create `src/shared/types.ts` for shared type definitions
  - [ ] Verify type inference works: calling `/api/health` from React with full types
- [ ] Verify production build and runtime
  - [ ] `bun run build` produces `dist/index.js` and `dist/static/*`
  - [ ] `bun dist/index.js` serves both API and SPA on a single port
  - [ ] Client-side routing works (navigate to a route, refresh, SPA loads)
