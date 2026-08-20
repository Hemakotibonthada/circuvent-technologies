/*
 * Circuvent Witness — shared types and the cadence rule.
 *
 * Separate from the sketch because the Arduino builder hoists a prototype for
 * every function in a .ino above anything the sketch declares, so a function
 * taking a struct defined in the .ino fails to compile on a line that has
 * nothing to do with it (Docs/07).
 */
#pragma once

#include <Arduino.h>

/*
 * Cadence bounds. Both exist for the same reason: faster than 10 s spends
 * energy on resolution nobody uses — a relay that is stuck was stuck ten
 * seconds ago too — and slower than 15 minutes stops describing the present.
 */
#define WITNESS_MIN_PERIOD_SEC 10
#define WITNESS_MAX_PERIOD_SEC 900

/** One measurement, as it goes on the air. */
struct WitnessReport {
  uint16_t seq;
  float milliamps;
  uint16_t reserveMv;
  uint32_t bootCount;
};

/**
 * The fastest cadence a given load can sustain.
 *
 * This is a transcription of sustainablePeriodSec() in src/lib/witness.ts, and
 * tests/witness-firmware-parity.test.ts holds the two equal. It is duplicated
 * rather than shared because one side is C++ on a microcontroller and the
 * other is TypeScript on a server, and the alternative to a checked
 * duplication is an unchecked one.
 *
 *   harvested = (primary / 1000) x 3.0 V x 0.8
 *   report    = 100 mA x 20 ms x 3.3 V = 6.6 mJ
 *   sleep     = 7 uA x 3.3 V
 */
static inline uint32_t witnessPeriodSec(float primaryMilliamps) {
  const float secondaryMa = primaryMilliamps / 1000.0f;
  const float harvestedMw = secondaryMa * 3.0f * 0.8f;
  const float sleepMw = 0.000007f * 3.3f * 1000.0f;
  const float perReportMj = 0.100f * 0.020f * 3.3f * 1000.0f;

  const float forReportsMw = harvestedMw - sleepMw;
  if (forReportsMw <= 0.0f) return WITNESS_MAX_PERIOD_SEC;

  const float period = perReportMj / forReportsMw;
  const uint32_t rounded = (uint32_t)ceilf(period);
  if (rounded < WITNESS_MIN_PERIOD_SEC) return WITNESS_MIN_PERIOD_SEC;
  if (rounded > WITNESS_MAX_PERIOD_SEC) return WITNESS_MAX_PERIOD_SEC;
  return rounded;
}

/**
 * Puts one report on the air.
 *
 * Declared here and implemented in the sketch's radio unit so the sampling
 * code above has no idea what a radio is — which is what makes it testable on
 * a bench with a multimeter and a serial cable.
 */
void witnessSend(const WitnessReport &r);
