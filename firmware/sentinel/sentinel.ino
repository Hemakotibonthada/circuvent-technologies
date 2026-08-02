/*
 * Circuvent Sentinel — Safety, Climate & Control Panel (ESP32)
 * ============================================================
 * A wall panel that watches a room and acts on what it finds:
 *
 *   - Combustible gas / smoke detection (MQ-2 class sensor) with warm-up
 *     handling, clean-air baselining, hysteresis and a latching alarm.
 *   - Temperature and humidity (DHT11 by default, DHT22 supported).
 *   - 4 relay outputs for lights, fans, exhaust, or a gas solenoid valve.
 *   - 4 capacitive touch pads driving those relays, working entirely offline.
 *   - Instant cloud feedback: a tap publishes the new state immediately, so
 *     the app reflects a physical press without waiting for a poll.
 *   - Safety interlock: on a gas alarm, designated relays are cut and an
 *     exhaust relay is driven — detection without action is just a noise-maker.
 *   - Buzzer, occupancy (PIR), schedules, auto-off timers, runtime tracking.
 *
 * BOARD PROFILES
 * --------------
 * Two builds from one source, because the hardware genuinely cannot do both:
 *
 *   sentinel      (esp32dev) — everything above. The flagship.
 *   sentinel-cam  (esp32cam) — adds the camera, and gives up gas sensing plus
 *                              two relays and two pads to pay for it.
 *
 * Why the camera build loses the gas sensor: an MQ-2 is an analog part, and on
 * ESP32 the ADC2 block stops converting the moment Wi-Fi starts, so an analog
 * input has to sit on ADC1 (GPIO 32-39). On AI-Thinker the camera occupies 32,
 * 34, 35, 36 and 39 — all of ADC1 except GPIO 33, which carries the on-board
 * LED and would bias every reading. There is no honest way to sense gas on that
 * board, so this build does not pretend to.
 *
 * Run a Sentinel and a separate Circuvent Camera in the same room if you want
 * both; the app already groups devices by room.
 *
 * A NOTE ON UNITS
 * ---------------
 * This firmware never publishes a ppm figure. An MQ-2 cannot produce a
 * calibrated concentration without a per-gas curve, a known load resistance and
 * temperature/humidity compensation, none of which a wall panel has. Publishing
 * "420 ppm" would be a fabricated number that looks authoritative. What goes
 * out instead is the raw ADC reading, a percentage of the way to this sensor's
 * own alarm threshold, and a boolean. All three are true.
 *
 * Deps: CircuventDevice, ArduinoJson, Adafruit DHT.  Board: ESP32 / ESP32-CAM.
 */
#define CV_FW_VERSION "1.0.0"

#include <CircuventDevice.h>
#include <Preferences.h>
#include <DHT.h>

/* ==================================================================== */
/*  Board profile                                                        */
/* ==================================================================== */

// Set by platformio.ini. Default is the full panel.
#ifndef CV_BOARD_CAM
#define CV_BOARD_CAM 0
#endif

#if CV_BOARD_CAM
  // ---- ESP32-CAM (AI-Thinker) -------------------------------------------
  // The camera owns most of the I/O. What is left is the SD card's pins, free
  // only because this build never mounts the card.
  #define CV_HAS_CAMERA   1
  #define CV_HAS_GAS      0   // see the header: ADC1 is gone
  #define CV_HAS_PIR      0
  #define CV_HAS_BUZZER   0
  #define NUM_RELAY       2
  #define NUM_TOUCH       2

  #define DHT_PIN         16
  #define STATUS_LED      33          // AI-Thinker red LED, active LOW
  #define STATUS_LED_ON   LOW
  #define CV_RESET_BTN    -1          // no free pin; factory reset from the app

  // Camera pin map — AI-Thinker.
  #define PWDN_GPIO_NUM  32
  #define RESET_GPIO_NUM -1
  #define XCLK_GPIO_NUM   0
  #define SIOD_GPIO_NUM  26
  #define SIOC_GPIO_NUM  27
  #define Y9_GPIO_NUM    35
  #define Y8_GPIO_NUM    34
  #define Y7_GPIO_NUM    39
  #define Y6_GPIO_NUM    36
  #define Y5_GPIO_NUM    21
  #define Y4_GPIO_NUM    19
  #define Y3_GPIO_NUM    18
  #define Y2_GPIO_NUM     5
  #define VSYNC_GPIO_NUM 25
  #define HREF_GPIO_NUM  23
  #define PCLK_GPIO_NUM  22

  const uint8_t RELAY_PIN[NUM_RELAY] = { 14, 15 };
  const uint8_t TOUCH_PIN[NUM_TOUCH] = { 13 /*T4*/, 2 /*T2*/ };

