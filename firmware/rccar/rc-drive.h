/*
 * Circuvent RC Car — pins, limits and the drive layer.
 *
 * Split out of the sketch for the reason recorded in Docs/07: the Arduino
 * builder hoists a prototype for every function in a .ino above anything the
 * sketch declares, so a function taking a struct defined in the .ino fails to
 * compile on a line that has nothing to do with it.
 */
#pragma once

#include <Arduino.h>
#include "rc-protocol.h"

/* ------------------------------------------------------------------- pins --*/
/*
 * ESP32-S3, because the camera and the radio live on the same board. An S3
 * with PSRAM can hold a JPEG frame buffer while ESP-NOW keeps running; a plain
 * ESP32 without PSRAM cannot, and the failure is a camera that works until the
 * first frame over about 30 KB and then reboots the car mid-drive.
 */

/* Motor, through a DRV8871-class H-bridge: two PWM inputs, and direction is
   whichever leg is driven. Not PWM+DIR, because at zero throttle PWM+DIR
   leaves one leg high, which is a brake on some drivers and a coast on
   others -- and "it depends which chip you fitted" is not a spec. */
#ifndef PIN_MOTOR_A
#define PIN_MOTOR_A 4
#endif
#ifndef PIN_MOTOR_B
#define PIN_MOTOR_B 5
#endif

#ifndef PIN_STEER_SERVO
#define PIN_STEER_SERVO 6
#endif

/* Lighting. Headlight and brake are PWM so one lamp can sit at two
   brightnesses, which is how a real car gets daytime running lights and a
   brake light out of the same bulb. */
#ifndef PIN_LIGHT_HEAD
#define PIN_LIGHT_HEAD 7
#endif
#ifndef PIN_LIGHT_BRAKE
#define PIN_LIGHT_BRAKE 15
#endif
#ifndef PIN_LIGHT_LEFT
#define PIN_LIGHT_LEFT 16
#endif
#ifndef PIN_LIGHT_RIGHT
#define PIN_LIGHT_RIGHT 17
#endif
#ifndef PIN_LIGHT_REVERSE
#define PIN_LIGHT_REVERSE 18
#endif
#ifndef PIN_HORN
#define PIN_HORN 8
#endif

/* Battery divider, and an optional wheel sensor. Without the wheel sensor
   speed reads zero and everything that depends on it stands down rather than
   guessing -- see the speed field in telemetry. */
#ifndef PIN_VBAT
#define PIN_VBAT 1
#endif
#ifndef PIN_WHEEL
#define PIN_WHEEL 2
#endif

/*
 * A motor output sharing a pin with the servo does not fail at build time and
 * does not fail at boot. It fails the first time the car is asked to move,
 * with the steering slamming lock to lock at PWM frequency.
 */
#if (PIN_MOTOR_A) == (PIN_MOTOR_B) || (PIN_MOTOR_A) == (PIN_STEER_SERVO) || \
    (PIN_MOTOR_B) == (PIN_STEER_SERVO)
#error "CV_PIN_CLASH: motor and steering outputs overlap"
#endif

/* ----------------------------------------------------------------- limits --*/

/* LEDC channels, named so two peripherals cannot be handed the same one --
   which does not fail, it just makes the second silently override the first. */
#define LEDC_CH_MOTOR_A 0
#define LEDC_CH_MOTOR_B 1
#define LEDC_CH_SERVO   2
#define LEDC_CH_HEAD    3
#define LEDC_CH_BRAKE   4

/* 20 kHz: above hearing, below what the bridge will switch cleanly. A motor
   driven at 1 kHz whines, and a child notices it before an adult does. */
#define MOTOR_PWM_HZ   20000
#define MOTOR_PWM_BITS 10

#define SERVO_PWM_HZ   50
#define SERVO_PWM_BITS 16
#define SERVO_MIN_US   1000
#define SERVO_MID_US   1500
#define SERVO_MAX_US   2000

/*
 * How fast the throttle may rise, in per-mille per second.
 *
 * A model car's motor goes from stopped to full in the time it takes to move a
 * thumb, and the result is a wheelie, a flipped car, or a stripped gear. The
 * ramp is not politeness, it is what keeps the drivetrain alive. Only *more*
 * power is rationed -- backing off and braking are instant.
 */
#define THROTTLE_SLEW_PER_S 2500

/* Below this the motor buzzes without turning, which cooks the windings. */
#define MOTOR_DEADBAND 40

#define CELL_COUNT_DEFAULT 2
#define CELL_MIN_V  3.20f
#define CELL_WARN_V 3.50f
#define CELL_FULL_V 4.20f

/* ------------------------------------------------------------------ drive --*/

/**
 * Motor and steering outputs.
 *
 * Owns the slew limiter, because the limit has to apply to every path that can
 * command the motor -- the handset, the phone, the failsafe -- and the only
 * way to be sure of that is to make this the only way to reach the pins.
 */
