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
#if defined(CV_BOARD_MAX) && CV_BOARD_MAX
#include <Wire.h>
#endif

/* ==================================================================== */
/*  Board profile                                                        */
/* ==================================================================== */

// Set by platformio.ini. Default is the full panel.
#ifndef CV_BOARD_CAM
#define CV_BOARD_CAM 0
#endif
#ifndef CV_BOARD_MAX
#define CV_BOARD_MAX 0
#endif
#if CV_BOARD_CAM && CV_BOARD_MAX
  #error "CV_BOARD_CAM and CV_BOARD_MAX are different boards; pick one."
#endif

#if CV_BOARD_CAM
  // ---- ESP32-CAM (AI-Thinker) -------------------------------------------
  // The camera owns most of the I/O. What is left is the SD card's pins, free
  // only because this build never mounts the card.
  #define CV_HAS_CAMERA   1
  #define CV_HAS_GAS      0   // see the header: ADC1 is gone
  #define CV_HAS_PIR      0
  #define CV_HAS_BUZZER   0
  #define CV_HAS_EXPANDER 0
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

#elif CV_BOARD_MAX
  // ---- ESP32 DevKit + MCP23017 expanders --------------------------------
  // A distribution-board unit rather than a wall plate: 16 relays on an I²C
  // expander, optional momentary override buttons on a second one.
  //
  // Relays 1-4 keep the four native capacitive pads so the most-used loads
  // still have local control; the rest are driven from the app, schedules or
  // the button expander. Everything else (gas, DHT, buzzer, PIR, LED) keeps the
  // standard board's pinout exactly, because the relays moved off GPIO and
  // freed 19/21/22/23.
  #define CV_HAS_CAMERA   0
  #define CV_HAS_GAS      1
  #define CV_HAS_PIR      1
  #define CV_HAS_BUZZER   1
  #define CV_HAS_EXPANDER 1
  #ifndef NUM_RELAY
  #define NUM_RELAY       16          // one MCP23017; 32 with a second
  #endif
  #define NUM_TOUCH       4

  #define DHT_PIN         18
  #define GAS_ANALOG_PIN  34
  #define GAS_DIGITAL_PIN 35
  #define BUZZER_PIN      27
  #define PIR_PIN         39
  #define STATUS_LED       2
  #define STATUS_LED_ON   HIGH
  #define CV_RESET_BTN     0

  #define I2C_SDA_PIN     21          // freed: relays moved to the expander
  #define I2C_SCL_PIN     22
  #define BTN_INT_PIN     23          // MCP23017 INT from the input expander

  const uint8_t TOUCH_PIN[NUM_TOUCH] = { 4 /*T0*/, 13 /*T4*/, 14 /*T6*/, 33 /*T8*/ };

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
  #define CV_HAS_EXPANDER 0
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

/*
 * Relay board polarity.
 *
 * Most opto-isolated relay boards are active LOW. Direct-GPIO builds default to
 * active HIGH because that is what the units already in the field are wired
 * for — changing that default would invert every deployed panel.
 */
#ifndef CV_RELAY_ACTIVE_LOW
#define CV_RELAY_ACTIVE_LOW 0
#endif

/*
 * Expander configuration.
 *
 * Two MCP23017s: 0x20 drives the relays, 0x21 reads momentary override
 * buttons. Both address pins A0-A2 must be tied — a floating address line
 * makes the chip answer intermittently, which looks exactly like a bad solder
 * joint. RESET must be tied high or the chip never leaves reset.
 */
#ifndef CV_RELAY_EXPANDERS
#define CV_RELAY_EXPANDERS 1            // 1 = 16 relays, 2 = 32
#endif
#ifndef CV_MCP_RELAY_ADDR
#define CV_MCP_RELAY_ADDR 0x20
#endif
#ifndef CV_HAS_BUTTONS
#define CV_HAS_BUTTONS 0                // second MCP23017 for override buttons
#endif
#ifndef CV_MCP_BTN_ADDR
#define CV_MCP_BTN_ADDR 0x21
#endif
#ifndef NUM_BUTTON
#define NUM_BUTTON 16
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
#if NUM_RELAY > 32
  // The relay bitmasks (safetyCutMask, the desired-output word) are 32-bit.
  #error "NUM_RELAY cannot exceed 32 without widening the relay bitmasks."
