# Commodore 64 Fonts, PETSCII Mapping, Color Palette & Screen Properties

Comprehensive research for building an authentic C64-looking web UI.

---

## 1. C64 Pro Mono Font (Style64)

### Source
- **Official site**: http://style64.org/c64-truetype
- **Latest version**: v1.2.1 (released April 15, 2019)
- **Download**: https://style64.org/file/C64_TrueType_v1.2.1-STYLE.zip (116.73 KB)

### Font Files in EdyJ/c64u-control-panel

The repository `github.com/EdyJ/c64u-control-panel` at `html/fonts/` contains:

| File | Purpose |
|------|---------|
| `C64ProMono.ttf` | TrueType format |
| `C64ProMono.woff` | WOFF format (web) |
| `C64ProMono.woff2` | WOFF2 format (web, best compression) |
| `C64ProMono-LICENSE.txt` | License file |

### Available Formats (from official package)

The official Style64 package provides fonts in **five formats**:
- `.ttf` (TrueType)
- `.otf` (OpenType with CFF outlines -- added in v1.2.1)
- `.woff` (Web Open Font Format)
- `.woff2` (WOFF2, ~30% smaller than WOFF)
- `.eot` (Embedded OpenType, legacy IE support)

Note: SVG format was **discontinued** in v1.2.1.

### Typefaces Included

The official package includes **two** typefaces:
1. **C64 Pro** -- variable width (proportional) outlines
2. **C64 Pro Mono** -- monospaced outlines (the one you want for authentic look)

Both contain all **304 unique C64 glyphs**.

An additional "C64 Elite Mono" variant exists with expanded character set mappings.

### License (VERBATIM)

```
Fonts in this package are (c) 2010-2019 Style.

This license is applicable to each font file included in this package
in all their variants (ttf, otf, eot, woff, woff2, svg).

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

You may also contact us to negotiate a (possibly commercial) license
for your use outside of these guidelines at
"http://style64.org/contact-style".

At all times the most recent version of this license can be found at
"http://style64.org/c64-truetype/license".
```

**Key takeaways for web use:**
- Embedding via `@font-face` is ALLOWED (woff/woff2)
- Do NOT rename the font files
- Do NOT host the font for direct download -- embed only
- Do NOT modify the font
- Free software packaging is OK; commercial software requires contacting Style64

### CSS Usage Example

```css
@font-face {
  font-family: 'C64 Pro Mono';
  src: url('fonts/C64ProMono.woff2') format('woff2'),
       url('fonts/C64ProMono.woff') format('woff'),
       url('fonts/C64ProMono.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
}

body {
  font-family: 'C64 Pro Mono', monospace;
}
```

---

## 2. Alternative C64 Fonts

### Pet Me Font Family (Kreative Korporation)

- **Author**: Rebecca Bettencourt / Kreative Korporation
- **Official page**: https://www.kreativekorp.com/software/fonts/c64/
- **Format**: TrueType (.ttf)
- **License**: Free for personal use
- **Character count**: Pet Me 64 has 2,125 characters; Pet Me has 2,893 characters

**Font variants:**

| Font Name | System Emulated |
|-----------|-----------------|
| Pet Me | Commodore PET |
| Pet Me 2X | VIC-20 |
| Pet Me 2Y | CBM-II |
| Pet Me 64 | Commodore 64 (40-column) |
| Pet Me 64 2Y | Commodore 64 (80-column) |
| Pet Me 128 | Commodore 128 (40-column) |
| Pet Me 128 2Y | Commodore 128 (80-column) |

**Character set coverage:**
- ISO-Latin-1, Windows ANSI, MacRoman
- Box drawing characters
- Unicode 13.0 "Symbols for Legacy Computing" block (added Oct 2019)

**PUA Mappings in Pet Me 64:**
- `U+E000-U+E1FF` -- Complete Commodore 64 character set
- `U+E200-U+E3FF` -- Commodore 128 English
- `U+E400-U+E5FF` -- Swedish variant

### Commodore 64 Pixelized (Devin Cook)

- **Author**: Devin Cook
- **Source**: https://www.dafont.com/commodore-64-pixelized.font
- **Format**: TTF only
- **License**: 100% Free (Public domain / GPL / OFL)
- **Glyphs**: 204
- **Notes**: Lightweight, basic ASCII coverage. No PETSCII graphics characters. Good for simple text-only use.

### Homecomputer Fonts / "Sixtyfour" (Jens Kutilek)

