/*
 * Circuvent Drone Link — telemetry bridge and mission supervisor for an
 * autonomous UAV (ESP32, carried on the airframe).
 * =========================================================================
 *
 * WHAT THIS DEVICE IS, AND WHAT IT REFUSES TO BE
 *
 * It is a companion computer. It sits on the airframe next to a real flight
 * controller — ArduPilot or PX4 — talks to it over a serial link in MAVLink v2,
 * and bridges that to Circuvent over Wi-Fi. It reports where the aircraft is,
 * how much battery is left and what it is doing; it accepts a small set of
 * whole-intent commands and translates them into MAVLink; and it keeps a
 * preflight gate in front of arming.
 *
 * It does NOT stabilise the aircraft, and nothing here should ever be changed
 * so that it does. Attitude stabilisation is a hard real-time loop at 400 Hz
 * with a state estimator that has to stay numerically sane while the airframe
 * is vibrating. ArduPilot and PX4 represent millions of flight hours of exactly
 * that problem being got wrong and then fixed. An estimator written fresh for
 * this board would fly acceptably on a calm day on the bench and then drop a
 * two-kilogram aircraft on somebody. So the split is the same one the ANPR
 * camera makes: the part that must not be got wrong is given to the subsystem
 * that has already earned it, and this device does the part it is uniquely
 * placed to do — it is the only thing on the airframe that knows both what the
 * autopilot is saying and what the operator on the ground wants.
 *
 * WHY THE CLOUD IS NEVER IN THE CONTROL LOOP
 *
 * Every command this device accepts is a *whole intent* that is safe to finish
 * on its own: take off to an altitude, go to a coordinate, return home, land,
 * run a stored mission. There is deliberately no "nudge forward while I hold
 * this button". Continuous manual control over a link with reconnect backoff,
 * NAT timeouts and a radio that fades behind a building is not control; it is a
 * way of discovering where the aircraft ends up when the last packet is the one
 * that said "forward". If the link dies here, the worst case is that a mission
 * the operator already authorised completes, or the flight controller's own
 * failsafe brings it home.
 *
 * That failsafe is the flight controller's, not ours, and this device checks it
 * is configured before it will let the aircraft arm. A companion computer that
 * enforced its own failsafe would be the single point of failure it exists to
 * avoid: if this board browns out, MAVLink stops arriving at the autopilot and
 * the autopilot acts. That only works if the autopilot was set up to.
 *
 *   ground ──▶ MQTT ──▶ control plane ──▶ cv/<id>/cmd ──▶ [this device]
 *                                                            │ MAVLink v2
 *                                                            ▼
 *                                                    flight controller
 *                                                     (ArduPilot / PX4)
 *
 * TELEMETRY
 *
 * A flight track is worth nothing at 1 Hz — that is 15 metres between samples
 * at cruise, which turns a survey line into a dotted one and loses the moment
 * of a crash entirely. So position is sampled at up to 10 Hz into a packed
 * 40-byte record and published in batches on `cv/<id>/track`. Batching is the
 * point: MQTT's per-publish overhead (topic, header, TCP push) is comparable to
 * the record itself, so ten 40-byte publishes a second cost several times what
 * one publish of ten records costs, on a radio link that is also carrying the
 * operator's commands.
 *
 * `state` still carries the summary at 1 Hz, because that is what a dashboard
 * tile and an automation rule read, and neither wants 10 Hz.
 *
 * Standard Circuvent protocol (cv/<id>/state|telemetry|track).
 * See Docs/21-drone.md and platform/PROTOCOL.md.
 */

/** Version history: 1.0.0 initial MAVLink bridge + mission supervisor. */
#define CV_FW_VERSION "1.0.0"

#include <CircuventDevice.h>
#include <Preferences.h>
#include <math.h>
#include "drone-link.h"

// ---------------------------------------------------------------------------
// Board profiles
//
// The autopilot's telemetry port is 3.3 V TTL on every board worth using, so
// the only real decision is which UART and which pins are free. All three
// profiles keep UART0 for the USB console — debugging a bridge by unplugging
// the thing you are debugging it with is not debugging.
// ---------------------------------------------------------------------------
#define CV_DRONE_WROOM32 1   // ESP32-WROOM-32   (primary — cheapest, most GPIO)
#define CV_DRONE_S3      2   // ESP32-S3         (native USB, more RAM)
#define CV_DRONE_C3      3   // ESP32-C3         (smallest/lightest)

#ifndef CV_DRONE_BOARD
#define CV_DRONE_BOARD CV_DRONE_WROOM32
#endif

#if CV_DRONE_BOARD == CV_DRONE_WROOM32
  #define CV_BOARD_NAME "esp32-wroom32"
  #ifndef MAV_RX_PIN
  #define MAV_RX_PIN 16
  #endif
  #ifndef MAV_TX_PIN
  #define MAV_TX_PIN 17
  #endif
  #ifndef CV_RESET_BTN
  #define CV_RESET_BTN 0
  #endif
  #ifndef CV_STATUS_LED
  #define CV_STATUS_LED 2
  #endif

#elif CV_DRONE_BOARD == CV_DRONE_S3
  #define CV_BOARD_NAME "esp32s3"
  #ifndef MAV_RX_PIN
  #define MAV_RX_PIN 18
  #endif
  #ifndef MAV_TX_PIN
  #define MAV_TX_PIN 17
  #endif
  #ifndef CV_RESET_BTN
  #define CV_RESET_BTN 0
  #endif
  #ifndef CV_STATUS_LED
  #define CV_STATUS_LED 48
  #endif

#elif CV_DRONE_BOARD == CV_DRONE_C3
  #define CV_BOARD_NAME "esp32c3"
  #ifndef MAV_RX_PIN
  #define MAV_RX_PIN 4
  #endif
  #ifndef MAV_TX_PIN
  #define MAV_TX_PIN 5
  #endif
  #ifndef CV_RESET_BTN
  #define CV_RESET_BTN 9
  #endif
  #ifndef CV_STATUS_LED
  #define CV_STATUS_LED 8
  #endif

#else
  #error "Unknown CV_DRONE_BOARD"
