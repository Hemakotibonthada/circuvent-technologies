/*
 * Circuvent WaterTank Duo — Sump + Overhead Tank Controller (ESP32)
 * =================================================================
 * Zone 5 of the Circuvent smart-home. The starter half of a two-unit product:
 *   - Overhead (OH) tank level arrives BY RADIO from a battery-powered sensor
 *     sitting on the tank (firmware/watertank-sensor). See CvTankLink.h.
 *   - Underground Sump has its own wired ultrasonic (JSN-SR04T), median
 *     filtered — the sump is beside the pump, so a short cable is fine.
 *   - Single pump relay (drives a contactor) lifting water Sump -> OH.
 *   - Auto-fill: pump ON when OH < startPct AND Sump > sumpMinPct;
 *     pump OFF at OH >= stopPct (or Sump exhausted).
 *   - Dry-run trip: if the pump draws current yet the OH level does not rise
 *     within dryRunWindow, cut the motor.
 *   - Overflow float backup, max-runtime + restart cool-down, manual button.
 *
 * WHY THE OVERHEAD SENSOR MOVED TO RADIO
 * --------------------------------------
 * It used to be wired to this board, which meant a four-core cable running the
 * full height of the building. That cable was the least reliable part of the
 * product: ultrasonic echo timing is a microsecond signal carried tens of
 * metres alongside mains, and the run is a direct lightning path into this
 * controller. The sensor is now its own unit and reports over LoRa.
 *
 * WHAT THAT CHANGES, AND IT IS THE IMPORTANT PART
 * ----------------------------------------------
 * A wired sensor either reads or visibly faults. A radio tankLink can simply stop,
 * leaving this controller holding a number that was true an hour ago and looks
 * exactly like a number that is true now. Acting on it is damaging in both
 * directions: a stale "low" overflows the tank, a stale "full" leaves it empty.
 *
 * So every use of the overhead level is gated on `cvTankReadingFresh()`, auto
 * mode refuses to run without a fresh reading, and the state published to the
 * apps carries the tankLink's health rather than a bare number. The overflow float
 * remains the hardware backstop underneath all of it.
 *
 * Speaks the standard Circuvent protocol (cv/<id>/state|telemetry) so the
 * broker bridge, web console and mobile app pick it up with no changes.
 * Deps: CircuventDevice, ArduinoJson, LoRa.  Board: ESP32.
 */
/** Version history: 1.0.0 initial; 1.1.0 adds OTA; 2.0.0 overhead level over LoRa. */
#define CV_FW_VERSION "2.0.1"
#include <CircuventDevice.h>
#include <LoRa.h>
#include <Preferences.h>
#include <SPI.h>

#include "CvTankLink.h"

// ---- pins ----
// 25/26 used to carry the overhead ultrasonic. They are free now that the
// overhead sensor is a separate unit, and the radio uses the SPI bus instead.
#define SUMP_TRIG   32
#define SUMP_ECHO   33
#define PUMP_RELAY  27       // -> contactor coil
#define CURRENT_ADC 34       // ACS712 / current transformer (input-only pin)
#define OH_FLOAT_HI 35       // overflow float (active-low, input-only)
#define BTN_PIN      0       // manual override / BOOT
#define BUZZER_PIN   4
#define LED_PIN      2
#define LORA_SS      5
#define LORA_RST    14
#define LORA_DIO0   13

/* A pin used twice fails silently at runtime; catch it at compile time. */
#if (SUMP_TRIG == SUMP_ECHO) || (LORA_SS == LORA_RST) || (LORA_SS == LORA_DIO0) || \
    (PUMP_RELAY == LORA_SS) || (SUMP_TRIG == LORA_SS) || (BUZZER_PIN == LORA_DIO0)
#error "CV_PIN_CLASH: two peripherals are assigned the same pin"
#endif

/* Must match the sensor exactly. A mismatch is silent on both sides. */
#define LORA_FREQ 433E6
#define LORA_SF 9

// ---- tank geometry (persisted) — sensor-to-water distance (cm) ----
float OH_EMPTY_CM = 120.0f, OH_FULL_CM = 15.0f;   float OH_CAP_L   = 1000.0f;
float SP_EMPTY_CM = 200.0f, SP_FULL_CM = 20.0f;   float SUMP_CAP_L = 2000.0f;

