/*
 * Circuvent RC Car — lighting.
 *
 * Lighting is a state machine rather than a set of pin writes, because almost
 * none of it is a straight reflection of a button:
 *
 *   - indicators blink, and the two of them blinking together is a hazard
 *     rather than both indicators, so they cannot be driven independently;
 *   - the brake light comes on when the driver *lifts off*, not only when a
 *     brake is pressed, because that is when a model car actually slows;
 *   - the reverse light follows the motor, not the stick, so it does not
 *     flicker while the throttle crosses zero;
 *   - the headlight has a daytime level and a night level on one lamp.
 *
 * Getting any of those wrong produces a car that looks like it works. The one
 * that matters is the hazard: it is the only outward sign that the car has
 * stopped because it lost its link rather than because somebody stopped it.
 */
#pragma once

#include <Arduino.h>
#include "rc-drive.h"

/* 1.5 Hz, which is roughly what a road car does and slow enough to read from
   across a garden. */
#define INDICATOR_PERIOD_MS 660

/* Daytime running level, out of 255. Bright enough to be visible, dim enough
   that turning the headlight on is obviously different. */
#define HEAD_DRL_DUTY 40
#define HEAD_ON_DUTY  180
#define HEAD_HIGH_DUTY 255

/* Brake lamp sits at the tail-light level until it is actually braking. */
#define BRAKE_TAIL_DUTY 30
#define BRAKE_ON_DUTY   255

/* A horn that can be held on indefinitely is a horn that will be. */
#define HORN_MAX_MS 4000

class RcLights {
 public:
  void begin() {
    ledcSetup(LEDC_CH_HEAD, 1000, 8);
    ledcSetup(LEDC_CH_BRAKE, 1000, 8);
    ledcWrite(LEDC_CH_HEAD, 0);
    ledcWrite(LEDC_CH_BRAKE, 0);
    ledcAttachPin(PIN_LIGHT_HEAD, LEDC_CH_HEAD);
    ledcAttachPin(PIN_LIGHT_BRAKE, LEDC_CH_BRAKE);

    pinMode(PIN_LIGHT_LEFT, OUTPUT);
    pinMode(PIN_LIGHT_RIGHT, OUTPUT);
    pinMode(PIN_LIGHT_REVERSE, OUTPUT);
    pinMode(PIN_HORN, OUTPUT);
    digitalWrite(PIN_LIGHT_LEFT, LOW);
    digitalWrite(PIN_LIGHT_RIGHT, LOW);
    digitalWrite(PIN_LIGHT_REVERSE, LOW);
    digitalWrite(PIN_HORN, LOW);
  }

  /**
   * One update.
   *
   * @param aux       what the driver has asked for (RcAux bitfield)
   * @param applied   the motor demand actually being used, per-mille
   * @param previous  the demand from the update before, for lift-off detection
   * @param ambient   0..4095 from an LDR, or -1 when none is fitted
   * @param failsafe  true while the car has lost its link
   */
  void update(uint16_t aux, int16_t applied, int16_t previous, int ambient, bool failsafe) {
    const uint32_t now = millis();

    /* ---- indicators and hazard ------------------------------------- */
    /*
     * Hazard wins over the indicators, and the failsafe forces hazard. A car
     * that has stopped on its own must say so; whether the driver had an
     * indicator on a moment ago is no longer the interesting fact.
     */
    const bool hazard = failsafe || (aux & RC_AUX_HAZARD);
    const bool left = hazard || (aux & RC_AUX_INDICATE_L);
    const bool right = hazard || (aux & RC_AUX_INDICATE_R);

    /*
     * One phase for both lamps, and it free-runs rather than restarting when a
     * lamp is switched on. Restarting is what makes a hazard look like two
     * indicators that happen to be on: the pair must be in step, and they only
     * are if they share a clock nobody resets.
     */
    if (now - _blinkAt >= INDICATOR_PERIOD_MS / 2) {
      _blinkAt = now;
      _blinkOn = !_blinkOn;
    }
    if (!left && !right) _blinkOn = true; /* park it lit, so the next one starts on */

    digitalWrite(PIN_LIGHT_LEFT, (left && _blinkOn) ? HIGH : LOW);
    digitalWrite(PIN_LIGHT_RIGHT, (right && _blinkOn) ? HIGH : LOW);

    /* ---- headlight -------------------------------------------------- */
    uint8_t head = 0;
    bool wantHead = (aux & RC_AUX_HEADLIGHT) != 0;
    if (aux & RC_AUX_HEADLIGHT_AUTO) {
      /*
       * Hysteresis, not a threshold. A single trip point next to a hedge makes
       * the lamp flicker on and off as the car moves, which looks like a
       * fault. 300 counts of gap is about half a stop of light.
       */
      if (ambient >= 0) {
        if (ambient < 1200) _autoOn = true;
        else if (ambient > 1500) _autoOn = false;
        wantHead = wantHead || _autoOn;
      }
    }
    if (wantHead) head = (aux & RC_AUX_HIGHBEAM) ? HEAD_HIGH_DUTY : HEAD_ON_DUTY;
    else head = HEAD_DRL_DUTY;
    ledcWrite(LEDC_CH_HEAD, head);

    /* ---- brake ------------------------------------------------------ */
    /*
     * On when the car is slowing, which for a model car is when the driver
     * lifts off -- there is no separate brake pedal. Also on in failsafe,
     * because that is exactly when it is braking hardest.
     */
    const bool slowing = failsafe || (abs(applied) < abs(previous) - 20) || (applied == 0 && previous != 0);
    ledcWrite(LEDC_CH_BRAKE, slowing ? BRAKE_ON_DUTY : BRAKE_TAIL_DUTY);

    /* ---- reverse ---------------------------------------------------- */
    /* Follows the motor rather than the stick, so it does not flicker while
       the throttle crosses zero. */
    digitalWrite(PIN_LIGHT_REVERSE, applied < -MOTOR_DEADBAND ? HIGH : LOW);

    /* ---- horn -------------------------------------------------------- */
    const bool want = (aux & RC_AUX_HORN) != 0;
    if (want && !_hornWas) _hornSince = now;
    _hornWas = want;
    /*
     * Cut off after a few seconds. A held button, a stuck app, or a lost link
     * with the horn bit set would otherwise leave it sounding until the
     * battery went flat -- and the failsafe cannot help, because the horn is
     * the one output somebody might legitimately want during one.
     */
    const bool sound = want && (now - _hornSince) < HORN_MAX_MS;
    digitalWrite(PIN_HORN, sound ? HIGH : LOW);
  }

  /** Everything off, for shutdown and for the bench. */
  void allOff() {
    ledcWrite(LEDC_CH_HEAD, 0);
    ledcWrite(LEDC_CH_BRAKE, 0);
    digitalWrite(PIN_LIGHT_LEFT, LOW);
    digitalWrite(PIN_LIGHT_RIGHT, LOW);
    digitalWrite(PIN_LIGHT_REVERSE, LOW);
    digitalWrite(PIN_HORN, LOW);
  }

 private:
  uint32_t _blinkAt = 0;
  bool _blinkOn = true;
  bool _autoOn = false;
  bool _hornWas = false;
  uint32_t _hornSince = 0;
};
