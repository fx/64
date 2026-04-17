/**
 * 6502/6510 Disassembler
 *
 * Supports all 151 official opcodes plus ~20 common undocumented 6510 opcodes.
 * Pure client-side function: bytes in, instructions out.
 */

// ── Addressing Modes ────────────────────────────────────

export enum AddrMode {
  IMP = "imp",   // Implied
  ACC = "acc",   // Accumulator
  IMM = "imm",   // Immediate #$nn
  ZP  = "zp",    // Zero Page $nn
  ZPX = "zpx",   // Zero Page,X $nn,X
  ZPY = "zpy",   // Zero Page,Y $nn,Y
  ABS = "abs",   // Absolute $nnnn
  ABX = "abx",   // Absolute,X $nnnn,X
  ABY = "aby",   // Absolute,Y $nnnn,Y
  IND = "ind",   // Indirect ($nnnn)
  IZX = "izx",   // (Indirect,X) ($nn,X)
  IZY = "izy",   // (Indirect),Y ($nn),Y
  REL = "rel",   // Relative (branches)
}

/** Byte size for each addressing mode (including the opcode byte) */
const ADDR_SIZE: Record<AddrMode, number> = {
  [AddrMode.IMP]: 1,
  [AddrMode.ACC]: 1,
  [AddrMode.IMM]: 2,
  [AddrMode.ZP]:  2,
  [AddrMode.ZPX]: 2,
  [AddrMode.ZPY]: 2,
  [AddrMode.ABS]: 3,
  [AddrMode.ABX]: 3,
  [AddrMode.ABY]: 3,
  [AddrMode.IND]: 3,
  [AddrMode.IZX]: 2,
  [AddrMode.IZY]: 2,
  [AddrMode.REL]: 2,
};

// ── Instruction Categories ──────────────────────────────

export type InstrCategory =
  | "load"      // LDA, LDX, LDY
  | "store"     // STA, STX, STY
  | "transfer"  // TAX, TXA, TAY, TYA, TSX, TXS
  | "stack"     // PHA, PLA, PHP, PLP
  | "arith"     // ADC, SBC, INC, DEC, INX, INY, DEX, DEY
  | "logic"     // AND, ORA, EOR
  | "shift"     // ASL, LSR, ROL, ROR
  | "compare"   // CMP, CPX, CPY, BIT
  | "branch"    // BCC, BCS, BEQ, BNE, BMI, BPL, BVC, BVS
  | "jump"      // JMP, JSR, RTS, RTI, BRK
  | "flag"      // CLC, SEC, CLD, SED, CLI, SEI, CLV
  | "nop"       // NOP
  | "illegal";  // Undocumented/illegal opcodes

const CAT_MAP: Record<string, InstrCategory> = {
  LDA: "load", LDX: "load", LDY: "load",
  STA: "store", STX: "store", STY: "store",
  TAX: "transfer", TXA: "transfer", TAY: "transfer", TYA: "transfer",
  TSX: "transfer", TXS: "transfer",
  PHA: "stack", PLA: "stack", PHP: "stack", PLP: "stack",
  ADC: "arith", SBC: "arith", INC: "arith", DEC: "arith",
  INX: "arith", INY: "arith", DEX: "arith", DEY: "arith",
  AND: "logic", ORA: "logic", EOR: "logic",
  ASL: "shift", LSR: "shift", ROL: "shift", ROR: "shift",
  CMP: "compare", CPX: "compare", CPY: "compare", BIT: "compare",
  BCC: "branch", BCS: "branch", BEQ: "branch", BNE: "branch",
  BMI: "branch", BPL: "branch", BVC: "branch", BVS: "branch",
  JMP: "jump", JSR: "jump", RTS: "jump", RTI: "jump", BRK: "jump",
  CLC: "flag", SEC: "flag", CLD: "flag", SED: "flag",
  CLI: "flag", SEI: "flag", CLV: "flag",
  NOP: "nop",
  // Undocumented
  SLO: "illegal", RLA: "illegal", SRE: "illegal", RRA: "illegal",
  SAX: "illegal", LAX: "illegal", DCP: "illegal", ISC: "illegal",
  ANC: "illegal", ALR: "illegal", ARR: "illegal", SBX: "illegal",
  LAS: "illegal", JAM: "illegal", SHA: "illegal", SHX: "illegal",
  SHY: "illegal", TAS: "illegal", ANE: "illegal", LXA: "illegal",
  "NOP*": "illegal", "SBC*": "illegal",
};