// ---- tunables (persisted) ----
int startPct = 20;     // OH auto-start at/below
int stopPct  = 95;     // OH auto-stop at/above
int sumpMin  = 15;     // do not run if Sump at/below this (protect the pump)
uint32_t maxRuntimeMs   = 25UL * 60UL * 1000UL;
uint32_t restartDelayMs = 3UL  * 60UL * 1000UL;
uint32_t dryRunWindowMs = 60UL * 1000UL;          // spec: 60 s to see a rise
float    currentOnAmps  = 0.6f;                   // above this => motor is drawing

CircuventDevice cv("watertank");
Preferences store;

bool pump = false, autoMode = true, dryRun = false, overflow = false;
bool ohFault = false, sumpFault = false, savedPump = false, savedAuto = true;
int  ohPct = 0, sumpPct = 0, ohAtStart = 0;
float ohCm = 0, spCm = 0, amps = 0;
uint32_t pumpStart = 0, lastStop = 0, lastBtn = 0, lastBeep = 0;

// ---- radio tankLink to the tank-top sensor ----
CvTankLinkState tankLink;
uint8_t linkKey[CV_TANK_KEY_BYTES];
uint8_t pairId = 0;
bool sensorPaired = false;
bool radioReady = false;
uint32_t pairWindowUntil = 0;   // non-zero only while pairing is open
bool ohLive = false;            // is the overhead level fresh enough to act on?

/*
 * A downlink waiting to go out.
 *
 * The sensor only listens for a few hundred milliseconds immediately after it
 * transmits, so a downlink cannot be sent whenever we feel like it — it is
 * queued here and fired the instant a packet is accepted, while the sensor's
 * receive window is still open. Anything sent at any other time goes to a unit
 * that is already back asleep.
 */
uint8_t pendingInstructions = 0;
uint16_t pendingIntervalS = 0;
uint32_t downSeq = 0;
uint16_t sensorIntervalS = 0;   // what we last asked for; 0 means the default

void beep(int ms) { digitalWrite(BUZZER_PIN, HIGH); delay(ms); digitalWrite(BUZZER_PIN, LOW); }

void loadCfg() {
  store.begin("wtank", false);
  autoMode = store.getBool("auto", autoMode); savedAuto = autoMode;
  savedPump = store.getBool("pump", false);
  startPct = store.getInt("start", startPct);
  stopPct  = store.getInt("stop", stopPct);
  sumpMin  = store.getInt("sumpmin", sumpMin);
  OH_EMPTY_CM = store.getFloat("ohE", OH_EMPTY_CM); OH_FULL_CM = store.getFloat("ohF", OH_FULL_CM);
  SP_EMPTY_CM = store.getFloat("spE", SP_EMPTY_CM); SP_FULL_CM = store.getFloat("spF", SP_FULL_CM);
  OH_CAP_L = store.getFloat("ohCap", OH_CAP_L); SUMP_CAP_L = store.getFloat("spCap", SUMP_CAP_L);

  sensorPaired = store.getBool("paired", false);
  pairId = store.getUChar("pairId", 0);
  if (store.getBytes("linkKey", linkKey, sizeof(linkKey)) != sizeof(linkKey)) {
    sensorPaired = false;
  }
  /*
   * The last accepted sequence survives a reboot on purpose. Without it, a
   * power cut would reset replay protection and a packet captured beforehand
   * would be accepted again.
   */
  tankLink.lastSeq = store.getUInt("rxSeq", 0);
  downSeq = store.getUInt("downSeq", 0);
  sensorIntervalS = store.getUShort("sensInt", 0);
  tankLink.intervalS = sensorIntervalS;
}
void saveCfg() {
  store.putInt("start", startPct); store.putInt("stop", stopPct); store.putInt("sumpmin", sumpMin);
  store.putFloat("ohE", OH_EMPTY_CM); store.putFloat("ohF", OH_FULL_CM);
  store.putFloat("spE", SP_EMPTY_CM); store.putFloat("spF", SP_FULL_CM);
  store.putFloat("ohCap", OH_CAP_L); store.putFloat("spCap", SUMP_CAP_L);
}
void saveRun() {
  if (autoMode != savedAuto) { store.putBool("auto", autoMode); savedAuto = autoMode; }
  if (pump != savedPump)     { store.putBool("pump", pump);     savedPump = pump; }
}

