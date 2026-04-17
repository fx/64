# C64 Design System

## Overview

This specification defines the Commodore 64 visual design system that ALL user-interface code in this project MUST follow. It covers typography (the C64 Pro Mono font), the VIC-II Colodore color palette, PETSCII character rendering, pixel-perfect CSS rules, Tailwind CSS integration, and the shared React component library. The design system exists to ensure every screen looks and feels like authentic Commodore 64 software running on a period-accurate CRT display.

## Background

The Commodore 64 shipped in 1982 with the VIC-II video chip, an 8x8 pixel character grid, a fixed 16-color palette, and the PETSCII character set (an extension of ASCII with box-drawing and graphical glyphs). This project recreates that aesthetic in a modern web application.

Key prior art:

- **C64 Pro Mono** by Style64 (style64.org) -- a TrueType/WOFF2 font that faithfully reproduces the C64 character ROM, including PETSCII glyphs mapped into the Unicode Private Use Area.
- **Colodore palette** -- a carefully measured set of 16 VIC-II hex values that match real hardware output.
- **PETSCII** -- the Commodore character encoding, which includes box-drawing characters, block graphics, and card suits unavailable in ASCII.

The design system was introduced in the initial project scaffolding (spec 0001) and has been applied to every UI surface since.

## Requirements

### REQ-FONT: Typography

All rendered text MUST use the **C64 Pro Mono** font family. No fallback font SHALL be visually displayed while the web font loads.

| ID | Requirement | RFC 2119 |
|----|-------------|----------|
| REQ-FONT-1 | The `@font-face` declaration MUST load `C64_Pro_Mono-STYLE` in woff2, woff, and ttf formats, in that order. | MUST |
| REQ-FONT-2 | `font-display` MUST be set to `block` so that no fallback font renders while the C64 font loads. | MUST |
| REQ-FONT-3 | Font files in `public/fonts/` MUST NOT be renamed or modified. The Style64 license requires original filenames. | MUST NOT |
| REQ-FONT-4 | The base font size MUST be `16px`, which is a 2x scale of the original 8px character cell. | MUST |
| REQ-FONT-5 | `line-height` MUST be `1` and `letter-spacing` MUST be `0` to preserve the 8x8 pixel grid. | MUST |
| REQ-FONT-6 | `text-transform: uppercase` MUST be applied to the body element. The C64 default charset is uppercase-only. | MUST |
| REQ-FONT-7 | Anti-aliasing MUST be disabled: `-webkit-font-smoothing: none`, `font-smooth: never`. | MUST |

#### Scenarios

```
GIVEN any page in the application
WHEN the page finishes loading
THEN all text MUST render in C64 Pro Mono at 16px with no anti-aliasing

GIVEN a slow network connection
WHEN the C64 Pro Mono font has not yet loaded
THEN the browser MUST show invisible text (font-display: block), NOT a fallback font

GIVEN a developer adding a new UI component
WHEN they specify font styles
THEN they MUST use 'C64 Pro Mono', monospace as the font-family
```

### REQ-COLOR: VIC-II Color Palette

The application MUST use exactly the 16 VIC-II Colodore palette colors. No other colors SHALL appear anywhere in the UI.

| Index | Name | CSS Variable | Hex |
|-------|------|-------------|-----|
| 0 | Black | `--c64-0-black` | `#000000` |
| 1 | White | `--c64-1-white` | `#FFFFFF` |
| 2 | Red | `--c64-2-red` | `#96282E` |
| 3 | Cyan | `--c64-3-cyan` | `#5BD6CE` |
| 4 | Purple | `--c64-4-purple` | `#9F2DAD` |
| 5 | Green | `--c64-5-green` | `#41B936` |
| 6 | Blue | `--c64-6-blue` | `#2724C4` |
| 7 | Yellow | `--c64-7-yellow` | `#EFF347` |
| 8 | Orange | `--c64-8-orange` | `#9F4815` |
| 9 | Brown | `--c64-9-brown` | `#5E3500` |
| 10 | Light Red | `--c64-10-light-red` | `#DA5F66` |
| 11 | Dark Grey | `--c64-11-dark-grey` | `#474747` |
| 12 | Grey | `--c64-12-grey` | `#787878` |
| 13 | Light Green | `--c64-13-light-green` | `#91FF84` |
| 14 | Light Blue | `--c64-14-light-blue` | `#6864FF` |
| 15 | Light Grey | `--c64-15-light-grey` | `#AEAEAE` |