class RcDrive {
 public:
  void begin() {
    /*
     * Both legs are written to 0 before anything else. An H-bridge input
     * floats until it is driven, and a floating input on a driver with an
     * internal pull-up is a motor that runs the instant the battery goes in --
     * before setup() has decided anything at all.
     */
    ledcSetup(LEDC_CH_MOTOR_A, MOTOR_PWM_HZ, MOTOR_PWM_BITS);
    ledcSetup(LEDC_CH_MOTOR_B, MOTOR_PWM_HZ, MOTOR_PWM_BITS);
    ledcWrite(LEDC_CH_MOTOR_A, 0);
    ledcWrite(LEDC_CH_MOTOR_B, 0);
    ledcAttachPin(PIN_MOTOR_A, LEDC_CH_MOTOR_A);
    ledcAttachPin(PIN_MOTOR_B, LEDC_CH_MOTOR_B);

    ledcSetup(LEDC_CH_SERVO, SERVO_PWM_HZ, SERVO_PWM_BITS);
    ledcAttachPin(PIN_STEER_SERVO, LEDC_CH_SERVO);
    writeSteerUs(SERVO_MID_US);

    _applied = 0;
    _lastMs = millis();
  }

  /**
   * One update. `demand` has already been through rcApplyLimits.
   *
   * @param brake shorts the motor rather than releasing it -- used by the
   *              failsafe and by a throttle reversal.
   */
  void update(int16_t demand, bool brake) {
    const uint32_t now = millis();
    const uint32_t dt = now - _lastMs;
    _lastMs = now;

    if (brake) {
      _applied = 0;
      /* Both legs high shorts the motor through the bridge, which is a real
         brake. Both low is a coast, and a coasting car does not stop. */
      ledcWrite(LEDC_CH_MOTOR_A, (1 << MOTOR_PWM_BITS) - 1);
      ledcWrite(LEDC_CH_MOTOR_B, (1 << MOTOR_PWM_BITS) - 1);
      return;
    }

    const int32_t step = ((int32_t)THROTTLE_SLEW_PER_S * (int32_t)dt) / 1000;
    if (abs(demand) < abs(_applied) || ((demand > 0) != (_applied > 0) && demand != 0)) {
      _applied = demand; /* backing off or reversing: immediate */
    } else if (demand > _applied) {
      const int32_t next = (int32_t)_applied + step;
      _applied = (int16_t)(next < demand ? next : demand);
    } else if (demand < _applied) {
      const int32_t next = (int32_t)_applied - step;
      _applied = (int16_t)(next > demand ? next : demand);
    }

    int32_t mag = abs(_applied);
    if (mag < MOTOR_DEADBAND) mag = 0;
    const uint32_t duty = (uint32_t)((mag * ((1 << MOTOR_PWM_BITS) - 1)) / 1000);

    if (_applied > 0 && mag > 0) {
      ledcWrite(LEDC_CH_MOTOR_A, duty);
      ledcWrite(LEDC_CH_MOTOR_B, 0);
    } else if (_applied < 0 && mag > 0) {
      ledcWrite(LEDC_CH_MOTOR_A, 0);
      ledcWrite(LEDC_CH_MOTOR_B, duty);
    } else {
      ledcWrite(LEDC_CH_MOTOR_A, 0);
      ledcWrite(LEDC_CH_MOTOR_B, 0);
    }
  }

  /** @param s -1000..1000. @param trim 0..200, centred on 100. */
  void steer(int16_t s, uint8_t trim) {
    const int32_t trimUs = ((int32_t)trim - 100) * 2; /* +/-200 us of authority */
    int32_t us = SERVO_MID_US + ((int32_t)s * (SERVO_MAX_US - SERVO_MID_US)) / 1000 + trimUs;
    if (us < SERVO_MIN_US) us = SERVO_MIN_US;
    if (us > SERVO_MAX_US) us = SERVO_MAX_US;
    writeSteerUs((uint32_t)us);
  }

  int16_t applied() const { return _applied; }

  /** Immediate, unconditional stop. Used by every path that gives up. */
  void stop() {
    _applied = 0;
    ledcWrite(LEDC_CH_MOTOR_A, (1 << MOTOR_PWM_BITS) - 1);
    ledcWrite(LEDC_CH_MOTOR_B, (1 << MOTOR_PWM_BITS) - 1);
  }

 private:
  void writeSteerUs(uint32_t us) {
    /* The 50 Hz period is 20000 us; duty is that fraction of full scale. */
    const uint32_t full = (1UL << SERVO_PWM_BITS) - 1;
    ledcWrite(LEDC_CH_SERVO, (uint32_t)((us * full) / 20000UL));
  }

  int16_t _applied = 0;
  uint32_t _lastMs = 0;
};
