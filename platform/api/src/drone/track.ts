/**
 * The `cv/<id>/track` wire format.
 *
 * A flight track is worth very little at 1 Hz. At 15 m/s — an unremarkable
 * cruise for a survey quad — one sample a second puts fifteen metres between
 * points, which turns a straight transect into a dotted line and loses a
 * crash entirely: the aircraft is at 40 m in one sample and on the ground in
 * the next, with nothing in between to say how it got there.
 *
 * So position is sampled at up to 10 Hz on the airframe. Publishing that as
 * ten JSON messages a second was rejected twice over. MQTT's per-publish
 * overhead — topic string, fixed header, a TCP push — is comparable to the
 * payload itself, and every one of those publishes competes with the
 * operator's commands on the same radio. And each JSON sample is ~180 bytes
 * against 40 packed.
 *
 * One publish of ten 40-byte records is therefore ~416 bytes a second instead
 * of ~2 kB in ten round trips.
 *
 *   HEADER, 16 bytes
 *   offset  size  field
 *   0       4     magic     "CVDT"
 *   4       1     ver       format version (1)
 *   5       1     count     records in this batch
 *   6       1     recBytes  size of one record — see below
 *   7       1     flags     bit0 in-flight, bit1 armed
 *   8       4     bootId    uint32 LE — identifies a power cycle
 *   12      4     seq       uint32 LE — batch counter, for gap detection
 *
 * `recBytes` travels on the wire, and that is the one field here worth
 * defending. Without it, a firmware that grows the record by four bytes is
 * read by an older parser at the old stride: every record after the first is
 * offset a little further, the coordinates drift progressively into nonsense,
 * and the result still plots as a continuous line — a corrupt track that looks
 * like a real one. With it, the parser steps by the size it was told and
 * ignores the tail it does not understand, so an old parser reading a new
 * firmware degrades to "the fields I know are correct".
 *
 * Mirrored by `TrackHeader` / `TrackRec` in firmware/drone-link/drone-link.h,
 * which carry `static_assert`s on their sizes for the same reason this file
 * exports the constants: the two must not drift.
 */

export const HEADER_BYTES = 16;
export const REC_BYTES = 40;
export const MAGIC = "CVDT";

/** Index is the `mode` byte. Mirrored by `modeCode()` in the firmware. */
export const MODES = [
  "unknown", "stabilize", "althold", "loiter", "poshold", "guided",
  "auto", "rtl", "smartrtl", "land", "brake", "circle", "acro",
] as const;
export type ModeName = (typeof MODES)[number];

export const FIXES = ["none", "none", "2d", "3d", "dgps", "rtk-float", "rtk-fixed"] as const;

export const FLAG_ARMED = 0x01;
export const FLAG_IN_AIR = 0x02;
export const FLAG_FAILSAFE = 0x04;
export const FLAG_FENCE = 0x08;

export interface TrackSample {
  /** Milliseconds since the companion computer booted. */
  ms: number;
  lat: number;
  lon: number;
  /** Metres above the home position. */
  alt: number;
  /** Metres above mean sea level. */
  altMsl: number;
  headingDeg: number;
  speedMs: number;
  climbMs: number;
  battV: number;
  battA: number | null;
  battPct: number | null;
  sats: number;
  fix: string;
  mode: ModeName;
  rollDeg: number;
  pitchDeg: number;
  armed: boolean;
  inAir: boolean;
  failsafe: boolean;
  fenceBreach: boolean;
  linkPct: number;
  hdop: number;
  distHomeM: number;
}

export interface TrackBatch {
  bootId: number;
  seq: number;
  inAir: boolean;
  armed: boolean;
  samples: TrackSample[];
}

/**
 * A coordinate of exactly (0, 0) is in the Gulf of Guinea, and is what an
 * autopilot reports before it has a fix. Treating it as a position draws every
 * pre-flight track as a line from West Africa to wherever the aircraft
 * actually is — which is not a subtle artefact, but it is one that gets
 * "fixed" by clamping the map bounds rather than by dropping the sample.
 */
