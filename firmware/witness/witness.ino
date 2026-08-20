/*
 * Circuvent Witness — the clip-on sensor that disagrees.
 * =========================================================================
 *
 * A split-core transformer clamped around an appliance's flex. The same core
 * powers this board and measures the load, and the board has no galvanic
 * connection to mains anywhere.
 *
 * Its entire job is to report what is actually flowing. It does not switch
 * anything, it does not decide anything, and it does not know what the device
 * it is watching claims — the comparison happens on the control plane, in
 * src/lib/witness.ts. That separation is the point: a measurement with no
 * authority is easier to trust than one with.
 *
 * WHY IT IS ASLEEP ALMOST ALWAYS
 *
 * The energy budget is microwatts. At 23 W of observed load the board harvests
 * about 240 uW, and one report costs 6.6 mJ — so it can afford roughly one
 * every thirty seconds and must spend the rest of the time at a few microamps.
 * Everything below is shaped by that: there is no loop() worth the name, no
 * MQTT, and no connection to keep alive.
 *
 * WHY ESP-NOW AND NOT WI-FI
 *
 * Association. Every wake on this board is a cold start — the chip keeps
 * nothing but RTC memory through deep sleep — so an associating protocol would
 * pay for a scan, an association and a DHCP lease before saying anything, which
 * is more energy than this device has in a whole reporting interval. ESP-NOW
 * has none of that: bring the radio up, send one frame, go back to sleep.
 *
 * (A C6 with native 802.15.4 would be cheaper still and would speak Zigbee and
 * Thread directly. It is the obvious part for a second revision; this
 * toolchain has no Arduino support for it yet.)
 *
 * THE CADENCE IS NOT A CONSTANT
 *
 * It is derived from the current being measured, because a fixed rate that
 * closes on a big load falls short on a small one — and falling three
 * microwatts short does not mean nearly working, it means the capacitor drains
 * slowly and the sensor dies hours after installation looking perfectly
 * healthy. Which is the exact failure this product exists to catch.
 *
 * The rule lives in two places on purpose, and a test holds them equal:
 * sustainablePeriodSec() in src/lib/witness.ts is the authority, and
 * witnessPeriodSec() in witness-types.h is the copy that runs on hardware.
 *
 * THE CT SECONDARY IS SHORTED WHENEVER IT IS NOT IN USE
 *
 * An open-circuited current transformer on a live conductor develops hundreds
 * of volts across its secondary. SW1 shorts it; the firmware only releases the
 * short for the few milliseconds it is actually sampling. This is the one
 * thing in this file that can hurt somebody, so it is also the one thing
 * arranged to be true by default: the pin is driven to the shorting state
 * before it becomes an output, and it goes back before sleeping.
 */

/**
 * Version history:
 *   1.0.0  initial firmware.
 */
#define CV_FW_VERSION "1.0.0"

#include <Arduino.h>
#include <esp_sleep.h>
#include <math.h>

#include "witness-types.h"

/* ------------------------------------------------------------------- pins --*/

/* Shorts the CT secondary. HIGH = shorted = safe. */
#ifndef PIN_CT_SHORT
#define PIN_CT_SHORT 4
#endif

/* Burden voltage, biased to half rail. ADC1 — ADC2 is unavailable while the
   radio is active, and the symptom is a reading that drops to zero exactly
   when the device starts transmitting. */
#ifndef PIN_BURDEN
#define PIN_BURDEN 0
#endif

/* Storage capacitor through a divider that is switched rather than permanent:
   a fixed divider across a supercapacitor is a continuous leak, and at this
   budget a few microamps is a meaningful fraction of everything available. */
#ifndef PIN_RESERVE
#define PIN_RESERVE 1
#endif
#ifndef PIN_RESERVE_EN
#define PIN_RESERVE_EN 5
#endif

/* --------------------------------------------------------------- constants --*/

/*
 * 1000:1 core into a 22 ohm burden. One amp in the flex is one milliamp in the
 * secondary is 22 mV across the burden — small, which is why a whole mains
 * cycle is sampled rather than one reading trusted.
 */
#define CT_RATIO        1000.0f
#define BURDEN_OHMS     22.0f
#define ADC_FULL_SCALE  4095.0f
#define ADC_REF_MV      3300.0f

/* Two 50 Hz cycles, so a half-cycle artefact averages out. */
#define SAMPLE_WINDOW_MS 40
#define SAMPLE_COUNT     256

/* Below this the capacitor cannot be relied on to finish a transmission, and a
   truncated frame is worse than none because it reads as interference. */
#define RESERVE_MIN_MV  1600

RTC_DATA_ATTR static uint32_t bootCount = 0;
RTC_DATA_ATTR static uint16_t seq = 0;

