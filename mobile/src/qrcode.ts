/**
 * QR Code encoder (ISO/IEC 18004), byte mode, versions 1-10.
 *
 * The app has no QR-generation dependency and adding one would mean a native
 * rebuild we cannot test here, so this is self-contained. It is deliberately
 * scoped to what guest passes need — a short `circuvent://gate?code=...` URL —
 * which fits comfortably inside version 10 at any error-correction level.
 *
 * Note the sibling `qr.ts` is the *parser* for scanned setup labels; this file
 * is the generator. They share nothing.
 *
 * Output is a boolean matrix (`true` = dark). Rendering is the caller's job so
 * this file stays free of React and can be checked in plain Node.
 */

export type EccLevel = "L" | "M" | "Q" | "H";

/**
 * Block structure per version and ECC level:
 * [eccPerBlock, group1Blocks, group1DataWords, group2Blocks, group2DataWords].
 * Group 2 blocks hold exactly one more data codeword than group 1.
 */
const BLOCKS: Record<EccLevel, number[][]> = {
  L: [
    [],
    [7, 1, 19, 0, 0],
    [10, 1, 34, 0, 0],
    [15, 1, 55, 0, 0],
    [20, 1, 80, 0, 0],
    [26, 1, 108, 0, 0],
    [18, 2, 68, 0, 0],
    [20, 2, 78, 0, 0],
    [24, 2, 97, 0, 0],
    [30, 2, 116, 0, 0],
    [18, 2, 68, 2, 69],
  ],
  M: [
    [],
    [10, 1, 16, 0, 0],
    [16, 1, 28, 0, 0],
    [26, 1, 44, 0, 0],
    [18, 2, 32, 0, 0],
    [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0],
    [18, 4, 31, 0, 0],
    [22, 2, 38, 2, 39],
    [22, 3, 36, 2, 37],
    [26, 4, 43, 1, 44],
  ],
  Q: [
    [],
    [13, 1, 13, 0, 0],
    [22, 1, 22, 0, 0],
    [18, 2, 17, 0, 0],
    [26, 2, 24, 0, 0],
    [18, 2, 15, 2, 16],
    [24, 4, 19, 0, 0],
    [18, 2, 14, 4, 15],
    [22, 4, 18, 2, 19],
    [20, 4, 16, 4, 17],
    [24, 6, 19, 2, 20],
  ],
  H: [
    [],
    [17, 1, 9, 0, 0],
    [28, 1, 16, 0, 0],
    [22, 2, 13, 0, 0],
    [16, 4, 9, 0, 0],
    [22, 2, 11, 2, 12],
    [28, 4, 15, 0, 0],
    [26, 4, 13, 1, 14],
    [26, 4, 14, 2, 15],
    [24, 4, 12, 4, 13],
    [28, 6, 15, 2, 16],
  ],
};

/** Alignment-pattern centre coordinates per version. */
const ALIGN: number[][] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

/** Two-bit ECC level indicator used in the format information. */
const ECC_BITS: Record<EccLevel, number> = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };

/* ---------------------------------------------------------- GF(256) ------ */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    // Multiply by 2 in GF(256) with primitive polynomial 0x11D.
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** Generator polynomial for `degree` error-correction codewords, highest-order coefficient first. */
function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    // Multiply by (x + alpha^i). Index j holds the coefficient of x^(len-1-j),
    // so the x term keeps index j while the constant term shifts to j+1.
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** Reed-Solomon remainder of `data` for `degree` check codewords. */
function rsEncode(data: number[], degree: number): number[] {
  const gen = rsGenerator(degree);
  const rem = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.shift();
    rem.push(0);
    for (let i = 0; i < degree; i++) rem[i] ^= gfMul(gen[i + 1], factor);
  }
  return rem;
}

/* ------------------------------------------------------------ encoding --- */

/**
 * UTF-8 encode without relying on `TextEncoder`, which is not guaranteed on
 * every Hermes build this app ships to.
 */
function utf8Bytes(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    // Combine surrogate pairs so astral characters encode as one code point.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = ((code - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
        i++;
      }
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return out;
}

function dataCapacity(version: number, ecc: EccLevel): number {
  const [, g1, d1, g2, d2] = BLOCKS[ecc][version];
  return g1 * d1 + g2 * d2;
}