#### Semantic Aliases

| Alias | Maps To | Use |
|-------|---------|-----|
| `--c64-bg` | `--c64-6-blue` | Default background |
| `--c64-fg` | `--c64-14-light-blue` | Default foreground text |
| `--c64-border` | `--c64-14-light-blue` | Default border color |
| `--c64-accent` | `--c64-3-cyan` | Hover states, highlights |
| `--c64-danger` | `--c64-2-red` | Error states, destructive actions |
| `--c64-success` | `--c64-5-green` | Success states, online indicators |
| `--c64-warning` | `--c64-7-yellow` | Warning states |
| `--c64-muted` | `--c64-11-dark-grey` | Disabled or de-emphasized content |

| ID | Requirement | RFC 2119 |
|----|-------------|----------|
| REQ-COLOR-1 | All colors used in the UI MUST come from the 16 VIC-II palette variables defined in `c64-palette.css`. | MUST |
| REQ-COLOR-2 | CSS gradients MUST NOT be used anywhere. | MUST NOT |
| REQ-COLOR-3 | `opacity`, `alpha` channels, and `rgba()`/`hsla()` with alpha < 1 MUST NOT be used. | MUST NOT |
| REQ-COLOR-4 | `box-shadow` MUST NOT be used. | MUST NOT |
| REQ-COLOR-5 | Semantic aliases SHOULD be preferred over raw palette variables for foreground, background, and border colors. | SHOULD |

#### Scenarios

```
GIVEN a developer adding a new component
WHEN they choose colors
THEN they MUST only use --c64-{N}-{name} CSS variables or their semantic aliases

GIVEN any rendered page
WHEN inspected with dev tools
THEN no color value outside the 16-color Colodore palette SHALL be found

GIVEN a danger action (e.g., delete button)
WHEN rendered
THEN it MUST use --c64-danger (red #96282E) as its background or text color
```

### REQ-RENDER: Pixel-Perfect Rendering

| ID | Requirement | RFC 2119 |
|----|-------------|----------|
| REQ-RENDER-1 | The universal selector (`*`) MUST set `-webkit-font-smoothing: none`, `-moz-osx-font-smoothing: unset`, and `font-smooth: never`. | MUST |
| REQ-RENDER-2 | The universal selector MUST set `image-rendering: pixelated`. | MUST |
| REQ-RENDER-3 | `border-radius` MUST be `0` on all elements. Sharp rectangles only. | MUST |
| REQ-RENDER-4 | CSS `border` MUST NOT be used for panel/card outlines. Use PETSCII box-drawing characters instead. | MUST NOT |
| REQ-RENDER-5 | `box-shadow` MUST NOT be used. | MUST NOT |
| REQ-RENDER-6 | Transparency and `opacity` values other than 0 or 1 MUST NOT be used, except for the cursor-blink animation which alternates between `opacity: 1` and `opacity: 0`. | MUST NOT |

#### Scenarios

```
GIVEN any element on the page
WHEN it has rounded corners (border-radius > 0)
THEN it is non-conformant and MUST be fixed to border-radius: 0

GIVEN a panel or card component
WHEN it needs a visible border
THEN it MUST use PETSCII box-drawing characters, NOT CSS border property

GIVEN an image element
WHEN rendered
THEN it MUST use image-rendering: pixelated to preserve pixel art aesthetics
```

### REQ-PETSCII: PETSCII Character Support

The C64 Pro Mono font maps PETSCII glyphs into the Unicode Private Use Area (PUA). The application MUST use these mappings for box-drawing and graphical characters.

| ID | Requirement | RFC 2119 |
|----|-------------|----------|
| REQ-PETSCII-1 | Screen codes (0x00-0xFF) MUST be rendered via Unicode PUA range U+EE00-U+EEFF. | MUST |
| REQ-PETSCII-2 | PETSCII codes (0x00-0xFF) MUST be rendered via Unicode PUA range U+EF00-U+EFFF. | MUST |
| REQ-PETSCII-3 | Box-drawing borders MUST use the constants from `PETSCII_BOX` in `src/client/lib/petscii.ts`. | MUST |
| REQ-PETSCII-4 | In HTML templates, PETSCII characters MAY be referenced via `&#xEExx;` (screen code) or `&#xEFxx;` (PETSCII code) entities. | MAY |