float readUltrasonic(int trig, int echo) {
  digitalWrite(trig, LOW); delayMicroseconds(3);
  digitalWrite(trig, HIGH); delayMicroseconds(10);
  digitalWrite(trig, LOW);
  long us = pulseIn(echo, HIGH, 40000UL);   // ~6.8 m
  if (us == 0) return -1;
  return (us * 0.0343f) / 2.0f;
}
// median of 5 to reject ripple / spikes
float medianCm(int trig, int echo) {
  float v[5];
  for (int i = 0; i < 5; i++) { v[i] = readUltrasonic(trig, echo); delay(30); }
  for (int i = 0; i < 5; i++) for (int j = i + 1; j < 5; j++) if (v[j] < v[i]) { float t = v[i]; v[i] = v[j]; v[j] = t; }
  return v[2];
}
int pctFromCm(float d, float emptyCm, float fullCm, bool &fault) {
  if (d < 0 || d > emptyCm + 40 || d < fullCm - 10) { fault = true; return -1; }
  fault = false;
  float pct = (emptyCm - d) / (emptyCm - fullCm) * 100.0f;
  if (pct < 0) pct = 0; if (pct > 100) pct = 100;
  return (int)(pct + 0.5f);
}
float readAmps() {
  // ACS712: Vout = 2.5V at 0A, ~0.100 V/A (20A part). ESP32 ADC ~3.3V / 4095.
  long acc = 0; for (int i = 0; i < 64; i++) { acc += analogRead(CURRENT_ADC); delayMicroseconds(200); }
  float v = (acc / 64.0f) * (3.3f / 4095.0f);
  float a = (v - 2.5f) / 0.100f;
  return a < 0 ? -a : a;   // rectified magnitude
}

// ----------------------------------------------------------- radio tankLink ---

bool radioUp() {
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(LORA_FREQ)) return false;
  LoRa.setSpreadingFactor(LORA_SF);
  LoRa.enableCrc();
  LoRa.receive();
  return true;
}

void savePairing() {
  store.putBool("paired", sensorPaired);
  store.putUChar("pairId", pairId);
  store.putBytes("linkKey", linkKey, sizeof(linkKey));
}

/**
 * Send whatever is queued, immediately.
 *
 * Only ever called straight after accepting a packet from the sensor, because
 * that is the only moment the sensor is listening. Sending at any other time
 * transmits into a unit that is already asleep, which looks identical to a
 * broken radio from the app's point of view.
 */
void sendPendingDownlink() {
  if (!sensorPaired || !radioReady) return;
  if (pendingInstructions == 0 && pendingIntervalS == 0) return;

  CvTankDownlink d;
  cvTankInitDownlink(d, pairId);
  d.instructions = pendingInstructions;
  d.reportIntervalS = pendingIntervalS;
  d.seq = ++downSeq;
  cvTankSignDownlink(d, linkKey);

  LoRa.beginPacket();
  LoRa.write((const uint8_t *)&d, sizeof(d));
  LoRa.endPacket();
  LoRa.receive();   // straight back to listening; the sensor may reply at once

  if (pendingIntervalS != 0) sensorIntervalS = pendingIntervalS;
  if (sensorIntervalS != 0) store.putUShort("sensInt", sensorIntervalS);
  // The freshness window scales with the cadence. Without this, choosing a
  // slower report rate to save battery would leave the link permanently stale
  // and the pump would never run.
  tankLink.intervalS = sensorIntervalS;
  /*
   * Cleared whether or not the sensor heard it. A downlink that is retried
   * forever would fire on every single reading, and "measure now" repeated
   * indefinitely would flatten the battery of a unit nobody can reach. The app
   * can ask again.
   */
  pendingInstructions = 0;
  pendingIntervalS = 0;
  store.putUInt("downSeq", downSeq);
}

/**
 * Accept a pairing offer.
 *
 * Only ever called while the owner has an open pairing window, which is opened
 * from the app on an authenticated connection. Without that gate, anything
 * within radio range could re-pair this starter to a sensor of its choosing and
 * then tell it whatever it liked about the water level.
 */
void handlePairOffer(const CvTankPacket &p, const uint8_t *offeredKey) {
  memcpy(linkKey, offeredKey, CV_TANK_KEY_BYTES);

  /*
   * Verify the offer against the key it presented. This proves the sender holds
   * that key rather than having copied a packet, and it rejects a corrupted
   * frame that happened to survive CRC.
   */
  if (!cvTankVerify(p, linkKey)) { tankLink.rejected++; return; }

  pairId = p.pairId;
  sensorPaired = true;
  // A fresh pairing starts replay protection from this packet, not from
  // whatever the previous sensor had reached.
  tankLink.everHeard = false;
  tankLink.lastSeq = p.seq;
  savePairing();
  store.putUInt("rxSeq", tankLink.lastSeq);

  pairWindowUntil = 0;
  /*
   * Tell the sensor we have it. Without this the sensor transmits for the full
   * minute and then declares success whether or not anything heard, so an
   * installer gets a confident indication, climbs down, and finds nothing works.
   * The sensor is listening right now, so this goes out immediately.
   */
  pendingInstructions |= CV_TANK_DOWN_PAIR_ACK;
  sendPendingDownlink();
  beep(60); delay(80); beep(60);
}

