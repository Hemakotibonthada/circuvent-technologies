/*
 * Circuvent Touch Switchboard — 3-gang Capacitive Board w/ Power Metering (ESP32)
 * ===============================================================================
 * Zone 3 of the Circuvent smart-home. A wall switchboard with:
 *   - 3 capacitive touch pads (ESP32 built-in touchRead) -> 3 relays.
 *   - Dynamic LED backlight (dims/brightens; off at night if desired).
 *   - Per-board energy metering via an HLW8012 (CF = active power pulses,
 *     CF1 = current/voltage pulses selected by SEL) -> V, I, P, PF, kWh.
 *   - Instant feedback: a tap flips the relay and pushes state in <1 s.
 *
 * Standard Circuvent protocol (cv/<id>/state|telemetry). Board: ESP32.
 */
/** Version history: 1.0.0 initial; 1.1.0 adds OTA (from CircuventDevice). */
#define CV_FW_VERSION "1.1.0"
#include <CircuventDevice.h>
#include <Preferences.h>

// ---- touch pads (values DROP when touched) ----
const int TOUCH_PIN[3] = { T0 /*GPIO4*/, T3 /*GPIO15*/, T4 /*GPIO13*/ };
const int RELAY_PIN[3] = { 25, 26, 33 };
#define BACKLIGHT_PIN 5     // PWM LED backlight
#define HLW_CF   34         // active-power pulses (input-only)
#define HLW_CF1  35         // current/voltage pulses (input-only)
#define HLW_SEL  18         // SEL: HIGH=current, LOW=voltage on CF1

// HLW8012 calibration (depends on the shunt + divider; sane defaults).
double PWR_MULT = 1.2154;   // W per (pulse Hz)
double CUR_MULT = 0.00354;  // A per (pulse Hz)
double VOL_MULT = 0.9192;   // V per (pulse Hz)

CircuventDevice cv("touchboard");
Preferences store;

bool relay[3] = { false, false, false };
bool savedRelay[3] = { false, false, false };
int  touchBase[3] = { 0, 0, 0 };
int  backlight = 60;                 // 0..100 %
bool selCurrent = true;

// pulse counters (updated in ISRs)
volatile uint32_t cfCount = 0, cf1Count = 0;
void IRAM_ATTR onCF()  { cfCount++; }
void IRAM_ATTR onCF1() { cf1Count++; }

double volts = 0, amps = 0, watts = 0, pf = 0, kwh = 0;
uint32_t lastMeter = 0, lastTouch = 0;

void applyBacklight() { analogWrite(BACKLIGHT_PIN, map(backlight, 0, 100, 0, 255)); }

void setRelay(int i, bool on, bool persist = true) {
  relay[i] = on;
  cvRelayWrite(RELAY_PIN[i], on);
  char k[3] = { 'g', (char)('1' + i), 0 };
  cv.set(k, on);
  if (persist && relay[i] != savedRelay[i]) {
    store.putBool(k, on); savedRelay[i] = on;
  }
  cv.publishStateNow();          // instant feedback
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action != "set") return;
  if (p["g1"].is<bool>()) setRelay(0, p["g1"].as<bool>());
  if (p["g2"].is<bool>()) setRelay(1, p["g2"].as<bool>());
  if (p["g3"].is<bool>()) setRelay(2, p["g3"].as<bool>());
  if (p["all"].is<bool>()) { bool v = p["all"].as<bool>(); for (int i = 0; i < 3; i++) setRelay(i, v); }
  if (p["backlight"].is<int>()) { backlight = constrain(p["backlight"].as<int>(), 0, 100); store.putInt("bl", backlight); applyBacklight(); cv.set("backlight", backlight); }
}

void calibrateTouch() {
  for (int i = 0; i < 3; i++) {
    long acc = 0; for (int s = 0; s < 16; s++) { acc += touchRead(TOUCH_PIN[i]); delay(5); }
    touchBase[i] = acc / 16;
  }
}

void setup() {
  Serial.begin(115200);
  for (int i = 0; i < 3; i++) { cvRelayInit(RELAY_PIN[i]); }
  pinMode(BACKLIGHT_PIN, OUTPUT);
  pinMode(HLW_CF, INPUT); pinMode(HLW_CF1, INPUT); pinMode(HLW_SEL, OUTPUT);
  digitalWrite(HLW_SEL, HIGH);
  attachInterrupt(digitalPinToInterrupt(HLW_CF), onCF, FALLING);
  attachInterrupt(digitalPinToInterrupt(HLW_CF1), onCF1, FALLING);

  store.begin("tboard", false);
  backlight = store.getInt("bl", backlight);
  for (int i = 0; i < 3; i++) {
    char k[3] = { 'g', (char)('1' + i), 0 };
    relay[i] = store.getBool(k, false); savedRelay[i] = relay[i];
  }
  kwh = store.getDouble("kwh", 0);
  applyBacklight();
  calibrateTouch();
  for (int i = 0; i < 3; i++) { cvRelayWrite(RELAY_PIN[i], relay[i]); }

  cv.onCommand(onCommand);
  cv.setInterval(6000);
  cv.setResetButton(0);
  cv.begin();
  cv.set("backlight", backlight);
}

void readMeter() {
  uint32_t now = millis();
  uint32_t win = now - lastMeter;
  if (win < 1000) return;
  noInterrupts();
  uint32_t cf = cfCount, cf1 = cf1Count;
  cfCount = 0; cf1Count = 0;
  interrupts();
  lastMeter = now;

  double cfHz  = (cf  * 1000.0) / win;
  double cf1Hz = (cf1 * 1000.0) / win;
  watts = cfHz * PWR_MULT;
  if (selCurrent) amps  = cf1Hz * CUR_MULT; else volts = cf1Hz * VOL_MULT;
  digitalWrite(HLW_SEL, selCurrent ? LOW : HIGH);   // alternate the CF1 measurement
  selCurrent = !selCurrent;

  if (volts < 1) volts = 230.0;                     // nominal until first V sample
  if (watts > 1 && volts * amps > 1) pf = watts / (volts * amps);
  if (pf > 1) pf = 1; if (pf < 0) pf = 0;
  kwh += watts * (win / 3600000000.0);              // W * hours -> Wh, /1000 -> kWh
  static uint32_t lastSave = 0;
  if (now - lastSave > 60000) { store.putDouble("kwh", kwh); lastSave = now; }
}

void loop() {
  // capacitive touch: value drops well below the baseline when a finger lands
  if (millis() - lastTouch > 250) {
    for (int i = 0; i < 3; i++) {
      int v = touchRead(TOUCH_PIN[i]);
      if (touchBase[i] > 0 && v < touchBase[i] * 0.6) {
        setRelay(i, !relay[i]);
        lastTouch = millis();
        break;
      }
    }
  }

  readMeter();

  cv.set("watts", (float)watts);
  cv.set("volts", (float)volts);
  cv.set("amps", (float)amps);
  cv.set("pf", (float)pf);
  cv.set("kwh", (float)kwh);
  cv.loop();
}
