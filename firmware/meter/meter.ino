/*
 * Circuvent Energy Meter — ESP32 firmware for cv-em1 and cv-em3
 * BL0937 / HLW8012 front ends, 1 or 3 channels, opto-isolated pulse interface.
 * Deps: CircuventDevice, ArduinoJson. Board: ESP32.
 *
 * WHAT THIS REPLACES.
 *
 * firmware/energy-monitor reads a CT clamp on an ADC pin and then *assumes*
 * the two quantities that matter: mains at a fixed 230 V and a power factor of
 * 0.95. On a resistive load that is roughly right. On the things people
 * actually want measured — a fan on a triac, an LED driver, a pump starting —
 * the power factor is nowhere near 0.95, and the answer is wrong by whatever
 * the assumption was wrong by, with nothing in the reading to say so. The
 * metering front end measures voltage, current and true active power, so none
 * of it has to be assumed.
 *
 * THE PULSE INTERFACE, AND ITS TWO TRAPS.
 *
 * CF pulses at a rate proportional to active power. CF1 pulses at a rate
 * proportional to either RMS current or RMS voltage, depending on the SEL pin
 * — one pin, two measurements, alternating.
 *
 * Trap one: SEL polarity is inverted between the two parts this board accepts.
 * On BL0937, SEL high selects current; on HLW8012, SEL high selects voltage.
 * Fitting the other chip and keeping the same code gives a plausible-looking
 * meter that reports the voltage as the current and the current as the
 * voltage — a number around 230 where amps should be, which reads as a broken
 * calibration rather than a swapped signal. It is a build-time constant here,
 * named after the part.
 *
 * Trap two, and the one that produces the bug reports: at zero load CF simply
 * stops pulsing. There is no "zero" reading to receive. Code that holds the
 * last computed value therefore reports the last power the load ever drew,
 * forever, and a switched-off heater reads 2000 W until something else
 * happens. Every channel here has a staleness timeout: silence *is* the zero.
 *
 * ISOLATION. Everything on the meter side sits at mains potential; the host
 * sees only optocoupler outputs. Nothing here may assume otherwise — there is
 * no shared ground with the metering front end.
 */
/* Version history: 1.1.0 is the first build that survives a power cut with the
   router still down - see tests/firmware-power-restore.test.ts. Declared
   explicitly so the fleet can tell fixed devices from unfixed ones; without
   it every sketch reported the library default and they were
   indistinguishable. */
#define CV_FW_VERSION "1.1.0"
#include <CircuventDevice.h>
#include <Preferences.h>

/* ------------------------------------------------------------------ */
/* Build configuration                                                 */
/* ------------------------------------------------------------------ */

/* cv-em1 = 1, cv-em3 = 3. */
#ifndef METER_CHANNELS
#define METER_CHANNELS 3
#endif

/*
 * Which part is fitted. See "trap one" above — this is not cosmetic.
 * BL0937: SEL high -> current.  HLW8012: SEL high -> voltage.
 */
#define PART_BL0937 1
#define PART_HLW8012 2
#ifndef METER_PART
#define METER_PART PART_BL0937
#endif

#if METER_PART == PART_BL0937
#define SEL_LEVEL_FOR_CURRENT HIGH
#else
#define SEL_LEVEL_FOR_CURRENT LOW
#endif

/*
 * Host GPIOs. The board brings out CH<n>_CF, CH<n>_CF1 and one shared SEL on
 * the SELV side of the optos; which ESP32 pin each lands on is a property of
 * the host wiring, not of the meter, so it lives here.
 */
const uint8_t PIN_CF[3]  = {32, 33, 25};
const uint8_t PIN_CF1[3] = {26, 27, 14};
#define PIN_SEL 12

/*
 * Calibration.
 *
 * Pulse rate to real units depends on the shunt (1 mOhm on this board), the
 * divider feeding the voltage pins, and the part's internal reference. These
 * are the computed defaults; every board is trimmed against a known load and
 * the result stored, because tolerance on a 1 mOhm shunt is worth several
 * percent and nobody wants a meter that is confidently 6% wrong.
 */
