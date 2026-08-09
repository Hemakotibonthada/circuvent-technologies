/**
 * Writing AVI/MJPEG clips, shared by the browser recorder and the phone.
 *
 * WHY A VIDEO FILE AND NOT A FOLDER OF JPEGS
 *
 * Recording used to write each frame as its own timestamped .jpg. That kept
 * the evidence exact, which was the right instinct, but it produced something
 * nobody can watch: a folder of 3,000 files that no player will open, no phone
 * gallery will index, and no one can scrub through. "Exact but unwatchable" is
 * not a recording, it is an archive of a recording.
 *
 * AVI gets both. The frames arriving here are already JPEGs — from the MQTT
 * relay, the site's remote route, or the camera on the LAN — and AVI stores
 * them byte for byte with nothing re-encoded and nothing interpolated over a
 * dropped frame. It plays in VLC, ffmpeg, QuickTime, Windows and every NVR.
 * MediaRecorder cannot do this: it can only record a live element or canvas,
 * so a stalled stream becomes a stretched moment with no record that it
 * stalled.
 *
 * The timebase is written from measured elapsed time, not the requested frame
 * rate, so a clip that dropped frames plays back at the speed it was actually
 * captured. Getting that wrong is how footage ends up misrepresenting when
 * something happened, which is the one thing footage is for.
 *
 * THE INDEX IS NOT OPTIONAL
 *
 * idx1 costs 16 bytes a frame and is what most hand-rolled MJPEG writers leave
 * out. Without it players report no duration, refuse to seek, and often show a
 * zero-length clip that only plays forward — the classic "my ESP32 video is
 * broken" that is really a missing index.
 *
 * This file is byte-identical to mobile/src/avi.ts. Both are checked against
 * the firmware's own constants in tests/firmware-avi.test.ts, and kept in step
 * by mobile/scripts/check-avi-sync.js.
 */

/** Bytes before the first frame chunk. */
export const AVI_HEADER_BYTES = 224;
/** Position of the "movi" fourcc; index offsets are relative to it. */
export const AVI_MOVI_FOURCC = 220;

/** Fields patched once the clip is finished and its totals are known. */
export const AVI_OFF = {
  riffSize: 4,
  microSecPerFrame: 32,
  maxBytesPerSec: 36,
  totalFrames: 48,
  suggestedBufferSize: 60,
  rate: 132,
  length: 140,
  streamSuggestedBufferSize: 144,
  moviSize: 216,
} as const;

function u32(b: Uint8Array, at: number, v: number): void {
  b[at] = v & 0xff;
  b[at + 1] = (v >>> 8) & 0xff;
  b[at + 2] = (v >>> 16) & 0xff;
  b[at + 3] = (v >>> 24) & 0xff;
}
function u16(b: Uint8Array, at: number, v: number): void {
  b[at] = v & 0xff;
  b[at + 1] = (v >>> 8) & 0xff;
}
function tag(b: Uint8Array, at: number, s: string): void {
  for (let i = 0; i < 4; i++) b[at + i] = s.charCodeAt(i);
}

/**
 * The 224-byte header, with the totals left at zero.
 *
 * Layout, all little-endian:
 *    0  RIFF <fileSize-8> AVI
 *   12  LIST <192> hdrl
 *   24    avih <56> MainAVIHeader
 *   88    LIST <116> strl
 *  100      strh <56> AVIStreamHeader
 *  164      strf <40> BITMAPINFOHEADER
 *  212  LIST <moviSize> movi
 *  224    00dc <len> <jpeg> [pad to even] ...
 *   ..  idx1 <16*frames> entries
 */
export function aviHeader(width: number, height: number, fps: number): Uint8Array {
  const h = new Uint8Array(AVI_HEADER_BYTES);
  const rate = Math.max(1, Math.round(fps));
  tag(h, 0, "RIFF");
  tag(h, 8, "AVI ");
  tag(h, 12, "LIST");
  u32(h, 16, 192);
  tag(h, 20, "hdrl");
  tag(h, 24, "avih");
  u32(h, 28, 56);
  u32(h, AVI_OFF.microSecPerFrame, Math.round(1000000 / rate));
  u32(h, 44, 0x10); // AVIF_HASINDEX
  u32(h, 56, 1); // one stream
  u32(h, 64, width);
  u32(h, 68, height);
  tag(h, 88, "LIST");
  u32(h, 92, 116);
  tag(h, 96, "strl");
  tag(h, 100, "strh");
  u32(h, 104, 56);
  tag(h, 108, "vids");
  tag(h, 112, "MJPG");
  u32(h, 128, 1); // dwScale
  u32(h, AVI_OFF.rate, rate);
  u32(h, 148, 0xffffffff); // dwQuality: not set
  u16(h, 160, width); // rcFrame.right
  u16(h, 162, height); // rcFrame.bottom
  tag(h, 164, "strf");
  u32(h, 168, 40);
  u32(h, 172, 40); // biSize
  u32(h, 176, width);
  u32(h, 180, height);
  u16(h, 184, 1); // biPlanes
  u16(h, 186, 24); // biBitCount
  tag(h, 188, "MJPG"); // biCompression
  u32(h, 192, width * height * 3);
  tag(h, 212, "LIST");
  u32(h, AVI_OFF.moviSize, 4);
  tag(h, AVI_MOVI_FOURCC, "movi");
  return h;
}

export interface AviPatch {
  offset: number;
  value: number;
}

/**
 * Accumulates one clip.
 *
 * Holds only the index — 16 bytes a frame — never the frames themselves, so
 * the caller decides whether they go straight to disk or into memory. The
 * caller must append `chunkHeader`, the JPEG, and `pad` bytes of zero, in that
 * order, for every frame.
 */