#endif
#if CV_HAS_EXPANDER && (NUM_RELAY > 16 * CV_RELAY_EXPANDERS)
  #error "NUM_RELAY exceeds what the configured number of MCP23017s can drive."
#endif

/*
 * Mask of every valid relay, computed without ever evaluating `1 << 32`.
 *
 * Shifting by the full width of the type is undefined behaviour, and on Xtensa
 * it quietly yields 1 rather than 0 — which would leave this mask as 0 and
 * silently disable every safety cut. The condition below is folded at compile
 * time, so the bad shift is never generated.
 */
#define RELAY_MASK_ALL ((NUM_RELAY >= 32) ? 0xFFFFFFFFul : ((1ul << NUM_RELAY) - 1ul))

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
//
// 32-bit, not 8: an 8-bit mask truncates silently past relay 8, so on a
// 16-relay board the second half would never be cut and nothing would say so.
uint32_t safetyCutMask = 0;
// Relay driven ON during an alarm, to clear the air. -1 = none.
int8_t exhaustRelay = -1;

/*
 * Publish coalescing.
 *
 * setRelay() publishes immediately, which is what makes a touch appear in the
 * app at once. But a bulk change calls it once per relay, so "all off" on a
 * 16-relay board would be 16 MQTT publishes describing 16 intermediate states
 * nobody asked for. Bulk operations hold the publish and emit one final state.
 * Counted rather than boolean so nesting (a safety cut inside an away-mode
 * change) cannot release the hold early.
 */
int publishHold = 0;
bool publishPending = false;

void publishStateCoalesced() {
  if (publishHold > 0) { publishPending = true; return; }
  cv.publishStateNow();
}
void holdPublish() { publishHold++; }
void releasePublish() {
  if (publishHold > 0 && --publishHold == 0 && publishPending) {
    publishPending = false;
    cv.publishStateNow();
  }
}

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

// ---- override buttons (expander boards only) ----
#if CV_HAS_EXPANDER && CV_HAS_BUTTONS
uint16_t btnPrev = 0xFFFF;            // pull-ups: released reads high
uint32_t lastBtnAt = 0;
uint32_t lastBtnPoll = 0;
#endif

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
/*  Relay output layer                                                   */
/*                                                                       */
/*  Two backends behind one call: direct GPIO for the 2/4-relay boards,   */
/*  and MCP23017 expanders for the 16/32-relay one. Everything above this */
/*  section works in logical relay indices and never knows which is in    */
/*  use.                                                                  */
/* ==================================================================== */

// Desired output, one bit per relay, 1 = energised. The single source of truth
// for what the hardware should be doing.
uint32_t relayWord = 0;

#if CV_HAS_EXPANDER

/* MCP23017 registers, IOCON.BANK = 0 (the reset default). */
static const uint8_t MCP_IODIRA   = 0x00;
static const uint8_t MCP_GPINTENA = 0x04;
static const uint8_t MCP_INTCONA  = 0x08;
static const uint8_t MCP_IOCON    = 0x0A;
static const uint8_t MCP_GPPUA    = 0x0C;
static const uint8_t MCP_GPIOA    = 0x12;
static const uint8_t MCP_OLATA    = 0x14;

bool expanderOk = false;
#if CV_HAS_BUTTONS
bool buttonsOk = false;
#endif

/**
 * Writes a 16-bit value to a register pair.
 *
 * With IOCON.SEQOP at its default the address pointer auto-increments, so two
 * data bytes land in reg and reg+1 — port A and port B in one transaction.
 * That matters: it makes a 16-relay change one bus operation rather than
 * sixteen, so the relays move together instead of rippling.
 */
bool mcpWrite16(uint8_t addr, uint8_t reg, uint16_t v) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  Wire.write((uint8_t)(v & 0xFF));         // port A
  Wire.write((uint8_t)(v >> 8));           // port B
  return Wire.endTransmission() == 0;
}