const float DEFAULT_POWER_K   = 1.4813f;   /* W per Hz on CF */
const float DEFAULT_CURRENT_K = 0.00323f;  /* A per Hz on CF1 when SEL selects current */
const float DEFAULT_VOLTAGE_K = 0.79987f;  /* V per Hz on CF1 when SEL selects voltage */

/*
 * How long without an edge before the reading is zero rather than stale.
 *
 * At the bottom of the range CF pulses slowly, so this cannot be aggressive or
 * a small real load reads as nothing. Two seconds is about a watt on the
 * default calibration — below anything worth reporting, and far quicker than
 * a user notices.
 */
const uint32_t PULSE_TIMEOUT_MS = 2000;

/*
 * Settling time after SEL changes.
 *
 * The front end needs a couple of mains cycles before CF1 reflects the newly
 * selected quantity; reading immediately returns the previous one, which is
 * how a meter ends up reporting 230 A. A full second also gives a stable
 * period measurement at low current.
 */
const uint32_t SEL_SETTLE_MS = 1000;

/* ------------------------------------------------------------------ */
/* Pulse capture                                                       */
/* ------------------------------------------------------------------ */

struct PulseInput {
  volatile uint32_t lastEdgeUs;
  volatile uint32_t periodUs;
  volatile uint32_t edges;
};

static PulseInput cfIn[METER_CHANNELS];
static PulseInput cf1In[METER_CHANNELS];

/*
 * Period between edges, not a count over a window.
 *
 * Counting gives a reading only as often as the window closes, and at low
 * power the window has to be long. Timing consecutive edges responds as fast
 * as the signal allows, which at the top of the range is milliseconds.
 */
static inline void IRAM_ATTR onEdge(PulseInput &in) {
  uint32_t now = micros();
  uint32_t last = in.lastEdgeUs;
  if (last != 0) {
    uint32_t d = now - last;      /* unsigned subtraction wraps correctly */
    if (d > 50) in.periodUs = d;  /* ignore opto switching noise */
  }
  in.lastEdgeUs = now;
  in.edges++;
}

void IRAM_ATTR isrCfA()  { onEdge(cfIn[0]); }
void IRAM_ATTR isrCf1A() { onEdge(cf1In[0]); }
#if METER_CHANNELS > 1
void IRAM_ATTR isrCfB()  { onEdge(cfIn[1]); }
void IRAM_ATTR isrCf1B() { onEdge(cf1In[1]); }
#endif
#if METER_CHANNELS > 2
void IRAM_ATTR isrCfC()  { onEdge(cfIn[2]); }
void IRAM_ATTR isrCf1C() { onEdge(cf1In[2]); }
#endif

