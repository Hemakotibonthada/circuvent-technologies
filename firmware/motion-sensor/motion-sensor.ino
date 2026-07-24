/*
 * Circuvent Motion Sensor — ESP32 firmware
 * PIR motion → automate a light output, push instant cloud alerts, arm/disarm.
 * Deps: CircuventDevice, ArduinoJson. Hardware: HC-SR501 PIR.
 */
#include <CircuventDevice.h>

const char *WIFI_SSID = "YOUR_WIFI";
const char *WIFI_PASS = "YOUR_PASS";
const char *DEVICE_ID = "CV-PIR-000001";
const char *DEVICE_KEY = "REPLACE_DEVICE_KEY";

#define PIR_PIN 27
#define LED_PIN 2

CircuventDevice cv(DEVICE_ID, DEVICE_KEY, "motion-sensor");
bool armed = true, lastMotion = false;

void onCommand(const String &action, JsonObjectConst p) {
  if (action == "set" && p["armed"].is<bool>()) armed = p["armed"].as<bool>();
}

void setup() {
  Serial.begin(115200);
  pinMode(PIR_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  cv.onCommand(onCommand);
  cv.setInterval(6000);
  cv.begin(WIFI_SSID, WIFI_PASS);
}

void loop() {
  bool motion = digitalRead(PIR_PIN) == HIGH;
  digitalWrite(LED_PIN, (motion && armed) ? HIGH : LOW);
  cv.set("motion", motion);
  cv.set("armed", armed);

  // Push an immediate alert on the rising edge instead of waiting for the timer.
  if (motion && !lastMotion && armed) cv.publishState();
  lastMotion = motion;

  cv.loop();
}
