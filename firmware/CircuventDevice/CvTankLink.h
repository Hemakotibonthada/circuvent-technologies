/*
 * CvTankLink — the radio link between a tank-top sensor and a pump starter.
 * ========================================================================
 *
 * WHY THIS EXISTS
 * ---------------
 * The overhead tank is on the roof; the pump and its starter are at ground
 * level. The original WaterTank Duo wired an ultrasonic sensor straight to the
 * controller, which means a four-core cable running the height of the building.
 * In practice that cable is the least reliable part of the product: echo
 * timing is a microsecond-scale signal being carried tens of metres beside
 * mains wiring, the run is a lightning path onto the controller, and the
 * install is a drilling job most electricians would rather not do.
 *
 * So the sensor becomes its own battery-powered unit on the tank, and sends
 * readings down by radio.
 *
 * WHY LoRa AT 433 MHz
 * -------------------
 * The obstacle is a reinforced concrete roof slab, sometimes several floors.
 * 2.4 GHz (nRF24, BLE, WiFi) is heavily attenuated by wet concrete and would
 * also be competing with the WiFi the starter itself depends on. 433 MHz
 * penetrates far better, and LoRa's spreading gain buys tens of dB more link
 * budget on top — which is what turns "works on the bench" into "works from
 * the roof of a four-storey building".
 *
 * THE RULE THAT MATTERS MOST
 * --------------------------
 * A reading that has stopped arriving must never look like a reading that is
 * still arriving.
 *
 * If the radio goes quiet and the starter keeps acting on the last level it
 * heard, both failure directions are damaging:
 *
 *   - Last heard "tank low"  -> the pump runs into an already-full tank and
 *                               overflows it, for as long as nobody notices.
 *   - Last heard "tank full" -> the pump never starts and the tank runs dry.
 *
 * Neither raises an error anywhere. The controller is behaving exactly as
 * instructed by data that stopped being true hours ago. So freshness is not a
 * nicety here, it is the safety property, and it is enforced in one place —
 * `cvTankReadingFresh()` — that both the pump logic and the reported state
 * must go through.
 *
 * AUTHENTICATION
 * --------------
 * An unauthenticated packet on an open band is an invitation: anyone within
 * range could assert "tank empty" and run a neighbour's pump dry, or "tank
 * full" and leave them without water. Every packet therefore carries a
 * truncated HMAC-SHA512-256 over its own contents, keyed by a secret shared at
 * pairing time, plus a rolling sequence number so a captured packet cannot be
 * replayed later.
 *
 * The MAC is truncated to 8 bytes. That is 64 bits against forgery, which is
 * far beyond what an attacker with a radio and a plausible amount of patience
 * can brute force, and it keeps the packet inside a single short LoRa frame —
 * airtime is what costs battery on the sensor side.
 */

#ifndef CV_TANK_LINK_H
#define CV_TANK_LINK_H

#include <Arduino.h>
#include <string.h>

/*
 * tweetnacl.c is C, so its symbols must not be name-mangled.
 *
 * CircuventDevice.h wraps this include the same way. Repeating it here rather
 * than depending on that one having been included first is what lets the tank
 * sensor use this header on its own — it has no need for the rest of the
 * device library, and pulling in WiFi and MQTT for a battery unit that speaks
 * neither would be absurd.
 *
 * The guard makes a double include harmless if both headers are used together.
 */
#ifndef TWEETNACL_H
extern "C" {
#include "tweetnacl.h"
}
#endif

// ---------------------------------------------------------------- protocol --

/**
 * Bumped only for a wire-format change. Receivers reject anything else, so a
 * half-upgraded pair refuses to talk rather than misreading each other's
 * fields — which matters here because the two units update separately and a
 * sensor on a roof can sit a version behind its starter for a while.
 *
 * v2 added the downlink (starter -> sensor).
 */
#define CV_TANK_PROTO_VERSION 2

