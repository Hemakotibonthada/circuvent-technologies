/*
 * Circuvent Energy Monitor — ESP32 firmware
 * Clamp-on CT sensor → live power (W) + cumulative energy (kWh) to the cloud.
 * Deps: CircuventDevice, ArduinoJson. Hardware: SCT-013 CT clamp on an ADC pin
 * with a burden resistor + bias network.
 */
/* Version history: 1.1.0 is the first build that survives a power cut with the
   router still down - see tests/firmware-power-restore.test.ts. Declared
   explicitly so the fleet can tell fixed devices from unfixed ones; without
   it every sketch reported the library default and they were
   indistinguishable. */
#define CV_FW_VERSION "1.1.0"
#include <CircuventDevice.h>

// Identical firmware — Wi-Fi + identity are provisioned by the Circuvent app.

#define CT_PIN 34
const float MAINS_VOLTAGE = 230.0f;  // grid voltage (India)
const float CT_CAL = 30.0f;          // amps per volt at the ADC — calibrate per burden resistor
const float PF = 0.95f;              // assumed power factor

CircuventDevice cv("energy-monitor");
double kwh = 0;
unsigned long lastCalc = 0;

float readIrms() {
  const int N = 1480;
  double sumSq = 0;
  int offset = 2048;  // 12-bit mid-rail bias
  for (int i = 0; i < N; i++) {
    int raw = analogRead(CT_PIN);
    double v = (raw - offset);
    sumSq += v * v;
    delayMicroseconds(200);
  }
  double rms = sqrt(sumSq / N);
  double volts = (rms / 4095.0) * 3.3;
  return volts * CT_CAL;  // amps
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  cv.setInterval(10000);
  cv.setResetButton(0);  // BOOT/GPIO0: hold 3s to change Wi-Fi, 8s to factory reset
  cv.begin();
  lastCalc = millis();
}

void loop() {
  float amps = readIrms();
  float watts = amps * MAINS_VOLTAGE * PF;
  unsigned long now = millis();
  kwh += (double)watts * (now - lastCalc) / 3600000000.0;  // W·ms → kWh
  lastCalc = now;

  cv.set("watts", watts);
  cv.set("amps", amps);
  cv.set("kwh", (float)kwh);
  cv.loop();
}
