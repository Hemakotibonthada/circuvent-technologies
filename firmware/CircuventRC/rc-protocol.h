/*
 * Circuvent RC — the link protocol, shared by the vehicle, the phone dongle
 * and the handset.
 *
 * WHY CONTROL AND VIDEO ARE SEPARATE LINKS
 *
 * This is the decision everything else follows from, so it is stated first.
 *
 * A camera feed is bulk traffic: it is large, it is bursty, and losing a frame
 * costs nothing. Steering is the opposite: twenty bytes, on time, every time.
 * Put them on one link and the bulk traffic wins — the video fills the queue,
 * and the packet that says "turn left" waits behind a JPEG. The failure mode
 * is a car that drives straight on while the picture is still moving, which is
 * the worst possible way to lose control of a vehicle because it looks like it
 * is still working.
 *
 * So:
 *
 *   control  -- ESP-NOW, connectionless, 250-byte frames, ~50 Hz
 *   video    -- Wi-Fi, ordinary TCP, degrades and drops as range demands
 *
 * They share one 2.4 GHz radio on each end but not one queue, and the video
 * link is allowed to fail on its own. Range on the control link is
 * deliberately longer than the video link: the car should always be steerable
 * further away than it is visible, never the other way round.
 *
 * WHAT ABOUT ZIGBEE
 *
 * Zigbee is offered as a second control backend, and it is worth being precise
 * about what that can and cannot mean.
 *
 * 802.15.4 gives 250 kbit/s shared across a mesh, with per-hop latency in the
 * tens of milliseconds. That is fine for "unlock the door" and useless for
 * driving: a steering command that arrives 80 ms late at 20 km/h is half a
 * metre of error, and a mesh that reroutes mid-corner is worse. It cannot
 * carry video at all -- a single 320x240 JPEG is about half a second of the
 * entire band.
 *
 * So Zigbee here is the *parked* channel: telemetry, battery state, lights,
 * lock and immobilise, and integration with a home hub that already speaks it.
 * Driving is ESP-NOW. rcLinkAllowsDrive is what keeps that from being a
 * comment somebody later ignores.
 *
 * WHY NOT JUST WI-FI FOR EVERYTHING
 *
 * Association. A Wi-Fi client that drops has to re-associate, re-DHCP and
 * reconnect, which is seconds. ESP-NOW has no association: a lost packet costs
 * 20 ms and the next one just arrives. For a moving vehicle that is the whole
 * argument.
 */
#pragma once

#include <stdint.h>
#include <stddef.h>
#include <string.h>

#ifndef __cplusplus
#include <stdbool.h>
#endif

/* Bumped when the wire format changes in a way an older peer would misread.
   The receiver rejects a mismatch outright rather than interpreting fields it
   does not understand -- a half-understood throttle packet is worse than none. */
#define RC_PROTO_VERSION 1

/* Ties a frame to this protocol before anything else looks at it. ESP-NOW has
   no port number, so every application on the channel sees every frame. */
#define RC_MAGIC 0x43524331UL /* "CRC1" */

/* ------------------------------------------------------------------ types --*/

enum RcPacketType {
  RC_PKT_CONTROL = 1,   /* controller -> vehicle, the driving frame */
  RC_PKT_TELEMETRY = 2, /* vehicle -> controller */
  RC_PKT_PAIR = 3,      /* either way, during binding */
  RC_PKT_CONFIG = 4,    /* controller -> vehicle, settings that are not driving */
};

/* Lights and auxiliaries, as a bitfield so one field carries the whole state
   and a dropped frame cannot leave two of them disagreeing. */
enum RcAux {
  RC_AUX_HEADLIGHT = 1 << 0,
  RC_AUX_HIGHBEAM = 1 << 1,
  RC_AUX_HAZARD = 1 << 2,
  RC_AUX_INDICATE_L = 1 << 3,
  RC_AUX_INDICATE_R = 1 << 4,
  RC_AUX_HORN = 1 << 5,
  RC_AUX_REVERSE_LOCK = 1 << 6, /* refuse reverse; for handing it to a child */
  RC_AUX_HEADLIGHT_AUTO = 1 << 7,
};

/* What the driver is allowed to ask for. Not a cosmetic setting: the limit is
   applied on the *vehicle*, so it survives a controller that lies or a phone
   app somebody modified. */
enum RcDriveMode {
  RC_MODE_IMMOBILISED = 0, /* motors will not turn, whatever arrives */
  RC_MODE_BEGINNER = 1,    /* gentle, reverse locked */
  RC_MODE_NORMAL = 2,
  RC_MODE_SPORT = 3,
};

