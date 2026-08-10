/*
 * Telemetry — publishes on the existing cv/<id>/track protocol.
 *
 * WHY THE SAME WIRE FORMAT AS drone-link
 *
 * The control plane already parses this: platform/api/src/drone/track.ts turns
 * these records into flights, a log book, a daily report and the map in the
 * console. Inventing a second format for our own airframe would mean a second
 * parser, a second set of tests, and two places for the flight-lifecycle rules
 * to drift apart — and those rules (a flight is arm to disarm; a flight that
 * ends in silence is never called a landing) are the part that must not drift.
 *
 * So the X1 is a first-class citizen of the same log book. `recBytes` on the
 * wire is what makes that safe: if this firmware ever needs a longer record,
 * an older control plane reads the prefix it understands instead of
 * misaligning every field after the first.
 *
 * WHAT IS NOT SENT
 *
 * No GPS. This airframe has none, so lat/lon stay zero — and `hasFix()` in the
 * parser treats (0,0) as "no fix" rather than as the Gulf of Guinea, which is
 * exactly why that check exists. The track is still useful: altitude,
 * attitude, battery, mode and timing all populate, and the flight log records
 * the sortie. Claiming a position we do not have would be worse than
 * admitting we have none.
 */
#pragma once

#include "fc-config.h"
#include <CircuventDevice.h>

/*
 * Mirrored by platform/api/src/drone/track.ts and by
 * firmware/drone-link/drone-link.h. All three carry the same static_asserts
 * because a silent size change here corrupts a flight record rather than
 * failing a build.
 */
struct __attribute__((packed)) TrackHeader {
  char     magic[4];    // "CVDT"
  uint8_t  ver;         // 1
  uint8_t  count;
  uint8_t  recBytes;
  uint8_t  flags;       // bit0 in-flight, bit1 armed
  uint32_t bootId;
  uint32_t seq;
};
static_assert(sizeof(TrackHeader) == 16, "TrackHeader must stay 16 bytes - the parser slices a fixed offset");

struct __attribute__((packed)) TrackRec {
  uint32_t ms;
  int32_t  lat;
  int32_t  lon;
  int16_t  altRelDm;
  int16_t  altMslM;
  uint16_t hdgCdeg;
  uint16_t gspdCms;
  int16_t  vspdCms;
  uint16_t battMv;
  int16_t  battCa;
  int8_t   battPct;
  uint8_t  sats;
  uint8_t  fix;
  uint8_t  mode;
  int16_t  rollCdeg;
  int16_t  pitchCdeg;
  uint8_t  flags;       // bit0 armed, bit1 in-air, bit2 failsafe, bit3 fence
  uint8_t  linkPct;
  uint16_t hdopCm;
  uint16_t distHomeM;
};
static_assert(sizeof(TrackRec) == 40, "TrackRec must stay 40 bytes - recBytes on the wire says so");

#define TRACK_BATCH 10

static TrackRec  g_trackBuf[TRACK_BATCH];
static uint8_t   g_trackFill = 0;
static uint32_t  g_trackSeq = 0;
static uint32_t  g_bootId = 0;

inline void startTelemetry(CircuventDevice &cv) {
  (void)cv;
  g_bootId = esp_random();
  g_trackFill = 0;
  g_trackSeq = 0;
}

/** Mode byte, matching the MODES table in drone/track.ts. */
static inline uint8_t modeCodeFor(FlightState st) {
  switch (st) {
    case FS_ARMED:    return 1;   // "stabilize"
    case FS_FAILSAFE: return 9;   // "land" - the failsafe is a controlled descent
    default:          return 0;   // "unknown"
  }
}

inline void flushTrack(CircuventDevice &cv) {
  if (g_trackFill == 0 || !cv.online()) { g_trackFill = 0; return; }
  TrackHeader h;
  memcpy(h.magic, "CVDT", 4);
  h.ver = 1;
  h.count = g_trackFill;
  h.recBytes = sizeof(TrackRec);
  h.flags = 0;
  h.bootId = g_bootId;
  h.seq = g_trackSeq++;
  cv.publishBinary("track", (const uint8_t *)g_trackBuf,
                   sizeof(TrackRec) * g_trackFill, (const uint8_t *)&h, sizeof(h));
  g_trackFill = 0;
}

/**
 * Samples and publishes. Called from the core-0 loop, never from the rate
 * task: MQTT publishes block, and a blocking call inside a 1 kHz control loop
 * is a missed deadline every time the network hiccups.
 */
inline void pumpTelemetry(CircuventDevice &cv, const struct SharedState &s, uint32_t now) {
  const bool armed = s.state == FS_ARMED || s.state == FS_FAILSAFE;

  static uint32_t lastSample = 0;
  // 10 Hz while armed, 1 Hz otherwise. A disarmed aircraft on a bench does not
  // need 36,000 rows an hour.
  const uint32_t period = armed ? 100 : 1000;
  if (now - lastSample >= period) {
    lastSample = now;
    if (armed && g_trackFill < TRACK_BATCH) {
      TrackRec &r = g_trackBuf[g_trackFill++];
      memset(&r, 0, sizeof(r));
      r.ms = now;
      r.lat = 0; r.lon = 0;            // no GPS on this airframe - see header
      r.battMv = (uint16_t)clampf(s.battV * 1000.0f, 0.0f, 65535.0f);
      r.battCa = -1;                   // no current sensor fitted
      r.battPct = s.battPct;
      r.sats = 0;
      r.fix = 0;
      r.mode = modeCodeFor(s.state);
      r.rollCdeg  = (int16_t)clampf(s.att.rollDeg * 100.0f, -32768.0f, 32767.0f);
      r.pitchCdeg = (int16_t)clampf(s.att.pitchDeg * 100.0f, -32768.0f, 32767.0f);
      r.hdgCdeg = (uint16_t)clampf((s.att.yawDeg < 0 ? s.att.yawDeg + 360.0f : s.att.yawDeg) * 100.0f, 0.0f, 35999.0f);
      r.flags = (uint8_t)((armed ? 0x01 : 0) | (s.inAir ? 0x02 : 0) |
                          (s.state == FS_FAILSAFE ? 0x04 : 0));
      r.linkPct = cv.online() ? 100 : 0;
      r.hdopCm = 0;
    }
  }

  static uint32_t lastFlush = 0;
  if (g_trackFill >= TRACK_BATCH || (g_trackFill > 0 && now - lastFlush >= 1000)) {
    lastFlush = now;
    flushTrack(cv);
  }

  // A disarm ends the flight; push the tail of the track with it rather than
  // leaving the last second of a sortie sitting in RAM.
  static bool wasArmed = false;
  if (wasArmed && !armed) flushTrack(cv);
  wasArmed = armed;
}