#else
  // ---- ESP32 DevKit (WROOM-32) ------------------------------------------
  // Relays deliberately avoid GPIO 0, 2, 5, 12 and 15: those are strapping pins
  // that pulse while the chip boots, which on a relay board means an audible
  // click and a mains load flicking on every restart. They also avoid 16 and
  // 17, which carry PSRAM on WROVER modules.
  #define CV_HAS_CAMERA   0
  #define CV_HAS_GAS      1
  #define CV_HAS_PIR      1
  #define CV_HAS_BUZZER   1
  #define NUM_RELAY       4
  #define NUM_TOUCH       4

  #define DHT_PIN         18
  #define GAS_ANALOG_PIN  34          // ADC1_CH6, input-only
  #define GAS_DIGITAL_PIN 35          // the module's own comparator output
  #define BUZZER_PIN      27
  #define PIR_PIN         39          // input-only
  #define STATUS_LED       2
  #define STATUS_LED_ON   HIGH
  #define CV_RESET_BTN     0          // BOOT button

  const uint8_t RELAY_PIN[NUM_RELAY] = { 19, 21, 22, 23 };
  // Pads skip GPIO 12 (MTDI): it selects the flash voltage at boot, and a hand
  // resting on the panel during a power cut could stop it booting at all.
  const uint8_t TOUCH_PIN[NUM_TOUCH] = { 4 /*T0*/, 13 /*T4*/, 14 /*T6*/, 33 /*T8*/ };
#endif

// Swap the sensor with -DCV_DHT_TYPE=DHT22.
#ifndef CV_DHT_TYPE
#define CV_DHT_TYPE DHT11
#endif

/* -------------------------------------------------------------------- */
/*  Compile-time pin clash guard                                         */
/*                                                                       */
/*  A camera build once shipped with the reset button on the same pin as */
/*  XCLK. Everything reported healthy and the sensor produced no frames,  */
/*  because pinMode() on the reset button silently detached the clock     */
/*  output. Pin collisions do not announce themselves at runtime, so they */
/*  are caught here instead.                                              */
/* -------------------------------------------------------------------- */
#if CV_HAS_CAMERA
  #if (CV_RESET_BTN != -1) && (CV_RESET_BTN == XCLK_GPIO_NUM || CV_RESET_BTN == SIOD_GPIO_NUM || \
       CV_RESET_BTN == SIOC_GPIO_NUM || CV_RESET_BTN == PWDN_GPIO_NUM)
    #error "CV_RESET_BTN collides with a camera pin. Configuring it will silently break the sensor."
  #endif
  #if (DHT_PIN == XCLK_GPIO_NUM || DHT_PIN == SIOD_GPIO_NUM || DHT_PIN == SIOC_GPIO_NUM || \
       DHT_PIN == PWDN_GPIO_NUM || DHT_PIN == Y2_GPIO_NUM || DHT_PIN == Y3_GPIO_NUM || \
       DHT_PIN == Y4_GPIO_NUM || DHT_PIN == Y5_GPIO_NUM)
    #error "DHT_PIN collides with a camera pin."
  #endif
#endif
#if CV_HAS_GAS && (GAS_ANALOG_PIN < 32 || GAS_ANALOG_PIN > 39)
  // ADC2 stops converting once Wi-Fi is up, so a sensor there reads perfectly
  // on the bench and returns garbage in the field.
  #error "GAS_ANALOG_PIN must be on ADC1 (GPIO 32-39); ADC2 is unusable while Wi-Fi is active."
#endif

/* ==================================================================== */
/*  Tunables                                                             */
/* ==================================================================== */

// MQ-2 sensors read high and drift down while the heater stabilises. Alarming
// during that window produces a false alarm after every power cut, which is the
// fastest way to teach someone to ignore the panel.
static const uint32_t GAS_WARMUP_MS    = 90000;    // 90 s before gas is trusted
static const uint32_t GAS_SAMPLE_MS    = 500;
static const int      GAS_ALARM_MARGIN = 700;      // ADC counts above baseline
static const int      GAS_CLEAR_MARGIN = 450;      // must fall this far to clear
static const uint32_t GAS_ALARM_MIN_MS = 3000;     // sustained before alarming
static const uint32_t GAS_BASELINE_MS  = 600000;   // slow re-baseline, 10 min

static const uint32_t DHT_SAMPLE_MS    = 2500;     // DHT11 needs > 1 s between reads
static const uint8_t  DHT_FAIL_LIMIT   = 5;        // consecutive fails before "faulty"

static const uint32_t TOUCH_DEBOUNCE_MS = 300;
static const float    TOUCH_TRIGGER     = 0.65f;   // fraction of baseline
static const uint32_t TOUCH_RECAL_MS    = 300000;  // drift correction, 5 min

