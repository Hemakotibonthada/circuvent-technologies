/**
 * Verifies src/qrcode.ts against ISO/IEC 18004 without trusting the encoder.
 *
 * Three independent checks:
 *   1. Reed-Solomon syndromes of every block evaluate to zero.
 *   2. Structural invariants (size, finders, timing, dark module, quiet-zone
 *      separators) hold.
 *   3. A from-scratch decoder reads the matrix back to the original string —
 *      this exercises format-info BCH, mask selection, zigzag placement and
 *      block interleaving, which unit-testing the encoder alone cannot.
 *
 * Run: node scripts/check-qr.js
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "qrcheck-"));

try {
  // Invoke the local tsc through node directly — spawning `npx.cmd` fails with
  // EINVAL on Windows unless a shell is used, and a shell brings quoting risk.
  execFileSync(process.execPath, [
    path.join(root, "node_modules", "typescript", "bin", "tsc"),
    path.join(root, "src", "qrcode.ts"),
    "--outDir",
    outDir,
    "--module",
    "commonjs",
    "--target",
    "es2020",
    "--skipLibCheck",
  ], { stdio: "pipe" });
} catch (e) {
  console.error("failed to compile src/qrcode.ts:\n" + (e.stdout || e.message));
  process.exit(1);
}

const { qrMatrix, qrModuleCount, __qrInternals } = require(path.join(outDir, "qrcode.js"));
const { utf8Bytes, pickVersion, buildDataCodewords, rsEncode, BLOCKS, ALIGN, MASKS } = __qrInternals;

/* ------------------------------------------------------- GF(256) again --- */
// Reimplemented here on purpose: reusing the encoder's tables would make the
// syndrome check circular.
const EXP = new Array(512);
const LOG = new Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

let failures = 0;
const fail = (msg) => {
  console.error("  ✗ " + msg);
  failures++;
};

/* -------------------------------------------------- 1. syndrome check ---- */

function checkSyndromes(text, ecc) {
  const bytes = utf8Bytes(text);
  const version = pickVersion(bytes.length, ecc);
  const words = buildDataCodewords(bytes, version, ecc);
  const [eccPer, g1, d1, g2, d2] = BLOCKS[ecc][version];

  let offset = 0;
  const blocks = [];
  for (let i = 0; i < g1; i++) blocks.push(words.slice(offset, (offset += d1)));
  for (let i = 0; i < g2; i++) blocks.push(words.slice(offset, (offset += d2)));

  blocks.forEach((block, bi) => {
    const parity = rsEncode(block, eccPer);
    const code = block.concat(parity);
    // A valid RS codeword evaluates to zero at alpha^0 .. alpha^(eccPer-1).
    for (let k = 0; k < eccPer; k++) {
      let sum = 0;
      for (let i = 0; i < code.length; i++) {
        // Horner in GF(256), highest-order coefficient first.
        sum = mul(sum, EXP[k]) ^ code[i];
      }
      if (sum !== 0) fail(`RS syndrome ${k} non-zero for block ${bi} (v${version}-${ecc}, "${text.slice(0, 24)}")`);
    }
  });
}

/* ------------------------------------------------- 2. structure check ---- */

function checkStructure(text, ecc) {
  const m = qrMatrix(text, ecc);
  const size = m.length;
  const version = pickVersion(utf8Bytes(text).length, ecc);

  if (size !== 17 + version * 4) fail(`size ${size} != expected ${17 + version * 4}`);
  if (qrModuleCount(text, ecc) !== size) fail("qrModuleCount disagrees with matrix size");
  if (m.some((row) => row.length !== size)) fail("matrix is not square");

  const finderAt = (r0, c0) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const ring = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        if (m[r0 + r][c0 + c] !== (ring || core)) return false;
      }
    }
    return true;
  };
  if (!finderAt(0, 0)) fail("top-left finder malformed");
  if (!finderAt(0, size - 7)) fail("top-right finder malformed");
  if (!finderAt(size - 7, 0)) fail("bottom-left finder malformed");

  // Separators must be light all the way around each finder.
  for (let i = 0; i < 8; i++) {
    if (m[7][i] || m[i][7]) fail("top-left separator not light");
    if (m[7][size - 1 - i] || m[i][size - 8]) fail("top-right separator not light");
    if (m[size - 8][i] || m[size - 1 - i][7]) fail("bottom-left separator not light");
  }

  for (let i = 8; i < size - 8; i++) {
    if (m[6][i] !== (i % 2 === 0)) fail(`horizontal timing wrong at ${i}`);
    if (m[i][6] !== (i % 2 === 0)) fail(`vertical timing wrong at ${i}`);
  }

  if (!m[size - 8][8]) fail("dark module not set");

  for (const r of ALIGN[version]) {
    for (const c of ALIGN[version]) {
      const nearFinder = (r < 9 && c < 9) || (r < 9 && c > size - 10) || (r > size - 10 && c < 9);
      if (nearFinder) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          if (m[r + dr][c + dc] !== (Math.max(Math.abs(dr), Math.abs(dc)) !== 1)) {
            fail(`alignment pattern at (${r},${c}) malformed`);
            return;
          }
        }
      }
    }
  }
}

/* ---------------------------------------------------- 3. round-trip ------ */

const ECC_BITS = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };

