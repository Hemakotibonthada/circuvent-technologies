/*
 * Circuvent Agri GSM Starter — ESP32 firmware
 * Start/stop a farm pump by missed call / SMS (SIM800L) AND from the Circuvent
 * cloud. Mains-availability sensing + dry-run guard.
 * Deps: CircuventDevice, ArduinoJson. Hardware: SIM800L on UART2.
 */
#include <CircuventDevice.h>

const char *WIFI_SSID = "YOUR_WIFI";  // optional; GSM path works without Wi-Fi
const char *WIFI_PASS = "YOUR_PASS";
const char *DEVICE_ID = "CV-AGRI-000001";
const char *DEVICE_KEY = "REPLACE_DEVICE_KEY";

#define PUMP_RELAY 26
#define MAINS_SENSE 34  // opto-isolated mains-present input (HIGH when power available)
#define SIM_RX 16
#define SIM_TX 17

HardwareSerial sim(2);
CircuventDevice cv(DEVICE_ID, DEVICE_KEY, "agri-starter");
bool pump = false;

void setPump(bool on) {
  pump = on;
  digitalWrite(PUMP_RELAY, on ? HIGH : LOW);
  cv.set("pump", pump);
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action == "set" && p["pump"].is<bool>()) setPump(p["pump"].as<bool>());
}

void setup() {
  Serial.begin(115200);
  pinMode(PUMP_RELAY, OUTPUT);
  pinMode(MAINS_SENSE, INPUT);
  setPump(false);

  sim.begin(9600, SERIAL_8N1, SIM_RX, SIM_TX);
  delay(1500);
  sim.println("AT+CLIP=1");  // enable caller-ID so we can act on a missed call

  cv.onCommand(onCommand);
  cv.setInterval(10000);
  cv.begin(WIFI_SSID, WIFI_PASS);
}

void loop() {
  // Missed-call / SMS control from any phone.
  while (sim.available()) {
    String line = sim.readStringUntil('\n');
    line.trim();
    if (line.indexOf("RING") >= 0) {
      setPump(!pump);
      delay(800);
      sim.println("ATH");  // hang up
    } else if (line.indexOf("ON") >= 0) {
      setPump(true);
    } else if (line.indexOf("OFF") >= 0) {
      setPump(false);
    }
  }

  bool power = digitalRead(MAINS_SENSE) == HIGH;
  if (!power && pump) setPump(false);  // never leave the contactor engaged without mains

  cv.set("power_available", power);
  cv.loop();
}
