/*
 * Circuvent RFID Gate — UHF Vehicle Access Controller (ESP32)
 * ===========================================================
 * Zone 1 of the Circuvent smart-home. Long-range UHF RFID reader on the
 * driveway (Wiegand-26 interface) scans vehicle windshield tags and drives a
 * motorised barrier.
 *   - Wiegand D0/D1 decoded via GPIO interrupts (26-bit).
 *   - Authorised-tag allowlist persisted in NVS (comma-separated).
 *   - On an allowed tag -> pulse the OPEN relay + publish an access event.
 *   - Guest passes: the hub validates a QR/PIN then sends `grantOpen`.
 *   - Auto-close after a delay; vehicle loop detector holds the gate open.
 *
 * Standard Circuvent protocol (cv/<id>/state|telemetry). Board: ESP32.
 */
/** Version history: 1.0.0 initial; 1.1.0 adds OTA (from CircuventDevice). */
#define CV_FW_VERSION "1.1.0"
#include <CircuventDevice.h>
#include <Preferences.h>

// ---- pins ----
#define WIEGAND_D0   16   // green
#define WIEGAND_D1   17   // white
#define OPEN_RELAY   26   // momentary -> gate controller "open"
#define CLOSE_RELAY  27   // momentary -> gate controller "close"
#define OPEN_LIMIT   34   // limit switch: gate fully open (input-only)
#define LOOP_DETECT  35   // inductive loop / IR beam: vehicle present (input-only)
#define LED_PIN       2
#define BTN_PIN       0

// ---- Wiegand receive buffer (populated in ISRs) ----
volatile unsigned long wgData = 0;
volatile int wgBits = 0;
volatile uint32_t wgLast = 0;

void IRAM_ATTR onD0() { wgData <<= 1; wgBits++; wgLast = millis(); }
void IRAM_ATTR onD1() { wgData = (wgData << 1) | 1UL; wgBits++; wgLast = millis(); }

CircuventDevice cv("rfid-gate");
Preferences store;

String allow = "";           // "12345,67890,..."
int  autoCloseSec = 20;
bool autoMode = true;
bool barrierOpen = false;
unsigned long lastTag = 0;
bool lastAllowed = false;
long scanCount = 0;
uint32_t openedAt = 0, pulseUntil = 0;
int pulsingRelay = -1;

bool isAllowed(unsigned long tag) {
  String needle = "," + String(tag) + ",";
  String hay = "," + allow + ",";
  return hay.indexOf(needle) >= 0;
}
void addTag(unsigned long tag) {
  if (isAllowed(tag)) return;
  if (allow.length()) allow += ",";
  allow += String(tag);
  store.putString("tags", allow);
}
void removeTag(unsigned long tag) {
  String hay = "," + allow + ",";
  hay.replace("," + String(tag) + ",", ",");
  hay.trim();
  while (hay.startsWith(",")) hay = hay.substring(1);
  while (hay.endsWith(",")) hay = hay.substring(0, hay.length() - 1);
  allow = hay;
  store.putString("tags", allow);
}

void pulse(int relay) {
  digitalWrite(relay, HIGH);
  pulsingRelay = relay;
  pulseUntil = millis() + 600;   // 600 ms momentary contact
}
void openGate() {
  if (barrierOpen) { openedAt = millis(); return; }
  pulse(OPEN_RELAY);
  barrierOpen = true; openedAt = millis();
  digitalWrite(LED_PIN, HIGH);
  cv.set("barrier", "open");
  cv.publishStateNow();
}
void closeGate() {
  if (!barrierOpen) return;
  if (digitalRead(LOOP_DETECT) == LOW) return;   // vehicle under the gate -> keep open
  pulse(CLOSE_RELAY);
  barrierOpen = false;
  digitalWrite(LED_PIN, LOW);
  cv.set("barrier", "closed");
  cv.publishStateNow();
}