#endif

/*
 * Compile-time pin clash guard, same reasoning as the camera boards: a UART
 * sharing a pin with the reset button or the status LED does not fail at build
 * time and does not fail at boot. It fails as intermittent corruption on the
 * telemetry link, in the air, and gets diagnosed as a bad radio.
 */
#if (MAV_RX_PIN) == (MAV_TX_PIN)
  #error "CV_PIN_CLASH: MAV_RX_PIN and MAV_TX_PIN are the same pin"
#endif
#if (CV_RESET_BTN) >= 0 && ((CV_RESET_BTN) == (MAV_RX_PIN) || (CV_RESET_BTN) == (MAV_TX_PIN))
  #error "CV_PIN_CLASH: reset button shares a pin with the MAVLink UART"
#endif
#if (CV_STATUS_LED) >= 0 && ((CV_STATUS_LED) == (MAV_RX_PIN) || (CV_STATUS_LED) == (MAV_TX_PIN))
  #error "CV_PIN_CLASH: status LED shares a pin with the MAVLink UART"
#endif

CircuventDevice cv("drone-link");
Preferences prefs;

// The autopilot link. UART1 on every profile; UART0 stays with the console.
HardwareSerial Mav(1);

// ---------------------------------------------------------------------------
// MAVLink v2 transmit
//
// Framing, CRCs and the message ids live in drone-link.h. Pulling in the
// generated MAVLink headers would add megabytes of dialect source for the
// fifteen messages used here and would tie the firmware to a generator
// version; the framing is stable and short enough to own outright.
// ---------------------------------------------------------------------------
static uint8_t txSeq = 0;

/** Frame and write one MAVLink v2 message. Payload is sent untruncated. */
static void mavSend(uint32_t msgid, const uint8_t *payload, uint8_t len) {
  uint8_t hdr[10];
  hdr[0] = MAV_STX_V2;
  hdr[1] = len;
  hdr[2] = 0;               // incompat flags - 0, we never sign
  hdr[3] = 0;               // compat flags
  hdr[4] = txSeq++;
  hdr[5] = CV_SYSID;
  hdr[6] = CV_COMPID;
  hdr[7] = (uint8_t)(msgid & 0xFF);
  hdr[8] = (uint8_t)((msgid >> 8) & 0xFF);
  hdr[9] = (uint8_t)((msgid >> 16) & 0xFF);

  uint16_t acc = 0xFFFF;
  for (int i = 1; i < 10; i++) crcAccumulate(hdr[i], &acc);
  for (uint8_t i = 0; i < len; i++) crcAccumulate(payload[i], &acc);
  crcAccumulate(crcExtraFor(msgid), &acc);

  Mav.write(hdr, 10);
  if (len) Mav.write(payload, len);
  uint8_t ck[2] = { (uint8_t)(acc & 0xFF), (uint8_t)(acc >> 8) };
  Mav.write(ck, 2);
}

// ---------------------------------------------------------------------------
// Receive state machine
// ---------------------------------------------------------------------------
static RxState rxState = RX_IDLE;
static MavMsg  rxMsg;
static uint8_t rxIdx = 0;
static uint8_t rxIncompat = 0;
static uint16_t rxCrc = 0;
static uint16_t rxCrcCalc = 0;
static uint8_t rxSigLeft = 0;
static uint32_t rxDropped = 0;
static uint32_t rxGood = 0;

/**
 * Feeds one byte in. Returns true when `rxMsg` holds a complete, checksummed
 * message.
 *
 * v1 frames are accepted as well as v2. Some autopilots and most SiK radios
 * still emit v1 for a few messages, and a bridge that ignored them would show
 * an aircraft with no heartbeat — which reads identically to a dead autopilot.
 */