- **Repository**: https://github.com/jenskutilek/homecomputer-fonts
- **License**: SIL Open Font License 1.1 (fully open, commercial use OK)
- **Stars**: 185 / Latest: v2.2 (Nov 2025)
- **Font name**: "Sixtyfour"

**Key features:**
- **Variable font** with adjustable axes:
  - Horizontal scanline size
  - Pixel horizontal bleed (CRT phosphor latency effect)
- Built using Google Fonts project template
- Available via GitHub Actions builds
- Demo: https://jenskutilek.github.io/homecomputer-fonts/documentation/demo-sixtyfour.html

### c64-fonts (patrickmollohan)

- **Repository**: https://github.com/patrickmollohan/c64-fonts
- **Format**: Raw binary `.bin` files (C64 character ROM format, NOT TrueType)
- **Contents**: Original MOS 901225-01 ROM dump plus custom fonts
- **Use case**: Emulators and hardware projects, not web fonts

### npm Packages

No dedicated C64 *font* npm package exists. Related packages:

| Package | Description |
|---------|-------------|
| `petscii` (v1.0.0) | Translate between PETSCII and ASCII encodings |
| `img2petscii` (v0.0.8) | Convert images to C64 PETSCII art |
| `quintos` (v6.1.3) | Retro game engine with C64-style capabilities |

### Comparison Matrix

| Font | License | Web Formats | PETSCII Graphics | PUA Mapping | Best For |
|------|---------|-------------|-------------------|-------------|----------|
| **C64 Pro Mono** | Custom (free embed) | woff2, woff, eot, ttf, otf | Yes (304 glyphs) | U+EExx (ROM), U+E0xx-E3xx | Most authentic web UI |
| **Pet Me 64** | Free personal | ttf only | Yes (2125 chars) | U+E000-E1FF | Offline/desktop use |
| **Sixtyfour** | SIL OFL 1.1 | Variable font | Limited | No | Modern/stylized C64 look |
| **C64 Pixelized** | Public domain | ttf only | No | No | Simple text only |

**Recommendation**: C64 Pro Mono is the best choice for web projects. It has native woff2 support, comprehensive PETSCII coverage, proper PUA mappings, and explicit permission for `@font-face` embedding.

---

## 3. PETSCII and Unicode PUA Mapping

### C64 Character Set Organization

The C64 has **two** character sets stored in its character ROM (MOS 901225-01), each containing 256 characters (128 normal + 128 reversed):

1. **Set 1: Uppercase + Graphics** (default at power-on)
   - Characters 0-127: uppercase letters A-Z, numbers, punctuation, PETSCII graphic symbols
   - Characters 128-255: reversed (inverse video) versions of 0-127

2. **Set 2: Upper/Lowercase**
   - Characters 0-127: lowercase a-z, uppercase A-Z, some graphics
   - Characters 128-255: reversed versions of 0-127

The character set is toggled by pressing **Commodore key + Shift** (or PRINT CHR$(14) for lowercase, PRINT CHR$(142) for uppercase).

Total unique glyphs across both sets: **304** (some characters are shared).

### PETSCII vs Screen Codes

There are TWO different numbering systems:

- **PETSCII codes**: The byte values used by PRINT statements and keyboard input (similar to ASCII but different). Range 0-255.
- **Screen codes** (aka "poke codes"): The byte values stored in screen memory ($0400-$07E7). Range 0-255. These directly index the character ROM.

They are NOT the same mapping. For example:
- PETSCII 65 ($41) = 'A', but Screen code 1 also = 'A'
- PETSCII 1 = a control code, not a visible character

### Unicode PUA Mapping in C64 Pro Mono

C64 Pro Mono maps the four character banks to Unicode Private Use Area as follows:

| PUA Range | Character Set | Description |
|-----------|--------------|-------------|
| `U+E000-U+E0FF` | Uppercase/Graphics | Direct PETSCII mapping (256 codes) |
| `U+E100-U+E1FF` | Lowercase/Uppercase | Direct PETSCII mapping (256 codes) |
| `U+E200-U+E2FF` | Reversed Uppercase/Graphics | Inverse video variants |
| `U+E300-U+E3FF` | Reversed Lowercase/Uppercase | Inverse video variants |
| `U+EE00-U+EEFF` | Character ROM index | Maps by screen code (ROM order) |
| `U+EF00-U+EFFF` | PETSCII index | Maps by PETSCII code value |

### How to Render PETSCII Screen Code as HTML

To display a specific screen code character in HTML using C64 Pro Mono:

**Method 1: Using PUA codepoints (screen code / CharROM index)**
```html
<!-- Screen code 0x42 (66 decimal) = the checker/chess pattern graphic -->
<span style="font-family: 'C64 Pro Mono'">&#xEE42;</span>
```