/*
 * The driving frame.
 *
 * Fixed layout, little-endian. Every field is naturally aligned and the struct
 * is a multiple of 4, so there is no padding to disagree about -- but it is
 * memcpy'd onto the wire, so the size is asserted at the bottom rather than
 * assumed.
 */
typedef struct {
  uint32_t magic;
  uint8_t version;
  uint8_t type;
  uint16_t seq; /* wraps; see rcSeqIsNewer */

  int16_t throttle; /* -1000 full reverse .. +1000 full forward */
  int16_t steer;    /* -1000 full left    .. +1000 full right   */

  uint16_t aux; /* RcAux bitfield */
  uint8_t mode; /* RcDriveMode */
  uint8_t trim; /* steering trim, 0..200 centred on 100 */

  uint32_t crc;
} RcControlPacket;

enum RcTelemFlags {
  RC_TF_FAILSAFE = 1 << 0,
  RC_TF_LOW_BATTERY = 1 << 1,
  RC_TF_OVERTEMP = 1 << 2,
  RC_TF_CAMERA_UP = 1 << 3,
  RC_TF_STALLED = 1 << 4,
  RC_TF_CHARGING = 1 << 5,
};

typedef struct {
  uint32_t magic;
  uint8_t version;
  uint8_t type;
  uint16_t seq;

  uint16_t battMv;    /* pack millivolts */
  int16_t speedCms;   /* centimetres per second, signed for reverse */
  int16_t motorTempC; /* tenths of a degree */
  uint16_t aux;       /* what the vehicle believes is on */

  uint8_t mode;
  int8_t rssi;   /* dBm as reported by the receiving radio */
  uint8_t flags; /* RcTelemFlags */
  uint8_t battPct;

  uint32_t odoM; /* metres since pairing, for a trip readout */
  uint32_t crc;
} RcTelemetryPacket;

/* ------------------------------------------------------------------- crc --*/

/*
 * CRC-32 over everything before the crc field.
 *
 * ESP-NOW already CRCs the radio frame, so this is not about interference -- it
 * is about the frame being for us and being intact end to end, including the
 * USB hop through the dongle, which has no such check of its own.
 */
static inline uint32_t rcCrc32(const void *data, size_t len) {
  const uint8_t *p = (const uint8_t *)data;
  uint32_t crc = 0xFFFFFFFFUL;
  size_t i;
  int b;
  for (i = 0; i < len; i++) {
    crc ^= p[i];
    for (b = 0; b < 8; b++) {
      const uint32_t mask = (uint32_t)(0u - (crc & 1u));
      crc = (crc >> 1) ^ (0xEDB88320UL & mask);
    }
  }
  return ~crc;
}

static inline void rcSealControl(RcControlPacket *p) {
  p->magic = RC_MAGIC;
  p->version = RC_PROTO_VERSION;
  p->type = RC_PKT_CONTROL;
  p->crc = rcCrc32(p, sizeof(*p) - sizeof(p->crc));
}

static inline void rcSealTelemetry(RcTelemetryPacket *p) {
  p->magic = RC_MAGIC;
  p->version = RC_PROTO_VERSION;
  p->type = RC_PKT_TELEMETRY;
  p->crc = rcCrc32(p, sizeof(*p) - sizeof(p->crc));
}

static inline bool rcCheckControl(const RcControlPacket *p, size_t len) {
  if (len != sizeof(*p)) return false;
  if (p->magic != RC_MAGIC) return false;
  if (p->version != RC_PROTO_VERSION) return false;
  if (p->type != RC_PKT_CONTROL) return false;
  return p->crc == rcCrc32(p, sizeof(*p) - sizeof(p->crc));
}

static inline bool rcCheckTelemetry(const RcTelemetryPacket *p, size_t len) {
  if (len != sizeof(*p)) return false;
  if (p->magic != RC_MAGIC) return false;
  if (p->version != RC_PROTO_VERSION) return false;
  if (p->type != RC_PKT_TELEMETRY) return false;
  return p->crc == rcCrc32(p, sizeof(*p) - sizeof(p->crc));
}

/* --------------------------------------------------------------- sequence --*/

/*
 * Is `candidate` newer than `current`, given both wrap at 65535?
 *
 * Plain `>` breaks at the wrap: 0 is not older than 65535, it is the next one.
 * The signed-difference trick treats the sequence space as a circle and asks
 * which way round is shorter, which is right for any gap under half the space
 * -- at 50 Hz that is eleven minutes, far longer than any plausible outage.
 *
 * This matters for more than ordering. Rejecting anything not newer is what
 * stops a replay: somebody recording "full throttle" off the air and sending
 * it back later gets a packet the vehicle has already seen.
 */