void publishScan(unsigned long tag, bool ok) {
  JsonDocument d;
  d["type"] = "rfid";
  d["tag"] = tag;
  d["allowed"] = ok;
  d["ts"] = (long)(millis() / 1000);
  cv.publishTelemetry(d.as<JsonObjectConst>());
  lastTag = tag; lastAllowed = ok; scanCount++;
  cv.set("lastTag", (long)tag);
  cv.set("lastAllowed", ok);
  cv.set("scanCount", scanCount);
  cv.publishStateNow();
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action == "open" || action == "grantOpen") { autoMode = (action == "open") ? autoMode : autoMode; openGate(); }
  else if (action == "close") { openGate(); closeGate(); }   // ensure close even if state drifted
  else if (action == "set") {
    if (p["addTag"].is<long>())    addTag((unsigned long)p["addTag"].as<long>());
    if (p["removeTag"].is<long>()) removeTag((unsigned long)p["removeTag"].as<long>());
    if (p["autoCloseSec"].is<int>()) { autoCloseSec = p["autoCloseSec"].as<int>(); store.putInt("acs", autoCloseSec); }
    if (p["mode"].is<const char *>()) { autoMode = String(p["mode"].as<const char *>()) == "auto"; store.putBool("auto", autoMode); }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(OPEN_RELAY, OUTPUT); pinMode(CLOSE_RELAY, OUTPUT); pinMode(LED_PIN, OUTPUT);
  pinMode(OPEN_LIMIT, INPUT); pinMode(LOOP_DETECT, INPUT);
  pinMode(BTN_PIN, INPUT_PULLUP);
  pinMode(WIEGAND_D0, INPUT_PULLUP); pinMode(WIEGAND_D1, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(WIEGAND_D0), onD0, FALLING);
  attachInterrupt(digitalPinToInterrupt(WIEGAND_D1), onD1, FALLING);
  store.begin("gate", false);
  allow = store.getString("tags", "");
  autoCloseSec = store.getInt("acs", autoCloseSec);
  autoMode = store.getBool("auto", true);
  cv.onCommand(onCommand);
  cv.setInterval(8000);
  cv.setResetButton(0);
  cv.begin();
  cv.set("barrier", "closed");
}

uint32_t lastBtn = 0;
void loop() {
  // end a momentary relay pulse
  if (pulsingRelay >= 0 && millis() > pulseUntil) { digitalWrite(pulsingRelay, LOW); pulsingRelay = -1; }

  // decode a completed Wiegand frame (25 ms idle after the last bit)
  if (wgBits > 0 && millis() - wgLast > 25) {
    noInterrupts();
    unsigned long data = wgData; int bits = wgBits;
    wgData = 0; wgBits = 0;
    interrupts();
    if (bits == 26) {
      unsigned long card = (data >> 1) & 0xFFFFFF;   // strip parity bits -> 24-bit id
      bool ok = isAllowed(card);
      publishScan(card, ok);
      if (ok && autoMode) openGate();
    } else if (bits >= 24 && bits <= 37) {
      unsigned long card = data & 0xFFFFFF;
      bool ok = isAllowed(card);
      publishScan(card, ok);
      if (ok && autoMode) openGate();
    }
  }

  // manual button toggles the gate
  if (digitalRead(BTN_PIN) == LOW && millis() - lastBtn > 600) {
    lastBtn = millis();
    if (barrierOpen) closeGate(); else openGate();
  }

  // auto-close after the vehicle clears the loop + the delay elapses
  if (barrierOpen && autoMode && millis() - openedAt > (uint32_t)autoCloseSec * 1000UL) {
    if (digitalRead(LOOP_DETECT) != LOW) closeGate();
  }

  cv.set("vehiclePresent", digitalRead(LOOP_DETECT) == LOW);
  cv.set("mode", autoMode ? "auto" : "manual");
  int tagCount = 0;
  if (allow.length()) { tagCount = 1; for (unsigned int i = 0; i < allow.length(); i++) if (allow[i] == ',') tagCount++; }
  cv.set("tagCount", tagCount);
  cv.loop();
}