static bool mavParse(uint8_t b) {
  switch (rxState) {
    case RX_IDLE:
      if (b == MAV_STX_V2 || b == MAV_STX_V1) {
        rxIncompat = 0;
        rxCrcCalc = 0xFFFF;
        rxMsg.msgid = 0;
        // v1 has no incompat/compat bytes; it is modelled by skipping them.
        rxState = (b == MAV_STX_V2) ? RX_LEN : RX_LEN;
        rxSigLeft = (b == MAV_STX_V2) ? 0 : 0xFF;   // 0xFF marks "this is v1"
      }
      return false;

    case RX_LEN:
      rxMsg.len = b;
      crcAccumulate(b, &rxCrcCalc);
      rxState = (rxSigLeft == 0xFF) ? RX_SEQ : RX_INCOMPAT;
      return false;

    case RX_INCOMPAT:
      rxIncompat = b;
      crcAccumulate(b, &rxCrcCalc);
      rxState = RX_COMPAT;
      return false;

    case RX_COMPAT:
      crcAccumulate(b, &rxCrcCalc);
      rxState = RX_SEQ;
      return false;

    case RX_SEQ:
      crcAccumulate(b, &rxCrcCalc);
      rxState = RX_SYSID;
      return false;

    case RX_SYSID:
      rxMsg.sysid = b;
      crcAccumulate(b, &rxCrcCalc);
      rxState = RX_COMPID;
      return false;

    case RX_COMPID:
      rxMsg.compid = b;
      crcAccumulate(b, &rxCrcCalc);
      rxState = RX_MSGID1;
      return false;

    case RX_MSGID1:
      rxMsg.msgid = b;
      crcAccumulate(b, &rxCrcCalc);
      if (rxSigLeft == 0xFF) {                   // v1: single-byte msgid
        rxIdx = 0;
        rxState = rxMsg.len ? RX_PAYLOAD : RX_CRC1;
        if (!rxMsg.len) memset(rxMsg.payload, 0, MAV_MAX_PAYLOAD);
      } else {
        rxState = RX_MSGID2;
      }
      return false;

    case RX_MSGID2:
      rxMsg.msgid |= ((uint32_t)b) << 8;
      crcAccumulate(b, &rxCrcCalc);
      rxState = RX_MSGID3;
      return false;

    case RX_MSGID3:
      rxMsg.msgid |= ((uint32_t)b) << 16;
      crcAccumulate(b, &rxCrcCalc);
      rxIdx = 0;
      /*
       * v2 truncates trailing zero bytes on the wire, so the payload must be
       * zero-filled before the received bytes land in it. Skipping this reads
       * whatever the previous message left there — and the previous message is
       * usually a different one, so a truncated field silently inherits a
       * plausible-looking value from an unrelated packet.
       */
      memset(rxMsg.payload, 0, MAV_MAX_PAYLOAD);
      rxState = rxMsg.len ? RX_PAYLOAD : RX_CRC1;
      return false;

    case RX_PAYLOAD:
      rxMsg.payload[rxIdx++] = b;
      crcAccumulate(b, &rxCrcCalc);
      if (rxIdx >= rxMsg.len) rxState = RX_CRC1;
      return false;

    case RX_CRC1:
      rxCrc = b;
      rxState = RX_CRC2;
      return false;

    case RX_CRC2: {
      rxCrc |= ((uint16_t)b) << 8;
      crcAccumulate(crcExtraFor(rxMsg.msgid), &rxCrcCalc);
      bool ok = (rxCrc == rxCrcCalc);
      bool signedFrame = (rxSigLeft != 0xFF) && (rxIncompat & 0x01);
      rxState = RX_IDLE;
      if (!ok) { rxDropped++; return false; }
      rxGood++;
      if (signedFrame) {
        // Consume and ignore the 13-byte signature. We do not verify it: the
        // link is a wire inside the airframe, and pretending to authenticate it
        // would be worse than not claiming to.
        rxSigLeft = 13;
        rxState = RX_SIG;
        return true;
      }
      return true;
    }

    case RX_SIG:
      if (--rxSigLeft == 0) rxState = RX_IDLE;
      return false;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Aircraft state, as last reported by the autopilot
// ---------------------------------------------------------------------------
static bool     fcSeen        = false;   // have we ever had a valid heartbeat
static uint32_t fcLastHb      = 0;
static uint8_t  fcSysid       = 1;
static uint8_t  fcCompid      = 1;
static uint8_t  fcType        = 0;       // MAV_TYPE
static uint8_t  fcAutopilot   = 0;
static uint8_t  fcBaseMode    = 0;
static uint32_t fcCustomMode  = 0;
static uint8_t  fcSysStatus   = 0;       // MAV_STATE

static bool     armed         = false;
static bool     inAir         = false;
static uint32_t armedAt       = 0;
static uint32_t tookOffAt     = 0;

static int32_t  lat           = 0;       // degE7
static int32_t  lon           = 0;
static int32_t  altMslMm      = 0;
static int32_t  altRelMm      = 0;
static int16_t  vxCms = 0, vyCms = 0, vzCms = 0;
static uint16_t hdgCdeg       = 0;

static uint8_t  gpsFix        = 0;
static uint8_t  sats          = 0;
static uint16_t hdopCm        = 9999;
static uint16_t vdopCm        = 9999;

static float    rollRad = 0, pitchRad = 0, yawRad = 0;

static uint16_t battMv        = 0;
static int16_t  battCa        = -1;      // centi-amps; -1 = not measured
static int8_t   battPct       = -1;
static float    battConsumedMah = 0;

static float    groundSpeed   = 0;       // m/s
static float    airSpeed      = 0;
static float    climbRate     = 0;       // m/s
static int16_t  throttlePct   = 0;

static bool     homeSet       = false;
static int32_t  homeLat = 0, homeLon = 0;
static int32_t  homeAltMm = 0;

static uint16_t missionSeq    = 0;
static uint16_t missionCount  = 0;

static bool     ekfOk         = true;
static uint16_t ekfFlags      = 0;

static char     lastStatusText[64] = {0};
static uint8_t  lastStatusSeverity = 6;
static uint32_t lastStatusAt  = 0;

static uint32_t bootId        = 0;

/** Rolling count of MAVLink commands the autopilot rejected. */
static uint32_t cmdRejected   = 0;
static uint32_t cmdAccepted   = 0;

// ---------------------------------------------------------------------------
// Settings (NVS)
// ---------------------------------------------------------------------------
static uint32_t mavBaud       = 57600;
static uint16_t trackHz       = 5;       // position samples per second in flight
static uint16_t batchSize     = 10;      // records per publish
static uint16_t minBattPct    = 25;      // preflight floor
static uint16_t minSats       = 8;       // preflight floor
static uint16_t maxHdopCm     = 200;     // preflight ceiling (2.00)
static uint16_t maxAltM       = 120;     // 120 m — the DGCA/EASA ceiling
static uint16_t maxRangeM     = 500;     // soft geofence radius
static bool     requireHome   = true;
static bool     allowArm      = true;    // master arm-permit from the ground
static uint16_t linkLostSec   = 15;      // report link loss after this

static void saveSettings() {
  prefs.begin("drone", false);
  prefs.putUInt("baud", mavBaud);
  prefs.putUShort("hz", trackHz);
  prefs.putUShort("batch", batchSize);
  prefs.putUShort("minBatt", minBattPct);
  prefs.putUShort("minSats", minSats);
  prefs.putUShort("maxHdop", maxHdopCm);
  prefs.putUShort("maxAlt", maxAltM);
  prefs.putUShort("maxRange", maxRangeM);
  prefs.putBool("reqHome", requireHome);
  prefs.putBool("allowArm", allowArm);
  prefs.putUShort("linkLost", linkLostSec);
  prefs.end();
}

static void loadSettings() {
  prefs.begin("drone", true);
  mavBaud     = prefs.getUInt("baud", mavBaud);
  trackHz     = prefs.getUShort("hz", trackHz);
  batchSize   = prefs.getUShort("batch", batchSize);
  minBattPct  = prefs.getUShort("minBatt", minBattPct);
  minSats     = prefs.getUShort("minSats", minSats);
  maxHdopCm   = prefs.getUShort("maxHdop", maxHdopCm);
  maxAltM     = prefs.getUShort("maxAlt", maxAltM);
  maxRangeM   = prefs.getUShort("maxRange", maxRangeM);
  requireHome = prefs.getBool("reqHome", requireHome);
  allowArm    = prefs.getBool("allowArm", allowArm);
  linkLostSec = prefs.getUShort("linkLost", linkLostSec);
  prefs.end();

  if (trackHz < 1) trackHz = 1;
  if (trackHz > 10) trackHz = 10;
  if (batchSize < 1) batchSize = 1;
  if (batchSize > 20) batchSize = 20;
  if (maxAltM < 5) maxAltM = 5;
}

// ---------------------------------------------------------------------------
// Flight mode names
//
// The autopilot reports a number whose meaning depends on the vehicle type and
// the firmware family. Translating it here rather than in the app is deliberate:
// this is the only place that knows which autopilot answered.
// ---------------------------------------------------------------------------
static const char *apmCopterMode(uint32_t m) {
  switch (m) {
    case 0:  return "stabilize";
    case 1:  return "acro";
    case 2:  return "althold";
    case 3:  return "auto";
    case 4:  return "guided";
    case 5:  return "loiter";
    case 6:  return "rtl";
    case 7:  return "circle";
    case 9:  return "land";
    case 11: return "drift";
    case 13: return "sport";
    case 14: return "flip";
    case 15: return "autotune";
    case 16: return "poshold";
    case 17: return "brake";
    case 18: return "throw";
    case 20: return "guided-nogps";
    case 21: return "smartrtl";
    case 22: return "flowhold";
    case 23: return "follow";
    case 24: return "zigzag";
    case 27: return "auto-rtl";
    default: return "unknown";
  }
}

/** Normalised mode index for the packed track record. */
static uint8_t modeCode(const char *name) {
  if (!strcmp(name, "stabilize")) return 1;
  if (!strcmp(name, "althold"))   return 2;
  if (!strcmp(name, "loiter"))    return 3;
  if (!strcmp(name, "poshold"))   return 4;
  if (!strcmp(name, "guided"))    return 5;
  if (!strcmp(name, "auto"))      return 6;
  if (!strcmp(name, "rtl"))       return 7;
  if (!strcmp(name, "smartrtl"))  return 8;
  if (!strcmp(name, "land"))      return 9;
  if (!strcmp(name, "brake"))     return 10;
  if (!strcmp(name, "circle"))    return 11;
  if (!strcmp(name, "acro"))      return 12;
  return 0;
}

static const char *currentMode() {
  return apmCopterMode(fcCustomMode);
}

// ---------------------------------------------------------------------------
// Distance from home — needed for the soft geofence and for the track record
// ---------------------------------------------------------------------------
static float distanceFromHomeM() {
  if (!homeSet || (lat == 0 && lon == 0)) return 0;
  // Equirectangular approximation. At the ranges a geofence cares about
  // (hundreds of metres) the error against haversine is millimetres, and it
  // avoids three trig calls per sample on a board that is also parsing a
  // 57600-baud serial stream.
  const float R = 6371000.0f;
  float lat1 = (float)homeLat * 1e-7f * (float)DEG_TO_RAD;
  float lat2 = (float)lat * 1e-7f * (float)DEG_TO_RAD;
  float dLat = lat2 - lat1;
  float dLon = ((float)lon - (float)homeLon) * 1e-7f * (float)DEG_TO_RAD;
  float x = dLon * cosf((lat1 + lat2) * 0.5f);
  return sqrtf(dLat * dLat + x * x) * R;
}

// ---------------------------------------------------------------------------
// The packed track record published on cv/<id>/track
//
// Mirrored by platform/api/src/drone/track.ts. Both carry the record size on
// the wire so that a firmware that grows the record does not silently misalign
// an older parser — it gets skipped instead.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Track batching. The record layout is in drone-link.h, shared with the parser.
// ---------------------------------------------------------------------------
static TrackRec  trackBuf[TRACK_BATCH_MAX];
static uint8_t   trackFill = 0;
static uint32_t  trackSeq  = 0;

static bool fenceBreached = false;
static bool failsafeActive = false;

static void flushTrack() {
  if (trackFill == 0 || !cv.online()) { trackFill = 0; return; }
  TrackHeader h;
  memcpy(h.magic, "CVDT", 4);
  h.ver      = 1;
  h.count    = trackFill;
  h.recBytes = sizeof(TrackRec);
  h.flags    = (uint8_t)((inAir ? 0x01 : 0) | (armed ? 0x02 : 0));
  h.bootId   = bootId;
  h.seq      = trackSeq++;
  cv.publishBinary("track", (const uint8_t *)trackBuf, sizeof(TrackRec) * trackFill,
                   (const uint8_t *)&h, sizeof(h));
  trackFill = 0;
}

static void sampleTrack() {
  if (trackFill >= batchSize || trackFill >= TRACK_BATCH_MAX) flushTrack();
  TrackRec &r = trackBuf[trackFill];
  r.ms        = millis();
  r.lat       = lat;
  r.lon       = lon;
  long relDm  = altRelMm / 100;
  r.altRelDm  = (int16_t)constrain(relDm, -32768L, 32767L);
  long mslM   = altMslMm / 1000;
  r.altMslM   = (int16_t)constrain(mslM, -32768L, 32767L);
  r.hdgCdeg   = hdgCdeg > 35999 ? 0 : hdgCdeg;
  float gs    = groundSpeed * 100.0f;
  r.gspdCms   = (uint16_t)constrain(gs, 0.0f, 65535.0f);
  r.vspdCms   = (int16_t)constrain(climbRate * 100.0f, -32768.0f, 32767.0f);
  r.battMv    = battMv;
  r.battCa    = battCa;
  r.battPct   = battPct;
  r.sats      = sats;
  r.fix       = gpsFix;
  r.mode      = modeCode(currentMode());
  r.rollCdeg  = (int16_t)constrain(rollRad * 5729.578f, -32768.0f, 32767.0f);
  r.pitchCdeg = (int16_t)constrain(pitchRad * 5729.578f, -32768.0f, 32767.0f);
  r.flags     = (uint8_t)((armed ? 0x01 : 0) | (inAir ? 0x02 : 0) |
                          (failsafeActive ? 0x04 : 0) | (fenceBreached ? 0x08 : 0));
  r.linkPct   = (uint8_t)(cv.online() ? 100 : 0);
  r.hdopCm    = hdopCm;
  r.distHomeM = (uint16_t)constrain(distanceFromHomeM(), 0.0f, 65535.0f);
  trackFill++;
}

// ---------------------------------------------------------------------------
// Preflight gate
//
// Arming is the one irreversible thing this device can ask for: props spin, and
// everything after that is the aircraft's problem. So the checks are made here,
// where the answer is a refusal with a reason, rather than left to the operator
// noticing a red field on a dashboard.
//
// Every check is a condition the autopilot itself would also refuse on, with one
// exception — `allowArm` is ours, and exists so a fleet operator can ground an
// airframe from the ground without touching it.
// ---------------------------------------------------------------------------
struct Preflight preflight() {
  Preflight p; p.ok = false; p.reason[0] = 0;
  auto fail = [&](const char *why) { strncpy(p.reason, why, sizeof(p.reason) - 1); return p; };

  if (!allowArm)                       return fail("grounded by operator");
  if (!fcSeen)                         return fail("no autopilot detected");
  if (millis() - fcLastHb > 3000)      return fail("autopilot link lost");
  if (gpsFix < 3)                      return fail("no 3D GPS fix");
  if (sats < minSats)                  return fail("too few satellites");
  if (hdopCm > maxHdopCm)              return fail("GPS accuracy too poor");
  if (!ekfOk)                          return fail("position estimate unhealthy");
  if (requireHome && !homeSet)         return fail("home position not set");
  if (battPct >= 0 && battPct < (int)minBattPct) return fail("battery below preflight floor");
  if (battPct < 0 && battMv == 0)      return fail("no battery telemetry");
  p.ok = true;
  strncpy(p.reason, "ready", sizeof(p.reason) - 1);
  return p;
}

// ---------------------------------------------------------------------------
// Outbound MAVLink commands
// ---------------------------------------------------------------------------
static void sendCommandLong(uint16_t command, float p1, float p2, float p3,
                            float p4, float p5, float p6, float p7) {
  uint8_t b[33];
  memset(b, 0, sizeof(b));
  putF(b, 0,  p1); putF(b, 4,  p2); putF(b, 8,  p3); putF(b, 12, p4);
  putF(b, 16, p5); putF(b, 20, p6); putF(b, 24, p7);
  put16(b, 28, command);
  put8(b, 30, fcSysid);
  put8(b, 31, fcCompid);
  put8(b, 32, 0);            // confirmation
  mavSend(MSG_COMMAND_LONG, b, sizeof(b));
}

static void sendSetMode(uint32_t customMode) {
  uint8_t b[6];
  put32(b, 0, customMode);
  put8(b, 4, fcSysid);
  // MAV_MODE_FLAG_CUSTOM_MODE_ENABLED — without it the custom mode is ignored
  // and the aircraft silently stays in whatever mode it was in.
  put8(b, 5, 1);
  mavSend(MSG_SET_MODE, b, sizeof(b));
}

static void sendHeartbeat() {
  uint8_t b[9];
  memset(b, 0, sizeof(b));
  put32(b, 0, 0);            // custom_mode
  put8(b, 4, 18);            // MAV_TYPE_ONBOARD_CONTROLLER
  put8(b, 5, 8);             // MAV_AUTOPILOT_INVALID — we are not an autopilot
  put8(b, 6, 0);             // base_mode
  put8(b, 7, 4);             // MAV_STATE_ACTIVE
  put8(b, 8, 3);             // mavlink_version
  mavSend(MSG_HEARTBEAT, b, sizeof(b));
}

/** Guided-mode reposition. Only ever sent as a complete destination. */
static void sendGoto(int32_t latE7, int32_t lonE7, float altRelM) {
  uint8_t b[53];
  memset(b, 0, sizeof(b));
  put32(b, 0, millis());
  putI32(b, 4, latE7);
  putI32(b, 8, lonE7);
  putF(b, 12, altRelM);
  putF(b, 16, 0); putF(b, 20, 0); putF(b, 24, 0);      // velocity
  putF(b, 28, 0); putF(b, 32, 0); putF(b, 36, 0);      // acceleration
  putF(b, 40, 0);                                       // yaw
  putF(b, 44, 0);                                       // yaw rate
  // type_mask: ignore everything except position (bits 0-2 clear).
  put16(b, 48, 0b0000111111111000);
  put8(b, 50, fcSysid);
  put8(b, 51, fcCompid);
  put8(b, 52, 6);            // MAV_FRAME_GLOBAL_RELATIVE_ALT_INT
  mavSend(MSG_SET_POSITION_TARGET_GLOBAL_INT, b, sizeof(b));
}

// ---------------------------------------------------------------------------
// Inbound MAVLink handling
// ---------------------------------------------------------------------------
static void handleMav(const MavMsg &m) {
  // Ignore other companions/ground stations chattering on the same bus.
  if (m.compid == CV_COMPID && m.sysid == CV_SYSID) return;

  switch (m.msgid) {
    case MSG_HEARTBEAT: {
      uint8_t type = rd8(m.payload, 4);
      // Only the vehicle's own heartbeat counts. A SiK radio and a gimbal both
      // emit heartbeats, and taking theirs as the autopilot's would make a dead
      // flight controller look alive.
      if (type == 6 /* GCS */ || type == 18 /* onboard controller */) return;
      fcSeen = true;
      fcLastHb = millis();
      fcSysid = m.sysid;
      fcCompid = m.compid;
      fcType = type;
      fcAutopilot = rd8(m.payload, 5);
      fcBaseMode = rd8(m.payload, 6);
      fcCustomMode = rd32(m.payload, 0);
      fcSysStatus = rd8(m.payload, 7);

      bool nowArmed = (fcBaseMode & 0x80) != 0;
      if (nowArmed && !armed) { armedAt = millis(); tookOffAt = 0; }
      if (!nowArmed && armed) { inAir = false; }
      armed = nowArmed;
      // MAV_STATE_CRITICAL / EMERGENCY is the autopilot telling us a failsafe
      // is running. We report it; we never try to handle it.
      failsafeActive = (fcSysStatus == 5 || fcSysStatus == 6);
      break;
    }

    case MSG_SYS_STATUS:
      battMv = rd16(m.payload, 14);
      battCa = rdI16(m.payload, 16);
      battPct = (int8_t)m.payload[18];
      break;

    case MSG_BATTERY_STATUS: {
      // current_consumed is at offset 6 in mAh.
      battConsumedMah = (float)rdI32(m.payload, 6);
      int8_t pct = (int8_t)m.payload[35];
      if (pct >= 0) battPct = pct;
      break;
    }

    case MSG_GPS_RAW_INT:
      gpsFix = rd8(m.payload, 28);
      sats = rd8(m.payload, 29);
      hdopCm = rd16(m.payload, 24);
      vdopCm = rd16(m.payload, 26);
      break;

    case MSG_ATTITUDE:
      rollRad  = rdF(m.payload, 4);
      pitchRad = rdF(m.payload, 8);
      yawRad   = rdF(m.payload, 12);
      break;

    case MSG_GLOBAL_POSITION_INT:
      lat      = rdI32(m.payload, 4);
      lon      = rdI32(m.payload, 8);
      altMslMm = rdI32(m.payload, 12);
      altRelMm = rdI32(m.payload, 16);
      vxCms    = rdI16(m.payload, 20);
      vyCms    = rdI16(m.payload, 22);
      vzCms    = rdI16(m.payload, 24);
      hdgCdeg  = rd16(m.payload, 26);
      break;

    case MSG_VFR_HUD:
      airSpeed    = rdF(m.payload, 0);
      groundSpeed = rdF(m.payload, 4);
      climbRate   = rdF(m.payload, 8);
      throttlePct = (int16_t)rd16(m.payload, 16);
      break;

    case MSG_HOME_POSITION:
      homeLat = rdI32(m.payload, 0);
      homeLon = rdI32(m.payload, 4);
      homeAltMm = rdI32(m.payload, 8);
      homeSet = true;
      break;

    case MSG_MISSION_CURRENT:
      missionSeq = rd16(m.payload, 0);
      break;

    case MSG_MISSION_COUNT:
      missionCount = rd16(m.payload, 0);
      break;

    case MSG_EKF_STATUS_REPORT: {
      ekfFlags = rd16(m.payload, 0);
      // Bits 1 (velocity horiz), 2 (pos horiz rel), 4 (pos horiz abs) plus bit 0
      // (attitude). A missing horizontal position estimate is the one that makes
      // a GPS mode unsafe, so it is the one gating arm.
      const uint16_t need = (1 << 0) | (1 << 1) | (1 << 4);
      ekfOk = (ekfFlags & need) == need;
      break;
    }

    case MSG_COMMAND_ACK: {
      uint8_t result = rd8(m.payload, 2);
      if (result == 0) cmdAccepted++; else cmdRejected++;
      break;
    }

    case MSG_STATUSTEXT: {
      lastStatusSeverity = rd8(m.payload, 0);
      memset(lastStatusText, 0, sizeof(lastStatusText));
      memcpy(lastStatusText, m.payload + 1, 50);
      lastStatusText[50] = 0;
      lastStatusAt = millis();
      // Severity 0-3 is emergency/alert/critical/error. Those are the ones a
      // person on the ground has to see, so they go out immediately rather than
      // waiting for the next state publish.
      if (lastStatusSeverity <= 3 && cv.online()) {
        JsonDocument d;
        d["kind"] = "fc-alert";
        d["severity"] = lastStatusSeverity;
        d["text"] = lastStatusText;
        cv.publishTelemetry(d.as<JsonObjectConst>());
      }
      break;
    }

    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// State published to the cloud
// ---------------------------------------------------------------------------
static const char *fixName(uint8_t f) {
  switch (f) {
    case 0: case 1: return "none";
    case 2: return "2d";
    case 3: return "3d";
    case 4: return "dgps";
    case 5: return "rtk-float";
    case 6: return "rtk-fixed";
    default: return "none";
  }
}

static void publishFullState() {
  Preflight p = preflight();
  cv.set("board", CV_BOARD_NAME);
  cv.set("link", fcSeen && (millis() - fcLastHb < (uint32_t)linkLostSec * 1000));
  cv.set("armed", armed);
  cv.set("inAir", inAir);
  cv.set("mode", currentMode());
  cv.set("fix", fixName(gpsFix));
  cv.set("sats", (int)sats);
  cv.set("hdop", (float)hdopCm / 100.0f);
  cv.set("lat", (float)((double)lat * 1e-7));
  cv.set("lon", (float)((double)lon * 1e-7));
  cv.set("alt", (float)altRelMm / 1000.0f);
  cv.set("altMsl", (float)altMslMm / 1000.0f);
  cv.set("heading", (int)(hdgCdeg / 100));
  cv.set("speed", groundSpeed);
  cv.set("climb", climbRate);
  cv.set("battV", (float)battMv / 1000.0f);
  cv.set("battPct", (int)battPct);
  cv.set("battA", battCa < 0 ? 0.0f : (float)battCa / 100.0f);
  cv.set("used", battConsumedMah);
  cv.set("homeSet", homeSet);
  cv.set("distHome", distanceFromHomeM());
  cv.set("ready", p.ok);
  cv.set("readyReason", p.reason);
  cv.set("failsafe", failsafeActive);
  cv.set("fence", fenceBreached);
  cv.set("ekf", ekfOk);
  cv.set("missionSeq", (int)missionSeq);
  cv.set("missionCount", (int)missionCount);
  cv.set("allowArm", allowArm);
  cv.set("maxAlt", (int)maxAltM);
  cv.set("maxRange", (int)maxRangeM);
  cv.set("trackHz", (int)trackHz);
  cv.set("flightSec", armed ? (int)((millis() - armedAt) / 1000) : 0);
  cv.set("mavGood", (long)rxGood);
  cv.set("mavBad", (long)rxDropped);
  cv.publishStateNow();
}

/** Emit a refusal the operator can read, rather than failing silently. */
static void refuse(const char *action, const char *why) {
  JsonDocument d;
  d["kind"] = "refused";
  d["action"] = action;
  d["reason"] = why;
  cv.publishTelemetry(d.as<JsonObjectConst>());
  cv.set("lastRefusal", why);
  cv.publishStateNow();
}

// ---------------------------------------------------------------------------
// Commands from the cloud
// ---------------------------------------------------------------------------
static void onCommand(const String &action, JsonObjectConst p) {
  if (action == "set") {
    if (p["allowArm"].is<bool>()) { allowArm = p["allowArm"].as<bool>(); }
    if (p["trackHz"].is<int>())   { trackHz = constrain(p["trackHz"].as<int>(), 1, 10); }
    if (p["batch"].is<int>())     { batchSize = constrain(p["batch"].as<int>(), 1, TRACK_BATCH_MAX); }
    if (p["minBatt"].is<int>())   { minBattPct = constrain(p["minBatt"].as<int>(), 0, 90); }
    if (p["minSats"].is<int>())   { minSats = constrain(p["minSats"].as<int>(), 4, 30); }
    if (p["maxHdop"].is<int>())   { maxHdopCm = constrain(p["maxHdop"].as<int>(), 50, 999); }
    if (p["maxAlt"].is<int>())    { maxAltM = constrain(p["maxAlt"].as<int>(), 5, 500); }
    if (p["maxRange"].is<int>())  { maxRangeM = constrain(p["maxRange"].as<int>(), 10, 5000); }
    if (p["requireHome"].is<bool>()) { requireHome = p["requireHome"].as<bool>(); }
    saveSettings();
    publishFullState();
    return;
  }

  if (action == "arm") {
    Preflight pf = preflight();
    if (!pf.ok) { refuse("arm", pf.reason); return; }
    sendCommandLong(CMD_COMPONENT_ARM_DISARM, 1, 0, 0, 0, 0, 0, 0);
    return;
  }

  if (action == "disarm") {
    /*
     * Disarming in flight cuts the motors. That is a legitimate last resort —
     * an aircraft heading for a crowd is better dropped where it is — but it is
     * never what "disarm" means when the operator is tidying up after a landing,
     * and the two are one tap apart in every ground station ever built.
     *
     * So in-flight disarm requires an explicit force flag from the caller, and
     * is announced loudly whether or not it is taken.
     */
    bool force = p["force"].is<bool>() && p["force"].as<bool>();
    if (inAir && !force) { refuse("disarm", "aircraft is airborne — needs force"); return; }
    if (inAir && force) {
      JsonDocument d;
      d["kind"] = "emergency-stop";
      d["alt"] = (float)altRelMm / 1000.0f;
      cv.publishTelemetry(d.as<JsonObjectConst>());
    }
    sendCommandLong(CMD_COMPONENT_ARM_DISARM, 0, force ? 21196.0f : 0.0f, 0, 0, 0, 0, 0);
    return;
  }

  if (action == "takeoff") {
    float alt = p["alt"].is<float>() || p["alt"].is<int>() ? p["alt"].as<float>() : 10.0f;
    if (alt > (float)maxAltM) { refuse("takeoff", "above configured altitude ceiling"); return; }
    if (alt <= 0) { refuse("takeoff", "altitude must be positive"); return; }
    Preflight pf = preflight();
    if (!armed && !pf.ok) { refuse("takeoff", pf.reason); return; }
    // Guided first: a takeoff command in stabilize is accepted and ignored, so
    // the aircraft sits there with the operator watching a command that was
    // acknowledged and did nothing.
    sendSetMode(4);
    if (!armed) sendCommandLong(CMD_COMPONENT_ARM_DISARM, 1, 0, 0, 0, 0, 0, 0);
    sendCommandLong(CMD_NAV_TAKEOFF, 0, 0, 0, 0, 0, 0, alt);
    return;
  }

  if (action == "land")  { sendCommandLong(CMD_NAV_LAND, 0, 0, 0, 0, 0, 0, 0); return; }
  if (action == "rtl")   { sendCommandLong(CMD_NAV_RETURN_TO_LAUNCH, 0, 0, 0, 0, 0, 0, 0); return; }
  if (action == "loiter") { sendSetMode(5); return; }
  if (action == "brake")  { sendSetMode(17); return; }

  if (action == "goto") {
    if (!p["lat"].is<float>() && !p["lat"].is<double>() && !p["lat"].is<int>()) {
      refuse("goto", "no coordinate"); return;
    }
    double glat = p["lat"].as<double>();
    double glon = p["lon"].as<double>();
    float galt = p["alt"].is<float>() || p["alt"].is<int>() ? p["alt"].as<float>()
                                                           : (float)altRelMm / 1000.0f;
    if (galt > (float)maxAltM) { refuse("goto", "above configured altitude ceiling"); return; }
    if (glat < -90 || glat > 90 || glon < -180 || glon > 180) {
      refuse("goto", "coordinate out of range"); return;
    }
    if (!armed || !inAir) { refuse("goto", "aircraft is not airborne"); return; }

    int32_t tlat = (int32_t)llround(glat * 1e7);
    int32_t tlon = (int32_t)llround(glon * 1e7);
    // Soft geofence, checked against the *destination* rather than the current
    // position. Refusing after the aircraft has already set off is a warning,
    // not a fence.
    if (homeSet && maxRangeM > 0) {
      int32_t saveLat = lat, saveLon = lon;
      lat = tlat; lon = tlon;
      float d = distanceFromHomeM();
      lat = saveLat; lon = saveLon;
      if (d > (float)maxRangeM) { refuse("goto", "destination outside geofence"); return; }
    }
    sendSetMode(4);
    sendGoto(tlat, tlon, galt);
    return;
  }

  if (action == "mission") {
    const char *op = p["op"].is<const char *>() ? p["op"].as<const char *>() : "start";
    if (!strcmp(op, "start")) {
      if (missionCount == 0) { refuse("mission", "no mission loaded"); return; }
      Preflight pf = preflight();
      if (!armed && !pf.ok) { refuse("mission", pf.reason); return; }
      sendSetMode(3);                                     // AUTO
      sendCommandLong(CMD_MISSION_START, 0, 0, 0, 0, 0, 0, 0);
    } else if (!strcmp(op, "pause")) {
      sendSetMode(5);                                     // LOITER holds position
    } else if (!strcmp(op, "resume")) {
      sendSetMode(3);
    }
    return;
  }

  if (action == "mode") {
    // A raw mode change is allowed but only from a named list. Passing an
    // arbitrary integer through to the autopilot would let a typo select ACRO
    // on an aircraft in the air.
    const char *want = p["mode"].is<const char *>() ? p["mode"].as<const char *>() : "";
    if (!strcmp(want, "loiter"))        sendSetMode(5);
    else if (!strcmp(want, "althold"))  sendSetMode(2);
    else if (!strcmp(want, "poshold"))  sendSetMode(16);
    else if (!strcmp(want, "guided"))   sendSetMode(4);
    else if (!strcmp(want, "auto"))     sendSetMode(3);
    else if (!strcmp(want, "rtl"))      sendSetMode(6);
    else if (!strcmp(want, "smartrtl")) sendSetMode(21);
    else if (!strcmp(want, "land"))     sendSetMode(9);
    else if (!strcmp(want, "brake"))    sendSetMode(17);
    else refuse("mode", "mode not permitted from the ground");
    return;
  }

  if (action == "state") { publishFullState(); return; }
}

// ---------------------------------------------------------------------------
// setup / loop
// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(100);

  bootId = esp_random();
  loadSettings();

  Mav.begin(mavBaud, SERIAL_8N1, MAV_RX_PIN, MAV_TX_PIN);

#if (CV_STATUS_LED) >= 0
  pinMode(CV_STATUS_LED, OUTPUT);
  digitalWrite(CV_STATUS_LED, LOW);
#endif
#if (CV_RESET_BTN) >= 0
  cv.setResetButton(CV_RESET_BTN);
#endif

  cv.onCommand(onCommand);
  // 1 Hz summary. The 10 Hz detail goes to `track`, not here.
  cv.setInterval(1000);
  cv.begin();

  publishFullState();
}

void loop() {
  cv.loop();

  // Drain the autopilot link. Bounded per iteration so a burst on the UART
  // cannot starve the MQTT client — which is how a bridge ends up with perfect
  // telemetry it never manages to send.
  int budget = 512;
  while (Mav.available() && budget-- > 0) {
    if (mavParse((uint8_t)Mav.read())) handleMav(rxMsg);
  }

  const uint32_t now = millis();

  // GCS heartbeat to the autopilot, 1 Hz.
  static uint32_t lastHb = 0;
  if (now - lastHb >= 1000) { lastHb = now; if (fcSeen) sendHeartbeat(); }

  /*
   * "In the air" is derived rather than reported, because no MAVLink message
   * says it directly. Armed plus either half a metre of altitude or a metre a
   * second of climb is the same test a ground station makes. It latches on and
   * only clears on disarm: an aircraft that descends to 0.4 m to land is still
   * airborne, and treating it as landed would re-enable the commands that are
   * refused in flight at the exact moment they are most dangerous.
   */
  if (armed && !inAir) {
    if (altRelMm > 500 || climbRate > 1.0f) { inAir = true; tookOffAt = now; }
  }

  // Soft geofence — advisory. The hard fence lives in the autopilot, which is
  // the only thing that can act on it in time.
  static uint32_t lastFenceCheck = 0;
  if (now - lastFenceCheck >= 500) {
    lastFenceCheck = now;
    bool breach = false;
    if (inAir && homeSet) {
      if (maxRangeM > 0 && distanceFromHomeM() > (float)maxRangeM) breach = true;
      if (maxAltM > 0 && altRelMm > (int32_t)maxAltM * 1000) breach = true;
    }
    if (breach != fenceBreached) {
      fenceBreached = breach;
      JsonDocument d;
      d["kind"] = "fence";
      d["breach"] = breach;
      d["dist"] = distanceFromHomeM();
      d["alt"] = (float)altRelMm / 1000.0f;
      cv.publishTelemetry(d.as<JsonObjectConst>());
      publishFullState();
    }
  }

  // Position sampling, only while it is worth having.
  static uint32_t lastSample = 0;
  const uint32_t samplePeriod = inAir ? (1000u / trackHz) : 1000u;
  if (now - lastSample >= samplePeriod) {
    lastSample = now;
    if (fcSeen && (inAir || armed)) sampleTrack();
  }

  // Flush the batch when it is full, and at least once a second in flight so a
  // partly-filled batch is not sitting on the airframe when it goes into a lake.
  static uint32_t lastFlush = 0;
  if (trackFill >= batchSize || (trackFill > 0 && now - lastFlush >= 1000)) {
    lastFlush = now;
    flushTrack();
  }

  // Autopilot link watchdog. Reported, never acted on.
  static bool linkWasUp = false;
  bool linkUp = fcSeen && (now - fcLastHb < (uint32_t)linkLostSec * 1000);
  if (linkUp != linkWasUp) {
    linkWasUp = linkUp;
    publishFullState();
  }

  // Republish the summary when something a person would notice has changed,
  // rather than only on the interval.
  static bool lastArmed = false; static bool lastAir = false;
  static uint32_t lastMode = 0xFFFFFFFF;
  if (armed != lastArmed || inAir != lastAir || fcCustomMode != lastMode) {
    lastArmed = armed; lastAir = inAir; lastMode = fcCustomMode;
    // A landing is the end of a flight; flush the tail of the track with it.
    if (!armed) flushTrack();
    publishFullState();
  }

#if (CV_STATUS_LED) >= 0
  // Solid when armed, slow blink when linked and idle, fast blink when the
  // autopilot is missing. Readable from outside the airframe, which is where
  // the person deciding whether to walk up to it is standing.
  static uint32_t ledAt = 0; static bool ledOn = false;
  uint32_t period = armed ? 0 : (linkUp ? 1000 : 150);
  if (period == 0) { digitalWrite(CV_STATUS_LED, HIGH); }
  else if (now - ledAt >= period) { ledAt = now; ledOn = !ledOn; digitalWrite(CV_STATUS_LED, ledOn); }
#endif
}
