/*
 * Circuvent Home Hub — ESP32 firmware
 * Local-first automation hub: runs scenes, exposes a relay, reports health to
 * the Circuvent cloud, and applies scene/power commands from the app.
 * Deps: CircuventDevice, ArduinoJson.
 */
#include <CircuventDevice.h>

const char *WIFI_SSID = "YOUR_WIFI";
const char *WIFI_PASS = "YOUR_PASS";
const char *DEVICE_ID = "CV-HUB-000001";
const char *DEVICE_KEY = "REPLACE_DEVICE_KEY";

#define RELAY_PIN 26
#define LED_PIN 2

CircuventDevice cv(DEVICE_ID, DEVICE_KEY, "home-hub");
bool power = false;
String scene = "home";

void applyScene(const String &s) {
  scene = s;
  // Example local automation: "away" cuts the hub's controlled load.
  if (s == "away") { power = false; digitalWrite(RELAY_PIN, LOW); }
  cv.set("scene", scene.c_str());
  cv.set("power", power);
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action != "set") return;
  if (p["power"].is<bool>()) {
    power = p["power"].as<bool>();
    digitalWrite(RELAY_PIN, power ? HIGH : LOW);
    cv.set("power", power);
  }
  if (p["scene"].is<const char *>()) applyScene(String(p["scene"].as<const char *>()));
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);  // hub online indicator
  cv.onCommand(onCommand);
  cv.setInterval(10000);
  cv.begin(WIFI_SSID, WIFI_PASS);
  applyScene("home");
}

void loop() {
  cv.set("uptime", (int)(millis() / 1000));
  cv.set("scene", scene.c_str());
  cv.set("power", power);
  cv.loop();
}
