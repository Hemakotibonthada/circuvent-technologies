/*
 * Circuvent Energy Monitor — ESP32 firmware
 * Clamp-on CT sensor → live power (W) + cumulative energy (kWh) to the cloud.
 * Deps: CircuventDevice, ArduinoJson. Hardware: SCT-013 CT clamp on an ADC pin
 * with a burden resistor + bias network.
 */
/* Version history
 *   1.1.0  first build that survives a power cut with the router still down —
 *          see tests/firmware-power-restore.test.ts. Declared explicitly so the
 *          fleet can tell fixed devices from unfixed ones; without it every
 *          sketch reported the library default and they were indistinguishable.
 *   1.2.0  The cumulative total survives a power cut. `kwh` lived only in RAM,
 *          so every reboot restarted it at zero and the retained state jumped
 *          backwards — worse than losing the number, because a meter reading
 *          that decreases corrupts any consumption history built by
 *          differencing it. Adds a command handler, so the reset/calibrate
 *          actions the server's command map already builds stop being dropped.
 *   1.3.0  ...except that handler only understood `ctCal`, and the command map
 *          sends `watts`, `volts` or `amps` — trim against a known load, the
 *          same contract `meter` honours. All three were accepted and ignored.
 *          The assumed supply voltage is now settable and persisted rather
 *          than fixed at 230, and the assumptions behind the wattage are
 *          published so an app can say the number is derived, not measured.
 *          Also samples once a second instead of as fast as the ADC allows,
 *          which was publishing a quarter of a million state messages a day.
 */
#define CV_FW_VERSION "1.3.0"
#include <CircuventDevice.h>
#include <Preferences.h>

// Identical firmware — Wi-Fi + identity are provisioned by the Circuvent app.

#define CT_PIN 34
/*
 * Nominal mains voltage, and the power factor this front end has to assume.
 *
 * A CT clamp measures current and nothing else, so both of these are guesses —
 * see the header of firmware/meter, which exists because the guesses are often
 * wrong. The voltage at least is knowable and steady per site, so it is
 * settable and persisted rather than fixed at a value that is 4% wrong
 * wherever the supply actually sits at 240.
 */
float mainsVolts = 230.0f;
float ctCal = 30.0f;                 // amps per volt at the ADC — calibrate per burden resistor
float powerFactor = 0.95f;           // assumed; a CT cannot measure it

CircuventDevice cv("energy-monitor");
Preferences store;
double kwh = 0;
unsigned long lastCalc = 0;

/**
 * How much energy may accumulate before the total is written to flash.
 *
 * NVS is flash, and flash wears out. Writing on every loop would be tens of
 * thousands of writes a day for a number that changes in the fourth decimal
 * place. 0.01 kWh is ~10 Wh — a couple of minutes of a kettle, several hours
 * of standby — so a power cut costs at most that much of the total, while a
 * busy meter writes a few dozen times a day.
 */
const double KWH_SAVE_STEP = 0.01;
double kwhSaved = 0;

/*
 * The last values offered to the apps. Kept so a calibration trim has
 * something to solve against — the command arrives between loop passes, and
 * re-reading the CT inside the handler would measure a different moment from
 * the one the installer read off their reference meter.
 */
float lastWatts = 0, lastAmps = 0;

/*
 * How often the CT is read and the result published.
 *
 * The library publishes a changed state at most every `_minGap` (80 ms), and
 * ADC noise guarantees the float differs on every single read — so the meter
 * published as fast as it could sample, which is roughly three times a second
 * and a quarter of a million MQTT messages a day, each one written to Postgres
 * by the control plane. A live power figure nobody reads faster than once a
 * second does not need to be sent faster than that.
 */
const uint32_t SAMPLE_MS = 1000;
uint32_t lastSample = 0;

void saveKwh() {
  store.putDouble("kwh", kwh);
  kwhSaved = kwh;
}

float readIrms() {
  const int N = 1480;
  double sumSq = 0;
  /*
   * The DC bias is tracked, not assumed.
   *
   * It was hard-coded to 2048 (the ideal 12-bit mid-rail). The ESP32's ADC has
   * enough offset and non-linearity that the true bias is rarely there, and
   * any error becomes a constant added under the square root — so the meter
   * reported a phantom load with no current flowing at all.
   *
   * This is EmonLib's filter: a slow single-pole tracker that follows the DC
   * bias while ignoring the 50 Hz signal riding on it. `static` so it carries
   * across calls and stays converged rather than re-learning every window, and
   * it costs one double instead of buffering the whole sample window.
   */
  static double bias = 2048.0;
  for (int i = 0; i < N; i++) {
    const int raw = analogRead(CT_PIN);
    bias += (raw - bias) / 1024.0;
    const double v = raw - bias;
    sumSq += v * v;
    delayMicroseconds(200);
  }
  double rms = sqrt(sumSq / N);
  double volts = (rms / 4095.0) * 3.3;
  return volts * ctCal;  // amps
}

