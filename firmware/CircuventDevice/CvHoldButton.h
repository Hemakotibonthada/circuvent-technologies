#pragma once
/*
 * CvHoldButton — a deliberate, sustained press.
 *
 * WHAT THIS IS FOR
 *
 * The Guardian's panic button is sewn into a shoe. That placement is the whole
 * point of the product — it is reachable when a phone is not, and it does not
 * look like anything — but it also means the button is stood on, flexed and
 * knocked all day. Any gesture short enough to be convenient is a gesture the
 * wearer's own walking will perform dozens of times an hour, and every false
 * trigger sends a stranger's parents a message saying their child is in danger
 * and dials a police station. A safety device that cries wolf gets taken off.
 *
 * So the trigger is a long, continuous hold — thirty seconds by default. That
 * is not a number chosen for comfort. It is chosen because nothing else a shoe
 * does lasts that long without interruption.
 *
 * THE TWO RULES THAT MAKE IT WORK
 *
 * 1. A release resets it. Not "reduces it" — resets it to zero. Walking is a
 *    sequence of presses, and any scheme that accumulated them would fire
 *    after a brisk walk to the bus stop.
 *
 * 2. A release shorter than `glitchMs` does not count as a release. Contact
 *    bounce, a stumble, or the flex of a sole under load can break the circuit
 *    for a few milliseconds while the wearer is quite deliberately pressing
 *    it. Requiring thirty seconds without a single microsecond of bounce would
 *    mean the button never works when it matters. A footfall releases for
 *    hundreds of milliseconds, so the two are not close together and the
 *    default sits well between them.
 *
 * AND ONE THAT PREVENTS A FALSE ALARM AT BOOT
 *
 * The button is armed only after it has been seen released, for the same
 * reason CvTapButton is: a button compressed at power-up — a shoe left with
 * something resting on it, or the wearer simply standing — is not somebody
 * asking for help. Without this, putting a boot on and switching the device on
 * would start the clock, and thirty seconds of standing still would call the
 * police.
 *
 * The rules live in step(), which takes the pin level and the time rather than
 * reading them, so they can be exercised without hardware. src/lib/guardian-
 * hold.ts mirrors them for the apps and tests/guardian-hold.test.ts holds the
 * two in step.
 */
#include <stdint.h>

struct CvHoldButton {
  /**
   * @param holdMs    how long the press must be sustained to fire
   * @param glitchMs  a break shorter than this is contact noise, not a release
   */
  void begin(uint8_t pin, uint32_t holdMs, uint16_t glitchMs = 120) {
    _pin = pin;
    _holdMs = holdMs;
    _glitchMs = glitchMs;
    pinMode(_pin, INPUT_PULLUP);
    reset();
    _armed = false;
  }

  /** Re-arms after a change of settings. Progress is abandoned, not carried. */
  void reset() {
    _down = false;
    _pressedAt = 0;
    _releasedAt = 0;
    _fired = false;
  }

  void setHoldMs(uint32_t holdMs) { _holdMs = holdMs; reset(); }

  /** Reads the pin and advances the machine. True once, when the hold completes. */
  bool update() { return step(digitalRead(_pin) == LOW, millis()); }

  /**
   * The rules, with no hardware in them.
   *
   * @param down  true while the button is pressed
   * @param now   milliseconds, monotonic
   * @return      true exactly once, on the pass that completes the hold
   */
  bool step(bool down, uint32_t now) {
    /*
     * Not yet seen released since boot. A button that is already held cannot
     * be somebody starting to ask for help, so believe nothing until it lets
     * go once.
     */
    if (!_armed) {
      if (!down) _armed = true;
      _down = down;
      return false;
    }

    if (down) {
      if (!_down) {
        /*
         * A press. If the gap since the last release was only contact noise,
         * the original press is still running and its clock is not restarted —
         * otherwise a button that bounces once at second twenty-nine would
         * silently start again from zero and never fire at all.
         */
        const bool glitch = (_pressedAt != 0) && (now - _releasedAt < _glitchMs);
        if (!glitch) {
          _pressedAt = now;
          _fired = false;
        }
      }
      _down = true;

      if (!_fired && _pressedAt != 0 && (now - _pressedAt) >= _holdMs) {
        _fired = true;
        return true;
      }
      return false;
    }

    /* Released. The clock is not cleared here — a short break may yet turn out
       to be noise — but once it has been down for longer than the tolerance,
       the press is over and any progress goes with it. */
    if (_down) _releasedAt = now;
    _down = false;
    if (_pressedAt != 0 && (now - _releasedAt) >= _glitchMs) {
      _pressedAt = 0;
      _fired = false;
    }
    return false;
  }

  /** How long the current press has been sustained, 0 when there is none. */
  uint32_t heldMs(uint32_t now) const {
    if (_pressedAt == 0) return 0;
    return now - _pressedAt;
  }

  /** 0..100, for a device that wants to show the wearer it is counting. */
  uint8_t progressPct(uint32_t now) const {
    if (_pressedAt == 0 || _holdMs == 0) return 0;
    const uint32_t held = now - _pressedAt;
    if (held >= _holdMs) return 100;
    return (uint8_t)((held * 100UL) / _holdMs);
  }

  bool inProgress() const { return _pressedAt != 0 && !_fired; }
  uint32_t holdMs() const { return _holdMs; }

 private:
  uint8_t _pin = 0;
  uint32_t _holdMs = 30000;
  uint16_t _glitchMs = 120;
  bool _down = false, _armed = false, _fired = false;
  uint32_t _pressedAt = 0, _releasedAt = 0;
};
