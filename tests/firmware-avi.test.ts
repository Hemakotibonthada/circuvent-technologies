/**
 * The camera firmware's AVI writer, checked without an ESP32.
 *
 * WHY THIS TEST EXISTS AT ALL
 *
 * `aviClose()` patches seven fields by byte offset in a file already on the
 * card. Every one of those offsets is a magic number, and getting one wrong
 * produces a clip that still opens, still shows pictures, and is wrong in a
 * way nobody notices until they need it — a duration of zero, a seek bar that
 * does nothing, or playback at four times real speed. A compiler cannot catch
 * that. Neither can a person reading the file, because the numbers look
 * plausible either way.
 *
 * So the offsets are derived here a second time, from the AVI structure
 * itself, and compared against the constants the firmware actually uses. The
 * derivation walks the layout field by field rather than restating the answer,
 * so a wrong constant fails and a correct one cannot be made to pass by
 * copying it across.
 *
 * The second half writes a clip with a faithful port of the writer and reads
 * it back with a parser that knows nothing about how it was made — index
 * entries have to resolve to real chunk headers, and the sizes have to agree
 * with the file that exists rather than the one intended.
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  AviClip,
  applyPatches,
  base64ToBytes,
  bytesToBase64,
  clipFileName,
  jpegSize,
  AVI_HEADER_BYTES,
  AVI_MOVI_FOURCC,
  AVI_OFF,
} from "@/lib/avi";

const SRC = readFileSync(join(process.cwd(), "firmware", "camera", "camera.ino"), "utf8");

/** Reads a `#define NAME value` out of the firmware. */
function define(name: string): number {
  const m = SRC.match(new RegExp(`^#define\\s+${name}\\s+(\\d+)`, "m"));
  if (!m) throw new Error(`firmware has no #define ${name}`);
  return Number(m[1]);
}

// ---------------------------------------------------------------------------
// The layout, derived rather than restated
// ---------------------------------------------------------------------------
/**
 * Walks the AVI header the way a parser does: each chunk is an 8-byte header
 * followed by its payload, each LIST spends 4 more bytes naming itself, and
 * every field inside a struct advances the cursor by its own width. Nothing
 * below is a number copied from the firmware.
 */
function deriveLayout() {
  const at: Record<string, number> = {};
  let p = 0;
  const tag = () => { p += 4; };
  const dword = (k?: string) => { if (k) at[k] = p; p += 4; };
  const word = (k?: string) => { if (k) at[k] = p; p += 2; };

  tag();                       // "RIFF"
  dword("riffSize");
  tag();                       // "AVI "

  tag();                       // "LIST"
  dword("hdrlSize");
  tag();                       // "hdrl"

  tag();                       // "avih"
  dword();                     // avih chunk size
  dword("microSecPerFrame");
  dword("maxBytesPerSec");
  dword();                     // dwPaddingGranularity
  dword();                     // dwFlags
  dword("totalFrames");
  dword();                     // dwInitialFrames
  dword();                     // dwStreams
  dword("suggestedBufferSize");
  dword();                     // dwWidth
  dword();                     // dwHeight
  p += 16;                     // dwReserved[4]

  tag();                       // "LIST"
  dword("strlSize");
  tag();                       // "strl"

  tag();                       // "strh"
  dword();                     // strh chunk size
  tag();                       // fccType "vids"
  tag();                       // fccHandler "MJPG"
  dword();                     // dwFlags
  word();                      // wPriority
  word();                      // wLanguage
  dword();                     // dwInitialFrames
  dword();                     // dwScale
  dword("rate");
  dword();                     // dwStart
  dword("length");
  dword("streamSuggestedBufferSize");
  dword();                     // dwQuality
  dword();                     // dwSampleSize
  p += 8;                      // rcFrame

  tag();                       // "strf"
  dword();                     // strf chunk size
  p += 40;                     // BITMAPINFOHEADER

  tag();                       // "LIST"
  dword("moviSize");
  at.moviFourcc = p;
  tag();                       // "movi"
  at.firstChunk = p;
  return at;
}

const L = deriveLayout();