void pollRadio() {
  if (!radioReady) return;

  int sz = LoRa.parsePacket();
  if (sz <= 0) return;

  // A pairing offer carries the key after the packet; a reading does not.
  const bool withKey = (sz == (int)(sizeof(CvTankPacket) + CV_TANK_KEY_BYTES));
  if (sz != (int)sizeof(CvTankPacket) && !withKey) {
    // Not ours — another 433 MHz device sharing the band. Drain and ignore.
    while (LoRa.available()) LoRa.read();
    return;
  }

  CvTankPacket p;
  uint8_t *raw = (uint8_t *)&p;
  for (size_t i = 0; i < sizeof(p) && LoRa.available(); i++) raw[i] = (uint8_t)LoRa.read();

  uint8_t offeredKey[CV_TANK_KEY_BYTES];
  if (withKey) {
    for (size_t i = 0; i < sizeof(offeredKey) && LoRa.available(); i++) {
      offeredKey[i] = (uint8_t)LoRa.read();
    }
  }
  while (LoRa.available()) LoRa.read();

  int16_t rssi = (int16_t)LoRa.packetRssi();

  if (p.msgType == CV_TANK_MSG_PAIR) {
    if (pairWindowUntil != 0 && millis() < pairWindowUntil && withKey) {
      handlePairOffer(p, offeredKey);
    }
    return;   // Never treated as a level reading.
  }

  if (!sensorPaired) return;
  if (p.pairId != pairId) return;          // a neighbour's sensor
  if (!cvTankVerify(p, linkKey)) { tankLink.rejected++; return; }

  if (cvTankAcceptReading(tankLink, p, rssi, millis())) {
    // Persisted so a reboot cannot reopen the replay window.
    store.putUInt("rxSeq", tankLink.lastSeq);
    // The sensor's receive window is open right now and only right now.
    sendPendingDownlink();
  }
}

/** Open a pairing window. Called only from an authenticated app command. */
void openPairWindow() {
  pairWindowUntil = millis() + CV_TANK_PAIR_WINDOW_MS;
  beep(40);
}

void forgetSensor() {
  sensorPaired = false;
  memset(linkKey, 0, sizeof(linkKey));
  tankLink = CvTankLinkState();
  savePairing();
  store.putUInt("rxSeq", 0);
}