// ── Opcode Entry ────────────────────────────────────────

interface OpcodeEntry {
  mnemonic: string;
  mode: AddrMode;
}

/**
 * Full 256-entry opcode table.
 * Official 6502 opcodes + common undocumented 6510 opcodes.
 * Entries with null are truly undefined (rendered as ???).
 */
const OPCODES: (OpcodeEntry | null)[] = buildOpcodeTable();

function buildOpcodeTable(): (OpcodeEntry | null)[] {
  const t: (OpcodeEntry | null)[] = new Array(256).fill(null);

  function op(code: number, mnemonic: string, mode: AddrMode) {
    t[code] = { mnemonic, mode };
  }

  // ── BRK / NOP / Flag ops ──────────────────
  op(0x00, "BRK", AddrMode.IMP);
  op(0xEA, "NOP", AddrMode.IMP);
  op(0x18, "CLC", AddrMode.IMP);
  op(0x38, "SEC", AddrMode.IMP);
  op(0x58, "CLI", AddrMode.IMP);
  op(0x78, "SEI", AddrMode.IMP);
  op(0xB8, "CLV", AddrMode.IMP);
  op(0xD8, "CLD", AddrMode.IMP);
  op(0xF8, "SED", AddrMode.IMP);

  // ── Transfer / Stack ──────────────────────
  op(0xAA, "TAX", AddrMode.IMP);
  op(0x8A, "TXA", AddrMode.IMP);
  op(0xA8, "TAY", AddrMode.IMP);
  op(0x98, "TYA", AddrMode.IMP);
  op(0xBA, "TSX", AddrMode.IMP);
  op(0x9A, "TXS", AddrMode.IMP);
  op(0x48, "PHA", AddrMode.IMP);
  op(0x68, "PLA", AddrMode.IMP);
  op(0x08, "PHP", AddrMode.IMP);
  op(0x28, "PLP", AddrMode.IMP);
  op(0xCA, "DEX", AddrMode.IMP);
  op(0xE8, "INX", AddrMode.IMP);
  op(0x88, "DEY", AddrMode.IMP);
  op(0xC8, "INY", AddrMode.IMP);
  op(0x40, "RTI", AddrMode.IMP);
  op(0x60, "RTS", AddrMode.IMP);

  // ── LDA ───────────────────────────────────
  op(0xA9, "LDA", AddrMode.IMM);
  op(0xA5, "LDA", AddrMode.ZP);
  op(0xB5, "LDA", AddrMode.ZPX);
  op(0xAD, "LDA", AddrMode.ABS);
  op(0xBD, "LDA", AddrMode.ABX);
  op(0xB9, "LDA", AddrMode.ABY);
  op(0xA1, "LDA", AddrMode.IZX);
  op(0xB1, "LDA", AddrMode.IZY);

  // ── LDX ───────────────────────────────────
  op(0xA2, "LDX", AddrMode.IMM);
  op(0xA6, "LDX", AddrMode.ZP);
  op(0xB6, "LDX", AddrMode.ZPY);
  op(0xAE, "LDX", AddrMode.ABS);
  op(0xBE, "LDX", AddrMode.ABY);

  // ── LDY ───────────────────────────────────
  op(0xA0, "LDY", AddrMode.IMM);
  op(0xA4, "LDY", AddrMode.ZP);
  op(0xB4, "LDY", AddrMode.ZPX);
  op(0xAC, "LDY", AddrMode.ABS);
  op(0xBC, "LDY", AddrMode.ABX);

  // ── STA ───────────────────────────────────
  op(0x85, "STA", AddrMode.ZP);
  op(0x95, "STA", AddrMode.ZPX);
  op(0x8D, "STA", AddrMode.ABS);
  op(0x9D, "STA", AddrMode.ABX);
  op(0x99, "STA", AddrMode.ABY);
  op(0x81, "STA", AddrMode.IZX);
  op(0x91, "STA", AddrMode.IZY);

  // ── STX ───────────────────────────────────
  op(0x86, "STX", AddrMode.ZP);
  op(0x96, "STX", AddrMode.ZPY);
  op(0x8E, "STX", AddrMode.ABS);

  // ── STY ───────────────────────────────────
  op(0x84, "STY", AddrMode.ZP);
  op(0x94, "STY", AddrMode.ZPX);
  op(0x8C, "STY", AddrMode.ABS);

  // ── ADC ───────────────────────────────────
  op(0x69, "ADC", AddrMode.IMM);
  op(0x65, "ADC", AddrMode.ZP);
  op(0x75, "ADC", AddrMode.ZPX);
  op(0x6D, "ADC", AddrMode.ABS);
  op(0x7D, "ADC", AddrMode.ABX);
  op(0x79, "ADC", AddrMode.ABY);
  op(0x61, "ADC", AddrMode.IZX);
  op(0x71, "ADC", AddrMode.IZY);

  // ── SBC ───────────────────────────────────
  op(0xE9, "SBC", AddrMode.IMM);
  op(0xE5, "SBC", AddrMode.ZP);
  op(0xF5, "SBC", AddrMode.ZPX);
  op(0xED, "SBC", AddrMode.ABS);
  op(0xFD, "SBC", AddrMode.ABX);
  op(0xF9, "SBC", AddrMode.ABY);
  op(0xE1, "SBC", AddrMode.IZX);
  op(0xF1, "SBC", AddrMode.IZY);

  // ── AND ───────────────────────────────────
  op(0x29, "AND", AddrMode.IMM);
  op(0x25, "AND", AddrMode.ZP);
  op(0x35, "AND", AddrMode.ZPX);
  op(0x2D, "AND", AddrMode.ABS);
  op(0x3D, "AND", AddrMode.ABX);
  op(0x39, "AND", AddrMode.ABY);
  op(0x21, "AND", AddrMode.IZX);
  op(0x31, "AND", AddrMode.IZY);

  // ── ORA ───────────────────────────────────
  op(0x09, "ORA", AddrMode.IMM);
  op(0x05, "ORA", AddrMode.ZP);
  op(0x15, "ORA", AddrMode.ZPX);
  op(0x0D, "ORA", AddrMode.ABS);
  op(0x1D, "ORA", AddrMode.ABX);
  op(0x19, "ORA", AddrMode.ABY);
  op(0x01, "ORA", AddrMode.IZX);
  op(0x11, "ORA", AddrMode.IZY);

  // ── EOR ───────────────────────────────────
  op(0x49, "EOR", AddrMode.IMM);
  op(0x45, "EOR", AddrMode.ZP);
  op(0x55, "EOR", AddrMode.ZPX);
  op(0x4D, "EOR", AddrMode.ABS);
  op(0x5D, "EOR", AddrMode.ABX);
  op(0x59, "EOR", AddrMode.ABY);
  op(0x41, "EOR", AddrMode.IZX);
  op(0x51, "EOR", AddrMode.IZY);

  // ── CMP ───────────────────────────────────
  op(0xC9, "CMP", AddrMode.IMM);
  op(0xC5, "CMP", AddrMode.ZP);
  op(0xD5, "CMP", AddrMode.ZPX);
  op(0xCD, "CMP", AddrMode.ABS);
  op(0xDD, "CMP", AddrMode.ABX);
  op(0xD9, "CMP", AddrMode.ABY);
  op(0xC1, "CMP", AddrMode.IZX);
  op(0xD1, "CMP", AddrMode.IZY);

  // ── CPX ───────────────────────────────────
  op(0xE0, "CPX", AddrMode.IMM);
  op(0xE4, "CPX", AddrMode.ZP);
  op(0xEC, "CPX", AddrMode.ABS);

  // ── CPY ───────────────────────────────────
  op(0xC0, "CPY", AddrMode.IMM);
  op(0xC4, "CPY", AddrMode.ZP);
  op(0xCC, "CPY", AddrMode.ABS);

  // ── BIT ───────────────────────────────────
  op(0x24, "BIT", AddrMode.ZP);
  op(0x2C, "BIT", AddrMode.ABS);

  // ── INC / DEC ─────────────────────────────
  op(0xE6, "INC", AddrMode.ZP);
  op(0xF6, "INC", AddrMode.ZPX);
  op(0xEE, "INC", AddrMode.ABS);
  op(0xFE, "INC", AddrMode.ABX);
  op(0xC6, "DEC", AddrMode.ZP);
  op(0xD6, "DEC", AddrMode.ZPX);
  op(0xCE, "DEC", AddrMode.ABS);
  op(0xDE, "DEC", AddrMode.ABX);

  // ── ASL ───────────────────────────────────
  op(0x0A, "ASL", AddrMode.ACC);
  op(0x06, "ASL", AddrMode.ZP);
  op(0x16, "ASL", AddrMode.ZPX);
  op(0x0E, "ASL", AddrMode.ABS);
  op(0x1E, "ASL", AddrMode.ABX);

  // ── LSR ───────────────────────────────────
  op(0x4A, "LSR", AddrMode.ACC);
  op(0x46, "LSR", AddrMode.ZP);
  op(0x56, "LSR", AddrMode.ZPX);
  op(0x4E, "LSR", AddrMode.ABS);
  op(0x5E, "LSR", AddrMode.ABX);

  // ── ROL ───────────────────────────────────
  op(0x2A, "ROL", AddrMode.ACC);
  op(0x26, "ROL", AddrMode.ZP);
  op(0x36, "ROL", AddrMode.ZPX);
  op(0x2E, "ROL", AddrMode.ABS);
  op(0x3E, "ROL", AddrMode.ABX);

  // ── ROR ───────────────────────────────────
  op(0x6A, "ROR", AddrMode.ACC);
  op(0x66, "ROR", AddrMode.ZP);
  op(0x76, "ROR", AddrMode.ZPX);
  op(0x6E, "ROR", AddrMode.ABS);
  op(0x7E, "ROR", AddrMode.ABX);

  // ── JMP / JSR ─────────────────────────────
  op(0x4C, "JMP", AddrMode.ABS);
  op(0x6C, "JMP", AddrMode.IND);
  op(0x20, "JSR", AddrMode.ABS);

  // ── Branches ──────────────────────────────
  op(0x10, "BPL", AddrMode.REL);
  op(0x30, "BMI", AddrMode.REL);
  op(0x50, "BVC", AddrMode.REL);
  op(0x70, "BVS", AddrMode.REL);
  op(0x90, "BCC", AddrMode.REL);
  op(0xB0, "BCS", AddrMode.REL);
  op(0xD0, "BNE", AddrMode.REL);
  op(0xF0, "BEQ", AddrMode.REL);

  // ── Undocumented (common 6510 opcodes) ────
  // SLO (ASL + ORA)
  op(0x07, "SLO", AddrMode.ZP);
  op(0x17, "SLO", AddrMode.ZPX);
  op(0x0F, "SLO", AddrMode.ABS);
  op(0x1F, "SLO", AddrMode.ABX);
  op(0x1B, "SLO", AddrMode.ABY);
  op(0x03, "SLO", AddrMode.IZX);
  op(0x13, "SLO", AddrMode.IZY);

  // RLA (ROL + AND)
  op(0x27, "RLA", AddrMode.ZP);
  op(0x37, "RLA", AddrMode.ZPX);
  op(0x2F, "RLA", AddrMode.ABS);
  op(0x3F, "RLA", AddrMode.ABX);
  op(0x3B, "RLA", AddrMode.ABY);
  op(0x23, "RLA", AddrMode.IZX);
  op(0x33, "RLA", AddrMode.IZY);

  // SRE (LSR + EOR)
  op(0x47, "SRE", AddrMode.ZP);
  op(0x57, "SRE", AddrMode.ZPX);
  op(0x4F, "SRE", AddrMode.ABS);
  op(0x5F, "SRE", AddrMode.ABX);
  op(0x5B, "SRE", AddrMode.ABY);
  op(0x43, "SRE", AddrMode.IZX);
  op(0x53, "SRE", AddrMode.IZY);

  // RRA (ROR + ADC)
  op(0x67, "RRA", AddrMode.ZP);
  op(0x77, "RRA", AddrMode.ZPX);
  op(0x6F, "RRA", AddrMode.ABS);
  op(0x7F, "RRA", AddrMode.ABX);
  op(0x7B, "RRA", AddrMode.ABY);
  op(0x63, "RRA", AddrMode.IZX);
  op(0x73, "RRA", AddrMode.IZY);

  // SAX (store A & X)
  op(0x87, "SAX", AddrMode.ZP);
  op(0x97, "SAX", AddrMode.ZPY);
  op(0x8F, "SAX", AddrMode.ABS);
  op(0x83, "SAX", AddrMode.IZX);

  // LAX (LDA + LDX)
  op(0xA7, "LAX", AddrMode.ZP);
  op(0xB7, "LAX", AddrMode.ZPY);
  op(0xAF, "LAX", AddrMode.ABS);
  op(0xBF, "LAX", AddrMode.ABY);
  op(0xA3, "LAX", AddrMode.IZX);
  op(0xB3, "LAX", AddrMode.IZY);

  // DCP (DEC + CMP)
  op(0xC7, "DCP", AddrMode.ZP);
  op(0xD7, "DCP", AddrMode.ZPX);
  op(0xCF, "DCP", AddrMode.ABS);
  op(0xDF, "DCP", AddrMode.ABX);
  op(0xDB, "DCP", AddrMode.ABY);
  op(0xC3, "DCP", AddrMode.IZX);
  op(0xD3, "DCP", AddrMode.IZY);

  // ISC (INC + SBC)
  op(0xE7, "ISC", AddrMode.ZP);
  op(0xF7, "ISC", AddrMode.ZPX);
  op(0xEF, "ISC", AddrMode.ABS);
  op(0xFF, "ISC", AddrMode.ABX);
  op(0xFB, "ISC", AddrMode.ABY);
  op(0xE3, "ISC", AddrMode.IZX);
  op(0xF3, "ISC", AddrMode.IZY);

  // ANC (AND + set C from bit 7)
  op(0x0B, "ANC", AddrMode.IMM);
  op(0x2B, "ANC", AddrMode.IMM);

  // ALR (AND + LSR)
  op(0x4B, "ALR", AddrMode.IMM);

  // ARR (AND + ROR)
  op(0x6B, "ARR", AddrMode.IMM);

  // SBX (A&X - imm -> X)
  op(0xCB, "SBX", AddrMode.IMM);

  // Undocumented SBC
  op(0xEB, "SBC*", AddrMode.IMM);

  // Undocumented NOPs (various sizes)
  op(0x1A, "NOP*", AddrMode.IMP);
  op(0x3A, "NOP*", AddrMode.IMP);
  op(0x5A, "NOP*", AddrMode.IMP);
  op(0x7A, "NOP*", AddrMode.IMP);
  op(0xDA, "NOP*", AddrMode.IMP);
  op(0xFA, "NOP*", AddrMode.IMP);
  op(0x80, "NOP*", AddrMode.IMM);
  op(0x82, "NOP*", AddrMode.IMM);
  op(0x89, "NOP*", AddrMode.IMM);
  op(0xC2, "NOP*", AddrMode.IMM);
  op(0xE2, "NOP*", AddrMode.IMM);
  op(0x04, "NOP*", AddrMode.ZP);
  op(0x44, "NOP*", AddrMode.ZP);
  op(0x64, "NOP*", AddrMode.ZP);
  op(0x14, "NOP*", AddrMode.ZPX);
  op(0x34, "NOP*", AddrMode.ZPX);
  op(0x54, "NOP*", AddrMode.ZPX);
  op(0x74, "NOP*", AddrMode.ZPX);
  op(0xD4, "NOP*", AddrMode.ZPX);
  op(0xF4, "NOP*", AddrMode.ZPX);
  op(0x0C, "NOP*", AddrMode.ABS);
  op(0x1C, "NOP*", AddrMode.ABX);
  op(0x3C, "NOP*", AddrMode.ABX);
  op(0x5C, "NOP*", AddrMode.ABX);
  op(0x7C, "NOP*", AddrMode.ABX);
  op(0xDC, "NOP*", AddrMode.ABX);
  op(0xFC, "NOP*", AddrMode.ABX);

  // JAM/KIL (halts the CPU)
  for (const c of [0x02, 0x12, 0x22, 0x32, 0x42, 0x52, 0x62, 0x72,
                    0x92, 0xB2, 0xD2, 0xF2]) {
    op(c, "JAM", AddrMode.IMP);
  }

  return t;
}