/* ---------------------------------------------------------------- sampling --*/

static uint16_t readReserveMv() {
  pinMode(PIN_RESERVE_EN, OUTPUT);
  digitalWrite(PIN_RESERVE_EN, HIGH);
  delayMicroseconds(200); /* let the divider settle */
  const int raw = analogRead(PIN_RESERVE);
  digitalWrite(PIN_RESERVE_EN, LOW);
  pinMode(PIN_RESERVE_EN, INPUT); /* high-Z, so the pin itself leaks nothing */

  /* 1:2 divider, so the capacitor is twice what the pin sees. */
  return (uint16_t)((raw / ADC_FULL_SCALE) * ADC_REF_MV * 2.0f);
}

/**
 * RMS current in the clamped conductor, in milliamps.
 *
 * True RMS over a whole number of mains cycles, with the DC bias measured
 * rather than assumed. The bias network is a divider off the same rail the ADC
 * references, so it moves with the supply — a hard-coded half-scale would turn
 * a sagging capacitor into a phantom current, which is precisely the class of
 * fault this product exists to catch.
 */
static float readCurrentMa() {
  /* Release the short only for the window actually being sampled. */
  digitalWrite(PIN_CT_SHORT, LOW);
  delayMicroseconds(500); /* the core needs a moment to settle */

  static int32_t samples[SAMPLE_COUNT];
  uint32_t sum = 0;
  const uint32_t gapUs = (SAMPLE_WINDOW_MS * 1000UL) / SAMPLE_COUNT;

  for (int i = 0; i < SAMPLE_COUNT; i++) {
    samples[i] = analogRead(PIN_BURDEN);
    sum += (uint32_t)samples[i];
    delayMicroseconds(gapUs);
  }

  /* Short it again immediately, before any arithmetic. */
  digitalWrite(PIN_CT_SHORT, HIGH);

  const float mean = (float)sum / (float)SAMPLE_COUNT;

  double acc = 0;
  for (int i = 0; i < SAMPLE_COUNT; i++) {
    const double d = (double)samples[i] - mean;
    acc += d * d;
  }
  const float rmsCounts = (float)sqrt(acc / (double)SAMPLE_COUNT);
  const float rmsMv = (rmsCounts / ADC_FULL_SCALE) * ADC_REF_MV;

  /* Burden volts -> secondary amps -> primary amps. */
  const float secondaryA = (rmsMv / 1000.0f) / BURDEN_OHMS;
  return secondaryA * CT_RATIO * 1000.0f;
}

/* ------------------------------------------------------------------ setup --*/

void setup() {
  /*
   * The short goes on before the pin becomes an output.
   *
   * Order matters: a GPIO floats until it is driven, and a floating gate on
   * SW1 leaves the CT secondary open on a live conductor. Writing the safe
   * level first means the dangerous state does not exist even for the
   * microseconds between pinMode and the first write.
   */
  digitalWrite(PIN_CT_SHORT, HIGH);
  pinMode(PIN_CT_SHORT, OUTPUT);
  digitalWrite(PIN_CT_SHORT, HIGH);

  analogReadResolution(12);
  bootCount++;

  const uint16_t reserveMv = readReserveMv();

  /*
   * Too flat to transmit: sleep long and let the capacitor recover. Nothing is
   * reported, which the platform reads as silence — and because the previous
   * report carried the falling reserve, that silence has already been
   * explained rather than looking like a dead sensor.
   */
  if (reserveMv < RESERVE_MIN_MV) {
    esp_sleep_enable_timer_wakeup((uint64_t)WITNESS_MAX_PERIOD_SEC * 1000000ULL);
    esp_deep_sleep_start();
  }

  const float ma = readCurrentMa();

  WitnessReport r;
  r.seq = seq++;
  r.milliamps = ma;
  r.reserveMv = reserveMv;
  r.bootCount = bootCount;
  witnessSend(r);

  /*
   * The next wake is scheduled from what was just measured, not from a
   * constant. A load drawing more supplies more and is worth watching more
   * closely; a load drawing almost nothing supplies almost nothing, and asking
   * for a fixed rate there drains the capacitor flat with a sensor that
   * appears to be working.
   */
  const uint32_t sec = witnessPeriodSec(ma);
  esp_sleep_enable_timer_wakeup((uint64_t)sec * 1000000ULL);
  esp_deep_sleep_start();
}

/*
 * Never runs.
 *
 * Deep sleep on this part restarts from setup(), so there is no loop to be in.
 * Left here, empty and explained, because an empty loop() usually means
 * somebody forgot something and the next person should be able to tell the
 * difference at a glance.
 */
void loop() {}
