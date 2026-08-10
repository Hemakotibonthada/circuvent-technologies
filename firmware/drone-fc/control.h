/*
 * Control — cascaded angle/rate PID and the quad-X mixer.
 *
 * THE CASCADE
 *
 *   stick ──▶ [angle P] ──▶ rate setpoint ──▶ [rate PID] ──▶ mixer ──▶ motors
 *              250 Hz                            1 kHz
 *
 * The outer loop is P-only and deliberately slow. Its job is to turn "hold 10
 * degrees" into "rotate at N deg/s", which is a kinematic relationship with no
 * dynamics in it — an integral term there would fight the inner loop's own
 * integrator for authority over the same error, and the two wind up against
 * each other. Every flight stack that has tried it has removed it again.
 *
 * The inner loop is where the aircraft is actually flown. It runs at 1 kHz
 * because it is closing a loop around a motor-and-prop system with a ~30 ms
 * time constant, and it carries the I term because there *are* real steady
 * disturbances to reject: an off-centre battery, a bent arm, wind.
 */
#pragma once

#include "fc-config.h"

/** One axis of the rate controller. */
class RatePid {
 public:
  void configure(float kp, float ki, float kd, float iLimit) {
    _kp = kp; _ki = ki; _kd = kd; _iLimit = iLimit;
  }

  void reset() {
    _i = 0.0f;
    _prevMeasured = 0.0f;
    _dFiltered = 0.0f;
    _primed = false;
  }

  /**
   * @param setpoint  demanded rate, deg/s
   * @param measured  gyro rate, deg/s
   * @param saturated true when the mixer could not deliver last cycle
   */
  float update(float setpoint, float measured, float dt, bool saturated) {
    const float error = setpoint - measured;

    /*
     * Conditional integration.
     *
     * When the mixer is already saturated, more integral cannot produce more
     * authority — it only accumulates a correction that has to be unwound
     * later. That is classic integral windup, and on a quad it shows up as a
     * lazy, overshooting recovery after any aggressive input.
     */
    if (!saturated) {
      _i = clampf(_i + _ki * error * dt, -_iLimit, _iLimit);
    }

    /*
     * Derivative on measurement, not on error.
     *
     * d(error)/dt contains d(setpoint)/dt, and a stick flick is a step. The
     * derivative of a step is an impulse, so derivative-on-error kicks the
     * motors hard on every input — audible as a crack, and it is pure noise
     * amplification. Differentiating the measurement instead gives the same
     * damping with none of the kick. The sign flips because
     * d(error) = -d(measured) when the setpoint is constant.
     */
    float d = 0.0f;
    if (_primed) {
      const float raw = -(measured - _prevMeasured) / dt;
      /*
       * First-order low-pass on the D term.
       *
       * Prop wash and frame resonance put a lot of energy into the gyro above
       * 60 Hz. Differentiating multiplies that by frequency, so an unfiltered
       * D term is mostly amplified vibration — it heats the motors, and on a
       * bad frame it will desync an ESC. 80 Hz keeps the useful damping and
       * discards most of the noise.
       */
      const float rc = 1.0f / (2.0f * PI * D_CUTOFF_HZ);
      const float alpha = dt / (rc + dt);
      _dFiltered += alpha * (raw - _dFiltered);
      d = _kd * _dFiltered;
    }
    _prevMeasured = measured;
    _primed = true;

    return _kp * error + _i + d;
  }

  float integral() const { return _i; }

 private:
  static constexpr float D_CUTOFF_HZ = 80.0f;
  float _kp = 0, _ki = 0, _kd = 0, _iLimit = 0.3f;
  float _i = 0, _prevMeasured = 0, _dFiltered = 0;
  bool _primed = false;
};