bool mcpWrite8(uint8_t addr, uint8_t reg, uint8_t v) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  Wire.write(v);
  return Wire.endTransmission() == 0;
}

bool mcpRead16(uint8_t addr, uint8_t reg, uint16_t &out) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;   // repeated start
  if (Wire.requestFrom((int)addr, 2) != 2) return false;
  uint8_t lo = Wire.read();
  uint8_t hi = Wire.read();
  out = (uint16_t)lo | ((uint16_t)hi << 8);
  return true;
}

/** Logical "relay on" bits to the levels the board actually wants. */
static inline uint16_t toElectrical(uint16_t logical) {
#if CV_RELAY_ACTIVE_LOW
  return (uint16_t)~logical;
#else
  return logical;
#endif
}

/**
 * Brings one relay expander up with every output off.
 *
 * The register order here is the whole point. After reset IODIR is 0xFF — all
 * pins are inputs, so nothing is driven yet. Writing the output latch first
 * and the direction second means the input-to-output transition drives the
 * already-correct level. Doing it the other way round drives whatever OLAT
 * happened to hold (0x00 from reset), which on an active-low relay board is
 * every relay closing at once, on mains, before the firmware has decided
 * anything. Boot-time relay chatter is the exact failure the GPIO pin choice
 * on the other boards was made to avoid; it would be careless to reintroduce
 * it through the expander.
 */
bool mcpBeginRelays(uint8_t addr) {
  Wire.beginTransmission(addr);
  if (Wire.endTransmission() != 0) return false;        // nobody home

  if (!mcpWrite16(addr, MCP_OLATA, toElectrical(0))) return false;
  if (!mcpWrite16(addr, MCP_IODIRA, 0x0000)) return false;

  // Read the direction back rather than trusting the write. An address ACK
  // only proves something answered; this proves it is an MCP23017 that kept
  // the configuration. A relay driver that is not really there must not be
  // reported as working.
  uint16_t dir = 0xFFFF;
  if (!mcpRead16(addr, MCP_IODIRA, dir) || dir != 0x0000) return false;
  return true;
}

#if CV_HAS_BUTTONS
/**
 * Brings the input expander up with pull-ups and interrupt-on-change.
 *
 * MIRROR ties INTA and INTB together so both ports reach the ESP32 on one
 * wire. INTCON = 0 compares each pin against its previous value, so any edge
 * interrupts rather than only a match against a reference.
 */
bool mcpBeginButtons(uint8_t addr) {
  Wire.beginTransmission(addr);
  if (Wire.endTransmission() != 0) return false;

  if (!mcpWrite16(addr, MCP_IODIRA, 0xFFFF)) return false;   // inputs
  if (!mcpWrite16(addr, MCP_GPPUA, 0xFFFF)) return false;    // pull-ups
  if (!mcpWrite8(addr, MCP_IOCON, 0x40)) return false;       // MIRROR
  if (!mcpWrite16(addr, MCP_INTCONA, 0x0000)) return false;  // on change
  if (!mcpWrite16(addr, MCP_GPINTENA, 0xFFFF)) return false; // all enabled

  uint16_t pu = 0;
  if (!mcpRead16(addr, MCP_GPPUA, pu) || pu != 0xFFFF) return false;
  return true;
}
#endif  // CV_HAS_BUTTONS
#endif  // CV_HAS_EXPANDER

/** Pushes `relayWord` to whichever backend this board has. */
void relayHwWrite() {
#if CV_HAS_EXPANDER
  if (!expanderOk) return;
  bool ok = true;
  for (int chip = 0; chip < CV_RELAY_EXPANDERS; chip++) {
    uint16_t logical = (uint16_t)((relayWord >> (16 * chip)) & 0xFFFF);
    ok &= mcpWrite16(CV_MCP_RELAY_ADDR + chip, MCP_OLATA, toElectrical(logical));
  }
  // A write that stops being acknowledged means the bus or the chip has gone.
  // Saying so beats leaving the app showing relays that no longer move.
  if (!ok && expanderOk) {
    expanderOk = false;
    cv.set("expanderOk", false);
    cv.publishStateNow();
  }
#else
  for (int i = 0; i < NUM_RELAY; i++) {
    bool on = (relayWord >> i) & 1u;
  #if CV_RELAY_ACTIVE_LOW
    digitalWrite(RELAY_PIN[i], on ? LOW : HIGH);
  #else
    digitalWrite(RELAY_PIN[i], on ? HIGH : LOW);
  #endif
  }
#endif
}

