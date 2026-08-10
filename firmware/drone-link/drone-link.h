/*
 * Circuvent Drone Link — wire formats and the MAVLink v2 subset.
 *
 * These live in a header rather than in the sketch for a mechanical reason: the
 * Arduino builder auto-generates a prototype for every function in a .ino and
 * inserts the whole block near the top of the file, above anything the sketch
 * itself declares. A function taking `const MavMsg &` therefore gets a
 * prototype that mentions a type the compiler has not seen yet, and the build
 * fails on a line that looks unrelated to the change that caused it. Types
 * pulled into an include are visible before that insertion point.
 *
 * The packed structs here are mirrored by platform/api/src/drone/track.ts.
 * Neither side may change without the other.
 */
#pragma once

#include <Arduino.h>

// ---------------------------------------------------------------------------
// MAVLink v2 framing
// ---------------------------------------------------------------------------
#define MAV_STX_V2 0xFD
#define MAV_STX_V1 0xFE
#define MAV_MAX_PAYLOAD 255

// Messages read from the autopilot.
#define MSG_HEARTBEAT            0
#define MSG_SYS_STATUS           1
#define MSG_GPS_RAW_INT          24
#define MSG_ATTITUDE             30
#define MSG_GLOBAL_POSITION_INT  33
#define MSG_MISSION_CURRENT      42
#define MSG_MISSION_COUNT        44
#define MSG_MISSION_ACK          47
#define MSG_VFR_HUD              74
#define MSG_COMMAND_ACK          77
#define MSG_BATTERY_STATUS       147
#define MSG_EKF_STATUS_REPORT    193
#define MSG_HOME_POSITION        242
#define MSG_STATUSTEXT           253

// Messages written to the autopilot.
#define MSG_SET_MODE             11
#define MSG_COMMAND_LONG         76
#define MSG_SET_POSITION_TARGET_GLOBAL_INT 86

// MAV_CMD values used.
#define CMD_NAV_RETURN_TO_LAUNCH 20
#define CMD_NAV_LAND             21
#define CMD_NAV_TAKEOFF          22
#define CMD_DO_SET_MODE          176
#define CMD_MISSION_START        300
#define CMD_COMPONENT_ARM_DISARM 400

/*
 * Our identity on the MAVLink bus. 255 is the conventional ground-station
 * sysid; component 191 marks us as an onboard computer rather than a second
 * ground station.
 *
 * That distinction matters to ArduPilot's GCS failsafe: if we announced
 * ourselves as a GCS, our going quiet would look like the operator's radio
 * disappearing and could trigger a failsafe RTL every time this board rebooted
 * — mid-flight, for a reason nobody watching would be able to explain.
 */
#define CV_SYSID  255
#define CV_COMPID 191

/*
 * CRC_EXTRA, the per-message byte mixed into the checksum. It exists so that
 * two peers built against different versions of a message definition fail the
 * checksum instead of silently agreeing on a misaligned payload — which is the
 * failure that would otherwise let a stale field be read as an altitude.
 */
static inline uint8_t crcExtraFor(uint32_t msgid) {
  switch (msgid) {
    case MSG_HEARTBEAT:           return 50;
    case MSG_SYS_STATUS:          return 124;
    case MSG_SET_MODE:            return 89;
    case MSG_GPS_RAW_INT:         return 24;
    case MSG_ATTITUDE:            return 39;
    case MSG_GLOBAL_POSITION_INT: return 104;
    case MSG_MISSION_CURRENT:     return 28;
    case MSG_MISSION_COUNT:       return 221;
    case MSG_MISSION_ACK:         return 153;
    case MSG_VFR_HUD:             return 20;
    case MSG_COMMAND_LONG:        return 152;
    case MSG_COMMAND_ACK:         return 143;
    case MSG_SET_POSITION_TARGET_GLOBAL_INT: return 5;
    case MSG_BATTERY_STATUS:      return 154;
    case MSG_EKF_STATUS_REPORT:   return 71;
    case MSG_HOME_POSITION:       return 104;
    case MSG_STATUSTEXT:          return 83;
    default:                      return 0;
  }
}

/** CRC-16/MCRF4XX, one byte at a time. */
static inline void crcAccumulate(uint8_t data, uint16_t *acc) {
  uint8_t tmp = data ^ (uint8_t)(*acc & 0xff);
  tmp ^= (uint8_t)(tmp << 4);
  *acc = (uint16_t)((*acc >> 8) ^ ((uint16_t)tmp << 8) ^ ((uint16_t)tmp << 3) ^ ((uint16_t)tmp >> 4));
}

