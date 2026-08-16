/*
 * Circuvent AquaGuard - Water Tank Controller (ESP32)
 * ===================================================
 * Enterprise pump automation:
 *   - Level sensing: waterproof ultrasonic (JSN-SR04T) with dual float-switch
 *     backup (low = auto-start hint, high = hardware overflow cutoff).
 *   - Pump relay drives a contactor (never switch a motor directly).
 *   - Protections: dry-run, overflow, max-runtime, min restart-delay
 *     (motor cool-down), sensor-fault fallback.
 *   - Auto start/stop thresholds (configurable from the app, saved to NVS).
 *   - Manual override button, status LED, alert buzzer.
 *   - Zero-touch Wi-Fi provisioning + OTA via CircuventDevice.
 *
 * Deps: CircuventDevice, ArduinoJson.  Board: ESP32.
 */
/** Version history: 2.0.0 initial; 2.1.0 adds OTA (from CircuventDevice). */
#define CV_FW_VERSION "2.1.1"
#include <CircuventDevice.h>
#include <Preferences.h>

// ---- factory identity (a provisioning station overwrites these in NVS) ----
// Identical firmware — Wi-Fi + identity are provisioned by the Circuvent app.

// ---- pins ----
#define MOTOR_RELAY 26   // -> contactor coil
#define US_TRIG     25
#define US_ECHO     27
#define FLOAT_LOW   32   // active-low
#define FLOAT_HIGH  33   // active-low (overflow)
#define BTN_PIN      0
#define BUZZER_PIN   4
#define LED_PIN      2

// ---- tank geometry (cm) ----
float TANK_EMPTY_CM = 120.0;  // sensor-to-water distance when empty
float TANK_FULL_CM  = 15.0;   // distance when full

// ---- tunables (persisted) ----
int   startPct       = 25;    // auto-start at/below this %
int   stopPct        = 95;    // auto-stop at/above this %
uint32_t maxRuntimeMs   = 20UL * 60UL * 1000UL;  // hard cutoff
uint32_t restartDelayMs = 3UL  * 60UL * 1000UL;  // motor cool-down between runs
uint32_t dryRunWindowMs = 90UL * 1000UL;         // must see level rise within this

CircuventDevice cv("aquaguard");
Preferences store;

bool pump = false, autoMode = true, dryRun = false, overflow = false, sensorFault = false;
bool pumpIntent = false, savedPumpIntent = false, savedAutoMode = true;
int  level = 0, levelAtStart = 0;
float distanceCm = 0;
uint32_t pumpStart = 0, lastStop = 0, lastBtn = 0, lastBeep = 0;

void beep(int ms) { digitalWrite(BUZZER_PIN, HIGH); delay(ms); digitalWrite(BUZZER_PIN, LOW); }

void loadCfg() {
  store.begin("aqua", false);
  autoMode       = store.getBool("auto", autoMode);
  pumpIntent     = store.getBool("pump", pumpIntent);
  savedAutoMode  = autoMode;
  savedPumpIntent = pumpIntent;
  startPct       = store.getInt("start", startPct);
  stopPct        = store.getInt("stop", stopPct);
  maxRuntimeMs   = store.getUInt("maxrt", maxRuntimeMs);
  restartDelayMs = store.getUInt("rdelay", restartDelayMs);
  TANK_EMPTY_CM  = store.getFloat("empty", TANK_EMPTY_CM);
  TANK_FULL_CM   = store.getFloat("full", TANK_FULL_CM);
}
void saveCfg() {
  store.putInt("start", startPct);
  store.putInt("stop", stopPct);
  store.putUInt("maxrt", maxRuntimeMs);
  store.putUInt("rdelay", restartDelayMs);
  store.putFloat("empty", TANK_EMPTY_CM);
  store.putFloat("full", TANK_FULL_CM);
}

void saveRunState() {
  if (autoMode != savedAutoMode) {
    store.putBool("auto", autoMode);
    savedAutoMode = autoMode;
  }
  if (pumpIntent != savedPumpIntent) {
    store.putBool("pump", pumpIntent);
    savedPumpIntent = pumpIntent;
  }
}

void setPump(bool on) {
  pumpIntent = on;
  saveRunState();
  if (on && (overflow || dryRun)) {
    pump = false;
    digitalWrite(MOTOR_RELAY, cvRelayLevel(false));
    digitalWrite(LED_PIN, LOW);
    cv.set("pump", pump);
    return;
  }
  if (on && !pump) {
    // enforce cool-down between starts to protect the motor
    if (millis() - lastStop < restartDelayMs && lastStop != 0) return;
    pumpStart = millis();
    levelAtStart = level;
    dryRun = false;
  }
  if (!on && pump) lastStop = millis();
  pump = on;
  cvRelayWrite(MOTOR_RELAY, on);
  digitalWrite(LED_PIN, on ? HIGH : LOW);
  cv.set("pump", pump);
}