/** Independent decoder: format info -> unmask -> read -> de-interleave -> bytes. */
function decode(m) {
  const size = m.length;
  const version = (size - 17) / 4;

  // Read the 15 format bits from the copy around the top-left finder.
  let raw = 0;
  const read = (r, c) => (m[r][c] ? 1 : 0);
  for (let i = 0; i <= 5; i++) raw |= read(8, i) << i;
  raw |= read(8, 7) << 6;
  raw |= read(8, 8) << 7;
  raw |= read(7, 8) << 8;
  for (let i = 9; i <= 14; i++) raw |= read(14 - i, 8) << i;

  const bits = raw ^ 0x5412;
  // Brute-force the 5 data bits and pick the one whose BCH matches exactly;
  // this validates the encoder's BCH rather than assuming it.
  let found = null;
  for (let d = 0; d < 32; d++) {
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    if (((d << 10) | rem) === bits) found = d;
  }
  if (found === null) throw new Error("format information failed BCH validation");
  const mask = found & 0b111;
  const eccBits = (found >> 3) & 0b11;
  const ecc = Object.keys(ECC_BITS).find((k) => ECC_BITS[k] === eccBits);

  // Rebuild the reserved map exactly as the spec defines it.
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
  const markFinder = (r0, c0) => {
    for (let r = -1; r <= 7; r++)
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr >= 0 && rr < size && cc >= 0 && cc < size) reserved[rr][cc] = true;
      }
  };
  markFinder(0, 0);
  markFinder(0, size - 7);
  markFinder(size - 7, 0);
  for (const r of ALIGN[version])
    for (const c of ALIGN[version]) {
      if (reserved[r][c]) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) reserved[r + dr][c + dc] = true;
    }
  for (let i = 8; i < size - 8; i++) {
    reserved[6][i] = true;
    reserved[i][6] = true;
  }
  for (let i = 0; i < 9; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }
  if (version >= 7)
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 3; j++) {
        reserved[i][size - 11 + j] = true;
        reserved[size - 11 + j][i] = true;
      }
  reserved[size - 8][8] = true;

  const maskFn = MASKS[mask];
  const bitsOut = [];
  let row = size - 1;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (;;) {
      for (let j = 0; j < 2; j++) {
        const cc = col - j;
        if (!reserved[row][cc]) {
          const v = m[row][cc] !== maskFn(row, cc);
          bitsOut.push(v ? 1 : 0);
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

  const stream = [];
  for (let i = 0; i + 8 <= bitsOut.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bitsOut[i + j];
    stream.push(b);
  }

  // Undo the interleave to recover the data codewords in block order.
  const [eccPer, g1, d1, g2, d2] = BLOCKS[ecc][version];
  const lengths = [];
  for (let i = 0; i < g1; i++) lengths.push(d1);
  for (let i = 0; i < g2; i++) lengths.push(d2);
  const blocks = lengths.map(() => []);
  let idx = 0;
  const maxData = Math.max(d1, d2 || 0);
  for (let i = 0; i < maxData; i++) {
    for (let b = 0; b < blocks.length; b++) {
      if (i < lengths[b]) blocks[b].push(stream[idx++]);
    }
  }
  const data = [].concat(...blocks);

  // Byte mode: 4-bit mode indicator, then the character count.
  const mode = data[0] >> 4;
  if (mode !== 0b0100) throw new Error(`unexpected mode indicator ${mode.toString(2)}`);
  const countBits = version < 10 ? 8 : 16;

  const flat = [];
  for (const b of data) for (let i = 7; i >= 0; i--) flat.push((b >> i) & 1);
  let p = 4;
  let length = 0;
  for (let i = 0; i < countBits; i++) length = (length << 1) | flat[p++];

  const out = [];
  for (let i = 0; i < length; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | flat[p++];
    out.push(b);
  }
  return Buffer.from(out).toString("utf8");
}

/* ---------------------------------------------------------------- run --- */

const CASES = [
  "circuvent://gate?code=7K4M9XQ2",
  "circuvent://gate?code=ABCD2345",
  "A",
  "https://circuvent.in/g/9F3K2M7Q4X8Z",
  "The quick brown fox jumps over the lazy dog 0123456789",
  "circuvent://gate?code=X9M2K7Q4&label=" + encodeURIComponent("Plumber — Tue"),
  "x".repeat(120),
];

console.log("checking QR encoder (src/qrcode.ts)\n");
for (const ecc of ["L", "M", "Q", "H"]) {
  for (const text of CASES) {
    const bytes = utf8Bytes(text).length;
    let version;
    try {
      version = pickVersion(bytes, ecc);
    } catch {
      continue; // legitimately too long for this level; not a failure
    }
    checkSyndromes(text, ecc);
    checkStructure(text, ecc);
    try {
      const back = decode(qrMatrix(text, ecc));
      if (back !== text) fail(`round-trip mismatch at v${version}-${ecc}: got "${back}" want "${text}"`);
    } catch (e) {
      fail(`round-trip threw at v${version}-${ecc}: ${e.message}`);
    }
  }
}

// The encoder must refuse rather than truncate when the payload cannot fit.
try {
  qrMatrix("y".repeat(400), "H");
  fail("oversized payload did not throw");
} catch (e) {
  if (!/too long/i.test(e.message)) fail(`oversized payload threw the wrong error: ${e.message}`);
}

fs.rmSync(outDir, { recursive: true, force: true });

if (failures) {
  console.error(`\n${failures} QR check(s) failed`);
  process.exit(1);
}
console.log(`✓ QR encoder verified: syndromes, structure and round-trip decode across ${CASES.length} payloads x 4 ECC levels`);