void setPump(bool on) {
  /*
   * Everything that can start the pump funnels through here, so the interlocks
   * live here rather than at each call site — a new caller that forgot one
   * would be a silent regression.
   *
   * `ohLive` is the radio-tankLink interlock. Starting a pump on a level that
   * stopped updating an hour ago is how a tank overflows all night: the
   * controller believes it is filling an empty tank and nothing contradicts it.
   * Stopping is always allowed, whatever the tankLink is doing.
   */
  if (on && (dryRun || overflow || sumpPct <= sumpMin)) on = false;
  if (on && !ohLive) on = false;
  if (on && !pump) {
    if (lastStop != 0 && millis() - lastStop < restartDelayMs) return;  // cool-down
    pumpStart = millis(); ohAtStart = ohPct; dryRun = false;
  }
  if (!on && pump) lastStop = millis();
  pump = on;
  cvRelayWrite(PUMP_RELAY, on);
  cvRelayWrite(LED_PIN, on);
  saveRun();
  cv.set("pump", pump);
  cv.publishStateNow();
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action == "set") {
    bool cfg = false;
    if (p["auto"].is<bool>()) { autoMode = p["auto"].as<bool>(); saveRun(); }
    if (p["pump"].is<bool>()) { autoMode = false; saveRun(); setPump(p["pump"].as<bool>()); }
    if (p["startPct"].is<int>()) { startPct = constrain(p["startPct"].as<int>(), 5, 90); cfg = true; }
    if (p["stopPct"].is<int>())  { stopPct  = constrain(p["stopPct"].as<int>(), startPct + 5, 100); cfg = true; }
    if (p["sumpMinPct"].is<int>()) { sumpMin = constrain(p["sumpMinPct"].as<int>(), 5, 60); cfg = true; }
    if (p["sensorIntervalS"].is<int>()) {
      /*
       * How often the tank unit reports. Trading battery life against how
       * quickly a level change shows up — and settable from the app precisely
       * so that trade does not require getting the unit off the roof.
       */
      pendingIntervalS = cvTankClampInterval((uint16_t)p["sensorIntervalS"].as<int>());
    }
    if (p["ohCapacityL"].is<float>()) { OH_CAP_L = p["ohCapacityL"].as<float>(); cfg = true; }
    if (p["sumpCapacityL"].is<float>()) { SUMP_CAP_L = p["sumpCapacityL"].as<float>(); cfg = true; }
    if (p["ohEmptyCm"].is<float>()) { OH_EMPTY_CM = p["ohEmptyCm"].as<float>(); cfg = true; }
    if (p["ohFullCm"].is<float>())  { OH_FULL_CM  = p["ohFullCm"].as<float>();  cfg = true; }
    if (p["sumpEmptyCm"].is<float>()) { SP_EMPTY_CM = p["sumpEmptyCm"].as<float>(); cfg = true; }
    if (p["sumpFullCm"].is<float>())  { SP_FULL_CM  = p["sumpFullCm"].as<float>();  cfg = true; }
    if (cfg) saveCfg();
  } else if (action == "resetDryRun") {
    dryRun = false;
  } else if (action == "pair") {
    openPairWindow();
  } else if (action == "unpair") {
    forgetSensor();
  } else if (action == "readNow") {
    /*
     * Queued, not sent. The sensor is asleep and cannot hear anything until it
     * next transmits, so this goes out on the back of its next report — within
     * one report interval rather than immediately, which is still much better
     * than waiting out a whole cycle for the reading itself.
     */
    pendingInstructions |= CV_TANK_DOWN_MEASURE_NOW;
  } else if (action == "identifySensor") {
    pendingInstructions |= CV_TANK_DOWN_IDENTIFY;
  } else if (action == "pump") {
    autoMode = false; saveRun(); setPump(true);
  } else if (action == "stop") {
    autoMode = false; saveRun(); setPump(false);
  }
}

void setup() {
  Serial.begin(115200);
  cvRelayInit(PUMP_RELAY); pinMode(LED_PIN, OUTPUT); pinMode(BUZZER_PIN, OUTPUT);
  pinMode(SUMP_TRIG, OUTPUT); pinMode(SUMP_ECHO, INPUT);
  pinMode(OH_FLOAT_HI, INPUT);      // input-only pin; external pull-up
  pinMode(BTN_PIN, INPUT_PULLUP);
  analogReadResolution(12);
  loadCfg();

  radioReady = radioUp();
  if (!radioReady) {
    /*
     * No radio means no overhead level, which means auto mode cannot run. Say
     * so audibly at boot: an installer standing at the panel should not have to
     * open the app to discover the radio module is not seated.
     */
    beep(400);
  }

  cv.onCommand(onCommand);
  cv.setInterval(6000);
  cv.setResetButton(0);
  cv.begin();
}