/**
 * Commands.
 *
 * `smarthome-command-map.ts` groups this device type with `meter`, so the
 * server can already build `reset` and `calibrate` for it. There was no
 * handler at all, which means the base library dropped every one of them at
 * `if (!_handler) return;` — the same silent no-op class of bug that
 * device-commands.ts was written to document.
 *
 * WHAT 1.2.0 STILL MISSED
 *
 * That fix added a handler, but only for `ctCal` — a raw multiplier nothing in
 * the product ever sends. The command map builds `calibrate` for this device
 * with `watts`, `volts` or `amps`, exactly as it does for `meter`: trim
 * against a known load rather than against a number somebody has to work out
 * from a burden resistor. All three went into a handler that looked only for
 * `ctCal` and returned having done nothing — the same silent no-op, one layer
 * further in.
 */
void onCommand(const String &action, JsonObjectConst p) {
  if (action == "reset") {
    kwh = 0;
    saveKwh();
    cv.set("kwh", 0.0f);
    cv.publishStateNow();
    return;
  }
  if (action == "calibrate" || action == "set") {
    /*
     * Both trims resolve to the one multiplier this front end actually has:
     * watts and amps are each proportional to ctCal, so the correction is the
     * ratio of true to measured. Guarded on a measured value well clear of
     * zero — dividing by a reading taken with the load switched off would send
     * the multiplier to infinity, and the meter would come back confidently
     * and unrecoverably wrong.
     */
    if (p["watts"].is<float>()) {
      const float trueW = p["watts"].as<float>();
      if (trueW > 0.0f && lastWatts > 1.0f) {
        ctCal = ctCal * (trueW / lastWatts);
        store.putFloat("ctcal", ctCal);
      }
    }
    if (p["amps"].is<float>()) {
      const float trueA = p["amps"].as<float>();
      if (trueA > 0.01f && lastAmps > 0.01f) {
        ctCal = ctCal * (trueA / lastAmps);
        store.putFloat("ctcal", ctCal);
      }
    }
    if (p["volts"].is<float>()) {
      /*
       * Not a trim but a statement of fact: this front end cannot measure
       * voltage, so it is told what the supply is. Bounded to plausible mains
       * so a stray value cannot silently rescale every future reading.
       */
      const float v = p["volts"].as<float>();
      if (v >= 80.0f && v <= 300.0f) { mainsVolts = v; store.putFloat("volts", mainsVolts); }
    }
    if (p["ctCal"].is<float>()) {
      // Rejected rather than clamped at zero: a calibration of 0 would report
      // no consumption at all, which reads exactly like a healthy idle meter.
      const float v = p["ctCal"].as<float>();
      if (v > 0.0f && v < 1000.0f) { ctCal = v; store.putFloat("ctcal", ctCal); }
    }
    cv.set("ctCal", ctCal);
    cv.set("volts", mainsVolts);
    cv.publishStateNow();
  }
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  store.begin("emon", false);
  kwh = store.getDouble("kwh", 0.0);
  kwhSaved = kwh;
  ctCal = store.getFloat("ctcal", ctCal);
  mainsVolts = store.getFloat("volts", mainsVolts);
  cv.onCommand(onCommand);
  cv.setInterval(10000);
  cv.setResetButton(0);  // BOOT/GPIO0: hold 3s to change Wi-Fi, 8s to factory reset
  cv.begin();
  lastCalc = millis();
}

void loop() {
  /*
   * readIrms() blocks for about 300 ms, so this also stops the CT being read
   * flat out. The energy integral still uses the real elapsed interval, so
   * sampling less often does not lose any of it.
   */
  const unsigned long now = millis();
  if (now - lastSample < SAMPLE_MS) {
    cv.loop();
    return;
  }
  lastSample = now;

  const float amps = readIrms();
  const float watts = amps * mainsVolts * powerFactor;
  const unsigned long after = millis();
  kwh += (double)watts * (after - lastCalc) / 3600000000.0;  // W·ms → kWh
  lastCalc = after;
  if (kwh - kwhSaved >= KWH_SAVE_STEP) saveKwh();

  lastWatts = watts;
  lastAmps = amps;

  cv.set("watts", watts);
  cv.set("amps", amps);
  cv.set("kwh", (float)kwh);
  cv.set("ctCal", ctCal);
  /*
   * Published so the apps can show what the wattage was derived from. A CT
   * clamp cannot measure either of these, and a number presented without that
   * caveat invites somebody to trust it the way they would trust a meter.
   */
  cv.set("volts", mainsVolts);
  cv.set("pf", powerFactor);
  cv.set("assumed", true);
  cv.loop();
}
