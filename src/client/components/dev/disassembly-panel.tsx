import { useMemo } from "react";
import {
  disassemble,
  formatAddress,
  formatBytes,
  type Instruction,
  type InstrCategory,
} from "../../lib/disassembler.ts";

const BYTES_PER_ROW = 16;
const ROW_HEIGHT = 16;
const VISIBLE_ROWS = 32;

interface DisassemblyPanelProps {
  data: Uint8Array | undefined;
  baseAddress: number;
  scrollOffset: number;
  onScrollOffset: (offset: number) => void;
}

/** Map instruction categories to C64 VIC-II colors */
const CATEGORY_COLORS: Record<InstrCategory, string> = {
  load:     "text-c64-3-cyan",
  store:    "text-c64-4-purple",
  transfer: "text-c64-15-light-grey",
  stack:    "text-c64-15-light-grey",
  arith:    "text-c64-7-yellow",
  logic:    "text-c64-13-light-green",
  shift:    "text-c64-13-light-green",
  compare:  "text-c64-8-orange",
  branch:   "text-c64-10-light-red",
  jump:     "text-c64-2-red",
  flag:     "text-c64-12-grey",
  nop:      "text-c64-11-dark-grey",
  illegal:  "text-c64-9-brown",
};

export function DisassemblyPanel({
  data,
  baseAddress,
  scrollOffset,
  onScrollOffset,
}: DisassemblyPanelProps) {
  const instructions = useMemo(() => {
    if (!data) return [];
    return disassemble(data, baseAddress);
  }, [data, baseAddress]);

  // Build a map from byte offset to instruction index for scroll sync
  const offsetToInstrIdx = useMemo(() => {
    const map = new Map<number, number>();
    for (let i = 0; i < instructions.length; i++) {
      const byteOffset = instructions[i].address - baseAddress;
      const row = Math.floor(byteOffset / BYTES_PER_ROW);
      if (!map.has(row)) {
        map.set(row, i);
      }
    }
    return map;
  }, [instructions, baseAddress]);

  // Find the first instruction that corresponds to the current scroll offset
  const startInstrIdx = offsetToInstrIdx.get(scrollOffset) ?? 0;

  // Collect instructions to display
  const visibleInstructions: Instruction[] = [];
  const endByteOffset = (scrollOffset + VISIBLE_ROWS) * BYTES_PER_ROW + baseAddress;
  for (let i = startInstrIdx; i < instructions.length; i++) {
    if (instructions[i].address >= endByteOffset) break;
    visibleInstructions.push(instructions[i]);
  }

  const handleScroll = (e: React.WheelEvent) => {
    e.preventDefault();
    const maxScroll = Math.max(0, Math.ceil((data?.length ?? 0) / BYTES_PER_ROW) - VISIBLE_ROWS);
    const delta = e.deltaY > 0 ? 3 : -3;
    onScrollOffset(Math.max(0, Math.min(maxScroll, scrollOffset + delta)));
  };

  return (
    <div>
      {/* Header */}
      <div className="flex whitespace-pre text-c64-11-dark-grey mb-[0.25em]" style={{ height: ROW_HEIGHT }}>
        <span className="w-[5ch] inline-block">ADDR</span>
        <span className="w-[1ch] inline-block"> </span>
        <span className="w-[9ch] inline-block">BYTES</span>
        <span className="w-[1ch] inline-block"> </span>
        <span className="inline-block">INSTRUCTION</span>
      </div>

      {/* Instructions */}
      <div
        className="overflow-hidden select-none"
        style={{ height: VISIBLE_ROWS * ROW_HEIGHT }}
        onWheel={handleScroll}
      >
        {!data ? (
          <div className="text-c64-11-dark-grey">
            <span className="animate-c64-cursor">{"\u2588"}</span> WAITING...
          </div>
        ) : visibleInstructions.length === 0 ? (
          <div className="text-c64-11-dark-grey">NO INSTRUCTIONS</div>
        ) : (
          visibleInstructions.map((instr, idx) => {
            const colorClass = CATEGORY_COLORS[instr.category] ?? "text-c64-14-light-blue";
            return (
              <div key={idx} className="flex whitespace-pre" style={{ height: ROW_HEIGHT }}>
                <span className="text-c64-15-light-grey w-[5ch] inline-block">
                  {formatAddress(instr.address)}
                </span>
                <span className="w-[1ch] inline-block"> </span>
                <span className="text-c64-11-dark-grey w-[9ch] inline-block">
                  {formatBytes(instr.bytes).padEnd(8)}
                </span>
                <span className="w-[1ch] inline-block"> </span>
                <span className={`inline-block ${colorClass}`}>
                  {instr.mnemonic}
                  {instr.operand ? ` ${instr.operand}` : ""}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Legend */}
      <div className="mt-[0.5em] text-c64-11-dark-grey flex flex-wrap gap-x-[2ch]">
        <span className="text-c64-3-cyan">LOAD</span>
        <span className="text-c64-4-purple">STORE</span>
        <span className="text-c64-7-yellow">ARITH</span>
        <span className="text-c64-13-light-green">LOGIC</span>
        <span className="text-c64-10-light-red">BRANCH</span>
        <span className="text-c64-2-red">JUMP</span>
        <span className="text-c64-9-brown">ILLEGAL</span>
      </div>
    </div>
  );
}
