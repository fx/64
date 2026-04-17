import { useMemo } from "react";
import { petsciiByScreenCode } from "../../lib/petscii.ts";

const SCREEN_COLS = 40;
const SCREEN_ROWS = 25;
const SCREEN_SIZE = SCREEN_COLS * SCREEN_ROWS; // 1000 bytes
const SCREEN_RAM_START = 0x0400;

/** C64 VIC-II color index to CSS color variable */
const VIC_COLORS: string[] = [
  "var(--c64-0-black)",
  "var(--c64-1-white)",
  "var(--c64-2-red)",
  "var(--c64-3-cyan)",
  "var(--c64-4-purple)",
  "var(--c64-5-green)",
  "var(--c64-6-blue)",
  "var(--c64-7-yellow)",
  "var(--c64-8-orange)",
  "var(--c64-9-brown)",
  "var(--c64-10-light-red)",
  "var(--c64-11-dark-grey)",
  "var(--c64-12-grey)",
  "var(--c64-13-light-green)",
  "var(--c64-14-light-blue)",
  "var(--c64-15-light-grey)",
];

interface ScreenViewerProps {
  /** Full memory data (at least 65536 bytes for full address space) */
  data: Uint8Array | undefined;
  /** Base address of the data buffer */
  baseAddress: number;
}

export function ScreenViewer({ data, baseAddress }: ScreenViewerProps) {
  const screenData = useMemo(() => {
    if (!data) return null;

    const screenOffset = SCREEN_RAM_START - baseAddress;
    if (screenOffset < 0 || screenOffset + SCREEN_SIZE > data.length) {
      return null;
    }

    // Color RAM at $D800
    const colorOffset = 0xD800 - baseAddress;
    const hasColorRam = colorOffset >= 0 && colorOffset + SCREEN_SIZE <= data.length;

    const rows: { char: number; color: number }[][] = [];
    for (let row = 0; row < SCREEN_ROWS; row++) {
      const cells: { char: number; color: number }[] = [];
      for (let col = 0; col < SCREEN_COLS; col++) {
        const idx = row * SCREEN_COLS + col;
        cells.push({
          char: data[screenOffset + idx],
          color: hasColorRam ? (data[colorOffset + idx] & 0x0F) : 14, // default light blue
        });
      }
      rows.push(cells);
    }
    return rows;
  }, [data, baseAddress]);

  if (!data) {
    return (
      <div className="text-c64-11-dark-grey">
        <span className="animate-c64-cursor">{"\u2588"}</span> LOADING SCREEN...
      </div>
    );
  }

  if (!screenData) {
    return (
      <div className="text-c64-11-dark-grey">
        SCREEN RAM ($0400-$07E7) NOT IN LOADED RANGE
      </div>
    );
  }

  return (
    <div>
      <div
        className="inline-block bg-c64-6-blue"
        style={{ lineHeight: 1, letterSpacing: 0 }}
      >
        {screenData.map((row, rowIdx) => (
          <div key={rowIdx} className="whitespace-pre" style={{ height: 16 }}>
            {row.map((cell, colIdx) => (
              <span
                key={colIdx}
                style={{ color: VIC_COLORS[cell.color] }}
              >
                {petsciiByScreenCode(cell.char)}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="text-c64-11-dark-grey mt-[0.5em]">
        SCREEN RAM: $0400-$07E7 ({SCREEN_SIZE} BYTES)
      </div>
    </div>
  );
}