/** True when relays can actually be driven right now. */
static inline bool relaysUsable() {
#if CV_HAS_EXPANDER
  return expanderOk;
#else
  return true;
#endif
}

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
  static char k[5];                    // "r16" plus the terminator
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
 * appear in the app at once, not on the next heartbeat. Bulk callers wrap
 * themselves in holdPublish()/releasePublish() so one command produces one
 * message rather than one per relay.
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
  if (on) relayWord |= (1ul << i);
  else    relayWord &= ~(1ul << i);
  relayHwWrite();

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

  publishStateCoalesced();
}

void setAllRelays(bool on, const char *source) {
  holdPublish();
  for (int i = 0; i < NUM_RELAY; i++) setRelay(i, on, source);
  releasePublish();
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
  // One publish for the whole interlock. Held across both loops so the app is
  // never shown a half-applied safety action.
  holdPublish();
  for (int i = 0; i < NUM_RELAY; i++) {
    if (safetyCutMask & (1ul << i)) setRelay(i, false, "gas-alarm");
  }
  if (exhaustRelay >= 0 && exhaustRelay < NUM_RELAY) {
    setRelay(exhaustRelay, true, "gas-alarm");
  }
  releasePublish();
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
/*  Override buttons (expander boards)                                   */
/* ==================================================================== */

#if CV_HAS_EXPANDER && CV_HAS_BUTTONS
/**
 * Reads the button expander and toggles the matching relay.
 *
 * Driven by the MCP23017's interrupt line when it is wired, and by a slow poll
 * when it is not. The poll is not just a convenience: an interrupt can be
 * missed if the line glitches while the ESP32 is busy, and the MCP will then
 * hold INT asserted forever waiting to be read, so the panel would go
 * permanently deaf to its own buttons. Reading periodically regardless costs
 * one I²C transaction and makes that unrecoverable state impossible.
 */
void pollButtons() {
  if (!buttonsOk) return;
  uint32_t now = millis();

  bool intAsserted = (digitalRead(BTN_INT_PIN) == LOW);
  if (!intAsserted && now - lastBtnPoll < 250) return;
  lastBtnPoll = now;

  uint16_t cur;
  if (!mcpRead16(CV_MCP_BTN_ADDR, MCP_GPIOA, cur)) {
    buttonsOk = false;
    cv.set("buttonsOk", false);
    cv.publishStateNow();
    return;
  }

  // Pull-ups mean a pressed button reads low, so a press is a falling edge.
  uint16_t pressed = (uint16_t)(btnPrev & ~cur);
  btnPrev = cur;
  if (!pressed) return;
  if (now - lastBtnAt < TOUCH_DEBOUNCE_MS) return;
  lastBtnAt = now;

  holdPublish();
  for (int i = 0; i < NUM_BUTTON && i < NUM_RELAY; i++) {
    if (pressed & (1u << i)) setRelay(i, !relayOn[i], "button");
  }
  releasePublish();
  chirp();
}
#endif

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
    // A single command may name several relays. Held so a multi-relay payload
    // produces one state message instead of one per relay.
    holdPublish();
    for (int i = 0; i < NUM_RELAY; i++) {
      const char *k = relayKey(i);
      if (p[k].is<bool>()) setRelay(i, p[k].as<bool>(), "cloud");
    }
    releasePublish();
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

    // Read as uint32: a 16-relay mask does not fit in the signed int the app
    // would otherwise be limited to, and JSON has no unsigned type of its own.
    if (p["safetyCutMask"].is<uint32_t>()) {
      safetyCutMask = p["safetyCutMask"].as<uint32_t>() & RELAY_MASK_ALL;
      store.putUInt("cutMask32", safetyCutMask);
      cv.set("safetyCutMask", (long)safetyCutMask);
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

  relayWord = 0;
  for (int i = 0; i < NUM_RELAY; i++) {
    relayOn[i] = false;
    relaySaved[i] = false;
    relayOnSince[i] = 0;
    relayAutoOffAt[i] = 0;
    relayAutoOffMin[i] = 0;
    relayRuntimeS[i] = 0;
  }

#if CV_HAS_EXPANDER
  // Brought up before anything else that could take time. Until this succeeds
  // the relay outputs are whatever the expander's reset state leaves them, so
  // the sooner they are driven to a known-off level the better.
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN, 400000);
  expanderOk = true;
  for (int chip = 0; chip < CV_RELAY_EXPANDERS; chip++) {
    if (!mcpBeginRelays(CV_MCP_RELAY_ADDR + chip)) expanderOk = false;
  }
  #if CV_HAS_BUTTONS
  buttonsOk = mcpBeginButtons(CV_MCP_BTN_ADDR);
  if (buttonsOk) {
    pinMode(BTN_INT_PIN, INPUT_PULLUP);   // MCP INT is active low
    uint16_t discard;
    mcpRead16(CV_MCP_BTN_ADDR, MCP_GPIOA, discard);   // clear a pending INT
    btnPrev = discard;
  }
  #endif
#else
  for (int i = 0; i < NUM_RELAY; i++) {
    pinMode(RELAY_PIN[i], OUTPUT);
  }
  relayHwWrite();                         // known-off before anything else runs
#endif

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
  // A distinct key from the 8-bit mask this replaced. NVS entries are typed, so
  // reading a u8 key as u32 fails and silently hands back the default — which
  // for a safety-cut mask means "cut nothing", with nothing to say it happened.
  safetyCutMask = store.getUInt("cutMask32", 0) & RELAY_MASK_ALL;
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
  cv.set("safetyCutMask", (long)safetyCutMask);
  cv.set("exhaustRelay", (int)exhaustRelay);
  cv.set("hasGas", (bool)CV_HAS_GAS);
  cv.set("hasCamera", (bool)CV_HAS_CAMERA);
  cv.set("fw", CV_FW_VERSION);
#if CV_HAS_EXPANDER
  // Published so the app can say "the relay driver is not responding" instead
  // of showing sixteen switches that quietly do nothing.
  cv.set("expanderOk", expanderOk);
  #if CV_HAS_BUTTONS
  cv.set("buttonsOk", buttonsOk);
  #endif
#endif
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
  // silently assumed. Held so a 16-relay restore is one message.
  if (!awayMode) {
    holdPublish();
    for (int i = 0; i < NUM_RELAY; i++) {
      if (relaySaved[i]) setRelay(i, true, "restore", false);
    }
    releasePublish();
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
#if CV_HAS_EXPANDER && CV_HAS_BUTTONS
  pollButtons();
#endif

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

  // Auto-off timers. Several can expire on the same tick, so they share one
  // publish rather than sending a message per relay.
  holdPublish();
  for (int i = 0; i < NUM_RELAY; i++) {
    if (relayAutoOffAt[i] > 0 && now >= relayAutoOffAt[i]) {
      relayAutoOffAt[i] = 0;
      setRelay(i, false, "auto-off");
    }
  }
  releasePublish();

  applySchedules();

  // The status LED reports the one thing worth knowing from across the room.
#if CV_HAS_GAS
  if (gasAlarm) {
    digitalWrite(STATUS_LED, ((now / 150) % 2) ? STATUS_LED_ON : !STATUS_LED_ON);
  } else
#endif
#if CV_HAS_EXPANDER
  // A dead relay driver looks identical to a working panel from the outside,
  // which is the worst way for it to fail. Double-blink says the board is
  // running but cannot switch anything.
  if (!expanderOk) {
    digitalWrite(STATUS_LED, ((now % 1000) < 120 || ((now % 1000) > 240 && (now % 1000) < 360))
                               ? STATUS_LED_ON : !STATUS_LED_ON);
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