/** 'C','V','T' — a cheap first-pass filter before spending time on the MAC. */
#define CV_TANK_MAGIC0 0x43
#define CV_TANK_MAGIC1 0x56
#define CV_TANK_MAGIC2 0x54

#define CV_TANK_KEY_BYTES 32
#define CV_TANK_MAC_BYTES 8

/** Packet kinds. */
enum : uint8_t {
  CV_TANK_MSG_READING = 1,   ///< Routine level report, sensor -> starter.
  CV_TANK_MSG_PAIR = 2,      ///< Pairing offer, sensor -> starter, only in a window.
  CV_TANK_MSG_DOWNLINK = 3,  ///< Starter -> sensor. Config, or "measure now".
};

/** Sensor-side fault flags, carried so the starter can explain itself. */
enum : uint8_t {
  CV_TANK_FLAG_SENSOR_FAULT = 1 << 0,  ///< Echo out of range or absent.
  CV_TANK_FLAG_LOW_BATTERY = 1 << 1,   ///< Below the replace-me threshold.
  CV_TANK_FLAG_TAMPER = 1 << 2,        ///< Enclosure opened, if fitted.
};

/** Downlink instructions, starter -> sensor. */
enum : uint8_t {
  CV_TANK_DOWN_PAIR_ACK = 1 << 0,   ///< "I have you." Ends the sensor's pairing window.
  CV_TANK_DOWN_MEASURE_NOW = 1 << 1, ///< Take a reading and send it immediately.
  CV_TANK_DOWN_IDENTIFY = 1 << 2,    ///< Blink, so an installer can find the right unit.
};

/*
 * The wire format. Packed and fixed-size: both ends are our own firmware, and
 * a self-describing format would cost airtime, which on the sensor side is
 * paid for in battery.
 *
 * `seq` is 32-bit and never resets in normal operation. It is what makes a
 * captured packet useless later — the receiver refuses anything at or below
 * the highest sequence it has already accepted.
 */
struct __attribute__((packed)) CvTankPacket {
  uint8_t magic[3];
  uint8_t version;
  uint8_t msgType;
  uint8_t pairId;      ///< Which sensor/starter pair, so neighbours don't cross.
  uint16_t levelMm;    ///< Sensor-to-water distance in mm. Raw, not a percentage.
  uint16_t batteryMv;
  uint8_t flags;
  uint8_t reserved;    ///< Keeps the struct 4-byte aligned and leaves room.
  uint32_t seq;
  uint8_t mac[CV_TANK_MAC_BYTES];
};

/** Bytes covered by the MAC: everything before the MAC itself. */
#define CV_TANK_SIGNED_BYTES (sizeof(CvTankPacket) - CV_TANK_MAC_BYTES)

/*
 * Starter -> sensor.
 *
 * The link was one-way to begin with, which cost more than it saved. The
 * sensor could not be told anything: changing how often it reports, or asking
 * it for a reading now, or even confirming that pairing had worked, all meant
 * physically retrieving a unit from a roof.
 *
 * Worse, pairing had no acknowledgement at all. The sensor transmitted for
 * sixty seconds and then declared itself paired whether or not anything had
 * heard it, so an installer got a confident "done" indication, climbed down,
 * found nothing worked, and climbed back up.
 *
 * Authenticated exactly like the uplink, with its own sequence counter — a
 * shared counter between two directions would have each side rejecting the
 * other's traffic as replays.
 */
struct __attribute__((packed)) CvTankDownlink {
  uint8_t magic[3];
  uint8_t version;
  uint8_t msgType;        ///< Always CV_TANK_MSG_DOWNLINK.
  uint8_t pairId;
  uint8_t instructions;   ///< CV_TANK_DOWN_* bits.
  uint8_t reserved;
  uint16_t reportIntervalS;  ///< 0 leaves the current cadence alone.
  uint32_t seq;
  uint8_t mac[CV_TANK_MAC_BYTES];
};