static const uint32_t MUTE_TIMEOUT_MS   = 300000;  // buzzer un-mutes after 5 min
static const uint32_t TELEMETRY_MS      = 60000;

#define MAX_SCHEDULES 8

/* ==================================================================== */
/*  State                                                                */
/* ==================================================================== */

CircuventDevice cv("sentinel");
Preferences store;
DHT dht(DHT_PIN, CV_DHT_TYPE);

// ---- relays ----
bool relayOn[NUM_RELAY];
bool relaySaved[NUM_RELAY];
uint32_t relayOnSince[NUM_RELAY];     // millis when it last switched on
uint32_t relayRuntimeS[NUM_RELAY];    // cumulative seconds, persisted
uint32_t relayAutoOffAt[NUM_RELAY];   // 0 = no timer armed
uint16_t relayAutoOffMin[NUM_RELAY];  // configured minutes, 0 = disabled

// Relays cut when gas is detected, as a bitmask over relay index. A gas
// solenoid or a hob feed belongs here; an exhaust fan does not.
uint8_t safetyCutMask = 0;
// Relay driven ON during an alarm, to clear the air. -1 = none.
int8_t exhaustRelay = -1;

// ---- gas ----
#if CV_HAS_GAS
int  gasRaw = 0;
int  gasBaseline = 0;
bool gasAlarm = false;
bool gasReady = false;                // warm-up complete
uint32_t gasAboveSince = 0;
uint32_t lastGasSample = 0;
uint32_t lastBaselineAt = 0;
long gasAccum = 0;
int  gasAccumN = 0;
#endif

// ---- climate ----
float temperature = NAN, humidity = NAN;
bool  climateOk = false;
uint8_t dhtFails = 0;
uint32_t lastDhtRead = 0;

// ---- touch ----
int  touchBase[NUM_TOUCH];
uint32_t lastTouchAt = 0;
uint32_t lastTouchRecal = 0;

// ---- misc ----
bool muted = false;
uint32_t muteUntil = 0;
bool awayMode = false;
bool motion = false;
uint32_t lastTelemetry = 0;
int lastScheduleMinute = -1;

struct Schedule { int8_t relay; int16_t onMin; int16_t offMin; uint8_t days; bool enabled; };
Schedule schedules[MAX_SCHEDULES];

#if CV_HAS_CAMERA
void setStreaming(bool on);
void sendFrame(bool force);
#endif

/* ==================================================================== */
/*  Buzzer                                                               */
/* ==================================================================== */

#if CV_HAS_BUZZER
bool beepState = false;
uint32_t lastBeepToggle = 0;

void buzzerOff() { digitalWrite(BUZZER_PIN, LOW); beepState = false; }

/** Short acknowledgement that a tap landed. */
void chirp() {
  if (muted) return;
  digitalWrite(BUZZER_PIN, HIGH);
  delay(25);                     // short enough not to stall the MQTT loop
  digitalWrite(BUZZER_PIN, LOW);
}

/** Alarm pattern, driven from loop() so nothing blocks. */
void alarmTone() {
  if (muted) { digitalWrite(BUZZER_PIN, LOW); return; }
  uint32_t now = millis();
  if (now - lastBeepToggle > (beepState ? 150u : 120u)) {
    beepState = !beepState;
    digitalWrite(BUZZER_PIN, beepState ? HIGH : LOW);
    lastBeepToggle = now;
  }
}
#else
void buzzerOff() {}
void chirp() {}
void alarmTone() {}
#endif

/* ==================================================================== */
/*  Relays                                                               */
/* ==================================================================== */

const char *relayKey(int i) {
  static char k[4];
  snprintf(k, sizeof(k), "r%d", i + 1);
  return k;
}

/**
 * Switches a relay and reports it.
 *
 * `source` reaches the cloud so the timeline can say *why* a light came on — a
 * tap, a schedule, the app, or a safety cut. Without it every change looks
 * identical after the fact, which makes a spurious switch impossible to
 * investigate.
 *
 * Publishing immediately is the whole point of the panel: a physical tap has to
 * appear in the app at once, not on the next heartbeat.
 */
void setRelay(int i, bool on, const char *source, bool persist = true) {
  if (i < 0 || i >= NUM_RELAY) return;

  if (relayOn[i] != on) {
    if (on) {
      relayOnSince[i] = millis();
    } else if (relayOnSince[i] > 0) {
      relayRuntimeS[i] += (millis() - relayOnSince[i]) / 1000;
      relayOnSince[i] = 0;
      char rk[8]; snprintf(rk, sizeof(rk), "rt%d", i);
      store.putUInt(rk, relayRuntimeS[i]);
    }
  }

  relayOn[i] = on;
  digitalWrite(RELAY_PIN[i], on ? HIGH : LOW);
  cv.set(relayKey(i), on);
  cv.set("lastSource", source);

  // The timer is armed on the transition to on and cleared otherwise, so
  // re-sending "on" cannot silently extend a fan that is already running.
  if (on && relayAutoOffMin[i] > 0) {
    relayAutoOffAt[i] = millis() + (uint32_t)relayAutoOffMin[i] * 60000UL;
  } else if (!on) {
    relayAutoOffAt[i] = 0;
  }

  if (persist && relayOn[i] != relaySaved[i]) {
    store.putBool(relayKey(i), on);
    relaySaved[i] = on;
  }

  cv.publishStateNow();
}