export class AviClip {
  readonly width: number;
  readonly height: number;
  readonly nominalFps: number;
  private readonly index: number[] = []; // offset, size, offset, size...
  private pos = AVI_HEADER_BYTES;
  private moviBytes = 0;
  private largest = 0;

  constructor(width: number, height: number, fps: number) {
    this.width = width;
    this.height = height;
    this.nominalFps = Math.max(1, Math.round(fps));
  }

  get frames(): number {
    return this.index.length / 2;
  }
  /** Total size the file will be once finished, index included. */
  get projectedBytes(): number {
    return this.pos + 8 + this.frames * 16;
  }

  header(): Uint8Array {
    return aviHeader(this.width, this.height, this.nominalFps);
  }

  /**
   * Registers a frame and returns the bytes that must surround it.
   *
   * `pad` exists because RIFF chunks are word-aligned. Skipping it on an
   * odd-length JPEG shifts every following chunk by one byte, and the file
   * then stops parsing at frame two while still looking well-formed.
   */
  addFrame(jpegLength: number): { chunkHeader: Uint8Array; pad: number } {
    const chunkHeader = new Uint8Array(8);
    tag(chunkHeader, 0, "00dc");
    u32(chunkHeader, 4, jpegLength);
    const pad = jpegLength & 1;
    this.index.push(this.pos - AVI_MOVI_FOURCC, jpegLength);
    this.pos += 8 + jpegLength + pad;
    this.moviBytes += 8 + jpegLength + pad;
    if (jpegLength > this.largest) this.largest = jpegLength;
    return { chunkHeader, pad };
  }

  /** The idx1 block, appended after the last frame. */
  indexBlock(): Uint8Array {
    const n = this.frames;
    const b = new Uint8Array(8 + n * 16);
    tag(b, 0, "idx1");
    u32(b, 4, n * 16);
    for (let i = 0; i < n; i++) {
      const at = 8 + i * 16;
      tag(b, at, "00dc");
      u32(b, at + 4, 0x10); // AVIIF_KEYFRAME — every MJPEG frame is one
      u32(b, at + 8, this.index[i * 2]);
      u32(b, at + 12, this.index[i * 2 + 1]);
    }
    return b;
  }

  /**
   * The header fields that could not be known until now.
   *
   * `elapsedMs` is measured wall time, not frames/fps. A recording that
   * dropped frames is genuinely slower than it asked to be, and writing the
   * nominal rate here would play it back too fast.
   */
  finish(elapsedMs: number): AviPatch[] {
    const n = this.frames;
    const total = this.pos + 8 + n * 16;
    const secs = elapsedMs / 1000;
    let rate = this.nominalFps;
    if (secs >= 1 && n > 0) rate = Math.max(1, Math.round(n / secs));
    return [
      { offset: AVI_OFF.riffSize, value: total - 8 },
      { offset: AVI_OFF.microSecPerFrame, value: Math.round(1000000 / rate) },
      { offset: AVI_OFF.maxBytesPerSec, value: secs >= 1 ? Math.round(this.moviBytes / secs) : this.moviBytes },
      { offset: AVI_OFF.totalFrames, value: n },
      { offset: AVI_OFF.suggestedBufferSize, value: this.largest },
      { offset: AVI_OFF.rate, value: rate },
      { offset: AVI_OFF.length, value: n },
      { offset: AVI_OFF.streamSuggestedBufferSize, value: this.largest },
      { offset: AVI_OFF.moviSize, value: 4 + this.moviBytes },
    ];
  }
}

/** Applies patches to a complete in-memory file. */
export function applyPatches(file: Uint8Array, patches: AviPatch[]): void {
  for (const p of patches) u32(file, p.offset, p.value);
}

/**
 * Pulls width and height out of a JPEG's SOF marker.
 *
 * The AVI header has to declare the picture size before the clip can be
 * written, and guessing it is not harmless: a header that says 640x480 over
 * 800x600 frames makes players letterbox or refuse the file outright. The
 * frames themselves carry the answer, so read it rather than assume.
 *
 * Returns null when the marker is not found, which is the caller's cue to wait
 * for a frame it can actually read instead of inventing a size.
 */
export function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    // Standalone markers carry no length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    // SOF0..SOF15, excluding the DHT/JPG/DAC markers that share the range.
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    }
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

/** Decodes base64 to bytes without depending on Buffer or atob's quirks. */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let len = clean.length;
  while (len > 0 && clean[len - 1] === "=") len--;
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < len; i++) {
    const v = CHARS.indexOf(clean[i]);
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >>> bits) & 0xff;
    }
  }
  return o === out.length ? out : out.subarray(0, o);
}

/** Encodes bytes to base64, in chunks so a long clip cannot blow the stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += CHARS[(n >>> 18) & 63] + CHARS[(n >>> 12) & 63] + CHARS[(n >>> 6) & 63] + CHARS[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += CHARS[(n >>> 18) & 63] + CHARS[(n >>> 12) & 63] + "==";
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += CHARS[(n >>> 18) & 63] + CHARS[(n >>> 12) & 63] + CHARS[(n >>> 6) & 63] + "=";
  }
  return out;
}

/** A filename that sorts chronologically and is safe on FAT, SAF and APFS. */
export function clipFileName(deviceName: string, at: number): string {
  const safe = (deviceName || "camera").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 32).replace(/^-+|-+$/g, "");
  const d = new Date(at);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  const stamp =
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `${safe || "camera"}-${stamp}.avi`;
}
