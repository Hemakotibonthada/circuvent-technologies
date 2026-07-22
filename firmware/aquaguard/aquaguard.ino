/*
 * Circuvent AquaGuard — ESP32 firmware
 * Automatic water-tank controller: auto ON when low / OFF when full,
 * dry-run protection, manual override, cloud control.
 * Deps: CircuventDevice, ArduinoJson
 */
#include <CircuventDevice.h>

const char *WIFI_SSID = "YOUR_WIFI";
const char *WIFI_PASS = "YOUR_PASS";
const char *DEVICE_ID = "CV-AQUA-000001";
const char *DEVICE_KEY = "REPLACE_DEVICE_KEY";

#define MOTOR_RELAY 26
#define FLOAT_LOW 32   // active-low: closed (LOW) when water is below the low mark
#define FLOAT_HIGH 33  // active-low: closed (LOW) when the tank is full
#define BTN_PIN 0

CircuventDevice cv(DEVICE_ID, DEVICE_KEY, "aquaguard");
bool pump = false, autoMode = true, dryRun = false;
unsigned long pumpStart = 0, lastBtn = 0;

void setPump(bool on) {
  pump = on;
  digitalWrite(MOTOR_RELAY, on ? HIGH : LOW);
  if (on) { pumpStart = millis(); dryRun = false; }
  cv.set("pump", pump);
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action != "set") return;
  if (p["auto"].is<bool>()) autoMode = p["auto"].as<bool>();
  if (p["pump"].is<bool>()) { autoMode = false; setPump(p["pump"].as<bool>()); }
}

void setup() {
  Serial.begin(115200);
  pinMode(MOTOR_RELAY, OUTPUT);
  pinMode(FLOAT_LOW, INPUT_PULLUP);
  pinMode(FLOAT_HIGH, INPUT_PULLUP);
  pinMode(BTN_PIN, INPUT_PULLUP);
  setPump(false);
  cv.onCommand(onCommand);
  cv.setInterval(7000);
  cv.begin(WIFI_SSID, WIFI_PASS);
}

void loop() {
  bool low = digitalRead(FLOAT_LOW) == LOW;
  bool full = digitalRead(FLOAT_HIGH) == LOW;
  int level = full ? 100 : (low ? 15 : 60);  // coarse; swap floats for an ultrasonic sensor for exact %

  if (digitalRead(BTN_PIN) == LOW && millis() - lastBtn > 400) {
    lastBtn = millis();
    autoMode = false;
    setPump(!pump);
  }

  if (autoMode) {
    if (!pump && low) setPump(true);
    if (pump && full) setPump(false);
  }
  // Dry-run protection: running > 2 min but tank still reads low ⇒ no inflow.
  if (pump && low && millis() - pumpStart > 120000) {
    setPump(false);
    dryRun = true;
  }

  cv.set("level", level);
  cv.set("auto", autoMode);
  cv.set("dryRun", dryRun);
  cv.loop();
}
