/*
 * Flight safety — the logic that ends a flight when the pilot cannot.
 *
 * WHY THIS FILE EXISTS SEPARATELY
 *
 * Everything here is pure: it takes numbers and returns decisions, touches no
 * hardware, and holds no Arduino types. That is deliberate. This is the code
 * that decides whether an aircraft keeps its motors running, and it is the one
 * part of the stack that can be exercised without a propeller — see
 * tests/drone-flight-safety.test.ts, which mirrors these state machines and
 * runs them against the cases that matter.
 *
 * THE BUG THAT PROMPTED IT
 *
 * The failsafe had no ending. Radio loss put the aircraft into a level
 * descent, which is the correct and hard part — but nothing ever stopped it.
 * `Sbus::sw()` reads the last decoded channel values, and those persist after
 * the link drops, so `armSwitch` stayed true, `armLatch` never cleared, and
 * the state machine had no other exit. The aircraft descended, touched down,
 * and sat there with four props at 35% throttle until the pack went flat or it
 * flipped hard enough to trip the tilt cutoff.
 *
 * From the outside that looks like a working failsafe right up to the moment
 * it lands.
 *
 * THE GUARANTEE, AND THE OPTIMISATION
 *
 * The descent is bounded by a timer, and the timer is the guarantee: it does
 * not depend on any sensor reading being right. Touchdown detection only ever
 * ends the descent *sooner*. That ordering is the whole safety argument — a
 * heuristic that can fail to fire costs a few extra seconds of descent, while
 * a heuristic that must fire to stop the motors is a heuristic that eventually
 * does not.
 */
#pragma once

#include "fc-config.h"

// ---------------------------------------------------------------------------
// Failsafe
// ---------------------------------------------------------------------------

/**
 * How long the controlled descent may last before the motors stop regardless.
 *
 * Sized from the airframe: the failsafe throttle is below hover, giving
 * roughly 1.5 m/s down, and 12 s covers about 18 m. Anything higher than that
 * was flown well outside line of sight, and continuing to descend past the
 * budget is worse than stopping — by then the aircraft is either down, or it
 * is somewhere the descent was never going to resolve.
 */
#define FAILSAFE_DESCENT_MS 12000

/**
 * A short wings-level hold before the descent starts.
 *
 * Radio links drop out briefly and recover, especially at range behind a
 * body. Cutting to a descent on the first lost frame turns a 200 ms dropout
 * into an unrecoverable landing. RC_TIMEOUT_MS has already elapsed before this
 * is reached, so this is the second stage of a two-stage wait.
 */
#define FAILSAFE_HOLD_MS 700

/** Throttle held during the descent. Below hover for this airframe (~28%). */
#define FAILSAFE_THROTTLE 0.35f

enum FailsafePhase : uint8_t {
  FSP_NONE = 0,
  FSP_HOLD,     // link just went quiet; hold level, no descent yet
  FSP_DESCEND,  // committed to landing
  FSP_DONE,     // motors must stop
};

/**
 * Touchdown heuristic.
 *
 * On the ground the airframe is supported: the specific force settles back to
 * 1 g, and the frame stops rotating because the controller's corrections no
 * longer move it. In a steady descent through air the accelerometer *also*
 * reads about 1 g — a constant-velocity descent has no net acceleration — so
 * magnitude alone cannot tell the two apart. What separates them is rotation:
 * an airborne quad under a level controller is continuously making small
 * corrections, and one sitting on its feet is not.
 *
 * This is a heuristic and is treated as one. It can only shorten the descent.
 */
class TouchdownDetector {
 public:
  void reset() { _quietMs = 0; _settled = false; }

  /**
   * @param accelMag  magnitude of the accelerometer vector, g
   * @param gyroMagDps magnitude of the body rate vector, deg/s
   * @param dtMs      milliseconds since the last call
   */
  void update(float accelMag, float gyroMagDps, uint32_t dtMs) {
    const bool quiet = (accelMag > 0.85f && accelMag < 1.15f) && gyroMagDps < GYRO_QUIET_DPS;
    if (quiet) {
      _quietMs += dtMs;
      if (_quietMs >= QUIET_HOLD_MS) _settled = true;
    } else {
      // One disturbed sample is not proof of flight, but the counter restarts:
      // the claim being made is "still for a continuous interval".
      _quietMs = 0;
    }
  }

  bool landed() const { return _settled; }

 private:
  static constexpr float GYRO_QUIET_DPS = 18.0f;
  static constexpr uint32_t QUIET_HOLD_MS = 900;
  uint32_t _quietMs = 0;
  bool _settled = false;
};

/**
 * The failsafe state machine.
 *
 * Owns the phase, the clocks and the exit. The caller supplies "is the link
 * up" and the sensor magnitudes; this decides what throttle to hold and when
 * the motors must stop.
 */
class Failsafe {
 public:
  void reset() {
    _phase = FSP_NONE;
    _phaseMs = 0;
    _touchdown.reset();
  }

