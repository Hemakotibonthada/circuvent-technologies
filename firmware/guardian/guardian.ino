/*
 * Circuvent Guardian — ESP32 firmware
 * Personal safety SOS beacon: one-press panic button sends live GPS location
 * by SMS to a trusted contact and places an emergency call (SIM800L), plus a
 * cloud alert. Battery telemetry + remote arm/disarm.
 * Deps: CircuventDevice, ArduinoJson, TinyGPSPlus. Hardware: SIM800L (UART2), GPS (UART1).
 */
#include <CircuventDevice.h>
#include <TinyGPSPlus.h>

// Identical firmware — Wi-Fi + identity are provisioned by the Circuvent app.
const char *TRUSTED_NUMBER = "+9199XXXXXXXX";  // trusted contact

#define SOS_BTN 0
#define BUZZER 25
#define BATT_ADC 34
#define SIM_RX 16
#define SIM_TX 17
#define GPS_RX 4
#define GPS_TX 2

HardwareSerial sim(2);
HardwareSerial gpsSerial(1);
TinyGPSPlus gps;
CircuventDevice cv("guardian");

bool armed = true, sos = false;
double lat = 0, lng = 0;
unsigned long lastBtn = 0;

int batteryPct() {
  int raw = analogRead(BATT_ADC);            // 0..4095 on a divider
  float v = (raw / 4095.0f) * 2.0f * 3.3f;   // assume 1:1 divider
  int pct = (int)((v - 3.3f) / (4.2f - 3.3f) * 100);
  return constrain(pct, 0, 100);
}

void sendSOS() {
  sos = true;
  cv.set("sos", true);
  digitalWrite(BUZZER, HIGH);
  char msg[160];
  snprintf(msg, sizeof(msg), "SOS! I need help. Live location: https://maps.google.com/?q=%.6f,%.6f", lat, lng);
  sim.println("AT+CMGF=1");
  delay(300);
  sim.print("AT+CMGS=\"");
  sim.print(TRUSTED_NUMBER);
  sim.println("\"");
  delay(300);
  sim.print(msg);
  sim.write(26);   // Ctrl-Z sends the SMS
  delay(4000);
  sim.print("ATD");  // place emergency call
  sim.print(TRUSTED_NUMBER);
  sim.println(";");
  cv.publishState();  // push the alert to the cloud immediately
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action != "set") return;
  if (p["armed"].is<bool>()) armed = p["armed"].as<bool>();
  if (p["sos"].is<bool>() && !p["sos"].as<bool>()) { sos = false; digitalWrite(BUZZER, LOW); cv.set("sos", false); }
}

void setup() {
  Serial.begin(115200);
  pinMode(SOS_BTN, INPUT_PULLUP);
  pinMode(BUZZER, OUTPUT);
  sim.begin(9600, SERIAL_8N1, SIM_RX, SIM_TX);
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  cv.onCommand(onCommand);
  cv.setInterval(15000);
  cv.setResetButton(0);  // BOOT/GPIO0: hold 3s to change Wi-Fi, 8s to factory reset
  cv.begin();
}

void loop() {
  while (gpsSerial.available()) {
    gps.encode(gpsSerial.read());
    if (gps.location.isUpdated()) { lat = gps.location.lat(); lng = gps.location.lng(); }
  }
  if (armed && digitalRead(SOS_BTN) == LOW && millis() - lastBtn > 1000) {
    lastBtn = millis();
    sendSOS();
  }
  cv.set("armed", armed);
  cv.set("battery", batteryPct());
  cv.set("lat", (float)lat);
  cv.set("lng", (float)lng);
  cv.loop();
}