/** Smallest version that fits `byteLen` bytes in byte mode. */
function pickVersion(byteLen: number, ecc: EccLevel): number {
  for (let v = 1; v <= 10; v++) {
    // Mode indicator (4) + character count (8 for v1-9, 16 for v10+).
    const headerBits = 4 + (v < 10 ? 8 : 16);
    if (dataCapacity(v, ecc) * 8 >= headerBits + byteLen * 8) return v;
  }
  throw new Error(`QR payload too long: ${byteLen} bytes exceeds version 10 at level ${ecc}`);
}

class BitBuffer {
  bits: number[] = [];
  put(value: number, length: number) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >> i) & 1);
  }
}

/** Mode indicator, length, payload, terminator, pad bytes → data codewords. */
function buildDataCodewords(bytes: number[], version: number, ecc: EccLevel): number[] {
  const capacity = dataCapacity(version, ecc);
  const buf = new BitBuffer();
  buf.put(0b0100, 4);
  buf.put(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) buf.put(b, 8);

  const totalBits = capacity * 8;
  // Terminator is up to four zero bits, truncated when the buffer is nearly full.
  buf.put(0, Math.min(4, totalBits - buf.bits.length));
  while (buf.bits.length % 8 !== 0) buf.bits.push(0);

  const words: number[] = [];
  for (let i = 0; i < buf.bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | buf.bits[i + j];
    words.push(byte);
  }
  const PAD = [0xec, 0x11];
  for (let i = 0; words.length < capacity; i++) words.push(PAD[i % 2]);
  return words;
}

/** Split into blocks, add RS parity, then interleave as the spec requires. */
function interleave(dataWords: number[], version: number, ecc: EccLevel): number[] {
  const [eccPer, g1, d1, g2, d2] = BLOCKS[ecc][version];
  const dataBlocks: number[][] = [];
  const eccBlocks: number[][] = [];
  let offset = 0;
  for (let i = 0; i < g1; i++) {
    const block = dataWords.slice(offset, offset + d1);
    offset += d1;
    dataBlocks.push(block);
    eccBlocks.push(rsEncode(block, eccPer));
  }
  for (let i = 0; i < g2; i++) {
    const block = dataWords.slice(offset, offset + d2);
    offset += d2;
    dataBlocks.push(block);
    eccBlocks.push(rsEncode(block, eccPer));
  }

  const out: number[] = [];
  const maxData = Math.max(d1, d2);
  for (let i = 0; i < maxData; i++) {
    for (const block of dataBlocks) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < eccPer; i++) {
    for (const block of eccBlocks) out.push(block[i]);
  }
  return out;
}

/* ------------------------------------------------------------- matrix ---- */

type Grid = boolean[][];

function blank(size: number): Grid {
  return Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
}

function placeFinder(m: Grid, reserved: Grid, row: number, col: number) {
  // 7x7 finder plus a one-module separator on every side that lies in-grid.
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || rr >= m.length || cc < 0 || cc >= m.length) continue;
      const onRing = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6);
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      m[rr][cc] = onRing || inCore;
      reserved[rr][cc] = true;
    }
  }
}

function placeAlignment(m: Grid, reserved: Grid, version: number) {
  const centres = ALIGN[version];
  for (const r of centres) {
    for (const c of centres) {
      // Alignment patterns are omitted where they would collide with a finder.
      if (reserved[r][c]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          m[r + dr][c + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          reserved[r + dr][c + dc] = true;
        }
      }
    }
  }
}

function placeTiming(m: Grid, reserved: Grid) {
  const size = m.length;
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    m[6][i] = dark;
    reserved[6][i] = true;
    m[i][6] = dark;
    reserved[i][6] = true;
  }
}

function reserveFormatAreas(reserved: Grid, version: number) {
  const size = reserved.length;
  for (let i = 0; i < 9; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        reserved[i][size - 11 + j] = true;
        reserved[size - 11 + j][i] = true;
      }
    }
  }
}

/** BCH(18,6) version information, placed near the top-right and bottom-left. */
function placeVersionInfo(m: Grid, version: number) {
  if (version < 7) return;
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (version << 12) | rem;
  const size = m.length;
  for (let i = 0; i < 18; i++) {
    const bit = ((bits >> i) & 1) === 1;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    m[b][a] = bit;
    m[a][b] = bit;
  }
}