  /**
   * @param linkUp     true while the RC link is live
   * @param accelMag   accelerometer magnitude, g
   * @param gyroMagDps body rate magnitude, deg/s
   * @param dtMs       milliseconds since the last call
   */
  FailsafePhase update(bool linkUp, float accelMag, float gyroMagDps, uint32_t dtMs) {
    if (linkUp) {
      /*
       * Recovery is only allowed before the descent is committed. Once the
       * aircraft is coming down it finishes coming down, even if the link
       * returns: a link that has already failed once at this range is not a
       * link to hand a descending aircraft back to at 3 m, and the pilot can
       * simply take off again.
       */
      if (_phase == FSP_HOLD || _phase == FSP_NONE) reset();
      if (_phase == FSP_NONE) return FSP_NONE;
    }

    switch (_phase) {
      case FSP_NONE:
        _phase = FSP_HOLD;
        _phaseMs = 0;
        _touchdown.reset();
        break;

      case FSP_HOLD:
        _phaseMs += dtMs;
        if (_phaseMs >= FAILSAFE_HOLD_MS) {
          _phase = FSP_DESCEND;
          _phaseMs = 0;
        }
        break;

      case FSP_DESCEND:
        _phaseMs += dtMs;
        _touchdown.update(accelMag, gyroMagDps, dtMs);
        // The timer is the guarantee; the detector is the optimisation.
        if (_phaseMs >= FAILSAFE_DESCENT_MS || _touchdown.landed()) _phase = FSP_DONE;
        break;

      case FSP_DONE:
        break;
    }
    return _phase;
  }

  FailsafePhase phase() const { return _phase; }

  /** Throttle to command for the current phase. */
  float throttle() const {
    switch (_phase) {
      case FSP_HOLD:    return _hoverHint;   // hold what it was holding
      case FSP_DESCEND: return FAILSAFE_THROTTLE;
      default:          return 0.0f;
    }
  }

  /**
   * The throttle the pilot was holding when the link dropped, used for the
   * hold phase so a brief dropout does not produce a visible lurch. Clamped
   * because a failsafe that can hold full throttle is not a failsafe.
   */
  void noteThrottle(float t) { _hoverHint = clampf(t, 0.0f, 0.55f); }

 private:
  FailsafePhase _phase = FSP_NONE;
  uint32_t _phaseMs = 0;
  float _hoverHint = FAILSAFE_THROTTLE;
  TouchdownDetector _touchdown;
};

// ---------------------------------------------------------------------------
// Crash detection
// ---------------------------------------------------------------------------

/**
 * Past this the aircraft is upside down, not merely tilted.
 *
 * The existing TILT_CUTOFF_DEG already stops the motors at 75 degrees, which
 * covers the case this is about. What it does not do is *stay* stopped in a
 * way the pilot can see, or distinguish "knocked over on the bench" from
 * "inverted in a hedge" — which is the state turtle mode exists to get out of.
 */
#define INVERTED_DEG 120.0f

/**
 * A hit hard enough that continuing to drive the motors can only make it
 * worse. 4 g is well above anything a 5-inch quad pulls in flight and well
 * below what a frame survives, so it fires on impact and not on a punch-out.
 */
#define IMPACT_G 4.0f

class CrashDetector {
 public:
  void reset() { _invertedMs = 0; _crashed = false; }

  void update(float tiltDeg, float accelMag, uint32_t dtMs) {
    if (accelMag >= IMPACT_G) {
      _crashed = true;
      return;
    }
    if (tiltDeg >= INVERTED_DEG) {
      _invertedMs += dtMs;
      // Sustained, because a flip through inverted during an aggressive
      // manoeuvre is flying, not crashing.
      if (_invertedMs >= 400) _crashed = true;
    } else {
      _invertedMs = 0;
    }
  }

  bool crashed() const { return _crashed; }

 private:
  uint32_t _invertedMs = 0;
  bool _crashed = false;
};

// ---------------------------------------------------------------------------
// Battery
// ---------------------------------------------------------------------------

enum BatteryStage : uint8_t {
  BATT_OK = 0,
  BATT_WARN,      // audible, pilot should land
  BATT_CRITICAL,  // the aircraft lands itself
};

/**
 * Staged low-voltage response with sag rejection.
 *
 * A LiPo under a punch-out sags well below its resting voltage and recovers
 * within a second. Acting on the instantaneous reading means a hard climb
 * triggers a forced landing with half a pack remaining; ignoring sag entirely
 * means flying a genuinely empty pack until it falls out of the sky.
 *
 * The compromise is a slow filter plus a dwell: the condition has to hold for
 * a continuous interval before the stage advances. Stages never step back
 * down in flight — a pack that has reached the floor once is empty, and
 * letting it recover its way back to OK produces an aircraft that oscillates
 * between "land now" and "carry on" while it descends.
 *
 * With no current sensor fitted there is nothing better available: proper sag
 * compensation needs the current draw the voltage is sagging under.
 */
class BatteryMonitor {
 public:
  void reset(float volts) {
    _filtered = volts;
    _primed = volts > 1.0f;
    _stage = BATT_OK;
    _dwellMs = 0;
  }

  /** @param dtMs milliseconds since the last call. */
  void update(float volts, uint8_t cells, uint32_t dtMs) {
    if (volts <= 1.0f || cells == 0) return;  // no pack, or no divider fitted
    if (!_primed) { _filtered = volts; _primed = true; }

    // ~1 s time constant: long enough to ride out a punch, short enough that a
    // genuinely empty pack is recognised within a couple of seconds.
    const float alpha = (float)dtMs / (1000.0f + (float)dtMs);
    _filtered += alpha * (volts - _filtered);

    const float per = _filtered / (float)cells;
    BatteryStage want = BATT_OK;
    if (per < CELL_MIN_V) want = BATT_CRITICAL;
    else if (per < CELL_WARN_V) want = BATT_WARN;

    if (want > _stage) {
      _dwellMs += dtMs;
      if (_dwellMs >= DWELL_MS) { _stage = want; _dwellMs = 0; }
    } else {
      _dwellMs = 0;  // ratchet: never steps back down in flight
    }
  }

  BatteryStage stage() const { return _stage; }
  float filtered() const { return _filtered; }

 private:
  static constexpr uint32_t DWELL_MS = 1500;
  float _filtered = 0.0f;
  bool _primed = false;
  BatteryStage _stage = BATT_OK;
  uint32_t _dwellMs = 0;
};
