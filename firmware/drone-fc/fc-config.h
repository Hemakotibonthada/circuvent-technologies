/*
 * Circuvent Drone X1 — flight controller configuration and shared types.
 *
 * Everything the control loop needs to agree on lives here rather than in the
 * sketch, for the mechanical reason recorded in Docs/07: the Arduino builder
 * hoists a prototype for every function in a .ino above anything the sketch
 * declares, so a function taking `const ImuSample &` fails to compile on a
 * line that has nothing to do with the change that caused it.
 */
#pragma once

#include <Arduino.h>

// ---------------------------------------------------------------------------
// Airframe
//
//        front
//    M4(CW)   M1(CCW)
//        \   /
//         \ /            X configuration, 5" props, 4S.
//         / \
//        /   \
//    M3(CCW)  M2(CW)
//        rear
//
// Props alternate so the frame's net yaw torque cancels in level flight, which
// means the two motors on each diagonal must spin the SAME way: M1+M3 CCW,
// M2+M4 CW. This diagram previously showed M3 as CW and M2 as CCW, which is
// not a valid X at all and disagreed with the mixer in control.h — and this
// file is the one an installer reads when deciding which way to fit the props.
//
// The mixer is the authority; it is what actually flies. Anyone propping a
// build from the old diagram fitted M2 and M3 backwards, which is exactly the
// failure the paragraph below describes.
//
// The mixer depends on this exact arrangement; swapping two motors without
// swapping their entries turns the yaw axis into positive feedback, and the
// aircraft spins up on the bench the instant it is armed.
// ---------------------------------------------------------------------------
#define MOTOR_COUNT 4

// ESP32-S3. The control loop runs on core 1 and the radio stack on core 0 --
// see the task pinning in the sketch. That separation is not tidiness: the
// Wi-Fi driver takes multi-millisecond locks, and a 1 kHz loop sharing a core
// with it misses deadlines in bursts, which reads as sudden twitching.
#ifndef PIN_M1
#define PIN_M1 4
#endif
#ifndef PIN_M2
#define PIN_M2 5
#endif
#ifndef PIN_M3
#define PIN_M3 6
#endif
#ifndef PIN_M4
#define PIN_M4 7
#endif

// IMU on SPI. SPI rather than I2C because the rate loop reads the gyro every
// cycle: a 14-byte burst is ~140 us of a 1 ms budget at 400 kHz I2C, and under
// 10 us at 8 MHz SPI.
#ifndef PIN_IMU_SCK
#define PIN_IMU_SCK  12
#endif
#ifndef PIN_IMU_MISO
#define PIN_IMU_MISO 13
#endif
#ifndef PIN_IMU_MOSI
#define PIN_IMU_MOSI 11
#endif
#ifndef PIN_IMU_CS
#define PIN_IMU_CS   10
#endif

// SBUS receiver -- inverted UART, 100 kBaud, 8E2.
#ifndef PIN_RC_RX
#define PIN_RC_RX 18
#endif

// Battery divider into an ADC pin.
#ifndef PIN_VBAT
#define PIN_VBAT 1
#endif

#ifndef PIN_BUZZER
#define PIN_BUZZER 15
#endif
#ifndef PIN_LED
#define PIN_LED 48
#endif

/*
 * Compile-time pin clash guard.
 *
 * A motor sharing a pin with the IMU chip select does not fail at build time
 * and does not fail at boot. It fails when the loop starts driving that pin at
 * 300 kHz while also trying to select the gyro -- so the attitude estimate
 * goes to noise with the props already spinning.
 */
#if (PIN_M1) == (PIN_M2) || (PIN_M1) == (PIN_M3) || (PIN_M1) == (PIN_M4) || \
    (PIN_M2) == (PIN_M3) || (PIN_M2) == (PIN_M4) || (PIN_M3) == (PIN_M4)
  #error "CV_PIN_CLASH: two motor outputs share a pin"
#endif
#if (PIN_M1) == (PIN_IMU_CS) || (PIN_M2) == (PIN_IMU_CS) || \
    (PIN_M3) == (PIN_IMU_CS) || (PIN_M4) == (PIN_IMU_CS)
  #error "CV_PIN_CLASH: a motor output shares a pin with the IMU chip select"
#endif
#if (PIN_M1) == (PIN_RC_RX) || (PIN_M2) == (PIN_RC_RX) || \
    (PIN_M3) == (PIN_RC_RX) || (PIN_M4) == (PIN_RC_RX)
  #error "CV_PIN_CLASH: a motor output shares a pin with the RC input"
#endif

// ---------------------------------------------------------------------------
// Loop rates
// ---------------------------------------------------------------------------