#### Box-Drawing Character Map

| Constant | Glyph | Unicode | Screen Code |
|----------|-------|---------|-------------|
| `topLeft` | Corner top-left | `\u{EE70}` | `0x70` |
| `topRight` | Corner top-right | `\u{EE6E}` | `0x6E` |
| `bottomLeft` | Corner bottom-left | `\u{EE6D}` | `0x6D` |
| `bottomRight` | Corner bottom-right | `\u{EE7D}` | `0x7D` |
| `horizontal` | Horizontal bar | `\u{EE40}` | `0x40` |
| `vertical` | Vertical bar | `\u{EE5D}` | `0x5D` |

#### Scenarios

```
GIVEN a UI panel that needs a visible border
WHEN the developer renders the border
THEN they MUST use PETSCII_BOX constants from src/client/lib/petscii.ts

GIVEN a need to render PETSCII screen code 0x70
WHEN converted to a displayable character
THEN petsciiByScreenCode(0x70) MUST return the string "\u{EE70}"

GIVEN a need to render PETSCII code 0x41
WHEN converted to a displayable character
THEN petsciiByCode(0x41) MUST return the string "\u{EF41}"
```

### REQ-INTERACT: Interaction Patterns

| ID | Requirement | RFC 2119 |
|----|-------------|----------|
| REQ-INTERACT-1 | Buttons MUST use inverse video: swap foreground and background colors. Default is light-blue background with blue text. | MUST |
| REQ-INTERACT-2 | Button hover/focus state MUST change the background to the accent color (cyan). | MUST |
| REQ-INTERACT-3 | Focus indicators MUST use a blinking solid block cursor (`animate-c64-cursor`), NOT an outline ring. | MUST |
| REQ-INTERACT-4 | Loading indicators MUST use a PETSCII spinner (rotating block characters), NOT CSS animations or SVG spinners. | MUST |
| REQ-INTERACT-5 | Selected/active items MUST use reverse video (light-on-dark becomes dark-on-light). | MUST |
| REQ-INTERACT-6 | All UI labels MUST be uppercase. The body has `text-transform: uppercase` applied globally. | MUST |

#### Scenarios

```
GIVEN a button in its default state
WHEN rendered
THEN its background MUST be --c64-fg (light-blue) and its text MUST be --c64-bg (blue)

GIVEN a button
WHEN the user hovers over it
THEN the background MUST change to --c64-accent (cyan) and text MUST remain --c64-bg (blue)

GIVEN a list of items
WHEN one item is selected
THEN the selected item MUST use reverse video (swap its foreground and background)

GIVEN a long-running operation
WHEN a loading indicator is displayed
THEN it MUST be a PETSCII spinner, NOT a CSS animation or SVG

GIVEN a form control that receives focus
WHEN focused
THEN the control MUST switch to reverse video (bg becomes fg, fg becomes bg)
```

## Design

### Architecture

The design system is implemented as four CSS layers plus a TypeScript helper module and a React component library:

```
src/client/styles/
  c64-palette.css       # Layer 1: 16 color variables + semantic aliases
  c64-base.css          # Layer 2: @font-face, body defaults, rendering rules
  c64-components.css    # Layer 3: Reusable CSS classes (.c64-button, .c64-reverse, etc.)
  app.css               # Layer 4: Tailwind import + @utility definitions

src/client/lib/
  petscii.ts            # PETSCII helper functions and box-drawing constants

src/client/components/ui/
  c64-box.tsx           # PETSCII box-drawing container
  c64-button.tsx        # Inverse-video button
  c64-input.tsx         # Styled text input
  c64-select.tsx        # Styled dropdown select
  c64-status-badge.tsx  # Online/offline indicator
  c64-table.tsx         # Table with inverted header
  c64-breadcrumb.tsx    # Path navigation with segments
  c64-file-drop-zone.tsx # Drag-and-drop file picker
  c64-toast.tsx         # Toast notification display
  toast-context.tsx     # Toast state management (React Context)
```

CSS layers MUST be imported in order: palette, base, components, then app (which includes Tailwind).

### Data Models

#### Toast

```typescript
interface Toast {
  id: number;
  message: string;
  variant: "success" | "error";
}
```

Toasts auto-dismiss after 4000 ms. The `success` variant renders with green background and black text. The `error` variant renders with red background and white text.

#### PETSCII Box Constants

