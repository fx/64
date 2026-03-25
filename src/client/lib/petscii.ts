/**
 * Render a PETSCII character by screen code.
 * Screen codes 0x00-0xFF map to Unicode PUA U+EE00-U+EEFF.
 */
export function petsciiByScreenCode(code: number): string {
  return String.fromCodePoint(0xee00 + (code & 0xff));
}

/**
 * Render a PETSCII character by PETSCII code.
 * PETSCII codes 0x00-0xFF map to Unicode PUA U+EF00-U+EFFF.
 */
export function petsciiByCode(code: number): string {
  return String.fromCodePoint(0xef00 + (code & 0xff));
}

/**
 * PETSCII box-drawing characters (screen codes).
 * These are the standard C64 box-drawing characters for UI borders.
 */
export const PETSCII_BOX = {
  topLeft: "\u{EE70}",      // ┌
  topRight: "\u{EE6E}",     // ┐
  bottomLeft: "\u{EE6D}",   // └
  bottomRight: "\u{EE7D}",  // ┘
  horizontal: "\u{EE40}",   // ─
  vertical: "\u{EE5D}",     // │
} as const;
