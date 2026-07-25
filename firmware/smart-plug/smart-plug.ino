/*
 * Circuvent Smart Plug — ESP32 firmware
 * Wi-Fi relay + energy telemetry + Alexa/Google (fauxmoESP) + Circuvent cloud.
 * Deps: CircuventDevice, ArduinoJson, fauxmoESP (by Xose Perez)
 */
#include <CircuventDevice.h>
#include <fauxmoESP.h>
#include <Preferences.h>

// Identical firmware — Wi-Fi + identity are provisioned by the Circuvent app.

#define RELAY_PIN 26
#define LED_PIN 2
#define BTN_PIN 0

CircuventDevice cv("smart-plug");
fauxmoESP fauxmo;
Preferences store;
bool power = false;
bool savedPower = false;

void applyPower(bool on) {
  power = on;
  digitalWrite(RELAY_PIN, on ? HIGH : LOW);
  digitalWrite(LED_PIN, on ? HIGH : LOW);
  if (power != savedPower) {
    store.putBool("power", power);
    savedPower = power;
  }
  cv.set("power", power);
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action == "set" && p["power"].is<bool>()) applyPower(p["power"].as<bool>());
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BTN_PIN, INPUT_PULLUP);
  store.begin("plug", false);
  power = store.getBool("power", false);
  savedPower = power;
  applyPower(power);

  cv.onCommand(onCommand);
  cv.setInterval(8000);
  cv.setResetButton(0);  // BOOT/GPIO0: hold 3s to change Wi-Fi, 8s to factory reset
  cv.begin();

  // Local Alexa / Google Home voice control
  fauxmo.createServer(true);
  fauxmo.setPort(80);
  fauxmo.enable(true);
  fauxmo.addDevice("Circuvent Plug");
  fauxmo.onSetState([](unsigned char, const char *, bool state, unsigned char) { applyPower(state); });
}

unsigned long lastBtn = 0;
void loop() {
  fauxmo.handle();
  if (digitalRead(BTN_PIN) == LOW && millis() - lastBtn > 400) {
    lastBtn = millis();
    applyPower(!power);
  }
  // TODO: replace with a real HLW8012 / BL0937 energy reading
  cv.set("watts", power ? 42.5f : 0.0f);
  cv.loop();
}