void setAllRelays(bool on, const char *source) {
  for (int i = 0; i < NUM_RELAY; i++) setRelay(i, on, source);
}

/* ==================================================================== */
/*  Gas                                                                  */
/* ==================================================================== */

#if CV_HAS_GAS

/**
 * How far the reading has travelled from this sensor's own clean-air baseline
 * towards its alarm threshold. Not a concentration, and named so that nobody
 * mistakes it for one.
 */
int gasPercent() {
  if (gasBaseline <= 0) return 0;
  int over = gasRaw - gasBaseline;
  if (over <= 0) return 0;
  int pct = (int)((over * 100L) / GAS_ALARM_MARGIN);
  return pct > 100 ? 100 : pct;
}

/** Samples clean air to learn what "normal" looks like for this sensor. */
void calibrateGas() {
  long acc = 0;
  for (int i = 0; i < 32; i++) { acc += analogRead(GAS_ANALOG_PIN); delay(20); }
  gasBaseline = acc / 32;
  store.putInt("gasBase", gasBaseline);
  lastBaselineAt = millis();
  cv.set("gasBaseline", gasBaseline);
}

/** Cuts appliances and starts the exhaust. Called once, on the alarm edge. */
void engageSafety() {
  for (int i = 0; i < NUM_RELAY; i++) {
    if (safetyCutMask & (1 << i)) setRelay(i, false, "gas-alarm");
  }
  if (exhaustRelay >= 0 && exhaustRelay < NUM_RELAY) {
    setRelay(exhaustRelay, true, "gas-alarm");
  }
}

void sampleGas() {
  uint32_t now = millis();
  if (now - lastGasSample < GAS_SAMPLE_MS) return;
  lastGasSample = now;

  // Average a burst: a single ESP32 ADC read is noisy enough to cross a
  // threshold on its own.
  long acc = 0;
  for (int i = 0; i < 8; i++) acc += analogRead(GAS_ANALOG_PIN);
  gasRaw = (int)(acc / 8);
  cv.set("gasRaw", gasRaw);

  if (!gasReady) {
    if (now < GAS_WARMUP_MS) {
      cv.set("gasWarmingUp", true);
      return;                       // deliberately no alarm decision yet
    }
    gasReady = true;
    cv.set("gasWarmingUp", false);
    cv.set("gasReady", true);
    // A baseline taken from a cold boot is meaningless; take it once warm,
    // unless the installer has already calibrated deliberately.
    if (gasBaseline <= 0) calibrateGas();
  }

  cv.set("gasPct", gasPercent());

  // Two thresholds, not one: a reading hovering at the limit would otherwise
  // chatter the alarm and the siren on and off.
  const int alarmAt = gasBaseline + GAS_ALARM_MARGIN;
  const int clearAt = gasBaseline + GAS_CLEAR_MARGIN;

  bool moduleTrip = (digitalRead(GAS_DIGITAL_PIN) == LOW);   // modules pull low

  if (!gasAlarm) {
    if (gasRaw >= alarmAt || moduleTrip) {
      if (gasAboveSince == 0) gasAboveSince = now;
      // Sustained, not a spike: a slammed door or a passing aerosol should not
      // empty the house.
      if (now - gasAboveSince >= GAS_ALARM_MIN_MS) {
        gasAlarm = true;
        cv.set("gasAlarm", true);
        engageSafety();
      }
    } else {
      gasAboveSince = 0;
    }
  } else if (gasRaw < clearAt && !moduleTrip) {
    gasAlarm = false;
    gasAboveSince = 0;
    cv.set("gasAlarm", false);
    buzzerOff();
    cv.publishStateNow();
  }

  // Slow baseline tracking, and only while the air is demonstrably clean —
  // doing it during an alarm would teach the sensor that a leak is normal.
  if (gasReady && !gasAlarm && gasRaw < clearAt) {
    gasAccum += gasRaw;
    gasAccumN++;
    if (now - lastBaselineAt > GAS_BASELINE_MS && gasAccumN > 0) {
      int fresh = (int)(gasAccum / gasAccumN);
      // Move part of the way, so one odd window cannot drag it far.
      gasBaseline = (gasBaseline * 3 + fresh) / 4;
      store.putInt("gasBase", gasBaseline);
      cv.set("gasBaseline", gasBaseline);
      lastBaselineAt = now;
      gasAccum = 0;
      gasAccumN = 0;
    }
  }
}
#endif  // CV_HAS_GAS