/** Hz from the captured period, or 0 when the signal has gone quiet. */
static float freqOf(PulseInput &in, uint32_t timeoutMs) {
  noInterrupts();
  uint32_t period = in.periodUs;
  uint32_t last = in.lastEdgeUs;
  interrupts();

  if (period == 0 || last == 0) return 0.0f;
  /* micros() wraps every ~71 minutes; unsigned subtraction handles it. */
  uint32_t sinceUs = micros() - last;
  if (sinceUs > timeoutMs * 1000UL) return 0.0f;   /* silence is zero, not stale */
  return 1000000.0f / (float)period;
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

CircuventDevice cv("meter");
Preferences store;

float powerK = DEFAULT_POWER_K;
float currentK = DEFAULT_CURRENT_K;
float voltageK = DEFAULT_VOLTAGE_K;

float watts[METER_CHANNELS];
float amps[METER_CHANNELS];
float volts = 0;                 /* one mains reference for the whole board */
double kwh[METER_CHANNELS];
double savedKwh[METER_CHANNELS];

bool selCurrent = true;          /* what CF1 is currently reporting */
uint32_t selSwitchedAt = 0;
uint32_t lastAccumMs = 0;
uint32_t lastPersistMs = 0;

static const char *chKey(const char *base, int i, char *buf, size_t n) {
  if (i == 0) snprintf(buf, n, "%s", base);
  else snprintf(buf, n, "%s%d", base, i + 1);
  return buf;
}

void persistEnergy() {
  /*
   * Energy totals survive a reboot, but NVS wears out, so this writes only
   * when a channel has moved by a hundredth of a unit. Saving every reading
   * would be a few million writes a year and an eventual flash failure, after
   * which the meter reports zero forever.
   */
  char key[16];
  for (int i = 0; i < METER_CHANNELS; i++) {
    if (fabs(kwh[i] - savedKwh[i]) < 0.01) continue;
    snprintf(key, sizeof(key), "kwh%d", i);
    store.putDouble(key, kwh[i]);
    savedKwh[i] = kwh[i];
  }
}

void publish() {
  char key[16];
  float total = 0;
  for (int i = 0; i < METER_CHANNELS; i++) {
    cv.set(chKey("watts", i, key, sizeof(key)), watts[i]);
    cv.set(chKey("amps", i, key, sizeof(key)), amps[i]);
    cv.set(chKey("kwh", i, key, sizeof(key)), (float)kwh[i]);

    /*
     * Power factor is derived, not measured: true power over apparent power.
     * It is published because it is the number that says whether a load is
     * what it claims to be — a fan on a triac at 0.6 draws far more current
     * than its wattage suggests, and nothing else in the payload reveals it.
     */
    float va = volts * amps[i];
    float pf = va > 1.0f ? watts[i] / va : 0.0f;
    if (pf > 1.0f) pf = 1.0f;   /* measurement noise near zero load */
    cv.set(chKey("pf", i, key, sizeof(key)), pf);
    total += watts[i];
  }
  cv.set("volts", volts);
  cv.set("channels", METER_CHANNELS);
#if METER_CHANNELS > 1
  cv.set("wattsTotal", total);
#endif
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action == "calibrate") {
    /*
     * Trim against a known load rather than against a nominal constant.
     *
     * A 1 mOhm shunt is several percent out of tolerance on its own and the
     * divider adds more. Sending the true watts of a reference load lets the
     * board solve for its own multiplier, which is the difference between a
     * meter that is roughly right and one somebody can bill against.
     */
    if (p["watts"].is<float>()) {
      float measuredHz = freqOf(cfIn[0], PULSE_TIMEOUT_MS);
      float trueW = p["watts"].as<float>();
      if (measuredHz > 0.1f && trueW > 0.0f) {
        powerK = trueW / measuredHz;
        store.putFloat("kp", powerK);
      }
    }
    if (p["volts"].is<float>() && volts > 0.0f) {
      float trueV = p["volts"].as<float>();
      if (trueV > 50.0f) {
        voltageK = voltageK * (trueV / volts);
        store.putFloat("kv", voltageK);
      }
    }
    if (p["amps"].is<float>() && amps[0] > 0.0f) {
      float trueA = p["amps"].as<float>();
      if (trueA > 0.01f) {
        currentK = currentK * (trueA / amps[0]);
        store.putFloat("ki", currentK);
      }
    }
    publish();
    return;
  }

  if (action == "reset") {
    /* Clearing a running total is an explicit act: a billing period ended, or
       the board moved to a different load. */
    int ch = p["ch"].is<int>() ? p["ch"].as<int>() : -1;
    char key[16];
    for (int i = 0; i < METER_CHANNELS; i++) {
      if (ch >= 0 && ch != i) continue;
      kwh[i] = 0;
      snprintf(key, sizeof(key), "kwh%d", i);
      store.putDouble(key, 0.0);
      savedKwh[i] = 0;
    }
    publish();
    return;
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(PIN_SEL, OUTPUT);
  digitalWrite(PIN_SEL, SEL_LEVEL_FOR_CURRENT);
  selCurrent = true;
  selSwitchedAt = millis();

  for (int i = 0; i < METER_CHANNELS; i++) {
    pinMode(PIN_CF[i], INPUT);
    pinMode(PIN_CF1[i], INPUT);
    watts[i] = 0;
    amps[i] = 0;
    kwh[i] = 0;
  }

  attachInterrupt(digitalPinToInterrupt(PIN_CF[0]), isrCfA, RISING);
  attachInterrupt(digitalPinToInterrupt(PIN_CF1[0]), isrCf1A, RISING);
#if METER_CHANNELS > 1
  attachInterrupt(digitalPinToInterrupt(PIN_CF[1]), isrCfB, RISING);
  attachInterrupt(digitalPinToInterrupt(PIN_CF1[1]), isrCf1B, RISING);
#endif
#if METER_CHANNELS > 2
  attachInterrupt(digitalPinToInterrupt(PIN_CF[2]), isrCfC, RISING);
  attachInterrupt(digitalPinToInterrupt(PIN_CF1[2]), isrCf1C, RISING);
#endif

  store.begin("meter", false);
  powerK   = store.getFloat("kp", DEFAULT_POWER_K);
  currentK = store.getFloat("ki", DEFAULT_CURRENT_K);
  voltageK = store.getFloat("kv", DEFAULT_VOLTAGE_K);
  char key[16];
  for (int i = 0; i < METER_CHANNELS; i++) {
    snprintf(key, sizeof(key), "kwh%d", i);
    kwh[i] = store.getDouble(key, 0.0);
    savedKwh[i] = kwh[i];
  }

  cv.onCommand(onCommand);
  cv.setInterval(10000);
  cv.setResetButton(0);  /* BOOT/GPIO0: hold 3s for Wi-Fi, 8s to factory reset */
  cv.begin();
  lastAccumMs = millis();
}

void loop() {
  uint32_t now = millis();

  /* Active power is always available: CF never shares its pin. */
  for (int i = 0; i < METER_CHANNELS; i++) {
    watts[i] = freqOf(cfIn[i], PULSE_TIMEOUT_MS) * powerK;
  }

  /*
   * CF1 alternates between current and voltage. Only trust it once the front
   * end has settled, and only update the quantity actually selected — writing
   * both from one reading is how a meter reports its voltage as its current.
   */
  if (now - selSwitchedAt >= SEL_SETTLE_MS) {
    if (selCurrent) {
      for (int i = 0; i < METER_CHANNELS; i++) {
        amps[i] = freqOf(cf1In[i], PULSE_TIMEOUT_MS) * currentK;
      }
    } else {
      /* All channels share one mains reference, so any pulsing channel gives
         the voltage. */
      for (int i = 0; i < METER_CHANNELS; i++) {
        float hz = freqOf(cf1In[i], PULSE_TIMEOUT_MS);
        if (hz > 0.0f) { volts = hz * voltageK; break; }
      }
    }
    /* Voltage moves slowly and current does not, so spend most of the time on
       current: three current windows for each voltage window. */
    static uint8_t cycle = 0;
    cycle = (cycle + 1) % 4;
    selCurrent = (cycle != 0);
    digitalWrite(PIN_SEL, selCurrent ? SEL_LEVEL_FOR_CURRENT : !SEL_LEVEL_FOR_CURRENT);
    selSwitchedAt = now;
  }

  /* Integrate energy from measured power over the real elapsed interval. */
  uint32_t dt = now - lastAccumMs;
  if (dt > 0) {
    for (int i = 0; i < METER_CHANNELS; i++) {
      kwh[i] += (double)watts[i] * (double)dt / 3600000000.0;  /* W.ms -> kWh */
    }
    lastAccumMs = now;
  }

  if (now - lastPersistMs > 60000) {
    persistEnergy();
    lastPersistMs = now;
  }

  publish();
  cv.loop();
}