#define CV_TANK_DOWN_SIGNED_BYTES (sizeof(CvTankDownlink) - CV_TANK_MAC_BYTES)

// ------------------------------------------------------------------ timing --

/*
 * How often the sensor reports, and how long the starter waits before it stops
 * believing what it last heard.
 *
 * The report interval is a battery decision: a LoRa transmission costs far
 * more than the ultrasonic reading around it, so reporting is deliberately
 * infrequent. A tank's level simply does not change quickly — a pump filling a
 * 1000 litre tank takes many minutes, so a 30-second report is several samples
 * per useful change.
 *
 * The stale deadline allows several consecutive misses before giving up. One
 * lost packet is ordinary on any radio link — a passing vehicle, a neighbour's
 * transmission, a door closing on the line of sight — and treating a single
 * miss as a fault would have the pump refusing to run several times a day. Six
 * missed reports in a row is a link that is genuinely down.
 */
#define CV_TANK_REPORT_INTERVAL_MS 30000UL

/*
 * How many consecutive missed reports count as a dead link.
 *
 * Expressed as a multiplier rather than a fixed duration because the report
 * interval is now settable from the app. A fixed three-minute window silently
 * becomes "permanently stale" the moment somebody chooses a five-minute
 * cadence to save battery — the pump would stop running and the app would show
 * a dead sensor that is transmitting perfectly.
 *
 * Several misses, so one lost packet is not a fault: a passing vehicle, a
 * neighbour transmitting, a door closing on the line of sight. Not so many
 * that a genuinely dead sensor goes unnoticed for long.
 */
#define CV_TANK_STALE_MISSES 6UL
#define CV_TANK_STALE_MS (CV_TANK_REPORT_INTERVAL_MS * CV_TANK_STALE_MISSES)  // 3 minutes at the default

/*
 * How long the sensor listens after transmitting.
 *
 * This is the LoRaWAN Class A shape: the only moment a battery device can
 * cheaply be reachable is immediately after it has spoken, because the radio
 * is already powered and the far end knows to within a few milliseconds when
 * to reply.
 *
 * The cost is real but small. Receiving draws roughly a tenth of what
 * transmitting does, so 400 ms of listening is a fraction of the energy the
 * transmission before it just spent — a worthwhile trade for not having to
 * fetch a unit off a roof to change a setting.
 *
 * It must comfortably exceed the starter's turnaround. The starter polls its
 * radio every loop pass and replies as soon as it has accepted a reading, so
 * the real turnaround is a few milliseconds; the margin is for a starter busy
 * driving a contactor or reconnecting to MQTT.
 */
#define CV_TANK_RX_WINDOW_MS 400UL

/*
 * Bounds on a remotely-set report interval.
 *
 * A downlink is authenticated, so this is not about an attacker — it is about
 * a bug or a fat-fingered value bricking a unit that is physically hard to
 * reach. Zero would mean "never report", which reads as a dead sensor and
 * cannot be undone without a ladder; anything under a few seconds would flatten
 * the battery in days and violate the duty cycle expected on this band.
 */
#define CV_TANK_MIN_INTERVAL_S 10
#define CV_TANK_MAX_INTERVAL_S 900

inline uint16_t cvTankClampInterval(uint16_t s) {
  if (s < CV_TANK_MIN_INTERVAL_S) return CV_TANK_MIN_INTERVAL_S;
  if (s > CV_TANK_MAX_INTERVAL_S) return CV_TANK_MAX_INTERVAL_S;
  return s;
}

/*
 * The point at which we stop reporting a level at all, rather than reporting
 * it as stale.
 *
 * There is a real difference between "the last reading is a few minutes old"
 * (probably still roughly true; worth showing greyed out) and "the last
 * reading is from yesterday" (tells you nothing about the tank now, and
 * showing it invites someone to act on it).
 */