export function hasFix(s: { lat: number; lon: number }): boolean {
  return !(Math.abs(s.lat) < 1e-7 && Math.abs(s.lon) < 1e-7);
}

/**
 * Parses one `cv/<id>/track` payload. Returns null when the payload is not a
 * track batch at all — a device publishing something else onto this topic
 * should be dropped at the edge rather than half-decoded.
 */
export function parseTrack(payload: Buffer): TrackBatch | null {
  if (!payload || payload.length < HEADER_BYTES) return null;
  if (payload.subarray(0, 4).toString("latin1") !== MAGIC) return null;

  const ver = payload.readUInt8(4);
  if (ver !== 1) return null;

  const count = payload.readUInt8(5);
  const recBytes = payload.readUInt8(6);
  const flags = payload.readUInt8(7);
  const bootId = payload.readUInt32LE(8);
  const seq = payload.readUInt32LE(12);

  /*
   * A record smaller than the layout this build knows cannot be read at all —
   * the fields simply are not there. A larger one can: read the prefix, skip
   * the rest. That asymmetry is the whole point of shipping the size.
   */
  if (recBytes < REC_BYTES) return null;

  const body = payload.subarray(HEADER_BYTES);
  const available = Math.floor(body.length / recBytes);
  const n = Math.min(count, available);

  const samples: TrackSample[] = [];
  for (let i = 0; i < n; i++) {
    const o = i * recBytes;
    const f = body.readUInt8(o + 34);
    const amps = body.readInt16LE(o + 24);
    const pct = body.readInt8(o + 26);
    samples.push({
      ms: body.readUInt32LE(o + 0),
      lat: body.readInt32LE(o + 4) / 1e7,
      lon: body.readInt32LE(o + 8) / 1e7,
      alt: body.readInt16LE(o + 12) / 10,
      altMsl: body.readInt16LE(o + 14),
      headingDeg: body.readUInt16LE(o + 16) / 100,
      speedMs: body.readUInt16LE(o + 18) / 100,
      climbMs: body.readInt16LE(o + 20) / 100,
      battV: body.readUInt16LE(o + 22) / 1000,
      // -1 is the firmware's "not measured". Zero amps is a real reading on a
      // disarmed aircraft, so the two must not collapse into each other.
      battA: amps < 0 ? null : amps / 100,
      battPct: pct < 0 ? null : pct,
      sats: body.readUInt8(o + 27),
      fix: FIXES[body.readUInt8(o + 28)] ?? "none",
      mode: MODES[body.readUInt8(o + 29)] ?? "unknown",
      rollDeg: body.readInt16LE(o + 30) / 100,
      pitchDeg: body.readInt16LE(o + 32) / 100,
      armed: (f & FLAG_ARMED) !== 0,
      inAir: (f & FLAG_IN_AIR) !== 0,
      failsafe: (f & FLAG_FAILSAFE) !== 0,
      fenceBreach: (f & FLAG_FENCE) !== 0,
      linkPct: body.readUInt8(o + 35),
      hdop: body.readUInt16LE(o + 36) / 100,
      distHomeM: body.readUInt16LE(o + 38),
    });
  }

  return {
    bootId,
    seq,
    inAir: (flags & 0x01) !== 0,
    armed: (flags & 0x02) !== 0,
    samples,
  };
}

/**
 * Great-circle distance in metres.
 *
 * Haversine rather than the equirectangular approximation the firmware uses:
 * the firmware is measuring hundreds of metres from home on a board that is
 * also draining a UART, whereas this accumulates over a whole flight, and an
 * approximation that is fine per-sample is not fine summed ten thousand times.
 */
export function haversineM(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  const R = 6371008.8;
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLon = (bLon - aLon) * toRad;
  const la1 = aLat * toRad;
  const la2 = bLat * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