float readUltrasonicCm() {
  digitalWrite(US_TRIG, LOW); delayMicroseconds(3);
  digitalWrite(US_TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(US_TRIG, LOW);
  long us = pulseIn(US_ECHO, HIGH, 30000UL);  // ~5 m timeout
  if (us == 0) return -1;                     // no echo -> fault
  return (us * 0.0343f) / 2.0f;
}

int computeLevel() {
  float d = readUltrasonicCm();
  bool lowFloat  = digitalRead(FLOAT_LOW)  == LOW;
  bool highFloat = digitalRead(FLOAT_HIGH) == LOW;
  overflow = highFloat;

  if (d < 0 || d > (TANK_EMPTY_CM + 30) || d < (TANK_FULL_CM - 10)) {
    sensorFault = true;                       // fall back to floats
    distanceCm = -1;
    return highFloat ? 100 : (lowFloat ? 10 : 55);
  }
  sensorFault = false;
  distanceCm = d;
  float pct = (TANK_EMPTY_CM - d) / (TANK_EMPTY_CM - TANK_FULL_CM) * 100.0f;
  if (pct < 0) pct = 0; if (pct > 100) pct = 100;
  if (highFloat) pct = 100;                   // hardware full always wins
  return (int)(pct + 0.5f);
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action != "set") return;
  bool cfg = false;
  if (p["auto"].is<bool>()) { autoMode = p["auto"].as<bool>(); saveRunState(); }
  if (p["pump"].is<bool>()) { autoMode = false; setPump(p["pump"].as<bool>()); }
  if (p["startPct"].is<int>())  { startPct = constrain(p["startPct"].as<int>(), 5, 90); cfg = true; }
  if (p["stopPct"].is<int>())   { stopPct  = constrain(p["stopPct"].as<int>(), startPct + 5, 100); cfg = true; }
  if (p["maxRuntimeMin"].is<int>()) { maxRuntimeMs = (uint32_t)p["maxRuntimeMin"].as<int>() * 60000UL; cfg = true; }
  if (cfg) saveCfg();
}

void setup() {
  Serial.begin(115200);
  cvRelayInit(MOTOR_RELAY); pinMode(LED_PIN, OUTPUT); pinMode(BUZZER_PIN, OUTPUT);
  pinMode(US_TRIG, OUTPUT); pinMode(US_ECHO, INPUT);
  pinMode(FLOAT_LOW, INPUT_PULLUP); pinMode(FLOAT_HIGH, INPUT_PULLUP);
  pinMode(BTN_PIN, INPUT_PULLUP);
  loadCfg();
  level = computeLevel();
  setPump(pumpIntent);
  cv.onCommand(onCommand);
  cv.setInterval(7000);
  // cv.setRootCA(CIRCUVENT_ROOT_CA);   // enable TLS pinning in production
  cv.setResetButton(0);  // BOOT/GPIO0: hold 3s to change Wi-Fi, 8s to factory reset
  cv.begin();                            // uses stored Wi-Fi or opens setup portal
}

void loop() {
  level = computeLevel();

  // manual override (long-safe debounce)
  if (digitalRead(BTN_PIN) == LOW && millis() - lastBtn > 500) {
    lastBtn = millis(); autoMode = false; setPump(!pump); beep(60);
  }

  // ---- safety interlocks (highest priority) ----
  if (pump && overflow) { setPump(false); }                                   // overflow cutoff
  if (pump && (millis() - pumpStart > maxRuntimeMs)) { setPump(false); }       // max runtime
  if (pump && !sensorFault && (millis() - pumpStart > dryRunWindowMs)
      && (level - levelAtStart) < 3) {                                         // no inflow -> dry run
    setPump(false); dryRun = true;
  }

  // ---- automation ----
  if (autoMode && !overflow && !dryRun) {
    if (!pump && level <= startPct) setPump(true);
    if (pump && level >= stopPct)   setPump(false);
  }

  // ---- alerts ----
  if ((dryRun || overflow) && millis() - lastBeep > 4000) { lastBeep = millis(); beep(120); }

  cv.set("level", level);
  cv.set("auto", autoMode);
  cv.set("dryRun", dryRun);
  cv.set("overflow", overflow);
  cv.set("sensorFault", sensorFault);
  cv.set("distanceCm", distanceCm);
  cv.set("startPct", startPct);
  cv.set("stopPct", stopPct);
  cv.loop();
}