uint32_t lastSense = 0;
void loop() {
  pollRadio();   // called every pass: a missed packet is a missed 30 s window

  if (pairWindowUntil != 0 && millis() > pairWindowUntil) pairWindowUntil = 0;

  /*
   * Derive the overhead level from the radio tankLink.
   *
   * `ohLive` is the single gate. Below it, nothing may act on `ohPct`, and the
   * apps are told the reading is not current rather than being handed a number
   * that looks as good as any other.
   */
  ohLive = cvTankReadingFresh(tankLink, millis());
  const bool ohAbandoned = cvTankReadingAbandoned(tankLink, millis());

  if (tankLink.everHeard) {
    ohPct = cvTankPctFromMm(tankLink.levelMm, OH_EMPTY_CM, OH_FULL_CM, ohFault);
    ohCm = tankLink.levelMm / 10.0f;
    if (ohFault) {
      // A sensor reporting nonsense is not a level we may pump on, however
      // recently it arrived.
      ohLive = false;
      if (ohPct < 0) ohPct = 50;
    }
    if (tankLink.flags & CV_TANK_FLAG_SENSOR_FAULT) { ohFault = true; ohLive = false; }
  } else {
    ohFault = true;
    ohLive = false;
    ohPct = 0;
  }

  if (millis() - lastSense > 1500) {
    lastSense = millis();
    spCm = medianCm(SUMP_TRIG, SUMP_ECHO);
    sumpPct = pctFromCm(spCm, SP_EMPTY_CM, SP_FULL_CM, sumpFault);
    if (sumpFault) sumpPct = sumpPct < 0 ? 50 : sumpPct;
    overflow = (digitalRead(OH_FLOAT_HI) == LOW);
    amps = readAmps();
  }

  // manual override button
  if (digitalRead(BTN_PIN) == LOW && millis() - lastBtn > 500) {
    lastBtn = millis(); autoMode = false; saveRun(); setPump(!pump); beep(60);
  }

  // ---- safety interlocks ----
  if (pump && overflow) setPump(false);
  if (pump && millis() - pumpStart > maxRuntimeMs) setPump(false);
  /*
   * Losing the level mid-fill is the dangerous moment: the pump is already
   * running and the only thing that would have stopped it was the level
   * reaching stopPct. Stop now and let the operator decide, rather than run on
   * a number that is no longer being updated.
   */
  if (pump && !ohLive) { setPump(false); beep(150); }
  // Dry-run: motor drawing current but OH not rising within the window. Only
  // meaningful while the level is actually being updated.
  if (pump && ohLive && millis() - pumpStart > dryRunWindowMs) {
    bool rising = (ohPct - ohAtStart) >= 2;
    bool drawing = amps >= currentOnAmps;
    if (drawing && !rising) { setPump(false); dryRun = true; beep(200); }
    else if (!drawing)      { setPump(false); dryRun = true; beep(200); } // no current => wiring/motor fault
  }

  // ---- auto-fill logic ----
  if (autoMode && ohLive && !dryRun && !overflow) {
    if (!pump && ohPct <= startPct && sumpPct > sumpMin) setPump(true);
    if (pump && (ohPct >= stopPct || sumpPct <= sumpMin)) setPump(false);
  }

  if ((dryRun || overflow) && millis() - lastBeep > 5000) { lastBeep = millis(); beep(120); }

  uint32_t ageMs = cvTankAgeMs(tankLink, millis());

  /*
   * Publish the level only while it is worth showing. Past the abandon
   * threshold the last reading says nothing useful about the tank now, and
   * leaving a stale number on screen invites somebody to act on it — an app
   * showing "12%" gives no hint that the figure is from yesterday.
   */
  if (tankLink.everHeard && !ohAbandoned) {
    cv.set("ohPct", ohPct);
    cv.set("ohLitres", (int)(OH_CAP_L * ohPct / 100.0f));
  } else {
    cv.set("ohPct", -1);
    cv.set("ohLitres", -1);
  }

  // tankLink health, so the apps can explain themselves rather than just going quiet.
  cv.set("ohLive", ohLive);
  cv.set("rfLinkUp", ohLive);
  cv.set("rfAgeS", tankLink.everHeard ? (int)(ageMs / 1000UL) : -1);
  cv.set("rfRssi", tankLink.everHeard ? (int)tankLink.rssi : 0);
  cv.set("rfRejected", (int)tankLink.rejected);
  cv.set("sensorPaired", sensorPaired);
  cv.set("pairing", pairWindowUntil != 0);
  cv.set("sensorIntervalS", sensorIntervalS > 0 ? (int)sensorIntervalS
                                                : (int)(CV_TANK_REPORT_INTERVAL_MS / 1000UL));
  // Something is waiting for the sensor's next transmission to go out.
  cv.set("downlinkPending", pendingInstructions != 0 || pendingIntervalS != 0);
  cv.set("radioReady", radioReady);
  cv.set("tankBattPct", tankLink.everHeard ? cvTankBatteryPct(tankLink.batteryMv) : -1);
  cv.set("tankBattLow", (tankLink.flags & CV_TANK_FLAG_LOW_BATTERY) != 0);

  cv.set("sumpPct", sumpPct);
  cv.set("sumpLitres", (int)(SUMP_CAP_L * sumpPct / 100.0f));
  cv.set("pump", pump);
  cv.set("auto", autoMode);
  cv.set("dryRun", dryRun);
  cv.set("overflow", overflow);
  cv.set("amps", amps);
  cv.set("ohFault", ohFault);
  cv.set("sumpFault", sumpFault);
  cv.set("startPct", startPct);
  cv.set("stopPct", stopPct);
  cv.set("sumpMinPct", sumpMin);
  cv.loop();
}