/* ==================================================================== */
/*  Climate                                                              */
/* ==================================================================== */

/**
 * Reads the DHT.
 *
 * DHT11s fail regularly — a checksum error every few dozen reads is normal, not
 * a fault. A single failure therefore keeps the last good value rather than
 * publishing NaN, which would put a hole in every chart and confuse the
 * analysis engine downstream. Only a run of failures is reported as broken.
 */
void sampleClimate() {
  uint32_t now = millis();
  if (now - lastDhtRead < DHT_SAMPLE_MS) return;
  lastDhtRead = now;

  float h = dht.readHumidity();
  float t = dht.readTemperature();

  // Range-checked as well as NaN-checked: a disconnected data line can decode
  // to a plausible number nowhere near what the part can actually measure.
  bool ok = !isnan(h) && !isnan(t) && h >= 0 && h <= 100 && t > -40 && t < 85;

  if (!ok) {
    if (dhtFails < 255) dhtFails++;
    if (dhtFails >= DHT_FAIL_LIMIT && climateOk) {
      climateOk = false;
      cv.set("climateOk", false);
    }
    return;
  }

  dhtFails = 0;
  temperature = t;
  humidity = h;
  if (!climateOk) { climateOk = true; cv.set("climateOk", true); }

  cv.set("temp", temperature);
  cv.set("humidity", humidity);
  // What the air feels like, which is what a person actually notices.
  cv.set("heatIndex", dht.computeHeatIndex(t, h, false));
}

/* ==================================================================== */
/*  Touch                                                                */
/* ==================================================================== */

void calibrateTouch() {
  for (int i = 0; i < NUM_TOUCH; i++) {
    long acc = 0;
    for (int s = 0; s < 16; s++) { acc += touchRead(TOUCH_PIN[i]); delay(5); }
    touchBase[i] = (int)(acc / 16);
  }
  lastTouchRecal = millis();
}

void pollTouch() {
  uint32_t now = millis();
  if (now - lastTouchAt < TOUCH_DEBOUNCE_MS) return;

  for (int i = 0; i < NUM_TOUCH; i++) {
    int v = touchRead(TOUCH_PIN[i]);
    if (touchBase[i] > 0 && v < touchBase[i] * TOUCH_TRIGGER) {
      if (i < NUM_RELAY) {
        setRelay(i, !relayOn[i], "touch");
        chirp();
      }
      lastTouchAt = now;
      return;
    }
  }

  // Capacitance drifts with temperature and humidity — precisely the conditions
  // this panel sits in — so the baseline is re-taken periodically, and only
  // when nothing is being touched.
  if (now - lastTouchRecal > TOUCH_RECAL_MS) calibrateTouch();
}

/* ==================================================================== */
/*  Schedules                                                            */
/* ==================================================================== */

void saveSchedule(int idx) {
  char k[8]; snprintf(k, sizeof(k), "sc%d", idx);
  store.putBytes(k, &schedules[idx], sizeof(Schedule));
}

void loadSchedules() {
  for (int i = 0; i < MAX_SCHEDULES; i++) {
    char k[8]; snprintf(k, sizeof(k), "sc%d", i);
    if (store.getBytesLength(k) == sizeof(Schedule)) {
      store.getBytes(k, &schedules[i], sizeof(Schedule));
    } else {
      schedules[i] = { -1, -1, -1, 0x7F, false };
    }
  }
}

void applySchedules() {
  time_t nowT = time(nullptr);
  if (nowT < 100000) return;              // clock not set yet
  struct tm tmv;
  localtime_r(&nowT, &tmv);
  int minuteOfDay = tmv.tm_hour * 60 + tmv.tm_min;
  if (minuteOfDay == lastScheduleMinute) return;
  lastScheduleMinute = minuteOfDay;

  uint8_t todayBit = (uint8_t)(1 << tmv.tm_wday);    // bit 0 = Sunday

  for (int i = 0; i < MAX_SCHEDULES; i++) {
    Schedule &s = schedules[i];
    if (!s.enabled || s.relay < 0 || s.relay >= NUM_RELAY) continue;
    if (!(s.days & todayBit)) continue;
    if (s.onMin  == minuteOfDay) setRelay(s.relay, true,  "schedule");
    if (s.offMin == minuteOfDay) setRelay(s.relay, false, "schedule");
  }
}

/* ==================================================================== */
/*  Commands                                                             */
/* ==================================================================== */