static inline bool rcSeqIsNewer(uint16_t candidate, uint16_t current) {
  return (int16_t)(candidate - current) > 0;
}

/* -------------------------------------------------------------- failsafe --*/

/*
 * How long the vehicle waits before deciding the controller has gone.
 *
 * Frames arrive at 50 Hz, so this is six missed in a row. Shorter and ordinary
 * interference stops the car every few minutes, which teaches the driver to
 * ignore it. Longer and the car keeps its last throttle for an eighth of a
 * second after the link dies -- at 20 km/h that is most of a metre.
 */
#define RC_CONTROL_TIMEOUT_MS 120

/* How often the controller sends, and the vehicle reports back. */
#define RC_CONTROL_PERIOD_MS 20
#define RC_TELEMETRY_PERIOD_MS 100

/*
 * What the vehicle does when the link goes quiet.
 *
 * Brakes, not coast. A coasting car keeps its momentum and its direction, and
 * the reason the link failed may well be that it has gone somewhere it should
 * not be. Steering *holds* rather than centring -- centring mid-corner is
 * itself a swerve, and a car that straightens up under braking leaves the
 * corner rather than stopping in it.
 *
 * Hazards on, because from outside the vehicle that is the only way to tell
 * one that has stopped deliberately from one that has stopped because
 * something is wrong.
 */
typedef struct {
  int16_t throttle;
  bool holdSteer;
  bool brakeLight;
  bool hazard;
} RcFailsafeAction;

static inline RcFailsafeAction rcFailsafeAction(void) {
  RcFailsafeAction a;
  a.throttle = 0;
  a.holdSteer = true;
  a.brakeLight = true;
  a.hazard = true;
  return a;
}

/* ----------------------------------------------------------------- limits --*/

/*
 * Power ceiling per mode, in per-mille of full throttle.
 *
 * Applied on the vehicle rather than the controller. A limit enforced by the
 * thing holding the joystick is a suggestion -- it is on the wrong side of the
 * link, and the vehicle is the part with the motor.
 */
static inline int16_t rcModeCeiling(uint8_t mode) {
  switch (mode) {
    case RC_MODE_IMMOBILISED: return 0;
    case RC_MODE_BEGINNER:    return 300;
    case RC_MODE_NORMAL:      return 700;
    case RC_MODE_SPORT:       return 1000;
    default:                  return 0; /* an unknown mode does not drive */
  }
}

/* Reverse is refused in beginner mode and whenever the lock flag is set. */
static inline bool rcReverseAllowed(uint8_t mode, uint16_t aux) {
  if (mode == RC_MODE_BEGINNER) return false;
  if (aux & RC_AUX_REVERSE_LOCK) return false;
  return true;
}

/*
 * The one place a throttle demand becomes a motor demand.
 *
 * Kept in the shared header so the handset can show the driver the same number
 * the vehicle will actually use. A remote whose display disagrees with the car
 * is how somebody learns the limit by hitting it.
 */
static inline int16_t rcApplyLimits(int16_t throttle, uint8_t mode, uint16_t aux) {
  const int16_t ceiling = rcModeCeiling(mode);
  int32_t scaled;
  if (ceiling == 0) return 0;
  if (throttle < 0 && !rcReverseAllowed(mode, aux)) return 0;

  scaled = ((int32_t)throttle * ceiling) / 1000;
  if (scaled > ceiling) scaled = ceiling;
  if (scaled < -ceiling) scaled = -ceiling;
  return (int16_t)scaled;
}

/*
 * Whether a link is fit to drive on. See the Zigbee note in the header: it
 * carries commands perfectly well and cannot carry driving ones.
 */
enum RcLinkKind {
  RC_LINK_NONE = 0,
  RC_LINK_ESPNOW = 1,
  RC_LINK_ZIGBEE = 2,
};

static inline bool rcLinkAllowsDrive(uint8_t kind) {
  return kind == RC_LINK_ESPNOW;
}

/* ------------------------------------------------------------ wire layout --*/

/*
 * The structs go onto the wire by memcpy, so their size is part of the
 * protocol. A compiler that padded differently between the vehicle build and
 * the handset build would produce two firmwares that agree on every field name
 * and disagree on where the fields are.
 */
#if defined(__cplusplus) && __cplusplus >= 201103L
static_assert(sizeof(RcControlPacket) == 20, "RcControlPacket layout changed");
static_assert(sizeof(RcTelemetryPacket) == 28, "RcTelemetryPacket layout changed");
static_assert(sizeof(RcControlPacket) <= 250, "control frame exceeds one ESP-NOW payload");
static_assert(sizeof(RcTelemetryPacket) <= 250, "telemetry frame exceeds one ESP-NOW payload");
#endif
