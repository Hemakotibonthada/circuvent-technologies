/*
 * Attitude estimation — Mahony complementary filter on a quaternion.
 *
 * WHY MAHONY AND NOT A KALMAN FILTER
 *
 * An EKF estimates gyro bias properly and is what a survey aircraft wants. It
 * also needs a 6x6 covariance propagation every cycle, which is a few hundred
 * multiply-accumulates and a matrix inversion, and it goes unstable in ways
 * that are hard to see coming when the covariance loses positive-definiteness
 * after a long run. Mahony gets the same job done for a multirotor with a
 * proportional-integral correction: the integral term *is* a gyro bias
 * estimator, it just converges more slowly and cannot express uncertainty.
 *
 * For an aircraft whose whole job is to stay near level, that trade is right.
 *
 * WHY THE ACCELEROMETER IS ONLY A HINT
 *
 * The accelerometer measures specific force, not gravity. In any accelerated
 * flight it reads gravity *plus* whatever the airframe is doing, so trusting
 * it strongly makes the estimate lean into every acceleration — the aircraft
 * pitches, the accel says "still level", and the controller fights itself.
 *
 * Two defences here. Kp is small (0.6), so the accelerometer pulls the
 * estimate back over seconds rather than milliseconds. And a sample whose
 * magnitude is far from 1 g is discarded outright: during a punch-out or a
 * hard landing it is measuring thrust or impact, and it carries no attitude
 * information at all.
 *
 * The gyro is what actually flies the aircraft. This filter exists to stop it
 * drifting.
 */
#pragma once

#include "fc-config.h"
#include <math.h>

class Ahrs {
 public:
  void begin() {
    _q0 = 1.0f; _q1 = _q2 = _q3 = 0.0f;
    _ix = _iy = _iz = 0.0f;
  }

  /**
   * One update. `gyro` in deg/s, `accel` in g, both body frame.
   *
   * Returns the attitude with Euler angles already derived, because every
   * consumer wants them and deriving them twice invites the two copies to
   * disagree about conventions.
   */
  Attitude update(const Vec3 &gyroDps, const Vec3 &accel, float dt) {
    // Body rates in rad/s.
    float gx = gyroDps.x * DEG_TO_RAD;
    float gy = gyroDps.y * DEG_TO_RAD;
    float gz = gyroDps.z * DEG_TO_RAD;

    const float aMag = sqrtf(accel.x * accel.x + accel.y * accel.y + accel.z * accel.z);

    /*
     * Only correct when the accelerometer is plausibly measuring gravity.
     *
     * 0.75 g to 1.25 g is deliberately generous — a quad in normal flight
     * sits near 1 g and the band has to survive prop vibration bleeding
     * through the filter. Outside it the sample is thrust or impact, and
     * feeding it in would tilt the estimate toward whatever direction the
     * aircraft happened to be accelerating.
     */
    if (aMag > 0.75f && aMag < 1.25f) {
      const float inv = 1.0f / aMag;
      const float ax = accel.x * inv;
      const float ay = accel.y * inv;
      const float az = accel.z * inv;

      // Gravity direction as the current estimate predicts it: the third
      // column of the rotation matrix.
      const float vx = 2.0f * (_q1 * _q3 - _q0 * _q2);
      const float vy = 2.0f * (_q0 * _q1 + _q2 * _q3);
      const float vz = _q0 * _q0 - _q1 * _q1 - _q2 * _q2 + _q3 * _q3;

      // Error is the cross product between measured and predicted gravity —
      // it points along the axis the estimate must rotate about to agree.
      const float ex = (ay * vz - az * vy);
      const float ey = (az * vx - ax * vz);
      const float ez = (ax * vy - ay * vx);

      /*
       * The integral term is the gyro bias estimator, and it is clamped.
       *
       * Unclamped it winds up whenever the aircraft holds a sustained real
       * acceleration — a long fast pass reads as a constant tilt error, the
       * integrator absorbs it as "bias", and when the aircraft slows down the
       * accumulated correction tips the estimate the other way. The clamp
       * bounds that to a few degrees per second of error, which a gyro bias
       * genuinely never exceeds.
       */
      _ix = clampf(_ix + KI * ex * dt, -0.05f, 0.05f);
      _iy = clampf(_iy + KI * ey * dt, -0.05f, 0.05f);
      _iz = clampf(_iz + KI * ez * dt, -0.05f, 0.05f);

      gx += KP * ex + _ix;
      gy += KP * ey + _iy;
      gz += KP * ez + _iz;
    }

    // Quaternion derivative, integrated with first-order Euler. At 1 kHz the
    // truncation error is far below the gyro's own noise floor, so a
    // higher-order integrator would be measuring nothing.
    const float qa = _q0, qb = _q1, qc = _q2, qd = _q3;
    const float h = 0.5f * dt;
    _q0 += h * (-qb * gx - qc * gy - qd * gz);
    _q1 += h * ( qa * gx + qc * gz - qd * gy);
    _q2 += h * ( qa * gy - qb * gz + qd * gx);
    _q3 += h * ( qa * gz + qb * gy - qc * gx);

    // Renormalise every cycle. Skipping it lets rounding drift the norm away
    // from 1, and a non-unit quaternion silently scales the derived angles.
    const float n = sqrtf(_q0 * _q0 + _q1 * _q1 + _q2 * _q2 + _q3 * _q3);
    if (n > 1e-6f) {
      const float invN = 1.0f / n;
      _q0 *= invN; _q1 *= invN; _q2 *= invN; _q3 *= invN;
    }

    Attitude a;
    a.q0 = _q0; a.q1 = _q1; a.q2 = _q2; a.q3 = _q3;

    a.rollDeg = atan2f(2.0f * (_q0 * _q1 + _q2 * _q3),
                       1.0f - 2.0f * (_q1 * _q1 + _q2 * _q2)) * RAD_TO_DEG;

    /*
     * asinf's argument is clamped before the call.
     *
     * At extreme pitch, accumulated rounding can push it a hair past ±1, and
     * asinf(1.0000001) is NaN. That NaN then propagates into the pitch error,
     * the PID, and the motor mix — so a single rounding artefact at 90° of
     * pitch stops all four motors. Clamping costs one comparison.
     */
    const float sinp = clampf(2.0f * (_q0 * _q2 - _q3 * _q1), -1.0f, 1.0f);
    a.pitchDeg = asinf(sinp) * RAD_TO_DEG;

    a.yawDeg = atan2f(2.0f * (_q0 * _q3 + _q1 * _q2),
                      1.0f - 2.0f * (_q2 * _q2 + _q3 * _q3)) * RAD_TO_DEG;
    return a;
  }

  /** Angle between the aircraft's up-axis and gravity, in degrees. */
  static float tiltDeg(const Attitude &a) {
    const float vz = a.q0 * a.q0 - a.q1 * a.q1 - a.q2 * a.q2 + a.q3 * a.q3;
    return acosf(clampf(vz, -1.0f, 1.0f)) * RAD_TO_DEG;
  }

 private:
  // Kp small: the accelerometer is a slow reference, not a measurement of
  // attitude. Ki smaller still, because it is only there to track gyro bias,
  // which changes with temperature over minutes.
  static constexpr float KP = 0.6f;
  static constexpr float KI = 0.02f;

  float _q0 = 1, _q1 = 0, _q2 = 0, _q3 = 0;
  float _ix = 0, _iy = 0, _iz = 0;
};