void onCommand(const String &action, JsonObjectConst p) {
  if (action == "set") {
    for (int i = 0; i < NUM_RELAY; i++) {
      const char *k = relayKey(i);
      if (p[k].is<bool>()) setRelay(i, p[k].as<bool>(), "cloud");
    }
    if (p["all"].is<bool>()) setAllRelays(p["all"].as<bool>(), "cloud");

    if (p["away"].is<bool>()) {
      awayMode = p["away"].as<bool>();
      store.putBool("away", awayMode);
      cv.set("away", awayMode);
      if (awayMode) setAllRelays(false, "away-mode");
    }

    if (p["muted"].is<bool>()) {
      muted = p["muted"].as<bool>();
      // Auto-expiring, because a permanently silenced gas alarm is worse than
      // no alarm at all: it still looks like it is working.
      muteUntil = muted ? millis() + MUTE_TIMEOUT_MS : 0;
      cv.set("muted", muted);
      if (muted) buzzerOff();
    }

    // { "autoOff": { "relay": 2, "minutes": 30 } }
    if (p["autoOff"].is<JsonObjectConst>()) {
      JsonObjectConst a = p["autoOff"].as<JsonObjectConst>();
      int r = a["relay"] | -1;
      int m = a["minutes"] | 0;
      if (r >= 0 && r < NUM_RELAY) {
        relayAutoOffMin[r] = (uint16_t)constrain(m, 0, 1440);
        char k[8]; snprintf(k, sizeof(k), "ao%d", r);
        store.putUShort(k, relayAutoOffMin[r]);
        if (relayOn[r] && relayAutoOffMin[r] > 0) {
          relayAutoOffAt[r] = millis() + (uint32_t)relayAutoOffMin[r] * 60000UL;
        }
      }
    }

    if (p["safetyCutMask"].is<int>()) {
      safetyCutMask = (uint8_t)(p["safetyCutMask"].as<int>() & ((1 << NUM_RELAY) - 1));
      store.putUChar("cutMask", safetyCutMask);
      cv.set("safetyCutMask", (int)safetyCutMask);
    }
    if (p["exhaustRelay"].is<int>()) {
      int r = p["exhaustRelay"].as<int>();
      exhaustRelay = (r >= 0 && r < NUM_RELAY) ? (int8_t)r : (int8_t)-1;
      store.putChar("exhaust", exhaustRelay);
      cv.set("exhaustRelay", (int)exhaustRelay);
    }

    // { "schedule": { "idx":0, "relay":1, "onMin":1080, "offMin":1380, "days":127, "en":true } }
    if (p["schedule"].is<JsonObjectConst>()) {
      JsonObjectConst s = p["schedule"].as<JsonObjectConst>();
      int idx = s["idx"] | -1;
      if (idx >= 0 && idx < MAX_SCHEDULES) {
        schedules[idx] = {
          (int8_t)(s["relay"]   | -1),
          (int16_t)(s["onMin"]  | -1),
          (int16_t)(s["offMin"] | -1),
          (uint8_t)(s["days"]   | 0x7F),
          (bool)(s["en"] | false)
        };
        saveSchedule(idx);
      }
    }

#if CV_HAS_CAMERA
    if (p["streaming"].is<bool>()) setStreaming(p["streaming"].as<bool>());
#endif
    return;
  }

#if CV_HAS_GAS
  // Deliberately manual: calibration is only valid in clean air, and only the
  // person standing in the room knows whether it is.
  if (action == "calibrateGas") { calibrateGas(); cv.publishStateNow(); return; }

  // The alarm latches rather than self-clearing, on the assumption that someone
  // should look before it is dismissed.
  if (action == "clearAlarm") {
    gasAlarm = false;
    gasAboveSince = 0;
    cv.set("gasAlarm", false);
    buzzerOff();
    cv.publishStateNow();
    return;
  }
#endif

  // Proves the siren and its wiring still work. A detector nobody has tested is
  // an assumption, not a safeguard.
  if (action == "test") {
#if CV_HAS_BUZZER
    bool wasMuted = muted;
    muted = false;
    for (int i = 0; i < 3; i++) {
      digitalWrite(BUZZER_PIN, HIGH); delay(120);
      digitalWrite(BUZZER_PIN, LOW);  delay(120);
    }
    muted = wasMuted;
#endif
    cv.set("lastTest", (long)(millis() / 1000));
    cv.publishStateNow();
    return;
  }

  if (action == "recalibrateTouch") { calibrateTouch(); return; }

#if CV_HAS_CAMERA
  if (action == "snapshot") { sendFrame(true); return; }
#endif
}

/* ==================================================================== */
/*  Camera (ESP32-CAM build only)                                        */
/* ==================================================================== */

#if CV_HAS_CAMERA
#include "esp_camera.h"

