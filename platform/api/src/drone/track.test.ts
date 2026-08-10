import "../test-env";
import test from "node:test";
import assert from "node:assert/strict";
import {
  HEADER_BYTES,
  REC_BYTES,
  haversineM,
  hasFix,
  parseTrack,
} from "./track";

/** Builds a wire-format batch the way the firmware would. */
function buildBatch(
  samples: Partial<{
    ms: number; lat: number; lon: number; altRelDm: number; altMslM: number;
    hdgCdeg: number; gspdCms: number; vspdCms: number; battMv: number;
    battCa: number; battPct: number; sats: number; fix: number; mode: number;
    rollCdeg: number; pitchCdeg: number; flags: number; linkPct: number;
    hdopCm: number; distHomeM: number;
  }>[],
  opts: { seq?: number; bootId?: number; flags?: number; recBytes?: number; ver?: number; count?: number } = {}
): Buffer {
  const recBytes = opts.recBytes ?? REC_BYTES;
  const head = Buffer.alloc(HEADER_BYTES);
  head.write("CVDT", 0, "latin1");
  head.writeUInt8(opts.ver ?? 1, 4);
  head.writeUInt8(opts.count ?? samples.length, 5);
  head.writeUInt8(recBytes, 6);
  head.writeUInt8(opts.flags ?? 0, 7);
  head.writeUInt32LE(opts.bootId ?? 1234, 8);
  head.writeUInt32LE(opts.seq ?? 0, 12);

  const body = Buffer.alloc(recBytes * samples.length);
  samples.forEach((s, i) => {
    const o = i * recBytes;
    body.writeUInt32LE(s.ms ?? 0, o + 0);
    body.writeInt32LE(Math.round((s.lat ?? 0) * 1e7), o + 4);
    body.writeInt32LE(Math.round((s.lon ?? 0) * 1e7), o + 8);
    body.writeInt16LE(s.altRelDm ?? 0, o + 12);
    body.writeInt16LE(s.altMslM ?? 0, o + 14);
    body.writeUInt16LE(s.hdgCdeg ?? 0, o + 16);
    body.writeUInt16LE(s.gspdCms ?? 0, o + 18);
    body.writeInt16LE(s.vspdCms ?? 0, o + 20);
    body.writeUInt16LE(s.battMv ?? 0, o + 22);
    body.writeInt16LE(s.battCa ?? -1, o + 24);
    body.writeInt8(s.battPct ?? -1, o + 26);
    body.writeUInt8(s.sats ?? 0, o + 27);
    body.writeUInt8(s.fix ?? 0, o + 28);
    body.writeUInt8(s.mode ?? 0, o + 29);
    body.writeInt16LE(s.rollCdeg ?? 0, o + 30);
    body.writeInt16LE(s.pitchCdeg ?? 0, o + 32);
    body.writeUInt8(s.flags ?? 0, o + 34);
    body.writeUInt8(s.linkPct ?? 100, o + 35);
    body.writeUInt16LE(s.hdopCm ?? 0, o + 36);
    body.writeUInt16LE(s.distHomeM ?? 0, o + 38);
  });
  return Buffer.concat([head, body]);
}

test("parses a batch and scales every field back to units", () => {
  const buf = buildBatch([
    {
      ms: 5000, lat: 17.385, lon: 78.4867, altRelDm: 452, altMslM: 545,
      hdgCdeg: 18000, gspdCms: 1250, vspdCms: -150, battMv: 15800,
      battCa: 1250, battPct: 78, sats: 14, fix: 3, mode: 6,
      rollCdeg: -350, pitchCdeg: 275, flags: 0b0011, linkPct: 92,
      hdopCm: 85, distHomeM: 240,
    },
  ]);
  const batch = parseTrack(buf);
  assert.ok(batch);
  assert.equal(batch.samples.length, 1);
  const s = batch.samples[0]!;
  assert.ok(Math.abs(s.lat - 17.385) < 1e-6);
  assert.ok(Math.abs(s.lon - 78.4867) < 1e-6);
  assert.equal(s.alt, 45.2);
  assert.equal(s.altMsl, 545);
  assert.equal(s.headingDeg, 180);
  assert.equal(s.speedMs, 12.5);
  assert.equal(s.climbMs, -1.5);
  assert.equal(s.battV, 15.8);
  assert.equal(s.battA, 12.5);
  assert.equal(s.battPct, 78);
  assert.equal(s.sats, 14);
  assert.equal(s.fix, "3d");
  assert.equal(s.mode, "auto");
  assert.equal(s.rollDeg, -3.5);
  assert.equal(s.pitchDeg, 2.75);
  assert.equal(s.armed, true);
  assert.equal(s.inAir, true);
  assert.equal(s.failsafe, false);
  assert.equal(s.hdop, 0.85);
  assert.equal(s.distHomeM, 240);
});

test("rejects a payload that is not a track batch", () => {
  assert.equal(parseTrack(Buffer.alloc(0)), null);
  assert.equal(parseTrack(Buffer.from("hello world")), null);
  // A JPEG on the wrong topic must not half-decode into a position.
  assert.equal(parseTrack(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])), null);
});