// ── Disassembled Instruction ────────────────────────────

export interface Instruction {
  address: number;       // Absolute address in memory
  opcode: number;        // Raw opcode byte
  bytes: number[];       // All bytes (1-3)
  mnemonic: string;      // e.g. "LDA"
  operand: string;       // e.g. "#$FF", "$0400,X"
  size: number;          // 1, 2, or 3
  category: InstrCategory;
  illegal: boolean;      // True for undocumented opcodes
}

// ── Formatting Helpers ──────────────────────────────────

function hex8(v: number): string {
  return "$" + (v & 0xFF).toString(16).toUpperCase().padStart(2, "0");
}

function hex16(v: number): string {
  return "$" + (v & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");
}

function formatOperand(mode: AddrMode, lo: number, hi: number, instrAddr: number): string {
  switch (mode) {
    case AddrMode.IMP: return "";
    case AddrMode.ACC: return "A";
    case AddrMode.IMM: return `#${hex8(lo)}`;
    case AddrMode.ZP:  return hex8(lo);
    case AddrMode.ZPX: return `${hex8(lo)},X`;
    case AddrMode.ZPY: return `${hex8(lo)},Y`;
    case AddrMode.ABS: return hex16(lo | (hi << 8));
    case AddrMode.ABX: return `${hex16(lo | (hi << 8))},X`;
    case AddrMode.ABY: return `${hex16(lo | (hi << 8))},Y`;
    case AddrMode.IND: return `(${hex16(lo | (hi << 8))})`;
    case AddrMode.IZX: return `(${hex8(lo)},X)`;
    case AddrMode.IZY: return `(${hex8(lo)}),Y`;
    case AddrMode.REL: {
      const offset = lo > 127 ? lo - 256 : lo;
      const target = (instrAddr + 2 + offset) & 0xFFFF;
      return hex16(target);
    }
  }
}

// ── Main Disassemble Function ───────────────────────────

/**
 * Disassemble a block of memory into 6502 instructions.
 *
 * @param data - Raw bytes to disassemble
 * @param baseAddress - Address of the first byte in data
 * @returns Array of disassembled instructions
 */
export function disassemble(data: Uint8Array, baseAddress: number): Instruction[] {
  const instructions: Instruction[] = [];
  let offset = 0;

  while (offset < data.length) {
    const address = (baseAddress + offset) & 0xFFFF;
    const opcodeByte = data[offset];
    const entry = OPCODES[opcodeByte];

    if (!entry) {
      // Unknown opcode — emit as single-byte ???
      instructions.push({
        address,
        opcode: opcodeByte,
        bytes: [opcodeByte],
        mnemonic: "???",
        operand: "",
        size: 1,
        category: "illegal",
        illegal: true,
      });
      offset++;
      continue;
    }

    const size = ADDR_SIZE[entry.mode];

    // If we don't have enough bytes, emit partial
    if (offset + size > data.length) {
      instructions.push({
        address,
        opcode: opcodeByte,
        bytes: Array.from(data.slice(offset)),
        mnemonic: "???",
        operand: "",
        size: data.length - offset,
        category: "illegal",
        illegal: true,
      });
      break;
    }

    const lo = size >= 2 ? data[offset + 1] : 0;
    const hi = size >= 3 ? data[offset + 2] : 0;
    const bytes = Array.from(data.slice(offset, offset + size));
    const operand = formatOperand(entry.mode, lo, hi, address);
    const isIllegal = entry.mnemonic.includes("*") ||
      CAT_MAP[entry.mnemonic] === "illegal";
    const category = CAT_MAP[entry.mnemonic] ?? "illegal";

    instructions.push({
      address,
      opcode: opcodeByte,
      bytes,
      mnemonic: entry.mnemonic,
      operand,
      size,
      category,
      illegal: isIllegal,
    });

    offset += size;
  }

  return instructions;
}

/**
 * Format an address as a 4-digit hex string.
 */
export function formatAddress(address: number): string {
  return (address & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Format bytes as hex string with spaces.
 */
export function formatBytes(bytes: number[]): string {
  return bytes.map(b => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

/**
 * Look up opcode info for a given byte (for testing/inspection).
 */
export function getOpcodeInfo(opcode: number): OpcodeEntry | null {
  return OPCODES[opcode] ?? null;
}