bool streaming = false;
bool cameraReady = false;
uint8_t frameFails = 0;
uint32_t lastFrameAt = 0;
int fps = 5;

void setStreaming(bool on) {
  streaming = on && cameraReady;
  cv.set("streaming", streaming);
  cv.publishStateNow();
}

/**
 * Publishes one frame.
 *
 * Frames go to cv/<id>/frame, never telemetry: every telemetry message is
 * INSERTed into Postgres, so a streaming camera would write tens of thousands
 * of rows an hour, each holding a whole JPEG.
 */
void sendFrame(bool force) {
  if (!cameraReady) return;
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    // Report the sensor as unavailable rather than leaving the app showing a
    // camera that has quietly stopped producing anything.
    if (++frameFails >= 5 && cameraReady) {
      cameraReady = false;
      cv.set("cameraReady", false);
      cv.publishStateNow();
    }
    return;
  }
  frameFails = 0;
  cv.publishFrame(fb->buf, fb->len);
  esp_camera_fb_return(fb);
  if (!force) lastFrameAt = millis();
}

bool startCamera() {
  camera_config_t c = {};
  c.ledc_channel = LEDC_CHANNEL_0;
  c.ledc_timer   = LEDC_TIMER_0;
  c.pin_d0 = Y2_GPIO_NUM;  c.pin_d1 = Y3_GPIO_NUM;
  c.pin_d2 = Y4_GPIO_NUM;  c.pin_d3 = Y5_GPIO_NUM;
  c.pin_d4 = Y6_GPIO_NUM;  c.pin_d5 = Y7_GPIO_NUM;
  c.pin_d6 = Y8_GPIO_NUM;  c.pin_d7 = Y9_GPIO_NUM;
  c.pin_xclk = XCLK_GPIO_NUM;     c.pin_pclk  = PCLK_GPIO_NUM;
  c.pin_vsync = VSYNC_GPIO_NUM;   c.pin_href  = HREF_GPIO_NUM;
  c.pin_sccb_sda = SIOD_GPIO_NUM; c.pin_sccb_scl = SIOC_GPIO_NUM;
  c.pin_pwdn = PWDN_GPIO_NUM;     c.pin_reset = RESET_GPIO_NUM;
  c.xclk_freq_hz = 20000000;
  c.pixel_format = PIXFORMAT_JPEG;
  c.frame_size   = psramFound() ? FRAMESIZE_VGA : FRAMESIZE_QVGA;
  c.jpeg_quality = psramFound() ? 12 : 15;
  c.fb_count     = psramFound() ? 2 : 1;
  c.grab_mode    = CAMERA_GRAB_LATEST;

  return esp_camera_init(&c) == ESP_OK;
}
#endif  // CV_HAS_CAMERA

/* ==================================================================== */
/*  Setup                                                                */
/* ==================================================================== */

void setup() {
  Serial.begin(115200);

  for (int i = 0; i < NUM_RELAY; i++) {
    pinMode(RELAY_PIN[i], OUTPUT);
    digitalWrite(RELAY_PIN[i], LOW);      // known-off before anything else runs
    relayOn[i] = false;
    relaySaved[i] = false;
    relayOnSince[i] = 0;
    relayAutoOffAt[i] = 0;
    relayAutoOffMin[i] = 0;
    relayRuntimeS[i] = 0;
  }

  pinMode(STATUS_LED, OUTPUT);
#if CV_HAS_BUZZER
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
#endif
#if CV_HAS_GAS
  pinMode(GAS_ANALOG_PIN, INPUT);
  pinMode(GAS_DIGITAL_PIN, INPUT_PULLUP);
  analogSetPinAttenuation(GAS_ANALOG_PIN, ADC_11db);   // full 0-3.3 V span
#endif
#if CV_HAS_PIR
  pinMode(PIR_PIN, INPUT);
#endif

  store.begin("sentinel", false);

  // Restore what the panel was doing before the power cut: a fan that was
  // running should still be running. The alternative is a house that resets
  // itself every time the supply blinks.
  for (int i = 0; i < NUM_RELAY; i++) {
    relaySaved[i] = store.getBool(relayKey(i), false);
    char rk[8]; snprintf(rk, sizeof(rk), "rt%d", i);
    relayRuntimeS[i] = store.getUInt(rk, 0);
    char ak[8]; snprintf(ak, sizeof(ak), "ao%d", i);
    relayAutoOffMin[i] = store.getUShort(ak, 0);
  }
  awayMode      = store.getBool("away", false);
  safetyCutMask = store.getUChar("cutMask", 0);
  exhaustRelay  = (int8_t)store.getChar("exhaust", -1);
#if CV_HAS_GAS
  gasBaseline   = store.getInt("gasBase", 0);
#endif
  loadSchedules();

  dht.begin();
  calibrateTouch();

#if CV_HAS_CAMERA
  // Started before cv.begin(): the library configures its own pins, and a
  // collision there is exactly what the compile-time guard above exists to stop.
  cameraReady = startCamera();
#endif

  cv.onCommand(onCommand);
  cv.setInterval(10000);
#if CV_RESET_BTN >= 0
  cv.setResetButton(CV_RESET_BTN);
#endif
  cv.begin();

  // Published so the app lays out the right number of controls, rather than
  // assuming a fixed board.
  cv.set("relays", NUM_RELAY);
  cv.set("pads", NUM_TOUCH);
  cv.set("away", awayMode);
  cv.set("muted", false);
  cv.set("safetyCutMask", (int)safetyCutMask);
  cv.set("exhaustRelay", (int)exhaustRelay);
  cv.set("hasGas", (bool)CV_HAS_GAS);
  cv.set("hasCamera", (bool)CV_HAS_CAMERA);
  cv.set("fw", CV_FW_VERSION);
  // Every relay is published, including the off ones. Omitting them would make
  // a freshly-booted panel report no relay keys at all, and anything reading
  // state to decide which controls exist would show none.
  for (int i = 0; i < NUM_RELAY; i++) cv.set(relayKey(i), false);
#if CV_HAS_GAS
  cv.set("gasWarmingUp", true);
  cv.set("gasReady", false);
  cv.set("gasAlarm", false);
  if (gasBaseline > 0) cv.set("gasBaseline", gasBaseline);
#endif
#if CV_HAS_CAMERA
  cv.set("cameraReady", cameraReady);
  cv.set("streaming", false);
#endif

  // Applied after begin() so the restored state is published rather than
  // silently assumed.
  if (!awayMode) {
    for (int i = 0; i < NUM_RELAY; i++) {
      if (relaySaved[i]) setRelay(i, true, "restore", false);
    }
  }
}