#define CV_TANK_ABANDON_MS (30UL * 60UL * 1000UL)  // 30 minutes

/** Pairing is physically initiated and deliberately short-lived. */
#define CV_TANK_PAIR_WINDOW_MS (60UL * 1000UL)

// ---------------------------------------------------------------- battery --

#define CV_TANK_BATT_FULL_MV 4200
#define CV_TANK_BATT_EMPTY_MV 3200
#define CV_TANK_BATT_LOW_MV 3450

/** Rough percentage from a lithium cell's terminal voltage. */
inline int cvTankBatteryPct(uint16_t mv) {
  if (mv >= CV_TANK_BATT_FULL_MV) return 100;
  if (mv <= CV_TANK_BATT_EMPTY_MV) return 0;
  long span = CV_TANK_BATT_FULL_MV - CV_TANK_BATT_EMPTY_MV;
  return (int)(((long)mv - CV_TANK_BATT_EMPTY_MV) * 100 / span);
}

// --------------------------------------------------------------- integrity --

/*
 * HMAC-SHA512, truncated.
 *
 * The bundled tweetnacl is a trimmed build: it provides crypto_hash (SHA-512)
 * but not crypto_auth. Rather than add primitives to a library that is
 * compiled into every device in the fleet — a change whose blast radius is
 * every product we sell — HMAC is constructed here from the hash that is
 * already there. It is the standard construction (RFC 2104), so there is
 * nothing novel to get wrong.
 *
 * SHA-512 has a 128-byte block, which is what fixes the pad size below.
 */
#define CV_TANK_HMAC_BLOCK 128
#define CV_TANK_HASH_BYTES 64

inline void cvTankHmac(uint8_t out[CV_TANK_HASH_BYTES], const uint8_t *msg, size_t msgLen,
                       const uint8_t key[CV_TANK_KEY_BYTES]) {
  uint8_t k[CV_TANK_HMAC_BLOCK];
  memset(k, 0, sizeof(k));
  // The key is 32 bytes, comfortably under the block size, so it is simply
  // zero-padded. (A longer key would need hashing first; ours never is.)
  memcpy(k, key, CV_TANK_KEY_BYTES);

  uint8_t inner[CV_TANK_HMAC_BLOCK + 64];
  uint8_t outer[CV_TANK_HMAC_BLOCK + CV_TANK_HASH_BYTES];

  for (size_t i = 0; i < CV_TANK_HMAC_BLOCK; i++) inner[i] = k[i] ^ 0x36;
  size_t n = msgLen > 64 ? 64 : msgLen;
  memcpy(inner + CV_TANK_HMAC_BLOCK, msg, n);

  uint8_t innerHash[CV_TANK_HASH_BYTES];
  crypto_hash(innerHash, inner, CV_TANK_HMAC_BLOCK + n);

  for (size_t i = 0; i < CV_TANK_HMAC_BLOCK; i++) outer[i] = k[i] ^ 0x5c;
  memcpy(outer + CV_TANK_HMAC_BLOCK, innerHash, CV_TANK_HASH_BYTES);

  crypto_hash(out, outer, CV_TANK_HMAC_BLOCK + CV_TANK_HASH_BYTES);
}

/** Truncated HMAC-SHA512 over the packet body. */
inline void cvTankSign(CvTankPacket &p, const uint8_t key[CV_TANK_KEY_BYTES]) {
  uint8_t full[CV_TANK_HASH_BYTES];
  cvTankHmac(full, (const uint8_t *)&p, CV_TANK_SIGNED_BYTES, key);
  memcpy(p.mac, full, CV_TANK_MAC_BYTES);
}

/**
 * Constant-time MAC comparison.
 *
 * `memcmp` returns as soon as it finds a difference, so how long it takes
 * leaks how many leading bytes were right. That is enough to recover a valid
 * MAC one byte at a time given enough attempts, and a radio attacker can make
 * as many attempts as they like.
 */