The `U+EExx` range maps directly to Character ROM indices (screen codes).
Replace `xx` with the two-digit hex screen code.

**Method 2: Using PETSCII code PUA mapping**
```html
<!-- PETSCII code 0xC1 (193 decimal) = 'A' in uppercase mode -->
<span style="font-family: 'C64 Pro Mono'">&#xEFC1;</span>
```

The `U+EFxx` range maps to PETSCII code values.

**Method 3: Using standard Unicode mappings**

C64 Pro Mono also maps many PETSCII characters to their closest standard Unicode equivalents:
- Regular ASCII characters (A-Z, 0-9, punctuation) work normally
- Many PETSCII graphic characters map to Unicode box-drawing and block elements
- The Unicode 13.0 "Symbols for Legacy Computing" block (U+1FB00-U+1FBFF) provides official mappings for many PETSCII graphics

**Method 4: Full screen rendering**
```html
<pre style="font-family: 'C64 Pro Mono'; line-height: 1; letter-spacing: 0;">
<!-- Each character maps to a screen position -->
<!-- Use &#xEExx; entities for screen codes -->
</pre>
```

### Key PETSCII-to-Screen-Code Conversion

```
Screen Code = PETSCII XOR mapping:
  PETSCII $00-$1F (control) -> not directly displayable
  PETSCII $20-$3F -> Screen code $20-$3F (same)
  PETSCII $40-$5F -> Screen code $00-$1F
  PETSCII $60-$7F -> Screen code $20-$3F (overlaps)
  PETSCII $80-$9F (control) -> not directly displayable
  PETSCII $A0-$BF -> Screen code $60-$7F
  PETSCII $C0-$DF -> Screen code $40-$5F
  PETSCII $E0-$FE -> Screen code $60-$7E
  PETSCII $FF     -> Screen code $5E
```

For reversed (inverse) characters, add 128 ($80) to the screen code.

---

## 4. C64 Color Palette (EXACT)

### The 16 VIC-II Colors

The C64's VIC-II chip (MOS 6567/6569) produces exactly 16 colors. Multiple palette interpretations exist because the VIC-II outputs analog luma+chroma signals, and the exact RGB rendering depends on the display and decoder.

### Colodore Palette (RECOMMENDED -- most accurate, by Pepto)

The **Colodore** palette by Philip "Pepto" Timmermann is the most widely accepted accurate palette, based on measuring the actual VIC-II chip output. It is the default palette in VICE emulator since version 3.x. This is from the VICE `colodore.vpl` file:

| Index | Color Name | Hex | R | G | B |
|-------|-----------|-----|---|---|---|
| 0 | Black | `#000000` | 0 | 0 | 0 |
| 1 | White | `#FFFFFF` | 255 | 255 | 255 |
| 2 | Red | `#96282E` | 150 | 40 | 46 |
| 3 | Cyan | `#5BD6CE` | 91 | 214 | 206 |
| 4 | Purple | `#9F2DAD` | 159 | 45 | 173 |
| 5 | Green | `#41B936` | 65 | 185 | 54 |
| 6 | Blue | `#2724C4` | 39 | 36 | 196 |
| 7 | Yellow | `#EFF347` | 239 | 243 | 71 |
| 8 | Orange | `#9F4815` | 159 | 72 | 21 |
| 9 | Brown | `#5E3500` | 94 | 53 | 0 |
| 10 | Light Red | `#DA5F66` | 218 | 95 | 102 |
| 11 | Dark Grey | `#474747` | 71 | 71 | 71 |
| 12 | Grey | `#787878` | 120 | 120 | 120 |
| 13 | Light Green | `#91FF84` | 145 | 255 | 132 |
| 14 | Light Blue | `#6864FF` | 104 | 100 | 255 |
| 15 | Light Grey | `#AEAEAE` | 174 | 174 | 174 |

### Pepto PAL Palette (older, still common)

From the VICE `pepto-pal.vpl` file (the original Pepto palette, slightly different from Colodore):