/* ==================================================================== */
/*  Loop                                                                 */
/* ==================================================================== */

void loop() {
  uint32_t now = millis();

  // Local control first, and unconditionally. Touch has to keep working with no
  // Wi-Fi, no broker and no cloud — a wall switch that depends on the internet
  // is a worse wall switch.
  pollTouch();

#if CV_HAS_GAS
  sampleGas();
  if (gasAlarm) alarmTone();
#endif

  sampleClimate();

#if CV_HAS_PIR
  bool m = (digitalRead(PIR_PIN) == HIGH);
  if (m != motion) {
    motion = m;
    cv.set("motion", motion);
  }
#endif

  // Mute expires on its own.
  if (muted && muteUntil > 0 && now > muteUntil) {
    muted = false;
    muteUntil = 0;
    cv.set("muted", false);
  }

  // Auto-off timers.
  for (int i = 0; i < NUM_RELAY; i++) {
    if (relayAutoOffAt[i] > 0 && now >= relayAutoOffAt[i]) {
      relayAutoOffAt[i] = 0;
      setRelay(i, false, "auto-off");
    }
  }

  applySchedules();

  // The status LED reports the one thing worth knowing from across the room.
#if CV_HAS_GAS
  if (gasAlarm) {
    digitalWrite(STATUS_LED, ((now / 150) % 2) ? STATUS_LED_ON : !STATUS_LED_ON);
  } else
#endif
  if (!cv.online()) {
    digitalWrite(STATUS_LED, ((now / 800) % 2) ? STATUS_LED_ON : !STATUS_LED_ON);
  } else {
    digitalWrite(STATUS_LED, !STATUS_LED_ON);
  }

#if CV_HAS_CAMERA
  if (streaming && cameraReady && now - lastFrameAt >= (uint32_t)(1000 / fps)) {
    sendFrame(false);
  }
#endif

  // Periodic telemetry — the history the app charts, distinct from live state.
  if (now - lastTelemetry > TELEMETRY_MS) {
    lastTelemetry = now;
    JsonDocument doc;
    JsonObject t = doc.to<JsonObject>();
    if (climateOk) {
      t["temp"] = temperature;
      t["humidity"] = humidity;
    }
#if CV_HAS_GAS
    if (gasReady) {
      t["gasRaw"] = gasRaw;
      t["gasPct"] = gasPercent();
    }
#endif
    uint32_t total = 0;
    for (int i = 0; i < NUM_RELAY; i++) {
      uint32_t r = relayRuntimeS[i];
      if (relayOn[i] && relayOnSince[i] > 0) r += (now - relayOnSince[i]) / 1000;
      total += r;
    }
    t["runtimeS"] = total;
    t["rssi"] = WiFi.RSSI();
    cv.publishTelemetry(doc.as<JsonObjectConst>());
  }

  cv.loop();
}