/** BCH(15,5) format information, written twice for redundancy. */
function placeFormatInfo(m: Grid, ecc: EccLevel, mask: number) {
  const data = (ECC_BITS[ecc] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const size = m.length;
  const bit = (i: number) => ((bits >> i) & 1) === 1;

  for (let i = 0; i <= 5; i++) m[8][i] = bit(i);
  m[8][7] = bit(6);
  m[8][8] = bit(7);
  m[7][8] = bit(8);
  for (let i = 9; i <= 14; i++) m[14 - i][8] = bit(i);

  for (let i = 0; i <= 7; i++) m[size - 1 - i][8] = bit(i);
  for (let i = 8; i <= 14; i++) m[8][size - 15 + i] = bit(i);

  // The dark module is always set; it is not part of the format data.
  m[size - 8][8] = true;
}

function placeData(m: Grid, reserved: Grid, words: number[]) {
  const size = m.length;
  const bits: boolean[] = [];
  for (const w of words) for (let i = 7; i >= 0; i--) bits.push(((w >> i) & 1) === 1);

  let index = 0;
  let row = size - 1;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    // Column 6 is the vertical timing pattern and is never a data column.
    if (col === 6) col--;
    for (;;) {
      for (let j = 0; j < 2; j++) {
        const cc = col - j;
        if (!reserved[row][cc]) {
          m[row][cc] = index < bits.length ? bits[index] : false;
          index++;
        }
      }
      row += upward ? -1 : 1;
      if (row < 0 || row >= size) {
        row -= upward ? -1 : 1;
        upward = !upward;
        break;
      }
    }
  }
}

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** The four penalty rules from the spec; lower is better. */
function penalty(m: Grid): number {
  const size = m.length;
  let score = 0;

  const runScore = (get: (i: number, j: number) => boolean) => {
    let total = 0;
    for (let i = 0; i < size; i++) {
      let run = 1;
      for (let j = 1; j < size; j++) {
        if (get(i, j) === get(i, j - 1)) run++;
        else {
          if (run >= 5) total += 3 + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) total += 3 + (run - 5);
    }
    return total;
  };
  score += runScore((i, j) => m[i][j]);
  score += runScore((i, j) => m[j][i]);

  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
  }

  // Finder-like 1:1:3:1:1 sequences flanked by four light modules.
  const A = [true, false, true, true, true, false, true, false, false, false, false];
  const B = [false, false, false, false, true, false, true, true, true, false, true];
  const matches = (get: (k: number) => boolean, start: number, pat: boolean[]) => {
    for (let k = 0; k < pat.length; k++) if (get(start + k) !== pat[k]) return false;
    return true;
  };
  for (let i = 0; i < size; i++) {
    for (let j = 0; j + 11 <= size; j++) {
      if (matches((k) => m[i][k], j, A) || matches((k) => m[i][k], j, B)) score += 40;
      if (matches((k) => m[k][i], j, A) || matches((k) => m[k][i], j, B)) score += 40;
    }
  }

  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (m[r][c]) dark++;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

/**
 * Encode `text` as a QR matrix. `true` means a dark module.
 *
 * Throws when the payload exceeds version 10 at the requested level rather than
 * silently truncating — a truncated symbol scans cleanly to the wrong value,
 * which is far worse than a visible failure.
 */
export function qrMatrix(text: string, ecc: EccLevel = "M"): boolean[][] {
  const bytes = utf8Bytes(text);
  const version = pickVersion(bytes.length, ecc);
  const size = 17 + version * 4;

  const words = interleave(buildDataCodewords(bytes, version, ecc), version, ecc);

  const base = blank(size);
  const reserved = blank(size);
  placeFinder(base, reserved, 0, 0);
  placeFinder(base, reserved, 0, size - 7);
  placeFinder(base, reserved, size - 7, 0);
  placeAlignment(base, reserved, version);
  placeTiming(base, reserved);
  reserveFormatAreas(reserved, version);
  reserved[size - 8][8] = true;
  placeVersionInfo(base, version);
  placeData(base, reserved, words);

  let best: Grid | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = base.map((row) => row.slice());
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!reserved[r][c] && MASKS[mask](r, c)) candidate[r][c] = !candidate[r][c];
      }
    }
    placeFormatInfo(candidate, ecc, mask);
    const score = penalty(candidate);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best!;
}

/** Module count along one edge; useful for sizing a container before encoding. */
export function qrModuleCount(text: string, ecc: EccLevel = "M"): number {
  return 17 + pickVersion(utf8Bytes(text).length, ecc) * 4;
}

/* ------------------------------------------------------------- testing --- */

/**
 * Internals exposed purely so `scripts/check-qr.js` can verify the encoder
 * against the spec (Reed-Solomon syndromes, structural invariants, round-trip
 * decode). Not part of the app-facing surface.
 */
export const __qrInternals = { utf8Bytes, pickVersion, buildDataCodewords, interleave, rsEncode, BLOCKS, ALIGN, MASKS };