test("rejects a future format version rather than misreading it", () => {
  const buf = buildBatch([{ lat: 1, lon: 1 }], { ver: 2 });
  assert.equal(parseTrack(buf), null);
});

/*
 * The forward-compatibility guarantee `recBytes` exists to provide. A newer
 * firmware with a longer record must still be readable by this build, at the
 * old stride, with the extra bytes ignored.
 */
test("a longer record from newer firmware is read at its own stride", () => {
  const buf = buildBatch(
    [
      { lat: 10, lon: 20, altRelDm: 100 },
      { lat: 11, lon: 21, altRelDm: 200 },
    ],
    { recBytes: 48 }
  );
  const batch = parseTrack(buf);
  assert.ok(batch);
  assert.equal(batch.samples.length, 2);
  // The second sample is the one that would be corrupt if the stride were
  // wrong — it is read from offset 48, not 40.
  assert.ok(Math.abs(batch.samples[1]!.lat - 11) < 1e-6);
  assert.equal(batch.samples[1]!.alt, 20);
});

test("a shorter record than this build knows is refused, not guessed", () => {
  // Built by hand: the helper writes the full 40-byte layout, which cannot fit
  // in a short record. A 32-byte record simply does not contain the fields
  // this build reads, so there is nothing to salvage and guessing would put
  // an altitude where a heading should be.
  const head = Buffer.alloc(HEADER_BYTES);
  head.write("CVDT", 0, "latin1");
  head.writeUInt8(1, 4);
  head.writeUInt8(1, 5);
  head.writeUInt8(32, 6);
  head.writeUInt32LE(1, 8);
  head.writeUInt32LE(0, 12);
  assert.equal(parseTrack(Buffer.concat([head, Buffer.alloc(32)])), null);
});

/*
 * A truncated batch — the radio cut mid-publish — must yield the records that
 * did arrive rather than reading past the end of the buffer.
 */
test("a truncated batch yields only the complete records", () => {
  const full = buildBatch([{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }, { lat: 3, lon: 3 }]);
  const cut = full.subarray(0, HEADER_BYTES + REC_BYTES * 2 + 10);
  const batch = parseTrack(cut);
  assert.ok(batch);
  assert.equal(batch.samples.length, 2);
});

test("a count larger than the payload cannot over-read", () => {
  const buf = buildBatch([{ lat: 1, lon: 1 }], { count: 20 });
  const batch = parseTrack(buf);
  assert.ok(batch);
  assert.equal(batch.samples.length, 1);
});

/*
 * -1 amps is the firmware saying "no current sensor". Zero amps is a real
 * reading from a disarmed aircraft. Collapsing them would draw a current graph
 * that reads zero for a pack with no shunt, which looks like a working sensor
 * reporting no draw.
 */
test("unmeasured current is null, not zero", () => {
  const none = parseTrack(buildBatch([{ lat: 1, lon: 1, battCa: -1 }]))!;
  assert.equal(none.samples[0]!.battA, null);
  const zero = parseTrack(buildBatch([{ lat: 1, lon: 1, battCa: 0 }]))!;
  assert.equal(zero.samples[0]!.battA, 0);
});

test("unknown battery percentage is null, not -1", () => {
  const b = parseTrack(buildBatch([{ lat: 1, lon: 1, battPct: -1 }]))!;
  assert.equal(b.samples[0]!.battPct, null);
});

test("an unknown mode byte degrades to unknown rather than throwing", () => {
  const b = parseTrack(buildBatch([{ lat: 1, lon: 1, mode: 200 }]))!;
  assert.equal(b.samples[0]!.mode, "unknown");
});

/*
 * (0,0) is the Gulf of Guinea, and is what an autopilot reports before it has
 * a fix. Every pre-flight sample would otherwise draw a line from West Africa
 * to wherever the aircraft actually is.
 */
test("null island is not a fix", () => {
  assert.equal(hasFix({ lat: 0, lon: 0 }), false);
  assert.equal(hasFix({ lat: 17.385, lon: 78.4867 }), true);
  // A genuine position on the equator at a real longitude still counts.
  assert.equal(hasFix({ lat: 0, lon: 78.4867 }), true);
});

test("negative altitude below the launch point survives the round trip", () => {
  // Flying into a valley from a hilltop launch is a real case and produces a
  // negative relative altitude; an unsigned field here would wrap to +6553 m.
  const b = parseTrack(buildBatch([{ lat: 1, lon: 1, altRelDm: -250 }]))!;
  assert.equal(b.samples[0]!.alt, -25);
});

test("header flags and sequence are carried through", () => {
  const b = parseTrack(buildBatch([{ lat: 1, lon: 1 }], { seq: 77, bootId: 9001, flags: 0b11 }))!;
  assert.equal(b.seq, 77);
  assert.equal(b.bootId, 9001);
  assert.equal(b.inAir, true);
  assert.equal(b.armed, true);
});

test("haversine matches a known distance", () => {
  // Hyderabad Charminar to Golconda Fort, ~9.5 km.
  const d = haversineM(17.3616, 78.4747, 17.3833, 78.4011);
  assert.ok(d > 7500 && d < 8500, `expected ~8 km, got ${Math.round(d)} m`);
  assert.equal(Math.round(haversineM(17.385, 78.4867, 17.385, 78.4867)), 0);
});
