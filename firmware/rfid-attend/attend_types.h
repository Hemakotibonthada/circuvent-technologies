/*
 * Types the sketch shares with itself.
 *
 * `struct Punch` lives here rather than in rfid-attend.ino because the Arduino
 * build step generates forward declarations for every function and inserts
 * them immediately before the first function definition in the sketch — which
 * is above the point where a struct declared in the .ino would appear. The
 * generated prototypes for publishPunch() and queuePush() then reference a
 * type the compiler has not seen yet, and the build fails with the memorably
 * unhelpful "'Punch' does not name a type" pointing at a comment.
 *
 * Anything included from a header is visible before the generated prototypes,
 * so this is the fix rather than a matter of taste.
 */
#pragma once
#include <stdint.h>

/*
 * One presentation of a card, as it is stored while offline.
 *
 * Fixed width and trivially copyable so the queue can be a plain array written
 * to NVS with a single putBytes. A JSON queue would be friendlier to read and
 * would mean parsing untrusted flash contents on a door controller at boot.
 *
 * `ts` is a real epoch second when the terminal has had NTP, and zero when it
 * has not — which is exactly what happens when a site loses power and comes
 * back before its internet does. Zero is sent as zero rather than as a guess:
 * the server can place an unclocked punch between the ones either side of it,
 * whereas a fabricated timestamp would be indistinguishable from a real one in
 * a register somebody is signing.
 */
struct Punch {
  uint32_t seq;
  uint32_t uid;
  uint32_t ts;
  uint8_t  granted;
  uint8_t  dir;        // 0 = in, 1 = out
  uint8_t  method;     // 0 = card, 1 = wiegand, 2 = rex
  uint8_t  reason;     // 0 ok, 1 unknown card, 2 offline, 3 duplicate
};