inline bool cvTankVerify(const CvTankPacket &p, const uint8_t key[CV_TANK_KEY_BYTES]) {
  if (p.magic[0] != CV_TANK_MAGIC0 || p.magic[1] != CV_TANK_MAGIC1 ||
      p.magic[2] != CV_TANK_MAGIC2) {
    return false;
  }
  if (p.version != CV_TANK_PROTO_VERSION) return false;

  uint8_t full[CV_TANK_HASH_BYTES];
  cvTankHmac(full, (const uint8_t *)&p, CV_TANK_SIGNED_BYTES, key);

  uint8_t diff = 0;
  for (size_t i = 0; i < CV_TANK_MAC_BYTES; i++) diff |= (uint8_t)(full[i] ^ p.mac[i]);
  return diff == 0;
}

inline void cvTankInitPacket(CvTankPacket &p, uint8_t msgType, uint8_t pairId) {
  memset(&p, 0, sizeof(p));
  p.magic[0] = CV_TANK_MAGIC0;
  p.magic[1] = CV_TANK_MAGIC1;
  p.magic[2] = CV_TANK_MAGIC2;
  p.version = CV_TANK_PROTO_VERSION;
  p.msgType = msgType;
  p.pairId = pairId;
}

// ---------------------------------------------------------------- downlink --

inline void cvTankInitDownlink(CvTankDownlink &p, uint8_t pairId) {
  memset(&p, 0, sizeof(p));
  p.magic[0] = CV_TANK_MAGIC0;
  p.magic[1] = CV_TANK_MAGIC1;
  p.magic[2] = CV_TANK_MAGIC2;
  p.version = CV_TANK_PROTO_VERSION;
  p.msgType = CV_TANK_MSG_DOWNLINK;
  p.pairId = pairId;
}

inline void cvTankSignDownlink(CvTankDownlink &p, const uint8_t key[CV_TANK_KEY_BYTES]) {
  uint8_t full[CV_TANK_HASH_BYTES];
  cvTankHmac(full, (const uint8_t *)&p, CV_TANK_DOWN_SIGNED_BYTES, key);
  memcpy(p.mac, full, CV_TANK_MAC_BYTES);
}

/**
 * Verify a downlink. Same constant-time comparison as the uplink, for the same
 * reason: a byte-at-a-time compare leaks how many leading bytes were right.
 */
inline bool cvTankVerifyDownlink(const CvTankDownlink &p, const uint8_t key[CV_TANK_KEY_BYTES]) {
  if (p.magic[0] != CV_TANK_MAGIC0 || p.magic[1] != CV_TANK_MAGIC1 ||
      p.magic[2] != CV_TANK_MAGIC2) {
    return false;
  }
  if (p.version != CV_TANK_PROTO_VERSION) return false;
  if (p.msgType != CV_TANK_MSG_DOWNLINK) return false;

  uint8_t full[CV_TANK_HASH_BYTES];
  cvTankHmac(full, (const uint8_t *)&p, CV_TANK_DOWN_SIGNED_BYTES, key);

  uint8_t diff = 0;
  for (size_t i = 0; i < CV_TANK_MAC_BYTES; i++) diff |= (uint8_t)(full[i] ^ p.mac[i]);
  return diff == 0;
}

// -------------------------------------------------------------- freshness --

/**
 * State of the last accepted reading. The starter keeps exactly one of these.
 *
 * `everHeard` is separate from an age of zero on purpose: a starter that has
 * never been paired and a starter whose sensor died one millisecond ago are
 * completely different situations, and a plain timestamp cannot tell them
 * apart at boot.
 */
struct CvTankLinkState {
  bool everHeard = false;
  uint32_t lastRxMs = 0;
  uint32_t lastSeq = 0;
  uint16_t levelMm = 0;
  uint16_t batteryMv = 0;
  uint8_t flags = 0;
  int16_t rssi = 0;
  uint32_t accepted = 0;
  uint32_t rejected = 0;  ///< Failed MAC or replayed. A rising count is a signal.
  /** The cadence the sensor has been told to use. 0 means the default. */
  uint16_t intervalS = 0;
};

