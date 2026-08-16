/*
 * Circuvent Smart Plug — ESP32 firmware
 * Wi-Fi relay + energy telemetry + Alexa/Google (fauxmoESP) + Circuvent cloud.
 * Deps: CircuventDevice, ArduinoJson, fauxmoESP (by Xose Perez)
 */
/* Version history: 1.1.0 is the first build that survives a power cut with the
   router still down - see tests/firmware-power-restore.test.ts. Declared
   explicitly so the fleet can tell fixed devices from unfixed ones; without
   it every sketch reported the library default and they were
   indistinguishable. */
#define CV_FW_VERSION "1.1.0"
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
  cvRelayWrite(RELAY_PIN, on);
  cvRelayWrite(LED_PIN, on);
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
  cvRelayInit(RELAY_PIN);
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
