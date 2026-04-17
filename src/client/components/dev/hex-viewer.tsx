import { useState, useCallback, useRef, useEffect, type KeyboardEvent } from "react";
import { formatAddress } from "../../lib/disassembler.ts";

const BYTES_PER_ROW = 16;
const ROW_HEIGHT = 16; // 16px = 1em at base font size
const VISIBLE_ROWS = 32;
const TOTAL_ROWS = 4096; // 65536 / 16

interface HexViewerProps {
  data: Uint8Array | undefined;
  baseAddress: number;
  onByteEdit?: (address: number, value: number) => void;
  onHoverAddress?: (address: number | null) => void;
  onScrollOffset?: (offset: number) => void;
  scrollOffset?: number;
  selectedAddress?: number | null;
}

function toAscii(byte: number): string {
  return byte >= 0x20 && byte <= 0x7E ? String.fromCharCode(byte) : ".";
}

function hexByte(v: number): string {
  return v.toString(16).toUpperCase().padStart(2, "0");
}

export function HexViewer({
  data,
  baseAddress,
  onByteEdit,
  onHoverAddress,
  onScrollOffset,
  scrollOffset: externalScrollOffset,
  selectedAddress,
}: HexViewerProps) {
  const [internalScrollOffset, setInternalScrollOffset] = useState(0);
  const scrollOffset = externalScrollOffset ?? internalScrollOffset;
  const [editingAddr, setEditingAddr] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [hoverAddr, setHoverAddr] = useState<number | null>(null);
  const [jumpInput, setJumpInput] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const totalDataRows = data ? Math.ceil(data.length / BYTES_PER_ROW) : 0;
  const maxScroll = Math.max(0, totalDataRows - VISIBLE_ROWS);

  const handleScroll = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 3 : -3;
      const newOffset = Math.max(0, Math.min(maxScroll, scrollOffset + delta));
      if (onScrollOffset) {
        onScrollOffset(newOffset);
      } else {
        setInternalScrollOffset(newOffset);
      }
    },
    [scrollOffset, maxScroll, onScrollOffset],
  );

  const handleJump = useCallback(() => {
    const addr = parseInt(jumpInput, 16);
    if (isNaN(addr) || addr < 0 || addr > 0xFFFF) return;
    const row = Math.floor((addr - baseAddress) / BYTES_PER_ROW);
    const newOffset = Math.max(0, Math.min(maxScroll, row));
    if (onScrollOffset) {
      onScrollOffset(newOffset);
    } else {
      setInternalScrollOffset(newOffset);
    }
    setJumpInput("");
  }, [jumpInput, baseAddress, maxScroll, onScrollOffset]);

  const handleByteClick = useCallback((addr: number) => {
    if (!onByteEdit) return;
    setEditingAddr(addr);
    const dataOffset = addr - baseAddress;
    setEditValue(data && dataOffset >= 0 && dataOffset < data.length
      ? hexByte(data[dataOffset])
      : "00");
  }, [onByteEdit, baseAddress, data]);

  const handleEditKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        const value = parseInt(editValue, 16);
        if (!isNaN(value) && value >= 0 && value <= 0xFF && editingAddr !== null) {
          onByteEdit?.(editingAddr, value);
        }
        setEditingAddr(null);
      } else if (e.key === "Escape") {
        setEditingAddr(null);
      }
    },
    [editValue, editingAddr, onByteEdit],
  );

  useEffect(() => {
    if (editingAddr !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingAddr]);

  const handleMouseEnter = useCallback(
    (addr: number) => {
      setHoverAddr(addr);
      onHoverAddress?.(addr);
    },
    [onHoverAddress],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverAddr(null);
    onHoverAddress?.(null);
  }, [onHoverAddress]);

  const rows: React.ReactNode[] = [];
  for (let rowIdx = 0; rowIdx < VISIBLE_ROWS && rowIdx + scrollOffset < totalDataRows; rowIdx++) {
    const rowStart = (scrollOffset + rowIdx) * BYTES_PER_ROW;
    const rowAddr = baseAddress + rowStart;

    const hexCells: React.ReactNode[] = [];
    const asciiCells: React.ReactNode[] = [];

    for (let col = 0; col < BYTES_PER_ROW; col++) {
      const byteOffset = rowStart + col;
      const addr = baseAddress + byteOffset;
      const byteVal = data && byteOffset < data.length ? data[byteOffset] : null;

      const isHovered = hoverAddr === addr;
      const isSelected = selectedAddress === addr;
      const isEditing = editingAddr === addr;

      const cellClass = [
        "inline-block w-[2ch] text-center cursor-pointer",
        isEditing ? "bg-c64-14-light-blue text-c64-6-blue" :
        isSelected ? "bg-c64-3-cyan text-c64-6-blue" :
        isHovered ? "bg-c64-11-dark-grey" : "",
      ].join(" ");

      if (isEditing) {
        hexCells.push(
          <input
            key={col}
            ref={editInputRef}
            className="inline-block w-[2ch] text-center bg-c64-14-light-blue text-c64-6-blue border-none outline-none p-0"
            style={{ fontFamily: "inherit", fontSize: "inherit", lineHeight: "inherit" }}
            value={editValue}
            maxLength={2}
            onChange={(e) => setEditValue(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, ""))}
            onKeyDown={handleEditKeyDown}
            onBlur={() => setEditingAddr(null)}
          />,
        );
      } else {
        hexCells.push(
          <span
            key={col}
            className={cellClass}
            onClick={() => byteVal !== null && handleByteClick(addr)}
            onMouseEnter={() => handleMouseEnter(addr)}
            onMouseLeave={handleMouseLeave}
          >
            {byteVal !== null ? hexByte(byteVal) : "  "}
          </span>,
        );
      }

      // Add space after every 8 bytes for readability
      if (col === 7) {
        hexCells.push(<span key="sep" className="inline-block w-[1ch]"> </span>);
      }

      asciiCells.push(
        <span
          key={col}
          className={[
            "inline-block w-[1ch]",
            isHovered || isSelected ? "bg-c64-11-dark-grey" : "",
          ].join(" ")}
          onMouseEnter={() => handleMouseEnter(addr)}
          onMouseLeave={handleMouseLeave}
        >
          {byteVal !== null ? toAscii(byteVal) : " "}
        </span>,
      );
    }

    rows.push(
      <div key={rowIdx} className="flex whitespace-pre" style={{ height: ROW_HEIGHT }}>
        <span className="text-c64-15-light-grey w-[5ch] inline-block">
          {formatAddress(rowAddr)}
        </span>
        <span className="inline-block w-[1ch]"> </span>
        <span className="inline-block">{hexCells}</span>
        <span className="inline-block w-[2ch]"> </span>
        <span className="text-c64-13-light-green inline-block">{asciiCells}</span>
      </div>,
    );
  }

  return (
    <div>
      {/* Address jump bar */}
      <div className="flex items-center gap-[1ch] mb-[0.5em]">
        <span className="text-c64-15-light-grey">GOTO:</span>
        <input
          className="c64-control w-[6ch] p-[0.25em]"
          value={jumpInput}
          placeholder="ADDR"
          maxLength={4}
          onChange={(e) => setJumpInput(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && handleJump()}
        />
        <button
          className="c64-button p-[0.25em_0.5em]"
          onClick={handleJump}
          type="button"
        >
          GO
        </button>
        <span className="text-c64-11-dark-grey ml-[2ch]">
          {data ? `${data.length} BYTES` : "NO DATA"}
        </span>
      </div>

      {/* Column header */}
      <div className="flex whitespace-pre text-c64-11-dark-grey" style={{ height: ROW_HEIGHT }}>
        <span className="w-[5ch] inline-block">ADDR</span>
        <span className="inline-block w-[1ch]"> </span>
        <span className="inline-block">
          {Array.from({ length: BYTES_PER_ROW }, (_, i) =>
            hexByte(i),
          ).join("")
            .replace(/(.{2})/g, "$1")
            .split("")
            .reduce((acc, _, i, arr) => {
              if (i % 2 === 0) acc.push(arr[i] + arr[i + 1]);
              return acc;
            }, [] as string[])
            .map((h, i) => (
              <span key={i}>
                {h}
                {i === 7 ? " " : ""}
              </span>
            ))}
        </span>
        <span className="inline-block w-[2ch]"> </span>
        <span className="inline-block">ASCII</span>
      </div>

      {/* Hex grid with virtual scroll */}
      <div
        ref={containerRef}
        className="overflow-hidden select-none"
        style={{ height: VISIBLE_ROWS * ROW_HEIGHT }}
        onWheel={handleScroll}
      >
        {data ? rows : (
          <div className="text-c64-11-dark-grey">
            <span className="animate-c64-cursor">{"\u2588"}</span> LOADING MEMORY...
          </div>
        )}
      </div>

      {/* Scroll position indicator */}
      {data && totalDataRows > VISIBLE_ROWS && (
        <div className="text-c64-11-dark-grey mt-[0.25em]">
          ROW {scrollOffset + 1}/{totalDataRows}
        </div>
      )}
    </div>
  );
}