/**
 * Motor mixing for the X layout in fc-config.h.
 *
 *   M1 front-right (CCW)   M2 rear-right (CW)
 *   M3 rear-left   (CCW)   M4 front-left (CW)
 *
 * Signs, stated once so they can be checked against the frame:
 *   +roll  = roll right  -> right motors reduce thrust
 *   +pitch = nose up     -> rear motors increase thrust
 *   +yaw   = turn right  -> the CCW props (M1, M3) increase, because a prop's
 *                           reaction torque on the frame opposes its rotation
 *
 * That last one is the line to check first when a new build spins up on the
 * bench: get it backwards and yaw becomes positive feedback.
 */
struct MixOutput {
  float m[MOTOR_COUNT];
  bool saturated;
};

inline MixOutput mixQuadX(float throttle, float roll, float pitch, float yaw) {
  MixOutput out;
  float raw[MOTOR_COUNT];
  raw[0] = throttle - roll - pitch + yaw;  // M1 front-right, CCW
  raw[1] = throttle - roll + pitch - yaw;  // M2 rear-right,  CW
  raw[2] = throttle + roll + pitch + yaw;  // M3 rear-left,   CCW
  raw[3] = throttle + roll - pitch - yaw;  // M4 front-left,  CW

  /*
   * Airmode-style rescaling, not clipping.
   *
   * If one motor is asked for more than 1.0 and it is simply clipped, the
   * *differential* the controller asked for is destroyed while the others keep
   * theirs — so the aircraft loses exactly the correction it needed most, at
   * full throttle, which is when it needs it most. Shifting the whole set
   * preserves the differential and gives up some throttle instead. Altitude is
   * recoverable; attitude authority is not.
   */
  float lo = raw[0], hi = raw[0];
  for (int i = 1; i < MOTOR_COUNT; i++) {
    if (raw[i] < lo) lo = raw[i];
    if (raw[i] > hi) hi = raw[i];
  }

  const float range = hi - lo;
  out.saturated = (hi > MOTOR_MAX || lo < MOTOR_IDLE);

  float shift = 0.0f;
  if (range > (MOTOR_MAX - MOTOR_IDLE)) {
    /*
     * The demanded differential is wider than the motors can express. Scale it
     * down about its own centre — every axis loses authority in proportion,
     * which is the least-bad failure: the alternative reduces one axis to
     * nothing while the others stay intact.
     */
    const float scale = (MOTOR_MAX - MOTOR_IDLE) / range;
    const float mid = 0.5f * (hi + lo);
    for (int i = 0; i < MOTOR_COUNT; i++) raw[i] = mid + (raw[i] - mid) * scale;
    lo = mid + (lo - mid) * scale;
    hi = mid + (hi - mid) * scale;
  }

  if (hi > MOTOR_MAX) shift = MOTOR_MAX - hi;
  else if (lo < MOTOR_IDLE) shift = MOTOR_IDLE - lo;

  for (int i = 0; i < MOTOR_COUNT; i++) {
    out.m[i] = clampf(raw[i] + shift, MOTOR_IDLE, MOTOR_MAX);
  }
  return out;
}

/**
 * Stick-to-rate mapping with expo.
 *
 * Linear sticks make a quad feel twitchy around centre and slow at the edges,
 * because the useful resolution is all in the middle. A cubic blend keeps fine
 * control near centre without giving up the maximum rate.
 */
inline float applyExpo(float stick, float expo, float maxRate) {
  const float s = clampf(stick, -1.0f, 1.0f);
  const float shaped = (1.0f - expo) * s + expo * s * s * s;
  return shaped * maxRate;
}

/**
 * Outer angle loop: P-only, and the output is bounded.
 *
 * The bound matters. Without it, a large angle error (say the aircraft is
 * knocked to 60 degrees) asks for a rate the airframe cannot achieve, the
 * inner loop saturates trying, and the recovery is a lurch rather than a
 * correction.
 */
inline float angleToRate(float targetDeg, float actualDeg, float kp, float maxRateDps) {
  return clampf((targetDeg - actualDeg) * kp, -maxRateDps, maxRateDps);
}