```typescript
const PETSCII_BOX = {
  topLeft:     "\u{EE70}",
  topRight:    "\u{EE6E}",
  bottomLeft:  "\u{EE6D}",
  bottomRight: "\u{EE7D}",
  horizontal:  "\u{EE40}",
  vertical:    "\u{EE5D}",
} as const;
```

### UI Components

#### C64Box

PETSCII box-drawing border container with an optional title.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string?` | `undefined` | Title rendered in the top border bar, auto-uppercased and truncated to fit. |
| `children` | `ReactNode` | required | Content rendered inside the box. |
| `width` | `number` | `40` | Total character width of the box (including border characters). |

The top border includes the title inline: `topLeft + horizontal + " TITLE " + horizontal... + topRight`. String children are padded to `width - 2` characters. Non-string children are wrapped in a flex layout with vertical-bar side borders.

#### C64Button

Inverse-video button with `default` and `danger` variants.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `"default" \| "danger"` | `"default"` | `default`: light-blue bg, blue text. `danger`: red bg, white text. |
| `type` | `string` | `"button"` | HTML button type attribute. |
| `className` | `string` | `""` | Additional CSS classes. |
| `children` | `ReactNode` | required | Button label. |

Also accepts all standard `ButtonHTMLAttributes`. Hover/focus on `default` changes background to cyan. Hover/focus on `danger` changes background to light-red.

#### C64Input

Text input styled to match the C64 aesthetic.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string?` | `undefined` | Optional label rendered above the input. |
| `className` | `string` | `""` | Additional CSS classes. |

Uses the `.c64-control` base class: blue background, light-blue text, transparent caret, no border, no border-radius. On focus, switches to reverse video. Auto-generates an `id` via `useId()` if none is provided.

#### C64Select

Dropdown select matching input styling.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `options` | `{ value: string; label: string }[]` | required | Option entries. |
| `label` | `string?` | `undefined` | Optional label rendered above the select. |

Uses `.c64-control` with `appearance-none` for native dropdown removal. Focus triggers reverse video.

#### C64StatusBadge

Online/offline status indicator.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `online` | `boolean` | required | `true` renders green block + "ON". `false` renders red block + "OFF". |

Uses the Unicode full block character `\u2588` as the status dot.

#### C64Table

Data table with inverted header row and PETSCII separator.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `columns` | `C64TableColumn<T>[]` | required | Column definitions with `header`, `accessor`, and optional `width`. |
| `data` | `T[]` | required | Row data array. |
| `keyFn` | `(row: T) => string` | required | Unique key extractor for each row. |
| `emptyMessage` | `string` | `"NO DATA"` | Message shown when `data` is empty. |
| `width` | `number` | `40` | Character width for the PETSCII horizontal separator. |

The header row uses reverse video (light-blue background, blue text). A PETSCII horizontal bar separates the header from data rows.

#### C64Breadcrumb

Path navigation displaying segments with `>` separators.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `path` | `string` | required | File path string (e.g., `"/USB0/Games/"`). |
| `onNavigate` | `(path: string) => void` | required | Callback invoked when a segment is clicked. |

Parses the path into segments. All segments except the last are clickable buttons. The last (current) segment is rendered in reverse video. All labels are uppercased.

#### C64FileDropZone

