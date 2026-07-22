/*
 * Circuvent Smart Switch — ESP32 firmware (2-gang)
 * Two relays + touch buttons + Alexa/Google + Circuvent cloud.
 * Deps: CircuventDevice, ArduinoJson, fauxmoESP
 */
#include <CircuventDevice.h>
#include <fauxmoESP.h>

const char *WIFI_SSID = "YOUR_WIFI";
const char *WIFI_PASS = "YOUR_PASS";
const char *DEVICE_ID = "CV-SW-000001";
const char *DEVICE_KEY = "REPLACE_DEVICE_KEY";

#define RELAY1 26
#define RELAY2 27
#define TOUCH1 T0  // GPIO4
#define TOUCH2 T3  // GPIO15

CircuventDevice cv(DEVICE_ID, DEVICE_KEY, "smart-switch");
fauxmoESP fauxmo;
bool p1 = false, p2 = false;

void apply() {
  digitalWrite(RELAY1, p1 ? HIGH : LOW);
  digitalWrite(RELAY2, p2 ? HIGH : LOW);
  cv.set("power", p1);   // gang 1 (app primary toggle)
  cv.set("power2", p2);  // gang 2
}

void onCommand(const String &action, JsonObjectConst prm) {
  if (action != "set") return;
  if (prm["power"].is<bool>()) p1 = prm["power"].as<bool>();
  if (prm["power2"].is<bool>()) p2 = prm["power2"].as<bool>();
  apply();
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY1, OUTPUT);
  pinMode(RELAY2, OUTPUT);
  apply();

  cv.onCommand(onCommand);
  cv.setInterval(8000);
  cv.begin(WIFI_SSID, WIFI_PASS);

  fauxmo.createServer(true);
  fauxmo.setPort(80);
  fauxmo.enable(true);
  fauxmo.addDevice("Circuvent Switch One");
  fauxmo.addDevice("Circuvent Switch Two");
  fauxmo.onSetState([](unsigned char, const char *name, bool state, unsigned char) {
    if (String(name).endsWith("One")) p1 = state;
    else p2 = state;
    apply();
  });
}

void loop() {
  fauxmo.handle();
  if (touchRead(TOUCH1) < 30) { p1 = !p1; apply(); delay(350); }
  if (touchRead(TOUCH2) < 30) { p2 = !p2; apply(); delay(350); }
  cv.loop();
}