describe("AVI header layout matches the firmware's constants", () => {
  it("puts the first frame exactly where AVI_HDR_BYTES says the header ends", () => {
    expect(L.firstChunk).toBe(define("AVI_HDR_BYTES"));
  });

  it.each([
    ["AVI_OFF_RIFFSZ", "riffSize"],
    ["AVI_OFF_USPF", "microSecPerFrame"],
    ["AVI_OFF_MAXBPS", "maxBytesPerSec"],
    ["AVI_OFF_TOTFRM", "totalFrames"],
    ["AVI_OFF_SUGBUF", "suggestedBufferSize"],
    ["AVI_OFF_RATE", "rate"],
    ["AVI_OFF_LENGTH", "length"],
    ["AVI_OFF_STRBUF", "streamSuggestedBufferSize"],
    ["AVI_OFF_MOVISZ", "moviSize"],
    ["AVI_MOVI_FOURCC", "moviFourcc"],
  ])("%s points at the right field", (constant, field) => {
    expect(define(constant)).toBe(L[field]);
  });

  it("writes hdrl and strl sizes that agree with where the lists actually end", () => {
    // A LIST's size counts its own fourcc plus everything inside it. These are
    // the two constants a hand-written header most often gets wrong, and a
    // wrong one sends a parser looking for 'movi' in the middle of strf.
    const hdrlStart = L.hdrlSize + 4;                 // the "hdrl" fourcc
    const moviListStart = L.moviSize - 4;             // the "LIST" tag of movi
    expect(SRC).toMatch(/put32\(h \+ 16, 192\)/);
    expect(moviListStart - hdrlStart).toBe(192);

    const strlStart = L.strlSize + 4;                 // the "strl" fourcc
    expect(SRC).toMatch(/put32\(h \+ 92, 116\)/);
    expect(moviListStart - strlStart).toBe(116);
  });

  it("keeps every header write inside the header", () => {
    const writes = [...SRC.matchAll(/put(32|16)\(h \+ (\d+),/g)];
    expect(writes.length).toBeGreaterThan(15);
    const hdrBytes = define("AVI_HDR_BYTES");
    for (const w of writes) {
      const width = w[1] === "32" ? 4 : 2;
      expect(Number(w[2]) + width).toBeLessThanOrEqual(hdrBytes);
    }
  });

  it("declares AVIF_HASINDEX, because the index is the point", () => {
    // Without this flag set in dwFlags, players ignore idx1 and fall back to
    // scanning — which is the behaviour the index exists to avoid.
    expect(SRC).toMatch(/put32\(h \+ 44, 0x10\);\s*\/\/ AVIF_HASINDEX/);
  });

  it("is the same layout the browser and the phone write", () => {
    // Three independent implementations of one byte layout — firmware, web,
    // mobile — is three chances to drift. The TypeScript one is shared between
    // web and mobile (guarded by mobile/scripts/check-avi-sync.js); this ties
    // it to the firmware's constants as well, so all three move together.
    expect(AVI_HEADER_BYTES).toBe(define("AVI_HDR_BYTES"));
    expect(AVI_MOVI_FOURCC).toBe(define("AVI_MOVI_FOURCC"));
    expect(AVI_OFF.riffSize).toBe(define("AVI_OFF_RIFFSZ"));
    expect(AVI_OFF.microSecPerFrame).toBe(define("AVI_OFF_USPF"));
    expect(AVI_OFF.maxBytesPerSec).toBe(define("AVI_OFF_MAXBPS"));
    expect(AVI_OFF.totalFrames).toBe(define("AVI_OFF_TOTFRM"));
    expect(AVI_OFF.suggestedBufferSize).toBe(define("AVI_OFF_SUGBUF"));
    expect(AVI_OFF.rate).toBe(define("AVI_OFF_RATE"));
    expect(AVI_OFF.length).toBe(define("AVI_OFF_LENGTH"));
    expect(AVI_OFF.streamSuggestedBufferSize).toBe(define("AVI_OFF_STRBUF"));
    expect(AVI_OFF.moviSize).toBe(define("AVI_OFF_MOVISZ"));
  });
});

// ---------------------------------------------------------------------------
// A clip, written and then read back by something that does not trust it
// ---------------------------------------------------------------------------

/**
 * Builds a clip with the real writer the browser and the phone both use.
 *
 * Deliberately the shipped AviClip and not a copy of it. A test that re-
 * implements the thing it is testing only proves the author can write the
 * same bug twice; this way the offsets checked above against the firmware are
 * checked against the code that actually runs, and the two can never drift
 * apart without a failure here.
 */
function writeClip(frames: Buffer[], w: number, h: number, fps: number): Buffer {
  const clip = new AviClip(w, h, fps);
  const parts: Buffer[] = [Buffer.from(clip.header())];
  for (const f of frames) {
    const { chunkHeader, pad } = clip.addFrame(f.length);
    parts.push(Buffer.from(chunkHeader), f);
    if (pad) parts.push(Buffer.alloc(pad));
  }
  parts.push(Buffer.from(clip.indexBlock()));
  const out = Buffer.concat(parts);
  // One second per frame, so the measured rate lands exactly on `fps` and the
  // assertions below can be about the layout rather than about rounding.
  const bytes = new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
  applyPatches(bytes, clip.finish((frames.length / fps) * 1000));
  return out;
}

/** An AVI reader that assumes nothing and checks everything it walks. */
function parseAvi(buf: Buffer) {
  if (buf.toString("ascii", 0, 4) !== "RIFF") throw new Error("not a RIFF file");
  if (buf.readUInt32LE(4) !== buf.length - 8) throw new Error("RIFF size disagrees with the file");
  if (buf.toString("ascii", 8, 12) !== "AVI ") throw new Error("not an AVI");

  const hdrl = buf.readUInt32LE(16);
  const moviListAt = 12 + 8 + hdrl;
  if (buf.toString("ascii", moviListAt, moviListAt + 4) !== "LIST") throw new Error("hdrl size does not land on movi");
  const moviSize = buf.readUInt32LE(moviListAt + 4);
  const moviFourcc = moviListAt + 8;
  if (buf.toString("ascii", moviFourcc, moviFourcc + 4) !== "movi") throw new Error("no movi list");

  // Walk movi forward, exactly as a player without an index would.
  const walked: { off: number; size: number }[] = [];
  let p = moviFourcc + 4;
  const moviEnd = moviFourcc + moviSize;
  while (p + 8 <= moviEnd) {
    const id = buf.toString("ascii", p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id !== "00dc") throw new Error(`unexpected chunk ${id} in movi`);
    walked.push({ off: p - moviFourcc, size });
    p += 8 + size + (size & 1);
  }
  if (p !== moviEnd) throw new Error("movi size does not land on a chunk boundary");

  if (buf.toString("ascii", moviEnd, moviEnd + 4) !== "idx1") throw new Error("no idx1 after movi");
  const idxBytes = buf.readUInt32LE(moviEnd + 4);
  const indexed: { off: number; size: number; key: boolean }[] = [];
  for (let i = 0; i < idxBytes; i += 16) {
    const b = moviEnd + 8 + i;
    indexed.push({
      off: buf.readUInt32LE(b + 8),
      size: buf.readUInt32LE(b + 12),
      key: (buf.readUInt32LE(b + 4) & 0x10) !== 0,
    });
  }

  return {
    walked,
    indexed,
    moviFourcc,
    declaredFrames: buf.readUInt32LE(48),
    streamLength: buf.readUInt32LE(140),
    rate: buf.readUInt32LE(132),
    microSecPerFrame: buf.readUInt32LE(32),
    hasIndexFlag: (buf.readUInt32LE(44) & 0x10) !== 0,
    width: buf.readUInt32LE(64),
    height: buf.readUInt32LE(68),
    suggestedBuffer: buf.readUInt32LE(60),
  };
}

/** A JPEG-shaped payload. Length matters here; content does not. */
const jpeg = (n: number) => {
  const b = Buffer.alloc(n, 0x5a);
  b[0] = 0xff; b[1] = 0xd8;                 // SOI
  b[n - 2] = 0xff; b[n - 1] = 0xd9;         // EOI
  return b;
};

describe("a written clip survives being read by a stranger", () => {
  // Deliberately mixed parities: odd lengths are what the pad byte exists for,
  // and an off-by-one there shifts every later chunk without failing loudly.
  const frames = [jpeg(2001), jpeg(1500), jpeg(999), jpeg(3210), jpeg(777)];
  const clip = writeClip(frames, 640, 480, 10);
  const avi = parseAvi(clip);

  it("holds every frame, byte for byte", () => {
    expect(avi.walked).toHaveLength(frames.length);
    avi.walked.forEach((c, i) => {
      expect(c.size).toBe(frames[i].length);
      const start = avi.moviFourcc + c.off + 8;
      expect(clip.subarray(start, start + c.size).equals(frames[i])).toBe(true);
    });
  });

  it("has an index whose offsets resolve to the same chunks the walk found", () => {
    expect(avi.indexed).toHaveLength(frames.length);
    avi.indexed.forEach((e, i) => {
      expect(e.off).toBe(avi.walked[i].off);
      expect(e.size).toBe(avi.walked[i].size);
      expect(e.key).toBe(true);
      // The offset must name a real chunk header, which is the thing a player
      // actually does with it when you drag the seek bar.
      expect(clip.toString("ascii", avi.moviFourcc + e.off, avi.moviFourcc + e.off + 4)).toBe("00dc");
    });
  });

  it("reports a duration and a frame count instead of zero", () => {
    expect(avi.hasIndexFlag).toBe(true);
    expect(avi.declaredFrames).toBe(frames.length);
    expect(avi.streamLength).toBe(frames.length);
    expect(avi.rate).toBe(10);
    expect(avi.microSecPerFrame).toBe(100000);
  });

  it("describes the picture it actually contains", () => {
    expect(avi.width).toBe(640);
    expect(avi.height).toBe(480);
    expect(avi.suggestedBuffer).toBe(3210);   // the largest frame, not a guess
  });

  it("survives a single-frame clip", () => {
    // The degenerate case: a card pulled one frame in. It still has to parse,
    // because this is exactly the clip someone will be trying to watch.
    const one = parseAvi(writeClip([jpeg(1234)], 320, 240, 5));
    expect(one.walked).toHaveLength(1);
    expect(one.indexed).toHaveLength(1);
    expect(one.declaredFrames).toBe(1);
  });

  it("refuses a clip whose pad byte was left out", () => {
    // Proves the parser above is actually strict, so the passes mean something.
    const broken = Buffer.from(clip);
    broken.writeUInt32LE(broken.readUInt32LE(L.moviSize) - 1, L.moviSize);
    expect(() => parseAvi(broken)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// The helpers the recorders lean on
// ---------------------------------------------------------------------------
describe("reading the picture size out of a JPEG", () => {
  /** A minimal JPEG: SOI, an APP0 to skip over, then SOF0 with the size. */
  const withSof = (w: number, h: number, marker = 0xc0) =>
    Buffer.from([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x10, ...Array(14).fill(0),     // APP0, skipped by length
      0xff, marker, 0x00, 0x11, 0x08,
      (h >> 8) & 0xff, h & 0xff,
      (w >> 8) & 0xff, w & 0xff,
      0x03, ...Array(9).fill(0),
    ]);

  it("finds the size past markers it has to skip", () => {
    expect(jpegSize(withSof(640, 480))).toEqual({ width: 640, height: 480 });
    expect(jpegSize(withSof(1600, 1200))).toEqual({ width: 1600, height: 1200 });
  });

  it("handles progressive and the other SOF variants", () => {
    // SOF2 is progressive. Matching only SOF0 would make those frames
    // unrecordable, and the recorder would sit dropping every frame while
    // reporting nothing wrong.
    expect(jpegSize(withSof(800, 600, 0xc2))).toEqual({ width: 800, height: 600 });
  });

  it("does not mistake a DHT for a frame header", () => {
    // 0xC4 sits in the SOF numeric range but is a Huffman table. Reading a
    // size out of it yields plausible nonsense, which is the worst outcome:
    // the clip records with wrong dimensions and no error anywhere.
    expect(jpegSize(withSof(640, 480, 0xc4))).toBeNull();
  });

  it("returns null rather than guessing", () => {
    expect(jpegSize(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    expect(jpegSize(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBeNull();
    expect(jpegSize(Buffer.alloc(0))).toBeNull();
  });
});

describe("base64 round-trips exactly", () => {
  it.each([0, 1, 2, 3, 255, 4096])("survives %i bytes", (n) => {
    const src = Buffer.alloc(n);
    for (let i = 0; i < n; i++) src[i] = (i * 37 + 11) & 0xff;
    const back = Buffer.from(base64ToBytes(bytesToBase64(src)));
    expect(back.equals(src)).toBe(true);
    // Agreeing with the platform's own encoder matters: frames arrive from the
    // relay already base64-encoded by something else.
    expect(bytesToBase64(src)).toBe(src.toString("base64"));
  });

  it("accepts a data: URL, because that is what the panels hold", () => {
    const bytes = base64ToBytes("data:image/jpeg;base64,/9j/4AAQ");
    expect(Buffer.from(bytes).toString("base64")).toBe("/9j/4AAQ");
  });
});

describe("clip filenames", () => {
  const at = new Date(2026, 7, 9, 7, 15, 30).getTime();

  it("sorts chronologically and stays safe on FAT, SAF and APFS", () => {
    expect(clipFileName("Front Door", at)).toBe("Front-Door-20260809-071530.avi");
    expect(clipFileName("kitchen/cam:2", at)).toBe("kitchen-cam-2-20260809-071530.avi");
  });

  it("never produces a name that is only punctuation", () => {
    // A device called "///" would otherwise yield "-20260809-071530.avi", and
    // a leading dash is an argument to half the tools someone might use on it.
    expect(clipFileName("///", at)).toBe("camera-20260809-071530.avi");
    expect(clipFileName("", at)).toBe("camera-20260809-071530.avi");
  });
});

// ---------------------------------------------------------------------------
// The clip-name guard on the LAN download route
// ---------------------------------------------------------------------------
/**
 * The handler builds a path by concatenating REC_DIR with whatever `?f=`
 * contained, so this check is the only thing between a browser and the rest of
 * the card — which holds the Wi-Fi credentials. Ported literally from
 * lanClipName() and isClipName().
 */
function clipNameAllowed(n: string): boolean {
  if (n.length < 5 || n.length > 48) return false;
  if (n.slice(-4).toLowerCase() !== ".avi") return false;
  for (const c of n) {
    const ok = (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") ||
               (c >= "0" && c <= "9") || c === "." || c === "_" || c === "-";
    if (!ok) return false;
  }
  return !n.includes("..");
}

describe("clip names cannot escape the clips folder", () => {
  it("accepts the names the firmware itself writes", () => {
    expect(clipNameAllowed("20260809-071530.avi")).toBe(true);
    expect(clipNameAllowed("up00000042.avi")).toBe(true);
    // The 8.3 fallback writes uppercase. Matching only ".avi" made those clips
    // record fine and then be invisible to the listing, undeletable and never
    // reclaimed — footage that quietly goes missing while the card fills.
    expect(clipNameAllowed("R0001234.AVI")).toBe(true);
  });

  it("uses the same case-insensitive rule everywhere it filters clips", () => {
    // Five call sites decide whether a directory entry is a clip: the listing,
    // the download, the delete, the reclaim scan and the clear-all. One of
    // them being stricter than the rest is how the leak above happens.
    const strict = [...SRC.matchAll(/endsWith\("\.avi"\)/g)];
    expect(strict).toHaveLength(0);
    expect([...SRC.matchAll(/isClipName\(/g)].length).toBeGreaterThanOrEqual(5);
  });

  it.each([
    "../../wpa_supplicant.avi",
    "..%2f..%2fsecrets.avi",
    "/etc/passwd.avi",
    "sub/dir/clip.avi",
    "clip.avi\u0000.txt",
    "cl ip.avi",
    "clip.txt",
    ".avi",
  ])("rejects %j", (bad) => {
    expect(clipNameAllowed(bad)).toBe(false);
  });

  it("is enforced before any path is built", () => {
    // The order is the whole protection: validating after opening the file
    // would be theatre. Assert the source still reads that way.
    const fn = SRC.slice(SRC.indexOf("static esp_err_t lanRecGet"), SRC.indexOf("static esp_err_t lanRecDelete"));
    expect(fn.indexOf("lanClipName")).toBeLessThan(fn.indexOf("SD_MMC.open"));
  });
});
