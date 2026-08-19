#pragma once
/*
 * Types for the configurable switchboard.
 *
 * In a header rather than the .ino for a mechanical reason: the Arduino
 * builder generates function prototypes and inserts them *above* the first
 * function definition, which is above any struct declared in the sketch. A
 * signature mentioning `Channel` — `parseLayout(..., Channel *out, ...)` —
 * therefore fails to compile with "'Channel' has not been declared", pointing
 * at a line that looks perfectly correct. Anything used in a signature has to
 * come from an #include.
 *
 * firmware/rfid-attend/attend_types.h exists for the same reason.
 */
#include <stdint.h>

/** Eight is what a wall box takes, and what NVS stores. */
#define CV_SWB_MAX_CH 8
#define CV_SWB_NAME_LEN 20

enum InputKind : uint8_t {
  IN_NONE = 0,   ///< no local control — app and peers only
  IN_TOUCH,      ///< capacitive pad behind the glass
  IN_BUTTON,     ///< a retrofitted rocker or momentary switch, active low
};

enum PinUse : uint8_t { USE_RELAY, USE_INPUT, USE_TOUCH };

/** One gang, as commissioned. */
struct Channel {
  int8_t relayPin;
  int8_t inputPin;      ///< -1 when `input` is IN_NONE
  InputKind input;
  /**
   * What it does when power comes back.
   *
   * There is deliberately no "always on" option. Everything in this codebase
   * that restores an output restores what the owner left; a board that came
   * back with channels on because a setting said so is the "every light in the
   * house came on by itself at 3am" failure, and it would be blamed on the
   * hardware forever. A load that must always be live does not belong on a
   * switched channel.
   */
  bool restoreLast;
  char kind;            ///< l ight, f an, s ocket, g eyser, p ump, o ther
  char name[CV_SWB_NAME_LEN];
};