| Index | Color Name | Hex | R | G | B |
|-------|-----------|-----|---|---|---|
| 0 | Black | `#000000` | 0 | 0 | 0 |
| 1 | White | `#FFFFFF` | 255 | 255 | 255 |
| 2 | Red | `#68372B` | 104 | 55 | 43 |
| 3 | Cyan | `#70A4B2` | 112 | 164 | 178 |
| 4 | Purple | `#6F3D86` | 111 | 61 | 134 |
| 5 | Green | `#588D43` | 88 | 141 | 67 |
| 6 | Blue | `#352879` | 53 | 40 | 121 |
| 7 | Yellow | `#B8C76F` | 184 | 199 | 111 |
| 8 | Orange | `#6F4F25` | 111 | 79 | 37 |
| 9 | Brown | `#433900` | 67 | 57 | 0 |
| 10 | Light Red | `#9A6759` | 154 | 103 | 89 |
| 11 | Dark Grey | `#444444` | 68 | 68 | 68 |
| 12 | Grey | `#6C6C6C` | 108 | 108 | 108 |
| 13 | Light Green | `#9AD284` | 154 | 210 | 132 |
| 14 | Light Blue | `#6C5EB5` | 108 | 94 | 181 |
| 15 | Light Grey | `#959595` | 149 | 149 | 149 |

### C64-Wiki Palette (commonly used in web projects)

| Index | Color Name | Hex |
|-------|-----------|-----|
| 0 | Black | `#000000` |
| 1 | White | `#FFFFFF` |
| 2 | Red | `#880000` |
| 3 | Cyan | `#AAFFEE` |
| 4 | Violet | `#CC44CC` |
| 5 | Green | `#00CC55` |
| 6 | Blue | `#0000AA` |
| 7 | Yellow | `#EEEE77` |
| 8 | Orange | `#DD8855` |
| 9 | Brown | `#664400` |
| 10 | Light Red | `#FF7777` |
| 11 | Dark Grey | `#333333` |
| 12 | Grey | `#777777` |
| 13 | Light Green | `#AAFF66` |
| 14 | Light Blue | `#0088FF` |
| 15 | Light Grey | `#BBBBBB` |

### Available VICE Palette Files

VICE ships with 27 palette files for the C64. The key ones:

| Palette File | Description |
|-------------|-------------|
| `colodore.vpl` | Colodore by Pepto (recommended, most accurate) |
| `pepto-pal.vpl` | Original Pepto PAL |
| `pepto-ntsc.vpl` | Pepto NTSC variant |
| `vice.vpl` | Legacy VICE default (saturated, less accurate) |
| `community-colors.vpl` | Community-voted palette |
| `cjam.vpl` | C-Jam palette |
| `rgb.vpl` | Pure RGB (clean, not realistic) |

### CSS Custom Properties (Colodore palette)

```css
:root {
  --c64-black:       #000000;
  --c64-white:       #FFFFFF;
  --c64-red:         #96282E;
  --c64-cyan:        #5BD6CE;
  --c64-purple:      #9F2DAD;
  --c64-green:       #41B936;
  --c64-blue:        #2724C4;
  --c64-yellow:      #EFF347;
  --c64-orange:      #9F4815;
  --c64-brown:       #5E3500;
  --c64-light-red:   #DA5F66;
  --c64-dark-grey:   #474747;
  --c64-grey:        #787878;
  --c64-light-green: #91FF84;
  --c64-light-blue:  #6864FF;
  --c64-light-grey:  #AEAEAE;
}
```

### Color Properties

The VIC-II generates colors using 5 luma levels and 8 chroma phases:

- **Achromatic colors** (no chroma, luma only): Black (0), Dark Grey (11), Grey (12), Light Grey (15), White (1)
- **Chromatic colors**: the remaining 11 colors, each with a specific chroma phase angle
- The greys form a clean luma ramp: 0 < 11 < 12 < 15 < 1
- Light Red (10) is Red (2) at a higher luma
- Light Green (13) is Green (5) at a higher luma
- Light Blue (14) is Blue (6) at a higher luma

---

## 5. C64 Screen Properties

### Display Resolution

| Property | Value |
|----------|-------|
| **Visible screen** | 320 x 200 pixels (hi-res mode) |
| **Multicolor mode** | 160 x 200 pixels (double-wide pixels) |
| **Text mode** | 40 columns x 25 rows |
| **Character cell** | 8 x 8 pixels |
| **Total characters on screen** | 1,000 (40 x 25) |

### Border Area

| Property | PAL (6569) | NTSC (6567) |
|----------|-----------|-------------|
| **Total raster lines** | 312 | 263 |
| **Cycles per line** | 63 | 65 |
| **Pixels per line (total)** | 504 | 520 |
| **Visible area (with border)** | 403 x 284 | ~418 x 235 |
| **Full display incl. border** | 384 x 272 (commonly cited) | varies |

**Border dimensions (PAL, standard):**
- **Top border**: 42 raster lines above the 200-line display area
- **Bottom border**: 42 raster lines below
- **Left border**: 32 pixels (4 character widths)
- **Right border**: 32 pixels (4 character widths)

