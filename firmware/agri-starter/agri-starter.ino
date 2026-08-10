/*
 * Circuvent Agri GSM Starter — ESP32 firmware
 * Start/stop a farm pump by missed call / SMS (SIM800L) AND from the Circuvent
 * cloud. Mains-availability sensing + dry-run guard.
 * Deps: CircuventDevice, ArduinoJson. Hardware: SIM800L on UART2.
 */
#include <CircuventDevice.h>
#include <Preferences.h>

// Identical firmware — Wi-Fi + identity are provisioned by the Circuvent app.

#define PUMP_RELAY 26
#define MAINS_SENSE 34  // opto-isolated mains-present input (HIGH when power available)
#define SIM_RX 16
#define SIM_TX 17

HardwareSerial sim(2);
CircuventDevice cv("agri-starter");
Preferences store;
bool pump = false, pumpIntent = false, savedPumpIntent = false;

void applyPump() {
  bool power = digitalRead(MAINS_SENSE) == HIGH;
  pump = pumpIntent && power;
  cvRelayWrite(PUMP_RELAY, pump);
  cv.set("pump", pump);
}

void setPump(bool on) {
  pumpIntent = on;
  if (pumpIntent != savedPumpIntent) {
    store.putBool("pump", pumpIntent);
    savedPumpIntent = pumpIntent;
  }
  applyPump();
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action == "set" && p["pump"].is<bool>()) setPump(p["pump"].as<bool>());
}

void setup() {
  Serial.begin(115200);
  cvRelayInit(PUMP_RELAY);
  pinMode(MAINS_SENSE, INPUT);
  store.begin("agri", false);
  pumpIntent = store.getBool("pump", false);
  savedPumpIntent = pumpIntent;
  applyPump();

  sim.begin(9600, SERIAL_8N1, SIM_RX, SIM_TX);
  delay(1500);
  sim.println("AT+CLIP=1");  // enable caller-ID so we can act on a missed call

  cv.onCommand(onCommand);
  cv.setInterval(10000);
  cv.setResetButton(0);  // BOOT/GPIO0: hold 3s to change Wi-Fi, 8s to factory reset
  cv.begin();
}

void loop() {
  // Missed-call / SMS control from any phone.
  while (sim.available()) {
    String line = sim.readStringUntil('\n');
    line.trim();
    if (line.indexOf("RING") >= 0) {
      setPump(!pumpIntent);
      delay(800);
      sim.println("ATH");  // hang up
    } else if (line.indexOf("ON") >= 0) {
      setPump(true);
    } else if (line.indexOf("OFF") >= 0) {
      setPump(false);
    }
  }

  bool power = digitalRead(MAINS_SENSE) == HIGH;
  applyPump();  // never leave the contactor engaged without mains

  cv.set("power_available", power);
  cv.loop();
}
