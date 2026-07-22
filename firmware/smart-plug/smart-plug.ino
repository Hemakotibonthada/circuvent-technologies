/*
 * Circuvent Smart Plug — ESP32 firmware
 * Wi-Fi relay + energy telemetry + Alexa/Google (fauxmoESP) + Circuvent cloud.
 * Deps: CircuventDevice, ArduinoJson, fauxmoESP (by Xose Perez)
 */
#include <CircuventDevice.h>
#include <fauxmoESP.h>

const char *WIFI_SSID = "YOUR_WIFI";
const char *WIFI_PASS = "YOUR_PASS";
const char *DEVICE_ID = "CV-PLUG-000001";      // printed on the device sticker
const char *DEVICE_KEY = "REPLACE_DEVICE_KEY"; // printed on the device sticker

#define RELAY_PIN 26
#define LED_PIN 2
#define BTN_PIN 0

CircuventDevice cv(DEVICE_ID, DEVICE_KEY, "smart-plug");
fauxmoESP fauxmo;
bool power = false;

void applyPower(bool on) {
  power = on;
  digitalWrite(RELAY_PIN, on ? HIGH : LOW);
  digitalWrite(LED_PIN, on ? HIGH : LOW);
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
  applyPower(false);

  cv.onCommand(onCommand);
  cv.setInterval(8000);
  cv.begin(WIFI_SSID, WIFI_PASS);

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