The visible border extends the 320x200 display to approximately **384 x 272** visible pixels on a PAL display.

### Memory Layout

| Component | Address Range | Size |
|-----------|--------------|------|
| **Screen RAM** | $0400-$07E7 | 1000 bytes (40x25) |
| **Color RAM** | $D800-$DBE7 | 1000 nybbles |
| **Character ROM** | $D000-$DFFF | 4096 bytes (512 chars x 8 bytes) |
| **VIC-II registers** | $D000-$D02E | 47 registers |
| **Border color** | $D020 (53280) | 1 nybble (bits 0-3) |
| **Background color** | $D021 (53281) | 1 nybble (bits 0-3) |

### Default Colors at Power-On

The C64 KERNAL initializes these colors on boot:

| Element | Color Index | Color Name | Colodore Hex |
|---------|------------|------------|--------------|
| **Border** | 14 | Light Blue | `#6864FF` |
| **Background** | 6 | Blue | `#2724C4` |
| **Text (cursor)** | 14 | Light Blue | `#6864FF` |

This gives the iconic **blue screen with light blue text and light blue border**.

### CSS for Authentic C64 Screen

```css
.c64-screen {
  /* Use Colodore palette */
  background-color: #2724C4;   /* Blue (6) - background */
  color: #6864FF;              /* Light Blue (14) - text */
  border: 32px solid #6864FF;  /* Light Blue (14) - border */

  font-family: 'C64 Pro Mono', monospace;
  font-size: 16px;             /* 2x scale: 8px char = 16px */
  line-height: 1;              /* No extra line spacing */
  letter-spacing: 0;           /* No extra letter spacing */

  /* 40 columns x 25 rows */
  width: 640px;                /* 40 chars x 16px */
  height: 400px;               /* 25 rows x 16px */

  /* Pixel-perfect rendering */
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  image-rendering: pixelated;

  /* Monospace grid */
  white-space: pre;
  overflow: hidden;
}
```

### Aspect Ratio Considerations

The C64 outputs to a 4:3 CRT display. The pixels are NOT square:
- **PAL**: Pixel aspect ratio is approximately **0.9365:1** (pixels are slightly taller than wide)
- **NTSC**: Pixel aspect ratio is approximately **0.7500:1** (pixels are notably taller than wide)

For web display at 2x scale, 640x400 CSS pixels in a 4:3 container is a reasonable approximation for PAL.

### Character Encoding Quick Reference

| What You Want | How to Display |
|--------------|----------------|
| Regular uppercase text | Just type normally with C64 Pro Mono |
| PETSCII graphic char (by screen code) | `&#xEExx;` where xx = hex screen code |
| PETSCII char (by PETSCII code) | `&#xEFxx;` where xx = hex PETSCII code |
| Uppercase/Graphics set char | `&#xE0xx;` |
| Lowercase/Uppercase set char | `&#xE1xx;` |
| Reversed U/G char | `&#xE2xx;` |
| Reversed L/U char | `&#xE3xx;` |

---

## Sources

- Style64 C64 TrueType: https://style64.org/c64-truetype
- Style64 PETSCII Reference: https://style64.org/petscii/
- Style64 PETSCII/ROM Mapping: https://style64.org/c64-truetype/petscii-rom-mapping
- Style64 License: https://style64.org/c64-truetype/license
- Kreative Korporation Pet Me Fonts: https://www.kreativekorp.com/software/fonts/c64/
- Homecomputer Fonts (Sixtyfour): https://github.com/jenskutilek/homecomputer-fonts
- Commodore 64 Pixelized: https://www.dafont.com/commodore-64-pixelized.font
- Pepto Colodore Palette: https://www.pepto.de/projects/colorvic/
- Colodore Palette on Lospec: https://lospec.com/palette-list/colodore
- VICE Palette Files: https://github.com/VICE-Team/svn-mirror/tree/main/vice/data/C64
- C64-Wiki Color Reference: https://www.c64-wiki.com/wiki/Color
- C64-Wiki Border Register: https://www.c64-wiki.com/wiki/53280
- C64-Wiki Background Register: https://www.c64-wiki.com/wiki/53281
- VIC-II Technical Reference: https://www.zimmers.net/cbmpics/cbm/c64/vic-ii.txt
- C64-Wiki High Resolution: https://www.c64-wiki.com/wiki/High_Resolution
- VIC-II Raster Timing: https://dustlayer.com/vic-ii/2013/4/25/vic-ii-for-beginners-beyond-the-screen-rasters-cycle