/** The stale window for this link, scaled to whatever cadence is configured. */
inline uint32_t cvTankStaleMs(const CvTankLinkState &s) {
  uint32_t intervalMs =
      s.intervalS > 0 ? (uint32_t)s.intervalS * 1000UL : CV_TANK_REPORT_INTERVAL_MS;
  return intervalMs * CV_TANK_STALE_MISSES;
}

/** Milliseconds since the last accepted reading, saturating rather than wrapping. */
inline uint32_t cvTankAgeMs(const CvTankLinkState &s, uint32_t nowMs) {
  if (!s.everHeard) return 0xFFFFFFFFUL;
  // Unsigned subtraction handles millis() rollover correctly by itself; the
  // guard is for a clock that has gone backwards, which should read as "very
  // old" rather than "brand new".
  return (nowMs >= s.lastRxMs) ? (nowMs - s.lastRxMs) : 0xFFFFFFFFUL;
}

/**
 * True only while the last reading is recent enough to act on.
 *
 * Every decision that could move water goes through this. A caller that reads
 * `levelMm` without asking this first is the bug this file exists to prevent.
 */
inline bool cvTankReadingFresh(const CvTankLinkState &s, uint32_t nowMs) {
  return s.everHeard && cvTankAgeMs(s, nowMs) < cvTankStaleMs(s);
}

/**
 * True once the reading is too old to be worth showing at all.
 *
 * Scales with the cadence too, but never drops below the fixed floor: at a
 * ten-second interval, six misses is a minute, and withdrawing a level after a
 * minute would blank the display over an ordinary run of interference.
 */
inline bool cvTankReadingAbandoned(const CvTankLinkState &s, uint32_t nowMs) {
  uint32_t abandon = cvTankStaleMs(s) * 10UL;
  if (abandon < CV_TANK_ABANDON_MS) abandon = CV_TANK_ABANDON_MS;
  return !s.everHeard || cvTankAgeMs(s, nowMs) >= abandon;
}

/**
 * Accept a verified packet, or reject it as a replay.
 *
 * Equal sequence numbers are refused as well as lower ones: LoRa receivers do
 * hear the same transmission twice, and counting a duplicate as a fresh
 * reading would let a recording of one packet hold the link "alive" forever
 * while the real sensor is flat or removed.
 */
inline bool cvTankAcceptReading(CvTankLinkState &s, const CvTankPacket &p,
                                int16_t rssi, uint32_t nowMs) {
  if (s.everHeard && p.seq <= s.lastSeq) {
    s.rejected++;
    return false;
  }
  s.everHeard = true;
  s.lastRxMs = nowMs;
  s.lastSeq = p.seq;
  s.levelMm = p.levelMm;
  s.batteryMv = p.batteryMv;
  s.flags = p.flags;
  s.rssi = rssi;
  s.accepted++;
  return true;
}

/** Sensor-to-water distance (mm) as a fill percentage, given tank geometry in cm. */
inline int cvTankPctFromMm(uint16_t levelMm, float emptyCm, float fullCm, bool &fault) {
  float d = levelMm / 10.0f;
  if (levelMm == 0 || d > emptyCm + 40.0f || d < fullCm - 10.0f) {
    fault = true;
    return -1;
  }
  fault = false;
  float span = emptyCm - fullCm;
  if (span <= 0.0f) {
    fault = true;
    return -1;
  }
  float pct = (emptyCm - d) / span * 100.0f;
  if (pct < 0.0f) pct = 0.0f;
  if (pct > 100.0f) pct = 100.0f;
  return (int)(pct + 0.5f);
}

#endif  // CV_TANK_LINK_H
