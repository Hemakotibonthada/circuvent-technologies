/*
 * Circuvent Motion Sensor — ESP32 firmware
 * PIR motion → automate a light output, push instant cloud alerts, arm/disarm.
 * Deps: CircuventDevice, ArduinoJson. Hardware: HC-SR501 PIR.
 */
/* Version history: 1.1.0 is the first build that survives a power cut with the
   router still down - see tests/firmware-power-restore.test.ts. Declared
   explicitly so the fleet can tell fixed devices from unfixed ones; without
   it every sketch reported the library default and they were
   indistinguishable. */
#define CV_FW_VERSION "1.1.0"
#include <CircuventDevice.h>

// Identical firmware — Wi-Fi + identity are provisioned by the Circuvent app.

#define PIR_PIN 27
#define LED_PIN 2

CircuventDevice cv("motion-sensor");
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
  cv.setResetButton(0);  // BOOT/GPIO0: hold 3s to change Wi-Fi, 8s to factory reset
  cv.begin();
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
