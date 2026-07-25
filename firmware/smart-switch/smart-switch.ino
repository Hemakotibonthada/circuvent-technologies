/*
 * Circuvent Smart Switch — ESP32 firmware (2-gang)
 * Two relays + touch buttons + Alexa/Google + Circuvent cloud.
 * Deps: CircuventDevice, ArduinoJson, fauxmoESP
 */
#include <CircuventDevice.h>
#include <fauxmoESP.h>
#include <Preferences.h>

// Identical firmware — Wi-Fi + identity are provisioned by the Circuvent app.

#define RELAY1 26
#define RELAY2 27
#define TOUCH1 T0  // GPIO4
#define TOUCH2 T3  // GPIO15

CircuventDevice cv("smart-switch");
fauxmoESP fauxmo;
Preferences store;
bool p1 = false, p2 = false;
bool savedP1 = false, savedP2 = false;

void apply() {
  digitalWrite(RELAY1, p1 ? HIGH : LOW);
  digitalWrite(RELAY2, p2 ? HIGH : LOW);
  if (p1 != savedP1) {
    store.putBool("p1", p1);
    savedP1 = p1;
  }
  if (p2 != savedP2) {
    store.putBool("p2", p2);
    savedP2 = p2;
  }
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
  store.begin("switch", false);
  p1 = store.getBool("p1", false);
  p2 = store.getBool("p2", false);
  savedP1 = p1;
  savedP2 = p2;
  apply();

  cv.onCommand(onCommand);
  cv.setInterval(8000);
  cv.setResetButton(0);  // BOOT/GPIO0: hold 3s to change Wi-Fi, 8s to factory reset
  cv.begin();

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
