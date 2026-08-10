/*
 * Circuvent WaterTank Duo — Sump + Overhead Tank Controller (ESP32)
 * =================================================================
 * Zone 5 of the Circuvent smart-home. Manages a two-tank system:
 *   - Overhead (OH) tank + underground Sump, each with a waterproof
 *     ultrasonic sensor (JSN-SR04T), median-filtered.
 *   - Single pump relay (drives a contactor) lifting water Sump -> OH.
 *   - Auto-fill: pump ON when OH < startPct AND Sump > sumpMinPct;
 *     pump OFF at OH >= stopPct (or Sump exhausted).
 *   - Dry-run trip: if the pump draws current (ACS712 on ADC) yet the
 *     OH level does not rise within dryRunWindow, cut the motor.
 *   - Overflow float backup, max-runtime + restart cool-down, manual button.
 *   - Live fill % + litres for both tanks (feeds the 3D visualizers).
 *
 * Speaks the standard Circuvent protocol (cv/<id>/state|telemetry) so the
 * broker bridge, web console and mobile app pick it up with no changes.
 * Deps: CircuventDevice, ArduinoJson.  Board: ESP32.
 */
/** Version history: 1.0.0 initial; 1.1.0 adds OTA (from CircuventDevice). */
#define CV_FW_VERSION "1.1.0"
#include <CircuventDevice.h>
#include <Preferences.h>

// ---- pins ----
#define OH_TRIG     25
#define OH_ECHO     26
#define SUMP_TRIG   32
#define SUMP_ECHO   33
#define PUMP_RELAY  27       // -> contactor coil
#define CURRENT_ADC 34       // ACS712 / current transformer (input-only pin)
#define OH_FLOAT_HI 35       // overflow float (active-low, input-only)
#define BTN_PIN      0        // manual override / BOOT
#define BUZZER_PIN   4
#define LED_PIN      2

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

void setPump(bool on) {
  if (on && (dryRun || overflow || sumpPct <= sumpMin)) on = false;
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
    if (p["ohCapacityL"].is<float>()) { OH_CAP_L = p["ohCapacityL"].as<float>(); cfg = true; }
    if (p["sumpCapacityL"].is<float>()) { SUMP_CAP_L = p["sumpCapacityL"].as<float>(); cfg = true; }
    if (p["ohEmptyCm"].is<float>()) { OH_EMPTY_CM = p["ohEmptyCm"].as<float>(); cfg = true; }
    if (p["ohFullCm"].is<float>())  { OH_FULL_CM  = p["ohFullCm"].as<float>();  cfg = true; }
    if (p["sumpEmptyCm"].is<float>()) { SP_EMPTY_CM = p["sumpEmptyCm"].as<float>(); cfg = true; }
    if (p["sumpFullCm"].is<float>())  { SP_FULL_CM  = p["sumpFullCm"].as<float>();  cfg = true; }
    if (cfg) saveCfg();
  } else if (action == "resetDryRun") {
    dryRun = false;
  } else if (action == "pump") {
    autoMode = false; saveRun(); setPump(true);
  } else if (action == "stop") {
    autoMode = false; saveRun(); setPump(false);
  }
}

void setup() {
  Serial.begin(115200);
  cvRelayInit(PUMP_RELAY); pinMode(LED_PIN, OUTPUT); pinMode(BUZZER_PIN, OUTPUT);
  pinMode(OH_TRIG, OUTPUT); pinMode(OH_ECHO, INPUT);
  pinMode(SUMP_TRIG, OUTPUT); pinMode(SUMP_ECHO, INPUT);
  pinMode(OH_FLOAT_HI, INPUT);      // input-only pin; external pull-up
  pinMode(BTN_PIN, INPUT_PULLUP);
  analogReadResolution(12);
  loadCfg();
  cv.onCommand(onCommand);
  cv.setInterval(6000);
  cv.setResetButton(0);
  cv.begin();
}

uint32_t lastSense = 0;
void loop() {
  if (millis() - lastSense > 1500) {
    lastSense = millis();
    ohCm = medianCm(OH_TRIG, OH_ECHO);
    spCm = medianCm(SUMP_TRIG, SUMP_ECHO);
    ohPct   = pctFromCm(ohCm, OH_EMPTY_CM, OH_FULL_CM, ohFault);
    sumpPct = pctFromCm(spCm, SP_EMPTY_CM, SP_FULL_CM, sumpFault);
    if (ohFault) ohPct = ohPct < 0 ? 50 : ohPct;
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
  // Dry-run: motor drawing current but OH not rising within the window.
  if (pump && millis() - pumpStart > dryRunWindowMs) {
    bool rising = (ohPct - ohAtStart) >= 2;
    bool drawing = amps >= currentOnAmps;
    if (drawing && !rising) { setPump(false); dryRun = true; beep(200); }
    else if (!drawing)      { setPump(false); dryRun = true; beep(200); } // no current => wiring/motor fault
  }

  // ---- auto-fill logic ----
  if (autoMode && !dryRun && !overflow) {
    if (!pump && ohPct <= startPct && sumpPct > sumpMin) setPump(true);
    if (pump && (ohPct >= stopPct || sumpPct <= sumpMin)) setPump(false);
  }

  if ((dryRun || overflow) && millis() - lastBeep > 5000) { lastBeep = millis(); beep(120); }

  cv.set("ohPct", ohPct);
  cv.set("sumpPct", sumpPct);
  cv.set("ohLitres", (int)(OH_CAP_L * ohPct / 100.0f));
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