/*
 * 1 kHz rate loop.
 *
 * Not a round number chosen for looks. A 5" quad's motor-plus-prop time
 * constant is roughly 25-40 ms; useful rate-loop gain needs the controller an
 * order of magnitude faster than the thing it is controlling, plus margin for
 * filter delay. 1 kHz sits comfortably inside what an S3 does with a SPI gyro
 * read, and it is the rate the D-term filter cutoff is designed around.
 */
#define RATE_HZ    1000
#define RATE_DT    (1.0f / (float)RATE_HZ)

/** Attitude (angle) loop. Slower on purpose -- see control.h. */
#define ANGLE_HZ   250

/** Housekeeping: battery, telemetry, LED. Nothing time-critical. */
#define SLOW_HZ    50

/*
 * If a rate-loop iteration overruns this, the loop is not keeping up and the
 * aircraft is being flown by a controller that believes its timestep is 1 ms
 * when it is not. That mis-scales every integral and derivative term, so the
 * response is wrong in a way no amount of tuning fixes.
 */
#define LOOP_DEADLINE_US 1500

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------
#define MAX_ANGLE_DEG      35.0f   // stick-to-angle mapping in level mode
#define MAX_RATE_DPS       360.0f  // stick-to-rate mapping in acro
#define MAX_YAW_RATE_DPS   270.0f

/*
 * Past this, the aircraft is not recoverable by an angle controller and the
 * motors are almost certainly making it worse -- an inverted quad under a
 * level controller drives itself into the ground at full power. Cut instead.
 */
#define TILT_CUTOFF_DEG    75.0f

#define CELL_COUNT_DEFAULT 4
#define CELL_MIN_V         3.30f   // land now
#define CELL_WARN_V        3.50f   // warn
#define CELL_FULL_V        4.20f

/** Idle throttle when armed, so the props spin and the aircraft is obviously live. */
#define MOTOR_IDLE         0.055f
#define MOTOR_MAX          1.0f

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

struct Vec3 {
  float x, y, z;
};

/** One IMU sample. Gyro in deg/s, accel in g, both in body frame. */
struct ImuSample {
  Vec3 gyro;
  Vec3 accel;
  float tempC;
  bool ok;
};

/** Estimated attitude. Euler angles are for humans; the loop uses the quaternion. */
struct Attitude {
  float q0, q1, q2, q3;
  float rollDeg, pitchDeg, yawDeg;
};

/** Pilot demand, already mapped out of raw stick units. */
struct Demand {
  float roll;      // deg (level) or deg/s (acro)
  float pitch;
  float yawRate;   // deg/s
  float throttle;  // 0..1
  bool armSwitch;
  bool levelMode;
  bool present;    // false once the RC link has gone quiet
};

enum FlightState : uint8_t {
  FS_BOOT = 0,
  FS_CALIBRATING,
  FS_DISARMED,
  FS_ARMED,
  FS_FAILSAFE,
  FS_FAULT,
};

/** Why the aircraft refuses to arm, or why it disarmed itself. */
enum ArmBlock : uint8_t {
  AB_NONE = 0,
  AB_THROTTLE_HIGH,
  AB_NOT_LEVEL,
  AB_NO_RC,
  AB_LOW_BATTERY,
  AB_IMU_FAULT,
  AB_CALIBRATING,
  AB_LOOP_OVERRUN,
  AB_TILT,
  AB_SWITCH_ON_AT_BOOT,
};

static inline const char *armBlockName(ArmBlock b) {
  switch (b) {
    case AB_NONE:              return "ready";
    case AB_THROTTLE_HIGH:     return "throttle is not at idle";
    case AB_NOT_LEVEL:         return "aircraft is not level";
    case AB_NO_RC:             return "no radio link";
    case AB_LOW_BATTERY:       return "battery too low";
    case AB_IMU_FAULT:         return "IMU not responding";
    case AB_CALIBRATING:       return "still calibrating - keep it still";
    case AB_LOOP_OVERRUN:      return "control loop missed its deadline";
    case AB_TILT:              return "tilted past the recovery limit";
    case AB_SWITCH_ON_AT_BOOT: return "arm switch was already on at power-up";
    default:                   return "not ready";
  }
}

static inline float clampf(float v, float lo, float hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

/**
 * The snapshot the rate task publishes and everything else reads.
 *
 * Defined here rather than in the sketch because telemetry.h needs the layout.
 * A forward declaration would not do: that header reads the fields, so it
 * needs the definition, and putting the definition in the .ino means the
 * header sees an incomplete type.
 *
 * Written on core 1, read on core 0, always under `stateMux`. A float is not
 * atomic across cores on this part, and a torn read of an attitude yields a
 * plausible number that is a blend of two different moments.
 */
struct SharedState {
  Attitude att;
  Vec3 gyro;
  float motors[MOTOR_COUNT];
  float battV;
  int8_t battPct;
  FlightState state;
  ArmBlock block;
  uint32_t loopOverruns;
  uint32_t armedAtMs;
  uint32_t loopMaxUs;
  bool inAir;
};