// ---- little-endian payload writers ---------------------------------------
static inline void put8(uint8_t *p, size_t o, uint8_t v) { p[o] = v; }
static inline void put16(uint8_t *p, size_t o, uint16_t v) { p[o] = v & 0xFF; p[o + 1] = v >> 8; }
static inline void put32(uint8_t *p, size_t o, uint32_t v) {
  p[o] = v & 0xFF; p[o + 1] = (v >> 8) & 0xFF; p[o + 2] = (v >> 16) & 0xFF; p[o + 3] = (v >> 24) & 0xFF;
}
static inline void putI32(uint8_t *p, size_t o, int32_t v) { put32(p, o, (uint32_t)v); }
static inline void putF(uint8_t *p, size_t o, float v) {
  uint32_t b; memcpy(&b, &v, 4); put32(p, o, b);
}

// ---- little-endian payload readers ---------------------------------------
static inline uint8_t  rd8(const uint8_t *p, size_t o)  { return p[o]; }
static inline uint16_t rd16(const uint8_t *p, size_t o) { return (uint16_t)(p[o] | (p[o + 1] << 8)); }
static inline int16_t  rdI16(const uint8_t *p, size_t o) { return (int16_t)rd16(p, o); }
static inline uint32_t rd32(const uint8_t *p, size_t o) {
  return (uint32_t)p[o] | ((uint32_t)p[o + 1] << 8) | ((uint32_t)p[o + 2] << 16) | ((uint32_t)p[o + 3] << 24);
}
static inline int32_t rdI32(const uint8_t *p, size_t o) { return (int32_t)rd32(p, o); }
static inline float rdF(const uint8_t *p, size_t o) {
  uint32_t b = rd32(p, o); float f; memcpy(&f, &b, 4); return f;
}

/** One decoded MAVLink message. */
struct MavMsg {
  uint32_t msgid;
  uint8_t  sysid;
  uint8_t  compid;
  uint8_t  len;
  uint8_t  payload[MAV_MAX_PAYLOAD];
};

enum RxState { RX_IDLE, RX_LEN, RX_INCOMPAT, RX_COMPAT, RX_SEQ, RX_SYSID, RX_COMPID,
               RX_MSGID1, RX_MSGID2, RX_MSGID3, RX_PAYLOAD, RX_CRC1, RX_CRC2, RX_SIG };

// ---------------------------------------------------------------------------
// The packed track record published on cv/<id>/track
//
// `recBytes` travels on the wire so a firmware that grows the record does not
// silently misalign an older parser: the parser reads the size it was given,
// steps by it, and ignores the tail it does not understand. Without it, a
// 44-byte record read by a 40-byte parser produces coordinates that drift a
// little further into nonsense with every record — and still plot as a line.
// ---------------------------------------------------------------------------
struct __attribute__((packed)) TrackHeader {
  char     magic[4];    // "CVDT"
  uint8_t  ver;         // 1
  uint8_t  count;       // records in this batch
  uint8_t  recBytes;    // sizeof(TrackRec)
  uint8_t  flags;       // bit0 in-flight, bit1 armed
  uint32_t bootId;      // identifies a power cycle
  uint32_t seq;         // batch counter, for gap detection
};
static_assert(sizeof(TrackHeader) == 16, "TrackHeader must stay 16 bytes — the parser slices a fixed offset");

struct __attribute__((packed)) TrackRec {
  uint32_t ms;        // since boot
  int32_t  lat;       // degE7
  int32_t  lon;       // degE7
  int16_t  altRelDm;  // decimetres above home
  int16_t  altMslM;   // metres above mean sea level
  uint16_t hdgCdeg;   // 0..35999
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
  uint8_t  flags;     // bit0 armed, bit1 in-air, bit2 failsafe, bit3 fence breach
  uint8_t  linkPct;
  uint16_t hdopCm;
  uint16_t distHomeM;
};
static_assert(sizeof(TrackRec) == 40, "TrackRec must stay 40 bytes — recBytes on the wire says so");

#define TRACK_BATCH_MAX 20

/** Result of the preflight gate: a verdict plus something to show a person. */
struct Preflight {
  bool ok;
  char reason[48];
};