Drag-and-drop file picker with PETSCII border.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onFile` | `(file: File) => void` | required | Callback when a valid file is selected. |
| `accept` | `string[]` | `[".d64", ".d71", ".d81", ".g64", ".g71"]` | Allowed file extensions. |
| `disabled` | `boolean` | `undefined` | Disables interaction when true. |

Renders a PETSCII-bordered box with instructions ("DROP DISK IMAGE HERE / OR CLICK TO BROWSE"). On drag-over, switches to reverse video. Validates file extensions before invoking `onFile`. Also supports keyboard activation (Enter/Space).

#### C64Toast + ToastContext

Toast notification system with auto-dismiss.

| Prop / API | Type | Description |
|------------|------|-------------|
| `useToast()` | `{ toasts: Toast[]; addToast: (message, variant) => void }` | Hook to access toast state. |
| `ToastProvider` | React Context provider | Wraps the app to provide toast functionality. |
| `C64ToastContainer` | Component | Renders active toasts fixed to the bottom of the viewport. |

Toasts auto-dismiss after **4000 ms**. The `success` variant uses green background with black text. The `error` variant uses red background with white text.

### Business Logic

#### CSS Class Reference

| Class | Purpose |
|-------|---------|
| `.c64-button` | Inverse-video button: C64 Pro Mono 16px, fg background, bg text, no border/radius. Hover/focus switches to accent background. |
| `.c64-reverse` | Reverse video: swaps `--c64-fg` and `--c64-bg`. |
| `.c64-box-border` | PETSCII box-drawing container: C64 Pro Mono 16px, `line-height: 1`, `white-space: pre`. |
| `.c64-control` | Form control base: C64 Pro Mono 16px, blue bg, light-blue text, no border/radius/shadow, transparent caret. Focus triggers reverse video. |
| `.animate-c64-cursor` | Cursor blink animation: alternates `opacity: 1` / `opacity: 0` on a 1s step-end loop. |

#### Tailwind Utilities

48 custom `@utility` definitions in `app.css` provide Tailwind classes for all 16 palette colors across three properties:

| Pattern | Property | Example |
|---------|----------|---------|
| `bg-c64-{N}-{name}` | `background-color` | `bg-c64-6-blue` |
| `text-c64-{N}-{name}` | `color` | `text-c64-14-light-blue` |
| `border-c64-{N}-{name}` | `border-color` | `border-c64-2-red` |

All Tailwind `border-radius` utilities SHOULD be overridden to `0`. All `box-shadow` utilities SHOULD resolve to `none`.

#### PETSCII Helper Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `petsciiByScreenCode` | `(code: number) => string` | Converts a screen code (0x00-0xFF) to its Unicode PUA character at U+EE00 + code. |
| `petsciiByCode` | `(code: number) => string` | Converts a PETSCII code (0x00-0xFF) to its Unicode PUA character at U+EF00 + code. |

Both functions mask the input with `& 0xFF` to clamp to the valid byte range.

## Constraints

1. **Font license**: The C64 Pro Mono font files MUST NOT be renamed or modified. The Style64 license permits `@font-face` embedding only if files remain unmodified and the software is freely distributed. See `public/fonts/C64_Pro_Mono-STYLE-LICENSE.txt`.

2. **40-column layout**: UI layouts SHOULD target a 40-character width to match the C64's 40-column display mode. The `C64Box` defaults to `width=40`.

3. **No modern UI affordances**: The following CSS features MUST NOT be used, as they break the C64 aesthetic:
   - `border-radius` (any value > 0)
   - `box-shadow`
   - CSS gradients (`linear-gradient`, `radial-gradient`)
   - `opacity` values between 0 and 1 (exclusive), except in the cursor-blink keyframe
   - `rgba()` / `hsla()` with alpha < 1
   - CSS `transition` or `animation` other than the cursor-blink animation
   - Web fonts other than C64 Pro Mono

4. **PETSCII over CSS borders**: Panel and card outlines MUST be rendered with PETSCII box-drawing characters, not CSS `border`. The CSS `border` property MAY only be used as `border: none` to reset browser defaults on form controls and buttons.

5. **Browser support**: The design system relies on `font-display: block`, CSS custom properties, and `@font-face` with woff2. These are supported in all modern evergreen browsers. IE11 is explicitly not supported.

## Open Questions

1. **Dark mode**: The C64 has a single color scheme (blue background, light-blue text). Should alternate color schemes (e.g., green-on-black terminal mode) be supported as themes?

2. **Responsive scaling**: The current base font size is `16px` (2x). Should larger displays support `24px` (3x) or `32px` (4x) scaling for a more authentic CRT look?

3. **PETSCII graphic tiles**: Beyond box-drawing, should we provide a higher-level API for rendering PETSCII art (multi-character graphical blocks)?

4. **Accessibility**: `text-transform: uppercase` and the absence of anti-aliasing may reduce readability for some users. Should an accessibility escape hatch be provided?

## References

- [Style64 C64 Pro Mono](http://style64.org/c64-truetype) -- font source and license
- [Colodore Palette](https://www.colodore.com/) -- VIC-II color measurements
- [PETSCII Wikipedia](https://en.wikipedia.org/wiki/PETSCII) -- character encoding reference
- [C64 Wiki: Screen Codes](https://www.c64-wiki.com/wiki/Screen_code) -- screen code to character mapping
- Project spec 0001 (Project Scaffolding) -- initial design system introduction
- Related spec: [Architecture](../architecture/)

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-04-16 | Initial spec created | -- |
